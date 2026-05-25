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

/** Sprint-scope provider allowlist for Animator.
 *
 * 2026-05-24 — `seedance-standard` added per Director directive (q49b):
 * episode-level Seedance lock for SS-S15-E01, with `standard` quality tier
 * available for character-heavy shots (Sandy push trumeau in SH01 needs
 * higher motion fidelity than `fast` provides). Runner extracts
 * `quality_tier: 'standard'` from Plan body (q7a Step 6 wiring) and
 * passes through to Seedance provider's standard model endpoint
 * ($0.3024/s vs $0.2419/s for fast).
 */
export const VANIM_PROVIDER_ALLOWLIST = [
  'seedance-fast',
  'seedance-standard',
  'veo-standard',
  'seedance-with-end-image',
] as const;

export type VanimProviderId = (typeof VANIM_PROVIDER_ALLOWLIST)[number];

/**
 * Concrete provider implementation id (matches MultiVideoGenProvider.id) +
 * quality tier resolved from the Animator's Plan body `provider.id` field.
 * Maps the human-readable Animator vocab to runtime concretes.
 */
export interface ResolvedVanimProvider {
  /** MultiVideoGenProvider id passed to `getMultiVideoProvider(...)`. */
  providerImpl: 'seedance-fal-img2vid' | 'veo-3-img2vid';
  /** Quality tier to pass to MultiVideoGenInput. */
  qualityTier: 'fast' | 'standard';
  /** Hint flag — true when Animator chose `seedance-with-end-image`. */
  prefersEndImage: boolean;
}

/**
 * Source-of-truth resolver: Animator's `provider.id` string → concrete
 * `{providerImpl, qualityTier}`. Closes the 2026-05-24 Director-surfaced
 * regression where Plan v03 declared `provider.id = "seedance-standard"`
 * + `quality_tier = "standard"` but VGEN runtime still picked
 * `provider_assignments.character_video` default (Seedance fast) and
 * `body.quality_tier` was extracted independently → silent drift between
 * Animator's intent and what reached Seedance.
 *
 * After this lands, runner.ts EXEC-VGEN plan-driven branch uses
 * `provider.id` from the Plan body as the SINGLE source of truth — both
 * providerImpl AND qualityTier derive from it. Event-arg / DB-config
 * providers only used when planAssetId is absent (legacy path).
 *
 * Throws when planProviderId is not in the allowlist — caller decides
 * whether to fall back to legacy provider or surface an error.
 */
export function resolveVanimProviderId(
  planProviderId: string,
): ResolvedVanimProvider {
  switch (planProviderId) {
    case 'seedance-fast':
      return {
        providerImpl: 'seedance-fal-img2vid',
        qualityTier: 'fast',
        prefersEndImage: false,
      };
    case 'seedance-standard':
      return {
        providerImpl: 'seedance-fal-img2vid',
        qualityTier: 'standard',
        prefersEndImage: false,
      };
    case 'seedance-with-end-image':
      return {
        providerImpl: 'seedance-fal-img2vid',
        qualityTier: 'standard',
        prefersEndImage: true,
      };
    case 'veo-standard':
      return {
        providerImpl: 'veo-3-img2vid',
        qualityTier: 'standard',
        prefersEndImage: false,
      };
    default:
      throw new Error(
        `resolveVanimProviderId: unknown Animator provider.id "${planProviderId}". Allowlist: ${VANIM_PROVIDER_ALLOWLIST.join(', ')}`,
      );
  }
}

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

// ── TD-49 Phase 2 — Anchor chain schema (2026-05-25) ─────────────────────────
//
// The Animator's Plan body gains two new fields, `start_anchor` and
// `end_anchor`, each pointing to an `IMG-anchor_*` Bible-level asset (designed
// by EREF Designer) plus a role enum and a reciprocal `handoff_link_to` for
// match-cut handoffs. Legacy `end_image.eref_asset_id` stays for back-compat
// — episodes without `metadata.anchor_chain_enabled = true` leave anchor
// fields null and the legacy path drives VGEN.

export type StartAnchorRole = 'establishing' | 'shared' | 'cut_in';
export type EndAnchorRole = 'shared' | 'cut_out' | 'final';

export const START_ANCHOR_ROLES: readonly StartAnchorRole[] = [
  'establishing',
  'shared',
  'cut_in',
] as const;

export const END_ANCHOR_ROLES: readonly EndAnchorRole[] = [
  'shared',
  'cut_out',
  'final',
] as const;

export interface VanimStartAnchor {
  asset_id: string;
  role: StartAnchorRole;
  /** Reciprocal pointer to prior SH.end_anchor.asset_id; required when
   *  role === 'shared', must be null otherwise. */
  handoff_link_to: string | null;
  rationale?: string;
}

