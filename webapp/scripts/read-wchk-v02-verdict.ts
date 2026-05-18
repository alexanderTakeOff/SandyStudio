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
  const { data: a } = await sb
    .from('assets')
    .select('id,filename,status,metadata,content')
    .eq('id', '66bc7393-6fc9-42bc-8e1b-6ec96f874a94')
    .maybeSingle();
  console.log('=== file ===', (a as { filename?: string } | null)?.filename, 'status:', (a as { status?: string } | null)?.status);
  console.log('\n=== metadata ===');
  console.log(JSON.stringify((a as { metadata?: unknown } | null)?.metadata, null, 2));
  console.log('\n=== content (first 2500 chars) ===');
  console.log(((a as { content?: string } | null)?.content ?? '').slice(0, 2500));
})();
