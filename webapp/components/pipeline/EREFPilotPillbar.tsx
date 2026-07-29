// ──────────────────────────────────────────────────────────────────────────────
// components/pipeline/EREFPilotPillbar.tsx
// Pillbar shown above the Episode references stage card during EREF v2 runs.
//
// Two display modes (driven by `episode.metadata.eref_pilot_state`):
//   - Pilot mode    (`PENDING_REVIEW`)  → "Pilot 2/N — review and approve direction"
//                                         + "Approve Direction & Fan Out" + "Cancel"
//   - Review mode   (`FANOUT_COMPLETE`
//                    or stage running)  → "Reviewed: x/N shots have approved variant"
//                                         + "Advance to Animatic" + "Cancel"
//
// Progress is computed client-side from existing endpoints:
//   - /api/episodes/[id]                 → episode.metadata + storyboard hint
//   - /api/assets?episode_id=…           → IMG-episode_ref_* assets
//
// Cancel button is always visible while the EREF stage is running.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Loader2, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { fetcher } from '@/lib/swr';
import { isShotReferenceV2 } from '@/lib/api/shot-reference';

// ── Types (mirrored loosely from Track A's eref-pilot-state.ts) ─────────────

type EREFPilotState =
  | 'PENDING_REVIEW'    // pilots generated, awaiting Director sign-off on direction
  | 'FANOUT_RUNNING'    // pilots approved, fan-out shots being generated
  | 'FANOUT_COMPLETE'   // all 13 shots generated, awaiting per-shot approval
  | 'CANCELLED'         // Director hit kill switch
  | 'COMPLETE';         // 13/13 approved + advanced

interface EpisodeMetadataLike {
  eref_pilot_state?: EREFPilotState;
  eref_total_shots?: number;
  eref_pilot_shot_ids?: string[];
}

interface AssetRow {
  id: string;
  file_type: string;
  status: string;
  metadata?: unknown;
}

// Sprint τ (2026-05-15) — actual /api/episodes/[id] envelope is
// `{ data: { episode, assets, jobs } }`. Pillbar previously read
// `data.metadata` (flat) which silently returned null, so the Pilot/Fanout
// branches never fired and Director only ever saw ReviewHeadline. Fix the
// shape to match the route's apiOk return.
interface EpisodeResponse {
  data?: {
    episode?: {
      id: string;
      metadata?: EpisodeMetadataLike | null;
    };
  };
}

interface AssetsResponse {
  data: AssetRow[];
}

export interface EREFPilotPillbarProps {
  episodeId: string;
  /**
   * Optional — when omitted, the pillbar fetches its own state. Pass when the
   * caller already has the pipeline payload to avoid a duplicate request.
   */
  stageRunning?: boolean;
}

interface ShotProgress {
  totalShots: number;
  approvedCount: number;
  /** Sprint τ — unique shot_ids that have at least one IMG-episode_ref asset
   *  in ANY status (DRAFT/REVIEW/REVISION/APPROVED). Used by FanoutHeadline
   *  to show "Generated N / M shots so far" without waiting on Director's
   *  per-asset approval. */
  generatedShotIds: string[];
  /** Subset of generatedShotIds that have at least one asset in REVIEW. */
  reviewShotIds: string[];
  pilotApprovedCount: number;
  pilotShotIds: string[];
  missing: string[];
}

function computeProgress(
  assets: AssetRow[],
  meta: EpisodeMetadataLike | null | undefined,
): ShotProgress {
  const v2Assets = assets.filter(
    (a) => a.file_type.startsWith('IMG-episode_ref') && isShotReferenceV2(a.metadata),
  );
  // Group by shot_id, find approved per shot.
  const byShot = new Map<string, AssetRow[]>();
  for (const a of v2Assets) {
    const sid = (a.metadata as { shot_reference: { shot_id: string } }).shot_reference.shot_id;
    if (!sid) continue;
    if (!byShot.has(sid)) byShot.set(sid, []);
    byShot.get(sid)!.push(a);
  }

  const approvedShotIds = new Set<string>();
  const reviewShotIds = new Set<string>();
  for (const [sid, rows] of byShot) {
    if (rows.some((r) => r.status === 'APPROVED' || r.status === 'LOCKED')) {
      approvedShotIds.add(sid);
    }
    if (rows.some((r) => r.status === 'REVIEW')) {
      reviewShotIds.add(sid);
    }
  }

  const totalShots =
    meta?.eref_total_shots ??
    Math.max(byShot.size, 1);

  const pilotShotIds = meta?.eref_pilot_shot_ids ?? [];
  const pilotApprovedCount = pilotShotIds.filter((sid) => approvedShotIds.has(sid)).length;

  const missing = Array.from(byShot.keys()).filter((sid) => !approvedShotIds.has(sid));

  return {
    totalShots,
    approvedCount: approvedShotIds.size,
    generatedShotIds: Array.from(byShot.keys()),
    reviewShotIds: Array.from(reviewShotIds),
    pilotApprovedCount,
    pilotShotIds,
    missing,
  };
}

