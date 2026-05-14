// Inspect supabase_realtime publication membership. The watcher saw the row
// (polling DB) but the live Realtime subscription got 0 events — strongly
// suggests concierge_turns isn't in the publication despite migration 0030.
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
  // Use rpc with an anonymous SQL via supabase-js — not directly supported.
  // Instead poll pg_publication_tables via PostgREST is also not exposed.
  // Try the Realtime broadcast trick: subscribe to ALL tables and see if
  // any row makes it through. Or — simpler — use the Supabase Management API.
  // But we have CLI linked. Let me use psql via supabase CLI.
  // Actually simplest: query the pg_publication_tables relation by using
  // PostgREST's RPC … no, not exposed. Use supabase-js raw query? No.
  //
  // FALLBACK: just attempt to add the table via service-role RPC. Postgres
  // ALTER PUBLICATION is a SUPER user op — service-role doesn't have super.
  //
  // The clean path: re-run the migration block. Use the Supabase CLI from
  // outside this script (next bash command).
  console.log('Use `npx supabase db push` if migration 0030 not applied — already applied per `migration list`.');
  console.log('Inspect with: npx supabase db dump --schema public --data-only=false | findstr publication');
})();
