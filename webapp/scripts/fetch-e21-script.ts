// Pull the latest E21 script asset + diff-friendly v01 vs v02 stats.
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
  const { data } = await sb
    .from('assets')
    .select('id,filename,status,version,content,created_at')
    .eq('episode_id', EP)
    .like('file_type', 'SCR-script%')
    .order('version', { ascending: false })
    .limit(3);
  for (const a of data ?? []) {
    const cl = (a.content ?? '').length;
    console.log(`v${a.version} ${a.status} ${a.filename} (${cl} chars, ${a.created_at?.slice(11, 19)})`);
  }
  const latest = data?.[0];
  if (latest) {
    console.log('\n========== LATEST SCRIPT v' + latest.version + ' ==========');
    console.log(latest.content ?? '(empty content)');
  }
})();
