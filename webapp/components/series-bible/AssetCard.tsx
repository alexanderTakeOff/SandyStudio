// ──────────────────────────────────────────────────────────────────────────────
// components/series-bible/AssetCard.tsx
// Single Bible asset card — LoRes thumbnail, name, status pill, kebab menu.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useState } from 'react';
import { Lock, Unlock, MoreHorizontal, Eye, Edit, Trash } from 'lucide-react';
import { DropdownMenu, type DropdownEntry } from '@/components/ui/DropdownMenu';
import { Card } from '@/components/ui/Card';
import { bibleSlug, type BibleAsset, type SbSection } from '@/lib/api/series-bible';
import { NotificationDot } from '@/components/notifications/NotificationDot';
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

/** Display name for the card — humanise the slug ("city_systems" → "city systems"). */
function readableName(asset: { file_type: string; filename: string }): string {
  const slug = bibleSlug(asset.file_type);
  return slug ? slug.replace(/_/g, ' ') : asset.filename;
}

export function AssetCard({ seriesId, asset, section, onChange }: AssetCardProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Pick first browser-loadable URL — staging_path may legacy-store a Windows
  // absolute path (`C:\...`) that <img> can't render; fall through to drive_path.
  const previewCandidates: Array<string | null | undefined> = [
    asset.drive_path,
    asset.staging_path,
    asset.drive_web_view_url,
    asset.metadata?.image_prompt?.history?.[
      (asset.metadata.image_prompt.current_version ?? 1) - 1
    ]?.staging_path,
  ];
  const previewSrc = previewCandidates.find(
    (c): c is string => typeof c === 'string' && (c.startsWith('/') || c.startsWith('http')),
  ) ?? null;
  const isImage = !!previewSrc;
  const statusColor = STATUS_COLORS[asset.status] ?? 'var(--text-muted)';
  const isLocked = asset.status === 'LOCKED';
  const name = readableName(asset);

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

  async function del() {
    if (!confirm(`DELETE ${asset.filename}?\n\nStatus: ${asset.status}\nThis is permanent. Drive file (if any) will become an orphan in Drive trash.`)) return;
    setBusy(true);
    const res = await fetch(`/api/assets/${asset.id}`, { method: 'DELETE' });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(`Delete failed: ${(j as { error?: string }).error ?? 'unknown'}`);
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
            <div className="text-xs font-medium text-text-primary truncate capitalize flex items-center gap-1.5">
              <NotificationDot assetId={asset.id} />
              <span className="truncate">{name}</span>
            </div>
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
            {(() => {
              const items: DropdownEntry[] = [
                { label: 'Preview', icon: <Eye size={12} />, onSelect: () => setDrawerOpen(true) },
              ];
              if (!isLocked) {
                items.push({ label: 'Edit', icon: <Edit size={12} />, onSelect: () => setDrawerOpen(true) });
                items.push({ separator: true });
                items.push({ label: 'Lock', icon: <Lock size={12} />, onSelect: lock, disabled: busy });
              } else {
                items.push({
                  label: `Fork as v${(asset.version ?? 1) + 1} (planned)`,
                  icon: <Unlock size={12} />,
                  onSelect: () => {},
                  disabled: true,
                });
              }
              items.push({ separator: true });
              items.push({
                label: 'Used in: (Step 7)',
                onSelect: () => {},
                disabled: true,
              });
              // Delete available for non-LOCKED, non-APPROVED. Director can
              // freely clear drafts/reviews/revisions/rejected — protects
              // canonical APPROVED/LOCKED from accidental loss. Backend
              // enforces same scope via DELETABLE_STATUSES in /api/assets/[id].
              if (!isLocked && asset.status !== 'APPROVED') {
                items.push({ separator: true });
                items.push({
                  label: 'Delete',
                  icon: <Trash size={12} />,
                  onSelect: del,
                  disabled: busy,
                  destructive: true,
                });
              }
              return (
                <DropdownMenu
                  trigger={
                    <span className="block p-1 rounded hover:bg-[var(--panel-hover-bg)] transition-colors">
                      <MoreHorizontal size={14} />
                    </span>
                  }
                  items={items}
                  align="end"
                  ariaLabel="Asset actions"
                />
              );
            })()}
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
