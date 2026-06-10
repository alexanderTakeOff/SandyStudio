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
import { SIZE_BY_DELIVERY_TARGET } from '../../api/provider-capabilities';

/**
 * Render the canonical delivery_target → size manifest as an authoritative
 * block injected into the Critic's prompt. Single source of truth lives in
 * `provider-capabilities.ts`; V02 validates the Plan's declared size against
 * THIS (not a hand-maintained copy in the .md spec). gpt-image-2-bounded —
 * vertical targets are 1024×1536 (portrait max), NOT 1024×1792.
 */
function canonicalSizeBlock(): string {
  const rows = Object.entries(SIZE_BY_DELIVERY_TARGET).map(
    ([target, { width, height }]) => `- \`${target}\`: ${width}×${height}`,
  );
  return [
    '## Canonical delivery_target sizes (AUTHORITATIVE — validate V02 against THIS)',
    'These are gpt-image-2-bounded reference sizes. Vertical targets are 1024×1536',
    '(the provider cannot produce 1024×1792); true 9:16 is rendered downstream by',
    'Seedance. Do NOT REVISE a Plan for using 1024×1536 on a vertical target.',
    ...rows,
  ].join('\n');
}

export const EPREV_CONTRACT = 'episode_reference_critic@v1';
export const EPREV_MODEL = 'claude-sonnet-4-6';
/** Critic verdicts are short — 4K tokens leaves comfortable headroom for the
 *  V01-V09 bullet list + JSON block on a 22-shot episode. */
export const EPREV_MAX_TOKENS = 4000;
/** Per-Plan cost ceiling — Critic is cheap (~$0.01-0.03 typical). */
export const EPREV_COST_CEILING_USD = 0.08;

/**
 * Critic verdict enum.
 *
 * TD-49 Phase 2 P2.3 (2026-05-25): `PASS_WITH_UNCERTAINTY` added to mirror
 * Animator-Critic's P2.5 4-tier verdict. Emitted when the Plan passes all
 * V01-V09 hard checks + anchor_pair structural validation, but a
 * craft-judgment dimension (e.g. whether an anchor pair's prompt actually
 * captures the intended camera angle vs the master layout) is ambiguous.
 * Mode-handling at the approve-route layer mirrors the VPREV behaviour
 * documented in animator-critic.ts.
 */
