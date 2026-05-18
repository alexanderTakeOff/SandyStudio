// One-off: focused snapshot for E20 archive decision.
// Prints: episode status + metadata, RUNNING jobs, VID-shot count by status,
// STITCH artifact (final cut path/duration) — enough signal to write the
// archive metadata payload without hand-poking the DB.
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

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const EP = '763c5c1e-44dc-4e10-92fb-e7671e5d4a44';

async function main() {
  const { data: ep } = await sb
    .from('episodes')
    .select('id,code,title,status,metadata,budget_spent,budget_ceiling,updated_at')
    .eq('id', EP)
    .maybeSingle();
  console.log('=== EPISODE ===');
  console.log(JSON.stringify(ep, null, 2));

  const { data: jobs } = await sb
    .from('jobs')
    .select('id,agent_id,status,started_at,completed_at,inngest_event')
    .eq('episode_id', EP)
    .in('status', ['QUEUED', 'RUNNING', 'RETRYING'])
    .order('started_at', { ascending: false });
  console.log('\n=== ACTIVE JOBS (QUEUED/RUNNING/RETRYING) ===');
  console.log(`count: ${(jobs ?? []).length}`);
  for (const j of jobs ?? []) {
    console.log(`  ${j.status.padEnd(10)} ${j.agent_id} ← ${j.inngest_event}  (started ${j.started_at ?? '—'})`);
  }

  const { data: vidShots } = await sb
    .from('assets')
    .select('id,filename,status,metadata')
    .eq('episode_id', EP)
    .like('file_type', 'VID-shot%');
  const byStatus: Record<string, number> = {};
  const shotIds = new Set<string>();
  for (const a of vidShots ?? []) {
    byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
    const sid = (a.metadata as { shot_id?: string } | null)?.shot_id;
    if (sid) shotIds.add(sid);
  }
  console.log('\n=== VID-shots ===');
  console.log(`total assets: ${(vidShots ?? []).length} | distinct shot_ids: ${shotIds.size}`);
  console.log('by status:', byStatus);

  const { data: stitch } = await sb
    .from('assets')
    .select('id,filename,status,drive_path,metadata,updated_at')
    .eq('episode_id', EP)
    .like('file_type', '%final%')
    .order('updated_at', { ascending: false })
    .limit(5);
  console.log('\n=== final-cut assets (top 5) ===');
  for (const a of stitch ?? []) {
    console.log(
      `  ${a.status.padEnd(10)} ${a.filename} → ${a.drive_path ?? '—'} (duration_seconds=${
        (a.metadata as { duration_seconds?: number } | null)?.duration_seconds ?? '?'
      })`,
    );
  }

  const { data: animatic } = await sb
    .from('assets')
    .select('id,filename,status,metadata,updated_at')
    .eq('episode_id', EP)
    .like('file_type', '%animatic%')
    .eq('status', 'APPROVED')
    .order('updated_at', { ascending: false })
    .limit(3);
  console.log('\n=== animatic APPROVED (top 3) ===');
  for (const a of animatic ?? []) {
    const meta = a.metadata as { shot_list?: unknown[] } | null;
    console.log(`  ${a.filename}  shots=${meta?.shot_list?.length ?? '?'}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
