// ──────────────────────────────────────────────────────────────────────────────
// components/episode/EpisodeReferencesGallery.tsx
// Gallery of IMG-episode_ref_* assets for an episode.
//
// EREF v2 layout (Director's request 2026-05-05):
//   - Larger thumbnails (default 128px, was 36) — readable at scan distance.
//   - Group by `metadata.shot_reference.shot_id`:
//       Approved row    : APPROVED variants per shot, prominent, larger
//       Other variants  : REVIEW + REJECTED + DRAFT, collapsible per shot
//       Legacy section  : assets without v2 shot_id (older episodes)
//   - Header summary: "Reviewed: <approved>/<total> shots have approved variant"
//   - Click thumbnail → EpisodeAssetDrawer (drawer can switch to siblings).
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { fetcher } from '@/lib/swr';
import { AssetGrid, type AssetGridAsset } from '@/components/assets/AssetGrid';
import { EpisodeAssetDrawer, type EpisodeAsset } from '@/components/assets/EpisodeAssetDrawer';
import { bibleSlug } from '@/lib/api/series-bible';
import { isShotReferenceV2 } from '@/lib/api/shot-reference';

interface AssetsResponse {
  data: EpisodeAsset[];
}

export interface EpisodeReferencesGalleryProps {
  episodeId: string;
  /** Series UUID — passed to EpisodeAssetDrawer for Style Guardian context. */
  seriesId?: string | null;
  /** Tile side. Default 128 px (was 36 — Director request 2026-05-05). */
  size?: number;
}

// Status order: APPROVED first, REVIEW, DRAFT, REVISION, REJECTED last.
const STATUS_ORDER: Record<string, number> = {
  APPROVED: 0,
  LOCKED: 0,
  REVIEW: 1,
  DRAFT: 2,
  REVISION: 3,
  REJECTED: 4,
};

interface ShotGroup {
  shotId: string;
  approved: EpisodeAsset[];
  others: EpisodeAsset[];
}

function shotIdFor(a: EpisodeAsset): string | null {
  if (!isShotReferenceV2(a.metadata)) return null;
  return (a.metadata as { shot_reference: { shot_id: string } }).shot_reference.shot_id ?? null;
}

function isApproved(a: EpisodeAsset): boolean {
  return a.status === 'APPROVED' || a.status === 'LOCKED';
}

function toGridAsset(a: EpisodeAsset): AssetGridAsset {
  const slug = a.file_type.replace(/^IMG-episode_ref_?/, '') || bibleSlug(a.file_type) || '';
  return {
    id: a.id,
    filename: a.filename,
    file_type: a.file_type,
    status: a.status,
    version: a.version,
    staging_path: a.staging_path,
    drive_path: a.drive_path,
    drive_web_view_url: a.drive_web_view_url,
    metadata: a.metadata,
    hoverName: slug || a.filename,
  };
}

