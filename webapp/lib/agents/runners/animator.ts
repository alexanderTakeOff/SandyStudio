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
  type StoryboardShotV2,
} from '../../api/vgen-shot-helpers';
import type { AgentInputs } from '../types';
import { loadAnchorChainContext, readEpisodeVideoConfig, type AnchorChainContext } from '../runner';
import { findApprovedAsset } from '../upstream';
import { resolveDeliveryTargets } from '../delivery-targets';
import {
  VIDEO_PROVIDER_CAPS,
  ASPECT_BY_DELIVERY_TARGET,
  clampRenderDuration,
  estimateCost,
  deliveryAspectFor,
  type VideoProviderId,
} from '../../api/provider-capabilities';
import { resolveVideoParams, type EpisodeVideoConfig } from '../../api/resolve-generation-params';
import { getVgenDefaults } from '../../api/vgen-defaults';
import { serializeShotPlanContract, type ShotPlanPatch } from '../../api/shot-plan-contract';

export const VANIM_CONTRACT = 'animator@v1';
export const VANIM_MODEL = 'claude-sonnet-4-6';
/** Output budget for the Animator Sonnet call.
 *
 *  History mirrors EREF_DESIGNER_MAX_TOKENS — 6000 was the pre-TD-49
 *  baseline; bumped to 12000 in TD-57 (2026-05-26) after Director's
 *  SH09 live retry hit `stop_reason=max_tokens` on the Designer side.
 *  Animator (TD-52) loads the same anchor chain context + does extra
 *  DB lookup for IMG-anchor asset_ids, so its user message is even
 *  larger when anchor_chain_enabled. 12000 gives 2x headroom; legacy
 *  episodes (anchor mode off) still finish well under the old 6000. */
export const VANIM_MAX_TOKENS = 12000;
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
// TD-67a (2026-05-27): `seedance-standard` RESTORED to the allowlist per
// Director directive q49b 2026-05-24. The earlier TD-67 retirement was
// over-eager: action-heavy shots that need Seedance standard tier WITHOUT
// end_image conditioning (e.g. Sandy push trumeau in SH01 — single-frame
// path, no end anchor) are a legitimate use case. `seedance-with-end-image`
// would force null end_image and the runner's prefersEndImage hint would
// still propagate confusion to single-frame path.
//
// Four-alias policy:
//   - seedance-fast: ambient / non-hero shots
//   - seedance-standard: action-heavy single-frame shots (no end anchor)
//   - seedance-with-end-image: anchor-pair workflow (start+end anchors)
//   - veo-standard: Veo provider escape hatch
//
// Critic V01 check in agents/exec/animator_critic.md restored to accept
// all four — TD-67a fix synced both surfaces.
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
      // TD-67a (2026-05-27): restored. Action-heavy single-frame shots
      // (Sandy push trumeau, SH13-15 with collapsed beat) need standard
      // tier without end_image. Distinct from `seedance-with-end-image`
      // which forces anchor-pair temporal contract.
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

/**
 * Reverse of `resolveVanimProviderId`: map a resolved (providerImpl, qualityTier)
 * back to the Animator allowlist alias the Plan JSON carries. The forward map is
 * non-injective — `(seedance-fal-img2vid, standard)` is BOTH `seedance-standard`
 * and `seedance-with-end-image` — so the caller passes the ORIGINAL plan's
 * `prefersEndImage` to disambiguate, preserving end-image semantics when the
 * episode authority did not force a family/quality change. The resolver can only
 * ever return one of the two `VideoProviderId`s, so this map is total.
 */
export function vanimAliasFor(
  providerImpl: VideoProviderId,
  qualityTier: 'fast' | 'standard',
  prefersEndImage: boolean,
): VanimProviderId {
  if (providerImpl === 'veo-3-img2vid') return 'veo-standard';
  if (qualityTier === 'fast') return 'seedance-fast';
  return prefersEndImage ? 'seedance-with-end-image' : 'seedance-standard';
}

/**
 * Acceptable Plan aliases for an episode's IMPL provider_id (+ optional quality).
 * The episode config speaks impl vocab; the Plan + Critic allowlist speak alias
 * vocab. seedance-fal-img2vid+standard accepts BOTH `seedance-standard` and
 * `seedance-with-end-image` (same impl/quality, end-image is a per-shot choice).
 */
export function episodeProviderAliases(
  providerImpl: VideoProviderId,
  qualityTier: 'fast' | 'standard' | null,
): VanimProviderId[] {
  if (providerImpl === 'veo-3-img2vid') return ['veo-standard'];
  if (qualityTier === 'fast') return ['seedance-fast'];
  if (qualityTier === 'standard') return ['seedance-standard', 'seedance-with-end-image'];
  return ['seedance-fast', 'seedance-standard', 'seedance-with-end-image'];
}

