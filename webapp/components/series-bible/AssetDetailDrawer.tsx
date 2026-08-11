// ──────────────────────────────────────────────────────────────────────────────
// components/series-bible/AssetDetailDrawer.tsx
// Bible-asset Drawer. Now thin wrapper using shared components from
// /components/assets/ — same UX, single source of truth shared with the
// episode-level preview drawer.
//
// Sections (top → bottom, all collapsible per Director's 2026-05-02 request):
//   1. Header — filename + close
//   2. Provenance chip — created/last-modified + mode_at_time
//   3. In-flight progress banner (visible during enrich/regenerate/restore/upload)
//   4. Reference image preview (collapsible)
//   5. Enrich CTA (when no image_prompt history yet — legacy or auto-failed)
//   6. Summary (one-line) + Markdown body — both collapsible
//   7. AssetImagePromptSection — prompt edit + Regenerate + Upload + History
//   8. Status & meta — collapsible
//
// All mutating actions go through /api/assets/[id]/{regenerate-image,enrich,upload}
// — the generic Mode-aware endpoints. Legacy Bible-specific routes are kept as
// thin wrappers for back-compat.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Lock, Save, Wand2, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { AssetCollapsibleSection } from '@/components/assets/AssetCollapsibleSection';
import { AssetProvenanceChip } from '@/components/assets/AssetProvenanceChip';
import { AssetImagePromptSection } from '@/components/assets/AssetImagePromptSection';
import type { BibleAsset, ImagePromptHistoryEntry, SbSection } from '@/lib/api/series-bible';
import { resolvePreviewSrc } from '@/lib/asset-preview-resolver';
import { currentPromptEntry as pickCurrentPromptEntry } from '@/lib/asset-preview-resolver';

const EDITABLE_STATUSES = new Set(['DRAFT', 'REVIEW', 'REVISION']);