export interface VanimEndAnchor {
  asset_id: string;
  role: EndAnchorRole;
  /** Reciprocal pointer to next SH.start_anchor.asset_id; required when
   *  role === 'shared', must be null otherwise. */
  handoff_link_to: string | null;
  rationale?: string;
}

export type OpeningCameraMotionKind =
  | 'pan'
  | 'tilt'
  | 'zoom'
  | 'dolly'
  | 'rotate'
  | 'whip';

export type OpeningCameraMotionDirection =
  | 'left'
  | 'right'
  | 'in'
  | 'out'
  | 'up'
  | 'down';

export interface VanimOpeningCameraMotion {
  kind: OpeningCameraMotionKind | null;
  direction: OpeningCameraMotionDirection | null;
  prose: string | null;
}

/**
 * Parsed anchor-chain section of a VANIM Plan body. All fields are nullable
 * — legacy plans without anchor chain return all nulls, callers fall through
 * to existing single-reference path.
 */
export interface ParsedAnchorChain {
  start_anchor: VanimStartAnchor | null;
  end_anchor: VanimEndAnchor | null;
  opening_camera_motion: VanimOpeningCameraMotion | null;
  closing_static_hold_seconds: number | null;
}

function isUuidish(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 8;
}

function parseStartAnchor(raw: unknown): VanimStartAnchor | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (!isUuidish(obj.asset_id)) return null;
  if (typeof obj.role !== 'string' || !(START_ANCHOR_ROLES as readonly string[]).includes(obj.role)) {
    throw new AnimatorError(
      `Plan body start_anchor.role invalid: "${String(obj.role)}". Allowed: ${START_ANCHOR_ROLES.join(', ')}.`,
    );
  }
  const role = obj.role as StartAnchorRole;
  const handoffLinkTo =
    obj.handoff_link_to === null || obj.handoff_link_to === undefined
      ? null
      : isUuidish(obj.handoff_link_to)
        ? obj.handoff_link_to
        : null;
  if (role === 'shared' && !handoffLinkTo) {
    throw new AnimatorError(
      'Plan body start_anchor.role="shared" requires handoff_link_to to be a non-null asset_id (reciprocal pair with prior SH.end_anchor).',
    );
  }
  if (role !== 'shared' && handoffLinkTo) {
    throw new AnimatorError(
      `Plan body start_anchor.role="${role}" must have handoff_link_to=null; got "${handoffLinkTo}".`,
    );
  }
  const rationale =
    typeof obj.rationale === 'string' && obj.rationale.length > 0
      ? obj.rationale
      : undefined;
  return {
    asset_id: obj.asset_id,
    role,
    handoff_link_to: handoffLinkTo,
    ...(rationale ? { rationale } : {}),
  };
}

function parseEndAnchor(raw: unknown): VanimEndAnchor | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (!isUuidish(obj.asset_id)) return null;
  if (typeof obj.role !== 'string' || !(END_ANCHOR_ROLES as readonly string[]).includes(obj.role)) {
    throw new AnimatorError(
      `Plan body end_anchor.role invalid: "${String(obj.role)}". Allowed: ${END_ANCHOR_ROLES.join(', ')}.`,
    );
  }
  const role = obj.role as EndAnchorRole;
  const handoffLinkTo =
    obj.handoff_link_to === null || obj.handoff_link_to === undefined
      ? null
      : isUuidish(obj.handoff_link_to)
        ? obj.handoff_link_to
        : null;
  if (role === 'shared' && !handoffLinkTo) {
    throw new AnimatorError(
      'Plan body end_anchor.role="shared" requires handoff_link_to to be a non-null asset_id (reciprocal pair with next SH.start_anchor).',
    );
  }
  if (role !== 'shared' && handoffLinkTo) {
    throw new AnimatorError(
      `Plan body end_anchor.role="${role}" must have handoff_link_to=null; got "${handoffLinkTo}".`,
    );
  }
  const rationale =
    typeof obj.rationale === 'string' && obj.rationale.length > 0
      ? obj.rationale
      : undefined;
  return {
    asset_id: obj.asset_id,
    role,
    handoff_link_to: handoffLinkTo,
    ...(rationale ? { rationale } : {}),
  };
}

