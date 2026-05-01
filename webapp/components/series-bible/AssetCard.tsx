// ──────────────────────────────────────────────────────────────────────────────
// components/series-bible/AssetCard.tsx
// Single Bible asset card — LoRes thumbnail, name, status pill, kebab menu.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useState } from 'react';
import { Lock, Unlock, MoreHorizontal, Eye, Edit, Trash } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/DropdownMenu';
import { Card } from '@/components/ui/Card';
import type { BibleAsset, SbSection } from '@/lib/api/series-bible';
import { AssetDetailDrawer } from './AssetDetailDrawer';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'var(--accent-info)',
  REVIEW: 'var(--accent-warning, #d97706)',
  REVISION: 'var(--accent-warning, #d97706)',
  APPROVED: 'var(--accent-success)',
  LOCKED: 'var(--accent-success)',
  REJECTED: 'var(--accent-danger)',
};

export interface AssetCardProps {
  seriesId: string;
  asset: BibleAsset;
  section: Exclude<SbSection, 'general_idea'>;
  onChange: () => void;
}

function readableNameFromFilename(filename: string): string {
  // SS-S03-BIB-character_sandy-v01-LOCKED.png → "sandy"
  const m = filename.match(/-BIB-[a-z_]+_([a-z0-9_-]+)-v\d+-/i);
  if (m && m[1]) return m[1].replace(/_/g, ' ');
  return filename;
}

export function AssetCard({ seriesId, asset, section, onChange }: AssetCardProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const previewSrc = asset.staging_path || asset.drive_web_view_url || asset.drive_path || null;
  const isImage = previewSrc && (previewSrc.startsWith('/') || previewSrc.startsWith('http'));
  const statusColor = STATUS_COLORS[asset.status] ?? 'var(--text-muted)';
  const isLocked = asset.status === 'LOCKED';
  const name = readableNameFromFilename(asset.filename);

  async function lock() {
    if (!confirm(`LOCK ${asset.filename}? Locked Bible assets are immutable.`)) return;
    setBusy(true);
    const res = await fetch(`/api/series/${seriesId}/bible/${asset.id}/lock`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(`Lock failed: ${(j as { error?: string }).error ?? 'unknown'}`);
      return;
    }
    onChange();
  }

  return (
    <>
      <Card>
        <div
          className="relative cursor-pointer overflow-hidden rounded-lg"
          onClick={() => setDrawerOpen(true)}
          style={{ background: 'var(--bg-elevated)' }}
        >
          <div
            className="aspect-square w-full flex items-center justify-center text-text-muted text-xs"
          >
            {isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewSrc!}
                alt={name}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="px-2 text-center">no preview</span>
            )}
          </div>

          <div className="p-2 space-y-1">
            <div className="text-xs font-medium text-text-primary truncate capitalize">{name}</div>
            <div className="flex items-center justify-between gap-1 text-[10px]">
              <span
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded uppercase tracking-wider font-semibold"
                style={{
                  background: `color-mix(in oklab, ${statusColor} 14%, transparent)`,
                  color: statusColor,
                }}
              >
                {isLocked && <Lock size={9} />}
                {asset.status.toLowerCase()}
              </span>
              <span className="text-text-muted font-mono">v{String(asset.version ?? 1).padStart(2, '0')}</span>
            </div>
          </div>

          <div
            className="absolute top-1 right-1"
            onClick={(e) => e.stopPropagation()}
          >
            <DropdownMenu>
              <DropdownMenuTrigger className="p-1 rounded hover:bg-[var(--panel-hover-bg)] transition-colors">
                <MoreHorizontal size={14} />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => setDrawerOpen(true)}>
                  <Eye size={12} /> Preview
                </DropdownMenuItem>
                {!isLocked && (
                  <DropdownMenuItem onClick={() => setDrawerOpen(true)}>
                    <Edit size={12} /> Edit
                  </DropdownMenuItem>
                )}
                {!isLocked ? (
                  <DropdownMenuItem onClick={lock} disabled={busy}>
                    <Lock size={12} /> Lock
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem disabled>
                    <Unlock size={12} /> Fork as v{(asset.version ?? 1) + 1} (planned)
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem disabled>
                  Used in: (loading after Step 7)
                </DropdownMenuItem>
                {!isLocked && asset.version === 1 && (
                  <DropdownMenuItem disabled>
                    <Trash size={12} /> Delete (planned)
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </Card>

      <AssetDetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        asset={asset}
        section={section}
        seriesId={seriesId}
        onChange={onChange}
      />
    </>
  );
}
