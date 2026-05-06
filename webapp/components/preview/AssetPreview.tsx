// ──────────────────────────────────────────────────────────────────────────────
// components/preview/AssetPreview.tsx
// Renders an asset's body inside the preview drawer based on file type.
//
//   text (SCR / STB / BIB / PRO / REV / SPC / STA)  → markdown via react-markdown
//   image (IMG)                                     → <img src=drive_path>
//   video (VID)                                     → <video controls>
//   audio (AUD)                                     → <audio controls>
//   unknown                                         → "preview unavailable" + Download
//
// Binary URLs go through `drive_path`. For mock outputs that's
// "H:/My Drive/..." (won't load → fallback). For real outputs it's
// "/staging/<file>" served by Next.js public/.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import useSWR from 'swr';
import ReactMarkdown from 'react-markdown';
import { Download, FileWarning, ExternalLink, CloudOff } from 'lucide-react';
import { fetcher } from '@/lib/swr';
import { CanonExtensionsPanel } from '@/components/canon/CanonExtensionsPanel';
import type { CanonExtensionProposal } from '@/lib/api/canon-extensions';
import { isAnimaticV1, type AnimaticContract } from '@/lib/api/animatic-shotlist';
import { AnimaticPlayer } from '@/components/animatic/AnimaticPlayer';
import { VGENShotSection } from '@/components/vgen/VGENShotSection';
import { Button } from '@/components/ui/Button';
import { useState } from 'react';

const TEXT_PREFIXES = ['SCR', 'STB', 'BIB', 'PRO', 'REV', 'SPC', 'STA', 'SBL'];

export interface AssetPreviewProps {
  assetId: string;
}

interface AssetRow {
  id: string;
  filename: string;
  file_type: string;
  status: string;
  drive_path: string | null;
  staging_path: string | null;
  drive_file_id: string | null;
  drive_web_view_url: string | null;
  content: string | null;
  description: string | null;
  agent_id: string | null;
  created_at: string;
  version: number | null;
  episode_id: string | null;
  series_id: string | null;
  /** JSONB metadata (image_prompt, provenance, animatic_v1, shot_reference, …). */
  metadata: unknown;
}

interface CanonExtensionEvent {
  id: string;
  episode_id: string | null;
  metadata: { proposals?: CanonExtensionProposal[]; asset_id?: string } | null;
  resolved_at: string | null;
}

function categoryFor(file_type: string): 'text' | 'image' | 'video' | 'audio' | 'unknown' {
  const code = (file_type.split('-')[0] ?? '').toUpperCase();
  if (TEXT_PREFIXES.includes(code)) return 'text';
  if (code === 'IMG') return 'image';
  if (code === 'VID') return 'video';
  if (code === 'AUD') return 'audio';
  return 'unknown';
}

function isHttpishUrl(path: string | null): boolean {
  if (!path) return false;
  return path.startsWith('/') || path.startsWith('http://') || path.startsWith('https://');
}

