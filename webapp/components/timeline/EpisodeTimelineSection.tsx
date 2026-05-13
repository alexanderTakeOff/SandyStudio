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
//
// Phase A polish (2026-05-06):
//   - Filter chips (All / REVIEW / APPROVED / Missing)
//   - Bulk actions toolbar (Approve all REVIEW)
//   - Drawer prev/next nav (chevron buttons + arrow keys) so Director can
//     review every cell without closing the drawer between shots.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { ChevronDown, ChevronUp, Film, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { fetcher } from '@/lib/swr';
import { AnimaticPlayer, type AnimaticPlayerHandle } from '@/components/animatic/AnimaticPlayer';
import { isAnimaticV1, type AnimaticContract } from '@/lib/api/animatic-shotlist';
import {
  resolveTimelineCells,
  countCellsByStatus,
  type VidShotAssetRow,
  type TimelineCell,
  type CellStatusPill,
} from '@/lib/api/timeline-cell-resolver';
import { PreviewDrawer } from '@/components/preview/PreviewDrawer';
import { StitchStatusPill } from '@/components/timeline/StitchStatusPill';

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

type FilterKey = 'all' | 'review' | 'approved' | 'missing';

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
  const [filter, setFilter] = useState<FilterKey>('all');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  // When Director clicks a missing-VGEN cell (image fallback), we open the
  // EREF in the drawer AND remember the shot_id so the drawer footer offers
  // a "Generate VGEN" button. Cleared when previewAssetId moves to a real
  // VID-shot or the drawer closes.
  const [pendingGenerateShotId, setPendingGenerateShotId] = useState<string | null>(null);
  const [genBusy, setGenBusy] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  // Imperative ref to AnimaticPlayer — used to seek the playhead after a
  // regenerate completes (Phase A.1 directive — auto-focus the new candidate).
  const playerRef = useRef<AnimaticPlayerHandle | null>(null);

  function handleRegenerated(shotId: string, newAssetId: string): void {
    // Refetch so the cell-resolver picks up the new VID-shot REVIEW row, then
    // move the playhead to that shot. SWR mutate happens via VGENShotPanel's
    // onChanged → AssetPreview's mutate → /api/episodes refetch propagates
    // through SWR cache; we then nudge the timeline to focus.
    void mutate();
    // Phase A.2 Bug A fix (Director report 2026-05-08): swap the drawer to
    // the NEW asset id immediately. Without this, the drawer stays bound to
    // the OLD APPROVED asset and never shows the REVIEW state's Approve/
    // Reject buttons until Director manually closes + reopens via "Open
    // shot →". The old asset row is unchanged (still APPROVED), so its
    // mutate() doesn't surface the new candidate; only re-pointing the
    // drawer at the NEW row reveals the buttons.
    setPreviewAssetId(newAssetId);
    // Slight delay so cell-resolver re-runs with the fresh assets list before
    // the seek lands on it. Without this we'd seek to the same shot but the
    // cell would still resolve to image fallback for one render cycle.
    setTimeout(() => {
      playerRef.current?.seekToShot(shotId);
    }, 200);
  }

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

  // Pick the freshest VID-final_cut asset (any status — REVIEW/APPROVED/LOCKED
   // all warrant the "ready" pill). Used by StitchStatusPill so the green
   // chip survives a session reload after STITCH already completed.
  const finalCutAsset = useMemo(() => {
    const assets = data?.data.assets ?? [];
    const finals = assets.filter((a) => a.file_type === 'VID-final_cut');
    if (finals.length === 0) return null;
    return finals.reduce((best, a) => {
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

  // Compute resolved cells once, used by both the toolbar (counts/bulk) and
  // the drawer (prev/next nav). The player computes the same internally —
  // duplicating this is cheap (pure function, ~O(shots × vid-shots)).
  const cells: TimelineCell[] = useMemo(() => {
    if (!animaticAsset) return [];
    const contract = (animaticAsset.metadata as { animatic_v1: AnimaticContract })
      .animatic_v1;
    return resolveTimelineCells(contract, vidShotAssets);
  }, [animaticAsset, vidShotAssets]);

  const counts = useMemo(() => countCellsByStatus(cells), [cells]);

  const navigableAssetIds = useMemo(() => {
    return cells
      .filter((c) => c.asset_id !== null)
      .map((c) => c.asset_id!) as string[];
  }, [cells]);

  const navIndex = previewAssetId
    ? navigableAssetIds.indexOf(previewAssetId)
    : -1;
  const onPrev =
    navIndex > 0
      ? () => setPreviewAssetId(navigableAssetIds[navIndex - 1] ?? null)
      : null;
  const onNext =
    navIndex >= 0 && navIndex < navigableAssetIds.length - 1
      ? () => setPreviewAssetId(navigableAssetIds[navIndex + 1] ?? null)
      : null;
  const navLabel =
    navIndex >= 0
      ? `${navIndex + 1} / ${navigableAssetIds.length}`
      : undefined;

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

  const contract = (animaticAsset.metadata as { animatic_v1: AnimaticContract })
    .animatic_v1;

  function handleCellClick(cell: TimelineCell): void {
    setGenError(null);
    if (cell.asset_id) {
      setPreviewAssetId(cell.asset_id);
      // Image fallback / placeholder: cell.asset_id points to the EREF (or
      // null). Remember the shot so the drawer footer shows Generate VGEN.
      // For real VID-shot cells, clear the pending state — drawer's own
      // VGEN controls handle regenerate.
      const isMissingVgen =
        cell.kind === 'image' || cell.kind === 'placeholder';
      setPendingGenerateShotId(isMissingVgen ? cell.shot_id : null);
    }
  }

  async function generateMissingShot(qualityTier: 'fast' | 'standard' = 'fast'): Promise<void> {
    if (!pendingGenerateShotId) return;
    setGenBusy(true);
    setGenError(null);
    try {
      const res = await fetch(
        `/api/episodes/${episodeId}/vgen/generate-single-shot`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            shot_id: pendingGenerateShotId,
            quality_tier: qualityTier,
            directorConfirm: true,
          }),
        },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? 'Generate failed');
      }
      // Optimistic UX: close the drawer; SWR refresh will surface the new
      // job in activity, and once mp4 lands the cell flips to video-review.
      setPreviewAssetId(null);
      setPendingGenerateShotId(null);
      void mutate();
    } catch (e) {
      setGenError((e as Error).message);
    } finally {
      setGenBusy(false);
    }
  }

  async function bulkApproveReview(): Promise<void> {
    setBulkBusy(true);
    setBulkError(null);
    try {
      const res = await fetch(
        `/api/episodes/${episodeId}/vgen/approve-all-review`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ directorConfirm: true }),
        },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? 'Bulk approve failed');
      }
      void mutate();
    } catch (e) {
      setBulkError((e as Error).message);
    } finally {
      setBulkBusy(false);
    }
  }

  const reviewCount = counts.REVIEW;

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
          <div
            // Stop the click from toggling collapse when Director clicks the
            // "Final cut ready" pill button.
            onClick={(e) => e.stopPropagation()}
          >
            <StitchStatusPill
              episodeId={episodeId}
              finalCutAssetId={finalCutAsset?.id ?? null}
              onOpen={(assetId) => setPreviewAssetId(assetId)}
            />
          </div>
          <div className="flex-1" />
          <span className="text-[11px] text-text-muted">
            {collapsed ? 'Expand' : 'Collapse'}
          </span>
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </div>
        {!collapsed && (
          <div className="px-3 pb-3 pt-0 border-t border-glass space-y-2">
            <TimelineToolbar
              counts={counts}
              filter={filter}
              setFilter={setFilter}
              reviewCount={reviewCount}
              bulkBusy={bulkBusy}
              onBulkApprove={bulkApproveReview}
              bulkError={bulkError}
            />
            <AnimaticPlayer
              ref={playerRef}
              assetId={animaticAsset.id}
              contract={contract}
              vidShotAssets={vidShotAssets}
              filter={filter}
              onCellClick={handleCellClick}
              onChanged={() => void mutate()}
              animaticStatus={animaticAsset.status}
            />
          </div>
        )}
      </div>

      <PreviewDrawer
        open={previewAssetId !== null}
        onClose={() => {
          setPreviewAssetId(null);
          setPendingGenerateShotId(null);
          setGenError(null);
        }}
        assetId={previewAssetId}
        onPrev={onPrev}
        onNext={onNext}
        navLabel={navLabel}
        onRegenerated={handleRegenerated}
        onAssetChanged={() => void mutate()}
        footer={
          pendingGenerateShotId ? (
            <div className="flex items-center gap-2 w-full">
              <span className="text-[11px] text-text-muted flex-1">
                No VGEN yet for{' '}
                <span className="font-mono text-text-secondary">
                  {pendingGenerateShotId}
                </span>{' '}
                — animatic frame shown as fallback.
              </span>
              {genError && (
                <span
                  className="text-[11px] px-1.5 py-0.5 rounded"
                  style={{
                    background: 'color-mix(in oklab, var(--accent-danger) 12%, transparent)',
                    color: 'var(--accent-danger)',
                  }}
                >
                  {genError}
                </span>
              )}
              <button
                onClick={generateMissingShot}
                disabled={genBusy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium border transition-colors disabled:opacity-50"
                style={{
                  background:
                    'color-mix(in oklab, var(--accent-primary) 14%, transparent)',
                  color: 'var(--accent-primary)',
                  borderColor:
                    'color-mix(in oklab, var(--accent-primary) 35%, transparent)',
                }}
              >
                {genBusy ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Sparkles size={12} />
                )}
                {genBusy ? 'Triggering…' : 'Generate VGEN shot'}
              </button>
            </div>
          ) : undefined
        }
      />
    </>
  );
}

