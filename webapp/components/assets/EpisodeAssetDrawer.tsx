// ──────────────────────────────────────────────────────────────────────────────
// components/assets/EpisodeAssetDrawer.tsx
// Drawer for episode-level visual assets (IMG-episode_ref_*, IMG-thumbnail,
// VID-shot, etc.). Mirrors series-bible/AssetDetailDrawer but:
//   - No Lock action (episode-level status changes go through /approve route)
//   - No "section" prop
//   - Optional `onBack` prop renders ← back-to-gallery link in header
//
// All sub-components are shared with the Bible Drawer (single source of truth):
//   AssetProvenanceChip, AssetImagePromptSection, AssetCollapsibleSection.
//
// All mutating actions go through /api/assets/[id]/{regenerate-image,upload}
// — the same generic Mode-aware endpoints.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useSWR from 'swr';
import ReactMarkdown from 'react-markdown';
import {
  ArrowLeft,
  X,
  Save,
  Wand2,
  Loader2,
  Upload,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { AssetCollapsibleSection } from './AssetCollapsibleSection';
import { AssetProvenanceChip } from './AssetProvenanceChip';
import { AssetImagePromptSection } from './AssetImagePromptSection';
import {
  TestPlanCard,
  VerdictPill,
  ScoreBars,
  IssuesList,
  CandidatesStrip,
} from './EREFv2Sections';
import { InboxNotePromptModal } from '@/components/inbox/InboxNotePromptModal';
import { fetcher } from '@/lib/swr';
import { isShotReferenceV2 } from '@/lib/api/shot-reference';
import type {
  AssetMetadataDoc,
  ImagePromptHistoryEntry,
} from '@/lib/api/series-bible';

// Provider IDs available for per-image regeneration override.
// Hard-coded for MVP — kept in sync with lib/agents/providers/image-gen-multi-registry.ts.
const PROVIDER_OPTIONS: Array<{ id: 'openai-edits-multi' | 'flux-pro-1.1-ultra'; label: string }> = [
  { id: 'openai-edits-multi', label: 'OpenAI Edits' },
  { id: 'flux-pro-1.1-ultra', label: 'Flux Pro 1.1 Ultra' },
];

type DecisionVerb = 'APPROVE' | 'REJECT' | 'REQUEST_REVISION';

const EDITABLE_STATUSES = new Set(['DRAFT', 'REVIEW', 'REVISION']);

export interface EpisodeAsset {
  id: string;
  filename: string;
  file_type: string;
  status: string;
  version: number | null;
  description: string | null;
  content: string | null;
  staging_path: string | null;
  drive_path: string | null;
  drive_web_view_url: string | null;
  drive_file_id: string | null;
  episode_id: string | null;
  series_id: string | null;
  metadata?: AssetMetadataDoc | null;
}

export interface EpisodeAssetDrawerProps {
  open: boolean;
  onClose: () => void;
  asset: EpisodeAsset;
  onChange: () => void;
  /** When set, shows a "← back" button in the header (e.g. back to gallery). */
  onBack?: () => void;
  /** Header label override — defaults to "EPISODE ASSET". */
  kindLabel?: string;
  /**
   * Series UUID for Style Guardian context. Episode-level assets don't carry
   * series_id on the asset row — caller (episode page) supplies it from the
   * episode object.
   */
  seriesId?: string | null;
}

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
        <div className="text-xs text-text-primary font-medium">Replace with your own file</div>
        <div className="text-[10px] text-text-muted">PNG/JPG/WebP/MP4/WAV. Initialises prompt history.</div>
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

export function EpisodeAssetDrawer({
  open,
  onClose,
  asset,
  onChange,
  onBack,
  kindLabel,
  seriesId,
}: EpisodeAssetDrawerProps) {
  const [description, setDescription] = useState(asset.description ?? '');
  const [content, setContent] = useState(asset.content ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<null | { label: string; detail: string }>(null);

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
  const currentPromptEntry: ImagePromptHistoryEntry | undefined = promptDoc
    ? promptDoc.history.find((h) => h.version === promptDoc.current_version)
    : undefined;

  const candidates: Array<string | null | undefined> = [
    asset.drive_path,
    asset.staging_path,
    asset.drive_web_view_url,
    currentPromptEntry?.staging_path,
    currentPromptEntry?.drive_web_view_url,
  ];
  const previewSrc =
    candidates.find(
      (c): c is string => typeof c === 'string' && (c.startsWith('/') || c.startsWith('http')),
    ) ?? null;
  const isImage = !!previewSrc;

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
          <div className="min-w-0 flex-1 flex items-center gap-2">
            {onBack && (
              <button
                onClick={onBack}
                className="p-1.5 rounded-md text-text-secondary hover:bg-[var(--panel-hover-bg)] transition-colors shrink-0"
                aria-label="Back to gallery"
                title="Back to gallery"
              >
                <ArrowLeft size={14} strokeWidth={1.7} />
              </button>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-xs uppercase tracking-wider text-text-muted">{kindLabel ?? 'Episode asset'}</div>
              <div className="text-sm font-medium text-text-primary font-mono truncate">{asset.filename}</div>
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
          {/* Mark progress used to avoid linter lint — placeholder for future when an
              EREF/Thumbnail enrich endpoint flows through here. */}
          {!progress && false && setProgress({ label: '', detail: '' })}

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

          {/* When asset has an image but no prompt history (legacy), offer Upload-only. */}
          {isImage && !promptDoc && editable && (
            <LegacyUploadCard assetId={asset.id} onChanged={onChange} />
          )}

          {/* Empty-state CTA for non-Bible assets without image — minimal, just text */}
          {!isImage && !promptDoc && editable && (
            <div
              className="rounded-lg border border-dashed border-glass p-4 flex flex-col items-center gap-2.5"
              style={{ background: 'color-mix(in oklab, var(--accent-primary) 6%, transparent)' }}
            >
              <Wand2 size={20} className="text-[var(--accent-primary)]" />
              <div className="text-sm text-text-primary text-center font-medium">No reference yet</div>
              <div className="text-xs text-text-muted text-center max-w-xs">
                Upload your own file or wait for the upstream agent to populate this asset.
              </div>
              <LegacyUploadCard assetId={asset.id} onChanged={onChange} />
            </div>
          )}

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
              placeholder="Full description in markdown…"
            />
          </AssetCollapsibleSection>

          <AssetImagePromptSection
            assetId={asset.id}
            promptDoc={promptDoc}
            editable={editable}
            open={promptOpen}
            onToggle={() => setPromptOpen((v) => !v)}
            onChanged={onChange}
            assetType={asset.file_type}
            seriesId={seriesId ?? asset.series_id ?? null}
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
              <div>File type: <span className="text-text-primary font-mono">{asset.file_type}</span></div>
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
        </div>
      </aside>
    </div>,
    document.body,
  );
}
