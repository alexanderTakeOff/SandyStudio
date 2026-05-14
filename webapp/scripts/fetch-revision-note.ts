// Print the full requestRevision note that Polina just sent — head was
// truncated in the watcher dump. Useful to confirm the note is concrete
// (per technology.md §3.5 hard checks) before Writer v02 lands.
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
const TURN = 'e0a52e3e-9e7a-4814-b3c0-d0de53badf12';
(async () => {
  const { data } = await sb.from('concierge_turns').select('content,metadata').eq('id', TURN).maybeSingle();
  console.log(data?.content);
})();
