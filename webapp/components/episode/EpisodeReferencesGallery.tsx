// ──────────────────────────────────────────────────────────────────────────────
// components/episode/EpisodeReferencesGallery.tsx
// Compact gallery of IMG-episode_ref_* assets for an episode.
// Renders an AssetGrid of small (~32px) tiles. Click opens EpisodeAssetDrawer.
//
// Director's request 2026-05-02: thumbnails 1/8 the side of Bible cards so
// 13-49 references fit in a single row scan. Drawer has ← back link to keep
// the gallery in view.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/lib/swr';
import { AssetGrid, type AssetGridAsset } from '@/components/assets/AssetGrid';
import { EpisodeAssetDrawer, type EpisodeAsset } from '@/components/assets/EpisodeAssetDrawer';
import { bibleSlug } from '@/lib/api/series-bible';

interface AssetsResponse {
  data: EpisodeAsset[];
}

export interface EpisodeReferencesGalleryProps {
  episodeId: string;
  /** Series UUID — passed to EpisodeAssetDrawer for Style Guardian context. */
  seriesId?: string | null;
  /** Tile side. Default 36 px (1/8 of typical 256-280 Bible card side). */
  size?: number;
}

export function EpisodeReferencesGallery({ episodeId, seriesId, size = 36 }: EpisodeReferencesGalleryProps) {
  const [openAssetId, setOpenAssetId] = useState<string | null>(null);

  const { data, mutate } = useSWR<AssetsResponse>(
    `/api/assets?episode_id=${episodeId}&limit=200`,
    fetcher,
  );

  const refs = (data?.data ?? []).filter((a) => a.file_type.startsWith('IMG-episode_ref'));
  // Sort: APPROVED → REVIEW → DRAFT → REVISION → REJECTED, then by filename.
  const STATUS_ORDER: Record<string, number> = {
    APPROVED: 0,
    LOCKED: 0,
    REVIEW: 1,
    DRAFT: 2,
    REVISION: 3,
    REJECTED: 4,
  };
  refs.sort((a, b) => {
    const sa = STATUS_ORDER[a.status] ?? 9;
    const sb = STATUS_ORDER[b.status] ?? 9;
    if (sa !== sb) return sa - sb;
    return a.filename.localeCompare(b.filename);
  });

  const gridAssets: AssetGridAsset[] = refs.map((a) => {
    // Extract a friendly hover name from file_type (IMG-episode_ref_<slug>) or filename
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
  });

  const openAsset = openAssetId ? refs.find((a) => a.id === openAssetId) ?? null : null;

  if (refs.length === 0) {
    return (
      <div className="rounded-lg border border-glass p-3 text-xs text-text-muted">
        No episode references generated yet. Run EXEC-EREF after Storyboard approval.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-text-muted">
          Episode references ({refs.length})
        </div>
      </div>
      <AssetGrid
        assets={gridAssets}
        size={size}
        onAssetClick={(id) => setOpenAssetId(id)}
      />
      {openAsset && (
        <EpisodeAssetDrawer
          open={true}
          asset={openAsset}
          onClose={() => setOpenAssetId(null)}
          onBack={() => setOpenAssetId(null)}
          onChange={() => {
            mutate();
          }}
          kindLabel="Episode reference"
        />
      )}
    </div>
  );
}