/** Inline Upload affordance for assets with an image but no prompt history yet. */
function LegacyUploadCard({ assetId, onChanged }: { assetId: string; onChanged: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function upload(file: File) {
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`/api/assets/${assetId}/upload`, { method: 'POST', body: fd });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError((j as { error?: string }).error ?? 'Upload failed');
      return;
    }
    onChanged();
  }
  return (
    <div
      className="rounded-lg border border-dashed border-glass p-3 flex items-center gap-3"
      style={{ background: 'color-mix(in oklab, var(--accent-info) 6%, transparent)' }}
    >
      <Upload size={16} className="text-[var(--accent-info, var(--accent-primary))]" />
      <div className="flex-1 min-w-0">
        <div className="text-xs text-text-primary font-medium">Replace image with your own</div>
        <div className="text-[10px] text-text-muted">
          Upload PNG/JPG/WebP/MP4/WAV. Initialises prompt history at v01.
        </div>
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/*,video/*,audio/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
          e.target.value = '';
        }}
      />
      <Button variant="ghost" onClick={() => ref.current?.click()} disabled={busy}>
        <Upload size={13} /> Upload
      </Button>
      {error && (
        <div className="text-[10px]" style={{ color: 'var(--accent-danger)' }}>
          {error}
        </div>
      )}
    </div>
  );
}

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
  seriesId: _seriesId,
  onChange,
}: AssetDetailDrawerProps) {
  const [description, setDescription] = useState(asset.description ?? '');
  const [content, setContent] = useState(asset.content ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<null | { label: string; detail: string }>(null);

  // Per-section open/closed (Director: every block must be foldable)
  const [imageOpen, setImageOpen] = useState(true);
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [bodyOpen, setBodyOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [metaOpen, setMetaOpen] = useState(true);

  useEffect(() => {
    setDescription(asset.description ?? '');
    setContent(asset.content ?? '');
  }, [asset.id, asset.description, asset.content]);

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
  const promptDoc = asset.metadata?.image_prompt;
  const currentPromptEntry: ImagePromptHistoryEntry | undefined =
    pickCurrentPromptEntry<ImagePromptHistoryEntry>(promptDoc) ?? undefined;

  // Pick first browser-loadable URL via the shared resolver (legacy assets may
  // store OS-specific abs paths in staging_path; fall through to drive_path/history).
  const previewSrc = resolvePreviewSrc(asset, currentPromptEntry);
  const isVideoAsset = asset.file_type.startsWith('SBL-video');
  const isImage = !!previewSrc && !isVideoAsset;

  async function saveTextEdits() {
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = {};
    if (description !== (asset.description ?? '')) body.description = description;
    if (content !== (asset.content ?? '')) body.content = content;
    if (Object.keys(body).length === 0) {
      setBusy(false);
      return;
    }
    const res = await fetch(`/api/assets/${asset.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError((j as { error?: string }).error ?? 'Save failed');
      return;
    }
    onChange();
  }

  async function enrich() {
    if (!confirm(`Generate description + reference image with Bible Editor?\nCost: ~$0.06 (Sonnet description + gpt-image-1).\nTakes ~10-20s.`)) return;
    setBusy(true);
    setError(null);
    setProgress({
      label: 'Bible Editor is working…',
      detail:
        'Writing rich description (Sonnet) + generating first reference image (gpt-image-1). Stay in this window — it will refresh automatically.',
    });
    try {
      const res = await fetch(`/api/assets/${asset.id}/enrich`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ directorConfirm: true }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError((j as { error?: string }).error ?? 'Enrich failed');
        return;
      }
      onChange();
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function lock() {
    if (!confirm(`LOCK ${asset.filename}? Locked Bible assets are immutable.`)) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/series/${_seriesId}/bible/${asset.id}/lock`, {
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
        style={{ width: '600px', maxWidth: '100vw', background: 'var(--panel-glass-strong-bg)', backdropFilter: 'blur(18px)' }}
      >
        <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-glass">
          <div className="min-w-0 flex-1">
            <div className="text-xs uppercase tracking-wider text-text-muted">Bible asset</div>
            <div className="text-sm font-medium text-text-primary font-mono truncate">{asset.filename}</div>
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
          {progress && (
            <div
              className="rounded-lg p-3 border flex items-start gap-3"
              style={{
                background: 'color-mix(in oklab, var(--accent-primary) 12%, transparent)',
                borderColor: 'color-mix(in oklab, var(--accent-primary) 35%, transparent)',
              }}
            >
              <Loader2 size={20} className="text-[var(--accent-primary)] shrink-0 mt-0.5 animate-spin" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-text-primary">{progress.label}</div>
                <div className="text-xs text-text-secondary mt-1">{progress.detail}</div>
              </div>
            </div>
          )}

          <div
            className="rounded-lg p-2.5 border border-glass"
            style={{ background: 'color-mix(in oklab, var(--bg-elevated) 80%, transparent)' }}
          >
            <AssetProvenanceChip prov={asset.metadata?.provenance} />
          </div>

          {isImage && (
            <AssetCollapsibleSection
              open={imageOpen}
              onToggle={() => setImageOpen((v) => !v)}
              label="Reference image"
            >
              <div className="rounded-lg overflow-hidden border border-glass">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewSrc!} alt={asset.filename} className="w-full h-auto block" />
              </div>
            </AssetCollapsibleSection>
          )}

          {isVideoAsset && previewSrc && (
            <AssetCollapsibleSection
              open={imageOpen}
              onToggle={() => setImageOpen((v) => !v)}
              label="Brand video"
            >
              <div className="rounded-lg overflow-hidden border border-glass">
                <video
                  src={`${previewSrc}#t=0.1`}
                  controls
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  className="w-full h-auto block"
                />
              </div>
            </AssetCollapsibleSection>
          )}

          {/* Enrich CTA — when no image AND no prompt history yet (not for video) */}
          {!isImage && !isVideoAsset && !promptDoc && editable && (
            <div
              className="rounded-lg border border-dashed border-glass p-4 flex flex-col items-center gap-2.5"
              style={{ background: 'color-mix(in oklab, var(--accent-primary) 6%, transparent)' }}
            >
              <Wand2 size={20} className="text-[var(--accent-primary)]" />
              <div className="text-sm text-text-primary text-center font-medium">No reference image yet</div>
              <div className="text-xs text-text-muted text-center max-w-xs">
                Bible Editor will write a rich description and generate a first reference image
                anchored on the LOCKED Style Bible.
              </div>
              <Button onClick={enrich} disabled={busy}>
                <Wand2 size={13} /> Generate description + image · $0.06
              </Button>
              <div className="text-[10px] text-text-muted">~10-20s · Sonnet description + gpt-image-1 medium</div>
            </div>
          )}

          {/* Legacy / no-prompt-doc affordance — when there IS an image but NO
              image_prompt history yet (legacy assets created before the
              metadata column or the seed script). Director can replace the
              image via Upload, which initialises the history v01. */}
          {(isImage || isVideoAsset) && !promptDoc && editable && <LegacyUploadCard assetId={asset.id} onChanged={onChange} />}

          <AssetCollapsibleSection
            open={summaryOpen}
            onToggle={() => setSummaryOpen((v) => !v)}
            label="Summary (one line)"
          >
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              readOnly={!editable}
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm text-text-primary focus:outline-none focus:border-[var(--accent-primary)]"
              placeholder="Short summary used in card lists"
            />
          </AssetCollapsibleSection>

          <AssetCollapsibleSection
            open={bodyOpen}
            onToggle={() => setBodyOpen((v) => !v)}
            label="Description (markdown body)"
            meta={`${content.split('\n').length} lines · ${content.length} chars`}
          >
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              readOnly={!editable}
              rows={14}
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm text-text-primary font-sans leading-relaxed focus:outline-none focus:border-[var(--accent-primary)]"
              placeholder="Full canonical description in markdown…"
            />
          </AssetCollapsibleSection>

          {/* Image prompt + history + regenerate + upload */}
          <AssetImagePromptSection
            assetId={asset.id}
            promptDoc={promptDoc}
            editable={editable}
            open={promptOpen}
            onToggle={() => setPromptOpen((v) => !v)}
            onChanged={onChange}
            assetType={asset.file_type}
            seriesId={asset.series_id ?? _seriesId}
          />

          <AssetCollapsibleSection
            open={metaOpen}
            onToggle={() => setMetaOpen((v) => !v)}
            label="Status & meta"
            meta={`${asset.status} · v${String(asset.version ?? 1).padStart(2, '0')}`}
          >
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
          </AssetCollapsibleSection>

          {error && (
            <div
              className="rounded-lg p-2 text-xs"
              style={{ background: 'color-mix(in oklab, var(--accent-danger) 14%, transparent)', color: 'var(--accent-danger)' }}
            >
              {error}
            </div>
          )}
        </div>

        <div className="border-t border-glass px-4 py-2.5 flex items-center justify-end gap-2">
          {editable && (
            <Button variant="ghost" onClick={saveTextEdits} disabled={busy}>
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
