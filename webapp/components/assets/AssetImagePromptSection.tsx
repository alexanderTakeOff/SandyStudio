// ──────────────────────────────────────────────────────────────────────────────
// components/assets/AssetImagePromptSection.tsx
// Collapsible "Image prompt" section used inside AssetDrawer.
// Renders:
//   - editable prompt textarea (current entry)
//   - Regenerate $0.04 button (mode-aware: in Mode 1 sends directorConfirm:true)
//   - Upload your own (file input → POST /upload)
//   - Style anchor info
//   - Prompt history list with per-version Restore + delta info
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  History,
  RotateCcw,
  Sparkles,
  Upload,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { AssetCollapsibleSection } from './AssetCollapsibleSection';
import { StyleGuardianBadge } from './StyleGuardianBadge';
import type { ImagePromptDoc, ImagePromptHistoryEntry } from '@/lib/api/series-bible';

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

export interface AssetImagePromptSectionProps {
  assetId: string;
  promptDoc: ImagePromptDoc | undefined;
  editable: boolean;
  /** Open/closed — caller controls so global open-state can be persisted. */
  open: boolean;
  onToggle: () => void;
  /** Callback fired after a successful regenerate / restore / upload — refresh asset. */
  onChanged: () => void;
  /** Asset's file_type — fed to Style Guardian as asset_type. */
  assetType?: string;
  /** Series UUID for Style Guardian context. Null → guardian skipped. */
  seriesId?: string | null;
}

export function AssetImagePromptSection({
  assetId,
  promptDoc,
  editable,
  open,
  onToggle,
  onChanged,
  assetType,
  seriesId,
}: AssetImagePromptSectionProps) {
  const currentEntry: ImagePromptHistoryEntry | undefined = useMemo(() => {
    if (!promptDoc) return undefined;
    return promptDoc.history.find((h) => h.version === promptDoc.current_version);
  }, [promptDoc]);

  const [draft, setDraft] = useState(currentEntry?.prompt ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(currentEntry?.prompt ?? '');
  }, [currentEntry?.prompt]);

  if (!promptDoc || !currentEntry) return null;

  async function regenerate() {
    if (!draft.trim()) {
      setError('Prompt cannot be empty');
      return;
    }
    if (!confirm(`Regenerate image with this prompt?\nCost: ~$0.04 (gpt-image-1, medium quality)`)) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/assets/${assetId}/regenerate-image`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: draft, quality: 'medium', directorConfirm: true }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError((j as { error?: string }).error ?? 'Regenerate failed');
      return;
    }
    onChanged();
  }

  async function restore(version: number) {
    if (!confirm(`Restore image v${String(version).padStart(2, '0')} as current?\nA new history entry will be created (no destruction).`)) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/assets/${assetId}/regenerate-image`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ restore_version: version, directorConfirm: true }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError((j as { error?: string }).error ?? 'Restore failed');
      return;
    }
    onChanged();
  }

  async function uploadFile(file: File) {
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
    <AssetCollapsibleSection
      open={open}
      onToggle={onToggle}
      label={
        <span className="flex items-center gap-1.5">
          <Sparkles size={12} />
          Image prompt (v{String(promptDoc.current_version).padStart(2, '0')})
        </span>
      }
      meta={`${currentEntry.source} · ${fmtDate(currentEntry.at)}`}
    >
      <div className="space-y-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          readOnly={!editable}
          rows={8}
          className="w-full px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-glass text-xs text-text-primary font-mono leading-relaxed focus:outline-none focus:border-[var(--accent-primary)]"
          placeholder="Edit the prompt and click Regenerate to reroll the image…"
        />
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="text-[10px] text-text-muted">
              Style anchor:{' '}
              <span className="text-text-secondary font-mono">
                {promptDoc.style_anchor_asset_id
                  ? promptDoc.style_anchor_asset_id.slice(0, 8) + '…'
                  : 'none'}
              </span>
            </div>
            {assetType && seriesId && (
              <StyleGuardianBadge prompt={draft} assetType={assetType} seriesId={seriesId} />
            )}
          </div>
          {editable && (
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*,audio/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadFile(f);
                  e.target.value = ''; // allow re-upload of same file
                }}
              />
              <Button
                variant="ghost"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
              >
                <Upload size={13} /> Upload your own
              </Button>
              <Button
                onClick={regenerate}
                disabled={busy}
                variant="ghost"
                style={
                  busy
                    ? {
                        opacity: 0.55,
                        cursor: 'not-allowed',
                        background:
                          'color-mix(in oklab, var(--accent-primary) 18%, transparent)',
                        borderColor:
                          'color-mix(in oklab, var(--accent-primary) 40%, transparent)',
                      }
                    : undefined
                }
              >
                {busy ? (
                  <>
                    <Loader2 size={13} className="animate-spin" /> Regenerating…
                  </>
                ) : (
                  <>
                    <Sparkles size={13} /> Regenerate $0.04
                  </>
                )}
              </Button>
            </div>
          )}
        </div>

        {error && (
          <div
            className="rounded-md p-2 text-[11px]"
            style={{ background: 'color-mix(in oklab, var(--accent-danger) 14%, transparent)', color: 'var(--accent-danger)' }}
          >
            {error}
          </div>
        )}

        {/* Prompt history */}
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
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-text-primary">v{String(h.version).padStart(2, '0')}</span>
                      <span className="text-text-muted">·</span>
                      <span className="text-text-secondary">{h.source}</span>
                      {h.restored_from_version != null && (
                        <span className="text-text-muted">(from v{String(h.restored_from_version).padStart(2, '0')})</span>
                      )}
                      {h.mode_at_time !== undefined && (
                        <span className="text-text-muted">· Mode {h.mode_at_time}</span>
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
                      onClick={() => restore(h.version)}
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
    </AssetCollapsibleSection>
  );
}
