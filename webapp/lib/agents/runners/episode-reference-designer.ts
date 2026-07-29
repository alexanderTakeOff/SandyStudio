// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/runners/episode-reference-designer.ts
// EXEC-EREF as a decision-making LLM agent (Sprint «Дизайнер и Аниматор»,
// 2026-05-18). Replaces the legacy template-function flow inside
// `episode-references.ts` that hardcoded provider, size, and prompt template.
//
// Architectural contract per agents/exec/episode_reference_designer.md:
//   - Designer composes a Plan-asset (SPC-ref_plan-<shot_id>-vNN-DRAFT.md)
//     per shot, with markdown explanation + JSON block carrying all decisions
//     (provider / size / variants / continuity / prompt / negative).
//   - Plan goes through Critic (EXEC-EPREV) → Director approval → APPROVED.
//   - Only after APPROVED, the downstream execution step (existing
//     episode-references.ts adapted on Day 3) reads the Plan and calls the
//     actual image provider.
//
// This file is the DESIGNER PHASE ONLY. It does not call any image provider.
// It is a pure-cost Sonnet 4.6 LLM call (~$0.01-0.05 per Plan).
//
// Inputs (from runner.ts loadAgentInputs + event payload):
//   - episode_id (uuid)
//   - episode (episode_code, title_working, metadata.delivery_targets)
//   - upstream_assets: must include APPROVED STB-storyboard with the shot
//   - bible: SeriesBibleCanon loaded by bible-loader
//   - shotId from event payload — Designer plans ONE shot at a time, like
//     EXEC-VGEN per-shot fan-out
//   - revisionNote (optional) — when Critic returns REVISE
//
// Outputs (consumed by runner.ts case 'EXEC-EREF' Designer path):
//   - markdown: full Claude response (Director-facing explanation + JSON block)
//   - body: parsed Plan JSON (provider, size, variants, prompt, negative, ...)
//   - cost_usd, model: cost ledger
//   - description: one-line summary for asset.description column
//   - shotId, storyboardAssetId for metadata
// ──────────────────────────────────────────────────────────────────────────────

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../supabase/types.gen';
import {
  generateAnthropicText,
  AnthropicTextError,
  type AnthropicTextResult,
} from '../providers/anthropic-text';
import { formatBibleForPrompt, type SeriesBibleCanon } from '../bible-loader';
import {
  getStoryboardShotById,
  listStoryboardShots,
  listStoryboardShotsV2,
  type StoryboardShotV2,
} from '../../api/vgen-shot-helpers';
import type { AgentInputs } from '../types';
import {
  loadAnchorChainContext,
  readEpisodeImageConfig,
  type AnchorChainContext,
} from '../runner';
import {
  imageProviderAlias,
  type EpisodeImageConfig,
} from '@/lib/api/resolve-generation-params';
import { findApprovedAsset } from '../upstream';
import { resolveDeliveryTargets } from '../delivery-targets';

export const EREF_DESIGNER_CONTRACT = 'episode_reference_designer@v1';
export const EREF_DESIGNER_MODEL = 'claude-sonnet-4-6';
/** Output budget for the Designer Sonnet call.
 *
 *  History:
 *  - 6000 was the pre-TD-49 baseline — enough for legacy single-shot Plans
 *    with elaborate Bible canon injections.
 *  - TD-57 (2026-05-26): bumped to 12000 after live SH09 retry under TD-55
 *    hit `stop_reason=max_tokens` at 21243 chars output (~5300 tokens)
 *    without ever emitting the trailing JSON block. Root cause: TD-55 +
 *    P2.3 added four new user-message sections (Anchor Chain Context,
 *    Prior Anchors, Scene Master, Walking-Forward output requirement)
 *    which prompts Sonnet to write a much longer markdown narrative
 *    before reaching the mandatory JSON tail. 12000 gives 2x headroom;
 *    Sonnet's typical anchor-mode Plan output lands ~7-9K tokens. */
export const EREF_DESIGNER_MAX_TOKENS = 12000;
/** Per-Plan cost ceiling. Sonnet input-heavy Plans should land ~$0.02-0.05. */
export const EREF_DESIGNER_COST_CEILING_USD = 0.15;

/** Sprint-scope provider list (Director directive q1 2026-05-18 — gpt-image-2
 *  only until E22 baseline data; Flux deferred). The skill playbook may later
 *  extend this without code change. */
export const EREF_DESIGNER_PROVIDER_ALLOWLIST = ['gpt-image-2'] as const;

/** Size table per delivery_target — single source of truth lives in the
 *  provider layer (`lib/api/provider-capabilities.ts`), NOT in this agent's
 *  runner. Re-exported here for back-compat with existing importers. The
 *  Designer cites it in its prompt; the Critic V02 check validates against the
 *  same manifest (injected into its prompt). See provider-capabilities.ts for
 *  the gpt-image-2 bounds rationale. */
import { SIZE_BY_DELIVERY_TARGET } from '@/lib/api/provider-capabilities';
export { SIZE_BY_DELIVERY_TARGET };

export class EpisodeReferenceDesignerError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'EpisodeReferenceDesignerError';
  }
}

/**
 * TD-30 (2026-05-21): Find the latest APPROVED IMG-episode_ref for the given
 * episode whose stored `metadata.shot_reference.location_slug` matches the
 * shot's bible-locked location. Used by Designer to embed a 4th
 * scene_continuity anchor alongside identity/location/style, stabilising
 * spatial layout across shots in the same room.
 *
 * Returns the asset id of the most recently APPROVED matching asset, or
 * null when no prior shot in this location has been approved yet (first
 * shot in a new location for this episode).
 *
 * Exported as a test seam so the matching logic can be exercised against
 * a lightweight in-memory Supabase mock.
 */
export async function findLatestApprovedImgByLocation(
  supabase: SupabaseClient<Database>,
  episodeId: string,
  locationSlug: string,
): Promise<string | null> {
  if (!episodeId || !locationSlug) return null;
  const { data, error } = await supabase
    .from('assets')
    .select('id,file_type,status,metadata,created_at')
    .eq('episode_id', episodeId)
    .eq('status', 'APPROVED')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error || !data) return null;
  for (const row of data) {
    const ft = (row.file_type as string | null) ?? '';
    if (ft !== 'IMG-episode_ref' && !ft.startsWith('IMG-episode_ref')) continue;
    const meta = (row.metadata ?? null) as Record<string, unknown> | null;
    if (!meta) continue;
    const sr = meta.shot_reference as { location_slug?: unknown } | undefined;
    const slug = sr && typeof sr.location_slug === 'string' ? sr.location_slug : null;
    if (slug === locationSlug) {
      return String(row.id);
    }
  }
  return null;
}

/**
 * TD-33 (2026-05-22): Find the latest APPROVED IMG-episode_ref for a specific
 * upstream shot in this episode. Used by Designer to embed a temporal
 * continuity anchor — the previous shot's reference image — alongside any
 * spatial anchor. Designer LLM decides per shot whether to use it (q10c
 * Director ruling: scope is LLM's call; runner just supplies the candidate).
 *
 * Mirrors findLatestApprovedImgByLocation's shape: matches the asset row's
 * `metadata.shot_reference.shot_id` field. Returns the asset_id of the most
 * recently APPROVED matching row, or null when no APPROVED reference exists
 * for that shot yet.
 *
 * Exported as a test seam.
 */
export async function findLatestApprovedImgByShotId(
  supabase: SupabaseClient<Database>,
  episodeId: string,
  shotId: string,
): Promise<string | null> {
  if (!episodeId || !shotId) return null;
  const { data, error } = await supabase
    .from('assets')
    .select('id,file_type,status,metadata,created_at')
    .eq('episode_id', episodeId)
    .eq('status', 'APPROVED')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error || !data) return null;
  for (const row of data) {
    const ft = (row.file_type as string | null) ?? '';
    if (ft !== 'IMG-episode_ref' && !ft.startsWith('IMG-episode_ref')) continue;
    const meta = (row.metadata ?? null) as Record<string, unknown> | null;
    if (!meta) continue;
    const sr = meta.shot_reference as { shot_id?: unknown } | undefined;
    const id = sr && typeof sr.shot_id === 'string' ? sr.shot_id : null;
    if (id === shotId) {
      return String(row.id);
    }
  }
  return null;
}

