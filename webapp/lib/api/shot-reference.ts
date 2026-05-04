// ──────────────────────────────────────────────────────────────────────────────
// lib/api/shot-reference.ts
// Types for `assets.metadata.shot_reference` — the EREF v2 contract that
// turns each IMG-episode_ref asset into a structured "visual test unit"
// instead of just a generated image.
//
// Contract id: `episode_references@v2`. Stored as JSONB sub-document in the
// existing `assets.metadata` column (migration 0020), so no schema change is
// required. Legacy IMG-episode_ref rows from @v1 contract have
// `metadata.shot_reference == null` — surfaces that read this struct must
// fall back to the v1 fields (provider_used, image_prompt.history, etc.).
//
// Consumed by:
//   - lib/agents/runners/episode-references.ts (Phase E loop writes it)
//   - lib/agents/runners/eref-check.ts (Phase D reviewer fills review)
//   - components/assets/AssetDetailDrawer.tsx (Phase F QC console renders it)
// ──────────────────────────────────────────────────────────────────────────────

import type { GovernanceModeNum } from './series-bible';

export const SHOT_REFERENCE_CONTRACT = 'episode_references@v2';
export type ShotReferenceContractId = typeof SHOT_REFERENCE_CONTRACT;

// ── Shot composition (what the test plan describes) ─────────────────────────

/** Three discrete roles a character can play in a shot. */
export type ShotCharacterRole = 'subject' | 'co-star' | 'background';

/** One character in the shot's test plan, anchored to a Bible LOCKED entry. */
export interface ShotCharacterTestPlan {
  /** Bible character slug, verbatim (e.g. "sandy_hourglass"). */
  bible_slug: string;
  /**
   * Asset id of the LOCKED Bible character image. Becomes the identity
   * anchor that providers feed as a reference. Null only if the Bible has a
   * description but no LOCKED reference image (rare; Phase D reviewer falls
   * back to text-only check).
   */
  identity_anchor_asset_id: string | null;
  /** One short noun phrase: "smitten", "panicked", "dignified composure". */
  expected_emotion: string;
  /** One short verb phrase: "leaning forward toward vial". */
  expected_action: string;
  /** subject = main focus; co-star = also active; background = visible/passive. */
  role_in_shot: ShotCharacterRole;
}

/**
 * Test plan for a shot — derived from storyboarder@v2 fields. EREF v2 stores
 * a snapshot here so review history stays correct even if the storyboard is
 * later regenerated (cascade-staleness, see technology.md §2).
 */
export interface ShotTestPlan {
  characters: ShotCharacterTestPlan[];
  /** Asset id of LOCKED Bible location image — anchored when present. */
  location_anchor_asset_id: string | null;
  /** Asset id of LOCKED Bible style image / spec. Required for a v2 run. */
  style_anchor_asset_id: string;
  /** One sentence describing the visual gag, OR null if shot is setup/transition. */
  expected_gag: string | null;
  /** Storyboard `shot_role` enum — used by reviewer to pick QC criteria. */
  shot_role: string;
}

// ── Generation result history (per attempt: pipeline, auto_regen, director_edit, auto_upscale) ───

export type GenerationTriggeredBy =
  | 'pipeline'         // first generation when EREF runner fires
  | 'auto_regen'       // AI-reviewer requested regenerate
  | 'director_edit'    // Director edited prompt or switched provider
  | 'auto_upscale';    // Phase E.5 upscale step after AI-APPROVE

/** One reference image fed into the provider for this generation. */
export interface ReferenceUsed {
  kind: 'identity' | 'location' | 'style';
  bible_asset_id: string;
  /** 0..1 — only meaningful for providers that support per-ref weighting. */
  weight?: number;
}

/** One generation attempt — appended to generation_history. */
export interface GenerationAttempt {
  /** 1-based version counter inside this shot_reference. Grows with retries. */
  version: number;
  provider_id: string;
  model: string;
  prompt: string;
  references_used: ReferenceUsed[];
  /** Provider-specific text↔image balance, 0..1. Null if unsupported. */
  strength: number | null;
  cost_usd: number;
  /** Browser-fetchable URL — same shape as PersistedBinary.browserUrl. */
  image_url: string;
  drive_file_id: string | null;
  drive_web_view_url: string | null;
  /** Output dimensions — used to detect 4K vs sub-4K. */
  width: number;
  height: number;
  /** True iff width >= 3840 OR height >= 3840 (i.e. post-upscale image). */
  is_4k: boolean;
  /** ISO 8601 timestamp. */
  at: string;
  triggered_by: GenerationTriggeredBy;
  /** Governance mode at the moment of this attempt — audit trail. */
  mode_at_time: GovernanceModeNum;
}

