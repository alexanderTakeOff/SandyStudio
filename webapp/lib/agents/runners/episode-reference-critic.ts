// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/runners/episode-reference-critic.ts
// EXEC-EPREV — Designer's Critic (Sprint «Дизайнер и Аниматор», Day 4
// 2026-05-19). Validates an SPC-ref_plan asset's JSON body against V01-V09
// hard checks, returning PASS / REVISE / FAIL.
//
// Architectural contract per agents/exec/episode_reference_critic.md:
//   - Critic does NOT generate Plans, does NOT generate images
//   - Pure validation step between Designer's draft Plan and Director review
//   - Verdict drives auto-chain in factory.nextEvent:
//       PASS    → flip Plan to REVIEW (Director sees it)
//       REVISE  → flip Plan to REVISION + re-fire Designer with hard contract
//       FAIL    → flip Plan to REJECTED + Director escalation
//
// Inputs:
//   - planAssetId (SPC-ref_plan, may be REVIEW/REVISION/DRAFT)
//   - shotId (event payload)
//   - bible (for V04 sanity-checks against Bible slugs)
//
// Outputs:
//   - markdown: full Critic response (Director-readable narrative + JSON)
//   - body: parsed verdict JSON
//   - verdict: 'PASS' | 'REVISE' | 'FAIL' | 'UNKNOWN'
//   - acceptance_criteria: hard-contract bullets for Designer re-run
//   - cost_usd, model
// ──────────────────────────────────────────────────────────────────────────────

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  generateAnthropicText,
  AnthropicTextError,
  type AnthropicTextResult,
} from '../providers/anthropic-text';
import type { Database } from '../../supabase/types.gen';
import type { AgentInputs } from '../types';

export const EPREV_CONTRACT = 'episode_reference_critic@v1';
export const EPREV_MODEL = 'claude-sonnet-4-6';
/** Critic verdicts are short — 4K tokens leaves comfortable headroom for the
 *  V01-V09 bullet list + JSON block on a 22-shot episode. */
export const EPREV_MAX_TOKENS = 4000;
/** Per-Plan cost ceiling — Critic is cheap (~$0.01-0.03 typical). */
export const EPREV_COST_CEILING_USD = 0.08;

export type CriticVerdict = 'PASS' | 'REVISE' | 'FAIL' | 'UNKNOWN';

export class EpisodeReferenceCriticError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'EpisodeReferenceCriticError';
  }
}

export interface EPREVRunArgs {
  inputs: AgentInputs;
  supabase: SupabaseClient<Database>;
  planAssetId: string;
  shotId: string;
}

export interface EPREVRunResult {
  markdown: string;
  body: Record<string, unknown>;
  costUsd: number;
  model: string;
  contract: typeof EPREV_CONTRACT;
  verdict: CriticVerdict;
  planAssetId: string;
  shotId: string;
  acceptanceCriteria: readonly string[];
  failedChecks: ReadonlyArray<{ check: string; diagnosis: string }>;
  passedChecks: readonly string[];
  description: string;
  notes: readonly string[];
}

let systemPromptCache: string | null = null;

async function loadSystemPrompt(): Promise<string> {
  if (systemPromptCache !== null) return systemPromptCache;
  const candidates = [
    path.resolve(process.cwd(), '../agents/exec/episode_reference_critic.md'),
    path.resolve(process.cwd(), 'agents/exec/episode_reference_critic.md'),
    path.resolve(process.cwd(), '../../agents/exec/episode_reference_critic.md'),
  ];
  for (const p of candidates) {
    try {
      const text = await fs.readFile(p, 'utf-8');
      systemPromptCache = text;
      return text;
    } catch {
      // try next
    }
  }
  throw new EpisodeReferenceCriticError(
    `Could not find agents/exec/episode_reference_critic.md from cwd=${process.cwd()}`,
  );
}

/** Test-only seam — reset the in-process system-prompt cache. */
export function _resetCriticSystemPromptCacheForTests(): void {
  systemPromptCache = null;
}

/**
 * Load a Plan asset by id (any reviewable status — DRAFT/REVIEW/REVISION).
 * Critic must see Plans that haven't been Director-approved yet, so we don't
 * filter to APPROVED here (unlike the executor's loadPlanOverrides).
 */
async function loadPlanRow(
  supabase: SupabaseClient<Database>,
  planAssetId: string,
): Promise<{ id: string; file_type: string; status: string; content: string }> {
  const { data, error } = await supabase
    .from('assets')
    .select('id,file_type,status,content')
    .eq('id', planAssetId)
    .maybeSingle();
  if (error) {
    throw new EpisodeReferenceCriticError(
      `Plan asset fetch failed: ${error.message}`,
    );
  }
  if (!data) {
    throw new EpisodeReferenceCriticError(
      `Plan asset ${planAssetId} not found`,
    );
  }
  if (data.file_type !== 'SPC-ref_plan') {
    throw new EpisodeReferenceCriticError(
      `Plan asset ${planAssetId} has file_type="${data.file_type}", expected SPC-ref_plan`,
    );
  }
  if (!data.content || data.content.trim().length === 0) {
    throw new EpisodeReferenceCriticError(
      `Plan asset ${planAssetId} content is empty`,
    );
  }
  return data as { id: string; file_type: string; status: string; content: string };
}

