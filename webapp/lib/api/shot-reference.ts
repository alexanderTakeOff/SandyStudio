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
import type { OnModelResult } from './on-model';

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
  /**
   * Canon props in frame (2026-06-14). Slugs from the storyboard `props_in_frame`
   * resolved against cast-scoped `SBL-object_*` canon — drives object reference
   * attachment + lets the reviewer flag a prop that drifted from its canon.
   */
  objects?: Array<{ slug: string; description?: string }>;
}

// ── Generation result history (per attempt: pipeline, auto_regen, director_edit, auto_upscale) ───

export type GenerationTriggeredBy =
  | 'pipeline'         // first generation when EREF runner fires
  | 'auto_regen'       // AI-reviewer requested regenerate
  | 'director_edit'    // Director edited prompt or switched provider
  | 'auto_upscale';    // Phase E.5 upscale step after AI-APPROVE

/**
 * One reference image fed into the provider for this generation.
 *
 * TD-30 (2026-05-21): added `scene_continuity` kind — when Designer detects
 * a prior APPROVED IMG-episode_ref in the same location, it embeds that
 * asset as a 4th anchor (alongside identity/location/style) to stabilise
 * spatial layout across shots. Reduces trumeau-drift / furniture-drift
 * observed across SH01-SH06 of SS-S15-E01. `bible_asset_id` for this kind
 * is the prior IMG asset id, NOT a Bible-locked image — naming preserved
 * for backward compatibility with @v1/@v2 readers.
 */
export interface ReferenceUsed {
  // TD-33 (2026-05-22): `temporal_continuity` added alongside spatial scene_continuity.
  // 2026-06-14: `object` added — per-shot canon prop ref.
  kind:
    | 'identity'
    | 'location'
    | 'style'
    | 'scene_continuity'
    | 'temporal_continuity'
    | 'object';
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
  /**
   * Reviewer verdict for THIS attempt (2026-07-16, Director keep-best). Previously
   * only the LAST attempt's review was retained on the shot; storing it per attempt
   * lets the loop keep the BEST-scoring attempt on retry-exhaustion (not blindly the
   * last, which prompt-drift often makes the worst) and lets the UI show each
   * attempt's score so the Director can see which one is canon.
   */
  review?: EREFReview;
  /** Mean of the reviewer's non-null 0-100 scores for this attempt. */
  composite_score?: number;
  /** Count of CRITICAL-severity issues in this attempt's review. */
  critical_count?: number;
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
  reviewer_model: string;
  reviewer_cost_usd: number;
  at: string;
}

/** Keep-first threshold (Director 2026-07-16): an attempt is "clean enough to keep"
 *  when it has no CRITICAL issue AND its composite score ≥ this.
 *
 *  85 → 70 (Director, 2026-07-29, E33 audit): across 63 paid generations of E33 the
 *  BEST composite the reviewer ever returned was 77, so the gate never once fired and
 *  every shot went to retry-exhaustion by construction — the machine that made each
 *  retry worse was fed by a bar nothing could clear. */
export const KEEP_ATTEMPT_SCORE_THRESHOLD = 70;

/**
 * Score an attempt's review: `composite` = mean of the reviewer's non-null 0-100
 * scores (gag_readability is null on gag-less shots and is excluded, not counted as
 * 0); `criticalCount` = CRITICAL-severity issues. The basis of the keep-first /
 * keep-best gate. Pure.
 */
export function reviewComposite(review: EREFReview): { composite: number; criticalCount: number } {
  const scores = [
    review.consistency_score,
    review.emotion_alignment_score,
    review.action_clarity_score,
    review.gag_readability_score,
    review.style_match_score,
  ].filter((s): s is number => typeof s === 'number');
  const composite = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const criticalCount = review.issues.filter((i) => i.severity === 'CRITICAL').length;
  return { composite, criticalCount };
}

/** True when an attempt clears the keep-first bar (no CRITICAL, composite ≥ threshold). */
export function attemptClearsKeepBar(composite: number, criticalCount: number): boolean {
  return criticalCount === 0 && composite >= KEEP_ATTEMPT_SCORE_THRESHOLD;
}

/**
 * Keep-best on retry-exhaustion. Ranks CLEAN over high-scoring: fewer CRITICAL
 * issues wins first, and only among equal critical-counts does the higher
 * `composite_score` win. Ties resolve to the EARLIER attempt (prompt-drift makes
 * later attempts riskier). Null for an empty list.
 *
 * Why critical-count first (E30 SH13, 2026-07-17): the old score-only rank shipped
 * v1 (75.8, CRIT1) over the clean v2 (73.4, CRIT0) — a higher score carried a
 * CRITICAL to screen when a clean attempt existed. A CRITICAL is a hard defect;
 * a couple of composite points are not worth shipping one.
 */
