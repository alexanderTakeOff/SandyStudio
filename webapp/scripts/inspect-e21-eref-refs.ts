// Inspect all E21 EREF refs with statuses + creation order.
// Goal: distinguish old (v04-era) refs that should be superseded vs new (v05-era).
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
const STB_V05_APPROVED_AT = '2026-05-16T08:11:18';

(async () => {
  const { data: assets } = await sb
    .from('assets')
    .select('id,filename,status,version,created_at,updated_at,file_type')
    .eq('episode_id', EP)
    .like('file_type', 'IMG-episode_ref%')
    .order('created_at', { ascending: true });
  if (!assets) {
    console.log('no assets');
    return;
  }
  const before: typeof assets = [];
  const after: typeof assets = [];
  for (const a of assets) {
    if ((a.created_at as string) < STB_V05_APPROVED_AT) before.push(a);
    else after.push(a);
  }
  console.log(`=== OLD (created before STB v05 approve @ ${STB_V05_APPROVED_AT}) ===`);
  console.log(`Total: ${before.length}`);
  const beforeByStatus: Record<string, number> = {};
  for (const a of before) {
    beforeByStatus[a.status] = (beforeByStatus[a.status] ?? 0) + 1;
    const slug = (a.file_type as string).replace('IMG-episode_ref_', '').slice(0, 50);
    console.log(`  ${a.created_at?.slice(11, 19)} v${a.version} [${(a.status as string).padEnd(8)}] ${slug}`);
  }
  console.log(`by status:`, beforeByStatus);

  console.log(`\n=== NEW (created after STB v05 approve) ===`);
  console.log(`Total: ${after.length}`);
  for (const a of after) {
    const slug = (a.file_type as string).replace('IMG-episode_ref_', '').slice(0, 50);
    console.log(`  ${a.created_at?.slice(11, 19)} v${a.version} [${(a.status as string).padEnd(8)}] ${slug}`);
  }

  // also surface in-flight job
  const { data: jobs } = await sb
    .from('jobs')
    .select('id,status,started_at,completed_at,error_message,inngest_event,output_ref')
    .eq('episode_id', EP)
    .eq('agent_id', 'EXEC-EREF')
    .order('created_at', { ascending: false })
    .limit(3);
  console.log('\n=== Recent EREF jobs ===');
  for (const j of jobs ?? []) {
    console.log(`  ${j.started_at?.slice(11, 19) ?? '?'} ${(j.status as string).padEnd(10)} ${j.inngest_event}`);
    if (j.error_message) console.log(`    err: ${j.error_message}`);
  }
})();