function buildUserMessage(args: {
  planAssetId: string;
  shotId: string;
  planContent: string;
  planStatus: string;
}): string {
  return [
    '# Task',
    `Validate the Episode Reference Designer's Plan for shot ${args.shotId}.`,
    `Plan asset id: ${args.planAssetId}`,
    `Current Plan status: ${args.planStatus}`,
    '',
    'Run V01-V09 hard checks against the Plan body below. Output verdict + JSON per system contract.',
    '',
    '## Plan asset (raw markdown — read the fenced JSON block to validate)',
    '',
    '<plan>',
    args.planContent,
    '</plan>',
    '',
    'Hard rules:',
    '- Output one markdown narrative and exactly one fenced JSON block at the end.',
    `- The JSON block must include shot_id="${args.shotId}" and plan_asset_id="${args.planAssetId}".`,
    '- Never skip the JSON block — it is parsed by downstream code.',
  ].join('\n');
}

function parseVerdict(body: Record<string, unknown> | null): CriticVerdict {
  if (!body) return 'UNKNOWN';
  const v = body.verdict;
  if (v === 'PASS' || v === 'REVISE' || v === 'FAIL') return v;
  return 'UNKNOWN';
}

function parseFailedChecks(
  body: Record<string, unknown> | null,
): Array<{ check: string; diagnosis: string }> {
  if (!body) return [];
  const raw = body.failed_checks;
  if (!Array.isArray(raw)) return [];
  const out: Array<{ check: string; diagnosis: string }> = [];
  for (const item of raw) {
    if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      if (typeof obj.check === 'string' && typeof obj.diagnosis === 'string') {
        out.push({ check: obj.check, diagnosis: obj.diagnosis });
      }
    }
  }
  return out;
}

function parsePassedChecks(body: Record<string, unknown> | null): string[] {
  if (!body) return [];
  const raw = body.passed_checks;
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v === 'string' && v.trim().length > 0) out.push(v.trim());
  }
  return out;
}

function parseAcceptanceCriteria(body: Record<string, unknown> | null): string[] {
  if (!body) return [];
  const raw = body.acceptance_criteria;
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v === 'string' && v.trim().length > 0) out.push(v.trim());
  }
  return out;
}

export async function runEpisodeReferenceCritic(
  args: EPREVRunArgs,
): Promise<EPREVRunResult> {
  const { supabase, planAssetId, shotId } = args;
  if (!planAssetId) {
    throw new EpisodeReferenceCriticError('planAssetId is required');
  }
  if (!shotId) {
    throw new EpisodeReferenceCriticError('shotId is required');
  }

  const plan = await loadPlanRow(supabase, planAssetId);
  const systemPrompt = await loadSystemPrompt();
  const userMessage = buildUserMessage({
    planAssetId,
    shotId,
    planContent: plan.content,
    planStatus: plan.status,
  });

  const notes: string[] = [];
  let result: AnthropicTextResult;
  try {
    result = await generateAnthropicText({
      systemPrompt,
      userMessage,
      model: EPREV_MODEL,
      maxOutputTokens: EPREV_MAX_TOKENS,
      expectsJson: true,
    });
  } catch (err: unknown) {
    if (err instanceof AnthropicTextError) {
      throw new EpisodeReferenceCriticError(
        `Anthropic generation failed: ${err.message}`,
        err,
      );
    }
    throw err;
  }

  if (!result.body) {
    // Body absent — Critic returned narrative without JSON. We can still surface
    // the markdown to Director but verdict is UNKNOWN; auto-chain treats it as
    // REVISE so the Designer doesn't see an empty signal.
    notes.push('Critic returned no parseable JSON block — UNKNOWN verdict');
  }

  if (result.costUsd > EPREV_COST_CEILING_USD) {
    notes.push(
      `Cost overrun: $${result.costUsd.toFixed(4)} > ceiling $${EPREV_COST_CEILING_USD}`,
    );
  }

  const verdict = parseVerdict(result.body);
  const failedChecks = parseFailedChecks(result.body);
  const passedChecks = parsePassedChecks(result.body);
  const acceptanceCriteria = parseAcceptanceCriteria(result.body);

  const description = [
    `Critic verdict ${verdict} · ${EPREV_CONTRACT} · ${EPREV_MODEL}`,
    `· ${failedChecks.length} failed`,
    `· ${passedChecks.length} passed`,
    `· cost $${result.costUsd.toFixed(4)}`,
  ].join(' ');

  return {
    markdown: result.markdown,
    body: result.body ?? {},
    costUsd: result.costUsd,
    model: result.model,
    contract: EPREV_CONTRACT,
    verdict,
    planAssetId,
    shotId,
    acceptanceCriteria,
    failedChecks,
    passedChecks,
    description,
    notes,
  };
}
