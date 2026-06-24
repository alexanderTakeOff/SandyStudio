// ──────────────────────────────────────────────────────────────────────────────
// lib/api/timeline-cell-resolver.ts
//
// Pure function that maps each storyboard shot_id to its current visual cell
// for the EpisodeTimeline (Phase A).
//
// Implements Director's directives 2026-05-06:
//   #1 — Shot-centric: every cell maps to exactly one shot_id, exactly one
//        canonical visual source.
//   #2 — Visual fidelity ≠ canonical: REVIEW mp4 plays for feedback but is
//        flagged as not-yet-canonical (yellow border in UI).
//   #6 — Fast iteration: replacing one shot does NOT require rebuilding episode
//        state. Caller passes the latest assets list; resolver picks per-shot.
//
// Resolution priority per shot_id:
//   1. Latest VID-shot APPROVED / LOCKED → canonical mp4 (green pill)
//   2. Latest VID-shot REVIEW            → mp4 plays, but cell is "tentative"
//                                          (yellow pill)
//   3. Animatic frame (image_url)         → static image fallback
//   4. Placeholder                         → no asset yet (storyboard exists
//                                          but neither animatic nor VGEN ran)
// ──────────────────────────────────────────────────────────────────────────────

import type { AnimaticContract, AnimaticShot } from './animatic-shotlist';

/** Subset of asset row fields the resolver needs. */
export interface VidShotAssetRow {
  id: string;
  file_type: string;
  status: string;
  /** version int — used as primary tiebreak for "latest". */
  version: number | null;
  created_at: string;
  /** Best browser-loadable URL (drive_path / staging_path / drive_web_view_url). */
  drive_path: string | null;
  staging_path: string | null;
  drive_web_view_url: string | null;
  metadata: unknown;
}

/**
 * Subset of an IMG-episode_ref asset row the resolver needs to render a shot's
 * reference frame LIVE (newest approved/review per shot) instead of from the
 * frozen animatic contract. Carries the URL fields so the frame stays in sync
 * with approvals without an animatic rebuild.
 */
export interface ImgRefAssetRow {
  id: string;
  status: string;
  version: number | null;
  /** carries `shot_reference.shot_id` (the storyboard shot id). */
  metadata: unknown;
  drive_path: string | null;
  staging_path: string | null;
  drive_web_view_url: string | null;
}

export type CellKind = 'video-canonical' | 'video-review' | 'image' | 'placeholder';

export type CellStatusPill =
  | 'APPROVED'
  | 'LOCKED'
  | 'REVIEW'
  | 'REVISION'
  | 'REJECTED'
  | 'DRAFT'
  | 'NEEDS_HUMAN_TWEAK'
  | 'NONE';

export interface TimelineCell {
  shot_id: string;
  /** What kind of media renders for this cell. */
  kind: CellKind;
  /** Browser-loadable URL — mp4 for video, png/jpg for image, or null for placeholder. */
  url: string | null;
  /** Caption from storyboard (action / key_beat). */
  caption?: string;
  /** Per-shot duration with director_overrides applied. */
  duration_seconds: number;
  /** Status pill shown in the cell corner. NONE = placeholder. */
  status: CellStatusPill;
  /**
   * The asset row ID for this cell — used by drawer click to know which asset
   * to open. Null only for `placeholder` kind.
   */
  asset_id: string | null;
  /**
   * Original storyboard shot ref (animatic side) — kept for callers that want
   * to read shot_role, image_url, etc.
   */
  shot: AnimaticShot;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function metadataShotId(meta: unknown): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const obj = meta as { shot_id?: unknown; storyboard_shot?: { shot_id?: unknown } };
  if (typeof obj.shot_id === 'string') return obj.shot_id;
  if (obj.storyboard_shot && typeof obj.storyboard_shot.shot_id === 'string') {
    return obj.storyboard_shot.shot_id;
  }
  return null;
}

