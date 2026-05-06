// ──────────────────────────────────────────────────────────────────────────────
// components/timeline/EpisodeTimelineSection.tsx
//
// EpisodeTimeline Phase A entry point — wraps the AnimaticPlayer in hybrid
// mode for the episode page. Fetches the latest approved animatic v1 contract
// + every VID-shot asset for the episode, then renders the player with both
// inputs so cells render either real mp4 (canonical / REVIEW) or animatic
// image (fallback) per Director's directive 2026-05-06 #1 + #2.
//
// This is the unified review surface that progressively evolves as VGEN /
// EXEC-MGEN / EXEC-STITCH outputs land. Cells are shot-centric (#1) and the
// resolver picks LATEST per shot_id (#6 fast iteration).
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { ChevronDown, ChevronUp, Film } from 'lucide-react';
import { fetcher } from '@/lib/swr';
import { AnimaticPlayer } from '@/components/animatic/AnimaticPlayer';
import { isAnimaticV1, type AnimaticContract } from '@/lib/api/animatic-shotlist';
import { type VidShotAssetRow, type TimelineCell } from '@/lib/api/timeline-cell-resolver';
import { PreviewDrawer } from '@/components/preview/PreviewDrawer';

interface AssetRow {
  id: string;
  file_type: string;
  status: string;
  metadata: unknown;
  drive_path: string | null;
  staging_path: string | null;
  drive_web_view_url: string | null;
  filename: string;
  version: number | null;
  created_at: string;
}

interface EpisodeResponse {
  data: {
    episode: { id: string };
    assets: AssetRow[];
  };
}

export interface EpisodeTimelineSectionProps {
  episodeId: string;
  /**
   * Whether the section starts collapsed. Default false (expanded). When the
   * episode has no animatic yet, the section auto-hides.
   */
  defaultCollapsed?: boolean;
}

export function EpisodeTimelineSection({
  episodeId,
  defaultCollapsed = false,
}: EpisodeTimelineSectionProps) {
  const { data, mutate } = useSWR<EpisodeResponse>(
    `/api/episodes/${episodeId}`,
    fetcher,
    { refreshInterval: 30_000 },
  );

  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [previewAssetId, setPreviewAssetId] = useState<string | null>(null);

  // Pick the freshest APPROVED VID-animatic with the v1 contract. If multiple
  // approved animatics exist (re-trigger history), we use the highest version /
  // newest created_at — that's the canonical timeline source.
  const animaticAsset = useMemo(() => {
    const assets = data?.data.assets ?? [];
    const animatics = assets.filter(
      (a) =>
        a.file_type === 'VID-animatic' &&
        (a.status === 'APPROVED' || a.status === 'LOCKED') &&
        isAnimaticV1(a.metadata),
    );
    if (animatics.length === 0) return null;
    return animatics.reduce((best, a) => {
      const bv = best.version ?? 0;
      const av = a.version ?? 0;
      if (av > bv) return a;
      if (av < bv) return best;
      return a.created_at > best.created_at ? a : best;
    });
  }, [data]);

  const vidShotAssets: VidShotAssetRow[] = useMemo(() => {
    const assets = data?.data.assets ?? [];
    return assets
      .filter((a) => a.file_type.startsWith('VID-shot'))
      .map((a) => ({
        id: a.id,
        file_type: a.file_type,
        status: a.status,
        version: a.version,
        created_at: a.created_at,
        drive_path: a.drive_path,
        staging_path: a.staging_path,
        drive_web_view_url: a.drive_web_view_url,
        metadata: a.metadata,
      }));
  }, [data]);

  if (!data) {
    return (
      <div className="rounded-lg border border-glass px-3 py-3 text-xs text-text-muted">
        Loading timeline…
      </div>
    );
  }

  if (!animaticAsset) {
    // Section quietly hides until an animatic v1 exists. The pre-animatic
    // experience is already covered by storyboard / EREF surfaces.
    return null;
  }

  const contract = (animaticAsset.metadata as { animatic_v1: AnimaticContract }).animatic_v1;

  function handleCellClick(cell: TimelineCell): void {
    if (cell.asset_id) {
      setPreviewAssetId(cell.asset_id);
    }
  }

  return (
    <>
      <div
        className="rounded-lg border border-glass overflow-hidden"
        style={{
          background: 'color-mix(in oklab, var(--accent-primary) 4%, var(--bg-elevated))',
          boxShadow: '0 0 0 1px color-mix(in oklab, var(--accent-primary) 18%, transparent)',
        }}
      >
        <div
          className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none"
          onClick={() => setCollapsed((v) => !v)}
        >
          <Film size={14} className="text-[var(--accent-primary)]" />
          <span className="text-sm font-semibold text-text-primary">Episode timeline</span>
          <span className="text-[11px] text-text-muted">
            · {contract.shot_list.length} shots · {vidShotAssets.length} VID-shot rows
          </span>
          <div className="flex-1" />
          <span className="text-[11px] text-text-muted">
            {collapsed ? 'Expand' : 'Collapse'}
          </span>
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </div>
        {!collapsed && (
          <div className="px-3 pb-3 pt-0 border-t border-glass">
            <AnimaticPlayer
              assetId={animaticAsset.id}
              contract={contract}
              vidShotAssets={vidShotAssets}
              onCellClick={handleCellClick}
              onChanged={() => void mutate()}
            />
          </div>
        )}
      </div>

      <PreviewDrawer
        open={previewAssetId !== null}
        onClose={() => setPreviewAssetId(null)}
        assetId={previewAssetId ?? ''}
      />
    </>
  );
}
