// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/runners/animator.ts
// EXEC-VANIM — Animator (Sprint «Дизайнер и Аниматор», Day 6-7 2026-05-19).
// Authors a per-shot SPC-shot_plan asset that captures every decision for
// rendering one storyboard shot as a short video clip. Mirrors the EREF
// Designer pattern (one Plan per shot, Critic validates, Director approves,
// executor reads APPROVED Plan).
//
// Replaces the prompt-template-only path in buildShotPromptV2 for shots
// where ANIMATOR_CHAIN_ENABLED is true. Legacy path stays for replay-pilot.
//
// Inputs:
//   - episode (code, title, metadata.delivery_targets)
//   - storyboard shot (StoryboardShotV2) — single shot, looked up by shotId
//   - Bible canon (characters / locations / styles)
//   - optional APPROVED EREF asset for the shot (continuity anchor)
//   - optional revisionNote from Critic / Director (hard contract)
//
// Outputs:
//   - markdown body (Director-readable narrative + JSON block)
//   - body: parsed Plan JSON (provider, aspect, duration, seed, end_image,
//           prompt, negative, etc)
//   - cost_usd, model
// ──────────────────────────────────────────────────────────────────────────────

import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  generateAnthropicText,
  AnthropicTextError,
  type AnthropicTextResult,
} from '../providers/anthropic-text';
import { formatBibleForPrompt, type SeriesBibleCanon } from '../bible-loader';
import {
  getStoryboardShotById,
  type StoryboardShotV2,
} from '../../api/vgen-shot-helpers';
import type { AgentInputs } from '../types';

export const VANIM_CONTRACT = 'animator@v1';
export const VANIM_MODEL = 'claude-sonnet-4-6';
export const VANIM_MAX_TOKENS = 6000;
export const VANIM_COST_CEILING_USD = 0.15;

/** Sprint-scope provider allowlist for Animator. */
export const VANIM_PROVIDER_ALLOWLIST = [
  'seedance-fast',
  'veo-standard',
  'seedance-with-end-image',
] as const;

/** Aspect ratio per delivery_target — same mapping the runtime VGEN provider
 *  uses to pick output dimensions. */
export const ASPECT_BY_DELIVERY_TARGET: Readonly<Record<string, '16:9' | '9:16' | '1:1'>> =
  Object.freeze({
    youtube_landscape: '16:9',
    youtube_shorts: '9:16',
    instagram_reels: '9:16',
    instagram_post: '1:1',
    tiktok: '9:16',
    print_poster: '16:9',
  });

export class AnimatorError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'AnimatorError';
  }
}

export interface VANIMRunArgs {
  inputs: AgentInputs;
  shotId: string;
  revisionNote?: string;
}

export interface VANIMRunResult {
  markdown: string;
  body: Record<string, unknown>;
  costUsd: number;
  model: string;
  contract: typeof VANIM_CONTRACT;
  shotId: string;
  storyboardAssetId: string | null;
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
  episode_code?: string;
  title_working?: string | null;
  metadata?: unknown;
}

let systemPromptCache: string | null = null;

