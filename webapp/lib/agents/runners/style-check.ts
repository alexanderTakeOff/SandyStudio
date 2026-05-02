// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/runners/style-check.ts
// EXEC-STYLE-CHECK — pre-flight Style Guardian.
//
// Given a prompt + asset_type + series id, validates that the prompt aligns
// with the LOCKED Series Bible Style guide. Returns a structured verdict the
// caller acts on per `app_config.style_guardian_mode`:
//
//   warn          → display verdict in UI; never block
//   strict        → FAIL blocks the action; Director may override
//   auto_rewrite  → use suggested_prompt instead of original; mark history
//
// Designed to be called BEFORE every paid generation (regenerate-image, EREF
// per-shot, Thumbnail). Cost ~$0.005/check (Sonnet, ~600 input + 250 output
// tokens).
//
// Falls back to PASS verdict when:
//   - ANTHROPIC_API_KEY is missing (replay-pilot, tests, environments without key)
//   - LOCKED Style Bible is empty (no canon to enforce yet)
//   - Sonnet returns malformed JSON (don't block production on parser hiccup)
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../supabase/types.gen';
import { generateAnthropicText, AnthropicTextError } from '../providers/anthropic-text';

export const STYLE_CHECK_CONTRACT = 'style_check@v1';
export const STYLE_CHECK_MODEL = 'claude-sonnet-4-6';

export type StyleCheckVerdict = 'PASS' | 'WARN' | 'FAIL';

export interface StyleCheckIssue {
  field: string; // 'palette' | 'lighting' | 'composition' | 'shape' | 'tone' | …
  severity: 'low' | 'med' | 'high';
  note: string;
}

export interface StyleCheckResult {
  verdict: StyleCheckVerdict;
  /** 0-100 — quick numeric severity rating; useful for UI bar. */
  score: number;
  issues: StyleCheckIssue[];
  /** Optional rewrite of the prompt that complies with the style. */
  suggested_prompt: string | null;
  /** Used model id for cost calculation. */
  model: string;
  cost_usd: number;
  /** True when checker bypassed (no Bible style or no API key). */
  skipped: boolean;
  skipped_reason?: string;
}

export class StyleCheckError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'StyleCheckError';
  }
}

export interface RunStyleCheckArgs {
  supabase: SupabaseClient<Database>;
  /** Free-text prompt about to be sent to gpt-image-1 / Veo / etc. */
  prompt: string;
  /** Free-text asset kind: e.g. 'character_reference', 'episode_reference', 'thumbnail'. */
  assetType: string;
  /** Series UUID — used to load the LOCKED Style Bible. */
  seriesId: string;
}

interface StyleAnchor {
  text: string;
  source_asset_id: string;
}

async function loadLockedStyle(
  supabase: SupabaseClient<Database>,
  seriesId: string,
): Promise<StyleAnchor | null> {
  const { data } = await supabase
    .from('assets')
    .select('id,description,content,status,updated_at')
    .eq('series_id', seriesId)
    .like('file_type', 'SBL-style%')
    .order('updated_at', { ascending: false });
  if (!data || data.length === 0) return null;
  const rows = data as Array<{
    id: string;
    description: string | null;
    content: string | null;
    status: string;
    updated_at: string;
  }>;
  const pick =
    rows.find((r) => r.status === 'LOCKED') ??
    rows.find((r) => r.status === 'APPROVED') ??
    rows[0];
  if (!pick) return null;
  const text = (pick.content || pick.description || '').trim();
  if (!text) return null;
  return { text, source_asset_id: pick.id };
}