export function pickBestAttempt(
  attempts: readonly GenerationAttempt[],
): GenerationAttempt | null {
  let best: GenerationAttempt | null = null;
  for (const a of attempts) {
    if (best === null) {
      best = a;
      continue;
    }
    const aCrit = a.critical_count ?? 0;
    const bCrit = best.critical_count ?? 0;
    if (aCrit < bCrit) best = a;
    else if (aCrit === bCrit && (a.composite_score ?? -1) > (best.composite_score ?? -1)) best = a;
  }
  return best;
}

/**
 * The single canonical "which attempt is the primary reference" derivation — the
 * attempt whose pixels the asset's main preview shows and the AI critic judged.
 * Every surface (drawer candidates strip, preview header badge, cache-bust key)
 * MUST agree on this, or the UI's "current" indicator points at a different tile
 * than the image on screen.
 *
 * Precedence:
 *   1. `selected_version` — the Director's manual variant pick (select_attempt).
 *   2. `image_prompt.current_version` — the attempt the keep-best loop SHIPPED.
 *      Under keep-best (2026-07-16/17) this is the BEST-scoring attempt, which is
 *      frequently NOT the last (prompt-drift degrades later retries). Passing it
 *      is what stops the badge from chasing the last attempt.
 *   3. the last attempt in `generation_history` — legacy rows with no current_version.
 *
 * `imagePromptCurrentVersion` is threaded in (not read off `shot_reference`) because
 * it lives in the sibling `metadata.image_prompt` sub-doc, not in this contract.
 */
export function primaryAttemptVersion(
  // Structural minimum so both the strictly-typed drawer and the loosely-typed
  // preview header (inline metadata shape) can call it without a cast.
  sr: {
    selected_version?: number | null;
    generation_history?: ReadonlyArray<{ version?: number | null }> | null;
  },
  imagePromptCurrentVersion?: number | null,
): number | null {
  if (typeof sr.selected_version === 'number') return sr.selected_version;
  if (typeof imagePromptCurrentVersion === 'number') return imagePromptCurrentVersion;
  const h = sr.generation_history ?? [];
  const last = h.length > 0 ? h[h.length - 1]?.version : null;
  return typeof last === 'number' ? last : null;
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

  /**
   * Timeline-as-home (2026-07-02): when the Director manually picks one of the
   * generation_history attempts as the primary reference, this points at that
   * attempt's `version` — an in-place pointer, NOT a duplicated history entry.
   * Null / undefined = the primary is the attempt the keep-best loop shipped
   * (`image_prompt.current_version`), NOT necessarily the latest. Cleared back to
   * null on any fresh generation (reroll/regen) so the pointer can never dangle
   * past a new attempt. Consumers MUST derive the primary version via
   * `primaryAttemptVersion(shot_reference, image_prompt.current_version)` — a bare
   * `selected_version ?? generation_history.at(-1)` is WRONG under keep-best (best ≠ last).
   */
  selected_version?: number | null;

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

  /**
   * TD-30 (2026-05-21): bible-locked location slug for this shot (verbatim
   * from storyboard JSON, e.g. "bedroom_main", "kitchen_morning"). Stored
   * here so later queries can look up "latest APPROVED IMG-episode_ref in
   * the same location for this episode" without string-splitting filenames.
   * Null only for legacy @v2 rows generated before this field shipped, or
   * for shots whose storyboard has no resolvable location.
   */
  location_slug?: string | null;

  /**
   * Фаза frame_role (2026-07-04): which video frame this EREF conditions when
   * fed to Seedance img2vid — 'start' (→ image_url, the FIRST frame; the default)
   * or 'end' (→ end_image_url, the FINAL frame the clip arrives at). Set by the
   * EREF Designer from the storyboard beat: a closing/landing/settle pose whose
   * natural image is the shot's ENDING gets 'end', so the video is generated
   * TOWARD it instead of animating away from it (E14 SH20 root cause). Absent on
   * legacy rows ⇒ treated as 'start' everywhere.
   */
  frame_role?: 'start' | 'end';

  /**
   * On-model gate verdict (2026-07-17), FROZEN at generation time. The focused
   * identity detector judges silhouette + body material/transparency against the
   * Bible character canon, and `decideOnModel` turns those axes into PASS/FAIL
   * under the episode's `on_model_strictness`. The reconciler reads ONLY
   * `on_model.verdict`: FAIL → bounce to the Director (keep REVIEW + escalate);
   * PASS or absent → today's creative approve path (fail-open). Absent on legacy
   * rows and on `loose` episodes where the gate is off.
   */
  on_model?: OnModelResult;
}

// ── Type guards ─────────────────────────────────────────────────────────────

/** True iff this asset's metadata is in EREF v2 contract shape. */
export function isShotReferenceV2(meta: unknown): meta is { shot_reference: ShotReferenceContract } {
  if (!meta || typeof meta !== 'object') return false;
  const sr = (meta as { shot_reference?: unknown }).shot_reference;
  if (!sr || typeof sr !== 'object') return false;
  return (sr as { contract?: string }).contract === SHOT_REFERENCE_CONTRACT;
}
