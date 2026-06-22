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
  if (isShotReferenceV2(a.metadata)) {
    return (a.metadata as { shot_reference: { shot_id: string } }).shot_reference.shot_id ?? null;
  }
  // Anchor images (and slug-shaped refs) carry no v2 metadata — derive the
  // shot id from the file_type slug, e.g.
  //   IMG-anchor_ss_s15_e02_a1_sc02_sh02_end → SS-S15-E02-A1-SC02-SH02
  // so start/end anchors group under their shot instead of falling to legacy.
  const m = a.file_type.match(/(s\d+)_(e\d+)_(a\d+)_(sc\d+)_(sh\d+)/i);
  if (m) {
    return `SS-${m[1]}-${m[2]}-${m[3]}-${m[4]}-${m[5]}`.toUpperCase();
  }
  return null;
}

function isApproved(a: EpisodeAsset): boolean {
  return a.status === 'APPROVED' || a.status === 'LOCKED';
}

function toGridAsset(a: EpisodeAsset): AssetGridAsset {
  // 2026-05-25 Director feedback: hover tooltip showed the long snake_case
  // file_type slug (e.g. "ss_s15_e01_a1_sc02_sh03_sandy_bedroom_continuity_...")
  // — useless for distinguishing siblings. Lead with version + status, then
  // the short shot id (sh03) so versions are scannable at a glance.
  const shotId =
    isShotReferenceV2(a.metadata)
      ? (a.metadata as { shot_reference: { shot_id: string } }).shot_reference.shot_id
      : null;
  // 2026-06-22 (Director): scene-qualified key (A2-SC04-SH08), not bare SH —
  // SH resets per scene so bare labels collide. Prefer the full key.
  const shortShot =
    shotId?.match(/A\d+-SC\d+-SH\d+/i)?.[0]?.toUpperCase() ??
    a.file_type.match(/a\d+-sc\d+-sh\d+/i)?.[0]?.toUpperCase() ??
    shotId?.match(/SH\d+/i)?.[0]?.toUpperCase() ??
    a.file_type.match(/sh\d+/i)?.[0]?.toUpperCase() ??
    null;
  const versionStr = a.version != null ? `v${String(a.version).padStart(2, '0')}` : '';
  const parts: string[] = [];
  if (shortShot) parts.push(shortShot);
  if (versionStr) parts.push(versionStr);
  parts.push(a.status);
  // Slug retained as the tail for disambiguation when several different
  // reference families share the same shot (e.g. character vs hourglass).
  // Anchor images get a compact "anchor start/end" label instead of the long
  // location slug so a shot's pair reads at a glance.
  let slug: string;
  if (a.file_type.startsWith('IMG-anchor')) {
    const pos = /_(start|end)$/i.exec(a.file_type)?.[1]?.toLowerCase();
    slug = pos ? `anchor ${pos}` : 'anchor';
  } else {
    slug = a.file_type.replace(/^IMG-episode_ref_?/, '') || bibleSlug(a.file_type) || '';
  }
  if (slug) parts.push(slug);
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
    hoverName: parts.join(' · '),
  };
}

export function EpisodeReferencesGallery({
  episodeId,
  seriesId,
  size = 128,
}: EpisodeReferencesGalleryProps) {
  const [openAssetId, setOpenAssetId] = useState<string | null>(null);

  // Scope the fetch to IMG references server-side so older anchor rows are never
  // truncated by the list cap when an episode accumulates many plan/review/video
  // assets. The client filter below still refines (excludes IMG-thumbnail etc.).
  const { data, mutate } = useSWR<AssetsResponse>(
    `/api/assets?episode_id=${episodeId}&file_type_prefix=IMG-episode_ref,IMG-anchor&limit=200`,
    fetcher,
  );

  // Show episode references AND anchor-chain images. Anchor-mode episodes
  // (TD-49 — scene_master + per-shot start/end anchors) produce `IMG-anchor_*`
  // instead of `IMG-episode_ref_*`; without this they were invisible here even
  // though the Reference Artist generated them (Director 2026-06-02).
  const refs = useMemo(
    () =>
      (data?.data ?? []).filter(
        (a) =>
          a.file_type.startsWith('IMG-episode_ref') || a.file_type.startsWith('IMG-anchor'),
      ),
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

      {/* References by shot — Sprint τ (2026-05-15).
          Director's UX directive: approved variants stay INSIDE their shot's
          slice (not lifted into a separate "Approved" section at the top).
          APPROVED variants render first (left), then REVIEW / DRAFT / REVISION /
          REJECTED in status order — already sorted by sortByStatus, so just
          concat approved + others. AssetThumb dyes the border by status, so
          APPROVED tiles read as green dots in place. Each shot row is always
          expanded — no click needed to see what belongs to that shot. */}
      {groups.length > 0 && (
        <section className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider text-text-muted">
            References by shot ({groups.length})
          </div>
          <div className="space-y-1">
            {groups.map((g) => {
              const allVariants = [...g.approved, ...g.others];
              const hasApproved = g.approved.length > 0;
              return (
                <div
                  key={g.shotId}
                  className="rounded-md border border-glass px-2.5 py-1.5"
                  style={{ background: 'color-mix(in oklab, var(--bg-elevated) 60%, transparent)' }}
                >
                  <div className="flex items-center gap-2 text-[11px] mb-1.5">
                    <span className="font-mono text-text-primary">{g.shotId}</span>
                    <span className="text-text-muted">·</span>
                    <span className="text-text-secondary">
                      {allVariants.length} variant{allVariants.length === 1 ? '' : 's'}
                    </span>
                    {hasApproved && (
                      <span
                        className="ml-auto inline-flex items-center gap-1 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                        style={{
                          background:
                            'color-mix(in oklab, var(--accent-success) 16%, transparent)',
                          color: 'var(--accent-success)',
                        }}
                      >
                        <span
                          aria-hidden
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ background: 'var(--accent-success)' }}
                        />
                        approved
                      </span>
                    )}
                  </div>
                  <AssetGrid
                    assets={allVariants.map(toGridAsset)}
                    size={size}
                    onAssetClick={(id) => setOpenAssetId(id)}
                  />
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
