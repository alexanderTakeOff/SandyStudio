import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) for (const raw of readFileSync(envPath, 'utf-8').split('\n')) { const l = raw.trim(); if (!l||l.startsWith('#')) continue; const eq=l.indexOf('='); if (eq<=0) continue; let v=l.slice(eq+1).trim(); if ((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1); process.env[l.slice(0,eq).trim()]=v; }
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
(async () => {
  const EPISODE = 'f019c29f-5e1e-4964-b62b-6c59fc3aa966';
  const { data: jobs } = await sb.from('jobs').select('id,agent_id,status,started_at,completed_at,error').eq('episode_id', EPISODE).order('started_at', { ascending: false }).limit(40);
  console.log('=== Jobs for SS-S15-E01 (last 40) ===');
  for (const j of jobs ?? []) {
    console.log(`  ${j.started_at}  ${(j.status as string).padEnd(10)} ${(j.agent_id as string).padEnd(25)} ${j.error ? '[ERR: '+String(j.error).slice(0,60)+']' : ''}`);
  }
  console.log('\n=== Designer-specific jobs ===');
  const { data: dj } = await sb.from('jobs').select('id,agent_id,status,started_at,error').eq('episode_id', EPISODE).eq('agent_id', 'EXEC-EREF-DESIGNER');
  for (const j of dj ?? []) {
    console.log(`  ${j.started_at}  ${(j.status as string).padEnd(10)} ${j.id}`);
  }
  process.exit(0);
})();
