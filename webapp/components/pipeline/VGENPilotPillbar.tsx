// ──────────────────────────────────────────────────────────────────────────────
// components/pipeline/VGENPilotPillbar.tsx
//
// Pillbar shown above the Visual Generator stage card during VGEN runs.
// Mirrors EREFPilotPillbar but talks to the VGEN routes Track A creates:
//   - POST /api/episodes/[id]/vgen/approve-pilots  → emit fanout
//   - POST /api/episodes/[id]/vgen/cancel          → set cancel token
//
// Two display modes (driven by `episode.metadata.vgen_pilot_state`):
//   - Pilot mode    (`PENDING_REVIEW`)  → "VGEN Pilot N/total — review and approve direction"
//                                         + "Approve Direction & Fan Out" + "Cancel VGEN"
//   - Review mode   (`FANOUT_RUNNING` |
//                    `FANOUT_COMPLETE`) → "Reviewed: x/N shots have approved video"
//                                         + "Cancel VGEN" while running
//
// Progress is computed client-side from existing endpoints:
//   - /api/episodes/[id]                 → episode.metadata
//   - /api/assets?episode_id=…           → VID-shot assets
//
// NOTE: Track B inlines the `VGENPilotState` type minimally so this file does
//       not depend on Track A's `lib/api/vgen-pilot-state.ts` to compile. After
//       Track A lands, swap the inline alias for `import type { VGENPilotState }`.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Loader2, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { fetcher } from '@/lib/swr';

// ── Types (inlined Phase-1 fallback — see header) ───────────────────────────

type VGENPilotState =
  | 'NONE'
  | 'PENDING_REVIEW'
  | 'FANOUT_RUNNING'
  | 'FANOUT_COMPLETE'
  | 'CANCELLED'
  | 'COMPLETE';

interface VgenPilotMetadataLike {
  vgen_pilot_state?: VGENPilotState;
  vgen_total_shots?: number;
  vgen_pilot_shot_ids?: string[];
}

interface AssetRow {
  id: string;
  file_type: string;
  status: string;
  metadata?: unknown;
}

interface EpisodeResponse {
  data?: {
    id: string;
    metadata?: VgenPilotMetadataLike | null;
  };
}

interface AssetsResponse {
  data: AssetRow[];
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

interface ShotProgress {
  totalShots: number;
  approvedCount: number;
  pilotApprovedCount: number;
  pilotShotIds: string[];
}

function getVidShotShotId(meta: unknown): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const obj = meta as { shot_id?: unknown; storyboard_shot?: { shot_id?: unknown } };
  if (typeof obj.shot_id === 'string') return obj.shot_id;
  if (obj.storyboard_shot && typeof obj.storyboard_shot.shot_id === 'string') {
    return obj.storyboard_shot.shot_id;
  }
  return null;
}

function computeProgress(
  assets: AssetRow[],
  meta: VgenPilotMetadataLike | null | undefined,
): ShotProgress {
  const vidShots = assets.filter((a) => a.file_type.startsWith('VID-shot'));

  // Group by shot_id so re-generated variants count once.
  const byShot = new Map<string, AssetRow[]>();
  for (const a of vidShots) {
    const sid = getVidShotShotId(a.metadata) ?? a.id; // fallback per-asset
    if (!byShot.has(sid)) byShot.set(sid, []);
    byShot.get(sid)!.push(a);
  }

  const approvedShotIds = new Set<string>();
  for (const [sid, rows] of byShot) {
    if (rows.some((r) => r.status === 'APPROVED' || r.status === 'LOCKED')) {
      approvedShotIds.add(sid);
    }
  }

  const totalShots = meta?.vgen_total_shots ?? Math.max(byShot.size, 1);
  const pilotShotIds = meta?.vgen_pilot_shot_ids ?? [];
  const pilotApprovedCount = pilotShotIds.filter((sid) => approvedShotIds.has(sid)).length;

  return {
    totalShots,
    approvedCount: approvedShotIds.size,
    pilotApprovedCount,
    pilotShotIds,
  };
}

export function VGENPilotPillbar({ episodeId, stageRunning }: VGENPilotPillbarProps) {
  const { data: episodeData, mutate: mutateEp } = useSWR<EpisodeResponse>(
    `/api/episodes/${episodeId}`,
    fetcher,
    { refreshInterval: 30_000 },
  );
  const { data: assetsData, mutate: mutateAssets } = useSWR<AssetsResponse>(
    `/api/assets?episode_id=${episodeId}&limit=200`,
    fetcher,
    { refreshInterval: 30_000 },
  );

  const meta = episodeData?.data?.metadata ?? null;
  const pilotState: VGENPilotState | undefined = meta?.vgen_pilot_state;

  const progress = useMemo(
    () => computeProgress(assetsData?.data ?? [], meta),
    [assetsData?.data, meta],
  );

  const [busy, setBusy] = useState<null | 'approve_pilots' | 'cancel'>(null);
  const [success, setSuccess] = useState<null | 'approve_pilots' | 'cancel'>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  // Visibility heuristic — show whenever:
  //   • episode metadata has a v1 vgen pilot state, OR
  //   • the stage is currently running, OR
  //   • there is at least one VID-shot asset already.
  const hasVidShots = (assetsData?.data ?? []).some((a) => a.file_type.startsWith('VID-shot'));
  const visible =
    Boolean(pilotState && pilotState !== 'NONE') ||
    Boolean(stageRunning) ||
    hasVidShots;
  if (!visible) return null;
  if (pilotState === 'COMPLETE') return null;

  // ── Actions ─────────────────────────────────────────────────────────────

  async function refresh() {
    await Promise.all([mutateEp(), mutateAssets()]);
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
