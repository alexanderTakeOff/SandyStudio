// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/runners/episode-reference-freshness.ts
//
// TD-35 (q7a sprint, 2026-05-22) — Plan continuity-anchor freshness check.
//
// The problem this closes:
//   When a Reference Plan (`SPC-ref_plan-*`) is authored, the Designer resolves
//   `continuity_anchors[]` against the assets table AT THAT MOMENT. If, after
//   the Plan is APPROVED, a newer APPROVED IMG-episode_ref lands for the same
//   location (spatial anchor) or shot (temporal anchor), the Plan's anchor
//   becomes STALE — but `regenerateImageFromPlan` would still consume the
//   Plan verbatim and pass the stale anchor into the multi-image edit call,
//   reproducing the wrong continuity.
//
// Live example from SS-S15-E01 smoke (2026-05-22):
//   - SH20 v01 IMG approved with anchor pointing at SH19's bedroom shot.
//   - SH20 v02 IMG approved (Director re-shot for continuity fix).
//   - SH21 Plan resolved its anchor BEFORE SH20 v02 existed.
//   - User requestRevision on SH21 v01 IMG → re-run with SH21 Plan →
//     anchor still pointed at the pre-SH20-v02 version → wrong continuity.
//
// Guard policy (Director ruling q9a): HARD FAIL with `PLAN_ANCHOR_STALE`.
// The REST guard surfaces a ValidationError synchronously so Polина sees an
// actionable message naming `regenerateRefPlan` as the next step. The
// executor guard is defense-in-depth.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../supabase/types.gen';
import {
  findLatestApprovedImgByLocation,
  findLatestApprovedImgByShotId,
} from './episode-reference-designer';
import type { ContinuityAnchor, ContinuityAnchorKind } from './episode-references';

/** One stale anchor entry — surfaced in errors so callers can name the fix. */
export interface StaleAnchorEntry {
  kind: ContinuityAnchorKind;
  /** asset_id the Plan was authored against. */
  planAnchorAssetId: string;
  /** Newer APPROVED asset that now sits at the same scope (latestAssetId). */
  latestAssetId: string | null;
  /** Why we flagged this entry — auditing aid. */
  reason:
    | 'anchor_no_longer_approved'
    | 'newer_approved_asset_at_same_scope'
    | 'anchor_asset_missing';
}

/** Per-anchor outcome. Discriminated by `ok`. */
export interface AnchorFreshnessResult {
  ok: boolean;
  stale: ReadonlyArray<StaleAnchorEntry>;
}

interface AnchorMetadataView {
  status: string | null;
  locationSlug: string | null;
  shotId: string | null;
}

/**
 * Fetch the anchor asset row to learn (a) its current status, (b) which
 * spatial/temporal scope it lives in. Returns null when the asset can't be
 * read at all — caller treats null as `anchor_asset_missing` (stale).
 */
async function loadAnchorMetadataView(
  supabase: SupabaseClient<Database>,
  anchorAssetId: string,
): Promise<AnchorMetadataView | null> {
  const { data, error } = await supabase
    .from('assets')
    .select('id,status,metadata')
    .eq('id', anchorAssetId)
    .maybeSingle();
  if (error || !data) return null;
  const meta = (data.metadata ?? null) as
    | { shot_reference?: { location_slug?: unknown; shot_id?: unknown } }
    | null;
  const sr = meta?.shot_reference ?? null;
  return {
    status: (data.status as string | null) ?? null,
    locationSlug:
      sr && typeof sr.location_slug === 'string' ? sr.location_slug : null,
    shotId: sr && typeof sr.shot_id === 'string' ? sr.shot_id : null,
  };
}

/**
 * Check whether each declared continuity anchor is still the latest at its
 * scope. Returns `{ ok: true, stale: [] }` when every anchor is fresh, or
 * `{ ok: false, stale: [...] }` when any anchor is outdated.
 *
 * - `anchors` is the Plan's parsed `continuityAnchors[]` (from PlanOverrides).
 * - When `anchors` is empty, the result is always `{ ok: true, stale: [] }` —
 *   no anchors means nothing to invalidate.
 * - Network/lookup errors on a single anchor do NOT block the check (returns
 *   ok for that anchor) — the freshness guard must not become a foot-gun for
 *   the executor when Supabase is degraded. The executor's own provider call
 *   would surface the failure cleaner.
 *
 * Performance: one DB read per anchor for the asset row + one for the latest
 * lookup. Bounded — Plans realistically have ≤2 anchors.
 */
