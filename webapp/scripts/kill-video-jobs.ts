// Kill zombie VIDEO jobs (VANIM/VPREV/VGEN) for one episode: RUNNING/QUEUED → FAILED.
// Surgical: ref jobs (EXEC-EREF*) untouched. Usage: EP=<episodeId> npx tsx scripts/kill-video-jobs.ts
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
for (const raw of readFileSync('.env.local', 'utf-8').split('\n')) {
  const l = raw.trim(); if (!l || l.startsWith('#')) continue;
  const e = l.indexOf('='); if (e <= 0) continue;
  let v = l.slice(e + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  process.env[l.slice(0, e).trim()] = v;
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const EP = process.env.EP || 'c3934ee2-c135-43e9-9a56-58b6bdc1f98b'; // default: E31
const VIDEO_AGENTS = ['EXEC-VANIM', 'EXEC-VPREV', 'EXEC-VGEN'];
(async () => {
  const { data: live, error } = await sb
    .from('jobs')
    .select('id,agent_id,status,started_at')
    .eq('episode_id', EP)
    .in('status', ['RUNNING', 'QUEUED'])
    .in('agent_id', VIDEO_AGENTS);
  if (error) throw new Error(error.message);
  console.log('LIVE video jobs before:', live?.length ?? 0);
  for (const j of live ?? []) console.log(' ', j.agent_id, j.status, j.id);
  if (!live?.length) { console.log('nothing to kill ✓'); return; }
  const { error: uerr } = await sb
    .from('jobs')
    .update({ status: 'FAILED' } as never)
    .in('id', live.map((j) => j.id));
  if (uerr) throw new Error('update: ' + uerr.message);
  const { data: after } = await sb
    .from('jobs')
    .select('id')
    .eq('episode_id', EP)
    .in('status', ['RUNNING', 'QUEUED'])
    .in('agent_id', VIDEO_AGENTS);
  console.log(`marked FAILED: ${live.length} ✓  remaining LIVE video: ${after?.length ?? 0}`);
})().catch((e) => { console.error(e); process.exit(1); });
