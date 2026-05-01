// ──────────────────────────────────────────────────────────────────────────────
// components/series-bible/AssetDetailDrawer.tsx
// Right-side drawer for a Bible asset — image at top, description editor,
// cross-ref list at bottom. Reuses PreviewDrawer styling.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Lock, Save } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { BibleAsset, SbSection } from '@/lib/api/series-bible';

const EDITABLE_STATUSES = new Set(['DRAFT', 'REVIEW', 'REVISION']);

export interface AssetDetailDrawerProps {
  open: boolean;
  onClose: () => void;
  asset: BibleAsset;
  section: Exclude<SbSection, 'general_idea'>;
  seriesId: string;
  onChange: () => void;
}

export function AssetDetailDrawer({
  open,
  onClose,
  asset,
  section: _section,
  seriesId,
  onChange,
}: AssetDetailDrawerProps) {
  const [description, setDescription] = useState(asset.description ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDescription(asset.description ?? '');
  }, [asset.id, asset.description]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const editable = EDITABLE_STATUSES.has(asset.status);
  const previewSrc = asset.staging_path || asset.drive_web_view_url || asset.drive_path || null;
  const isImage = previewSrc && (previewSrc.startsWith('/') || previewSrc.startsWith('http'));

  async function saveDescription() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/assets/${asset.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ description }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError((j as { error?: string }).error ?? 'Save failed');
      return;
    }
    onChange();
  }

  async function lock() {
    if (!confirm(`LOCK ${asset.filename}? Locked Bible assets are immutable.`)) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/series/${seriesId}/bible/${asset.id}/lock`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError((j as { error?: string }).error ?? 'Lock failed');
      return;
    }
    onChange();
    onClose();
  }

  return createPortal(
    <div className="fixed inset-0 z-50 pointer-events-none" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px] pointer-events-auto"
        onClick={onClose}
      />
      <aside
        className="absolute top-0 right-0 h-full pointer-events-auto flex flex-col border-l border-glass shadow-2xl"
        style={{
          width: '600px',
          maxWidth: '100vw',
          background: 'var(--panel-glass-strong-bg)',
          backdropFilter: 'blur(18px)',
        }}
      >
        <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-glass">
          <div className="min-w-0 flex-1">
            <div className="text-xs uppercase tracking-wider text-text-muted">
              Bible asset
            </div>
            <div className="text-sm font-medium text-text-primary font-mono truncate">
              {asset.filename}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-text-secondary hover:bg-[var(--panel-hover-bg)] transition-colors"
            aria-label="Close"
          >
            <X size={14} strokeWidth={1.7} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {isImage && (
            <div className="rounded-lg overflow-hidden border border-glass">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewSrc!} alt={asset.filename} className="w-full h-auto block" />
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-xs uppercase tracking-wider text-text-muted">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              readOnly={!editable}
              rows={6}
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm text-text-primary font-sans leading-relaxed focus:outline-none focus:border-[var(--accent-primary)]"
              placeholder="Describe this canonical asset…"
            />
          </div>

          <div className="text-xs text-text-muted space-y-1">
            <div>Status: <span className="text-text-primary">{asset.status}</span></div>
            <div>Version: <span className="text-text-primary font-mono">v{String(asset.version ?? 1).padStart(2, '0')}</span></div>
            {asset.drive_web_view_url && (
              <div>
                Drive:{' '}
                <a
                  href={asset.drive_web_view_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[var(--accent-primary)] hover:underline"
                >
                  open in Google Drive
                </a>
              </div>
            )}
          </div>

          {error && (
            <div
              className="rounded-lg p-2 text-xs"
              style={{
                background: 'color-mix(in oklab, var(--accent-danger) 14%, transparent)',
                color: 'var(--accent-danger)',
              }}
            >
              {error}
            </div>
          )}
        </div>

        <div className="border-t border-glass px-4 py-2.5 flex items-center justify-end gap-2">
          {editable && (
            <Button variant="ghost" onClick={saveDescription} disabled={busy}>
              <Save size={13} /> Save
            </Button>
          )}
          {asset.status !== 'LOCKED' && (
            <Button onClick={lock} disabled={busy}>
              <Lock size={13} /> Lock
            </Button>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
