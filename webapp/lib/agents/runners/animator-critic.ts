// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/runners/animator-critic.ts
// EXEC-VPREV — Animator's Critic (Sprint «Дизайнер и Аниматор» Day 8
// 2026-05-19). Validates an SPC-shot_plan asset's JSON body against V01-V09
// hard checks, returning PASS / REVISE / FAIL.
//
// Mirrors EXEC-EPREV pattern. Verdict drives auto-chain in factory.nextEvent:
//   PASS    → flip Plan to REVIEW (Director sees it)
//   REVISE  → flip Plan to REVISION + re-fire Animator with hard contract
//   FAIL    → flip Plan to REJECTED + Director escalation
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

export const VPREV_CONTRACT = 'animator_critic@v1';
export const VPREV_MODEL = 'claude-sonnet-4-6';
export const VPREV_MAX_TOKENS = 4000;
export const VPREV_COST_CEILING_USD = 0.08;

export type AnimatorCriticVerdict = 'PASS' | 'REVISE' | 'FAIL' | 'UNKNOWN';

export class AnimatorCriticError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'AnimatorCriticError';
  }
}

export interface VPREVRunArgs {
  inputs: AgentInputs;
  supabase: SupabaseClient<Database>;
  planAssetId: string;
  shotId: string;
}

export interface VPREVRunResult {
  markdown: string;
  body: Record<string, unknown>;
  costUsd: number;
  model: string;
  contract: typeof VPREV_CONTRACT;
  verdict: AnimatorCriticVerdict;
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
    path.resolve(process.cwd(), '../agents/exec/animator_critic.md'),
    path.resolve(process.cwd(), 'agents/exec/animator_critic.md'),
    path.resolve(process.cwd(), '../../agents/exec/animator_critic.md'),
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
  throw new AnimatorCriticError(
    `Could not find agents/exec/animator_critic.md from cwd=${process.cwd()}`,
  );
}

export function _resetVprevSystemPromptCacheForTests(): void {
  systemPromptCache = null;
}

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
    throw new AnimatorCriticError(`Plan asset fetch failed: ${error.message}`);
  }
  if (!data) {
    throw new AnimatorCriticError(`Plan asset ${planAssetId} not found`);
  }
  if (data.file_type !== 'SPC-shot_plan') {
    throw new AnimatorCriticError(
      `Plan asset ${planAssetId} has file_type="${data.file_type}", expected SPC-shot_plan`,
    );
  }
  if (!data.content || data.content.trim().length === 0) {
    throw new AnimatorCriticError(`Plan asset ${planAssetId} content is empty`);
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
    `Validate the Animator's Plan for shot ${args.shotId}.`,
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
    `- The JSON block must include shot_id="${args.shotId}" and plan_asset_id="${args.planAssetId}".`,
    '- Never skip the JSON block.',
  ].join('\n');
}

function parseVerdict(body: Record<string, unknown> | null): AnimatorCriticVerdict {
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

function parseStringArray(
  body: Record<string, unknown> | null,
  key: string,
): string[] {
  if (!body) return [];
  const raw = body[key];
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v === 'string' && v.trim().length > 0) out.push(v.trim());
  }
  return out;
}

export async function runAnimatorCritic(args: VPREVRunArgs): Promise<VPREVRunResult> {
  const { supabase, planAssetId, shotId } = args;
  if (!planAssetId) throw new AnimatorCriticError('planAssetId is required');
  if (!shotId) throw new AnimatorCriticError('shotId is required');

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
      model: VPREV_MODEL,
      maxOutputTokens: VPREV_MAX_TOKENS,
      expectsJson: true,
    });
  } catch (err: unknown) {
    if (err instanceof AnthropicTextError) {
      throw new AnimatorCriticError(`Anthropic generation failed: ${err.message}`, err);
    }
    throw err;
  }

  if (!result.body) {
    notes.push('Critic returned no parseable JSON block — UNKNOWN verdict');
  }
  if (result.costUsd > VPREV_COST_CEILING_USD) {
    notes.push(
      `Cost overrun: $${result.costUsd.toFixed(4)} > ceiling $${VPREV_COST_CEILING_USD}`,
    );
  }

  const verdict = parseVerdict(result.body);
  const failedChecks = parseFailedChecks(result.body);
  const passedChecks = parseStringArray(result.body, 'passed_checks');
  const acceptanceCriteria = parseStringArray(result.body, 'acceptance_criteria');

  const description = [
    `Animator's Critic verdict ${verdict} · ${VPREV_CONTRACT} · ${VPREV_MODEL}`,
    `· ${failedChecks.length} failed`,
    `· ${passedChecks.length} passed`,
    `· cost $${result.costUsd.toFixed(4)}`,
  ].join(' ');

  return {
    markdown: result.markdown,
    body: result.body ?? {},
    costUsd: result.costUsd,
    model: result.model,
    contract: VPREV_CONTRACT,
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
