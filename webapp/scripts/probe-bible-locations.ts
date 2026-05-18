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
(async () => {
  const { data: locs } = await sb.from('assets').select('id,file_type,filename,status,series_id').like('file_type', 'SBL-location_%').order('file_type');
  console.log(`Bible location entries total: ${locs?.length ?? 0}`);
  const byStatus: Record<string, number> = {};
  for (const l of locs ?? []) { byStatus[l.status] = (byStatus[l.status] ?? 0) + 1; }
  console.log('by status:', byStatus);
  console.log('\nAll location entries (any status):');
  for (const l of locs ?? []) console.log(`  [${l.status.padEnd(10)}] ${l.file_type.padEnd(40)} ${l.filename?.slice(0, 70)}`);
})();
