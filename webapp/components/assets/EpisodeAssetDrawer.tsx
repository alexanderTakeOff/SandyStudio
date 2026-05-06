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
import { isAnimaticV1 } from '@/lib/api/animatic-shotlist';
import { AnimaticPlayer } from '@/components/animatic/AnimaticPlayer';
import {
  VGENShotPanel,
  type AspectRatio,
  type QualityTier,
  type VGENShotPanelSettings,
  type VGENShotPanelStoryboardShot,
} from '@/components/vgen/VGENShotPanel';
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
  /**
   * For EREF v2 candidates strip — caller controls which asset id is open so
   * the strip can switch the drawer to a sibling. When omitted, the strip
   * still renders but clicking a sibling is a no-op.
   */
  onPickAsset?: (assetId: string) => void;
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
  onPickAsset,
}: EpisodeAssetDrawerProps) {
  const [description, setDescription] = useState(asset.description ?? '');
  const [content, setContent] = useState(asset.content ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<null | { label: string; detail: string }>(null);

  // EREF v2 footer-action state.
  const [decisionBusy, setDecisionBusy] = useState<null | DecisionVerb>(null);
  const [decisionDone, setDecisionDone] = useState<null | DecisionVerb>(null);
  const [skipUpscale, setSkipUpscale] = useState(false);
  const [providerOverride, setProviderOverride] =
    useState<'openai-edits-multi' | 'flux-pro-1.1-ultra' | ''>('');
  const [notePrompt, setNotePrompt] = useState<null | 'REJECT' | 'REQUEST_REVISION'>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);

  const [imageOpen, setImageOpen] = useState(true);
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [bodyOpen, setBodyOpen] = useState(false);
  const [contentMdOpen, setContentMdOpen] = useState(false);
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

  // ── EREF v2 detection ──────────────────────────────────────────────────
  const isV2 = isShotReferenceV2(asset.metadata);
  // ── Animatic v1 detection ──────────────────────────────────────────────
  const isAnimaticAsset = asset.file_type.startsWith('VID-animatic');
  const animaticV1 = isAnimaticV1(asset.metadata)
    ? (asset.metadata as { animatic_v1: import('@/lib/api/animatic-shotlist').AnimaticContract }).animatic_v1
    : null;
  const shotRef = isV2
    ? (asset.metadata as { shot_reference: import('@/lib/api/shot-reference').ShotReferenceContract }).shot_reference
    : null;
  const shotId = shotRef?.shot_id ?? null;

  // ── VID-shot (VGEN) detection ───────────────────────────────────────────
  // VID-shot assets are produced by EXEC-VGEN. Their metadata carries the
  // Universal Core settings used to generate the mp4 plus a denormalised
  // copy of the storyboard shot row (so the drawer doesn't need to refetch).
  const isVidShot = asset.file_type.startsWith('VID-shot');
  const vidShotMeta = useMemo(() => {
    if (!isVidShot) return null;
    const m = (asset.metadata ?? {}) as {
      shot_id?: string;
      storyboard_shot?: VGENShotPanelStoryboardShot;
      aspect_ratio?: string;
      quality_tier?: string;
      duration_seconds?: number;
      reference_eref_asset_id?: string;
      reference_asset_id?: string;
      prompt?: string;
      vgen_settings?: Partial<VGENShotPanelSettings> & { reference_eref_asset_id?: string };
    };
    const settings = m.vgen_settings ?? {};
    const aspect: AspectRatio = (settings.aspect_ratio ?? m.aspect_ratio ?? '16:9') as AspectRatio;
    const quality: QualityTier = (settings.quality_tier ?? m.quality_tier ?? 'fast') as QualityTier;
    const duration = settings.duration_seconds ?? m.duration_seconds ?? 4;
    const refId =
      settings.reference_asset_id ??
      settings.reference_eref_asset_id ??
      m.reference_asset_id ??
      m.reference_eref_asset_id ??
      '';
    const promptText = settings.prompt ?? m.prompt ?? '';
    const sId = m.storyboard_shot?.shot_id ?? m.shot_id ?? asset.filename;
    const stub: VGENShotPanelStoryboardShot = m.storyboard_shot ?? { shot_id: sId };
    const cs: VGENShotPanelSettings = {
      prompt: promptText,
      aspect_ratio: aspect,
      quality_tier: quality,
      duration_seconds: duration,
      reference_asset_id: refId,
    };
    return { storyboardShot: stub, currentSettings: cs };
  }, [isVidShot, asset.metadata, asset.filename]);
  const vidShotUrl =
    isVidShot
      ? (asset.drive_web_view_url ?? asset.drive_path ?? asset.staging_path ?? null)
      : null;

  // Fetch sibling assets for the same shot (candidates strip + replace-confirm).
  // Always called (hook rule) — but only used when v2.
  const { data: assetsData } = useSWR<{ data: EpisodeAsset[] }>(
    open && asset.episode_id ? `/api/assets?episode_id=${asset.episode_id}&limit=200` : null,
    fetcher,
  );

  const siblingCandidates = useMemo(() => {
    if (!isV2 || !shotId || !assetsData?.data) return [] as EpisodeAsset[];
    return assetsData.data
      .filter((a) => a.file_type.startsWith('IMG-episode_ref'))
      .filter((a) => {
        const sr = isShotReferenceV2(a.metadata)
          ? (a.metadata as { shot_reference: { shot_id: string } }).shot_reference
          : null;
        return sr?.shot_id === shotId;
      })
      .sort((a, b) => {
        // current asset first, then APPROVED, REVIEW, DRAFT, REJECTED
        if (a.id === asset.id) return -1;
        if (b.id === asset.id) return 1;
        const order: Record<string, number> = { APPROVED: 0, LOCKED: 0, REVIEW: 1, DRAFT: 2, REVISION: 3, REJECTED: 4 };
        return (order[a.status] ?? 9) - (order[b.status] ?? 9);
      });
  }, [isV2, shotId, assetsData?.data, asset.id]);

  // Existing APPROVED for this shot (replace-confirm gate). May be the current asset.
  const existingApprovedForShot = useMemo(() => {
    if (!isV2 || !shotId) return null;
    return siblingCandidates.find(
      (a) => (a.status === 'APPROVED' || a.status === 'LOCKED') && a.id !== asset.id,
    ) ?? null;
  }, [isV2, shotId, siblingCandidates, asset.id]);

  if (!open || typeof document === 'undefined') return null;

  const editable = EDITABLE_STATUSES.has(asset.status);
  const promptDoc = asset.metadata?.image_prompt;
  const currentPromptEntry: ImagePromptHistoryEntry | undefined = promptDoc
    ? promptDoc.history.find((h) => h.version === promptDoc.current_version)
    : undefined;

  const previewCandidates: Array<string | null | undefined> = [
    asset.drive_path,
    asset.staging_path,
    asset.drive_web_view_url,
    currentPromptEntry?.staging_path,
    currentPromptEntry?.drive_web_view_url,
  ];
  const previewSrc =
    previewCandidates.find(
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

  // ── EREF v2 footer actions ────────────────────────────────────────────────

  async function postDecision(decision: DecisionVerb, note?: string) {
    setDecisionBusy(decision);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        decision,
        directorConfirm: true,
      };
      if (decision === 'APPROVE') {
        body.preview_acknowledged = true;
        body.eref_options = { skip_upscale: skipUpscale };
      }
      if (note) body.note = note;
      const res = await fetch(`/api/assets/${asset.id}/approve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `${decision} failed`);
      }
      setDecisionDone(decision);
      setTimeout(() => setDecisionDone(null), 600);
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDecisionBusy(null);
    }
  }

  function onApproveClick() {
    if (existingApprovedForShot) {
      setConfirmReplace(true);
      return;
    }
    void postDecision('APPROVE');
  }

  async function regenWithProvider() {
    if (!promptDoc) return;
    const cur = promptDoc.history.find((h) => h.version === promptDoc.current_version);
    if (!cur) return;
    if (
      !window.confirm(
        `Regenerate with ${providerOverride || 'series default'}?\nThis creates a new candidate in REVIEW status — it will not auto-approve.`,
      )
    ) {
      return;
    }
    setDecisionBusy('REQUEST_REVISION'); // borrow as a "busy" indicator slot
    setError(null);
    try {
      const body: Record<string, unknown> = {
        prompt: cur.prompt,
        quality: 'medium',
        directorConfirm: true,
      };
      if (providerOverride) body.provider_id = providerOverride;
      const res = await fetch(`/api/assets/${asset.id}/regenerate-image`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? 'Regenerate failed');
      }
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDecisionBusy(null);
    }
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
          {isImage && !promptDoc && editable && !isVidShot && (
            <LegacyUploadCard assetId={asset.id} onChanged={onChange} />
          )}

          {/* Empty-state CTA for non-Bible assets without image — minimal, just text */}
          {!isImage && !promptDoc && editable && !isVidShot && !isAnimaticAsset && (
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

          {/* ── Animatic v1 player — VID-animatic with animatic_v1 metadata ── */}
          {isAnimaticAsset && animaticV1 && (
            <AnimaticPlayer assetId={asset.id} contract={animaticV1} onChanged={onChange} />
          )}
          {isAnimaticAsset && !animaticV1 && (
            <div
              className="rounded-lg p-3 border border-dashed border-glass text-xs text-text-muted"
              style={{ background: 'color-mix(in oklab, var(--accent-warning) 6%, transparent)' }}
            >
              Legacy animatic — interactive player not available. Re-trigger the Animatic stage to upgrade to animatic@v1.
            </div>
          )}

          {/* ── EREF v2 sections — Test Plan / Verdict / Scores / Issues / Candidates ── */}
          {isV2 && shotRef && (
            <>
              <TestPlanCard shotRef={shotRef} />
              <VerdictPill review={shotRef.review} />
              <ScoreBars review={shotRef.review} />
              {shotRef.review && <IssuesList issues={shotRef.review.issues} />}
              <CandidatesStrip
                currentAssetId={asset.id}
                candidates={siblingCandidates.map((a) => ({
                  id: a.id,
                  filename: a.filename,
                  status: a.status,
                  staging_path: a.staging_path,
                  drive_path: a.drive_path,
                  drive_web_view_url: a.drive_web_view_url,
                  metadata: a.metadata as never,
                }))}
                onPick={(id) => onPickAsset?.(id)}
              />
            </>
          )}

          {/* Markdown content rendering — applies to all assets when content is non-empty */}
          {asset.content && asset.content.trim().length > 0 && (
            <AssetCollapsibleSection
              open={contentMdOpen}
              onToggle={() => setContentMdOpen((v) => !v)}
              label="Notes (markdown)"
              meta={`${asset.content.split('\n').length} lines`}
            >
              <article
                className="prose prose-sm max-w-none rounded-lg p-3 border border-glass"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
              >
                <ReactMarkdown
                  components={{
                    h1: ({ children }) => (
                      <h1 className="text-base font-semibold mt-1 mb-2 text-text-primary">{children}</h1>
                    ),
                    h2: ({ children }) => (
                      <h2 className="text-sm font-semibold mt-2 mb-1.5 text-text-primary">{children}</h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className="text-xs font-semibold mt-1.5 mb-1 text-text-primary">{children}</h3>
                    ),
                    p: ({ children }) => (
                      <p className="text-xs text-text-secondary leading-relaxed my-1.5">{children}</p>
                    ),
                    ul: ({ children }) => (
                      <ul className="list-disc pl-5 text-xs text-text-secondary my-1.5">{children}</ul>
                    ),
                    code: ({ children }) => (
                      <code className="px-1 py-0.5 rounded text-[10px] font-mono bg-[var(--panel-glass-strong-bg)]">
                        {children}
                      </code>
                    ),
                  }}
                >
                  {asset.content}
                </ReactMarkdown>
              </article>
            </AssetCollapsibleSection>
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

        <div className="border-t border-glass px-4 py-2.5 flex items-center justify-end gap-2 flex-wrap">
          {/* EREF v2 footer action bar — APPROVE / REJECT / REQUEST_REVISION /
              REGENERATE + provider dropdown + skip-upscale toggle. */}
          {isV2 && (
            <div className="flex items-center gap-2 mr-auto flex-wrap">
              <label
                className="inline-flex items-center gap-1.5 text-[11px] text-text-secondary cursor-pointer select-none"
                title="When ON, Approve will not trigger 4K upscale."
              >
                <input
                  type="checkbox"
                  checked={skipUpscale}
                  onChange={(e) => setSkipUpscale(e.target.checked)}
                  className="accent-[var(--accent-primary)]"
                />
                Skip 4K upscale
              </label>

              <select
                value={providerOverride}
                onChange={(e) =>
                  setProviderOverride(
                    e.target.value as 'openai-edits-multi' | 'flux-pro-1.1-ultra' | '',
                  )
                }
                aria-label="Provider override for regenerate"
                className="px-2 py-1 rounded-md text-[11px] bg-[var(--bg-elevated)] border border-glass text-text-primary focus:outline-none focus:border-[var(--accent-primary)]"
              >
                <option value="">Series default</option>
                {PROVIDER_OPTIONS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>

              <Button
                size="sm"
                variant="ghost"
                onClick={regenWithProvider}
                disabled={decisionBusy !== null || busy || !promptDoc}
                title="Create a new candidate (REVIEW status) — does not auto-approve"
              >
                {decisionBusy === 'REQUEST_REVISION' ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Sparkles size={12} />
                )}
                Regenerate
              </Button>
            </div>
          )}

          {isV2 && (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setNotePrompt('REQUEST_REVISION')}
                disabled={decisionBusy !== null}
              >
                <RotateCcw size={12} /> Request revision
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => setNotePrompt('REJECT')}
                disabled={decisionBusy !== null}
              >
                {decisionBusy === 'REJECT' ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : decisionDone === 'REJECT' ? (
                  <CheckCircle2 size={12} />
                ) : (
                  <XCircle size={12} />
                )}
                Reject
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={onApproveClick}
                disabled={decisionBusy !== null}
              >
                {decisionBusy === 'APPROVE' ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : decisionDone === 'APPROVE' ? (
                  <CheckCircle2 size={12} />
                ) : null}
                Approve
              </Button>
            </>
          )}

          {editable && (
            <Button variant="ghost" onClick={saveTextEdits} disabled={busy}>
              <Save size={13} /> Save
            </Button>
          )}
        </div>
      </aside>

      {/* REJECT / REQUEST_REVISION note prompt modal */}
      <InboxNotePromptModal
        open={notePrompt !== null}
        decision={notePrompt ?? 'REJECT'}
        subjectLabel={asset.filename}
        onClose={() => setNotePrompt(null)}
        onSubmit={async (note) => {
          if (notePrompt) await postDecision(notePrompt, note);
        }}
      />

      {/* Replace approved image confirm modal */}
      {confirmReplace && existingApprovedForShot && (
        <ConfirmReplaceModal
          existingFilename={existingApprovedForShot.filename}
          newFilename={asset.filename}
          onCancel={() => setConfirmReplace(false)}
          onConfirm={async () => {
            setConfirmReplace(false);
            await postDecision('APPROVE');
          }}
        />
      )}
    </div>,
    document.body,
  );
}

interface ConfirmReplaceModalProps {
  existingFilename: string;
  newFilename: string;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}

function ConfirmReplaceModal({
  existingFilename,
  newFilename,
  onCancel,
  onConfirm,
}: ConfirmReplaceModalProps) {
  const [pending, setPending] = useState(false);
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div
        className="relative w-full max-w-md rounded-2xl border border-glass bg-panel-glass-strong backdrop-blur-xl shadow-glass p-5 space-y-4"
        style={{ boxShadow: 'var(--panel-shadow)' }}
      >
        <h3 className="text-sm font-semibold text-text-primary">
          Replace approved image for this shot?
        </h3>
        <p className="text-xs text-text-secondary leading-relaxed">
          <span className="font-mono text-text-primary">{existingFilename}</span> is
          currently approved for this shot. Approving{' '}
          <span className="font-mono text-text-primary">{newFilename}</span> will
          demote the previous candidate to REJECTED in a single transaction.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={async () => {
              setPending(true);
              await onConfirm();
              setPending(false);
            }}
            disabled={pending}
          >
            {pending ? 'Replacing…' : 'Replace approved'}
          </Button>
        </div>
      </div>
    </div>
  );
}