export function AssetPreview({ assetId }: AssetPreviewProps) {
  const { data: meta, error: metaErr, mutate } = useSWR<{ data: AssetRow }>(
    `/api/assets/${assetId}`,
    fetcher,
  );

  if (metaErr) {
    return (
      <div className="text-xs px-3 py-2 rounded-lg" style={{ color: 'var(--accent-danger)' }}>
        Failed to load asset metadata.
      </div>
    );
  }
  if (!meta?.data) {
    return <p className="text-sm text-text-secondary">Loading…</p>;
  }

  const asset = meta.data;
  const cat = categoryFor(asset.file_type);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11px] text-text-muted">
        <span className="text-text-primary font-medium font-mono">{asset.filename}</span>
        <span>{asset.status}</span>
        <span>·</span>
        <span>{asset.file_type}</span>
        {asset.agent_id && (
          <>
            <span>·</span>
            <span>{asset.agent_id}</span>
          </>
        )}
        {asset.version && (
          <>
            <span>·</span>
            <span>v{String(asset.version).padStart(2, '0')}</span>
          </>
        )}
      </div>
      {asset.description && (
        <div
          className="text-xs px-3 py-2 rounded-lg border leading-relaxed font-mono"
          style={{
            background: 'var(--accent-success-bg, rgba(34, 197, 94, 0.08))',
            color: 'var(--accent-success, rgb(34, 197, 94))',
            borderColor: 'var(--accent-success, rgba(34, 197, 94, 0.3))',
          }}
          title="Production trace — contract, model, cost, tokens"
        >
          ⚙ {asset.description}
        </div>
      )}

      <CanonExtensionsForAsset asset={asset} />

      {/* Animatic v1: interactive browser-native player. Takes precedence over
          the VideoBody fallback so Director gets the player from the activity
          feed Preview drawer (not just from the EpisodeAssetDrawer in Inbox). */}
      {asset.file_type.startsWith('VID-animatic') && isAnimaticV1(asset.metadata) ? (
        <AnimaticPlayer
          assetId={asset.id}
          contract={
            (asset.metadata as { animatic_v1: AnimaticContract }).animatic_v1
          }
          onChanged={() => void mutate()}
        />
      ) : (
        <>
          {cat === 'text' && <TextBody assetId={asset.id} />}
          {cat === 'image' && <ImageBody asset={asset} />}
          {/* VID-shot has its own player inside VGENShotPanel — skip the
              generic VideoBody to avoid rendering the mp4 twice. */}
          {cat === 'video' && !asset.file_type.startsWith('VID-shot') && (
            <VideoBody asset={asset} />
          )}
          {cat === 'audio' && <AudioBody asset={asset} />}
        </>
      )}
      {cat === 'unknown' && (
        <FallbackBody
          message={`Preview unavailable for file type "${asset.file_type}". Download to inspect.`}
          drivePath={asset.drive_path}
        />
      )}
      {/* VGEN VID-shot: show Universal Core controls + per-shot approve/reject
          so Director can act on a shot from the activity feed Preview drawer
          and the EpisodeTimeline "Open shot →" link. Regenerate creates a NEW
          asset row (does NOT mutate the canonical), so any non-LOCKED state can
          re-generate to try a new variant. The cell-resolver picks the latest
          per shot_id (directive #6 fast iteration). */}
      {asset.file_type.startsWith('VID-shot') && (
        <>
          <VGENShotSection
            assetId={asset.id}
            filename={asset.filename}
            metadata={asset.metadata}
            drivePath={asset.drive_path}
            driveWebViewUrl={asset.drive_web_view_url}
            stagingPath={asset.staging_path}
            editable={asset.status !== 'LOCKED'}
            onChanged={() => void mutate()}
          />
          {asset.status === 'REVIEW' && (
            <PilotApproveButtons
              assetId={asset.id}
              variant="review"
              onChanged={() => void mutate()}
            />
          )}
          {asset.status === 'APPROVED' && (
            <PilotApproveButtons
              assetId={asset.id}
              variant="approved"
              onChanged={() => void mutate()}
            />
          )}
        </>
      )}
      <DriveBadge asset={asset} />
    </div>
  );
}