export function EREFPilotPillbar({ episodeId, stageRunning }: EREFPilotPillbarProps) {
  const { data: episodeData, mutate: mutateEp } = useSWR<EpisodeResponse>(
    `/api/episodes/${episodeId}`,
    fetcher,
    { refreshInterval: 30_000 },
  );
  const { data: assetsData, mutate: mutateAssets } = useSWR<AssetsResponse>(
    `/api/assets?episode_id=${episodeId}&file_type_prefix=IMG-episode_ref&limit=200`,
    fetcher,
    { refreshInterval: 30_000 },
  );

  const meta = episodeData?.data?.episode?.metadata ?? null;
  const pilotState: EREFPilotState | undefined = meta?.eref_pilot_state;

  const progress = useMemo(
    () => computeProgress(assetsData?.data ?? [], meta),
    [assetsData?.data, meta],
  );

  const [busy, setBusy] = useState<null | 'approve_pilots' | 'cancel'>(null);
  const [success, setSuccess] = useState<null | 'approve_pilots' | 'cancel'>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  // Visibility heuristic — show the pillbar whenever:
  //  - episode metadata exposes a v2 pilot state, OR
  //  - the EREF stage is currently running, OR
  //  - there is at least one v2 EREF asset already.
  const hasV2Assets = (assetsData?.data ?? []).some(
    (a) => a.file_type.startsWith('IMG-episode_ref') && isShotReferenceV2(a.metadata),
  );
  const visible =
    Boolean(pilotState) ||
    Boolean(stageRunning) ||
    hasV2Assets;
  if (!visible) return null;
  if (pilotState === 'COMPLETE') return null;

  // ── Actions ───────────────────────────────────────────────────────────────

  async function refresh() {
    await Promise.all([mutateEp(), mutateAssets()]);
  }

  async function approvePilots() {
    setBusy('approve_pilots');
    setError(null);
    try {
      const res = await fetch(`/api/episodes/${episodeId}/eref/approve-pilots`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ directorConfirm: true }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? 'Approve direction failed');
      }
      setSuccess('approve_pilots');
      setTimeout(() => setSuccess(null), 600);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function cancel() {
    setBusy('cancel');
    setError(null);
    try {
      const res = await fetch(`/api/episodes/${episodeId}/eref/cancel`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ directorConfirm: true }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? 'Cancel failed');
      }
      setSuccess('cancel');
      setTimeout(() => setSuccess(null), 600);
      setConfirmCancel(false);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const isPilotMode = pilotState === 'PENDING_REVIEW';
  // Sprint τ (2026-05-15) — fan-out mode is its own headline. Pilot pair was
  // already accepted via approve-pilots route; fan-out is generating the
  // remaining shots. Director needs to see (a) acceptance, (b) progress.
  const isFanoutMode = pilotState === 'FANOUT_RUNNING';
  const pilotCount = progress.pilotShotIds.length || 2;

  // In pilot mode: "Approve Direction" gated on both pilots APPROVED.
  const canApproveDirection =
    isPilotMode &&
    progress.pilotShotIds.length > 0 &&
    progress.pilotApprovedCount === progress.pilotShotIds.length;

  const allApproved =
    progress.totalShots > 0 && progress.approvedCount >= progress.totalShots;

  const cancelled = pilotState === 'CANCELLED';

  return (
    <>
      <div
        className="rounded-lg border border-glass px-3 py-2.5 mb-3 flex items-center gap-3 flex-wrap"
        style={{
          background:
            'color-mix(in oklab, var(--accent-primary) 8%, var(--bg-elevated))',
          boxShadow: '0 0 0 1px color-mix(in oklab, var(--accent-primary) 25%, transparent)',
        }}
        role="status"
        aria-label="Episode references progress"
      >
        {isPilotMode ? (
          <PilotHeadline
            pilotApproved={progress.pilotApprovedCount}
            pilotTotal={pilotCount}
            totalShots={progress.totalShots}
          />
        ) : cancelled ? (
          <span className="flex items-center gap-2 text-sm text-text-secondary">
            <XCircle size={14} className="shrink-0" style={{ color: 'var(--accent-danger)' }} />
            EREF cancelled — re-trigger to start over.
          </span>
        ) : isFanoutMode ? (
          <FanoutHeadline
            generated={progress.generatedShotIds.length}
            reviewed={progress.reviewShotIds.length}
            totalShots={progress.totalShots}
          />
        ) : (
          <ReviewHeadline
            approved={progress.approvedCount}
            totalShots={progress.totalShots}
          />
        )}

        <div className="flex items-center gap-2 ml-auto">
          {isPilotMode && (
            <Button
              size="sm"
              variant="primary"
              onClick={approvePilots}
              disabled={busy !== null || !canApproveDirection}
              title={
                canApproveDirection
                  ? 'Approve direction and fan out remaining shots'
                  : `Approve both pilots first (${progress.pilotApprovedCount}/${pilotCount})`
              }
            >
              {busy === 'approve_pilots' && <Loader2 size={13} className="animate-spin" />}
              {success === 'approve_pilots' && <CheckCircle2 size={13} />}
              {!busy && !success && null}
              Approve Direction & Fan Out
            </Button>
          )}

          {/* Animatic-stage demotion (2026-07-09): the "Advance to Animatic"
              ceremony is gone. Once all references are approved the Director
              opens the stream with the "Старт видео" latch on the Episode
              Timeline — no separate animatic build/approval step. */}
          {!isPilotMode && !cancelled && allApproved && (
            <div className="text-[11px] text-text-muted px-2 py-1">
              Все рефы одобрены → откройте видео кнопкой «Старт видео» на таймлайне эпизода.
            </div>
          )}

          {!cancelled && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirmCancel(true)}
              disabled={busy !== null}
            >
              Cancel EREF
            </Button>
          )}
        </div>

        {error && (
          <div
            className="basis-full text-[11px] mt-1 inline-flex items-center gap-1.5"
            style={{ color: 'var(--accent-danger)' }}
          >
            <AlertCircle size={11} />
            {error}
          </div>
        )}
      </div>

      <Modal
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title="Cancel EREF?"
      >
        <div className="space-y-4">
          <p className="text-text-secondary">
            The shot in flight finishes (~$0.05 wasted), the rest abort. You can
            re-run EREF later.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmCancel(false)} disabled={busy === 'cancel'}>
              Keep running
            </Button>
            <Button variant="danger" onClick={cancel} disabled={busy === 'cancel'}>
              {busy === 'cancel' ? 'Cancelling…' : 'Cancel EREF'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function PilotHeadline({
  pilotApproved,
  pilotTotal,
  totalShots,
}: {
  pilotApproved: number;
  pilotTotal: number;
  totalShots: number;
}) {
  return (
    <div className="flex items-center gap-2 text-sm text-text-primary">
      <span
        className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider"
        style={{
          background: 'color-mix(in oklab, var(--accent-primary) 20%, transparent)',
          color: 'var(--accent-primary)',
        }}
      >
        Pilot
      </span>
      <span>
        {pilotApproved}/{pilotTotal} pilot shots approved
        {totalShots > 0 && totalShots !== pilotTotal && (
          <span className="text-text-muted text-xs ml-1">· {totalShots} total in episode</span>
        )}
      </span>
    </div>
  );
}

function FanoutHeadline({
  generated,
  reviewed,
  totalShots,
}: {
  generated: number;
  reviewed: number;
  totalShots: number;
}) {
  const known = totalShots > 0 && totalShots !== generated;
  const pct = totalShots > 0 ? Math.min(100, Math.round((generated / totalShots) * 100)) : 0;
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-2 text-sm">
        <span
          aria-hidden
          className="relative inline-flex h-2.5 w-2.5 shrink-0"
        >
          <span
            className="absolute inset-0 rounded-full animate-ping"
            style={{ background: 'var(--accent-warning)', opacity: 0.55 }}
          />
          <span
            className="relative inline-flex h-2.5 w-2.5 rounded-full"
            style={{ background: 'var(--accent-warning)' }}
          />
        </span>
        <span className="text-text-primary font-medium">
          Pilot pair accepted · fan-out running
        </span>
      </div>
      <div className="text-sm text-text-secondary">
        Generated <span className="text-text-primary font-medium">{generated}</span>
        {known ? <> / <span className="text-text-primary font-medium">{totalShots}</span> shots</> : <> shots so far</>}
        {reviewed > 0 && (
          <span className="text-text-muted text-xs ml-1">· {reviewed} in review</span>
        )}
      </div>
      {known && (
        <div
          className="h-1.5 rounded-full overflow-hidden flex-1 min-w-[120px] max-w-[280px]"
          style={{ background: 'color-mix(in oklab, var(--panel-glass-border) 60%, transparent)' }}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${pct}%`,
              background: 'var(--accent-warning)',
            }}
          />
        </div>
      )}
    </div>
  );
}

function ReviewHeadline({ approved, totalShots }: { approved: number; totalShots: number }) {
  const pct = totalShots === 0 ? 0 : Math.round((approved / totalShots) * 100);
  const done = approved >= totalShots && totalShots > 0;
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-2 text-sm">
        {done && (
          <CheckCircle2 size={14} className="shrink-0" style={{ color: 'var(--accent-success)' }} />
        )}
        <span className="text-text-primary font-medium">
          Reviewed: {approved}/{totalShots} shots have approved variant
        </span>
      </div>
      <div
        className="h-1.5 rounded-full overflow-hidden flex-1 min-w-[120px] max-w-[280px]"
        style={{ background: 'color-mix(in oklab, var(--panel-glass-border) 60%, transparent)' }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            background: done ? 'var(--accent-success)' : 'var(--accent-primary)',
          }}
        />
      </div>
    </div>
  );
}
