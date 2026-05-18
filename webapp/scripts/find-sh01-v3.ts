// Find SH01 v3 (REVIEW) asset id so Director can target the approve action precisely.
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
  const { data } = await sb.from('assets')
    .select('id,filename,version,status,created_at,metadata')
    .eq('episode_id', EP)
    .like('file_type', 'IMG-episode_ref%')
    .order('created_at', { ascending: false });
  for (const a of data ?? []) {
    const sid = ((a.metadata as { shot_reference?: { shot_id?: string } } | null)?.shot_reference?.shot_id) ?? '?';
    console.log(`${a.id}  v${a.version}  ${a.status.padEnd(10)}  ${sid}  ${a.filename?.slice(0, 60)}`);
  }
})();
