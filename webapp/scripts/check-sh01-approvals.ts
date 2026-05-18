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
  // sh01 v4 asset id
  const { data: ast } = await sb.from('assets').select('id,filename,status,revision_log').like('filename', '%a1_sc01_sh01%').eq('status', 'REVIEW').limit(2);
  console.log('sh01 REVIEW assets:', JSON.stringify(ast, null, 2));
  for (const a of ast ?? []) {
    const { data: apps } = await sb.from('approvals').select('*').eq('asset_id', a.id).order('created_at', { ascending: false }).limit(5);
    console.log(`\napprovals for ${a.id}:`, JSON.stringify(apps, null, 2));
  }
})();
