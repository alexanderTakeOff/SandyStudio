// Print the approval_revision activity_event for the E21 script — contains
// the full revisionNote Polina sent to the Writer.
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
const ASSET = 'a383406c-ba55-4069-b921-66c1df8ec277';
(async () => {
  const { data } = await sb
    .from('activity_events')
    .select('event_type,title,description,metadata,created_at')
    .eq('asset_id', ASSET)
    .eq('event_type', 'approval_revision')
    .order('created_at', { ascending: false })
    .limit(1);
  console.log(JSON.stringify(data?.[0], null, 2));
})();
