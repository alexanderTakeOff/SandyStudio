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
  return asset.drive_path || asset.staging_path || asset.drive_web_view_url || null;
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

  return contract.shot_list.map((shot) => {
    const duration = (() => {
      const ov = overrides?.[shot.shot_id]?.duration_seconds;
      return typeof ov === 'number' && ov > 0 ? ov : shot.duration_seconds;
    })();

    const rows = byShot.get(shot.shot_id);
    if (rows && rows.length > 0) {
      const latest = pickLatestVidShot(rows);
      const url = bestVideoUrl(latest);
      const isCanonical = latest.status === 'APPROVED' || latest.status === 'LOCKED';
      const isReview = latest.status === 'REVIEW';
      // Only show video for canonical or REVIEW. REVISION / REJECTED rows fall
      // through to the animatic image (still tentative — Director must
      // regenerate to get back into canonical).
      if (url && (isCanonical || isReview)) {
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

    // Fallback to animatic image frame.
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
