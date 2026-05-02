// ──────────────────────────────────────────────────────────────────────────────
// components/series-bible/AssetDetailDrawer.tsx
// Right-side drawer for a Bible asset.
//
// Sections (top → bottom):
//   1. Header — filename + close
//   2. Provenance chip — who created / who last edited (renders from
//      metadata.provenance, which is written by extension approval, manual
//      add, and any PATCH).
//   3. Reference image — current staging_path / drive URL.
//   4. Description editor (markdown body in `content`).
//   5. Image prompt — collapsed by default. When expanded:
//        - editable textarea with the current prompt
//        - "Regenerate $0.04" button → POST /regenerate-image
//        - history list (vN — source — date) with "Restore" button per entry
//   6. Sticky footer — Save description · Lock
//
// The whole prompt section is hidden when the asset has no image_prompt
// metadata yet (legacy assets prior to migration 0020 / EXEC-BIBLE-AUTHOR).
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Lock, Save, ChevronDown, ChevronRight, Sparkles, RotateCcw, History, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type {
  BibleAsset,
  ImagePromptHistoryEntry,
  AssetProvenance,
  SbSection,
} from '@/lib/api/series-bible';

const EDITABLE_STATUSES = new Set(['DRAFT', 'REVIEW', 'REVISION']);

export interface AssetDetailDrawerProps {
  open: boolean;
  onClose: () => void;
  asset: BibleAsset;
  section: Exclude<SbSection, 'general_idea'>;
  seriesId: string;
  onChange: () => void;
}

/** ISO date → "2026-05-02 14:32" */
function fmtDate(iso: string | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return iso;
  }
}

function ProvenanceChip({ prov }: { prov: AssetProvenance | undefined }) {
  if (!prov) {
    return (
      <div className="text-xs text-text-muted italic">
        No provenance recorded (legacy asset)
      </div>
    );
  }
  const createdIcon = prov.created_by_kind === 'agent' ? '🤖' : prov.created_by_kind === 'director' ? '👤' : '⚙️';
  const editedIcon =
    prov.last_modified_by_kind === 'agent' ? '🤖' : prov.last_modified_by_kind === 'director' ? '👤' : '⚙️';
  return (
    <div className="space-y-1 text-xs text-text-secondary">
      <div className="flex items-center gap-1.5">
        <span>{createdIcon}</span>
        <span>
          Created by <span className="text-text-primary font-medium">{prov.created_by}</span>
        </span>
        <span className="text-text-muted">·</span>
        <span className="font-mono">{fmtDate(prov.created_at)}</span>
        <span className="text-text-muted">·</span>
        <span className="text-text-muted">{prov.source.replace(/_/g, ' ')}</span>
      </div>
      {prov.last_modified_at && (
        <div className="flex items-center gap-1.5">
          <span>{editedIcon}</span>
          <span>
            Last edited by{' '}
            <span className="text-text-primary font-medium">{prov.last_modified_by ?? '—'}</span>
          </span>
          <span className="text-text-muted">·</span>
          <span className="font-mono">{fmtDate(prov.last_modified_at)}</span>
        </div>
      )}
    </div>
  );
}

