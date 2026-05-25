// ──────────────────────────────────────────────────────────────────────────────
// components/assets/AssetThumb.tsx
// Compact tile for AssetGrid — Director's request: side ≈ 1/8 of current
// Bible card side (256px → ~32px) so a gallery of references is dense and
// scannable. Renders preview image only; name + status pill on hover.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import type { CSSProperties } from 'react';
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

export function AssetThumb({ asset, size = 32, hoverName, onClick }: AssetThumbProps) {
  const src = pickPreviewSrc(asset);
  const statusColor = STATUS_COLORS[asset.status] ?? 'var(--text-muted)';
  const isLocked = asset.status === 'LOCKED';
  // 2026-05-25 Director feedback: thumbs lacked a visible version chip so
  // sibling refs were indistinguishable without hovering. Show a compact
  // `v01` / `v02` badge in the bottom-left of each tile.
  const versionLabel =
    asset.version != null ? `v${String(asset.version).padStart(2, '0')}` : null;
  // Scale chip font with tile size — readable from 32px upward, hidden on
  // very tiny tiles (≤28px) to avoid visual noise on dense grids.
  const showVersionChip = versionLabel != null && size >= 32;
  const chipFontSize = Math.max(8, Math.round(size / 5.5));
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
      className="relative shrink-0 rounded-md overflow-hidden border border-glass hover:border-[var(--accent-primary)] transition-colors group"
      style={style}
    >
      <span className="absolute top-0 left-0 z-10">
        <NotificationDot assetId={asset.id} size={Math.max(4, Math.round(size / 6))} />
      </span>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={asset.filename} className="w-full h-full object-cover block" />
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
            padding: '1px 3px',
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
