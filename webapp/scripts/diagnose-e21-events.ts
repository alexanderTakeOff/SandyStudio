// Diagnose Activity feed gap — list all activity_events + jobs for E21
// since the STB v05 fire (last ~30 min) to see what landed vs what didn't.
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
const SINCE = new Date(Date.now() - 90 * 60 * 1000).toISOString(); // 90 min back

(async () => {
  // 1. All activity_events since SINCE
  const { data: events } = await sb
    .from('activity_events')
    .select('id,event_type,severity,title,actor,asset_id,created_at,metadata')
    .eq('episode_id', EP)
    .gte('created_at', SINCE)
    .order('created_at', { ascending: true });
  console.log(`=== activity_events for E21 since ${SINCE.slice(11, 19)} ===`);
  console.log(`Total: ${events?.length ?? 0}`);
  for (const e of events ?? []) {
    console.log(`${e.created_at?.slice(11, 19) ?? '?'} [${(e.event_type as string).padEnd(20)}] ${(e.actor as string).padEnd(14)} ${(e.title as string).slice(0, 80)}`);
  }

  // 2. All jobs for E21 since SINCE
  const { data: jobs } = await sb
    .from('jobs')
    .select('id,agent_id,status,inngest_event,started_at,completed_at,output_ref,error_message')
    .eq('episode_id', EP)
    .gte('started_at', SINCE)
    .order('started_at', { ascending: true });
  console.log(`\n=== jobs for E21 since ${SINCE.slice(11, 19)} ===`);
  console.log(`Total: ${jobs?.length ?? 0}`);
  for (const j of jobs ?? []) {
    console.log(`${j.started_at?.slice(11, 19) ?? '?'} ${(j.agent_id as string).padEnd(14)} ${(j.status as string).padEnd(10)} event=${(j.inngest_event as string ?? '').slice(0, 50)} out=${j.output_ref ?? '-'}`);
  }

  // 3. All recent assets created/updated
  const { data: assets } = await sb
    .from('assets')
    .select('id,filename,status,updated_at')
    .eq('episode_id', EP)
    .gte('updated_at', SINCE)
    .order('updated_at', { ascending: true });
  console.log(`\n=== assets touched for E21 since ${SINCE.slice(11, 19)} ===`);
  console.log(`Total: ${assets?.length ?? 0}`);
  for (const a of assets ?? []) {
    console.log(`${a.updated_at?.slice(11, 19) ?? '?'} ${(a.status as string).padEnd(10)} ${(a.filename as string).slice(0, 80)}`);
  }
})();