async function loadSystemPrompt(): Promise<string> {
  if (systemPromptCache !== null) return systemPromptCache;
  const candidates = [
    path.resolve(process.cwd(), '../agents/exec/animator.md'),
    path.resolve(process.cwd(), 'agents/exec/animator.md'),
    path.resolve(process.cwd(), '../../agents/exec/animator.md'),
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
  throw new AnimatorError(
    `Could not find agents/exec/animator.md from cwd=${process.cwd()}`,
  );
}

export function _resetAnimatorPromptCacheForTests(): void {
  systemPromptCache = null;
}

function findApprovedAsset(
  upstream: readonly UpstreamAssetLike[] | undefined,
  fileType: string,
): UpstreamAssetLike | null {
  if (!upstream) return null;
  return (
    upstream.find((a) => a.file_type === fileType && a.status === 'APPROVED') ?? null
  );
}

function findApprovedEREFForShot(
  upstream: readonly UpstreamAssetLike[] | undefined,
  shotId: string,
): UpstreamAssetLike | null {
  if (!upstream) return null;
  // EREF assets carry metadata.shot_reference.shot_id (v2) and we list them
  // here only for context lookup — the runner reads upstream_assets which
  // already filters to APPROVED status. We match loosely by filename prefix
  // because runner's loader doesn't include metadata.
  for (const a of upstream) {
    if (!a.file_type || !a.file_type.startsWith('IMG-episode_ref')) continue;
    if (a.status !== 'APPROVED') continue;
    if (typeof a.filename === 'string' && a.filename.includes(shotId)) return a;
  }
  return null;
}

export function resolveAnimatorDeliveryTargets(args: {
  episodeMetadata: unknown;
  seriesDeliveryTargets?: readonly string[] | null;
}): readonly string[] {
  const fromEp = readDeliveryTargetsFromMetadata(args.episodeMetadata);
  if (fromEp && fromEp.length > 0) return fromEp;
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

function buildAspectTable(targets: readonly string[]): string {
  const rows = targets.map((slug) => {
    const aspect = ASPECT_BY_DELIVERY_TARGET[slug];
    if (!aspect) return `  - ${slug}: (no mapping — flag policy_note)`;
    return `  - ${slug}: ${aspect}`;
  });
  return rows.join('\n');
}

function buildUserMessage(args: {
  episodeCode: string;
  episodeTitle: string;
  shotId: string;
  shot: StoryboardShotV2;
  bible: SeriesBibleCanon;
  deliveryTargets: readonly string[];
  priorPlanVersion: number | null;
  erefAssetId: string | null;
  revisionNote?: string;
}): string {
  const {
    episodeCode,
    episodeTitle,
    shotId,
    shot,
    bible,
    deliveryTargets,
    priorPlanVersion,
    erefAssetId,
    revisionNote,
  } = args;

  const biblePromptBlock = formatBibleForPrompt(bible);
  const hasCanon = bible.total_entries > 0 || bible.general_idea !== null;

  const charactersList: string[] = [];
  if (Array.isArray(shot.characters)) {
    for (const c of shot.characters) {
      if (c.bible_slug) charactersList.push(c.bible_slug);
    }
  }

  const planVersionLabel =
    priorPlanVersion !== null && priorPlanVersion > 0
      ? `v${String(priorPlanVersion + 1).padStart(2, '0')}`
      : 'v01';

  return [
    '# Task',
    `Author the video generation Plan for shot ${shotId} of episode ${episodeCode} — "${episodeTitle}".`,
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
    `characters_present: ${charactersList.length > 0 ? charactersList.join(', ') : '(none)'}`,
    '</shot>',
    '',
    '## Series Bible canon',
    '',
    hasCanon
      ? biblePromptBlock
      : 'No LOCKED Series Bible entries exist yet. Operate in MVP mode: use ONLY the shot data above. Flag MVP assumptions in policy_notes[].',
    '',
    '## Delivery targets (drives aspect + duration decisions)',
    '',
    deliveryTargets.length > 0
      ? `Active targets:\n${buildAspectTable(deliveryTargets)}`
      : 'No delivery targets resolved — fallback to youtube_landscape (16:9).',
    '',
    '## Continuity anchor (APPROVED EREF for this shot)',
    '',
    erefAssetId
      ? `Approved IMG-episode_ref asset id: ${erefAssetId}. Use it as reference_anchor.asset_id for continuity-locked subjects.`
      : 'No APPROVED EREF for this shot yet. Use reference_anchor.kind="bible-character" or "none" instead.',
    '',
    '## Provider sprint-scope',
    '',
    `Allowlist (Director directive 2026-05-19): ${VANIM_PROVIDER_ALLOWLIST.join(', ')}. Do not select anything else.`,
    '',
    revisionNote
      ? [
          '## Revision request from Critic / Director — HARD ACCEPTANCE CRITERIA',
          '',
          revisionNote,
          '',
          'Treat each item above as a HARD CONTRACT. Re-derive — do not "minimally tweak" prior rejected decisions.',
          '',
        ].join('\n')
      : '',
    'Output: markdown narrative + ONE fenced JSON code block per system contract. Do not omit the JSON.',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function runAnimator(args: VANIMRunArgs): Promise<VANIMRunResult> {
  const { inputs, shotId, revisionNote } = args;
  if (!shotId || typeof shotId !== 'string') {
    throw new AnimatorError('shotId is required');
  }

  const ep = inputs.episode as EpisodeLike | undefined;
  const episodeCode = ep?.episode_code ?? 'UNKNOWN';
  const episodeTitle = ep?.title_working ?? 'Untitled';

  const upstream = inputs.upstream_assets as readonly UpstreamAssetLike[] | undefined;
  const stbAsset = findApprovedAsset(upstream, 'STB-storyboard');
  if (!stbAsset?.content) {
    throw new AnimatorError(
      'Precondition failed: APPROVED STB-storyboard not found in upstream_assets',
    );
  }
  const shot = getStoryboardShotById(stbAsset.content, shotId);
  if (!shot) {
    throw new AnimatorError(
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

  const deliveryTargets = resolveAnimatorDeliveryTargets({
    episodeMetadata: ep?.metadata,
    seriesDeliveryTargets:
      (inputs.series_delivery_targets as readonly string[] | undefined) ?? null,
  });

  const priorPlanVersion =
    typeof inputs.prior_plan_version === 'number'
      ? inputs.prior_plan_version
      : null;

  const eref = findApprovedEREFForShot(upstream, shotId);
  const erefAssetId = eref?.id ?? null;

  const notes: string[] = [];
  if (bible.total_entries === 0 && !bible.general_idea) {
    notes.push('Series Bible empty — Animator operating in MVP mode');
  }
  notes.push(`Delivery targets: ${deliveryTargets.join(', ')}`);
  if (erefAssetId) notes.push(`EREF anchor: ${erefAssetId}`);
  if (revisionNote) notes.push('Revision-note loop iteration');

  const systemPrompt = await loadSystemPrompt();
  const userMessage = buildUserMessage({
    episodeCode,
    episodeTitle,
    shotId,
    shot,
    bible,
    deliveryTargets,
    priorPlanVersion,
    erefAssetId,
    revisionNote,
  });

  let result: AnthropicTextResult;
  try {
    result = await generateAnthropicText({
      systemPrompt,
      userMessage,
      model: VANIM_MODEL,
      maxOutputTokens: VANIM_MAX_TOKENS,
      expectsJson: true,
    });
  } catch (err: unknown) {
    if (err instanceof AnthropicTextError) {
      throw new AnimatorError(`Anthropic generation failed: ${err.message}`, err);
    }
    throw err;
  }

  if (!result.body) {
    throw new AnimatorError(
      'Postcondition failed: Animator returned no parseable JSON block',
    );
  }

  if (result.costUsd > VANIM_COST_CEILING_USD) {
    notes.push(
      `Cost overrun: $${result.costUsd.toFixed(4)} > ceiling $${VANIM_COST_CEILING_USD}`,
    );
  }

  const provider = (result.body as { provider?: { id?: unknown } }).provider;
  const providerId =
    provider && typeof provider.id === 'string' ? provider.id : null;
  if (
    providerId &&
    !(VANIM_PROVIDER_ALLOWLIST as readonly string[]).includes(providerId)
  ) {
    notes.push(
      `Animator chose provider="${providerId}" outside sprint allowlist — Critic should REVISE`,
    );
  }

  const aspect = (result.body as { aspect_ratio?: unknown }).aspect_ratio;
  const duration = (result.body as { duration_seconds?: unknown }).duration_seconds;
  const estCost = (result.body as { estimated_cost_usd?: unknown }).estimated_cost_usd;

  const description = [
    `Plan by EXEC-VANIM · ${VANIM_CONTRACT} · ${VANIM_MODEL}`,
    providerId ? `· provider=${providerId}` : '',
    typeof aspect === 'string' ? `· ${aspect}` : '',
    typeof duration === 'number' ? `· ${duration}s` : '',
    typeof estCost === 'number' ? `· est $${estCost.toFixed(3)}` : '',
    `· cost $${result.costUsd.toFixed(4)}`,
  ]
    .filter(Boolean)
    .join(' ');

  return {
    markdown: result.markdown,
    body: result.body,
    costUsd: result.costUsd,
    model: result.model,
    contract: VANIM_CONTRACT,
    shotId,
    storyboardAssetId: stbAsset.id ?? null,
    deliveryTargets,
    description,
    notes,
  };
}
