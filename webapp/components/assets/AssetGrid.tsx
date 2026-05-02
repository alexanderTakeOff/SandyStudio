// ──────────────────────────────────────────────────────────────────────────────
// components/assets/AssetGrid.tsx
// Generic dense grid of AssetThumb tiles. Used by:
//   - EpisodeReferencesGallery (cardSize='sm', size=32px)
//   - (future) Bible Library refactor — would replace LibraryFeeds card grid
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { AssetThumb, type AssetThumbProps } from './AssetThumb';

export interface AssetGridAsset extends AssetThumbProps['asset'] {
  /** Optional friendly label shown on hover/title. */
  hoverName?: string;
}

export interface AssetGridProps {
  assets: AssetGridAsset[];
  /** Tile size in px. Default 32. */
  size?: number;
  /** Click handler — receives the asset id. */
  onAssetClick?: (assetId: string) => void;
  /** Optional className for grid container layout overrides. */
  className?: string;
  /** Empty-state message. */
  emptyMessage?: string;
}

export function AssetGrid({
  assets,
  size = 32,
  onAssetClick,
  className,
  emptyMessage = 'No assets yet.',
}: AssetGridProps) {
  if (assets.length === 0) {
    return (
      <div className={className ?? 'text-xs text-text-muted italic px-1'}>{emptyMessage}</div>
    );
  }
  return (
    <div
      className={
        className ??
        'flex flex-wrap gap-1 items-start'
      }
    >
      {assets.map((a) => (
        <AssetThumb
          key={a.id}
          asset={a}
          size={size}
          hoverName={a.hoverName}
          onClick={onAssetClick ? () => onAssetClick(a.id) : undefined}
        />
      ))}
    </div>
  );
}
