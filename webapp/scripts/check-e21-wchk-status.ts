// Poll WCHK status for E21 v05.
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
  const { data: jobs } = await sb
    .from('jobs')
    .select('id,status,started_at,completed_at,error_message,inngest_event,output_ref')
    .eq('episode_id', EP)
    .eq('agent_id', 'EXEC-WCHK')
    .order('created_at', { ascending: false })
    .limit(3);
  console.log('=== EXEC-WCHK jobs (last 3) ===');
  for (const j of jobs ?? []) {
    console.log(`${j.started_at?.slice(11, 19) ?? '?'} ${(j.status as string).padEnd(10)} event=${j.inngest_event} output=${j.output_ref}`);
    if (j.error_message) console.log(`  error: ${j.error_message}`);
  }
  // Latest WCHK output asset
  const { data: reviews } = await sb
    .from('assets')
    .select('id,filename,status,created_at')
    .eq('episode_id', EP)
    .like('file_type', 'REV-%')
    .order('created_at', { ascending: false })
    .limit(3);
  console.log('\n=== Latest REV-* assets ===');
  for (const r of reviews ?? []) {
    console.log(`${r.created_at?.slice(11, 19) ?? '?'} ${r.status.padEnd(10)} ${r.filename}`);
  }
})();