// ── Toolbar (filter chips + bulk actions) ────────────────────────────────────

function TimelineToolbar({
  counts,
  filter,
  setFilter,
  reviewCount,
  bulkBusy,
  onBulkApprove,
  bulkError,
}: {
  counts: Record<CellStatusPill, number>;
  filter: FilterKey;
  setFilter: (f: FilterKey) => void;
  reviewCount: number;
  bulkBusy: boolean;
  onBulkApprove: () => void;
  bulkError: string | null;
}) {
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  const approved = counts.APPROVED + counts.LOCKED;
  const missing = counts.NONE; // placeholder + image fallback both count as "missing VGEN"

  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-2">
      <FilterChip
        label="All"
        count={total}
        active={filter === 'all'}
        onClick={() => setFilter('all')}
      />
      <FilterChip
        label="Review"
        count={counts.REVIEW}
        active={filter === 'review'}
        onClick={() => setFilter('review')}
        accent="warn"
      />
      <FilterChip
        label="Approved"
        count={approved}
        active={filter === 'approved'}
        onClick={() => setFilter('approved')}
        accent="ok"
      />
      <FilterChip
        label="Missing"
        count={missing}
        active={filter === 'missing'}
        onClick={() => setFilter('missing')}
        accent="muted"
      />
      <div className="flex-1" />
      {reviewCount > 0 && (
        <button
          onClick={onBulkApprove}
          disabled={bulkBusy}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors disabled:opacity-50"
          style={{
            background: bulkBusy
              ? 'color-mix(in oklab, var(--accent-primary) 8%, transparent)'
              : 'color-mix(in oklab, var(--accent-success) 12%, transparent)',
            color: 'var(--accent-success)',
            borderColor: 'color-mix(in oklab, var(--accent-success) 30%, transparent)',
          }}
          title="Approve all VID-shot REVIEW rows for this episode"
        >
          {bulkBusy ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            <CheckCircle2 size={11} />
          )}
          {bulkBusy ? 'Approving…' : `Approve all REVIEW (${reviewCount})`}
        </button>
      )}
      {bulkError && (
        <span
          className="text-[11px] px-2 py-1 rounded-md"
          style={{
            background: 'color-mix(in oklab, var(--accent-danger) 10%, transparent)',
            color: 'var(--accent-danger)',
          }}
        >
          {bulkError}
        </span>
      )}
    </div>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
  accent,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  accent?: 'ok' | 'warn' | 'muted';
}) {
  const accentColor =
    accent === 'ok'
      ? 'var(--accent-success)'
      : accent === 'warn'
        ? 'var(--accent-warning)'
        : accent === 'muted'
          ? 'var(--text-muted)'
          : 'var(--accent-primary)';
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium border transition-colors"
      style={{
        background: active
          ? `color-mix(in oklab, ${accentColor} 16%, transparent)`
          : 'transparent',
        color: active ? accentColor : 'var(--text-secondary)',
        borderColor: active
          ? `color-mix(in oklab, ${accentColor} 40%, transparent)`
          : 'var(--border-glass)',
      }}
      aria-pressed={active}
    >
      <span>{label}</span>
      <span className="tabular-nums opacity-70">{count}</span>
    </button>
  );
}