export function EpisodeReferencesGallery({
  episodeId,
  seriesId,
  size = 128,
}: EpisodeReferencesGalleryProps) {
  const [openAssetId, setOpenAssetId] = useState<string | null>(null);
  const [expandShot, setExpandShot] = useState<Record<string, boolean>>({});

  const { data, mutate } = useSWR<AssetsResponse>(
    `/api/assets?episode_id=${episodeId}&limit=200`,
    fetcher,
  );

  const refs = useMemo(
    () => (data?.data ?? []).filter((a) => a.file_type.startsWith('IMG-episode_ref')),
    [data?.data],
  );

  // Partition: v2 (have shot_id) vs legacy.
  const { groups, legacy, totalShots, approvedShots } = useMemo(() => {
    const byShot = new Map<string, ShotGroup>();
    const legacyAssets: EpisodeAsset[] = [];
    for (const a of refs) {
      const sid = shotIdFor(a);
      if (!sid) {
        legacyAssets.push(a);
        continue;
      }
      let g = byShot.get(sid);
      if (!g) {
        g = { shotId: sid, approved: [], others: [] };
        byShot.set(sid, g);
      }
      if (isApproved(a)) g.approved.push(a);
      else g.others.push(a);
    }
    // Sort within each shot.
    const sortByStatus = (a: EpisodeAsset, b: EpisodeAsset) => {
      const sa = STATUS_ORDER[a.status] ?? 9;
      const sb = STATUS_ORDER[b.status] ?? 9;
      if (sa !== sb) return sa - sb;
      return a.filename.localeCompare(b.filename);
    };
    for (const g of byShot.values()) {
      g.approved.sort(sortByStatus);
      g.others.sort(sortByStatus);
    }
    legacyAssets.sort(sortByStatus);
    const groupsArr = Array.from(byShot.values()).sort((a, b) =>
      a.shotId.localeCompare(b.shotId),
    );
    const totalShotsCount = groupsArr.length;
    const approvedShotsCount = groupsArr.filter((g) => g.approved.length > 0).length;
    return {
      groups: groupsArr,
      legacy: legacyAssets,
      totalShots: totalShotsCount,
      approvedShots: approvedShotsCount,
    };
  }, [refs]);

  const openAsset = openAssetId ? refs.find((a) => a.id === openAssetId) ?? null : null;

  if (refs.length === 0) {
    return (
      <div className="rounded-lg border border-glass p-3 text-xs text-text-muted">
        No episode references generated yet. Run the Reference Artist after Storyboard approval.
      </div>
    );
  }

  // Flatten all approved variants across shots into a single grid.
  const approvedFlat: EpisodeAsset[] = groups.flatMap((g) => g.approved);

  return (
    <div className="space-y-3">
      {/* Header summary */}
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-text-muted">
          Episode references ({refs.length})
        </div>
        {totalShots > 0 && (
          <div
            className="text-[11px] font-medium px-2 py-0.5 rounded-md"
            style={{
              background:
                approvedShots === totalShots && totalShots > 0
                  ? 'color-mix(in oklab, var(--accent-success) 18%, transparent)'
                  : 'color-mix(in oklab, var(--accent-primary) 14%, transparent)',
              color:
                approvedShots === totalShots && totalShots > 0
                  ? 'var(--accent-success)'
                  : 'var(--accent-primary)',
            }}
          >
            Reviewed: {approvedShots}/{totalShots} shots have approved variant
          </div>
        )}
      </div>

      {/* Approved row */}
      {approvedFlat.length > 0 && (
        <section className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider text-text-muted">
            Approved ({approvedFlat.length})
          </div>
          <AssetGrid
            assets={approvedFlat.map(toGridAsset)}
            size={size}
            onAssetClick={(id) => setOpenAssetId(id)}
          />
        </section>
      )}

      {/* Per-shot collapsible "Other variants" rows — only shots with non-approved candidates. */}
      {groups.some((g) => g.others.length > 0) && (
        <section className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider text-text-muted">
            Other variants by shot
          </div>
          <div className="space-y-1">
            {groups
              .filter((g) => g.others.length > 0)
              .map((g) => {
                const expanded = !!expandShot[g.shotId];
                return (
                  <div
                    key={g.shotId}
                    className="rounded-md border border-glass"
                    style={{ background: 'color-mix(in oklab, var(--bg-elevated) 60%, transparent)' }}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setExpandShot((prev) => ({ ...prev, [g.shotId]: !prev[g.shotId] }))
                      }
                      className="w-full px-2.5 py-1.5 flex items-center gap-2 text-left text-[11px] text-text-secondary hover:text-text-primary transition-colors"
                      aria-expanded={expanded}
                    >
                      {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                      <span className="font-mono text-text-primary">{g.shotId}</span>
                      <span className="text-text-muted">·</span>
                      <span>{g.others.length} other variant{g.others.length === 1 ? '' : 's'}</span>
                      {g.approved.length > 0 && (
                        <span
                          className="ml-auto text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                          style={{
                            background:
                              'color-mix(in oklab, var(--accent-success) 16%, transparent)',
                            color: 'var(--accent-success)',
                          }}
                        >
                          approved
                        </span>
                      )}
                    </button>
                    {expanded && (
                      <div className="px-2.5 pb-2 pt-0.5">
                        <AssetGrid
                          assets={g.others.map(toGridAsset)}
                          size={Math.round(size * 0.7)}
                          onAssetClick={(id) => setOpenAssetId(id)}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </section>
      )}

      {/* Legacy section — assets without v2 shot_id */}
      {legacy.length > 0 && (
        <section className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider text-text-muted">
            Legacy (no shot_id)
          </div>
          <AssetGrid
            assets={legacy.map(toGridAsset)}
            size={Math.round(size * 0.6)}
            onAssetClick={(id) => setOpenAssetId(id)}
          />
        </section>
      )}

      {openAsset && (
        <EpisodeAssetDrawer
          open={true}
          asset={openAsset}
          onClose={() => setOpenAssetId(null)}
          onBack={() => setOpenAssetId(null)}
          onChange={() => {
            mutate();
          }}
          onPickAsset={(id) => setOpenAssetId(id)}
          kindLabel="Episode reference"
          seriesId={seriesId ?? null}
        />
      )}
    </div>
  );
}