// ── AI reviewer verdict (post-generation, mirrors StyleCheckResult) ──────────

export type EREFReviewVerdict = 'APPROVE' | 'REGENERATE' | 'HUMAN_REVIEW';

export type EREFReviewIssueArea =
  | 'character_identity'  // "Sandy doesn't look like Bible Sandy"
  | 'emotion'             // "expected smitten, image shows blank"
  | 'action'              // "expected falling backward, image shows standing"
  | 'composition'         // "two characters not in same frame"
  | 'style'               // "outline thickness wrong for series style"
  | 'extraneous'          // "extra chair in frame not in storyboard"
  | 'gag';                // "punchline gesture not readable"

export type EREFReviewSeverity = 'CRITICAL' | 'MAJOR' | 'MINOR';

export interface EREFReviewIssue {
  area: EREFReviewIssueArea;
  /** Bible slug — null for shot-level issues (composition, style, extraneous). */
  character_slug: string | null;
  severity: EREFReviewSeverity;
  description: string;
  fix_hint: string;
}

/** Reviewer output for the latest generation attempt. */
export interface EREFReview {
  verdict: EREFReviewVerdict;
  /** 0-100 — identity match against Bible character refs. */
  consistency_score: number;
  /** 0-100 — average expected-emotion fidelity across characters. */
  emotion_alignment_score: number;
  /** 0-100 — physical action readability. */
  action_clarity_score: number;
  /** 0-100 — visual joke readability. Null when shot has no expected_gag. */
  gag_readability_score: number | null;
  /** 0-100 — adherence to LOCKED style anchor. */
  style_match_score: number;
  /** Free-text descriptions of any extra objects in frame. Empty = clean. */
  extraneous_objects: string[];
  issues: EREFReviewIssue[];
  /** Provider-tunable rewritten prompt for auto-regen. Null = no actionable fix. */
  suggested_prompt_v2: string | null;
  reviewer_model: string;
  reviewer_cost_usd: number;
  at: string;
}

// ── Retry book-keeping ──────────────────────────────────────────────────────

export interface RetryEntry {
  at: string;
  /** Why we re-ran — usually "AI verdict REGENERATE" or "Director SWITCH PROVIDER". */
  reason: string;
  /** Verdict immediately before this retry started. */
  verdict_before_retry: EREFReviewVerdict;
}

// ── Top-level metadata.shot_reference shape ─────────────────────────────────

export interface ShotReferenceContract {
  contract: ShotReferenceContractId;
  shot_id: string;
  shot_role: string;

  /** What the shot must contain — derived from storyboarder@v2 at run time. */
  test_plan: ShotTestPlan;

  /** Every generation attempt, oldest first. Length grows on retry/regen/upscale. */
  generation_history: GenerationAttempt[];

  /** AI-reviewer verdict on the latest non-upscale generation. Null between gen and review. */
  review: EREFReview | null;

  /** Retry counter — capped by EREF_MAX_RETRIES (2). */
  retry_count: number;
  retry_history: RetryEntry[];

  /**
   * URL of the 4K upscaled image for downstream stages (Animatic, VGEN).
   * Set after Phase E.5 auto_upscale attempt completes. Null if upscale was
   * disabled (`app_config.eref_upscale_enabled = false`) or has not run yet.
   */
  final_4k_url: string | null;
}

// ── Type guards ─────────────────────────────────────────────────────────────

/** True iff this asset's metadata is in EREF v2 contract shape. */
export function isShotReferenceV2(meta: unknown): meta is { shot_reference: ShotReferenceContract } {
  if (!meta || typeof meta !== 'object') return false;
  const sr = (meta as { shot_reference?: unknown }).shot_reference;
  if (!sr || typeof sr !== 'object') return false;
  return (sr as { contract?: string }).contract === SHOT_REFERENCE_CONTRACT;
}
