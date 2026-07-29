// ──────────────────────────────────────────────────────────────────────────────
// __tests__/lib/agents/job-row-closure.test.ts
//
// The invariant: EVERY way an agent run ends must leave its `jobs` row closed.
//
// Why (E33, 2026-07-29): an EXEC-EREF row sat RUNNING for hours. The app process
// died mid-step, so no user code ran — not the step, not the function's `catch`,
// not `markJobFailed`. The row stayed open until the hourly reaper, i.e. up to
// ~2.5h of phantom "generation in progress" in the Director's UI.
//
// The fix is `closeOpenJobsForRun`, called from each agent function's onFailure —
// the one hook Inngest invokes from the OUTSIDE, once, after retries are
// exhausted. These tests pin the three terminations the wrapper owns (throw /
// success / retry-after-error) plus the two properties that make the onFailure
// close safe: it closes what the catch could not, and it touches nothing that is
// already closed.
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';

import { makeMockSupabase } from '../../helpers/mock-supabase';
import {
  insertJobRow,
  markJobCompleted,
  markJobFailed,
  closeOpenJobsForRun,
} from '@/lib/agents/runner';

const EP = 'ep-1';
const RUN = 'run-abc';

interface JobRow {
  id: string;
  status?: string;
  completed_at?: string | null;
  error_message?: string | null;
  output_ref?: string | null;
}

async function seedRunningJob(
  sb: ReturnType<typeof makeMockSupabase>,
  over: { agentId?: 'EXEC-EREF' | 'EXEC-VGEN' | 'EXEC-PUB'; runId?: string; shotId?: string } = {},
) {
  return insertJobRow({
    supabase: sb.client,
    agentId: over.agentId ?? 'EXEC-EREF',
    episodeId: EP,
    inngestEvent: 'sandystudio/exec-eref/start',
    inngestRunId: over.runId ?? RUN,
    inputSnapshot: { episodeId: EP, ...(over.shotId ? { shotId: over.shotId } : {}) },
  });
}

function jobs(sb: ReturnType<typeof makeMockSupabase>): JobRow[] {
  return sb.tables.jobs as unknown as JobRow[];
}

describe('job row closure — every termination closes its row', () => {
  it('closes the row as FAILED with the error text when a step throws', async () => {
    const sb = makeMockSupabase();
    const job = await seedRunningJob(sb);
    expect(jobs(sb)[0].status).toBe('RUNNING');

    // What the wrapper's catch does on a thrown step.
    await markJobFailed(sb.client, job.id, 'assets insert failed: duplicate key value');

    const row = jobs(sb)[0];
    expect(row.status).toBe('FAILED');
    expect(row.error_message).toContain('duplicate key value');
    expect(row.completed_at).toBeTruthy();
  });

  it('closes the row as COMPLETED on the success path', async () => {
    const sb = makeMockSupabase();
    const job = await seedRunningJob(sb);

    await markJobCompleted(sb.client, job.id, 'asset-1');

    const row = jobs(sb)[0];
    expect(row.status).toBe('COMPLETED');
    expect(row.output_ref).toBe('asset-1');
    expect(row.completed_at).toBeTruthy();
  });

  it('ends COMPLETED when an Inngest retry succeeds after an intermediate failure', async () => {
    const sb = makeMockSupabase();
    // Attempt 1: the step throws, the catch closes the row FAILED.
    const job = await seedRunningJob(sb);
    await markJobFailed(sb.client, job.id, 'transient provider 502');
    expect(jobs(sb)[0].status).toBe('FAILED');

    // Attempt 2: Inngest replays the memoised `insert-job-row` step, so the SAME
    // job id is reused — the retry must be able to flip its own row back to
    // COMPLETED rather than being stuck on the previous attempt's verdict.
    await markJobCompleted(sb.client, job.id, 'asset-1');

    expect(jobs(sb)).toHaveLength(1);
    expect(jobs(sb)[0].status).toBe('COMPLETED');
    expect(jobs(sb)[0].output_ref).toBe('asset-1');

    // And the terminal-failure closer never fires on a run that ended well —
    // but even if it were called, it must not resurrect the failure.
    const closed = await closeOpenJobsForRun(sb.client, RUN, 'retries exhausted');
    expect(closed).toBe(0);
    expect(jobs(sb)[0].status).toBe('COMPLETED');
  });
});

describe('closeOpenJobsForRun — the dead-worker backstop', () => {
  it('closes a row the catch never reached (process died mid-step)', async () => {
    const sb = makeMockSupabase();
    await seedRunningJob(sb);

    const closed = await closeOpenJobsForRun(sb.client, RUN, 'EXEC-EREF run failed after retries — worker lost');

    expect(closed).toBe(1);
    const row = jobs(sb)[0];
    expect(row.status).toBe('FAILED');
    expect(row.error_message).toContain('worker lost');
    expect(row.completed_at).toBeTruthy();
  });

  it('releases the dispatch claim the dead row was holding', async () => {
    const sb = makeMockSupabase({
      dispatch_intent: [
        { episode_id: EP, shot_id: 'S15-E33-SH07', agent_id: 'EXEC-VGEN', status: 'claimed' },
      ],
    });
    await seedRunningJob(sb, { agentId: 'EXEC-VGEN', shotId: 'S15-E33-SH07' });

    await closeOpenJobsForRun(sb.client, RUN, 'worker lost');

    // Closing the row takes it out of the reaper's RUNNING/QUEUED scan, so the
    // release has to happen here or the shot stays undispatchable forever.
    expect(sb.tables.dispatch_intent[0].status).toBe('failed');
  });

  it('leaves an already-closed row untouched (FAILED and COMPLETED alike)', async () => {
    const sb = makeMockSupabase();
    const failed = await seedRunningJob(sb);
    await markJobFailed(sb.client, failed.id, 'the real cause');
    const completed = await seedRunningJob(sb);
    await markJobCompleted(sb.client, completed.id, 'asset-1');

    const closed = await closeOpenJobsForRun(sb.client, RUN, 'retries exhausted — generic');

    expect(closed).toBe(0);
    const rows = jobs(sb);
    expect(rows.find((r) => r.id === failed.id)?.error_message).toBe('the real cause');
    expect(rows.find((r) => r.id === completed.id)?.status).toBe('COMPLETED');
  });

  it('only touches rows belonging to the failed run', async () => {
    const sb = makeMockSupabase();
    await seedRunningJob(sb, { runId: RUN });
    await seedRunningJob(sb, { runId: 'run-other' });

    const closed = await closeOpenJobsForRun(sb.client, RUN, 'retries exhausted');

    expect(closed).toBe(1);
    const rows = jobs(sb);
    expect(rows[0].status).toBe('FAILED');
    expect(rows[1].status).toBe('RUNNING');
  });

  it('closes BOTH rows when a dead attempt orphaned a duplicate insert', async () => {
    // The process can die after `insertJobRow` committed but before Inngest
    // recorded the step result — the retry then inserts a second row under the
    // same run id and the first is orphaned. Keyed on run id, both get closed.
    const sb = makeMockSupabase();
    await seedRunningJob(sb);
    await seedRunningJob(sb);

    const closed = await closeOpenJobsForRun(sb.client, RUN, 'retries exhausted');

    expect(closed).toBe(2);
    expect(jobs(sb).every((r) => r.status === 'FAILED')).toBe(true);
  });
});
