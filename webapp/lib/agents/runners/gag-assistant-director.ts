// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/runners/gag-assistant-director.ts
// EXEC-GAGAD — Gag Assistant Director (Sprint «Дизайнер и Аниматор» Day 11+
// 2026-05-19). Cross-layer gag continuity supervisor. THREE phases handled
// by ONE runner with phase switch.
//
// Phase «plan» — after SREV approves script, write SPC-gag_plan: theme,
// antagonist, escalation pattern, per-shot gag intent table.
//
// Phase «eref_review» — per-shot. Validate that an SPC-ref_plan delivers the
// gag intent declared by gag_plan for that shot. Verdict PASS/REVISE/HALT.
//
// Phase «vanim_review» — per-shot. Same against SPC-shot_plan (Animator
// output). Verdict PASS/REVISE/HALT.
//
// Revision counter cap=2 enforced by the runner.ts caller, not here — this
// file only emits verdicts. The counter is tracked on the upstream Plan
// asset's metadata.gagad_revision_count.
// ──────────────────────────────────────────────────────────────────────────────

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  generateAnthropicText,
  AnthropicTextError,
  type AnthropicTextResult,
} from '../providers/anthropic-text';
import { formatBibleForPrompt, type SeriesBibleCanon } from '../bible-loader';
import type { Database } from '../../supabase/types.gen';
import type { AgentInputs } from '../types';

export const GAGAD_CONTRACT = 'gag_assistant_director@v1';
export const GAGAD_MODEL = 'claude-sonnet-4-6';
/** Plan phase needs room for per-shot table — up to ~20 shots × ~150 tokens = 3K + narrative. */
export const GAGAD_MAX_TOKENS_PLAN = 8000;
/** Review phases are short — verdict + acceptance_criteria + JSON. */
export const GAGAD_MAX_TOKENS_REVIEW = 4000;
/** Per-call cost ceilings. Plan ~$0.04-0.08; review ~$0.01-0.03. */
export const GAGAD_COST_CEILING_PLAN_USD = 0.2;
export const GAGAD_COST_CEILING_REVIEW_USD = 0.08;

export type GagadPhase = 'plan' | 'eref_review' | 'vanim_review';
export type GagadVerdict = 'PASS' | 'REVISE' | 'HALT' | 'UNKNOWN';

export class GagAssistantDirectorError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'GagAssistantDirectorError';
  }
}

// ── Common arg + result shapes ───────────────────────────────────────────────

interface UpstreamAssetLike {
  id?: string;
  file_type?: string | null;
  status?: string | null;
  content?: string | null;
  filename?: string | null;
  version?: number | null;
}

interface EpisodeLike {
  id?: string;
  episode_code?: string;
  title_working?: string | null;
  metadata?: unknown;
}

export interface GAGADRunArgsBase {
  inputs: AgentInputs;
  supabase: SupabaseClient<Database>;
  phase: GagadPhase;
}

export interface GAGADPlanArgs extends GAGADRunArgsBase {
  phase: 'plan';
  scriptAssetId?: string;
  revisionNote?: string;
}

export interface GAGADReviewArgs extends GAGADRunArgsBase {
  phase: 'eref_review' | 'vanim_review';
  planAssetId: string;
  shotId: string;
}

export type GAGADRunArgs = GAGADPlanArgs | GAGADReviewArgs;

export interface GAGADRunResult {
  phase: GagadPhase;
  markdown: string;
  body: Record<string, unknown>;
  costUsd: number;
  model: string;
  contract: typeof GAGAD_CONTRACT;
  description: string;
  notes: readonly string[];
  // Plan-phase only
  scriptAssetId?: string | null;
  // Review-phase only
  verdict?: GagadVerdict;
  planAssetId?: string;
  shotId?: string;
  gagPlanAssetId?: string | null;
  revisionCountBefore?: number;
  acceptanceCriteria?: readonly string[];
  failedChecks?: ReadonlyArray<Record<string, unknown>>;
  passedChecks?: readonly string[];
}