/** Aspect ratio per delivery_target. Single source of truth moved to the
 *  shared manifest (`lib/api/provider-capabilities.ts`) so the generation-
 *  params resolver and the Animator share one map; re-exported here for
 *  back-compat with existing importers (e.g. animator.test.ts). */
export { ASPECT_BY_DELIVERY_TARGET };

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

/**
 * TD-74 (2026-05-27) — Director-authorized check waiver propagated from PA
 * tool / Director-trigger event payload. The Animator surfaces this in the
 * generated Plan's `policy_notes[]` for traceability (so the Director can
 * see WHY the waiver was applied when reviewing the Plan), and the same
 * value is propagated to the Critic via the auto-chain event payload —
 * NOT via the Plan body, which the Critic does not trust as authoritative.
 */
export interface DirectorOverride {
  readonly check: string;
  readonly rationale: string;
}

export interface VANIMRunArgs {
  inputs: AgentInputs;
  shotId: string;
  revisionNote?: string;
  /** TD-74 — see DirectorOverride doc. */
  directorOverrides?: ReadonlyArray<DirectorOverride>;
  /**
   * TD-52 (2026-05-25): when supabase is provided AND episode metadata has
   * `anchor_chain_enabled=true`, the Animator runner loads anchor chain
   * context (loadAnchorChainContext) + looks up APPROVED IMG-anchor_* assets
   * for current shot + adjacent shots, then passes concrete asset_ids into
   * the LLM user message. Without supabase the runner skips anchor mode and
   * the LLM authors a legacy single-reference Plan.
   */
  supabase?: SupabaseClient<Database>;
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

// Process-lifetime cache: editing agents/exec/animator.md does NOT take effect
// until THIS module reloads (dev: an HMR recompile of animator.ts; prod: deploy).
// _resetAnimatorPromptCacheForTests() forces a re-read. Gotcha hit 2026-06-04 —
// the q9 duration-lock prompt edit was invisible to the long-running dev process
// until animator.ts was touched.
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

// F2 (2026-06-12): findApprovedAsset → shared newest-wins resolver
// (lib/agents/upstream.ts; the local copy was an unsorted `.find()` — with
// two APPROVED storyboards the Animator could plan against the stale one).

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

// Delivery-target resolution now lives in the shared leaf module
// lib/agents/delivery-targets.ts. Kept as a named alias for back-compat with the
// internal call site + animator.test.ts.
export const resolveAnimatorDeliveryTargets = resolveDeliveryTargets;

/**
 * TD-52 (2026-05-25): read the episode-level opt-in flag
 * `anchor_chain_enabled` from `episodes.metadata`. Symmetric with EREF
 * Designer runner. When `true`, Animator loads anchor-chain context and
 * authors start_anchor / end_anchor with real IMG-anchor asset_ids;
 * when false / absent, falls back to legacy single-reference path.
 */
function readAnchorChainEnabled(meta: unknown): boolean {
  if (!meta || typeof meta !== 'object') return false;
  const m = meta as Record<string, unknown>;
  return m.anchor_chain_enabled === true;
}

/**
 * TD-52 (2026-05-25): full set of anchor asset_ids Animator needs to
 * reference in its Plan body. Looked up from the DB by Animator runner —
 * the EREF Designer / Artist must have already produced and Director
 * approved these IMG-anchor_* assets, otherwise Animator falls back to
 * legacy mode with a policy_note flagging the missing anchor.
 */
interface AnimatorAnchorAssets {
  /** APPROVED IMG-anchor_<shotIdLower>_start for the current shot, or null when not yet produced/approved. */
  currentStart: { asset_id: string; filename: string } | null;
  /** APPROVED IMG-anchor_<shotIdLower>_end for the current shot. */
  currentEnd: { asset_id: string; filename: string } | null;
  /** APPROVED IMG-anchor_<priorShotIdLower>_end — used when prior boundary is a match-cut (start_anchor.role='shared'). */
  priorEnd: { asset_id: string; filename: string; shotId: string } | null;
  /** APPROVED IMG-anchor_<nextShotIdLower>_start — used when next boundary is a match-cut (end_anchor.role='shared'). */
  nextStart: { asset_id: string; filename: string; shotId: string } | null;
}

const VANIM_ANCHOR_FILENAME_RE = /-img-anchor_([a-z0-9_-]+?)_(start|end)-/i;

function shotIdToLower(shotId: string): string {
  return shotId.toLowerCase().replace(/-/g, '_');
}

/**
 * TD-52 (2026-05-25): look up the latest APPROVED IMG-anchor asset for
 * a specific shot + side. Returns null when none exist (either Designer
 * hasn't authored the anchor yet, or Director hasn't approved it).
 */
async function findApprovedAnchor(
  supabase: SupabaseClient<Database>,
  episodeId: string,
  shotId: string,
  side: 'start' | 'end',
): Promise<{ asset_id: string; filename: string } | null> {
  const shotIdLower = shotIdToLower(shotId);
  const fileTypePrefix = `IMG-anchor_${shotIdLower}_${side}`;
  const { data, error } = await supabase
    .from('assets')
    .select('id,filename,file_type,status,version')
    .eq('episode_id', episodeId)
    .eq('file_type', fileTypePrefix)
    .in('status', ['APPROVED', 'LOCKED'] as never)
    .order('version', { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  const row = data[0]!;
  return { asset_id: String(row.id), filename: String(row.filename ?? '') };
}

/**
 * TD-52 (2026-05-25): collect all four anchor asset slots Animator may
 * reference (current.start, current.end, prior.end for match-cut from
 * prior, next.start for match-cut to next). All four may be null in
 * any combination — caller decides what to do per role.
 */
async function loadAnimatorAnchorAssets(
  supabase: SupabaseClient<Database>,
  episodeId: string,
  shotId: string,
  adjacent: { prior: { shotId: string } | null; next: { shotId: string } | null },
): Promise<AnimatorAnchorAssets> {
  const [currentStart, currentEnd, priorEnd, nextStart] = await Promise.all([
    findApprovedAnchor(supabase, episodeId, shotId, 'start'),
    findApprovedAnchor(supabase, episodeId, shotId, 'end'),
    adjacent.prior
      ? findApprovedAnchor(supabase, episodeId, adjacent.prior.shotId, 'end')
      : Promise.resolve(null),
    adjacent.next
      ? findApprovedAnchor(supabase, episodeId, adjacent.next.shotId, 'start')
      : Promise.resolve(null),
  ]);
  return {
    currentStart,
    currentEnd,
    priorEnd: priorEnd && adjacent.prior
      ? { ...priorEnd, shotId: adjacent.prior.shotId }
      : null,
    nextStart: nextStart && adjacent.next
      ? { ...nextStart, shotId: adjacent.next.shotId }
      : null,
  };
}

/**
 * TD-52 (2026-05-25): user-message sections activated when
 * `anchor_chain_enabled === true`. Mirrors EREF Designer's
 * buildAnchorChainSections but tells the Animator about CONCRETE
 * anchor asset_ids it must reference (not shot_id refs as Designer
 * uses pre-generation).
 */
function buildAnimatorAnchorSections(
  ctx: AnchorChainContext,
  anchors: AnimatorAnchorAssets,
): string {
  const priorLine = ctx.adjacent_shots.prior
    ? `${ctx.adjacent_shots.prior.shotId} (role: ${ctx.adjacent_shots.prior.shotRole ?? 'unspecified'})`
    : '(none — current shot is first in narrative order)';
  const nextLine = ctx.adjacent_shots.next
    ? `${ctx.adjacent_shots.next.shotId} (role: ${ctx.adjacent_shots.next.shotRole ?? 'unspecified'})`
    : '(none — current shot is last in narrative order)';

  const currentStartLine = anchors.currentStart
    ? `asset_id: ${anchors.currentStart.asset_id} (${anchors.currentStart.filename})`
    : '(MISSING — EREF Designer/Artist has not produced an APPROVED IMG-anchor_<shot>_start for this shot yet. Use legacy fallback: leave start_anchor null and add a policy_note flagging the gap.)';
  const currentEndLine = anchors.currentEnd
    ? `asset_id: ${anchors.currentEnd.asset_id} (${anchors.currentEnd.filename})`
    : '(MISSING — same gap as above for the end side.)';

  const priorEndLine = anchors.priorEnd
    ? `asset_id: ${anchors.priorEnd.asset_id} (shot ${anchors.priorEnd.shotId}, ${anchors.priorEnd.filename})`
    : ctx.adjacent_shots.prior
      ? '(prior shot exists but no APPROVED IMG-anchor_<prior>_end found — match-cut handoff unavailable)'
      : '(no prior shot)';
  const nextStartLine = anchors.nextStart
    ? `asset_id: ${anchors.nextStart.asset_id} (shot ${anchors.nextStart.shotId}, ${anchors.nextStart.filename})`
    : ctx.adjacent_shots.next
      ? '(next shot exists but no APPROVED IMG-anchor_<next>_start found — match-cut handoff unavailable)'
      : '(no next shot)';

  const sceneMasterLine = ctx.scene_master_asset
    ? `${ctx.scene_master_asset.asset_id} (source: ${ctx.scene_master_asset.source}, ${ctx.scene_master_asset.filename ?? '(no filename)'})`
    : '(none — no SBL-scene_master_* nor LOCKED SBL-location_* found)';

  return [
    '## Anchor Chain Context (TD-49 Phase 2 — anchor_chain_enabled=true for this episode)',
    '',
    `Total shots: ${ctx.full_storyboard.length}`,
    `Current shot: ${ctx.current_shot?.shotId ?? '(unresolved)'}`,
    `Adjacent prior: ${priorLine}`,
    `Adjacent next:  ${nextLine}`,
    `Scene master:   ${sceneMasterLine}`,
    '',
    '## Anchor Assets (CONCRETE asset_ids you MUST reference in start_anchor/end_anchor)',
    '',
    `start_anchor.asset_id candidate (current shot's start): ${currentStartLine}`,
    `end_anchor.asset_id candidate (current shot's end):     ${currentEndLine}`,
    `prior shot's end_anchor (for shared-role start handoff): ${priorEndLine}`,
    `next shot's start_anchor (for shared-role end handoff):  ${nextStartLine}`,
    '',
    '## Walking-Forward Anchor Chain Authoring — output requirement',
    '',
    'Because `anchor_chain_enabled=true` for this episode, your Plan JSON MUST populate the `start_anchor` and `end_anchor` blocks with the asset_ids listed above (not null) UNLESS the candidate is MISSING.',
    '',
    'Rules:',
    '  - start_anchor.asset_id = the "current shot start" candidate above. If MISSING, set start_anchor to null + add a policy_notes entry flagging the missing anchor.',
    '  - end_anchor.asset_id = the "current shot end" candidate above. Same fallback if MISSING.',
    '  - role enum (start: establishing|shared|cut_in; end: shared|cut_out|final) per agent .md rules — choose based on adjacent shots and director-intended cut style.',
    '  - When start_anchor.role="shared": handoff_link_to = prior shot\'s end_anchor asset_id (above). When NOT "shared": handoff_link_to=null.',
    '  - When end_anchor.role="shared": handoff_link_to = next shot\'s start_anchor asset_id (above). When NOT "shared": handoff_link_to=null.',
    '  - When you set start_anchor.role="shared" populate opening_camera_motion with a designed pan/tilt/zoom (per agent .md). When end_anchor.role="shared" set closing_static_hold_seconds (0.3-0.8s typical).',
    '  - duration_seconds MUST be ≥ closing_static_hold_seconds + 0.25s opening budget if both set.',
    '',
    'If the current shot has both anchors MISSING, you may NOT author a valid anchor chain Plan — emit start_anchor: null + end_anchor: null + a clear policy_note "EREF anchors not yet approved for this shot — falling back to legacy single-reference path" and continue with the legacy end_image / reference_anchor fields.',
    '',
  ].join('\n');
}

/**
 * TD-85 (2026-06-01): DRY injection of each allowlist provider's
 * contract-supported resolutions into the Animator's input context. The
 * agent prompt (animator.md) and skill (animator/SKILL.md) refer to
 * `supported_resolutions` by ROLE; the concrete enum is sourced here from
 * the capability manifest (SSOT) so it is never hardcoded in markdown and
 * cannot drift when a provider gains/loses a resolution tier.
 */
export function buildResolutionContractBlock(): string {
  const lines = VANIM_PROVIDER_ALLOWLIST.map((alias) => {
    const { providerImpl } = resolveVanimProviderId(alias);
    const set = VIDEO_PROVIDER_CAPS[providerImpl].supports_resolutions;
    const label =
      set.length > 0
        ? `supported: ${set.join(', ')}`
        : 'fixed resolution (no chooser) → set resolution: null';
    return `  - ${alias} → ${label}`;
  });
  return [
    '## Provider resolution contracts (pick `resolution` from the chosen provider\'s set)',
    '',
    ...lines,
    '',
    'Choose the lowest cost-effective resolution for iteration / non-hero shots; the episode delivery resolution for hero / final / approved-for-render shots. For a fixed-resolution provider, set resolution: null.',
  ].join('\n');
}

/**
 * Director directive 2026-06-16: DRY injection of each allowlist provider's
 * render-duration contract [min,max] from the capability manifest (SSOT), mirroring
 * buildResolutionContractBlock. `duration_seconds` in the Plan is the RENDER duration
 * the generator produces — never a hardcoded number in markdown. Sub-floor creative
 * timing (a 1-2s comedic beat) is NOT written here: it lives in the animatic and is
 * achieved by trimming the rendered clip downstream at stitch.
 */
export function buildDurationContractBlock(): string {
  const lines = VANIM_PROVIDER_ALLOWLIST.map((alias) => {
    const { providerImpl } = resolveVanimProviderId(alias);
    const caps = VIDEO_PROVIDER_CAPS[providerImpl];
    return `  - ${alias} → render ${caps.min_duration_s}-${caps.max_duration_s}s`;
  });
  return [
    '## Provider render-duration contracts (set `duration_seconds` within the chosen provider\'s range)',
    '',
    ...lines,
    '',
    '`duration_seconds` is the RENDER duration — what the generator produces — and MUST lie in the chosen provider\'s [min,max] above. Do NOT write a sub-floor number to express a short beat: the creative CUT length lives in the animatic, and the rendered clip is trimmed to it downstream. (The runner re-clamps deterministically; author it in range so the Critic does not flag a mismatch.)',
  ].join('\n');
}

function buildAspectTable(targets: readonly string[]): string {
  const rows = targets.map((slug) => {
    const aspect = ASPECT_BY_DELIVERY_TARGET[slug];
    if (!aspect) return `  - ${slug}: (no mapping — flag policy_note)`;
    return `  - ${slug}: ${aspect}`;
  });
  return rows.join('\n');
}

/**
 * Episode-authoritative FORMAT block (2026-06-17). Surfaces the binding
 * provider/aspect/quality/resolution the episode declared + the allow_shot_overrides
 * semantics. Role-neutral so BOTH the Animator (authoring guidance) and its Critic
 * (validation rule) inject the same source of truth. Returns '' for un-configured
 * episodes (no new prose → legacy prompt unchanged). Secondary to the deterministic
 * producer conform — guidance, not the guarantee.
 */
export function buildEpisodeFormatAuthorityBlock(cfg: EpisodeVideoConfig | null): string {
  if (!cfg) return '';
  // The episode stores provider in IMPL vocab (seedance-fal-img2vid / veo-3-img2vid),
  // but the Plan + allowlist speak ALIAS vocab. Translate so the LLM (and its Critic)
  // see acceptable aliases, NOT the impl string (which would read as a mismatch /
  // off-allowlist value). One impl+quality can map to >1 alias.
  const providerLine = cfg.provider_id
    ? `  - provider: ${episodeProviderAliases(cfg.provider_id, cfg.quality_tier ?? null).join(' OR ')}`
    : null;
  const fields = [
    providerLine,
    cfg.aspect_ratio ? `  - aspect_ratio: ${cfg.aspect_ratio}` : null,
    cfg.quality_tier ? `  - quality_tier: ${cfg.quality_tier}` : null,
    cfg.resolution ? `  - resolution: ${cfg.resolution}` : null,
  ].filter(Boolean) as string[];
  if (fields.length === 0) return '';
  const overrides = cfg.allow_shot_overrides === true;
  return [
    '## Episode FORMAT authority (single source of truth)',
    '',
    ...fields,
    '',
    overrides
      ? '`allow_shot_overrides` is ON — a per-shot FORMAT choice MAY override the values above; the shot override is legitimate and wins.'
      : '`allow_shot_overrides` is OFF — these episode values are BINDING. The Plan\'s provider/aspect/quality/resolution MUST equal them (the runner deterministically conforms any mismatch). A "Director hard-contract" must NOT be claimed for any FORMAT value — these come from the episode config, not from the Animator.',
  ].join('\n');
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
  directorOverrides?: ReadonlyArray<DirectorOverride>;
  /** TD-52 (2026-05-25): anchor chain context — present iff anchor_chain_enabled + supabase available. */
  anchorChainContext?: AnchorChainContext | null;
  /** TD-52 (2026-05-25): concrete IMG-anchor asset_id lookups for current shot + adjacent boundaries. */
  anchorAssets?: AnimatorAnchorAssets | null;
  /** 2026-06-17: episode-authoritative FORMAT — surfaced so the LLM matches it. */
  episodeVideoConfig?: EpisodeVideoConfig | null;
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
    directorOverrides,
    anchorChainContext,
    anchorAssets,
    episodeVideoConfig,
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
    buildResolutionContractBlock(),
    '',
    buildDurationContractBlock(),
    '',
    buildEpisodeFormatAuthorityBlock(episodeVideoConfig ?? null),
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
    directorOverrides && directorOverrides.length > 0
      ? [
          '## Director-authorized check waivers (TD-74)',
          '',
          'The following Critic checks have been waived by the Director (or an',
          "authorised delegate) at the trigger event-payload layer. The Critic",
          'will treat them as non-blocking. You should:',
          '',
          '1. Continue to author the Plan with the creative content the waiver',
          '   was granted FOR (e.g. waiver of V04 allows multi-beat action arc).',
          '2. Add a matching entry to `policy_notes[]` for traceability, like:',
          '   `"director-waiver: <CHECK> — upstream-authorized via event.directorOverrides — <rationale>"`.',
          '3. Do NOT use this as authority to skip OTHER checks — only the listed ones are waived.',
          '',
          '```json',
          JSON.stringify(directorOverrides, null, 2),
          '```',
          '',
        ].join('\n')
      : '',
    anchorChainContext && anchorAssets
      ? buildAnimatorAnchorSections(anchorChainContext, anchorAssets)
      : '',
    'Output: markdown narrative + ONE fenced JSON code block per system contract. Do not omit the JSON.',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function runAnimator(args: VANIMRunArgs): Promise<VANIMRunResult> {
  const { inputs, shotId, revisionNote, supabase } = args;
  const directorOverrides: ReadonlyArray<DirectorOverride> = Array.isArray(args.directorOverrides)
    ? args.directorOverrides.filter(
        (o): o is DirectorOverride =>
          o !== null &&
          typeof o === 'object' &&
          typeof (o as DirectorOverride).check === 'string' &&
          typeof (o as DirectorOverride).rationale === 'string' &&
          (o as DirectorOverride).check.trim().length > 0,
      )
    : [];
  if (!shotId || typeof shotId !== 'string') {
    throw new AnimatorError('shotId is required');
  }

  const ep = inputs.episode as (EpisodeLike & { id?: string }) | undefined;
  const episodeCode = ep?.episode_code ?? 'UNKNOWN';
  const episodeTitle = ep?.title_working ?? 'Untitled';
  // Episode-authoritative FORMAT (provider/aspect/quality/resolution). Reused by
  // both the prompt block (so the LLM matches) and the post-LLM conform (the hard
  // guarantee). null → un-configured episode → legacy passthrough everywhere.
  const episodeVideoConfig = readEpisodeVideoConfig(inputs.episode);

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

  // ── TD-52 (2026-05-25) anchor chain context ─────────────────────────────
  // Load shot-scoped anchor context + DB-resolve concrete IMG-anchor
  // asset_ids when episode opts in. Symmetric with EREF Designer runner
  // P2.3 but Animator references already-generated anchors instead of
  // authoring shot_id refs.
  let anchorChainContext: AnchorChainContext | null = null;
  let anchorAssets: AnimatorAnchorAssets | null = null;
  const anchorChainEnabled = readAnchorChainEnabled(ep?.metadata);
  const episodeIdResolved =
    typeof ep?.id === 'string' && ep.id.length > 0 ? ep.id : null;
  if (anchorChainEnabled && supabase && episodeIdResolved) {
    try {
      anchorChainContext = await loadAnchorChainContext({
        supabase,
        episodeId: episodeIdResolved,
        shotId,
      });
      anchorAssets = await loadAnimatorAnchorAssets(
        supabase,
        episodeIdResolved,
        shotId,
        {
          prior: anchorChainContext.adjacent_shots.prior
            ? { shotId: anchorChainContext.adjacent_shots.prior.shotId }
            : null,
          next: anchorChainContext.adjacent_shots.next
            ? { shotId: anchorChainContext.adjacent_shots.next.shotId }
            : null,
        },
      );
      const presentSides: string[] = [];
      if (anchorAssets.currentStart) presentSides.push('start');
      if (anchorAssets.currentEnd) presentSides.push('end');
      notes.push(
        `Anchor chain mode active: ${anchorChainContext.full_storyboard.length} shots, ${anchorChainContext.prior_anchors.length} prior anchors, scene_master ${anchorChainContext.scene_master_asset ? 'present' : 'absent'}, current shot anchors present: [${presentSides.join(', ') || 'none'}]`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      notes.push(`Anchor chain load failed (${msg.slice(0, 100)}) — falling back to legacy mode`);
      anchorChainContext = null;
      anchorAssets = null;
    }
  } else if (anchorChainEnabled) {
    notes.push(
      'Anchor chain enabled but supabase/episodeId unavailable — Animator skips anchor authoring',
    );
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
    erefAssetId,
    revisionNote,
    directorOverrides,
    anchorChainContext,
    anchorAssets,
    episodeVideoConfig,
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

  // Deterministic FORMAT + render-duration + cost conform (Director 2026-06-16 / 2026-06-17):
  // make the Plan valid-by-construction so the Critic never bounces and the Plan ==
  // what render will actually produce. Two guarantees:
  //   • FORMAT (provider/aspect/quality/resolution) is conformed to the EPISODE
  //     authority via the SAME resolver the render path uses (resolveVideoParams),
  //     honouring `allow_shot_overrides` — NOT hardcoding "episode wins".
  //   • `duration_seconds` (RENDER duration) is clamped into the RESOLVED provider's
  //     [min,max]; `estimated_cost_usd` recomputed from the manifest.
  // No episode config → resolver echoes the LLM's own values → legacy passthrough.
  // Off-allowlist provider → skip (Critic REVISEs separately).
  let finalMarkdown = result.markdown;
  let finalBody: Record<string, unknown> = result.body;
  if (providerId && (VANIM_PROVIDER_ALLOWLIST as readonly string[]).includes(providerId)) {
    try {
      const original = resolveVanimProviderId(providerId);

      const planQualityRaw = (result.body as { quality_tier?: unknown }).quality_tier;
      const planQuality: 'fast' | 'standard' =
        planQualityRaw === 'fast' || planQualityRaw === 'standard' ? planQualityRaw : original.qualityTier;
      const planResRaw = (result.body as { resolution?: unknown }).resolution;
      const planRes: '480p' | '720p' | '1080p' | null =
        planResRaw === '480p' || planResRaw === '720p' || planResRaw === '1080p' ? planResRaw : null;
      const planAspectRaw = (result.body as { aspect_ratio?: unknown }).aspect_ratio;
      const planAspect: '16:9' | '9:16' | '1:1' | null =
        planAspectRaw === '16:9' || planAspectRaw === '9:16' || planAspectRaw === '1:1' ? planAspectRaw : null;

      // Same call shape as the render path (runner.ts). With no episode config the
      // resolver returns the shot (LLM) values unchanged → legacy passthrough.
      const seriesId = (ep as { series_id?: string | null } | undefined)?.series_id ?? null;
      const resolved = resolveVideoParams({
        episodeConfig: episodeVideoConfig,
        shotOverride: {
          provider_id: original.providerImpl,
          aspect_ratio: planAspect,
          quality_tier: planQuality,
          resolution: planRes,
        },
        assignmentProviderId: null,
        seriesDefaults: episodeVideoConfig && supabase ? await getVgenDefaults(supabase, seriesId) : null,
        deliveryAspect: deliveryAspectFor([...deliveryTargets]),
      });

      // Reverse-map resolved provider → plan alias; keep the LLM alias when family +
      // quality are unchanged (preserves seedance-with-end-image's end-image intent).
      const familyOrQualityChanged =
        resolved.providerId !== original.providerImpl || resolved.qualityTier !== original.qualityTier;
      const finalAlias = familyOrQualityChanged
        ? vanimAliasFor(resolved.providerId, resolved.qualityTier, original.prefersEndImage)
        : providerId;

      const caps = VIDEO_PROVIDER_CAPS[resolved.providerId];
      const rawDur = (result.body as { duration_seconds?: unknown }).duration_seconds;
      const clampedDur =
        typeof rawDur === 'number' && Number.isFinite(rawDur) && rawDur > 0
          ? clampRenderDuration(caps, rawDur)
          : null;
      const recomputedCost =
        clampedDur !== null
          ? Math.round(
              estimateCost(caps, {
                quality_tier: resolved.qualityTier,
                duration_seconds: clampedDur,
                ...(resolved.resolution ? { resolution: resolved.resolution } : {}),
              }) * 1000,
            ) / 1000
          : null;
      const priorCost = (result.body as { estimated_cost_usd?: unknown }).estimated_cost_usd;

      // Conform aspect only when the LLM authored one (never inject a missing field —
      // keeps un-configured episodes byte-for-byte; render fills aspect anyway).
      const aspectChanged = planAspect !== null && resolved.aspectRatio !== planAspect;
      const resChanged = (resolved.resolution ?? null) !== planRes;
      const qualityChanged = resolved.qualityTier !== planQuality;
      const providerChanged = finalAlias !== providerId;
      const formatChanged = aspectChanged || resChanged || qualityChanged || providerChanged;
      const durChanged = clampedDur !== null && clampedDur !== rawDur;
      const costChanged = recomputedCost !== null && priorCost !== recomputedCost;

      // A fabricated "Director hard-contract" FORMAT claim must be scrubbed even when
      // the LLM already authored the correct (conformed) value — FORMAT is episode-
      // authoritative, never a Director hard-contract the Animator can claim. Gated on
      // the episode declaring FORMAT (so un-configured episodes stay byte-for-byte).
      const FAB_FORMAT_RE = /Director hard-contract honoured.*(resolution|provider|aspect|quality)/i;
      const existingPolicyNotes = Array.isArray((result.body as { policy_notes?: unknown }).policy_notes)
        ? (result.body as { policy_notes: unknown[] }).policy_notes.filter(
            (n): n is string => typeof n === 'string',
          )
        : null;
      const scrubNeeded =
        episodeVideoConfig !== null &&
        existingPolicyNotes !== null &&
        existingPolicyNotes.some((n) => FAB_FORMAT_RE.test(n));

      if (formatChanged || durChanged || costChanged || scrubNeeded) {
        const patch: ShotPlanPatch = {};
        if (providerChanged) patch.providerId = finalAlias;
        if (qualityChanged) patch.qualityTier = resolved.qualityTier;
        if (resChanged) patch.resolution = resolved.resolution; // may be null (Veo fixed-res)
        if (aspectChanged) patch.aspectRatio = resolved.aspectRatio;
        if (durChanged && clampedDur !== null) patch.durationSeconds = clampedDur;
        if (costChanged && recomputedCost !== null) patch.estimatedCostUsd = recomputedCost;

        let scrubbedNotes: string[] | undefined;
        if ((formatChanged || scrubNeeded) && existingPolicyNotes !== null) {
          scrubbedNotes = existingPolicyNotes.filter((n) => !FAB_FORMAT_RE.test(n));
          scrubbedNotes.push(
            `Rationale (Animator): FORMAT is episode-authoritative (allow_shot_overrides=${episodeVideoConfig?.allow_shot_overrides === true}); any "Director hard-contract" claim on FORMAT was removed.`,
          );
          patch.policyNotes = scrubbedNotes;
        }

        finalMarkdown = serializeShotPlanContract(result.markdown, patch);
        finalBody = { ...result.body };
        if (patch.providerId) {
          const prevProv =
            typeof result.body.provider === 'object' && result.body.provider
              ? (result.body.provider as Record<string, unknown>)
              : {};
          finalBody.provider = { ...prevProv, id: patch.providerId };
        }
        if (patch.qualityTier) finalBody.quality_tier = patch.qualityTier;
        if (patch.resolution !== undefined) finalBody.resolution = patch.resolution;
        if (patch.aspectRatio) finalBody.aspect_ratio = patch.aspectRatio;
        if (patch.durationSeconds !== undefined) finalBody.duration_seconds = patch.durationSeconds;
        if (patch.estimatedCostUsd !== undefined) finalBody.estimated_cost_usd = patch.estimatedCostUsd;
        if (scrubbedNotes) finalBody.policy_notes = scrubbedNotes;

        if (durChanged) {
          notes.push(
            `Render duration clamped ${rawDur}s → ${clampedDur}s for provider ${resolved.providerId} [${caps.min_duration_s},${caps.max_duration_s}]; creative cut stays in the animatic.`,
          );
        }
        if (formatChanged) {
          notes.push(
            `FORMAT conformed to episode authority: provider=${finalAlias}, quality=${resolved.qualityTier}, resolution=${resolved.resolution ?? 'provider-default'}, aspect=${resolved.aspectRatio} (sources ${resolved.source.provider}/${resolved.source.quality}/${resolved.source.resolution}).`,
          );
        }
      }
    } catch (conformErr) {
      // Non-fatal: keep the LLM's markdown/body; the runner re-resolves at dispatch.
      notes.push(
        `FORMAT/duration conform skipped (${conformErr instanceof Error ? conformErr.message.slice(0, 80) : 'error'})`,
      );
    }
  }

  const aspect = (finalBody as { aspect_ratio?: unknown }).aspect_ratio;
  const duration = (finalBody as { duration_seconds?: unknown }).duration_seconds;
  const estCost = (finalBody as { estimated_cost_usd?: unknown }).estimated_cost_usd;

  const description = [
    `Plan by EXEC-VANIM · ${VANIM_CONTRACT} · ${result.model}`,
    providerId ? `· provider=${providerId}` : '',
    typeof aspect === 'string' ? `· ${aspect}` : '',
    typeof duration === 'number' ? `· ${duration}s` : '',
    typeof estCost === 'number' ? `· est $${estCost.toFixed(3)}` : '',
    `· cost $${result.costUsd.toFixed(4)}`,
  ]
    .filter(Boolean)
    .join(' ');

  return {
    markdown: finalMarkdown,
    body: finalBody,
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
