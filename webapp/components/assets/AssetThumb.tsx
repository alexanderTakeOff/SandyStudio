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

function pickPreviewSrc(a: AssetThumbProps['asset']): string | null {
  // Drive-backed media → stable /api/media/<id> route (post-2026-06-01 cache
  // migration); /staging is dead, drive_web_view_url is a viewer page not an image.
  if (a.id && a.drive_web_view_url) return `/api/media/${a.id}`;
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

// Tiles render small (~32px). At this size, shipping a full-resolution PNG is
// pure waste, so for the dynamic `/api/media/<id>` route we ask for a resized
// WebP thumbnail (`?w=`). DPR-aware: 2× the CSS size keeps the tile crisp on
// retina without hauling the original. Only the media route understands the
// thumb param — static `/staging`/`http` URLs are passed through untouched.
const THUMB_DPR = 2;
const THUMB_GATE_PX = 96; // only request thumbs for genuinely small grid tiles

function withThumbParam(src: string, size: number): string {
  if (size > THUMB_GATE_PX) return src;
  if (!src.startsWith('/api/media/')) return src;
  const width = Math.max(16, Math.round(size * THUMB_DPR));
  const sep = src.includes('?') ? '&' : '?';
  return `${src}${sep}w=${width}`;
}

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
  const versionLabel =
    asset.version != null ? `v${String(asset.version).padStart(2, '0')}` : null;
  // Scale chip font with tile size — readable from 32px upward, hidden on
  // very tiny tiles (≤28px) to avoid visual noise on dense grids.
  const showVersionChip = versionLabel != null && size >= 32;
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