/**
 * TD-33 (2026-05-22): Resolve the previous shot's id in narrative production
 * order from the storyboard asset content. Uses listStoryboardShots() which
 * already iterates acts → shots in declaration order and assigns globalIndex.
 * Returns null when the current shot is the first shot of the episode, or
 * when shotId can't be found in the storyboard at all.
 *
 * The Designer LLM (q10c) is responsible for deciding whether the previous
 * shot is a meaningful temporal anchor (same scene / character continuity)
 * or a hard cut / cutaway / flashback to skip. This helper only finds the
 * candidate; it does NOT filter by scene boundary.
 *
 * Exported as a test seam.
 */
export function getPreviousShotIdInSequence(
  stbContent: string,
  shotId: string,
): string | null {
  const shots = listStoryboardShots(stbContent);
  const idx = shots.findIndex((s) => s.shotId === shotId);
  if (idx <= 0) return null;
  return shots[idx - 1]?.shotId ?? null;
}

export interface EREFDesignerRunArgs {
  inputs: AgentInputs;
  shotId: string;
  /** Optional revision note from Director / Critic — propagated to user message. */
  revisionNote?: string;
  /**
   * TD-30 (2026-05-21): if set, Designer can query the assets table to find
   * a prior APPROVED IMG-episode_ref in the same location and embed it as a
   * scene_continuity anchor in the Plan JSON. When omitted, Designer leaves
   * `scene_continuity_anchor_asset_id` null (no spatial-continuity boost).
   */
  supabase?: SupabaseClient<Database>;
}

export interface EREFDesignerRunResult {
  markdown: string;
  /** Parsed JSON block from the LLM response (Plan payload). */
  body: Record<string, unknown>;
  costUsd: number;
  model: string;
  /** Which text engine produced the Plan — surfaces a Gemini-overload fallback. */
  provider: import('../providers/anthropic-text').AnthropicTextResult['provider'];
  contract: typeof EREF_DESIGNER_CONTRACT;
  shotId: string;
  storyboardAssetId: string | null;
  /** Resolved at runtime (episode override → series default → fallback). */
  deliveryTargets: readonly string[];
  description: string;
  notes: readonly string[];
}

interface UpstreamAssetLike {
  id?: string;
  file_type?: string | null;
  status?: string | null;
  content?: string | null;
  filename?: string | null;
}

interface EpisodeLike {
  /** TD-30: episode UUID — used by Designer to query prior APPROVED IMGs. */
  id?: string;
  episode_code?: string;
  title_working?: string | null;
  metadata?: unknown;
}

// In-process cache for the system prompt — read once per process.
// NOTE: editing the skill .md alone does NOT refresh this cache (it is keyed to
// process lifetime); a code edit here (HMR) or a server restart is required to
// reload it. 2026-06-15 — skill LAYOUT LOCK example de-leaked (was a hardcoded
// bedroom furniture list that the Designer copied into elevator plans, painting
// furniture into a bare cab); this touch busts the stale cache.
// 2026-06-20 (q15а) — .md LAYOUT LOCK block made spatial-kind aware: flat FIELD
// (spatial_layout=false) now SKIPS layout-lock/scene_master in single-ref mode
// (was leaking the scene_master preamble into empty_background plans). Gating
// moved to non-emitted prose; flat field uses a clean [Background] block (no
// trigger words). Also dropped the redundant layout_lock_directive from [Location]
// and the "floor" word from [Background]. This touch busts the stale cache.
let systemPromptCache: string | null = null;

async function loadSystemPrompt(): Promise<string> {
  if (systemPromptCache !== null) return systemPromptCache;
  const candidates = [
    path.resolve(process.cwd(), '../agents/exec/episode_reference_designer.md'),
    path.resolve(process.cwd(), 'agents/exec/episode_reference_designer.md'),
    path.resolve(process.cwd(), '../../agents/exec/episode_reference_designer.md'),
  ];
  for (const p of candidates) {
    try {
      const text = await fs.readFile(p, 'utf-8');
      systemPromptCache = text;
      return text;
    } catch {
      // try next candidate
    }
  }
  throw new EpisodeReferenceDesignerError(
    `Could not find agents/exec/episode_reference_designer.md from cwd=${process.cwd()} (tried ${candidates.length} paths)`,
  );
}

/** Reset the in-process system-prompt cache. Test-only seam — production
 *  code never calls this; the cache is intentionally process-lived. */
export function _resetSystemPromptCacheForTests(): void {
  systemPromptCache = null;
}

// F2 (2026-06-12): findApprovedAsset → shared newest-wins resolver
// (lib/agents/upstream.ts). The local copy here was an UNSORTED `.find()` —
// with two APPROVED storyboards (E07 SREV double-fire) the Designer read
// STB v1 while the Artist's sorted copy read v2 → SH03 mirror deadlock.

// resolveDeliveryTargets + readDeliveryTargetsFromMetadata now live in the shared
// leaf module lib/agents/delivery-targets.ts (one copy for every agent, no circular
// import). Re-exported here so existing importers (tests, Inngest wiring) keep the
// same import path.
export { resolveDeliveryTargets };

/**
 * TD-49 Phase 2 P2.3 (2026-05-25): read the episode-level opt-in flag
 * `anchor_chain_enabled` from `episodes.metadata`. When `true`, Designer
 * loads anchor-chain context and authors paired anchors per shot; when
 * false / absent, Designer falls back to legacy single-IMG mode.
 */
function readAnchorChainEnabled(meta: unknown): boolean {
  if (!meta || typeof meta !== 'object') return false;
  const m = meta as Record<string, unknown>;
  return m.anchor_chain_enabled === true;
}

/**
 * Words that name a time of day or a light source. Deliberately excludes bare
 * "dark" — in this series it overwhelmingly means "dark rubber-hose limbs", a
 * costume fact, not a light.
 */
const LIGHT_CUE_RE =
  /\b(night|nights|nighttime|midnight|dawn|dusk|twilight|sunrise|sunset|morning|afternoon|evening|noon|daylight|daytime|darkness|shadow|shadows|silhouette|silhouetted|lamp|lamplight|lamps|candle|candlelit|candlelight|moonlight|sunlight|firelight|torchlight|neon|backlit|unlit|dim|dims|dimly|glow|glows|glowing|lit)\b/i;

const MAX_LIGHT_EVIDENCE_LINES = 12;
const MAX_LIGHT_EVIDENCE_CHARS = 220;

/**
 * E33 fix (2026-07-29): collect every statement about time of day or light
 * source anywhere in the episode's storyboard.
 *
 * Two tiers, and the order is the point:
 *   1. DECLARED — `time_of_day` / `lighting_condition`, the machine-readable
 *      fields the storyboard contract now requires. Emitted verbatim, never
 *      gated by the cue regex: a declared field IS the statement.
 *   2. PROSE — sentences from sub_area / action_prose / continuity_notes that
 *      name a time of day or a light source. This was the only tier before the
 *      fields existed, and on E33 it fired on 2 shots out of 9: the other seven
 *      Plans were authored with an empty light input and each invented its own,
 *      the one furthest from the shots that spoke (SH07) taking its model's
 *      default ("top-lit cartoon ambient") and rendering a night scene as day.
 *      It stays as the fallback for boards authored before the fields existed.
 *
 * One episode is one lighting state, so every shot gets the whole episode's
 * evidence — a shot that says nothing inherits from the shots that do.
 */