function pickLatestVidShot(rows: VidShotAssetRow[]): VidShotAssetRow {
  return rows.reduce((best, r) => {
    const bv = best.version ?? 0;
    const rv = r.version ?? 0;
    if (rv > bv) return r;
    if (rv < bv) return best;
    return r.created_at > best.created_at ? r : best;
  });
}

function bestVideoUrl(asset: VidShotAssetRow): string | null {
  // Drive-backed media → stable /api/media/<id> cache route (post-2026-06-01).
  if (asset.id && asset.drive_web_view_url) return `/api/media/${asset.id}`;
  return asset.drive_path || asset.staging_path || asset.drive_web_view_url || null;
}

/** Best browser-loadable URL for a reference image (same /api/media rule). */
function bestRefImageUrl(ref: ImgRefAssetRow): string | null {
  if (ref.id && ref.drive_web_view_url) return `/api/media/${ref.id}`;
  return ref.drive_path || ref.staging_path || ref.drive_web_view_url || null;
}

/** Storyboard shot id from an IMG-episode_ref's metadata.shot_reference.shot_id. */
function refShotId(meta: unknown): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const sid = (meta as { shot_reference?: { shot_id?: unknown } }).shot_reference?.shot_id;
  return typeof sid === 'string' && sid.length > 0 ? sid : null;
}

/** Status rank for picking a shot's frame: approved/locked > review > (ignore). */
function refStatusRank(status: string): number {
  if (status === 'APPROVED' || status === 'LOCKED') return 2;
  if (status === 'REVIEW') return 1;
  return 0; // DRAFT/REVISION/REJECTED/INVALIDATED never become the frame
}

function statusToPill(status: string): CellStatusPill {
  switch (status) {
    case 'APPROVED':
    case 'LOCKED':
    case 'REVIEW':
    case 'REVISION':
    case 'REJECTED':
    case 'DRAFT':
    case 'NEEDS_HUMAN_TWEAK':
      return status;
    default:
      return 'NONE';
  }
}

// ── Resolver (pure function) ─────────────────────────────────────────────────

/**
 * Given the animatic contract (storyboard shots + animatic image fallback) and
 * all VID-shot rows for the episode, return one `TimelineCell` per shot in the
 * canonical storyboard order.
 *
 * Pure function — easy to unit test.
 */
