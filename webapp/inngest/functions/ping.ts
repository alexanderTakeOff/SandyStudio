// ──────────────────────────────────────────────────────────────────────────────
// inngest/functions/ping.ts
// Phase 3 smoke-test function. Triggered by event `sandystudio/ping`.
// Writes one row into Supabase `jobs` to prove the full event → handler →
// Supabase loop works end-to-end. Real agent jobs land in Phase 4.
// ──────────────────────────────────────────────────────────────────────────────

import { inngest } from '@/lib/inngest/client';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';

export const ping = inngest.createFunction(
  {
    id: 'studio-ping',
    name: 'Studio Ping (smoke test)',
    retries: 0,
  },
  { event: 'sandystudio/ping' },
  async ({ event, step, runId }) => {
    // Step 1 — log the QUEUED row so the Director sees it instantly.
    const created = await step.run('insert-jobs-row', async () => {
      const sb = createSupabaseServiceRoleClient();
      const { data, error } = await sb
        .from('jobs')
        .insert({
          agent_id: 'EXEC-CONC',
          episode_id: event.data.episodeId ?? null,
          inngest_event: 'sandystudio/ping',
          inngest_run_id: runId,
          status: 'RUNNING',
          input_snapshot: { note: event.data.note ?? 'ping' },
          started_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (error) throw new Error(`jobs insert failed: ${error.message}`);
      return data as { id: string };
    });

    // Step 2 — flip to COMPLETED.
    await step.run('mark-completed', async () => {
      const sb = createSupabaseServiceRoleClient();
      const { error } = await sb
        .from('jobs')
        .update({
          status: 'COMPLETED',
          completed_at: new Date().toISOString(),
          output_ref: 'pong',
        })
        .eq('id', created.id);
      if (error) throw new Error(`jobs update failed: ${error.message}`);
    });

    return { ok: true, jobId: created.id, runId };
  },
);
