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
import { getStoryboardShotById, type StoryboardShotV2 } from '../../api/vgen-shot-helpers';
import type { AgentInputs } from '../types';

export const EREF_DESIGNER_CONTRACT = 'episode_reference_designer@v1';
export const EREF_DESIGNER_MODEL = 'claude-sonnet-4-6';
/** Plans rarely exceed 3K tokens; 6000 gives headroom for elaborate Bible canon
 *  injections without truncating the trailing JSON block. */
export const EREF_DESIGNER_MAX_TOKENS = 6000;
/** Per-Plan cost ceiling. Sonnet input-heavy Plans should land ~$0.02-0.05. */
export const EREF_DESIGNER_COST_CEILING_USD = 0.15;

/** Sprint-scope provider list (Director directive q1 2026-05-18 — gpt-image-2
 *  only until E22 baseline data; Flux deferred). The skill playbook may later
 *  extend this without code change. */
export const EREF_DESIGNER_PROVIDER_ALLOWLIST = ['gpt-image-2'] as const;

/** Size table per delivery_target (per agents/exec/episode_reference_designer.md
 *  Step 2). Pure data — Designer's prompt cites this so the LLM picks the right
 *  size; runtime validation uses the same table. */
export const SIZE_BY_DELIVERY_TARGET: Readonly<
  Record<string, { width: number; height: number }>
> = Object.freeze({
  youtube_landscape: { width: 1536, height: 1024 },
  youtube_shorts: { width: 1024, height: 1792 },
  instagram_reels: { width: 1024, height: 1792 },
  instagram_post: { width: 1024, height: 1024 },
  tiktok: { width: 1024, height: 1792 },
  print_poster: { width: 2048, height: 1536 },
});

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

function findApprovedAsset(
  upstream: readonly UpstreamAssetLike[] | undefined,
  fileType: string,
): UpstreamAssetLike | null {
  if (!upstream) return null;
  return (
    upstream.find(
      (a) => a.file_type === fileType && a.status === 'APPROVED',
    ) ?? null
  );
}

/**
 * Resolve `delivery_targets[]` for an episode. Precedence:
 *   1. episode.metadata.delivery_targets[] (per-episode override in brief)
 *   2. series.metadata.delivery_targets[] (series-level default, loaded
 *      separately by the caller and passed via inputs.series_delivery_targets)
 *   3. Fallback: ['youtube_landscape'] — S14 sprint default
 *
 * Exported so the Inngest function wiring (Day 3) and unit tests share the
 * same precedence logic. Pure function — no DB calls.
 */
export function resolveDeliveryTargets(args: {
  episodeMetadata: unknown;
  seriesDeliveryTargets?: readonly string[] | null;
}): readonly string[] {
  const fromEpisode = readDeliveryTargetsFromMetadata(args.episodeMetadata);
  if (fromEpisode && fromEpisode.length > 0) return fromEpisode;
  if (args.seriesDeliveryTargets && args.seriesDeliveryTargets.length > 0) {
    return args.seriesDeliveryTargets;
  }
  return ['youtube_landscape'];
}