export async function checkPlanAnchorFreshness(
  supabase: SupabaseClient<Database>,
  episodeId: string,
  anchors: ReadonlyArray<ContinuityAnchor>,
): Promise<AnchorFreshnessResult> {
  if (!episodeId || anchors.length === 0) {
    return { ok: true, stale: [] };
  }

  const stale: StaleAnchorEntry[] = [];

  for (const anchor of anchors) {
    const view = await loadAnchorMetadataView(supabase, anchor.assetId);
    if (!view) {
      stale.push({
        kind: anchor.kind,
        planAnchorAssetId: anchor.assetId,
        latestAssetId: null,
        reason: 'anchor_asset_missing',
      });
      continue;
    }
    if (view.status !== 'APPROVED') {
      // Most common cause: a newer v02 IMG was approved and auto-demoted v01.
      // Best-effort: try to surface the newer asset id alongside the failure.
      let latestAssetId: string | null = null;
      try {
        if (anchor.kind === 'spatial_same_location' && view.locationSlug) {
          latestAssetId = await findLatestApprovedImgByLocation(
            supabase,
            episodeId,
            view.locationSlug,
          );
        } else if (anchor.kind === 'temporal_previous_shot' && view.shotId) {
          latestAssetId = await findLatestApprovedImgByShotId(
            supabase,
            episodeId,
            view.shotId,
          );
        }
      } catch {
        // Best-effort only; absence of a latest pointer is fine.
      }
      stale.push({
        kind: anchor.kind,
        planAnchorAssetId: anchor.assetId,
        latestAssetId,
        reason: 'anchor_no_longer_approved',
      });
      continue;
    }

    // Anchor itself is still APPROVED — but is it still the LATEST at its
    // scope? If a newer APPROVED asset exists at the same scope, the anchor
    // is technically outdated even though it's still approved.
    let latestAssetId: string | null = null;
    if (anchor.kind === 'spatial_same_location' && view.locationSlug) {
      latestAssetId = await findLatestApprovedImgByLocation(
        supabase,
        episodeId,
        view.locationSlug,
      );
    } else if (anchor.kind === 'temporal_previous_shot' && view.shotId) {
      latestAssetId = await findLatestApprovedImgByShotId(
        supabase,
        episodeId,
        view.shotId,
      );
    }

    if (latestAssetId && latestAssetId !== anchor.assetId) {
      stale.push({
        kind: anchor.kind,
        planAnchorAssetId: anchor.assetId,
        latestAssetId,
        reason: 'newer_approved_asset_at_same_scope',
      });
    }
  }

  return { ok: stale.length === 0, stale };
}

/**
 * Build the Polина-facing error detail when freshness check fails. Used by
 * the REST guard (ValidationError detail) and the executor's activity_events
 * description. Names `regenerateRefPlan` explicitly so Polина's PA-tool
 * pipeline knows what to do next.
 */
export function formatStaleAnchorMessage(
  planAssetId: string,
  shotId: string,
  stale: ReadonlyArray<StaleAnchorEntry>,
): string {
  const lines = stale.map((entry) => {
    const newer = entry.latestAssetId
      ? `, newer APPROVED at same ${entry.kind === 'spatial_same_location' ? 'location' : 'shot'}: ${entry.latestAssetId}`
      : '';
    return `  - ${entry.kind}: plan anchor ${entry.planAnchorAssetId} (${entry.reason})${newer}`;
  });
  return [
    `PLAN_ANCHOR_STALE: Plan ${planAssetId} (shot ${shotId}) references continuity anchors that are no longer current:`,
    ...lines,
    '',
    'Image-only regen would reproduce the outdated continuity. Run `regenerateRefPlan` to author a v+1 Plan that picks up the current anchors, approve the new Plan, then re-fire `regenerateImageFromPlan`.',
  ].join('\n');
}