function PilotApproveButtons({
  assetId,
  variant,
  onChanged,
}: {
  assetId: string;
  /**
   * `review`   — REVIEW asset: Approve → APPROVED, "Send to revision" → REVISION.
   * `approved` — APPROVED asset: "Send to revision" only — demotes APPROVED to
   *              REVISION so Director can revoke a too-eager approval and regen.
   *
   * REJECT decision is intentionally not exposed: the FSM forbids
   * APPROVED→REJECTED, and REVISION is the ergonomic state for "not happy,
   * please redo". REJECTED is reserved for upstream pipeline failures.
   */
  variant: 'review' | 'approved';
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<null | 'approve' | 'revise'>(null);
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    setBusy('approve');
    setError(null);
    try {
      const res = await fetch(`/api/assets/${assetId}/approve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          decision: 'APPROVE',
          directorConfirm: true,
          preview_acknowledged: true,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? 'APPROVE failed');
      }
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function requestRevision() {
    const defaultNote =
      variant === 'approved'
        ? 'Director revoked approval — please regenerate'
        : 'Please regenerate with adjusted settings';
    const note = typeof window !== 'undefined'
      ? window.prompt('Reason for sending back to revision?', defaultNote)
      : defaultNote;
    if (note === null) return; // user cancelled prompt
    const trimmed = note.trim().length > 0 ? note.trim() : defaultNote;
    setBusy('revise');
    setError(null);
    try {
      const res = await fetch(`/api/assets/${assetId}/approve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          decision: 'REQUEST_REVISION',
          note: trimmed,
          directorConfirm: true,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? 'REVISION failed');
      }
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-2 pt-2 border-t border-glass">
      {variant === 'review' && (
        <Button
          size="sm"
          variant="primary"
          onClick={approve}
          disabled={busy !== null}
        >
          {busy === 'approve' ? 'Approving…' : 'Approve'}
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        onClick={requestRevision}
        disabled={busy !== null}
        title={
          variant === 'approved'
            ? 'Demote this APPROVED shot to REVISION so Director can regenerate'
            : 'Send shot back to REVISION'
        }
      >
        {busy === 'revise'
          ? 'Sending…'
          : variant === 'approved' ? 'Send to revision' : 'Reject'}
      </Button>
      {error && (
        <span className="text-[11px]" style={{ color: 'var(--accent-danger)' }}>
          {error}
        </span>
      )}
    </div>
  );
}

function DriveBadge({ asset }: { asset: AssetRow }) {
  if (asset.drive_file_id && asset.drive_web_view_url) {
    return (
      <a
        href={asset.drive_web_view_url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 text-[11px] hover:underline"
        style={{ color: 'var(--accent-success)' }}
      >
        <ExternalLink size={11} />
        Backed up to Google Drive — open in Drive
      </a>
    );
  }
  // Show this hint only for binary types. Text assets live in the DB column.
  const cat = categoryFor(asset.file_type);
  if (cat === 'image' || cat === 'video' || cat === 'audio') {
    return (
      <div
        className="inline-flex items-center gap-1.5 text-[11px]"
        style={{ color: 'var(--text-muted)' }}
        title="Switch storage provider to drive_native in Settings → Providers to back up new assets to Drive."
      >
        <CloudOff size={11} />
        Local cache only — Drive storage off
      </div>
    );
  }
  return null;
}

function TextBody({ assetId }: { assetId: string }) {
  const { data, error } = useSWR<{ data: { content: string } }>(
    `/api/assets/${assetId}/content`,
    fetcher,
  );
  if (error) {
    return (
      <div className="text-xs px-3 py-2 rounded-lg" style={{ color: 'var(--accent-danger)' }}>
        {(error as Error).message}
      </div>
    );
  }
  if (!data?.data) return <p className="text-sm text-text-secondary">Loading content…</p>;
  const content = data.data.content;
  if (!content) {
    return (
      <p className="text-sm text-text-secondary italic">
        Asset has no content yet (may be pre-migration 0013 or pending generation).
      </p>
    );
  }
  return (
    <article
      className="markdown-body px-4 py-3 rounded-lg border border-glass leading-relaxed text-sm text-text-primary"
      style={{ background: 'var(--bg-elevated)' }}
    >
      <ReactMarkdown
        components={{
          h1: ({ children }) => (
            <h1 className="text-lg font-semibold mt-1 mb-2 text-text-primary">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-base font-semibold mt-3 mb-1.5 text-text-primary">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-semibold mt-2.5 mb-1 text-text-primary">{children}</h3>
          ),
          p: ({ children }) => (
            <p className="mb-2 text-text-secondary leading-relaxed">{children}</p>
          ),
          ul: ({ children }) => <ul className="list-disc ml-5 mb-2 space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal ml-5 mb-2 space-y-0.5">{children}</ol>,
          li: ({ children }) => <li className="text-text-secondary">{children}</li>,
          code: ({ children }) => (
            <code
              className="px-1 py-0.5 rounded text-[12px] font-mono"
              style={{ background: 'var(--panel-hover-bg)' }}
            >
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre
              className="p-3 rounded-lg overflow-x-auto text-[12px] mb-2"
              style={{ background: 'var(--panel-hover-bg)' }}
            >
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote
              className="pl-3 border-l-2 italic mb-2"
              style={{ borderColor: 'var(--accent-info)', color: 'var(--text-muted)' }}
            >
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-3 border-glass" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </article>
  );
}

function ImageBody({ asset }: { asset: AssetRow }) {
  if (!isHttpishUrl(asset.drive_path)) {
    return (
      <FallbackBody
        message="Mock image — no browser-loadable URL. Switch the image provider to gpt-image-1 in Settings → Providers and re-trigger to see a real preview."
        drivePath={asset.drive_path}
      />
    );
  }
  return (
    <div
      className="rounded-lg overflow-hidden border border-glass"
      style={{ background: 'var(--bg-elevated)' }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={asset.drive_path ?? ''}
        alt={asset.filename}
        className="w-full h-auto block"
      />
    </div>
  );
}

function VideoBody({ asset }: { asset: AssetRow }) {
  if (!isHttpishUrl(asset.drive_path)) {
    return (
      <FallbackBody
        message="Mock video — no browser-loadable URL. Switch the video provider to a real one and re-trigger."
        drivePath={asset.drive_path}
      />
    );
  }
  return (
    <video
      src={asset.drive_path ?? ''}
      controls
      className="w-full rounded-lg border border-glass"
      style={{ background: 'var(--bg-elevated)' }}
    />
  );
}

function AudioBody({ asset }: { asset: AssetRow }) {
  if (!isHttpishUrl(asset.drive_path)) {
    return (
      <FallbackBody
        message="Mock audio — no browser-loadable URL."
        drivePath={asset.drive_path}
      />
    );
  }
  return (
    <audio
      src={asset.drive_path ?? ''}
      controls
      className="w-full"
    />
  );
}

function FallbackBody({
  message,
  drivePath,
}: {
  message: string;
  drivePath: string | null;
}) {
  return (
    <div
      className="px-3 py-3 rounded-lg border border-glass space-y-2"
      style={{ background: 'var(--bg-elevated)' }}
    >
      <div className="flex items-center gap-2 text-sm text-text-secondary">
        <FileWarning size={14} />
        <span>{message}</span>
      </div>
      {drivePath && (
        <div className="text-[11px] text-text-muted font-mono break-all">{drivePath}</div>
      )}
      {drivePath && isHttpishUrl(drivePath) && (
        <a
          href={drivePath}
          download
          className="inline-flex items-center gap-1.5 text-xs text-text-primary hover:underline"
        >
          <Download size={12} /> Download
        </a>
      )}
    </div>
  );
}

function CanonExtensionsForAsset({ asset }: { asset: AssetRow }) {
  // Look up unresolved canon_extension_proposed event for this asset.
  const { data, error, mutate } = useSWR<{
    data: CanonExtensionEvent[];
  }>(`/api/activity?asset_id=${asset.id}&type=canon_extension_proposed&unresolved=true`, fetcher);

  if (error || !data?.data) return null;
  const event = data.data[0];
  if (!event || event.resolved_at) return null;

  // Resolve series_id: prefer asset.series_id (Bible asset), else fall back
  // to the episode's series via API. For canon-extension events the asset is
  // the producing agent's output (REV-world_check, etc.) — series_id is on
  // the parent episode, surfaced via /api/episodes/[id].
  const seriesId = asset.series_id;
  const proposals: CanonExtensionProposal[] = Array.isArray(event.metadata?.proposals)
    ? event.metadata!.proposals!
    : [];
  if (proposals.length === 0) return null;
  if (!seriesId) {
    return (
      <CanonExtensionsWithEpisode
        episodeId={asset.episode_id ?? null}
        eventId={event.id}
        proposals={proposals}
        onResolved={() => mutate()}
      />
    );
  }
  return (
    <CanonExtensionsPanel
      proposals={proposals}
      eventId={event.id}
      seriesId={seriesId}
      onResolved={() => mutate()}
    />
  );
}

function CanonExtensionsWithEpisode({
  episodeId,
  eventId,
  proposals,
  onResolved,
}: {
  episodeId: string | null;
  eventId: string;
  proposals: CanonExtensionProposal[];
  onResolved: () => void;
}) {
  const { data: epData } = useSWR<{ data: { episode: { series_id: string | null } } }>(
    episodeId ? `/api/episodes/${episodeId}` : null,
    fetcher,
  );
  const seriesId = epData?.data?.episode?.series_id;
  if (!seriesId) {
    return (
      <div
        className="text-xs px-3 py-2 rounded-lg border"
        style={{ borderColor: 'var(--border-glass)', color: 'var(--text-muted)' }}
      >
        Bible extensions found, but the parent series is unresolved — cannot create Bible drafts.
      </div>
    );
  }
  return (
    <CanonExtensionsPanel
      proposals={proposals}
      eventId={eventId}
      seriesId={seriesId}
      onResolved={onResolved}
    />
  );
}
