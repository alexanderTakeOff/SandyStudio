// ──────────────────────────────────────────────────────────────────────────────
// components/assets/AssetThumb.tsx
// Compact tile for AssetGrid — Director's request: side ≈ 1/8 of current
// Bible card side (256px → ~32px) so a gallery of references is dense and
// scannable. Renders preview image only; name + status pill on hover.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useState, type CSSProperties } from 'react';
import { Lock } from 'lucide-react';
import type { AssetMetadataDoc } from '@/lib/api/series-bible';
import { NotificationDot } from '@/components/notifications/NotificationDot';
import { withThumbParam } from '@/lib/media-thumb';
import { driveBackedMediaUrl, previewFreshness } from '@/lib/asset-preview-resolver';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'var(--accent-info)',
  REVIEW: 'var(--accent-warning, #d97706)',
  REVISION: 'var(--accent-warning, #d97706)',
  APPROVED: 'var(--accent-success)',
  LOCKED: 'var(--accent-success)',
  REJECTED: 'var(--accent-danger)',
};

export interface AssetThumbProps {
  asset: {
    id: string;
    filename: string;
    file_type: string;
    status: string;
    version: number | null;
    staging_path: string | null;
    drive_path: string | null;
    drive_web_view_url: string | null;
    metadata?: AssetMetadataDoc | null;
  };
  /** Tile side in px. Default 32 (1/8 of 256). */
  size?: number;
  /** Compact name shown on hover. Defaults to filename slug. */
  hoverName?: string;
  onClick?: () => void;
}

// Role badge for EREF tiles (Director 2026-06-20): a shot's reference gallery
// previously showed only a version plate (v01…), so anchor pairs vs single
// references were indistinguishable at a glance. Derive a compact role mark
// purely from the file_type slug:
//   IMG-anchor_*_start → 'start'   IMG-anchor_*_end → 'end'   (two-anchor pair)
//   IMG-episode_ref_*  → 'ref'                                (single reference)
// Any other asset family (Bible cards, character refs, …) returns null, so no
// badge leaks into non-EREF galleries that reuse this generic tile.
function anchorRoleLabel(fileType: string): 'start' | 'end' | 'ref' | null {
  if (fileType.startsWith('IMG-anchor')) {
    const pos = /_(start|end)$/i.exec(fileType)?.[1]?.toLowerCase();
    return pos === 'start' || pos === 'end' ? pos : null;
  }
  if (fileType.startsWith('IMG-episode_ref')) return 'ref';
  return null;
}

function pickPreviewSrc(a: AssetThumbProps['asset']): string | null {
  // Drive-backed media → stable /api/media/<id> route (post-2026-06-01 cache
  // migration); /staging is dead, drive_web_view_url is a viewer page not an image.
  // Cache-bust via current_version so regenerated images aren't served stale.
  const route = driveBackedMediaUrl(a, previewFreshness(a));
  if (route) return route;
  const promptDoc = a.metadata?.image_prompt;
  const currentEntry = promptDoc?.history.find((h) => h.version === promptDoc.current_version);
  const candidates: Array<string | null | undefined> = [
    a.drive_path,
    a.staging_path,
    a.drive_web_view_url,
    currentEntry?.staging_path,
    currentEntry?.drive_web_view_url,
  ];
  return (
    candidates.find(
      (c): c is string => typeof c === 'string' && (c.startsWith('/') || c.startsWith('http')),
    ) ?? null
  );
}

// Thumbnail sizing for grid tiles lives in lib/media-thumb.ts (`withThumbParam`)
// so the EREF reference/anchor strips reuse the exact same logic.