// ── System prompt loader ─────────────────────────────────────────────────────

let systemPromptCache: string | null = null;

async function loadSystemPrompt(): Promise<string> {
  if (systemPromptCache !== null) return systemPromptCache;
  const candidates = [
    path.resolve(process.cwd(), '../agents/exec/gag_assistant_director.md'),
    path.resolve(process.cwd(), 'agents/exec/gag_assistant_director.md'),
    path.resolve(process.cwd(), '../../agents/exec/gag_assistant_director.md'),
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
  throw new GagAssistantDirectorError(
    `Could not find agents/exec/gag_assistant_director.md from cwd=${process.cwd()}`,
  );
}

export function _resetGagadSystemPromptCacheForTests(): void {
  systemPromptCache = null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function findApprovedAsset(
  upstream: readonly UpstreamAssetLike[] | undefined,
  fileType: string,
): UpstreamAssetLike | null {
  if (!upstream) return null;
  return (
    upstream.find((a) => a.file_type === fileType && a.status === 'APPROVED') ?? null
  );
}

function parseLastJsonBlock(content: string): Record<string, unknown> | null {
  const matches = [...content.matchAll(/```json\s*([\s\S]+?)```/g)];
  if (matches.length === 0) return null;
  const last = matches[matches.length - 1]?.[1];
  if (!last) return null;
  try {
    return JSON.parse(last.trim()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseVerdict(body: Record<string, unknown> | null): GagadVerdict {
  if (!body) return 'UNKNOWN';
  const v = body.verdict;
  if (v === 'PASS' || v === 'REVISE' || v === 'HALT') return v;
  return 'UNKNOWN';
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

function parseFailedChecks(
  body: Record<string, unknown> | null,
): Array<Record<string, unknown>> {
  if (!body) return [];
  const raw = body.failed_checks;
  if (!Array.isArray(raw)) return [];
  const out: Array<Record<string, unknown>> = [];
  for (const item of raw) {
    if (item && typeof item === 'object') out.push(item as Record<string, unknown>);
  }
  return out;
}

// ── Phase «plan» implementation ──────────────────────────────────────────────

async function runPlanPhase(args: GAGADPlanArgs): Promise<GAGADRunResult> {
  const { inputs, revisionNote, scriptAssetId } = args;
  const ep = inputs.episode as EpisodeLike | undefined;
  const episodeCode = ep?.episode_code ?? 'UNKNOWN';
  const episodeTitle = ep?.title_working ?? 'Untitled';

  const upstream = inputs.upstream_assets as readonly UpstreamAssetLike[] | undefined;
  const script = findApprovedAsset(upstream, 'SCR-script');
  if (!script?.content) {
    throw new GagAssistantDirectorError(
      'Precondition failed: APPROVED SCR-script with content not found in upstream_assets',
    );
  }

  const bible = (inputs.bible as SeriesBibleCanon | undefined) ?? {
    series_id: null,
    general_idea: null,
    characters: [],
    locations: [],
    styles: [],
    total_entries: 0,
  };
  const hasCanon = bible.total_entries > 0 || bible.general_idea !== null;

  const deliveryTargets = readDeliveryTargets(ep?.metadata) ?? ['youtube_landscape'];

  const userMessage = [
    '# Active phase: PLAN',
    '',
    `## Episode`,
    `code: ${episodeCode}`,
    `title: ${episodeTitle}`,
    `delivery_targets: ${deliveryTargets.join(', ')}`,
    '',
    '## Approved script (canonical input)',
    '',
    '<script>',
    script.content,
    '</script>',
    '',
    '## Series Bible canon',
    '',
    hasCanon
      ? formatBibleForPrompt(bible)
      : 'No LOCKED Series Bible canon yet. Operate in MVP mode and list assumptions in policy_notes[].',
    '',
    revisionNote
      ? [
          '## Revision request from Director — HARD CONTRACT',
          '',
          revisionNote,
          '',
          'Treat each item above as a hard rule. Re-derive the Gag Plan from inputs; do not minimally tweak prior rejected decisions.',
          '',
        ].join('\n')
      : '',
    'Output: per Phase plan system contract. Markdown narrative + ONE fenced JSON block at the end.',
  ]
    .filter(Boolean)
    .join('\n');

  const systemPrompt = await loadSystemPrompt();

  let result: AnthropicTextResult;
  try {
    result = await generateAnthropicText({
      systemPrompt,
      userMessage,
      model: GAGAD_MODEL,
      maxOutputTokens: GAGAD_MAX_TOKENS_PLAN,
      expectsJson: true,
    });
  } catch (err: unknown) {
    if (err instanceof AnthropicTextError) {
      throw new GagAssistantDirectorError(
        `Anthropic generation failed: ${err.message}`,
        err,
      );
    }
    throw err;
  }

  if (!result.body) {
    throw new GagAssistantDirectorError(
      'Postcondition failed: Phase plan returned no parseable JSON block',
    );
  }

  const notes: string[] = [];
  if (bible.total_entries === 0 && !bible.general_idea) {
    notes.push('Bible empty — Gag Plan in MVP mode');
  }
  if (result.costUsd > GAGAD_COST_CEILING_PLAN_USD) {
    notes.push(
      `Cost overrun: $${result.costUsd.toFixed(4)} > ceiling $${GAGAD_COST_CEILING_PLAN_USD}`,
    );
  }
  if (revisionNote) notes.push('Revision-note iteration');

  const theme = typeof (result.body as { theme?: unknown }).theme === 'string'
    ? ((result.body as { theme: string }).theme)
    : null;
  const shots = Array.isArray((result.body as { shots?: unknown }).shots)
    ? ((result.body as { shots: unknown[] }).shots as unknown[])
    : [];

  const description = [
    `Gag Plan · ${GAGAD_CONTRACT} · ${GAGAD_MODEL}`,
    theme ? `· ${theme}` : '',
    `· ${shots.length} shots`,
    `· cost $${result.costUsd.toFixed(4)}`,
  ]
    .filter(Boolean)
    .join(' ');

  return {
    phase: 'plan',
    markdown: result.markdown,
    body: result.body,
    costUsd: result.costUsd,
    model: result.model,
    contract: GAGAD_CONTRACT,
    description,
    notes,
    scriptAssetId: scriptAssetId ?? script.id ?? null,
  };
}

function readDeliveryTargets(meta: unknown): readonly string[] | null {
  if (!meta || typeof meta !== 'object') return null;
  const raw = (meta as Record<string, unknown>).delivery_targets;
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v === 'string' && v.length > 0) out.push(v);
  }
  return out.length > 0 ? out : null;
}

// ── Review phase implementations (eref_review + vanim_review) ────────────────

async function runReviewPhase(args: GAGADReviewArgs): Promise<GAGADRunResult> {
  const { inputs, supabase, phase, planAssetId, shotId } = args;
  if (!planAssetId) {
    throw new GagAssistantDirectorError('planAssetId is required for review phase');
  }
  if (!shotId) {
    throw new GagAssistantDirectorError('shotId is required for review phase');
  }

  const expectedFileType =
    phase === 'eref_review' ? 'SPC-ref_plan' : 'SPC-shot_plan';

  // 1. Load the upstream Plan being reviewed.
  const { data: planRow, error: planErr } = await supabase
    .from('assets')
    .select('id,file_type,status,content,metadata')
    .eq('id', planAssetId)
    .maybeSingle();
  if (planErr) {
    throw new GagAssistantDirectorError(
      `Upstream Plan fetch failed: ${planErr.message}`,
    );
  }
  if (!planRow) {
    throw new GagAssistantDirectorError(`Plan asset ${planAssetId} not found`);
  }
  if (planRow.file_type !== expectedFileType) {
    throw new GagAssistantDirectorError(
      `Plan asset ${planAssetId} file_type="${planRow.file_type}", expected ${expectedFileType}`,
    );
  }
  if (!planRow.content || planRow.content.trim().length === 0) {
    throw new GagAssistantDirectorError(`Plan asset ${planAssetId} content empty`);
  }

  // 2. Find the latest APPROVED SPC-gag_plan for this episode.
  const episodeId = (inputs.episode as EpisodeLike | undefined)?.id ?? inputs.episode_id;
  if (!episodeId) {
    throw new GagAssistantDirectorError(
      'episode_id missing in inputs — cannot resolve gag_plan',
    );
  }
  const { data: gagPlanRow } = await supabase
    .from('assets')
    .select('id,content,version')
    .eq('episode_id', episodeId as string)
    .eq('file_type', 'SPC-gag_plan')
    .eq('status', 'APPROVED')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!gagPlanRow?.content) {
    // Race condition: EPREV/VPREV PASS fired before Director approved gag_plan.
    // Return a soft signal so the runner doesn't chain REVISE — informational only.
    return softVerdictNoGagPlan(args, planAssetId, shotId);
  }

  // 3. Read existing revision counter from upstream Plan metadata.
  const upstreamMeta = (planRow.metadata as Record<string, unknown> | null) ?? {};
  const rawCounter = upstreamMeta.gagad_revision_count;
  const revisionCount =
    typeof rawCounter === 'number' && rawCounter >= 0 && rawCounter <= 99
      ? Math.floor(rawCounter)
      : 0;

  // 4. Storyboard shot data — extracted from STB upstream.
  const upstream = inputs.upstream_assets as readonly UpstreamAssetLike[] | undefined;
  const stb = findApprovedAsset(upstream, 'STB-storyboard');
  const stbExcerpt = stb?.content
    ? stb.content.slice(0, 4000) +
      (stb.content.length > 4000 ? '\n... [truncated]' : '')
    : '<no STB upstream>';

  // 5. Compose user message + call Sonnet.
  const phaseLabel = phase === 'eref_review' ? 'EREF_REVIEW' : 'VANIM_REVIEW';
  const userMessage = [
    `# Active phase: ${phaseLabel}`,
    '',
    `## Shot under review`,
    `shot_id: ${shotId}`,
    `plan_asset_id: ${planAssetId}`,
    `gag_plan_asset_id: ${gagPlanRow.id}`,
    `revision_count_before: ${revisionCount}`,
    '',
    '## Upstream Plan (Designer / Animator output)',
    '',
    '<upstream_plan>',
    planRow.content,
    '</upstream_plan>',
    '',
    '## Approved Gag Plan (episode-level)',
    '',
    '<gag_plan>',
    gagPlanRow.content,
    '</gag_plan>',
    '',
    '## Storyboard shot context (excerpt)',
    '',
    '<storyboard>',
    stbExcerpt,
    '</storyboard>',
    '',
    'Output: per Phase contract for this review type. Markdown narrative + ONE fenced JSON block at the end.',
    `Set phase: "${phase}" in the JSON.`,
    `Set plan_asset_id: "${planAssetId}", shot_id: "${shotId}", gag_plan_asset_id: "${gagPlanRow.id}", revision_count_before: ${revisionCount}.`,
    `If you'd output verdict=REVISE but revision_count_before >= 2 — flip verdict to HALT instead.`,
  ].join('\n');

  const systemPrompt = await loadSystemPrompt();

  let result: AnthropicTextResult;
  try {
    result = await generateAnthropicText({
      systemPrompt,
      userMessage,
      model: GAGAD_MODEL,
      maxOutputTokens: GAGAD_MAX_TOKENS_REVIEW,
      expectsJson: true,
    });
  } catch (err: unknown) {
    if (err instanceof AnthropicTextError) {
      throw new GagAssistantDirectorError(
        `Anthropic generation failed: ${err.message}`,
        err,
      );
    }
    throw err;
  }

  const notes: string[] = [];
  if (!result.body) {
    notes.push('GAGAD review returned no parseable JSON block — UNKNOWN verdict');
  }
  if (result.costUsd > GAGAD_COST_CEILING_REVIEW_USD) {
    notes.push(
      `Cost overrun: $${result.costUsd.toFixed(4)} > ceiling $${GAGAD_COST_CEILING_REVIEW_USD}`,
    );
  }

  let verdict = parseVerdict(result.body);
  // Server-side cap enforcement (belt-and-braces — even if Sonnet ignored the
  // instruction in the user message, runner still flips to HALT here).
  if (verdict === 'REVISE' && revisionCount >= 2) {
    verdict = 'HALT';
    notes.push(`Cap enforced: revision_count=${revisionCount}, REVISE → HALT`);
  }

  const acceptanceCriteria = parseStringArray(result.body, 'acceptance_criteria');
  const passedChecks = parseStringArray(result.body, 'passed_checks');
  const failedChecks = parseFailedChecks(result.body);

  const description = [
    `GAGAD ${phaseLabel.toLowerCase()} verdict ${verdict}`,
    `· revision_count=${revisionCount}`,
    `· ${failedChecks.length} failed`,
    `· cost $${result.costUsd.toFixed(4)}`,
  ].join(' ');

  return {
    phase,
    markdown: result.markdown,
    body: result.body ?? {},
    costUsd: result.costUsd,
    model: result.model,
    contract: GAGAD_CONTRACT,
    description,
    notes,
    verdict,
    planAssetId,
    shotId,
    gagPlanAssetId: gagPlanRow.id ?? null,
    revisionCountBefore: revisionCount,
    acceptanceCriteria,
    failedChecks,
    passedChecks,
  };
}

/**
 * Race-condition fallback: EPREV/VPREV PASS fired before Director approved
 * SPC-gag_plan. Emit an informational REV row with verdict=PASS — does not
 * trigger any state change downstream. PA can re-fire later when gag_plan
 * is approved.
 */
function softVerdictNoGagPlan(
  args: GAGADReviewArgs,
  planAssetId: string,
  shotId: string,
): GAGADRunResult {
  return {
    phase: args.phase,
    markdown:
      `# GAGAD ${args.phase} — skipped\n\nNo APPROVED SPC-gag_plan found for this episode. Cross-layer review skipped. Re-fire after Director approves the gag plan.\n\n\`\`\`json\n{ "verdict": "PASS", "phase": "${args.phase}", "plan_asset_id": "${planAssetId}", "shot_id": "${shotId}", "reason": "no_gag_plan_yet" }\n\`\`\``,
    body: {
      verdict: 'PASS',
      phase: args.phase,
      plan_asset_id: planAssetId,
      shot_id: shotId,
      reason: 'no_gag_plan_yet',
    },
    costUsd: 0,
    model: 'no-op',
    contract: GAGAD_CONTRACT,
    description: `GAGAD ${args.phase} skipped — no APPROVED gag_plan`,
    notes: ['No APPROVED SPC-gag_plan — soft PASS, no state change'],
    verdict: 'PASS',
    planAssetId,
    shotId,
    gagPlanAssetId: null,
    revisionCountBefore: 0,
    acceptanceCriteria: [],
    failedChecks: [],
    passedChecks: [],
  };
}

// ── Dispatcher ───────────────────────────────────────────────────────────────

export async function runGagAssistantDirector(
  args: GAGADRunArgs,
): Promise<GAGADRunResult> {
  if (args.phase === 'plan') {
    return runPlanPhase(args);
  }
  return runReviewPhase(args);
}
