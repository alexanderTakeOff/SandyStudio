// Snapshot of E21 after overnight idle — find Storyboard asset, episode
// status, latest events, any RUNNING/QUEUED/FAILED jobs.
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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    process.env[line.slice(0, eq).trim()] = val;
  }
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const EP = '21f7bd6a-f52c-4ae0-bd47-06ff328ec6e7';
(async () => {
  const { data: ep } = await sb.from('episodes').select('episode_code,title_working,status,updated_at').eq('id', EP).maybeSingle();
  console.log('=== episode ===');
  console.log(ep);

  const { data: jobs } = await sb.from('jobs').select('agent_id,status,started_at,completed_at,inngest_event').eq('episode_id', EP).order('started_at', { ascending: false }).limit(15);
  console.log('\n=== last 15 jobs ===');
  for (const j of jobs ?? []) {
    console.log(`  ${j.status.padEnd(10)} ${j.agent_id.padEnd(14)} ← ${j.inngest_event}  (${j.started_at?.slice(0, 19)} → ${j.completed_at?.slice(0, 19) ?? 'open'})`);
  }

  const { data: assets } = await sb.from('assets').select('id,filename,file_type,status,version,created_at').eq('episode_id', EP).order('created_at', { ascending: false }).limit(20);
  console.log('\n=== last 20 assets ===');
  for (const a of assets ?? []) {
    console.log(`  ${a.status.padEnd(10)} ${a.file_type.padEnd(18)} ${a.filename}`);
  }

  const { data: ev } = await sb.from('activity_events').select('event_type,severity,title,actor,created_at').eq('episode_id', EP).order('created_at', { ascending: false }).limit(15);
  console.log('\n=== last 15 events ===');
  for (const e of ev ?? []) {
    console.log(`  ${e.created_at?.slice(11, 19)} [${e.severity}] ${e.event_type.padEnd(20)} ${e.actor ?? '-'.padEnd(12)} ${e.title}`);
  }
})();
