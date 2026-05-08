// ──────────────────────────────────────────────────────────────────────────────
// components/timeline/StitchStatusPill.tsx
//
// Phase A.2 follow-up — Bug D fix (Director report 2026-05-08).
//
// After the 13/13 VID-shot APPROVED milestone, EXEC-STITCH fires automatically
// (auto-COMPLETE branch in approve/route.ts), but the Videomatic toolbar gave
// no visual feedback that anything was happening. Director saw "silence after
// 13/13" — this pill closes that gap.
//
// Contract:
//   - Polls /api/jobs?agent_id=EXEC-STITCH&episode_id=… every 5s while a job
//     is QUEUED/RUNNING/RETRYING; backs off to 30s once terminal.
//   - Looks for an existing VID-final_cut asset on the episode (passed in via
//     `finalCutAssetId`) so the "ready" state survives a session reload after
//     STITCH already completed.
//   - States rendered:
//       running   → yellow "Stitching final cut…" + Loader spinner
//       completed → green "Final cut ready" + click opens the drawer
//       failed    → red "Stitch failed" with tooltip showing error_message
//       idle      → null (no chip; nothing to report)
//
// Pure UI — no mutation. The pill is informational; the drawer / asset-page
// owns approval flow for the final cut itself.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import useSWR from 'swr';
import { CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';
import { fetcher } from '@/lib/swr';

type JobStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'RETRYING';

interface JobRow {
  id: string;
  agent_id: string;
  status: JobStatus;
  episode_id: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

interface JobsResponse {
  data: JobRow[];
}

const ACTIVE_STATUSES: ReadonlySet<JobStatus> = new Set([
  'QUEUED',
  'RUNNING',
  'RETRYING',
]);

export interface StitchStatusPillProps {
  episodeId: string;
  /** Asset id of an existing APPROVED/REVIEW VID-final_cut, if one exists. */
  finalCutAssetId: string | null;
  /** Click handler — typically opens the asset in PreviewDrawer. */
  onOpen?: (assetId: string) => void;
}

export function StitchStatusPill({
  episodeId,
  finalCutAssetId,
  onOpen,
}: StitchStatusPillProps) {
  const { data } = useSWR<JobsResponse>(
    `/api/jobs?agent_id=EXEC-STITCH&episode_id=${episodeId}&limit=1`,
    fetcher,
    {
      // Poll every 5s while we don't know terminal state. SWR's
      // refreshInterval is a constant — we adapt by checking the response
      // and returning either 5000 or 30000 based on the freshest row.
      refreshInterval: (latest) => {
        const row = latest?.data?.[0];
        if (!row) return 30_000;
        return ACTIVE_STATUSES.has(row.status) ? 5_000 : 30_000;
      },
    },
  );

  const job = data?.data?.[0] ?? null;

  // Resolution priority:
  //   1. Active job → show running state (overrides existing final_cut asset
  //      because that means STITCH is regenerating).
  //   2. Final-cut asset present → show completed (covers reload-after-success).
  //   3. Latest job FAILED → show failed.
  //   4. Otherwise hide.
  const isRunning = job !== null && ACTIVE_STATUSES.has(job.status);
  const isFailed = job?.status === 'FAILED';
  const isComplete = !isRunning && finalCutAssetId !== null;

  if (!isRunning && !isFailed && !isComplete) return null;

  if (isRunning) {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium border"
        style={{
          background: 'color-mix(in oklab, var(--accent-warning) 12%, transparent)',
          color: 'var(--accent-warning)',
          borderColor: 'color-mix(in oklab, var(--accent-warning) 35%, transparent)',
        }}
        title={`STITCH job ${job?.status ?? 'RUNNING'} — assembling final cut`}
      >
        <Loader2 size={11} className="animate-spin" />
        Stitching final cut…
      </span>
    );
  }

  if (isComplete) {
    const clickable = onOpen !== undefined && finalCutAssetId !== null;
    const handleClick = clickable
      ? () => onOpen!(finalCutAssetId!)
      : undefined;
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={!clickable}
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium border transition-colors disabled:cursor-default"
        style={{
          background: 'color-mix(in oklab, var(--accent-success) 12%, transparent)',
          color: 'var(--accent-success)',
          borderColor: 'color-mix(in oklab, var(--accent-success) 35%, transparent)',
        }}
        title={
          clickable
            ? 'Open final-cut mp4 in preview drawer'
            : 'Final cut ready'
        }
      >
        <CheckCircle2 size={11} />
        Final cut ready
      </button>
    );
  }

  // isFailed
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium border"
      style={{
        background: 'color-mix(in oklab, var(--accent-danger) 12%, transparent)',
        color: 'var(--accent-danger)',
        borderColor: 'color-mix(in oklab, var(--accent-danger) 35%, transparent)',
      }}
      title={job?.error_message ?? 'STITCH failed — check job details'}
    >
      <AlertTriangle size={11} />
      Stitch failed
    </span>
  );
}

