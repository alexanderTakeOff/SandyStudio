// ──────────────────────────────────────────────────────────────────────────────
// lib/api/asset-ordering.ts
//
// ONE rule for displaying a list of asset variants: NEVER REPOSITION, MARK.
//
// Director, 2026-07-18: "не двигать а помечать". The candidate strips used to
// pull the current / APPROVED tile to the front. Because the shipped attempt is
// picked by quality (`pickBestAttempt` — often v02 of three), that tile sat in a
// different place for every shot, so the strips read as noise. Worse, the
// surfaces disagreed: five distinct schemes across eleven call sites, including
// a timeline cell (status-first) sitting directly above its own popover
// (version-first), which is how an APPROVED v01 ended up rendering under a
// "v03 DRAFT" badge.
//
// The rule now:
//   - Order is a STABLE function of version alone. It does not depend on which
//     tile is selected, approved, or on screen — so tiles never jump when the
//     Director picks a different one.
//   - "Current" is communicated by MARKING the tile in place (ring / badge),
//     never by moving it. `primaryAttemptVersion` in lib/api/shot-reference.ts
//     is the single source for WHICH tile is current.
//
// Two categories, deliberately different directions — they are different kinds
// of list and forcing one direction on both would be false consistency:
//
//   - Sibling ASSET ROWS (VID-shot v01/v02, IMG-thumbnail concepts, final cuts):
//     newest first. Matches how the Director reads a version list ("what's the
//     latest?") and preserves the established convention in these strips.
//     → compareAssetVersionsNewestFirst
//
//   - ATTEMPTS INSIDE ONE ASSET (`shot_reference.generation_history`): oldest
//     first. This is a chronological log — attempt 1, 2, 3 — and AttemptsStrip
//     already labels and renders it that way.
//     → attempts need no comparator; render generation_history as stored.
// ──────────────────────────────────────────────────────────────────────────────

/** Minimal shape shared by AssetRow (preview) and EpisodeAsset (drawer). */
export interface VersionedAssetLike {
  version?: number | null;
  created_at?: string | null;
}

/**
 * Newest variant leftmost. Deterministic and total: `created_at` breaks
 * version ties (the pilot/fan-out pattern emits several rows at the same
 * version), so two surfaces fed by differently-ordered queries still agree —
 * previously they rendered equal-version rows in opposite order because V8's
 * stable sort just preserved whatever the API happened to return.
 *
 * Deliberately blind to `status` and to which row is selected. See the module
 * header: never reposition, mark.
 */
export function compareAssetVersionsNewestFirst(
  a: VersionedAssetLike,
  b: VersionedAssetLike,
): number {
  const byVersion = (b.version ?? 0) - (a.version ?? 0);
  if (byVersion !== 0) return byVersion;
  return (b.created_at ?? '').localeCompare(a.created_at ?? '');
}
