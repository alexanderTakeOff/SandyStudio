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
import { withHardBreaks } from '@/lib/markdown-breaks';
import { resolvePreviewSrc } from '@/lib/asset-preview-resolver';
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
  AttemptsStrip,
} from './EREFv2Sections';
import { InboxNotePromptModal } from '@/components/inbox/InboxNotePromptModal';
import { fetcher } from '@/lib/swr';
import { isShotReferenceV2, primaryAttemptVersion, type GenerationAttempt } from '@/lib/api/shot-reference';
import { VGENShotSection } from '@/components/vgen/VGENShotSection';
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
  const [anchorRegenBusy, setAnchorRegenBusy] = useState(false);
  // Timeline-as-home (2026-07-02): version being promoted via AttemptsStrip.
  const [promotingVersion, setPromotingVersion] = useState<number | null>(null);

  const [imageOpen, setImageOpen] = useState(true);
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [bodyOpen, setBodyOpen] = useState(false);
  const [contentMdOpen, setContentMdOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [planPromptOpen, setPlanPromptOpen] = useState(true);
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
  // ── Animatic v1 detection (stub pointer only — player lives on the timeline) ─
  const isAnimaticAsset = asset.file_type.startsWith('VID-animatic');
  const shotRef = isV2
    ? (asset.metadata as { shot_reference: import('@/lib/api/shot-reference').ShotReferenceContract }).shot_reference
    : null;
  const shotId = shotRef?.shot_id ?? null;

  // ── VID-shot (VGEN) detection ───────────────────────────────────────────
  const isVidShot = asset.file_type.startsWith('VID-shot');

  // ── Anchor (TD-49) detection — anchors are "the first two references" the
  // Director wants treated like any standard reference: same Approve / Request
  // revision / Regenerate actions. Their Regenerate re-runs the anchor flow
  // (scene_master + identity refs) via execute-from-plan, NOT the ref-less
  // /regenerate-image path. shotId + planAssetId come from the anchor metadata.
  const isAnchor = asset.file_type.startsWith('IMG-anchor');
  const anchorMeta = asset.metadata as
    | { shot_reference?: { shot_id?: string }; provenance?: { plan_asset_id?: string } }
    | null;
  const anchorShotId = isAnchor
    ? anchorMeta?.shot_reference?.shot_id ??
      (() => {
        const m = asset.file_type.match(/(s\d+)_(e\d+)_(a\d+)_(sc\d+)_(sh\d+)/i);
        return m ? `SS-${m[1]}-${m[2]}-${m[3]}-${m[4]}-${m[5]}`.toUpperCase() : null;
      })()
    : null;
  const anchorPlanAssetId = isAnchor ? anchorMeta?.provenance?.plan_asset_id ?? null : null;

  // Anchors carry a useful free-text rationale in metadata but never populate
  // assets.content, so the "Description (markdown body)" section reads empty.
  // Surface anchor_rationale as a read-only fallback body for anchors that have
  // no real content of their own. Display-only — no data write.
  const anchorRationale =
    isAnchor && typeof (asset.metadata as { anchor_rationale?: unknown })?.anchor_rationale === 'string'
      ? ((asset.metadata as { anchor_rationale: string }).anchor_rationale).trim()
      : '';
  const showAnchorRationaleFallback =
    isAnchor && anchorRationale.length > 0 && content.trim().length === 0;

  // Fetch sibling assets for the same shot (candidates strip + replace-confirm).
  // Always called (hook rule) — but only used when v2.
  const { data: assetsData } = useSWR<{ data: EpisodeAsset[] }>(
    open && asset.episode_id
      ? `/api/assets?episode_id=${asset.episode_id}&file_type_prefix=IMG-episode_ref,VID-shot&limit=200`
      : null,
    fetcher,
  );

  // Anchor fallback — anchors generated before the image_prompt fix carry no
  // prompt on the asset; their prompt lives in the linked Plan (SPC-ref_plan).
  // Fetch the Plan body so the drawer can show "what was sent to the provider"
  // for those legacy anchors without forcing a re-spend. New anchors have
  // image_prompt and skip this (key is null). MUST stay above the early return
  // below — hooks must run on every render.
  const { data: anchorPlanData } = useSWR<{ data: { content: string | null } }>(
    open && isAnchor && !asset.metadata?.image_prompt && anchorPlanAssetId
      ? `/api/assets/${anchorPlanAssetId}/content`
      : null,
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

  // TD-43 (2026-05-24): VID-shot version-picker — same Candidates-strip UI
  // the EREF v2 panel uses, applied to VID-shot rows so Director can
  // switch between e.g. legacy v01 + plan-driven v02 in the drawer.
  // shot_id lives directly on VID-shot metadata (not under shot_reference).
  const vidShotId =
    isVidShot &&
    typeof (asset.metadata as { shot_id?: unknown })?.shot_id === 'string'
      ? ((asset.metadata as { shot_id: string }).shot_id)
      : null;

  const vidShotSiblings = useMemo(() => {
    if (!isVidShot || !vidShotId || !assetsData?.data) return [] as EpisodeAsset[];
    return assetsData.data
      .filter((a) => a.file_type.startsWith('VID-shot'))
      .filter((a) => {
        const sid = (a.metadata as { shot_id?: unknown } | null)?.shot_id;
        return typeof sid === 'string' && sid === vidShotId;
      })
      .sort((a, b) => {
        // Current first, then by version desc (newest variant on the left).
        if (a.id === asset.id) return -1;
        if (b.id === asset.id) return 1;
        const va = a.version ?? 0;
        const vb = b.version ?? 0;
        return vb - va;
      });
  }, [isVidShot, vidShotId, assetsData?.data, asset.id]);

  // Existing APPROVED for this shot (replace-confirm gate). May be the current asset.
  const existingApprovedForShot = useMemo(() => {
    if (!isV2 || !shotId) return null;
    return siblingCandidates.find(
      (a) => (a.status === 'APPROVED' || a.status === 'LOCKED') && a.id !== asset.id,
    ) ?? null;
  }, [isV2, shotId, siblingCandidates, asset.id]);

  if (!open || typeof document === 'undefined') return null;

  const editable = EDITABLE_STATUSES.has(asset.status);
  // #3 status-aware footer (2026-07-02): once an asset is APPROVED/LOCKED the
  // Approve button must not fire again — the approve route returns a ConflictError
  // "already APPROVED (idempotent no-op)", which surfaced as a scary red error
  // after a variant pick (select_attempt keeps status APPROVED). Show a settled
  // "✓ Approved" state instead. Reject/Request-revision stay live: on an APPROVED
  // asset they route to REVISION (q1a) = "send it back to redo".
  const isApprovedOrLocked = asset.status === 'APPROVED' || asset.status === 'LOCKED';
  const promptDoc = asset.metadata?.image_prompt;
  const currentPromptEntry: ImagePromptHistoryEntry | undefined = promptDoc
    ? promptDoc.history.find((h) => h.version === promptDoc.current_version)
    : undefined;

  const previewSrc = resolvePreviewSrc(asset, currentPromptEntry);
  const isImage = !!previewSrc;

  // Single source of truth for "which attempt is the primary reference" — the
  // one whose pixels the main preview above actually shows. It MUST match the
  // preview's own resolution (resolvePreviewSrc → the canonical bytes the loop
  // wrote for `image_prompt.current_version`) or the strip's "current" badge
  // lies. Precedence: a manual variant pick (selected_version) wins; else the
  // attempt the keep-best loop shipped (image_prompt.current_version — which is
  // the BEST attempt, NOT necessarily the last); else the last attempt.
  // Previously the strip derived this as `selected_version ?? last`, so under
  // keep-best (best ≠ last) the badge highlighted a different tile than the one
  // on screen — the root of the "selection is muddled / click didn't switch"
  // confusion (Director E30, 2026-07-17).
  const erefHistory = shotRef?.generation_history ?? [];
  const erefPrimaryVersion: number | null = shotRef
    ? primaryAttemptVersion(shotRef, promptDoc?.current_version)
    : null;

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

  // Regenerate an anchor by re-running its shot's anchor flow (execute-from-plan)
  // — keeps scene_master layout + identity refs in the payload so Sandy holds
  // his canon, unlike the ref-less /regenerate-image path used for v2 refs.
  async function regenAnchor() {
    if (!asset.episode_id || !anchorShotId) {
      setError('Cannot regenerate anchor — missing episode or shot id in metadata.');
      return;
    }
    // Without a planAssetId the trigger route can't reroute to execute-from-plan
    // and would fire the whole-episode EREF pilot pass instead of this one shot.
    // Refuse rather than silently re-run (and re-bill) the entire episode.
    if (!anchorPlanAssetId) {
      setError(
        'This anchor predates plan-linking (no plan_asset_id) — per-shot regen unavailable. ' +
          'Re-run the Reference Artist for the whole episode from the stage workstation instead.',
      );
      return;
    }
    if (
      !window.confirm(
        `Regenerate the anchor for ${anchorShotId}?\n` +
          `Re-runs the Reference Artist anchor flow (scene_master layout + Bible ` +
          `character canon). Creates a new candidate in REVIEW — does not auto-approve.`,
      )
    ) {
      return;
    }
    setAnchorRegenBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = { shotId: anchorShotId };
      if (anchorPlanAssetId) payload.planAssetId = anchorPlanAssetId;
      const res = await fetch(`/api/episodes/${asset.episode_id}/trigger`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          agentCode: 'EXEC-EREF',
          reason: `Director regenerate anchor ${anchorShotId} from drawer`,
          payload,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? 'Anchor regenerate failed');
      }
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAnchorRegenBusy(false);
    }
  }

  async function regenWithProvider() {
    if (!promptDoc) return;
    // Pick the latest history entry with a real generation prompt. The EREF
    // runner pushes an upscale stub `"(upscale only — no prompt)"` whenever
    // Director approves a v2 EREF and the 4K upscale fires; that stub became
    // `current_version` and would be sent to gpt-image-1 as-is, returning
    // garbage or an error. Walk history in reverse to find the last entry
    // whose source !== 'upscale' and whose prompt doesn't start with the
    // stub marker. (Sprint φ smoke UX bug fix 2026-05-16.)
    const realEntry = [...promptDoc.history].reverse().find((h) => {
      const p = (h.prompt ?? '').trim();
      if (p.length < 8) return false;
      if (p.startsWith('(upscale only')) return false;
      if ((h.source as string | undefined) === 'upscale') return false;
      return true;
    });
    const cur = realEntry ?? promptDoc.history.find((h) => h.version === promptDoc.current_version);
    if (!cur || !cur.prompt || cur.prompt.startsWith('(upscale only')) {
      setError(
        'No real generation prompt found in history (only upscale stub). Open the "Image prompt" section and edit a prompt before regenerating.',
      );
      return;
    }
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

  // Timeline-as-home — promote a prior auto-regen attempt to the asset's primary
  // image ("pick a different one of the 3 variants"). No paid call; status stays.
  async function promoteAttempt(att: GenerationAttempt) {
    setPromotingVersion(att.version);
    setError(null);
    try {
      const res = await fetch(`/api/assets/${asset.id}/regenerate-image`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ select_attempt: att.version, directorConfirm: true }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? 'Select variant failed');
      }
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPromotingVersion(null);
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

          {/* The per-shot candidates sit directly under the picture (Director
              2026-07-17). They are a property OF this image — comparing them used to
              mean scrolling past Test Plan / Verdict / Scores / Issues to reach them,
              so the variant you are judging was never on screen next to the one you
              have. This IS the "Candidates for this shot" strip: with keep-best one
              asset row carries every attempt in generation_history, so the sibling-row
              CandidatesStrip below was retired for EREF. Clicking a candidate promotes
              it (select_attempt) → the main preview above refreshes to it. Self-hides
              at ≤1 attempt, so a single-shot render shows nothing extra. */}
          {isV2 && shotRef && (
            <AttemptsStrip
              attempts={erefHistory}
              label={`Candidates for this shot (${erefHistory.length})`}
              // Single-sourced with the main preview (erefPrimaryVersion): the "current"
              // badge lands on the tile whose pixels are actually on screen — including
              // the keep-best case where the shipped attempt is NOT the last one.
              finalVersion={erefPrimaryVersion}
              onPromote={promoteAttempt}
              busyVersion={promotingVersion}
            />
          )}

          {/* When asset has an image but no prompt history (legacy), offer Upload-only. */}
          {isImage && !promptDoc && editable && !isVidShot && (
            <LegacyUploadCard assetId={asset.id} onChanged={onChange} />
          )}

          {/* Empty-state CTA for non-Bible assets without image — minimal, just text */}
          {!isImage && !promptDoc && editable && !isVidShot && (
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

          {/* Animatic-stage demotion (2026-07-09): the Inbox no longer hosts the
              animatic player or its approval. The animatic (EDL) lives on the
              Episode Timeline — pacing review, the duration editor, and the
              "Start Video" latch are all there. */}
          {isAnimaticAsset && (
            <div
              className="rounded-lg p-3 border border-dashed border-glass text-xs text-text-muted"
              style={{ background: 'color-mix(in oklab, var(--accent-primary) 6%, transparent)' }}
            >
              Аниматик (EDL) живёт на таймлайне эпизода — там пейсинг-обзор,
              редактор длительности кадров и кнопка «Старт видео».
            </div>
          )}

          {/* ── VGEN: VID-shot Universal Core panel (extracted to keep drawer < 800 lines) ── */}
          {isVidShot && (
            <>
              <VGENShotSection
                assetId={asset.id}
                episodeId={asset.episode_id}
                filename={asset.filename}
                metadata={asset.metadata}
                drivePath={asset.drive_path}
                driveWebViewUrl={asset.drive_web_view_url}
                stagingPath={asset.staging_path}
                editable={editable}
                onChanged={onChange}
              />
              {/* TD-43: version-picker — only renders when ≥2 candidates */}
              <CandidatesStrip
                currentAssetId={asset.id}
                candidates={vidShotSiblings.map((a) => ({
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

          {/* ── EREF v2 sections — Test Plan / Verdict / Scores / Issues ──
              The per-shot candidates strip is NOT here: it renders under the
              "Reference image" above (the "Candidates for this shot" AttemptsStrip),
              so the variant being judged stays next to the one on screen. The old
              sibling-row CandidatesStrip that used to sit at the bottom of this block
              was retired for EREF (2026-07-18): with keep-best a single asset row
              carries all attempts in generation_history, so it duplicated the
              under-image strip AND read a different "current", muddling the selection.
              VID-shot keeps its own CandidatesStrip (distinct rows per render). */}
          {isV2 && shotRef && (
            <>
              <TestPlanCard shotRef={shotRef} />
              <VerdictPill review={shotRef.review} />
              <ScoreBars review={shotRef.review} />
              {shotRef.review && <IssuesList issues={shotRef.review.issues} />}
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
                  {withHardBreaks(asset.content)}
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
            meta={
              showAnchorRationaleFallback
                ? 'anchor rationale'
                : `${content.split('\n').length} lines · ${content.length} chars`
            }
          >
            {showAnchorRationaleFallback ? (
              <div className="space-y-2">
                <div className="text-[10px] uppercase tracking-wider text-text-muted">
                  Anchor rationale (from plan) — no description body yet
                </div>
                <p
                  className="rounded-lg p-3 border border-glass text-xs text-text-secondary leading-relaxed whitespace-pre-wrap break-words"
                  style={{ background: 'var(--bg-elevated)' }}
                >
                  {anchorRationale}
                </p>
                {editable && (
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    rows={6}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm text-text-primary font-sans leading-relaxed focus:outline-none focus:border-[var(--accent-primary)]"
                    placeholder="Add a description body in markdown… (saving replaces the rationale fallback above)"
                  />
                )}
              </div>
            ) : (
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                readOnly={!editable}
                rows={14}
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-glass text-sm text-text-primary font-sans leading-relaxed focus:outline-none focus:border-[var(--accent-primary)]"
                placeholder="Full description in markdown…"
              />
            )}
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

          {/* Legacy-anchor fallback: anchors made before the image_prompt fix
              show the prompt straight from their Plan, so the Director sees what
              was sent to the provider without a re-spend. */}
          {isAnchor && !promptDoc && anchorPlanData?.data?.content && (
            <AssetCollapsibleSection
              open={planPromptOpen}
              onToggle={() => setPlanPromptOpen((v) => !v)}
              label="Prompt sent to provider (from Plan)"
              meta="read-only"
            >
              <pre className="whitespace-pre-wrap break-words text-[12px] text-text-secondary font-mono leading-relaxed max-h-96 overflow-auto">
                {anchorPlanData.data.content}
              </pre>
            </AssetCollapsibleSection>
          )}

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
                style={
                  decisionBusy === 'REQUEST_REVISION'
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
                {decisionBusy === 'REQUEST_REVISION' ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    Regenerating…
                  </>
                ) : (
                  <>
                    <Sparkles size={12} />
                    Regenerate
                  </>
                )}
              </Button>
            </div>
          )}

          {isAnchor && (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void regenAnchor()}
                disabled={anchorRegenBusy || decisionBusy !== null}
                title="Re-run this shot's anchor flow (scene_master + character canon). New candidate in REVIEW."
              >
                {anchorRegenBusy ? (
                  <>
                    <Loader2 size={12} className="animate-spin" /> Regenerating…
                  </>
                ) : (
                  <>
                    <Sparkles size={12} /> Regenerate
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setNotePrompt('REQUEST_REVISION')}
                disabled={decisionBusy !== null || anchorRegenBusy}
              >
                <RotateCcw size={12} /> Request revision
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={() => void postDecision('APPROVE')}
                disabled={decisionBusy !== null || anchorRegenBusy || isApprovedOrLocked}
                title={
                  isApprovedOrLocked
                    ? 'Already approved — Request revision to redo this anchor'
                    : undefined
                }
              >
                {decisionBusy === 'APPROVE' ? (
                  <>
                    <Loader2 size={12} className="animate-spin" /> Approving…
                  </>
                ) : decisionDone === 'APPROVE' || isApprovedOrLocked ? (
                  <>
                    <CheckCircle2 size={12} /> Approved
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={12} /> Approve
                  </>
                )}
              </Button>
            </>
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
                title={
                  isApprovedOrLocked
                    ? 'This reference is approved — Reject sends it back for revision (REVISION)'
                    : undefined
                }
                style={
                  decisionBusy === 'REJECT'
                    ? { opacity: 0.55, cursor: 'not-allowed' }
                    : decisionDone === 'REJECT'
                      ? { opacity: 0.7 }
                      : undefined
                }
              >
                {decisionBusy === 'REJECT' ? (
                  <>
                    <Loader2 size={12} className="animate-spin" /> Rejecting…
                  </>
                ) : decisionDone === 'REJECT' ? (
                  <>
                    <CheckCircle2 size={12} /> Rejected
                  </>
                ) : (
                  <>
                    <XCircle size={12} /> Reject
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={onApproveClick}
                disabled={decisionBusy !== null || isApprovedOrLocked}
                title={
                  isApprovedOrLocked
                    ? 'Already approved for this shot — pick a variant above or Request revision to redo'
                    : undefined
                }
                style={
                  decisionBusy === 'APPROVE'
                    ? { opacity: 0.55, cursor: 'not-allowed' }
                    : decisionDone === 'APPROVE' || isApprovedOrLocked
                      ? {
                          opacity: 0.85,
                          background:
                            'color-mix(in oklab, var(--accent-success, #22c55e) 80%, transparent)',
                          borderColor:
                            'color-mix(in oklab, var(--accent-success, #22c55e) 90%, transparent)',
                          color: 'white',
                        }
                      : undefined
                }
              >
                {decisionBusy === 'APPROVE' ? (
                  <>
                    <Loader2 size={12} className="animate-spin" /> Approving…
                  </>
                ) : decisionDone === 'APPROVE' || isApprovedOrLocked ? (
                  <>
                    <CheckCircle2 size={12} /> Approved
                  </>
                ) : (
                  'Approve'
                )}
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