function buildSystemPrompt(): string {
  return [
    'You are EXEC-STYLE-CHECK, the Style Guardian for an animated comedy studio.',
    'Your single job: given a prompt that is about to be sent to an image / video / audio generator,',
    'verify that the prompt aligns with the LOCKED Series Bible Style guide. You are NOT rewriting',
    'the creative direction — you only flag drift from canon.',
    '',
    'Output strictly: a markdown summary, then ONE fenced ```json block matching this schema:',
    '{',
    '  "verdict": "PASS" | "WARN" | "FAIL",',
    '  "score": <0-100, higher = better alignment>,',
    '  "issues": [{ "field": "palette|lighting|composition|shape|tone|texture|other",',
    '               "severity": "low|med|high", "note": "<actionable>" }],',
    '  "suggested_prompt": "<rewritten prompt that fixes issues, or null if no fixes needed>"',
    '}',
    '',
    'Verdict rules:',
    '- PASS  — fully aligned, score >= 85',
    '- WARN  — minor drift (low/med severity), score 60-84',
    '- FAIL  — major drift, contradicts canon (any high severity), score < 60',
  ].join('\n');
}

function buildUserMessage(args: { prompt: string; assetType: string; styleText: string }): string {
  return [
    `# Asset type`,
    args.assetType,
    '',
    `# LOCKED Series Bible Style guide`,
    args.styleText,
    '',
    `# Prompt under review`,
    '<prompt>',
    args.prompt,
    '</prompt>',
    '',
    'Return verdict per the schema in your system prompt.',
  ].join('\n');
}

export async function runStyleCheck(args: RunStyleCheckArgs): Promise<StyleCheckResult> {
  // ── Skip when there's no key (CI, tests, replay-pilot) ─────────────────────
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return {
      verdict: 'PASS',
      score: 100,
      issues: [],
      suggested_prompt: null,
      model: STYLE_CHECK_MODEL,
      cost_usd: 0,
      skipped: true,
      skipped_reason: 'ANTHROPIC_API_KEY not set',
    };
  }

  // ── Skip when Bible has no Style canon (early dev / fresh series) ─────────
  const style = await loadLockedStyle(args.supabase, args.seriesId);
  if (!style) {
    return {
      verdict: 'PASS',
      score: 100,
      issues: [],
      suggested_prompt: null,
      model: STYLE_CHECK_MODEL,
      cost_usd: 0,
      skipped: true,
      skipped_reason: 'No SBL-style asset (LOCKED/APPROVED/DRAFT) found for series',
    };
  }

  let response;
  try {
    response = await generateAnthropicText({
      systemPrompt: buildSystemPrompt(),
      userMessage: buildUserMessage({
        prompt: args.prompt,
        assetType: args.assetType,
        styleText: style.text.slice(0, 2400),
      }),
      model: STYLE_CHECK_MODEL,
      maxOutputTokens: 800,
      expectsJson: true,
    });
  } catch (err: unknown) {
    if (err instanceof AnthropicTextError) {
      // Don't hard-block production on a transient checker error — return PASS
      // with skipped flag and let calling layer record it.
      return {
        verdict: 'PASS',
        score: 100,
        issues: [],
        suggested_prompt: null,
        model: STYLE_CHECK_MODEL,
        cost_usd: 0,
        skipped: true,
        skipped_reason: `Sonnet error: ${err.message.slice(0, 200)}`,
      };
    }
    throw err;
  }

  const body = response.body ?? {};
  const verdict = (body.verdict as string) === 'FAIL'
    ? 'FAIL'
    : (body.verdict as string) === 'WARN'
    ? 'WARN'
    : 'PASS';
  const score = typeof body.score === 'number' ? Math.max(0, Math.min(100, body.score)) : 100;
  const issues = Array.isArray(body.issues)
    ? (body.issues as Array<Record<string, unknown>>).slice(0, 10).map((i) => ({
        field: typeof i.field === 'string' ? i.field : 'other',
        severity:
          i.severity === 'high' || i.severity === 'med' ? (i.severity as 'high' | 'med') : 'low',
        note: typeof i.note === 'string' ? i.note : '',
      }))
    : [];
  const suggested = typeof body.suggested_prompt === 'string' ? body.suggested_prompt : null;

  return {
    verdict,
    score,
    issues,
    suggested_prompt: suggested,
    model: response.model,
    cost_usd: response.costUsd,
    skipped: false,
  };
}
