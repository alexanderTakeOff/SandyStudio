// Quick probe to find latest E21 STB id + status for σ.1 γ-validation flip.
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
(async () => {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await sb.from('assets').select('id,filename,version,status,created_at,metadata')
    .eq('episode_id', '21f7bd6a-f52c-4ae0-bd47-06ff328ec6e7')
    .like('file_type', 'STB-storyboard%')
    .order('version', { ascending: false })
    .limit(3);
  console.log(JSON.stringify(data, null, 2));
})();
