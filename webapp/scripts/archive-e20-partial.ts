// Archive SS-S14-E20 "The Violet Distance" as ARCHIVED-PARTIAL.
// Sprint α→ε kickoff plan, P0(b). 2026-05-14.
//
// Approach (Option A, Director-approved):
//   - Don't extend `episode_status` enum (no migration).
//   - Persist archival state in `episodes.metadata.archival`:
//       { state, completed_shots, total_shots, reason,
//         final_cut_asset_id, final_cut_path, archived_at, archived_by }
//   - Cancel 8 zombie RUNNING/QUEUED jobs (Director q3 — same as q1, just CANCELLED).
//   - Log a single audit `activity_event` for the archive action.
//
// Idempotent: a second run is a no-op if `metadata.archival.state` already set.
// Pass `--apply` to actually mutate. Without flag, dry-run prints planned changes.

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) {
  for (const raw of readFileSync(envPath, 'utf-8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[line.slice(0, eq).trim()] = val;
  }
}

const APPLY = process.argv.includes('--apply');
const EP_ID = '763c5c1e-44dc-4e10-92fb-e7671e5d4a44';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface EpisodeMetadata {
  archival?: {
    state: string;
    completed_shots: number;
    total_shots: number;
    reason: string;
    final_cut_asset_id?: string;
    final_cut_path?: string;
    archived_at: string;
    archived_by: string;
  };
  [key: string]: unknown;
}

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (writes will happen)' : 'DRY-RUN (no writes)'}`);
  console.log(`Episode: ${EP_ID}\n`);

  const { data: ep, error: epErr } = await sb
    .from('episodes')
    .select('id,episode_code,title_working,status,metadata,budget_spent,budget_ceiling')
    .eq('id', EP_ID)
    .maybeSingle();
  if (epErr || !ep) {
    console.error('Episode lookup failed:', epErr);
    process.exit(1);
  }
  const meta = (ep.metadata ?? {}) as EpisodeMetadata;
  if (meta.archival?.state) {
    console.log(`Already archived: ${JSON.stringify(meta.archival, null, 2)}`);
    console.log('No-op.');
    return;
  }

  // 1. Compute archival payload.
  const { data: vidShots } = await sb
    .from('assets')
    .select('id,filename,status,metadata')
    .eq('episode_id', EP_ID)
    .like('file_type', 'VID-shot%');

  const approvedShotIds = new Set<string>();
  for (const a of vidShots ?? []) {
    if (a.status !== 'APPROVED') continue;
    const sid = (a.metadata as { shot_id?: string } | null)?.shot_id;
    if (sid) approvedShotIds.add(sid);
  }
  const completedShots = approvedShotIds.size;

  const { data: stitch } = await sb
    .from('assets')
    .select('id,filename,drive_path,updated_at')
    .eq('episode_id', EP_ID)
    .like('file_type', '%final%')
    .eq('status', 'APPROVED')
    .order('updated_at', { ascending: false })
    .limit(1);
  const finalCut = stitch?.[0];

  const archival = {
    state: 'PARTIAL' as const,
    completed_shots: completedShots,
    total_shots: 19,
    reason: 'Veo quota exhausted on SC11 (2026-05-13). Pipeline closed at 17/19; remaining 2 shots not generated. Final cut concatenates the 17 approved VID-shots; STITCH per-shot trim to animatic shot_list timing deferred (PLAN.md ## CURRENT STATE q1).',
    final_cut_asset_id: finalCut?.id,
    final_cut_path: finalCut?.drive_path ?? null,
    archived_at: new Date().toISOString(),
    archived_by: 'CEO (Director, manual)',
  };

  console.log('=== Episode update plan ===');
  console.log(`  ${ep.episode_code} "${ep.title_working}" — current status=${ep.status}`);
  console.log(`  metadata.archival ← ${JSON.stringify(archival, null, 2)}`);
  console.log(`  (status field unchanged: episode_status enum has no ARCHIVED_PARTIAL value — Option A)`);

  // 2. Identify zombie jobs to cancel.
  const { data: jobs } = await sb
    .from('jobs')
    .select('id,agent_id,status,started_at,inngest_event')
    .eq('episode_id', EP_ID)
    .in('status', ['QUEUED', 'RUNNING', 'RETRYING']);
  console.log('\n=== Jobs to CANCEL ===');
  console.log(`count: ${(jobs ?? []).length}`);
  for (const j of jobs ?? []) {
    console.log(`  ${j.id} ${j.status} ${j.agent_id} ← ${j.inngest_event}`);
  }

  // 3. Audit event payload.
  const auditEvent = {
    episode_id: EP_ID,
    event_type: 'episode_archived',
    severity: 'info' as const,
    actor: 'Director',
    title: `Episode SS-S14-E20 archived as PARTIAL (${completedShots}/${archival.total_shots} shots)`,
    metadata: {
      archival,
      cancelled_jobs: (jobs ?? []).map((j) => ({ id: j.id, agent_id: j.agent_id, inngest_event: j.inngest_event })),
    },
  };
  console.log('\n=== Audit event payload ===');
  console.log(JSON.stringify(auditEvent, null, 2));

  if (!APPLY) {
    console.log('\n[DRY-RUN] Re-run with --apply to commit.');
    return;
  }

  // ---- APPLY ----
  console.log('\n=== APPLY ===');

  const newMeta = { ...meta, archival };
  const { error: epUpdErr } = await sb
    .from('episodes')
    .update({ metadata: newMeta, updated_at: new Date().toISOString() })
    .eq('id', EP_ID);
  if (epUpdErr) {
    console.error('Episode update failed:', epUpdErr);
    process.exit(1);
  }
  console.log('✓ episode.metadata.archival written');

  if ((jobs ?? []).length > 0) {
    const ids = (jobs ?? []).map((j) => j.id);
    const { error: jobUpdErr } = await sb
      .from('jobs')
      .update({ status: 'CANCELLED', completed_at: new Date().toISOString() })
      .in('id', ids);
    if (jobUpdErr) {
      console.error('Job cancel failed:', jobUpdErr);
      process.exit(1);
    }
    console.log(`✓ ${ids.length} jobs CANCELLED`);
  } else {
    console.log('  (no active jobs to cancel)');
  }

  const { error: evErr } = await sb.from('activity_events').insert(auditEvent);
  if (evErr) {
    console.error('Activity event insert failed:', evErr);
    process.exit(1);
  }
  console.log('✓ activity_event "episode_archived" logged');

  console.log('\nE20 → ARCHIVED-PARTIAL: complete.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