function readDeliveryTargetsFromMetadata(meta: unknown): readonly string[] | null {
  if (!meta || typeof meta !== 'object') return null;
  const m = meta as Record<string, unknown>;
  const raw = m.delivery_targets;
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v === 'string' && v.length > 0) out.push(v);
  }
  return out;
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
  bible: SeriesBibleCanon;
  deliveryTargets: readonly string[];
  priorPlanVersion: number | null;
  revisionNote?: string;
  /** TD-30: prior APPROVED IMG-episode_ref in same location, or null when first shot. */
  priorSceneContinuityAnchorAssetId?: string | null;
  /** TD-30: bible-locked location slug for this shot — surfaced so Designer can reason. */
  locationSlug?: string | null;
  /**
   * TD-30: true iff caller actually performed the lookup (supabase present
   * AND locationSlug resolvable). False → Designer should NOT claim "first
   * shot in location" because we never checked — Plan must mark the field
   * null with a policy_note instead.
   */
  sceneContinuityLookupPerformed?: boolean;
}): string {
  const {
    episodeCode,
    episodeTitle,
    shotId,
    shot,
    bible,
    deliveryTargets,
    priorPlanVersion,
    revisionNote,
    priorSceneContinuityAnchorAssetId,
    locationSlug,
    sceneContinuityLookupPerformed,
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
    `action_prose: ${shot.action_prose ?? shot.action ?? shot.key_beat ?? '(unspecified)'}`,
    `expected_gag: ${shot.expected_gag ?? '(none)'}`,
    `expected_emotion: ${shot.expected_emotion ?? '(none)'}`,
    `characters_present: ${presentList}`,
    '</shot>',
    '',
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
    '## Provider sprint-scope',
    '',
    `Provider allowlist for this sprint (Director directive 2026-05-18): ${EREF_DESIGNER_PROVIDER_ALLOWLIST.join(', ')}. Do not select any other provider. Justify the choice from this list in provider.rationale.`,
    '',
    '## Scene-continuity anchor (TD-30 — 2026-05-21)',
    '',
    !sceneContinuityLookupPerformed
      ? 'Scene-continuity lookup was NOT performed in this runner invocation (no DB access). Leave `scene_continuity_anchor_asset_id` null and add a policy_note flagging the absent lookup.'
      : locationSlug
        ? priorSceneContinuityAnchorAssetId
          ? `A prior APPROVED IMG-episode_ref in location \`${locationSlug}\` exists for this episode (asset_id: \`${priorSceneContinuityAnchorAssetId}\`). When continuity_strategy.mode = openai-edits-multi, set \`scene_continuity_anchor_asset_id\` to this id so the executor embeds it as a 4th multi-image ref alongside identity / location / style. This stabilises spatial layout (furniture position, set dressing) across shots in the same room. If you choose a different continuity_strategy.mode, leave the field null and note in policy_notes.`
          : `This is the FIRST shot in location \`${locationSlug}\` for this episode — no prior APPROVED IMG-episode_ref to anchor on. Leave \`scene_continuity_anchor_asset_id\` null.`
        : 'Shot has no resolvable bible-locked location slug — leave `scene_continuity_anchor_asset_id` null.',
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
    '  "scene_continuity_anchor_asset_id": <null | "<asset_id of prior APPROVED IMG-episode_ref in same location, TD-30>">,',
    '  "prompt": "<full prompt text — same as Промпт section above, machine-readable>",',
    '  "negative": ["<term>", "<term>", ...],',
    '  "camera_intent": {',
    '    "angle": "<MEDIUM | WIDE | CLOSE | ...>",',
    '    "sub_area_variation": "<one sentence on viewpoint variation vs sibling shots>"',
    '  },',
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
  if (supabase && locationSlug) {
    const episodeId = (ep as { id?: unknown } | undefined)?.id;
    if (typeof episodeId === 'string' && episodeId.length > 0) {
      sceneContinuityLookupPerformed = true;
      priorSceneContinuityAnchorAssetId = await findLatestApprovedImgByLocation(
        supabase,
        episodeId,
        locationSlug,
      );
      if (priorSceneContinuityAnchorAssetId) {
        notes.push(
          `Scene-continuity anchor: ${priorSceneContinuityAnchorAssetId} (location=${locationSlug})`,
        );
      } else {
        notes.push(`Scene-continuity: first shot in location=${locationSlug}`);
      }
    }
  }

  const systemPrompt = await loadSystemPrompt();
  const userMessage = buildUserMessage({
    episodeCode,
    episodeTitle,
    shotId,
    shot,
    bible,
    deliveryTargets,
    priorPlanVersion,
    revisionNote,
    locationSlug,
    priorSceneContinuityAnchorAssetId,
    sceneContinuityLookupPerformed,
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

  const description = [
    `Plan by EXEC-EREF Designer · ${EREF_DESIGNER_CONTRACT} · ${EREF_DESIGNER_MODEL}`,
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
    contract: EREF_DESIGNER_CONTRACT,
    shotId,
    storyboardAssetId: stbAsset.id ?? null,
    deliveryTargets,
    description,
    notes,
  };
}
