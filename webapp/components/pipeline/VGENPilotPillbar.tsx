// ──────────────────────────────────────────────────────────────────────────────
// components/pipeline/VGENPilotPillbar.tsx
//
// Pillbar shown above the Visual Generator stage card during VGEN runs.
// Mirrors EREFPilotPillbar but talks to the VGEN routes Track A creates:
//   - POST /api/episodes/[id]/vgen/approve-pilots  → emit fanout
//   - POST /api/episodes/[id]/vgen/cancel          → set cancel token
//
// Two display modes (driven by `pilot_state` from /api/episodes/[id]/vgen/state):
//   - Pilot mode    (`PENDING_REVIEW`)  → "VGEN Pilot N/total — review and approve direction"
//                                         + "Approve Direction & Fan Out" + "Cancel VGEN"
//   - Review mode   (`FANOUT_RUNNING`)  → "Reviewed: x/N shots have approved video"
//                                         + "Cancel VGEN" while running
//
// State + progress come from a single endpoint that bridges Track A's
// app_config storage with Track B's UI:
//   - /api/episodes/[id]/vgen/state → { pilot_state, total_shots,
//                                        pilot_shot_ids, pilot_approved_count,
//                                        approved_count, has_vid_shots }
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Loader2, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { fetcher } from '@/lib/swr';

// ── Types ─────────────────────────────────────────────────────────────────

type VGENPilotState =
  | 'NONE'
  | 'PENDING_REVIEW'
  | 'FANOUT_RUNNING'
  | 'COMPLETE'
  | 'CANCELLED';

interface VgenStateData {
  episode_id: string;
  pilot_state: VGENPilotState;
  total_shots: number;
  pilot_shot_ids: string[];
  pilot_approved_count: number;
  approved_count: number;
  has_vid_shots: boolean;
  running_jobs: number;
}

interface VgenStateResponse {
  data: VgenStateData;
}

export interface VGENPilotPillbarProps {
  episodeId: string;
  /**
   * Optional — when true, force the pillbar visible even before any
   * `vgen_pilot_state` is set on the episode. Pass when the caller already
   * knows the Visual Generator stage is running.
   */
  stageRunning?: boolean;
}

export function VGENPilotPillbar({ episodeId, stageRunning }: VGENPilotPillbarProps) {
  // Faster refresh while VGEN is actively running so Director sees progress
  // updates without manual Refresh clicks. Falls back to 30s when idle.
  const { data: stateData, mutate: mutateState } = useSWR<VgenStateResponse>(
    `/api/episodes/${episodeId}/vgen/state`,
    fetcher,
    {
      refreshInterval: (latest) => {
        const d = latest?.data;
        if (!d) return 30_000;
        const live =
          d.pilot_state === 'PENDING_REVIEW' ||
          d.pilot_state === 'FANOUT_RUNNING' ||
          d.running_jobs > 0;
        return live ? 4_000 : 30_000;
      },
    },
  );

  const s = stateData?.data;
  const pilotState: VGENPilotState | undefined = s?.pilot_state;

  const progress = {
    totalShots: s?.total_shots ?? 0,
    approvedCount: s?.approved_count ?? 0,
    pilotApprovedCount: s?.pilot_approved_count ?? 0,
    pilotShotIds: s?.pilot_shot_ids ?? [],
    runningJobs: s?.running_jobs ?? 0,
  };

  const [busy, setBusy] = useState<null | 'approve_pilots' | 'cancel'>(null);
  const [success, setSuccess] = useState<null | 'approve_pilots' | 'cancel'>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  // Visibility heuristic — show whenever:
  //   • the state endpoint reports a non-NONE pilot state, OR
  //   • the stage is currently running, OR
  //   • there is at least one VID-shot asset already.
  const hasVidShots = s?.has_vid_shots === true;
  const visible =
    Boolean(pilotState && pilotState !== 'NONE') ||
    Boolean(stageRunning) ||
    hasVidShots;
  if (!visible) return null;
  if (pilotState === 'COMPLETE') return null;

  // ── Actions ─────────────────────────────────────────────────────────────

  async function refresh() {
    await mutateState();
  }

  async function approvePilots() {
    setBusy('approve_pilots');
    setError(null);
    try {
      const res = await fetch(`/api/episodes/${episodeId}/vgen/approve-pilots`, {
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
      const res = await fetch(`/api/episodes/${episodeId}/vgen/cancel`, {
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

  // ── Render ──────────────────────────────────────────────────────────────

  const isPilotMode = pilotState === 'PENDING_REVIEW';
  const cancelled = pilotState === 'CANCELLED';
  const fanoutRunning = pilotState === 'FANOUT_RUNNING' || stageRunning === true;
  const pilotCount = progress.pilotShotIds.length || 2;

  const canApproveDirection =
    isPilotMode &&
    progress.pilotShotIds.length > 0 &&
    progress.pilotApprovedCount === progress.pilotShotIds.length;

  return (
    <>
      <div
        className="rounded-lg border border-glass px-3 py-2.5 mb-3 flex items-center gap-3 flex-wrap"
        style={{
          background: 'color-mix(in oklab, var(--accent-primary) 8%, var(--bg-elevated))',
          boxShadow: '0 0 0 1px color-mix(in oklab, var(--accent-primary) 25%, transparent)',
        }}
        role="status"
        aria-label="Visual Generator progress"
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
            VGEN cancelled — re-trigger to start over.
          </span>
        ) : (
          <ReviewHeadline
            approved={progress.approvedCount}
            totalShots={progress.totalShots}
            running={fanoutRunning}
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
              Approve Direction & Fan Out
            </Button>
          )}

          {!cancelled && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirmCancel(true)}
              disabled={busy !== null}
            >
              Cancel VGEN
            </Button>
          )}
        </div>

        {error && (
          <div
            className="basis-full text-[11px] mt-1 inline-flex items-center gap-1.5"
            style={{ color: 'var(--accent-danger)' }}
            role="alert"
          >
            <AlertCircle size={11} />
            {error}
          </div>
        )}
      </div>

      <Modal open={confirmCancel} onClose={() => setConfirmCancel(false)} title="Cancel VGEN?">
        <div className="space-y-4">
          <p className="text-sm text-text-secondary leading-relaxed">
            The currently in-flight shot will finish (~$0.20 wasted on Veo 3).
            Subsequent shots will abort. You can re-trigger VGEN afterwards.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setConfirmCancel(false)}
              disabled={busy === 'cancel'}
            >
              Keep running
            </Button>
            <Button variant="danger" onClick={cancel} disabled={busy === 'cancel'}>
              {busy === 'cancel' ? 'Cancelling…' : 'Cancel VGEN'}
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
        VGEN Pilot
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

function ReviewHeadline({
  approved,
  totalShots,
  running,
}: {
  approved: number;
  totalShots: number;
  running: boolean;
}) {
  const pct = totalShots === 0 ? 0 : Math.round((approved / totalShots) * 100);
  const done = approved >= totalShots && totalShots > 0;
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-2 text-sm">
        {done && (
          <CheckCircle2 size={14} className="shrink-0" style={{ color: 'var(--accent-success)' }} />
        )}
        {running && !done && (
          <Loader2 size={14} className="shrink-0 animate-spin" style={{ color: 'var(--accent-primary)' }} />
        )}
        <span className="text-text-primary font-medium">
          {running && !done
            ? `Generating: ${approved}/${totalShots} shots have approved video`
            : `Reviewed: ${approved}/${totalShots} shots have approved video`}
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