function parseOpeningCameraMotion(
  raw: unknown,
): VanimOpeningCameraMotion | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const allowedKinds = new Set([
    'pan',
    'tilt',
    'zoom',
    'dolly',
    'rotate',
    'whip',
  ]);
  const allowedDirs = new Set(['left', 'right', 'in', 'out', 'up', 'down']);
  const kind =
    typeof obj.kind === 'string' && allowedKinds.has(obj.kind)
      ? (obj.kind as OpeningCameraMotionKind)
      : null;
  const direction =
    typeof obj.direction === 'string' && allowedDirs.has(obj.direction)
      ? (obj.direction as OpeningCameraMotionDirection)
      : null;
  const prose = typeof obj.prose === 'string' && obj.prose.length > 0 ? obj.prose : null;
  if (!kind && !direction && !prose) return null;
  return { kind, direction, prose };
}

/**
 * Extract + validate the anchor-chain section of a VANIM Plan body.
 * Returns all-null when fields are absent (legacy path). Throws
 * AnimatorError on structural violations (invalid role, missing reciprocal
 * link, type mismatch) so callers / Critic can REJECT the Plan rather than
 * silently mis-route.
 *
 * Phase 2 entry point — used by Critic (VPREV, P2.5), runner.ts q7a Step 6
 * extension (P2.4), and approve-route batch flow (P2.6).
 */
export function extractAnchorChain(planBody: unknown): ParsedAnchorChain {
  if (!planBody || typeof planBody !== 'object') {
    return {
      start_anchor: null,
      end_anchor: null,
      opening_camera_motion: null,
      closing_static_hold_seconds: null,
    };
  }
  const body = planBody as Record<string, unknown>;
  const start_anchor = parseStartAnchor(body.start_anchor);
  const end_anchor = parseEndAnchor(body.end_anchor);
  const opening_camera_motion = parseOpeningCameraMotion(
    body.opening_camera_motion,
  );
  const rawHold = body.closing_static_hold_seconds;
  const closing_static_hold_seconds =
    typeof rawHold === 'number' && Number.isFinite(rawHold) && rawHold >= 0
      ? rawHold
      : null;
  return {
    start_anchor,
    end_anchor,
    opening_camera_motion,
    closing_static_hold_seconds,
  };
}

/**
 * Cross-pair compatibility check. Given SH(K).end_anchor + SH(K+1).start_anchor
 * from two adjacent Plans, return null when compatible, or a violation
 * message describing the mismatch. Match-cut pairing requires reciprocal
 * handoff_link_to pointers; action-cut requires cut_out↔cut_in. Used by
 * VPREV (P2.5) and approve-route gate (P2.6).
 */
export function checkAnchorPairCompatibility(
  prevEnd: VanimEndAnchor | null,
  nextStart: VanimStartAnchor | null,
): string | null {
  if (!prevEnd && !nextStart) return null;
  if (!prevEnd) {
    if (nextStart && nextStart.role === 'shared') {
      return 'next shot start_anchor.role="shared" but prior shot has no end_anchor';
    }
    return null;
  }
  if (!nextStart) {
    if (prevEnd.role === 'shared') {
      return 'prior shot end_anchor.role="shared" but next shot has no start_anchor';
    }
    return null;
  }
  // `final` is terminal — ANY next anchor is a violation, regardless of its
  // role. Check first to short-circuit the cut/shared matrix below.
  if (prevEnd.role === 'final') {
    return 'prior shot end_anchor.role="final" has no downstream peer — next shot exists but final terminal expected';
  }
  if (prevEnd.role === 'shared' && nextStart.role !== 'shared') {
    return `boundary mismatch: prior end_anchor.role="shared" but next start_anchor.role="${nextStart.role}"`;
  }
  if (prevEnd.role !== 'shared' && nextStart.role === 'shared') {
    return `boundary mismatch: next start_anchor.role="shared" but prior end_anchor.role="${prevEnd.role}"`;
  }
  if (prevEnd.role === 'shared' && nextStart.role === 'shared') {
    if (prevEnd.handoff_link_to !== nextStart.asset_id) {
      return `match-cut handoff missing reciprocal: prior end_anchor.handoff_link_to="${prevEnd.handoff_link_to}" does not point to next start_anchor.asset_id="${nextStart.asset_id}"`;
    }
    if (nextStart.handoff_link_to !== prevEnd.asset_id) {
      return `match-cut handoff missing reciprocal: next start_anchor.handoff_link_to="${nextStart.handoff_link_to}" does not point to prior end_anchor.asset_id="${prevEnd.asset_id}"`;
    }
  }
  if (prevEnd.role === 'cut_out' && nextStart.role !== 'cut_in') {
    return `boundary mismatch: prior end_anchor.role="cut_out" but next start_anchor.role="${nextStart.role}" (expected "cut_in")`;
  }
  if (prevEnd.role !== 'cut_out' && nextStart.role === 'cut_in') {
    return `boundary mismatch: next start_anchor.role="cut_in" but prior end_anchor.role="${prevEnd.role}" (expected "cut_out")`;
  }
  return null;
}

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