export function collectSceneLightingEvidence(
  shots: readonly StoryboardShotV2[],
): string[] {
  const declared: string[] = [];
  const prose: string[] = [];
  for (const shot of shots) {
    const subArea =
      shot.location && typeof shot.location === 'object'
        ? shot.location.sub_area ?? null
        : null;
    // Tier 1 — the declared fields, verbatim and unfiltered.
    for (const [field, text] of [
      ['time_of_day', shot.time_of_day],
      ['lighting_condition', shot.lighting_condition],
    ] as const) {
      const s = text?.trim();
      if (!s) continue;
      declared.push(
        `- ${shot.shot_id} [DECLARED ${field}]: "${s.slice(0, MAX_LIGHT_EVIDENCE_CHARS)}"`,
      );
    }
    // Tier 2 — light spoken in prose.
    const proseFields: Array<[string, string | null | undefined]> = [
      ['sub_area', subArea],
      ['action_prose', shot.action_prose ?? shot.action ?? shot.key_beat],
      ['continuity_notes', shot.continuity_notes],
    ];
    for (const [field, text] of proseFields) {
      if (!text) continue;
      for (const sentence of text.split(/(?<=[.!?])\s+/)) {
        const s = sentence.trim();
        if (!s || !LIGHT_CUE_RE.test(s)) continue;
        prose.push(`- ${shot.shot_id} (${field}): "${s.slice(0, MAX_LIGHT_EVIDENCE_CHARS)}"`);
      }
    }
  }
  // Declared lines are never crowded out of the window by prose chatter.
  return [...declared, ...prose].slice(0, MAX_LIGHT_EVIDENCE_LINES);
}

/**
 * The light block. Its whole job is to put the scene's light ABOVE the light
 * baked into the reference plates: canon location plates are generated with
 * "neutral natural lighting" by design (bible-author) so one plate serves every
 * episode — which makes the plate a daylight-shaped anchor that a night scene
 * inherits unless the prompt says otherwise in words. Text beats the reference
 * image (proven on E33 SH07: the two Plans without the word "night" rendered
 * day; adding "NIGHT INTERIOR" made the same shot night), so the cure is to
 * guarantee the words are always there.
 */
export function buildSceneLightAuthorityBlock(evidence: readonly string[]): string {
  return [
    '## SCENE LIGHT — outranks every reference plate (HARD)',
    '',
    'Location and scene-master reference plates are rendered under NEUTRAL, EVEN',
    'lighting on purpose, so one plate can serve every episode. A plate fixes',
    'GEOMETRY, LAYOUT, SCALE and PALETTE. It carries NO information about this',
    "scene's time of day or light source: its even daylight is a rendering",
    'baseline for a reference card, never the light of this scene, and it must',
    'NOT be inherited into the frame.',
    '',
    'Authority over light, highest first:',
    "  1. THIS shot's DECLARED `time_of_day` + `lighting_condition` (in the <shot>",
    '     block). These are contract fields, not description — when present they',
    '     settle the question and nothing below may soften them;',
    "  2. THIS shot's own prose / sub_area / continuity_notes;",
    "  3. lighting stated ANYWHERE in this episode's storyboard (evidence below) —",
    '     one episode is one continuous lighting state unless a shot states a change;',
    '  4. the lighting states declared by the location canon;',
    '  5. nothing else. A reference plate is not a source of lighting authority.',
    '',
    "Lighting stated in this episode's storyboard:",
    evidence.length > 0
      ? evidence.join('\n')
      : '(none — no shot in this storyboard names a time of day or a light source)',
    '',
    'Your `## Промпт` MUST contain one explicit lighting sentence stating (a) the',
    'time of day, (b) the key light source and where it sits, (c) what the rest of',
    'the frame does (falls into shadow / stays lit). Write it so it overrides the',
    'attached plates, e.g. «NIGHT INTERIOR — the only light is the desk lamp at',
    "frame-right; the rest of the room falls into shadow. The location plate's even",
    'daylight does not apply.»',
    '',
    'If the evidence block above is empty, do NOT quietly fall back to daylight or',
    'to top-lit ambient — that default is exactly how a night scene renders as a day',
    'frame. Choose the light the action needs, state it, and record the choice in',
    '`policy_notes[]` as an assumption for the Director.',
    '',
    'BANNED — in the positive prompt AND in the negative list. This phrasing class',
    'erases the directional key light, and the night and the volume go with it:',
    '«no dramatic shadows», «no strong shadows», «even lighting», «evenly lit»,',
    '«flat lighting», «soft, quiet, even», «neutral natural lighting»,',
    '«no cinematic lighting». A soft cartoon style constrains the EDGE of a shadow',
    '(soft, graphic, inside the palette) — never its existence. Every frame keeps a',
    'named key light with a direction and a visible falloff.',
    '',
  ].join('\n');
}

function buildDeliveryTargetsTable(targets: readonly string[]): string {
  const rows = targets.map((slug) => {
    const dims = SIZE_BY_DELIVERY_TARGET[slug];
    if (!dims) return `  - ${slug}: (no size mapping — flag policy_note)`;
    return `  - ${slug}: ${dims.width}×${dims.height}`;
  });
  return rows.join('\n');
}

/**
 * TD-49 Phase 2 P2.3 (2026-05-25): compose the four user-message sections
 * activated when `episodes.metadata.anchor_chain_enabled === true`. Surfaces
 * adjacent shots, prior anchors, scene_master, and the explicit instruction
 * to emit an `anchor_pair` block in the Plan JSON.
 *
 * When the storyboard / shot is missing from context (loadAnchorChainContext
 * returned a partially-empty structure), we still emit the sections — the
 * Designer LLM sees the absence and either skips the anchor_pair block
 * (legacy fallback) or flags via policy_notes per the system prompt.
 */
function buildAnchorChainSections(
  ctx: AnchorChainContext,
  locationHasSpatialLayout: boolean,
): string {
  const adjacentPriorLine = ctx.adjacent_shots.prior
    ? `${ctx.adjacent_shots.prior.shotId} (role: ${ctx.adjacent_shots.prior.shotRole ?? 'unspecified'})`
    : '(none — current shot is first in narrative order)';
  const adjacentNextLine = ctx.adjacent_shots.next
    ? `${ctx.adjacent_shots.next.shotId} (role: ${ctx.adjacent_shots.next.shotRole ?? 'unspecified'})`
    : '(none — current shot is last in narrative order)';
  const priorAnchorsBlock =
    ctx.prior_anchors.length === 0
      ? '(none — this is the first shot whose anchors have been authored, or no anchors are APPROVED yet)'
      : ctx.prior_anchors
          .map(
            (a) =>
              `  - shot ${a.shotId} · side ${a.side} · asset_id ${a.asset_id}`,
          )
          .join('\n');
  const sceneMasterBlock = !locationHasSpatialLayout
    ? '(this location is a flat FIELD — `spatial_layout=false`. A master plate may exist but it fixes ONLY the background colour/texture, NOT a layout. Do NOT emit a LAYOUT LOCK or cite the master as a canonical layout. Author the anchor poses against the flat field + identity refs.)'
    : ctx.scene_master_asset
    ? [
        `  - asset_id: ${ctx.scene_master_asset.asset_id}`,
        `  - source: ${ctx.scene_master_asset.source} (${ctx.scene_master_asset.source === 'scene_master' ? 'preferred layout master' : 'fallback location asset'})`,
        `  - filename: ${ctx.scene_master_asset.filename ?? '(unknown)'}`,
      ].join('\n')
    : '(none — no SBL-scene_master_* nor LOCKED SBL-location_* for this shot location. Flag via policy_notes and skip anchor_pair authoring.)';

  return [
    '## Anchor Chain Context (TD-49 Phase 2 — anchor_chain_enabled=true)',
    '',
    `Total shots in episode: ${ctx.full_storyboard.length}`,
    `Current shot: ${ctx.current_shot?.shotId ?? '(unresolved)'}`,
    `Adjacent prior: ${adjacentPriorLine}`,
    `Adjacent next:  ${adjacentNextLine}`,
    '',
    '## Prior Anchors (APPROVED IMG-anchor_* from earlier shots, narrative order)',
    '',
    priorAnchorsBlock,
    '',
    '## Scene Master (layout reference for anchor pair generation)',
    '',
    sceneMasterBlock,
    '',
    '## Walking-Forward Anchor Pair Authoring — output requirement',
    '',
    'Because `anchor_chain_enabled=true` for this episode, your Plan JSON MUST include an `anchor_pair` block (schema below). Both `start` and `end` are optional fields inside the block — author both when both sides exist in the storyboard flow; author one side only when the other cannot exist (e.g. last shot of episode → no `end.role=shared` peer; first shot → `start.role=establishing` with no prior).',
    '',
    'For each side you author:',
    '  - `role` MUST be from the enum (start: establishing|shared|cut_in; end: shared|cut_out|final).',
    '  - `handoff_link_to_shot_id` MUST be the full shot_id of the paired shot when `role=shared`, otherwise `null`.',
    locationHasSpatialLayout
      ? '  - `prompt` MUST include a LAYOUT LOCK preamble citing scene_master as the canonical layout, plus camera intent and character pose for THIS anchor moment.'
      : '  - `prompt` MUST NOT emit a LAYOUT LOCK or cite a layout master — this location is a flat FIELD with no layout to lock. State only that the background is a flat field of the canonical colour, plus camera intent and character pose for THIS anchor moment.',
    '  - `rationale` is one sentence explaining the role choice.',
    '',
    'If `scene_master_asset` above is null, emit a `canon_extension_proposed` rationale in `policy_notes` and OMIT the `anchor_pair` block entirely — do not fabricate anchors against an unset master.',
    '',
  ].join('\n');
}

