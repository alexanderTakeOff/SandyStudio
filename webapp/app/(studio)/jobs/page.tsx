// ──────────────────────────────────────────────────────────────────────────────
// app/(studio)/jobs/page.tsx
// Phase 3 — live read of `jobs` table + manual "Send ping" smoke-test button.
// Realtime updates and Inngest run-state polling land in Phase 5.
// ──────────────────────────────────────────────────────────────────────────────

import { StudioContentFrame } from '@/components/studio-shell/StudioContentFrame';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { JobsActionsBar } from '@/components/jobs/JobsActionsBar';
import { StatusChip } from '@/components/ui/StatusChip';
import type { AssetStatusCode } from '@/lib/uiux/types';

export const dynamic = 'force-dynamic';

interface JobRow {
  id: string;
  agent_id: string;
  episode_id: string | null;
  inngest_event: string;
  inngest_run_id: string | null;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
}

export default async function JobsPage() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('jobs')
    .select(
      'id, agent_id, episode_id, inngest_event, inngest_run_id, status, started_at, completed_at, error_message, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(50);

  const jobs = ((data ?? []) as unknown) as JobRow[];

  return (
    <StudioContentFrame>
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Jobs</h1>
          <p className="text-sm text-text-secondary mt-1">
            Live Inngest run state per agent. Realtime push lands in Phase 5.
          </p>
        </div>
        <JobsActionsBar />
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Recent jobs ({jobs.length})</CardTitle>
        </CardHeader>
        <CardBody>
          {error && (
            <p className="text-sm text-[var(--accent-danger)]">
              Failed to load jobs: {error.message}
            </p>
          )}

          {!error && jobs.length === 0 && (
            <p className="text-sm text-text-secondary leading-relaxed">
              No jobs yet. Hit <code className="text-text-primary">Send ping</code> above to fire
              a <code className="text-text-primary">sandystudio/ping</code> event through the
              Inngest worker. A row will appear here within ~1 second.
            </p>
          )}

          {jobs.length > 0 && (
            <div className="overflow-x-auto -mx-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-text-muted text-[10.5px] uppercase tracking-wider">
                    <th className="text-left px-5 py-2 font-medium">Agent</th>
                    <th className="text-left px-2 py-2 font-medium">Event</th>
                    <th className="text-left px-2 py-2 font-medium">Status</th>
                    <th className="text-left px-2 py-2 font-medium">Run ID</th>
                    <th className="text-left px-5 py-2 font-medium">Started</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => {
                    const statusForChip = mapJobStatusToChip(j.status);
                    return (
                      <tr key={j.id} className="border-t border-glass">
                        <td className="px-5 py-2 font-mono text-xs text-text-primary">{j.agent_id}</td>
                        <td className="px-2 py-2 font-mono text-xs text-text-secondary">{j.inngest_event}</td>
                        <td className="px-2 py-2">
                          <StatusChip status={statusForChip} />
                        </td>
                        <td className="px-2 py-2 font-mono text-[11px] text-text-muted truncate max-w-[180px]">
                          {j.inngest_run_id ?? '—'}
                        </td>
                        <td className="px-5 py-2 text-xs text-text-secondary">
                          {j.started_at ? new Date(j.started_at).toLocaleTimeString() : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </StudioContentFrame>
  );
}

function mapJobStatusToChip(jobStatus: string): AssetStatusCode {
  switch (jobStatus) {
    case 'COMPLETED': return 'APPROVED';
    case 'RUNNING':   return 'REVIEW';
    case 'QUEUED':    return 'DRAFT';
    case 'RETRYING':  return 'REVISION';
    case 'FAILED':    return 'REJECTED';
    case 'CANCELLED': return 'INVALIDATED';
    default:          return 'DRAFT';
  }
}
