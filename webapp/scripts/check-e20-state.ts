// One-off: dump activity around E20 storyboard v02 + episode current state.
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
    let val = line.slice(eq+1).trim();
    if ((val.startsWith('"')&&val.endsWith('"'))||(val.startsWith("'")&&val.endsWith("'"))) val=val.slice(1,-1);
    process.env[line.slice(0,eq).trim()] = val;
  }
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const EP = '763c5c1e-44dc-4e10-92fb-e7671e5d4a44';
const ASSET = 'a8f1eed9-0d8e-44c9-a270-d487a8c2898e';

async function main() {
const { data: events } = await sb
  .from('activity_events')
  .select('created_at,event_type,severity,title,actor,asset_id,metadata')
  .eq('episode_id', EP)
  .gte('created_at', '2026-05-12T21:00:00Z')
  .order('created_at', { ascending: false })
  .limit(25);
console.log('--- recent activity_events (since 21:00 UTC) ---');
for (const e of events ?? []) {
  console.log(`${e.created_at.slice(11,19)} [${e.severity}] ${e.event_type} · ${e.actor ?? '-'} · ${e.title}`);
}

const { data: jobs } = await sb
  .from('jobs')
  .select('agent_id,status,started_at,completed_at,inngest_event')
  .eq('episode_id', EP)
  .order('started_at', { ascending: false })
  .limit(25);
console.log('\n--- ALL jobs for E20 ---');
for (const j of jobs ?? []) {
  console.log(`${(j.started_at ?? '').slice(11,19)} ${j.status.padEnd(10)} ${j.agent_id} ← ${j.inngest_event}`);
}

const { data: asset } = await sb.from('assets').select('id,filename,status,version,updated_at').eq('id', ASSET).maybeSingle();
console.log('\n--- target asset ---');
console.log(asset);

const { data: approvals } = await sb.from('approvals').select('approved_by,approval_type,created_at,notes').eq('asset_id', ASSET).order('created_at', { ascending: false });
console.log('\n--- approvals ---');
console.log(approvals);

const { data: erefs } = await sb
  .from('assets')
  .select('id,filename,status,version,created_at,metadata')
  .eq('episode_id', EP)
  .like('file_type', 'IMG-episode_ref%')
  .order('created_at', { ascending: true });
console.log(`\n--- IMG-episode_ref assets (${erefs?.length ?? 0}) ---`);
for (const e of erefs ?? []) {
  const m = e.metadata as Record<string, unknown> | null;
  const sr = m?.shot_reference as Record<string, unknown> | undefined;
  console.log(`\n${e.created_at.slice(11,19)} ${e.status.padEnd(9)} v${e.version} shot=${sr?.shot_id}`);
  console.log('  shot_role:', sr?.shot_role);
  const imgPrompt = (m?.image_prompt as string | undefined) ?? '';
  console.log('  image_prompt (first 700):');
  console.log('   ', imgPrompt.slice(0,700).replace(/\n/g,'\n    '));
}
}
main().catch(e => { console.error(e); process.exit(1); });