export function AssetDetailDrawer({
  open,
  onClose,
  asset,
  section: _section,
  seriesId,
  onChange,
}: AssetDetailDrawerProps) {
  const initialContent = asset.content ?? '';
  const initialDescription = asset.description ?? '';
  const [description, setDescription] = useState(initialDescription);
  const [content, setContent] = useState(initialContent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prompt-edit local state
  const promptDoc = asset.metadata?.image_prompt;
  const currentPromptEntry: ImagePromptHistoryEntry | undefined = useMemo(() => {
    if (!promptDoc) return undefined;
    return promptDoc.history.find((h) => h.version === promptDoc.current_version);
  }, [promptDoc]);
  const [promptOpen, setPromptOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [promptDraft, setPromptDraft] = useState(currentPromptEntry?.prompt ?? '');

  useEffect(() => {
    setDescription(asset.description ?? '');
    setContent(asset.content ?? '');
    setPromptDraft(currentPromptEntry?.prompt ?? '');
  }, [asset.id, asset.description, asset.content, currentPromptEntry?.prompt]);

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

  async function regenerateImage() {
    if (!promptDraft.trim()) {
      setError('Prompt cannot be empty');
      return;
    }
    if (!confirm(`Regenerate image with this prompt?\nCost: ~$0.04 (gpt-image-1, medium quality)`)) return;
    setBusy(true);
    setError(null);
    const res = await fetch(
      `/api/series/${seriesId}/bible/${asset.id}/regenerate-image`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: promptDraft, quality: 'medium' }),
      },
    );
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError((j as { error?: string }).error ?? 'Regenerate failed');
      return;
    }
    onChange();
  }

  async function restoreVersion(version: number) {
    if (!confirm(`Restore image version v${String(version).padStart(2, '0')} as the current image?\nA new history entry will be created (no destruction).`)) return;
    setBusy(true);
    setError(null);
    const res = await fetch(
      `/api/series/${seriesId}/bible/${asset.id}/regenerate-image`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ restore_version: version }),
      },
    );
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError((j as { error?: string }).error ?? 'Restore failed');
      return;
    }
    onChange();
  }

  async function enrich() {
    if (!confirm(`Generate description + reference image with EXEC-BIBLE-AUTHOR?\nCost: ~$0.06 (Sonnet description + gpt-image-1 medium quality)\nTakes ~10-20s.`)) return;
    setBusy(true);
    setError(null);
    const res = await fetch(
      `/api/series/${seriesId}/bible/${asset.id}/enrich`,
      { method: 'POST' },
    );
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError((j as { error?: string }).error ?? 'Enrich failed');
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
          {/* Provenance chip */}
          <div
            className="rounded-lg p-2.5 border border-glass"
            style={{ background: 'color-mix(in oklab, var(--bg-elevated) 80%, transparent)' }}
          >
            <ProvenanceChip prov={asset.metadata?.provenance} />
          </div>

          {/* Image preview */}
          {isImage && (
            <div className="rounded-lg overflow-hidden border border-glass">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewSrc!} alt={asset.filename} className="w-full h-auto block" />
            </div>
          )}

          {/* Description (one-line summary) */}
          <div className="space-y-2">
            <label className="block text-xs uppercase tracking-wider text-text-muted">
              Summary (one line)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              readOnly={!editable}
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm text-text-primary focus:outline-none focus:border-[var(--accent-primary)]"
              placeholder="Short summary used in card lists"
            />
          </div>

          {/* Markdown body */}
          <div className="space-y-2">
            <label className="block text-xs uppercase tracking-wider text-text-muted">
              Description (markdown body)
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              readOnly={!editable}
              rows={14}
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm text-text-primary font-sans leading-relaxed focus:outline-none focus:border-[var(--accent-primary)]"
              placeholder="Full canonical description in markdown…"
            />
          </div>

          {/* Image prompt — collapsed disclosure, shown only when metadata exists */}
          {promptDoc && currentPromptEntry && (
            <div className="rounded-lg border border-glass overflow-hidden">
              <button
                type="button"
                onClick={() => setPromptOpen((v) => !v)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-[var(--panel-hover-bg)] transition-colors"
              >
                <span className="flex items-center gap-2 text-xs uppercase tracking-wider text-text-secondary">
                  {promptOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  <Sparkles size={12} />
                  Image prompt (v{String(promptDoc.current_version).padStart(2, '0')})
                </span>
                <span className="text-[10px] text-text-muted font-mono">
                  {currentPromptEntry.source} · {fmtDate(currentPromptEntry.at)}
                </span>
              </button>

              {promptOpen && (
                <div className="border-t border-glass p-3 space-y-3">
                  <textarea
                    value={promptDraft}
                    onChange={(e) => setPromptDraft(e.target.value)}
                    readOnly={!editable}
                    rows={8}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-glass text-xs text-text-primary font-mono leading-relaxed focus:outline-none focus:border-[var(--accent-primary)]"
                    placeholder="Edit the prompt and click Regenerate to reroll the image…"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[10px] text-text-muted">
                      Style anchor:{' '}
                      <span className="text-text-secondary font-mono">
                        {promptDoc.style_anchor_asset_id
                          ? promptDoc.style_anchor_asset_id.slice(0, 8) + '…'
                          : 'none'}
                      </span>
                    </div>
                    {editable && (
                      <Button onClick={regenerateImage} disabled={busy} variant="ghost">
                        <Sparkles size={13} /> Regenerate $0.04
                      </Button>
                    )}
                  </div>

                  {/* History */}
                  <div>
                    <button
                      type="button"
                      onClick={() => setHistoryOpen((v) => !v)}
                      className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-text-muted hover:text-text-secondary transition-colors"
                    >
                      {historyOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                      <History size={10} />
                      Prompt history ({promptDoc.history.length})
                    </button>
                    {historyOpen && (
                      <ul className="mt-2 space-y-1.5">
                        {[...promptDoc.history].reverse().map((h) => (
                          <li
                            key={h.version}
                            className="flex items-start justify-between gap-2 p-2 rounded-md text-[11px]"
                            style={{ background: 'var(--bg-elevated)' }}
                          >
                            <div className="min-w-0 flex-1 space-y-0.5">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-text-primary">v{String(h.version).padStart(2, '0')}</span>
                                <span className="text-text-muted">·</span>
                                <span className="text-text-secondary">{h.source}</span>
                                {h.restored_from_version != null && (
                                  <span className="text-text-muted">
                                    (from v{String(h.restored_from_version).padStart(2, '0')})
                                  </span>
                                )}
                                <span className="text-text-muted">·</span>
                                <span className="font-mono text-text-muted">{fmtDate(h.at)}</span>
                                {h.cost_usd > 0 && (
                                  <>
                                    <span className="text-text-muted">·</span>
                                    <span className="font-mono text-text-muted">${h.cost_usd.toFixed(3)}</span>
                                  </>
                                )}
                              </div>
                              <div className="text-text-muted truncate" title={h.prompt}>
                                {h.prompt.slice(0, 110)}
                                {h.prompt.length > 110 ? '…' : ''}
                              </div>
                            </div>
                            {editable && h.version !== promptDoc.current_version && (h.staging_path || h.drive_web_view_url) && (
                              <button
                                onClick={() => restoreVersion(h.version)}
                                disabled={busy}
                                className="shrink-0 p-1 rounded hover:bg-[var(--panel-hover-bg)] transition-colors text-text-secondary"
                                title={`Restore v${h.version}`}
                              >
                                <RotateCcw size={11} />
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Status / version meta */}
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