export function resolveTimelineCells(
  contract: AnimaticContract,
  vidShotAssets: VidShotAssetRow[],
  imgRefAssets: ImgRefAssetRow[] = [],
): TimelineCell[] {
  const overrides = contract.director_overrides;
  // Group VID-shot rows by canonical shot_id (skip rows with no shot_id metadata
  // — those are legacy mock pre-Pilot-Pass rows that don't map to any shot).
  const byShot = new Map<string, VidShotAssetRow[]>();
  for (const asset of vidShotAssets) {
    const sid = metadataShotId(asset.metadata);
    if (!sid) continue;
    if (!byShot.has(sid)) byShot.set(sid, []);
    byShot.get(sid)!.push(asset);
  }

  // Live per-shot reference frame (2026-06-24). The animatic CONTRACT freezes
  // image_url at build time, so a ref APPROVED after the last rebuild left the
  // cell blank while the kebab + tint (which read live) showed the ref existed
  // (Director hit this on SH18). Resolve the frame live — newest APPROVED/LOCKED
  // ref per shot, else newest REVIEW — so the frame tracks approvals with no
  // rebuild. The frozen contract image_url stays as a last-resort fallback.
  const liveRefByShot = new Map<string, ImgRefAssetRow>();
  for (const ref of imgRefAssets) {
    const sid = refShotId(ref.metadata);
    const rank = refStatusRank(ref.status);
    if (!sid || rank === 0) continue;
    const cur = liveRefByShot.get(sid);
    if (
      !cur ||
      rank > refStatusRank(cur.status) ||
      (rank === refStatusRank(cur.status) && (ref.version ?? 0) > (cur.version ?? 0))
    ) {
      liveRefByShot.set(sid, ref);
    }
  }

  return contract.shot_list.map((shot) => {
    const duration = (() => {
      const ov = overrides?.[shot.shot_id]?.duration_seconds;
      return typeof ov === 'number' && ov > 0 ? ov : shot.duration_seconds;
    })();

    // INVALIDATED is a terminal "auto-superseded" status with no display value.
    // pickLatestVidShot is version-blind, so a higher-version INVALIDATED row
    // would win the pick and then fail the display guard below — hiding an older
    // APPROVED video that actually exists (shot SH07: v01 APPROVED + v02
    // INVALIDATED showed nothing). Drop INVALIDATED before picking the latest.
    const allRows = byShot.get(shot.shot_id);
    const rows = allRows?.filter((r) => r.status !== 'INVALIDATED');
    if (rows && rows.length > 0) {
      // Resolution priority is by STATUS, not by raw version (Director
      // 2026-06-16). The old code picked the highest-version row overall and
      // only THEN checked its status, so a newer DRAFT (v04) shadowed an older
      // APPROVED video (v01) → the approved clip vanished into the animatic
      // image (shot SH02). This is the same class of bug the INVALIDATED filter
      // above patched for SH07 — now fixed at the root. Walk the documented
      // tiers (header §"Resolution priority"): latest among APPROVED/LOCKED,
      // else latest among REVIEW; REVISION / REJECTED / DRAFT fall through to
      // the animatic image (still tentative — regenerate to get back canonical).
      const canonicalRows = rows.filter(
        (r) => r.status === 'APPROVED' || r.status === 'LOCKED',
      );
      const reviewRows = rows.filter((r) => r.status === 'REVIEW');
      const tier =
        canonicalRows.length > 0
          ? canonicalRows
          : reviewRows.length > 0
            ? reviewRows
            : null;
      if (tier) {
        const latest = pickLatestVidShot(tier);
        const url = bestVideoUrl(latest);
        const isCanonical = latest.status === 'APPROVED' || latest.status === 'LOCKED';
        if (url) {
          return {
            shot_id: shot.shot_id,
            kind: isCanonical ? 'video-canonical' : 'video-review',
            url,
            caption: shot.caption,
            duration_seconds: duration,
            status: statusToPill(latest.status),
            asset_id: latest.id,
            shot,
          };
        }
      }
    }

    // Live reference frame (preferred) — keeps the cell in sync with approvals
    // even when the frozen contract predates the ref. asset_id is the live ref so
    // the kebab "on screen" marker + click-to-open resolve to the right asset.
    const liveRef = liveRefByShot.get(shot.shot_id);
    const liveRefUrl = liveRef ? bestRefImageUrl(liveRef) : null;
    if (liveRef && liveRefUrl) {
      return {
        shot_id: shot.shot_id,
        kind: 'image',
        url: liveRefUrl,
        caption: shot.caption,
        duration_seconds: duration,
        status: 'NONE',
        asset_id: liveRef.id,
        shot,
      };
    }

    // Fallback to the frozen animatic image frame.
    if (shot.image_url) {
      return {
        shot_id: shot.shot_id,
        kind: 'image',
        url: shot.image_url,
        caption: shot.caption,
        duration_seconds: duration,
        status: 'NONE',
        asset_id: shot.asset_id,
        shot,
      };
    }

    // Last resort — no asset of any kind yet.
    return {
      shot_id: shot.shot_id,
      kind: 'placeholder',
      url: null,
      caption: shot.caption,
      duration_seconds: duration,
      status: 'NONE',
      asset_id: null,
      shot,
    };
  });
}

/** Counts cells by status pill — for the timeline filter chip badges. */
export function countCellsByStatus(cells: TimelineCell[]): Record<CellStatusPill, number> {
  const counts: Record<CellStatusPill, number> = {
    APPROVED: 0,
    LOCKED: 0,
    REVIEW: 0,
    REVISION: 0,
    REJECTED: 0,
    DRAFT: 0,
    NEEDS_HUMAN_TWEAK: 0,
    NONE: 0,
  };
  for (const c of cells) counts[c.status]++;
  return counts;
}
