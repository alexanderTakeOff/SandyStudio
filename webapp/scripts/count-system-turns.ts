// Count system turns + dump newest 5 claude_message ids — diagnose why
// the panel's limit(30) might be cutting my recent posts.
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
const THREAD = 'bdbdafcf-2a38-4c58-b706-362fd7ff0f16';
(async () => {
  const { count: total } = await sb.from('concierge_turns').select('id', { count: 'exact', head: true }).eq('thread_id', THREAD);
  const { count: sysCount } = await sb.from('concierge_turns').select('id', { count: 'exact', head: true }).eq('thread_id', THREAD).eq('role', 'system');
  console.log(`thread ${THREAD}: total turns=${total}, system role=${sysCount}`);
  const { data: cm } = await sb.from('concierge_turns').select('id,created_at,metadata').eq('thread_id', THREAD).eq('role', 'system').order('created_at', { ascending: false }).limit(40);
  let cmCount = 0;
  let peCount = 0;
  const within30 = (cm ?? []).slice(0, 30);
  for (const t of within30) {
    const k = (t.metadata as { kind?: string } | null)?.kind;
    if (k === 'claude_message') cmCount++;
    if (k === 'pipeline_event') peCount++;
  }
  console.log(`Top 30 system turns: claude_message=${cmCount}, pipeline_event=${peCount}`);
  console.log(`\nNewest 10 system turns:`);
  for (const t of (cm ?? []).slice(0, 10)) {
    const k = (t.metadata as { kind?: string } | null)?.kind ?? '-';
    console.log(`  ${t.created_at.slice(11, 19)} kind=${k.padEnd(16)} id=${t.id}`);
  }
})();
