// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/runners/creative-readability-critic.ts
// EXEC-CREAD — Creative Readability Critic (C1-Gate sprint 2026-06-10).
//
// A UNIVERSAL, process-invariant critic. It carries NO genre rules of its own;
// the genre engine arrives at runtime through the skill shelf (Active Playbooks
// — copied from storyboarder.ts:399-472). The critic validates that a storyboard
// reads — every beat has a single readable intent, actions have visible
// consequences, object state stays continuous, payoffs are specific, no empty
// motion — against the genre engine declared in whatever playbook activated.
//
// CRITICAL HALT RULE (skill-creation conflict rule — no silent reconciliation):
//   If ZERO genre playbooks match (including genre=null) the critic returns
//   verdict HALT IMMEDIATELY, WITHOUT calling the paid Anthropic model. A
//   readability critic with no genre engine cannot judge readability — so we
//   stop loudly. This also catches genre-resolution regressions (the very bug
//   the C1-Gate sprint exists to surface: series_genre=null silently disabling
//   every genre-scoped skill).
//
// Slot: after STB-storyboard, before EXEC-WCHK. Verdict drives the readability
// gate (next-events.ts REV-readability branch + exec-cread.ts nextEvent):
//   PASS / PASS_WITH_UNCERTAINTY → EXEC-WCHK
//   REVISE                       → re-fire Storyboarder with acceptance_criteria
//   HALT / FAIL                  → no next event (Director escalation)
//
// Mirrors episode-reference-critic.ts (loadSystemPrompt 3-candidate cache,
// verdict parse, applyCriticVerdict in the runner.ts case, cost/notes ledger).
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
import {
  getAgentSkillManifest,
  loadAgentSkillBodies,
  composeSkillSelectionPrompt,
  composeActivePlaybooksBlock,
} from '../load-skills';
import { parseSkillSelection } from '../../skills/parse-skill-selection';

export const CREAD_CONTRACT = 'creative_readability_critic@v1';
export const CREAD_MODEL = 'claude-sonnet-4-6';
/** Readability verdicts are short — 4K tokens is comfortable for the R01-R06
 *  bullet list + JSON block. */
export const CREAD_MAX_TOKENS = 4000;
/** Per-storyboard cost ceiling — critic is cheap (~$0.01-0.03 typical). */
export const CREAD_COST_CEILING_USD = 0.1;
/** Two-step skill selection: Haiku picks which playbooks to activate above this
 *  manifest size; at/under it, activate all matching skills directly. */
export const CREAD_SELECTION_MODEL = 'claude-haiku-4-5';
export const CREAD_SELECTION_MAX_TOKENS = 400;
const SKILL_SELECTION_THRESHOLD = 2;

/**
 * Critic verdict enum. Mirrors EPREV (PASS / PASS_WITH_UNCERTAINTY / REVISE /
 * FAIL / UNKNOWN) plus HALT — emitted by the no-playbook rule and by
 * applyCriticVerdict when the revision cap is reached.
 */
export type CriticVerdict =
  | 'PASS'
  | 'PASS_WITH_UNCERTAINTY'
  | 'REVISE'
  | 'FAIL'
  | 'HALT'
  | 'UNKNOWN';

export class CreativeReadabilityCriticError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'CreativeReadabilityCriticError';
  }
}

export interface CREADRunArgs {
  inputs: AgentInputs;
  supabase: SupabaseClient<Database>;
  /** STB-storyboard asset id under review. When absent, the runner falls back
   *  to the newest APPROVED STB in upstream_assets. */
  storyboardAssetId?: string;
}

export interface CREADRunResult {
  markdown: string;
  body: Record<string, unknown>;
  costUsd: number;
  model: string;
  contract: typeof CREAD_CONTRACT;
  verdict: CriticVerdict;
  storyboardAssetId: string;
  acceptanceCriteria: readonly string[];
  failedChecks: ReadonlyArray<{ check: string; diagnosis: string }>;
  passedChecks: readonly string[];
  activePlaybooks: readonly string[];
  description: string;
  notes: readonly string[];
}

interface UpstreamAssetLike {
  id?: string;
  file_type?: string | null;
  status?: string | null;
  content?: string | null;
  version?: number | null;
}