export type CriticVerdict =
  | 'PASS'
  | 'PASS_WITH_UNCERTAINTY'
  | 'REVISE'
  | 'FAIL'
  | 'UNKNOWN';

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
  // TD-24 + TD-49 P2.3: accept both shapes Designer writes —
  // `SPC-ref_plan` (legacy bare) and `SPC-ref_plan-<shot_id>` (current
  // Designer runner writes shot_id-suffixed form). Mirrors approve-route
  // pattern at app/api/assets/[id]/approve/route.ts:446.
  if (data.file_type !== 'SPC-ref_plan' && !data.file_type.startsWith('SPC-ref_plan-')) {
    throw new EpisodeReferenceCriticError(
      `Plan asset ${planAssetId} has file_type="${data.file_type}", expected SPC-ref_plan or SPC-ref_plan-*`,
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
  gagPlanFact: string;
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
    canonicalSizeBlock(),
    '',
    '## Gag Plan Fact (DB-injected — do NOT override or ignore)',
    args.gagPlanFact,
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
  if (
    v === 'PASS' ||
    v === 'PASS_WITH_UNCERTAINTY' ||
    v === 'REVISE' ||
    v === 'FAIL'
  ) {
    return v;
  }
  return 'UNKNOWN';
}

/**
 * TD-49 Phase 2 P2.3 (2026-05-25): structural validator for the Designer's
 * `anchor_pair` block. Deterministic checks the Critic LLM cannot get wrong
 * (role enum membership, role+handoff_link_to_shot_id reciprocity, shot_id
 * ref shape). Cross-Plan reciprocity (this shot's start ↔ prior shot's end
 * across two separate Plans) is enforced at the approve-route batch flow
 * (P2.6 v2 — not v1).
 *
 * Returns an array of violation strings — empty array = structurally clean
 * or anchor_pair absent (legacy mode). Callers fold these into Critic's
 * `failed_checks[]` so the verdict logic uses the same input shape.
 *
 * Defensive: Plans without an `anchor_pair` block return an empty array
 * (no violations). Back-compat with all legacy SPC-ref_plan Plans.
 *
 * Exported as a test seam.
 */
const START_ANCHOR_ROLES: readonly string[] = ['establishing', 'shared', 'cut_in'] as const;
const END_ANCHOR_ROLES: readonly string[] = ['shared', 'cut_out', 'final'] as const;
const SHOT_ID_REF_RE = /^SS-S\d+-E\d+-A\d+-SC\d+-SH\d+$/;

export function validateAnchorPairStructure(
  planBody: Record<string, unknown> | null,
): readonly string[] {
  if (!planBody) return [];
  const apRaw = planBody.anchor_pair;
  if (!apRaw || typeof apRaw !== 'object') return [];
  const ap = apRaw as Record<string, unknown>;
  const violations: string[] = [];

  validateAnchorSide(ap.start, 'start', START_ANCHOR_ROLES, violations);
  validateAnchorSide(ap.end, 'end', END_ANCHOR_ROLES, violations);

  if (!ap.start && !ap.end) {
    violations.push('anchor_pair: both start and end are absent — emit no anchor_pair field instead, or fill at least one side');
  }

  return violations;
}

function validateAnchorSide(
  raw: unknown,
  sideName: 'start' | 'end',
  allowedRoles: readonly string[],
  violations: string[],
): void {
  if (raw === undefined || raw === null) return; // side is optional
  if (typeof raw !== 'object') {
    violations.push(`anchor_pair.${sideName}: must be an object, got ${typeof raw}`);
    return;
  }
  const obj = raw as Record<string, unknown>;
  const role = obj.role;
  if (typeof role !== 'string') {
    violations.push(`anchor_pair.${sideName}.role: required string, got ${typeof role}`);
    return;
  }
  if (!allowedRoles.includes(role)) {
    violations.push(
      `anchor_pair.${sideName}.role="${role}" not in allowed set: ${allowedRoles.join(', ')}`,
    );
    return;
  }
  const prompt = obj.prompt;
  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    violations.push(`anchor_pair.${sideName}.prompt: required non-empty string`);
  }
  const handoff = obj.handoff_link_to_shot_id;
  if (role === 'shared') {
    if (typeof handoff !== 'string' || handoff.trim().length === 0) {
      violations.push(
        `anchor_pair.${sideName}.role="shared" REQUIRES handoff_link_to_shot_id to be a non-empty shot_id reference (got ${JSON.stringify(handoff)})`,
      );
    } else if (!SHOT_ID_REF_RE.test(handoff.trim())) {
      violations.push(
        `anchor_pair.${sideName}.handoff_link_to_shot_id="${handoff}" does not match shot_id format SS-S<NN>-E<NN>-A<N>-SC<NN>-SH<NN>`,
      );
    }
  } else {
    // role !== 'shared' → handoff must be null/absent
    if (handoff !== null && handoff !== undefined) {
      violations.push(
        `anchor_pair.${sideName}.role="${role}" REQUIRES handoff_link_to_shot_id=null (got ${JSON.stringify(handoff)})`,
      );
    }
  }
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

  // V10 DB-fact injection: query actual APPROVED gag plans so the Critic
  // evaluates V10 against reality, not a hallucinated assumption.
  // Wrapped in try/catch so mock supabase (missing .or/.order methods) degrades
  // gracefully to the N/A message rather than throwing.
  const episodeId = (args.inputs as { episode_id?: string }).episode_id ?? '';
  let gagPlanFact: string;
  try {
    const { data: gagRows } = await supabase
      .from('assets')
      .select('id,content,created_at')
      .eq('episode_id', episodeId)
      .eq('status', 'APPROVED')
      .or('file_type.eq.SPC-gag_plan,file_type.like.SPC-gag_plan-%')
      .order('created_at', { ascending: false });
    const rows = (gagRows ?? []) as Array<{ id: string; content?: string | null; created_at?: string }>;
    if (rows.length === 0) {
      gagPlanFact = "DB FACT: zero APPROVED SPC-gag_plan assets exist for this episode. V10 is N/A — record 'V10 (N/A — no gag plan)' in passed_checks. Do NOT assume or invent a gag plan.";
    } else {
      const newest = rows[0];
      const content = (newest.content ?? '').slice(0, 6000);
      gagPlanFact = `DB FACT: APPROVED gag plan exists — validate V10 against THIS:\n\n${content}`;
    }
  } catch {
    gagPlanFact = 'DB FACT: gag plan lookup failed — treat V10 as N/A.';
  }

  const userMessage = buildUserMessage({
    planAssetId,
    shotId,
    planContent: plan.content,
    planStatus: plan.status,
    gagPlanFact,
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

  let verdict = parseVerdict(result.body);
  const failedChecks = parseFailedChecks(result.body);
  const passedChecks = parsePassedChecks(result.body);
  const acceptanceCriteria = parseAcceptanceCriteria(result.body);

  // TD-49 Phase 2 P2.3 (2026-05-25): deterministic anchor_pair structural
  // checks the LLM cannot get wrong. Augments LLM-side failed_checks with
  // hard-violation entries. When violations exist and the LLM emitted PASS,
  // force verdict to REVISE so the Designer re-runs with the violations as
  // acceptance criteria.
  const anchorViolations = result.body ? validateAnchorPairStructure(result.body) : [];
  if (anchorViolations.length > 0) {
    for (const v of anchorViolations) {
      failedChecks.push({
        check: 'V10_ANCHOR_PAIR_STRUCTURE',
        diagnosis: v,
      });
      acceptanceCriteria.push(v);
    }
    if (verdict === 'PASS' || verdict === 'PASS_WITH_UNCERTAINTY') {
      notes.push(
        `Verdict forced REVISE: ${anchorViolations.length} structural anchor_pair violation(s) — LLM missed them`,
      );
      verdict = 'REVISE';
    }
  }

  const description = [
    `Critic verdict ${verdict} · ${EPREV_CONTRACT} · ${EPREV_MODEL}`,
    `· ${failedChecks.length} failed`,
    `· ${passedChecks.length} passed`,
    anchorViolations.length > 0 ? `· ${anchorViolations.length} anchor` : '',
    `· cost $${result.costUsd.toFixed(4)}`,
  ]
    .filter(Boolean)
    .join(' ');

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