export function AssetThumb({ asset, size = 32, hoverName, onClick }: AssetThumbProps) {
  const rawSrc = pickPreviewSrc(asset);
  const src = rawSrc != null ? withThumbParam(rawSrc, size) : null;
  // Turn silent broken-images into a visible, debuggable state: on a load
  // failure we drop the <img> and render the same "—" placeholder used when no
  // src exists, plus a subtle danger ring.
  const [hasError, setHasError] = useState(false);
  const showImg = src != null && !hasError;
  const statusColor = STATUS_COLORS[asset.status] ?? 'var(--text-muted)';
  const isLocked = asset.status === 'LOCKED';
  // 2026-05-25 Director feedback: thumbs lacked a visible version chip so
  // sibling refs were indistinguishable without hovering. Show a compact
  // `v01` / `v02` badge in the bottom-left of each tile.
  // 2026-05-25 follow-up: Director asked to halve the chip size — original
  // divisor was /5.5, now /11 (font), with tighter padding to match.
  // Attempt visibility on the tile face (Director 2026-07-16): an EREF ref holds N
  // attempt images and the ACTIVE one (keep-best winner) is not obvious. Show
  // "v01-N/M" (version-attempt/total) right on the chip so the Director sees which
  // attempt is live without opening a drawer. Collapses to plain "v01" for a single
  // attempt or a non-EREF asset. Active attempt precedence mirrors AssetPreview:
  // selected_version (manual pick) → image_prompt.current_version (keep-best winner)
  // → last.
  const erefSr = asset.file_type.startsWith('IMG-episode_ref')
    ? (asset.metadata as {
        shot_reference?: {
          selected_version?: number | null;
          generation_history?: Array<{ version?: number | null }>;
        };
      } | null)?.shot_reference ?? null
    : null;
  const attemptCount = erefSr?.generation_history?.length ?? 0;
  const activeAttempt =
    erefSr?.selected_version ??
    asset.metadata?.image_prompt?.current_version ??
    (attemptCount > 0 ? erefSr!.generation_history![attemptCount - 1]!.version ?? null : null);
  const versionBase =
    asset.version != null ? `v${String(asset.version).padStart(2, '0')}` : null;
  const versionLabel = versionBase
    ? attemptCount > 1 && activeAttempt != null
      ? `${versionBase}-${activeAttempt}/${attemptCount}`
      : versionBase
    : null;
  // Anchor/ref role mark (Director 2026-06-20) — sits in the same bottom-left
  // chip ahead of the version so a shot's start/end pair vs a single ref reads
  // without hovering.
  const roleLabel = anchorRoleLabel(asset.file_type);
  // Scale chip font with tile size — readable from 32px upward, hidden on
  // very tiny tiles (≤28px) to avoid visual noise on dense grids.
  const showVersionChip = (versionLabel != null || roleLabel != null) && size >= 32;
  const chipFontSize = Math.max(7, Math.round(size / 11));
  const style: CSSProperties = {
    width: size,
    height: size,
    background: 'var(--bg-elevated)',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      title={hoverName ?? asset.filename}
      className={`relative shrink-0 rounded-md overflow-hidden border transition-colors group ${
        hasError
          ? 'border-[var(--accent-danger)]'
          : 'border-glass hover:border-[var(--accent-primary)]'
      }`}
      style={style}
    >
      <span className="absolute top-0 left-0 z-10">
        <NotificationDot assetId={asset.id} size={Math.max(4, Math.round(size / 6))} />
      </span>
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={asset.filename}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover block"
          onError={() => {
            // Surface the failing URL so a broken tile is debuggable instead of
            // silently blank. Then fall back to the placeholder + error ring.
            console.warn(`[AssetThumb] image failed to load: ${src}`);
            setHasError(true);
          }}
        />
      ) : (
        <span className="flex items-center justify-center w-full h-full text-[6px] text-text-muted uppercase">
          —
        </span>
      )}
      {showVersionChip && (
        <span
          className="absolute bottom-0.5 left-0.5 rounded-sm font-mono font-semibold tabular-nums leading-none"
          style={{
            fontSize: chipFontSize,
            padding: '0 2px',
            color: 'var(--text-primary)',
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(2px)',
            // Tight contrast pill — always readable over any thumbnail.
          }}
          aria-hidden="true"
        >
          {versionLabel}
          {roleLabel && (
            <span
              className="lowercase ml-1"
              style={{ color: 'var(--accent-primary)', fontSize: '0.85em' }}
            >
              {roleLabel}
            </span>
          )}
        </span>
      )}
      {/* Status indicator dot — bottom-right, tiny */}
      <span
        className="absolute bottom-0.5 right-0.5 rounded-full"
        style={{
          width: Math.max(3, Math.round(size / 8)),
          height: Math.max(3, Math.round(size / 8)),
          background: statusColor,
          boxShadow: '0 0 0 1px var(--bg-elevated)',
        }}
      />
      {isLocked && (
        <span
          className="absolute top-0.5 right-0.5"
          style={{ color: statusColor }}
        >
          <Lock size={Math.max(6, Math.round(size / 4))} strokeWidth={2.5} />
        </span>
      )}
    </button>
  );
}