let systemPromptCache: string | null = null;

async function loadSystemPrompt(): Promise<string> {
  if (systemPromptCache !== null) return systemPromptCache;
  const candidates = [
    path.resolve(process.cwd(), '../agents/exec/creative_readability_critic.md'),
    path.resolve(process.cwd(), 'agents/exec/creative_readability_critic.md'),
    path.resolve(process.cwd(), '../../agents/exec/creative_readability_critic.md'),
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
  throw new CreativeReadabilityCriticError(
    `Could not find agents/exec/creative_readability_critic.md from cwd=${process.cwd()}`,
  );
}

/** Test-only seam — reset the in-process system-prompt cache. */
export function _resetCreadSystemPromptCacheForTests(): void {
  systemPromptCache = null;
}

/**
 * Resolve the storyboard to review. Prefer the explicit asset id from the
 * event; fall back to the newest APPROVED STB in upstream_assets so the critic
 * still works when fired without a precise id (defensive, mirrors the
 * continuity-check loader).
 */
async function loadStoryboard(
  supabase: SupabaseClient<Database>,
  storyboardAssetId: string | undefined,
  inputs: AgentInputs,
): Promise<{ id: string; content: string }> {
  if (storyboardAssetId) {
    const { data, error } = await supabase
      .from('assets')
      .select('id,file_type,content')
      .eq('id', storyboardAssetId)
      .maybeSingle();
    if (error) {
      throw new CreativeReadabilityCriticError(
        `Storyboard asset fetch failed: ${error.message}`,
      );
    }
    const row = data as { id?: string; file_type?: string; content?: string | null } | null;
    if (!row) {
      throw new CreativeReadabilityCriticError(
        `Storyboard asset ${storyboardAssetId} not found`,
      );
    }
    if (typeof row.file_type === 'string' && !row.file_type.startsWith('STB-')) {
      throw new CreativeReadabilityCriticError(
        `Asset ${storyboardAssetId} has file_type="${row.file_type}", expected STB-*`,
      );
    }
    if (!row.content || row.content.trim().length === 0) {
      throw new CreativeReadabilityCriticError(
        `Storyboard asset ${storyboardAssetId} content is empty`,
      );
    }
    return { id: row.id ?? storyboardAssetId, content: row.content };
  }

  // Fallback: newest APPROVED STB in upstream_assets.
  const upstream = inputs.upstream_assets as readonly UpstreamAssetLike[] | undefined;
  const approved = (upstream ?? [])
    .filter((a) => a.file_type?.startsWith('STB-') && a.status === 'APPROVED' && a.content)
    .sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
  const newest = approved[0];
  if (!newest?.id || !newest.content) {
    throw new CreativeReadabilityCriticError(
      'No storyboardAssetId provided and no APPROVED STB-* with content found in upstream_assets',
    );
  }
  return { id: newest.id, content: newest.content };
}

/**
 * Two-step skill shelf (copy of storyboarder.ts:399-472). Returns the composed
 * Active Playbooks block AND the list of activated slugs. An EMPTY slug list is
 * the load-bearing signal for the HALT-without-paid-call rule in the caller.
 */
async function resolveActivePlaybooks(args: {
  inputs: AgentInputs;
  episodeLabel: string;
  notes: string[];
}): Promise<{ block: string; activatedSlugs: readonly string[]; selectionCostUsd: number }> {
  const { inputs, episodeLabel, notes } = args;
  const seriesGenre =
    typeof inputs.series_genre === 'string' ? inputs.series_genre : undefined;
  const seriesId =
    (inputs.episode as { series_id?: string | null } | undefined)?.series_id ?? undefined;

  const manifestResult = await getAgentSkillManifest({
    agentId: 'EXEC-CREAD',
    genre: seriesGenre,
    series_id: seriesId ?? undefined,
    episode_id: inputs.episode_id,
  });

  let activatedSlugs: readonly string[] = [];
  let selectionCostUsd = 0;

  if (manifestResult.count > 0) {
    if (manifestResult.count <= SKILL_SELECTION_THRESHOLD) {
      activatedSlugs = manifestResult.available.map((m) => m.slug);
      notes.push(
        `Skill selection skipped — ${manifestResult.count} matching skill${manifestResult.count === 1 ? '' : 's'} ≤ threshold (${SKILL_SELECTION_THRESHOLD}); activated all`,
      );
    } else {
      const selectionPrompt = composeSkillSelectionPrompt(
        manifestResult.available,
        `Reviewing readability of storyboard ${episodeLabel} (${manifestResult.count} candidate playbooks)`,
      );
      try {
        const selectionResult = await generateAnthropicText({
          systemPrompt:
            'You are EXEC-CREAD (Creative Readability Critic). Your only job in this turn is to pick which genre readability playbooks to activate from your repertoire for the storyboard you are about to review.',
          userMessage: selectionPrompt,
          model: CREAD_SELECTION_MODEL,
          maxOutputTokens: CREAD_SELECTION_MAX_TOKENS,
          expectsJson: false,
        });
        selectionCostUsd = selectionResult.costUsd;
        const parsed = parseSkillSelection(selectionResult.markdown);
        const knownSlugs = new Set(manifestResult.available.map((m) => m.slug));
        activatedSlugs = parsed.slugs.filter((s) => knownSlugs.has(s));
        notes.push(
          `Skill selection (${CREAD_SELECTION_MODEL}): ${activatedSlugs.length}/${manifestResult.count} activated · source=${parsed.source} · cost $${selectionCostUsd.toFixed(4)}`,
        );
      } catch (err) {
        // Selection failure must not block — fall back to all matching skills.
        activatedSlugs = manifestResult.available.map((m) => m.slug);
        const msg = err instanceof Error ? err.message : String(err);
        notes.push(`Skill selection failed (${msg.slice(0, 200)}); activated all ${manifestResult.count} as fallback`);
      }
    }
  }

  const bodiesResult = await loadAgentSkillBodies(activatedSlugs);
  if (bodiesResult.loaded.length > 0) {
    notes.push(
      `Active playbooks loaded: ${bodiesResult.loaded.map((s) => s.slug).join(', ')} (${bodiesResult.totalChars} chars${bodiesResult.truncatedCount > 0 ? ` · ${bodiesResult.truncatedCount} truncated for budget` : ''})`,
    );
  }
  const block = composeActivePlaybooksBlock(bodiesResult.loaded);
  // The loaded bodies are what actually reach the model — activatedSlugs may
  // include a slug whose body failed to load. Report the loaded set as the
  // authoritative "did a genre engine arrive?" signal.
  return {
    block,
    activatedSlugs: bodiesResult.loaded.map((s) => s.slug),
    selectionCostUsd,
  };
}

function buildUserMessage(args: {
  storyboardAssetId: string;
  storyboardContent: string;
  activeSkillsBlock: string;
}): string {
  return [
    '# Task',
    `Review the storyboard below for READABILITY against the R01-R06 checks.`,
    `Storyboard asset id: ${args.storyboardAssetId}`,
    '',
    'The genre engine you judge against is defined in the Active Playbooks block.',
    'Interpret R01-R06 through that engine — do NOT impose any genre rule that is',
    'not present in the playbook.',
    '',
    '## Storyboard asset (raw markdown — read the fenced JSON shot list to validate)',
    '',
    '<storyboard>',
    args.storyboardContent,
    '</storyboard>',
    '',
    args.activeSkillsBlock,
    '',
    'Hard rules:',
    '- Output one markdown narrative and exactly one fenced JSON block at the end.',
    `- The JSON block must include storyboard_asset_id="${args.storyboardAssetId}".`,
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
    v === 'FAIL' ||
    v === 'HALT'
  ) {
    return v;
  }
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

export async function runCreativeReadabilityCritic(
  args: CREADRunArgs,
): Promise<CREADRunResult> {
  const { inputs, supabase } = args;

  const storyboard = await loadStoryboard(supabase, args.storyboardAssetId, inputs);
  const notes: string[] = [];

  const episodeLabel =
    (inputs.episode as { episode_code?: string } | undefined)?.episode_code ??
    inputs.episode_id;

  // ── Skill shelf — genre engine arrives here (or NOT, which is the HALT case).
  const shelf = await resolveActivePlaybooks({ inputs, episodeLabel, notes });

  // ── CRITICAL HALT RULE (skill-creation conflict rule). Zero genre playbooks
  // loaded (including genre=null) → return HALT WITHOUT the paid Anthropic call.
  // A readability critic with no genre engine cannot judge readability.
  if (shelf.activatedSlugs.length === 0) {
    const seriesGenre =
      typeof inputs.series_genre === 'string' ? inputs.series_genre : null;
    const diagnosis =
      `No genre readability playbook matched (series_genre=${JSON.stringify(seriesGenre)}). ` +
      'EXEC-CREAD has no genre engine to judge against and HALTs without calling the model. ' +
      'Likely cause: genre resolution returned null (series_id code↔uuid mismatch) or no ' +
      'readability-* skill lists this genre in applies_when. Director attention required.';
    notes.push(`HALT — ${diagnosis}`);
    const body: Record<string, unknown> = {
      verdict: 'HALT',
      storyboard_asset_id: storyboard.id,
      failed_checks: [{ check: 'GENRE_ENGINE', diagnosis }],
      passed_checks: [],
      acceptance_criteria: [],
    };
    const markdown = [
      `# Readability Critic — HALT`,
      '',
      `**Verdict:** HALT`,
      '',
      '## Summary',
      diagnosis,
      '',
      '```json',
      JSON.stringify(body, null, 2),
      '```',
    ].join('\n');
    return {
      markdown,
      body,
      costUsd: shelf.selectionCostUsd, // only the (skipped) selection step may have cost
      model: CREAD_MODEL,
      contract: CREAD_CONTRACT,
      verdict: 'HALT',
      storyboardAssetId: storyboard.id,
      acceptanceCriteria: [],
      failedChecks: [{ check: 'GENRE_ENGINE', diagnosis }],
      passedChecks: [],
      activePlaybooks: [],
      description: `Readability critic HALT (no genre playbook) · ${CREAD_CONTRACT}`,
      notes,
    };
  }

  const systemPrompt = await loadSystemPrompt();
  const userMessage = buildUserMessage({
    storyboardAssetId: storyboard.id,
    storyboardContent: storyboard.content,
    activeSkillsBlock: shelf.block,
  });

  let result: AnthropicTextResult;
  try {
    result = await generateAnthropicText({
      systemPrompt,
      userMessage,
      model: CREAD_MODEL,
      maxOutputTokens: CREAD_MAX_TOKENS,
      expectsJson: true,
    });
  } catch (err: unknown) {
    if (err instanceof AnthropicTextError) {
      throw new CreativeReadabilityCriticError(
        `Anthropic generation failed: ${err.message}`,
        err,
      );
    }
    throw err;
  }

  if (!result.body) {
    // Body absent — narrative without JSON. Surface markdown to Director but
    // verdict is UNKNOWN; the cap-aware applyCriticVerdict treats it as REVISE.
    notes.push('Critic returned no parseable JSON block — UNKNOWN verdict');
  }

  const totalCost = result.costUsd + shelf.selectionCostUsd;
  if (totalCost > CREAD_COST_CEILING_USD) {
    notes.push(
      `Cost overrun: $${totalCost.toFixed(4)} > ceiling $${CREAD_COST_CEILING_USD}`,
    );
  }

  const verdict = parseVerdict(result.body);
  const failedChecks = parseFailedChecks(result.body);
  const passedChecks = parseStringArray(result.body, 'passed_checks');
  const acceptanceCriteria = parseStringArray(result.body, 'acceptance_criteria');

  const description = [
    `Readability verdict ${verdict} · ${CREAD_CONTRACT} · ${CREAD_MODEL}`,
    `· playbooks ${shelf.activatedSlugs.join('+') || 'none'}`,
    `· ${failedChecks.length} failed`,
    `· ${passedChecks.length} passed`,
    `· cost $${totalCost.toFixed(4)}`,
  ].join(' ');

  return {
    markdown: result.markdown,
    body: result.body ?? {},
    costUsd: totalCost,
    model: result.model,
    contract: CREAD_CONTRACT,
    verdict,
    storyboardAssetId: storyboard.id,
    acceptanceCriteria,
    failedChecks,
    passedChecks,
    activePlaybooks: shelf.activatedSlugs,
    description,
    notes,
  };
}