/**
 * Slice 2 — episode IMAGE FORMAT authority block. When the episode declares
 * `generation_config.image`, surface its provider (translated to the plan-alias
 * the allowlist speaks) + quality so the Designer authors WITHIN the episode's
 * binding format. Image has no `allow_shot_overrides` flag → the episode is
 * unconditionally authoritative when present. SIZE is NOT included — it stays
 * delivery-target-derived. Quality is enforced at render (the EREF executor) —
 * the Plan must NOT author a quality field. Returns '' for an un-configured
 * episode → legacy prompt byte-for-byte. Mirror of the video animator block.
 */
export function buildEpisodeImageFormatAuthorityBlock(cfg: EpisodeImageConfig | null): string {
  if (!cfg || (!cfg.provider_id && !cfg.quality)) return '';
  const lines: string[] = [
    '## Episode IMAGE FORMAT authority (single source of truth)',
    '',
    'This episode declares a binding image FORMAT in its settings. It is',
    'EPISODE-AUTHORITATIVE — author the Plan to match it (image has no per-shot',
    'override). The executor enforces these at render regardless.',
  ];
  if (cfg.provider_id) {
    lines.push(`  - provider: ${imageProviderAlias(cfg.provider_id)} (choose this; justify in provider.rationale)`);
  }
  if (cfg.quality) {
    lines.push(`  - quality: ${cfg.quality} — enforced at render; do NOT author a quality field in the Plan JSON.`);
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * Compose the user message handed to the Designer LLM. Self-contained: every
 * decision the agent needs is in this string. The system prompt
 * (episode_reference_designer.md) tells the agent how to think; the user
 * message tells it about THIS shot.
 */
function buildUserMessage(args: {
  episodeCode: string;
  episodeTitle: string;
  shotId: string;
  shot: StoryboardShotV2;
  /**
   * Narrative context (Director 2026-07-17): the immediately prior and next
   * shots in narrative order, full prose. The Designer authors ONE shot but
   * must know the beat around it — SH05's "launch" is the payoff of SH04's
   * "foot sinks", and without the neighbours the Designer plans blind and can
   * drift (a move that started left continuing right). These are REASONING
   * context to get THIS shot's plan right — never rendered into the image.
   */
  prevShot?: StoryboardShotV2 | null;
  nextShot?: StoryboardShotV2 | null;
  bible: SeriesBibleCanon;
  deliveryTargets: readonly string[];
  priorPlanVersion: number | null;
  revisionNote?: string;
  /** TD-30: prior APPROVED IMG-episode_ref in same location, or null when first shot. */
  priorSceneContinuityAnchorAssetId?: string | null;
  /** TD-30: bible-locked location slug for this shot — surfaced so Designer can reason. */
  locationSlug?: string | null;
  /**
   * q10 (2026-06-20): does this location have a persistent spatial layout to
   * lock? Default true (a SET). False for a flat FIELD (empty_background, void)
   * declared `spatial_layout=false` in canon. Drives whether LAYOUT LOCK /
   * standing objects / spatial anchor apply — one axis, no per-slug branches.
   */
  locationHasSpatialLayout?: boolean;
  /**
   * TD-30: true iff caller actually performed the lookup (supabase present
   * AND locationSlug resolvable). False → Designer should NOT claim "first
   * shot in location" because we never checked — Plan must mark the field
   * null with a policy_note instead.
   */
  sceneContinuityLookupPerformed?: boolean;
  /** TD-33: previous shot in narrative order, or null when SH01 / not found. */
  previousShotId?: string | null;
  /** TD-33: APPROVED IMG-episode_ref for the previous shot, or null when not yet approved. */
  priorTemporalAnchorAssetId?: string | null;
  /** TD-33: true iff temporal lookup actually executed. False → Designer leaves the temporal entry off. */
  temporalAnchorLookupPerformed?: boolean;
  /** TD-49 Phase 2 P2.3 (2026-05-25): shot-scoped anchor chain context. Present
   *  iff `episodes.metadata.anchor_chain_enabled === true` AND a supabase
   *  client was passed to the runner. Drives the four new prompt sections +
   *  the anchor_pair block expectation in the JSON output. */
  anchorChainContext?: AnchorChainContext | null;
  /** Slice 2: pre-rendered episode IMAGE FORMAT authority block (or '' when the
   *  episode declares no image config). */
  episodeImageFormatBlock?: string;
  /** E33: pre-rendered SCENE LIGHT authority block — the scene's light over the
   *  reference plate's neutral light. Always present. */
  sceneLightBlock: string;
}): string {
  const {
    episodeCode,
    episodeTitle,
    shotId,
    shot,
    prevShot,
    nextShot,
    bible,
    deliveryTargets,
    priorPlanVersion,
    revisionNote,
    priorSceneContinuityAnchorAssetId,
    locationSlug,
    locationHasSpatialLayout = true,
    sceneContinuityLookupPerformed,
    previousShotId,
    priorTemporalAnchorAssetId,
    temporalAnchorLookupPerformed,
    anchorChainContext,
    episodeImageFormatBlock,
    sceneLightBlock,
  } = args;

  const biblePromptBlock = formatBibleForPrompt(bible);
  const hasCanon = bible.total_entries > 0 || bible.general_idea !== null;

  const presentCharacterSlugs = new Set<string>();
  if (Array.isArray(shot.characters)) {
    for (const c of shot.characters) {
      if (c.bible_slug) presentCharacterSlugs.add(c.bible_slug);
    }
  }
  if (Array.isArray(shot.characters_present)) {
    for (const slug of shot.characters_present) {
      if (typeof slug === 'string' && slug) presentCharacterSlugs.add(slug);
    }
  }

  const presentList =
    presentCharacterSlugs.size > 0
      ? Array.from(presentCharacterSlugs).join(', ')
      : '(none — establishing / object shot)';

  const subArea =
    shot.location && typeof shot.location === 'object'
      ? shot.location.sub_area ?? null
      : null;

  const planVersionLabel =
    priorPlanVersion !== null && priorPlanVersion > 0
      ? `v${String(priorPlanVersion + 1).padStart(2, '0')}`
      : 'v01';

  return [
    '# Task',
    `Design the reference image generation plan for shot ${shotId} of episode ${episodeCode} — "${episodeTitle}".`,
    `Target Plan version: ${planVersionLabel}.`,
    '',
    '## Storyboard shot (canonical input — from APPROVED STB)',
    '',
    '<shot>',
    `shot_id: ${shot.shot_id}`,
    `shot_role: ${shot.shot_role ?? '(unspecified)'}`,
    `camera_angle: ${shot.camera_angle ?? '(unspecified)'}`,
    `duration_seconds: ${shot.duration_seconds ?? '(unspecified)'}`,
    // E33: sub_area + continuity_notes were parsed off the board and then
    // dropped here. sub_area is where the storyboarder actually wrote the light
    // ("…warm lamplight pool"), and continuity_notes is where "must match the
    // prior shot — pose, prop state, lighting" lives. Withholding both from the
    // Designer is how a night scene arrives with no light input at all.
    `sub_area: ${subArea ?? '(unspecified)'}`,
    // The two contract fields for light (storyboarder@v2, 2026-07-29). They are
    // authored and validated upstream; until now nothing read them here, so the
    // scene's light reached the Designer only if it happened to be spoken in
    // prose. Authority order is spelled out in the SCENE LIGHT block below.
    `time_of_day: ${shot.time_of_day ?? '(not declared — derive from the SCENE LIGHT evidence below)'}`,
    `lighting_condition: ${shot.lighting_condition ?? '(not declared — derive from the SCENE LIGHT evidence below)'}`,
    `action_prose: ${shot.action_prose ?? shot.action ?? shot.key_beat ?? '(unspecified)'}`,
    `continuity_notes: ${shot.continuity_notes ?? '(none)'}`,
    // The canon props the executor WILL attach as LOCKED reference images. Shown
    // so the prompt describes them as canon rather than inventing them; the
    // Designer does not restate this list in the Plan (the executor reads it off
    // the storyboard itself).
    `props_in_frame (canon props auto-attached at render): ${
      shot.props_in_frame && shot.props_in_frame.length > 0
        ? shot.props_in_frame.join(', ')
        : '(none)'
    }`,
    `expected_gag: ${shot.expected_gag ?? '(none)'}`,
    `expected_emotion: ${shot.expected_emotion ?? '(none)'}`,
    `characters_present: ${presentList}`,
    '</shot>',
    '',
    '## Narrative context — neighbouring shots (reasoning only, DO NOT render)',
    '',
    'These are the shots immediately before and after THIS one, in narrative',
    'order. Use them ONLY to understand the beat you are drawing — what state the',
    'scene arrives in, and where it goes next — so THIS reference stays continuous',
    '(a pose, direction, or prop that the prior shot set up must not contradict).',
    'Do NOT draw the neighbours\' content into this image; render ONLY the shot',
    'above. If a neighbour is "(none)", this shot is at that end of the episode.',
    '',
    prevShot
      ? [
          `PREVIOUS (${prevShot.shot_id}, role ${prevShot.shot_role ?? 'unspecified'}):`,
          `  action_prose: ${prevShot.action_prose ?? prevShot.action ?? prevShot.key_beat ?? '(unspecified)'}`,
          `  expected_gag: ${prevShot.expected_gag ?? '(none)'}`,
        ].join('\n')
      : 'PREVIOUS: (none — this is the first shot of the episode)',
    nextShot
      ? [
          `NEXT (${nextShot.shot_id}, role ${nextShot.shot_role ?? 'unspecified'}):`,
          `  action_prose: ${nextShot.action_prose ?? nextShot.action ?? nextShot.key_beat ?? '(unspecified)'}`,
          `  expected_gag: ${nextShot.expected_gag ?? '(none)'}`,
        ].join('\n')
      : 'NEXT: (none — this is the last shot of the episode)',
    '',
    sceneLightBlock,
    '## Series Bible canon',
    '',
    hasCanon
      ? biblePromptBlock
      : [
          'No LOCKED Series Bible entries exist for this series yet. Proceed using ONLY the shot data above. Do not invent series-level canon (no character backstories, no world rules) beyond what the shot states. List each MVP assumption you make in the Plan JSON `policy_notes[]`.',
        ].join('\n'),
    '',
    '## Delivery targets (drives size + aspect decisions)',
    '',
    deliveryTargets.length > 0
      ? `Active targets and their canonical sizes:\n${buildDeliveryTargetsTable(deliveryTargets)}`
      : 'No delivery targets resolved — fallback to youtube_landscape (1536×1024).',
    '',
    episodeImageFormatBlock ? episodeImageFormatBlock : '',
    '## Provider sprint-scope',
    '',
    `Provider allowlist for this sprint (Director directive 2026-05-18): ${EREF_DESIGNER_PROVIDER_ALLOWLIST.join(', ')}. Do not select any other provider. Justify the choice from this list in provider.rationale.`,
    '',
    '## Continuity anchors (TD-30 spatial + TD-33 temporal — 2026-05-22)',
    '',
    'Two independent anchor axes can be declared in `continuity_anchors[]`. Each entry is a `{kind, asset_id, resolved_at}` object. Use ONLY the kinds listed below. Anchor entries are advisory references the executor will pass into the multi-image-edit call alongside identity / location / style — stronger anchors = tighter continuity but less prompt freedom. Choose deliberately per shot, not by default.',
    '',
    '### Spatial anchor — `kind: spatial_same_location`',
    '',
    !sceneContinuityLookupPerformed
      ? 'Spatial-continuity lookup was NOT performed in this runner invocation (no DB access). Do NOT emit a `spatial_same_location` anchor; add a policy_note flagging the absent lookup.'
      : !locationHasSpatialLayout
        ? 'This location is a flat FIELD — NO persistent spatial layout / set-dressing (declared `spatial_layout=false` in canon). Do NOT emit a `spatial_same_location` anchor: there is nothing spatial to stabilise, and anchoring on a prior shot would copy that frame\'s incidental composition (any furniture/room) forward and propagate it. Each shot is generated fresh against the flat field + identity refs only.'
      : locationSlug
        ? priorSceneContinuityAnchorAssetId
          ? `A prior APPROVED IMG-episode_ref in location \`${locationSlug}\` exists for this episode (asset_id: \`${priorSceneContinuityAnchorAssetId}\`, lookup_at: now). When continuity_strategy.mode = openai-edits-multi, append an entry \`{"kind":"spatial_same_location","asset_id":"${priorSceneContinuityAnchorAssetId}","resolved_at":"<lookup ISO timestamp>"}\` to \`continuity_anchors\`. Stabilises spatial layout (furniture, set dressing) across shots in the same room.`
          : `This is the FIRST shot in location \`${locationSlug}\` for this episode — no prior APPROVED reference to anchor on. Do not emit a spatial anchor.`
        : 'Shot has no resolvable bible-locked location slug — do not emit a spatial anchor.',
    '',
    '### Temporal anchor — `kind: temporal_previous_shot`',
    '',
    !temporalAnchorLookupPerformed
      ? 'Temporal-continuity lookup was NOT performed in this runner invocation. Do NOT emit a `temporal_previous_shot` anchor; add a policy_note flagging the absent lookup.'
      : previousShotId
        ? priorTemporalAnchorAssetId
          ? `The previous shot in narrative order is \`${previousShotId}\` and its APPROVED reference image exists (asset_id: \`${priorTemporalAnchorAssetId}\`). You MAY emit \`{"kind":"temporal_previous_shot","asset_id":"${priorTemporalAnchorAssetId}","resolved_at":"<lookup ISO timestamp>"}\` to carry forward visible state changes (props introduced, costume marks, lighting beats, character pose continuity). USE THIS WHEN: a) the previous shot is in the same scene with continuous time; b) characters and key props overlap; c) a beat from the previous shot must visibly survive (e.g. wall hole from prior gag, broken cup on table, blood smear). DO NOT emit when: a) hard cut to a new scene/location; b) a cutaway, flashback, or POV switch; c) no character or prop overlap; d) the previous shot is itself an establishing wide where carrying detail forward would over-constrain the new framing.`
          : `The previous shot in narrative order is \`${previousShotId}\` but it has no APPROVED IMG-episode_ref yet. Do not emit a temporal anchor.`
        : 'This shot is the first shot of the episode (no narrative predecessor). Do not emit a temporal anchor.',
    '',
    'Note: `continuity_anchors` can be `[]` (no anchors), have one entry of either kind, or have both. Order spatial first, temporal second when both are present (executor uses this order to slot them into the multi-image ref array).',
    '',
    revisionNote
      ? [
          '## Revision request from Critic / Director — HARD ACCEPTANCE CRITERIA',
          '',
          revisionNote,
          '',
          'Treat each item above as a HARD CONTRACT, not a hint. The new Plan must visibly differ from the prior version in at least the dimensions flagged. Do not "minimally tweak" a previously rejected decision — re-derive it from inputs. Before finalising output, self-validate against the criteria. If any criterion fails, fix it in the same response.',
          '',
        ].join('\n')
      : '',
    // q10 (2026-06-20): FLAT-FIELD location override. A location declared
    // `spatial_layout=false` in canon (empty_background, void, colour cyclorama)
    // has NO persistent geometry — nothing to LAYOUT LOCK. The designer LLM
    // otherwise mis-classifies gag furniture (shelf/rug/bed) as LOCKED standing
    // set-dressing → the image renders a whole room. On a field nothing persists:
    // every visible object is a TRANSIENT per-shot prop. Driven by the one
    // location-kind axis — a SET (room/elevator/street) keeps LAYOUT LOCK and
    // never enters this branch.
    !locationHasSpatialLayout
      ? [
          '## FLAT-FIELD LOCATION OVERRIDE (HARD) — no standing objects, no layout to lock',
          '',
          "This shot's location is a flat, uniform FIELD with ZERO canonical standing objects and no environment geometry (declared `spatial_layout=false`). Do NOT emit a LAYOUT LOCK and do NOT cite any master as a layout — there is no layout, only a background colour/texture. Do NOT enumerate any furniture, set-dressing, or location object as locked/standing — not even if the storyboard lists props. EVERY object visible in this shot (a closet, bookshelf, rug, bench, umbrella, etc.) is a TRANSIENT per-shot prop that the action introduces for THIS shot only: list such items as transient props, NEVER as locked standing objects, and expect them gone next shot (no continuity drift). The background stays a clean flat field of the canonical colour — no room, no walls, no floor line, no horizon, no persistent furniture.",
          '',
        ].join('\n')
      : '',
    anchorChainContext ? buildAnchorChainSections(anchorChainContext, locationHasSpatialLayout) : '',
    '## Output format',
    '',
    'Respond in markdown with this structure:',
    '',
    '```',
    '# Reference Plan — <shot_id> · v<NN>',
    '',
    '## Цель шота',
    '<one sentence — what this reference image needs to anchor for downstream VGEN>',
    '',
    '## Решения',
    '- Provider: <id> — <one-sentence rationale>',
    '- Size: <W>×<H> for <delivery_target> — <one-sentence rationale>',
    '- Variants: <N> — <rationale: pilot/fanout/retry mode>',
    '- Continuity: <openai-edits-multi | openai-edits-single | openai-image> — <which anchors>',
    '- Camera intent: <one-sentence camera direction + sub_area variation rationale>',
    '',
    '## Промпт',
    '<full structured prompt — smart-canon B per Director directive: structured Bible',
    'sections (physical_anchors / costume / current_mood for characters, geographic_anchor /',
    'sub_area / lighting for location), full action_prose (NOT truncated to first sentence),',
    'explicit camera direction, Bible style canon verbatim, gag/beat sentence if applicable. Do NOT',
    'write character identity as novel-prose. Use structured sections so the model sees structure.>',
    '',
    '## Negative',
    '- no extra limbs',
    '- no face morphing',
    '- no costume changes',
    '- no text or logos',
    '- no on-screen captions',
    '- <any episode-specific additions from running negative list>',
    '',
    '## Стоимость / время',
    'Estimated cost: $<X.XX> · estimated time: ~<N>s',
    '```',
    '',
    'Then, at the very end, append exactly one fenced JSON code block with this shape:',
    '',
    '```json',
    '{',
    `  "shot_id": "${shotId}",`,
    '  "plan_version": "<v01 | v02 | ...>",',
    `  "delivery_targets": [${deliveryTargets.map((t) => `"${t}"`).join(', ')}],`,
    '  "provider": {',
    '    "id": "<one of the allowlist>",',
    '    "rationale": "<1-2 sentences>"',
    '  },',
    '  "size": {',
    '    "width": <int>,',
    '    "height": <int>,',
    '    "rationale": "<one sentence linking size to delivery_target>"',
    '  },',
    '  "variants": {',
    '    "count": <int>,',
    '    "rationale": "<pilot|fanout|retry — and why>"',
    '  },',
    '  "continuity_strategy": {',
    '    "mode": "<openai-edits-multi | openai-edits-single | openai-image>",',
    '    "anchor_assets": ["<bible character/location slug>", ...],',
    '    "rationale": "<one sentence>"',
    '  },',
    '  "continuity_anchors": [',
    '    <zero or more entries — each {"kind":"spatial_same_location"|"temporal_previous_shot","asset_id":"<asset_id>","resolved_at":"<ISO-8601 timestamp>"}. Spatial first, temporal second when both present. Use [] when no anchors apply. Emit as valid JSON — no inline comments inside the array.>',
    '  ],',
    '  "prompt": "<full prompt text — same as Промпт section above, machine-readable>",',
    '  "negative": ["<term>", "<term>", ...],',
    // `objects` was authored HERE by the model, told to "copy props_in_frame
    // verbatim" — a deterministic list-copy handed to a generative model, from a
    // field the model was never even shown. It came back empty on 5 of 9 E33
    // shots (P1 #12), so the canon prop images were not attached and the props
    // were drawn from scratch. The executor now reads props_in_frame off the
    // storyboard directly; the Plan does not restate it.
    '  "camera_intent": {',
    '    "angle": "<MEDIUM | WIDE | CLOSE | ...>",',
    '    "sub_area_variation": "<one sentence on viewpoint variation vs sibling shots>"',
    '  },',
    '  "frame_role": "start",',
    anchorChainContext
      ? [
          '  "anchor_pair": {',
          '    "start": {',
          '      "role": "<establishing | shared | cut_in>",',
          '      "handoff_link_to_shot_id": "<full shot_id of prior shot> | null",',
          '      "prompt": "<anchor preamble per the Scene Master guidance above + camera intent + character pose for start anchor>",',
          '      "rationale": "<one sentence>"',
          '    },',
          '    "end": {',
          '      "role": "<shared | cut_out | final>",',
          '      "handoff_link_to_shot_id": "<full shot_id of next shot> | null",',
          '      "prompt": "<anchor preamble per the Scene Master guidance above + camera intent + character pose for end anchor>",',
          '      "rationale": "<one sentence>"',
          '    }',
          '  },',
          '  // Omit anchor_pair entirely if scene_master_asset is null. Both sides',
          '  // are optional inside the block — author start only, end only, or both.',
        ].join('\n')
      : '',
    '  "estimated_cost_usd": <number>,',
    '  "policy_notes": ["<any MVP fallback / missing-canon flag>"]',
    '}',
    '```',
    '',
    'Hard rules:',
    `- provider.id MUST be in: ${EREF_DESIGNER_PROVIDER_ALLOWLIST.join(', ')}`,
    `- size.width / size.height MUST match the SIZE_BY_DELIVERY_TARGET table for the primary delivery_target`,
    '- The fenced JSON must be valid JSON. No trailing commas. No comments.',
    '- KEEP THE MARKDOWN TIGHT. The JSON block at the end is MANDATORY and must not be truncated. If you find yourself running long, shorten markdown narrative — never skip the JSON.',
    '- DO NOT call any provider. You only write the Plan. Execution happens downstream after Director approves the Plan.',
    "- START FRAME RULE (critical): the reference you design is the shot's FIRST frame — the video is generated FORWARD from it. Depict the OPENING pose/moment of the shot's action (where it BEGINS), NEVER its climax or final settle. If the beat is 'Sandy turns FROM the perfume and walks to the far-left table', the reference shows Sandy AT/NEAR the perfume at the START (about to move); the outward motion + arrival are carried by the video prompt, not baked as a finished end-state. A ref that depicts the ENDING makes the video animate backwards. Keep frame_role='start' (two-frame end-conditioning is a future capability).",
    anchorChainContext
      ? '- ANCHOR MODE ACTIVE — anchor_pair block MUST be included unless scene_master_asset is null. role enum + reciprocity rules are HARD; Critic will REJECT mismatches.'
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Run the Episode Reference Designer for one shot.
 *
 * Preconditions (caller — typically Inngest function — must ensure):
 *   - inputs.upstream_assets contains APPROVED STB-storyboard whose content
 *     parses to the requested shotId
 *   - inputs.bible is loaded (may be empty canon — Designer handles gracefully)
 *   - args.shotId is non-empty
 *   - inputs.episode.metadata or inputs.series_delivery_targets resolves to
 *     at least one delivery_target (else falls back to youtube_landscape)
 */
export async function runEpisodeReferenceDesigner(
  args: EREFDesignerRunArgs,
): Promise<EREFDesignerRunResult> {
  const { inputs, shotId, revisionNote, supabase } = args;
  if (!shotId || typeof shotId !== 'string') {
    throw new EpisodeReferenceDesignerError('shotId is required');
  }

  const ep = inputs.episode as EpisodeLike | undefined;
  const episodeCode = ep?.episode_code ?? 'UNKNOWN';
  const episodeTitle = ep?.title_working ?? 'Untitled';

  const upstream = inputs.upstream_assets as
    | readonly UpstreamAssetLike[]
    | undefined;
  const stbAsset = findApprovedAsset(upstream, 'STB-storyboard');
  if (!stbAsset?.content) {
    throw new EpisodeReferenceDesignerError(
      `Precondition failed: APPROVED STB-storyboard with non-empty content not found in upstream_assets`,
    );
  }
  const shot = getStoryboardShotById(stbAsset.content, shotId);
  if (!shot) {
    throw new EpisodeReferenceDesignerError(
      `Precondition failed: shotId="${shotId}" not found in STB asset ${stbAsset.id ?? '(no id)'}`,
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

  const deliveryTargets = resolveDeliveryTargets({
    episodeMetadata: ep?.metadata,
    seriesDeliveryTargets:
      (inputs.series_delivery_targets as readonly string[] | undefined) ?? null,
  });

  const priorPlanVersion =
    typeof inputs.prior_plan_version === 'number'
      ? inputs.prior_plan_version
      : null;

  const notes: string[] = [];
  if (bible.total_entries === 0 && !bible.general_idea) {
    notes.push('Series Bible empty — Designer operating in MVP mode');
  } else {
    notes.push(
      `Bible canon: ${bible.characters.length} chars · ${bible.locations.length} locs · ${bible.styles.length} styles`,
    );
  }
  notes.push(`Delivery targets: ${deliveryTargets.join(', ')}`);
  if (revisionNote) notes.push('Revision-note loop iteration');

  // TD-30 (2026-05-21): resolve scene-continuity anchor BEFORE composing the
  // user message. Designer needs to know (a) what location this shot is in
  // (b) whether a prior APPROVED IMG-episode_ref exists in that location.
  // Caller must pass `supabase` to enable the lookup; otherwise we skip
  // gracefully (returns null → Designer leaves the field null in JSON).
  let locationSlug: string | null = null;
  const shotLocation = (shot as { location?: unknown }).location;
  if (typeof shotLocation === 'string') {
    locationSlug = shotLocation;
  } else if (shotLocation && typeof shotLocation === 'object') {
    const slug = (shotLocation as { slug?: unknown }).slug;
    if (typeof slug === 'string' && slug.length > 0) locationSlug = slug;
  }
  let priorSceneContinuityAnchorAssetId: string | null = null;
  let sceneContinuityLookupPerformed = false;
  // TD-33: temporal anchor — previous shot in narrative production order.
  // Designer LLM decides whether to actually emit it (q10c — same scene,
  // hard cut, cutaway are all up to the LLM's judgment with prompt guidance).
  const previousShotId = getPreviousShotIdInSequence(stbAsset.content, shotId);
  let priorTemporalAnchorAssetId: string | null = null;
  let temporalAnchorLookupPerformed = false;
  const episodeIdResolved = (() => {
    const v = (ep as { id?: unknown } | undefined)?.id;
    return typeof v === 'string' && v.length > 0 ? v : null;
  })();
  if (supabase && episodeIdResolved) {
    // Run spatial + temporal lookups in parallel — both target the assets
    // table and are independent.
    const spatialPromise = locationSlug
      ? findLatestApprovedImgByLocation(supabase, episodeIdResolved, locationSlug)
      : Promise.resolve(null);
    const temporalPromise = previousShotId
      ? findLatestApprovedImgByShotId(supabase, episodeIdResolved, previousShotId)
      : Promise.resolve(null);
    const [spatialResult, temporalResult] = await Promise.all([
      spatialPromise,
      temporalPromise,
    ]);
    if (locationSlug) {
      sceneContinuityLookupPerformed = true;
      priorSceneContinuityAnchorAssetId = spatialResult;
      if (spatialResult) {
        notes.push(
          `Spatial continuity anchor candidate: ${spatialResult} (location=${locationSlug})`,
        );
      } else {
        notes.push(`Spatial continuity: first shot in location=${locationSlug}`);
      }
    }
    // We ran the temporal "lookup logic" — even SH01 with no predecessor is
    // a definitive answer, not "we didn't check". Designer must know which
    // case it's in: lookup-not-performed (skip silently), no-predecessor
    // (don't emit anchor), or predecessor-without-approved-img (also skip).
    temporalAnchorLookupPerformed = true;
    if (previousShotId) {
      priorTemporalAnchorAssetId = temporalResult;
      if (temporalResult) {
        notes.push(
          `Temporal continuity anchor candidate: ${temporalResult} (prev_shot=${previousShotId})`,
        );
      } else {
        notes.push(
          `Temporal continuity: previous shot ${previousShotId} has no APPROVED reference yet`,
        );
      }
    } else {
      notes.push('Temporal continuity: first shot of episode (no predecessor)');
    }
  }

  // q10 (2026-06-20): does this location HAVE a spatial layout to lock? This is
  // the one axis that governs LAYOUT LOCK / standing objects / spatial anchor —
  // replacing the hardcoded `empty_background` slug-check (which would sprawl a
  // new branch per flat background). Default TRUE: a SET (bedroom, elevator,
  // street) has persistent geometry → LAYOUT LOCK is meaningful, behaves exactly
  // as before. A flat FIELD (empty_background, void, colour cyclorama) declares
  // `metadata.spatial_layout === false` on its canon plate → nothing to lock.
  // Default-true means every existing location is unaffected; only declared
  // fields opt out. New flat backgrounds = declare once in canon, zero code.
  let locationHasSpatialLayout = true;
  if (supabase && locationSlug) {
    const { data: locRow } = await supabase
      .from('assets')
      .select('metadata')
      .eq('file_type', `SBL-location_${locationSlug}`)
      .order('created_at', { ascending: false })
      .limit(1);
    const lm = (locRow?.[0]?.metadata ?? null) as { spatial_layout?: unknown } | null;
    if (lm?.spatial_layout === false) locationHasSpatialLayout = false;
  }
  notes.push(
    `Location kind: ${locationHasSpatialLayout ? 'SET (layout-lockable)' : 'FIELD (no layout to lock)'} — ${locationSlug ?? 'unresolved'}`,
  );

  // TD-49 Phase 2 P2.3 (2026-05-25): shot-scoped anchor chain context. Loaded
  // only when the episode is opted in via `episodes.metadata.anchor_chain_enabled`.
  // The four context blocks (full_storyboard, current_shot+adjacent, prior_anchors,
  // scene_master_asset) drive the Designer's anchor_pair authoring. When the
  // flag is off, this stays null and buildUserMessage skips the anchor sections.
  let anchorChainContext: AnchorChainContext | null = null;
  const anchorChainEnabled = readAnchorChainEnabled(ep?.metadata);
  if (anchorChainEnabled && supabase && episodeIdResolved) {
    try {
      anchorChainContext = await loadAnchorChainContext({
        supabase,
        episodeId: episodeIdResolved,
        shotId,
      });
      notes.push(
        `Anchor chain context: ${anchorChainContext.full_storyboard.length} shots, ${anchorChainContext.prior_anchors.length} prior anchors, scene_master ${anchorChainContext.scene_master_asset ? 'present' : 'absent'}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      notes.push(`Anchor chain context load failed (${msg.slice(0, 100)}) — falling back to legacy mode`);
      anchorChainContext = null;
    }
  } else if (anchorChainEnabled) {
    notes.push(
      'Anchor chain enabled but supabase/episodeId unavailable — Designer skips anchor_pair authoring',
    );
  }

  // Narrative neighbours (Director 2026-07-17): full prose of the prior + next
  // shot in narrative order, from the SAME storyboard already in hand. Gives the
  // Designer the beat around the shot it authors so continuity doesn't drift.
  // Independent of anchor_chain (a different, pixel-stitch mode we don't use).
  const orderedShotIds = listStoryboardShots(stbAsset.content).map((s) => s.shotId);
  const currentIdx = orderedShotIds.indexOf(shotId);
  const prevShot =
    currentIdx > 0
      ? getStoryboardShotById(stbAsset.content, orderedShotIds[currentIdx - 1]!)
      : null;
  const nextShot =
    currentIdx >= 0 && currentIdx < orderedShotIds.length - 1
      ? getStoryboardShotById(stbAsset.content, orderedShotIds[currentIdx + 1]!)
      : null;

  // E33: the episode's light, gathered from every shot that states it, so the
  // seven shots that say nothing are not left to invent one each.
  const lightingEvidence = collectSceneLightingEvidence(
    listStoryboardShotsV2(stbAsset.content),
  );
  notes.push(
    lightingEvidence.length > 0
      ? `Scene light: ${lightingEvidence.length} lighting statement(s) found in the storyboard`
      : 'Scene light: storyboard states NO time of day and NO light source — Designer must choose and declare it in policy_notes',
  );

  const systemPrompt = await loadSystemPrompt();
  const userMessage = buildUserMessage({
    episodeCode,
    episodeTitle,
    shotId,
    shot,
    prevShot,
    nextShot,
    bible,
    deliveryTargets,
    priorPlanVersion,
    revisionNote,
    locationSlug,
    locationHasSpatialLayout,
    priorSceneContinuityAnchorAssetId,
    sceneContinuityLookupPerformed,
    previousShotId,
    priorTemporalAnchorAssetId,
    temporalAnchorLookupPerformed,
    anchorChainContext,
    episodeImageFormatBlock: buildEpisodeImageFormatAuthorityBlock(
      readEpisodeImageConfig(inputs.episode),
    ),
    sceneLightBlock: buildSceneLightAuthorityBlock(lightingEvidence),
  });

  let result: AnthropicTextResult;
  try {
    result = await generateAnthropicText({
      systemPrompt,
      userMessage,
      model: EREF_DESIGNER_MODEL,
      maxOutputTokens: EREF_DESIGNER_MAX_TOKENS,
      expectsJson: true,
    });
  } catch (err: unknown) {
    if (err instanceof AnthropicTextError) {
      throw new EpisodeReferenceDesignerError(
        `Anthropic generation failed: ${err.message}`,
        err,
      );
    }
    throw err;
  }

  if (!result.body) {
    throw new EpisodeReferenceDesignerError(
      'Postcondition failed: Designer returned no parseable JSON block',
    );
  }

  if (result.costUsd > EREF_DESIGNER_COST_CEILING_USD) {
    notes.push(
      `Cost overrun: $${result.costUsd.toFixed(4)} > ceiling $${EREF_DESIGNER_COST_CEILING_USD}`,
    );
  }

  // Best-effort sanity-check: provider.id is from allowlist. This is a soft
  // verification — the Critic enforces it as a hard check (V01-V08).
  const provider = (result.body as { provider?: { id?: unknown } }).provider;
  const providerId =
    provider && typeof provider === 'object' && typeof provider.id === 'string'
      ? provider.id
      : null;
  if (providerId && !EREF_DESIGNER_PROVIDER_ALLOWLIST.includes(providerId as 'gpt-image-2')) {
    notes.push(
      `Designer chose provider="${providerId}" outside sprint allowlist — Critic should REVISE`,
    );
  }

  // TD-49 Phase 2 P2.3 soft sanity-check: when anchor mode is active, surface
  // in notes whether the Designer actually emitted an anchor_pair block. Hard
  // validation (role enum, reciprocity) lives in the Critic (Task #4).
  if (anchorChainContext) {
    const anchorPairRaw = (result.body as { anchor_pair?: unknown }).anchor_pair;
    if (anchorPairRaw && typeof anchorPairRaw === 'object') {
      const ap = anchorPairRaw as { start?: unknown; end?: unknown };
      const sides: string[] = [];
      if (ap.start && typeof ap.start === 'object') sides.push('start');
      if (ap.end && typeof ap.end === 'object') sides.push('end');
      notes.push(
        sides.length > 0
          ? `anchor_pair emitted with sides: ${sides.join(', ')}`
          : 'anchor_pair object present but neither start nor end populated — Critic should REVISE',
      );
    } else if (anchorChainContext.scene_master_asset === null) {
      notes.push('anchor_pair omitted (expected — scene_master absent, per system prompt)');
    } else {
      notes.push('anchor_pair MISSING despite anchor mode + scene_master present — Critic should REVISE');
    }
  }

  const sizeBody = (result.body as { size?: { width?: unknown; height?: unknown } }).size;
  const w =
    sizeBody && typeof sizeBody === 'object' && typeof sizeBody.width === 'number'
      ? sizeBody.width
      : null;
  const h =
    sizeBody && typeof sizeBody === 'object' && typeof sizeBody.height === 'number'
      ? sizeBody.height
      : null;
  const variants = (result.body as { variants?: { count?: unknown } }).variants;
  const variantsCount =
    variants && typeof variants === 'object' && typeof variants.count === 'number'
      ? variants.count
      : null;
  const estCost = (result.body as { estimated_cost_usd?: unknown }).estimated_cost_usd;
  const estCostNum = typeof estCost === 'number' ? estCost : null;

  // Engine marker: when Claude was overloaded (529) and Gemini carried the plan,
  // make it loud in the plan description so the Director sees which engine ran.
  const engineNote =
    result.provider === 'gemini-fallback'
      ? `· ⚠ Gemini fallback (Anthropic 529)`
      : '';

  const description = [
    `Plan by EXEC-EREF Designer · ${EREF_DESIGNER_CONTRACT} · ${result.model}`,
    engineNote,
    providerId ? `· provider=${providerId}` : '',
    w && h ? `· ${w}×${h}` : '',
    typeof variantsCount === 'number' ? `· ${variantsCount} variants` : '',
    typeof estCostNum === 'number' ? `· est $${estCostNum.toFixed(3)}` : '',
    `· cost $${result.costUsd.toFixed(4)}`,
  ]
    .filter(Boolean)
    .join(' ');

  return {
    markdown: result.markdown,
    body: result.body,
    costUsd: result.costUsd,
    model: result.model,
    provider: result.provider,
    contract: EREF_DESIGNER_CONTRACT,
    shotId,
    storyboardAssetId: stbAsset.id ?? null,
    deliveryTargets,
    description,
    notes,
  };
}
