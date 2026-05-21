// Read recent Polina assistant turns in full (not truncated).
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
const LIMIT = Number(process.argv[2] ?? 10);

(async () => {
  const { data, error } = await sb
    .from('concierge_turns')
    .select('created_at,role,content,metadata')
    .in('role', ['assistant', 'director', 'user'])
    .order('created_at', { ascending: false })
    .limit(LIMIT);
  if (error) { console.error(error); process.exit(1); }
  // Print oldest first so the thread reads naturally
  const ordered = (data ?? []).slice().reverse();
  for (const r of ordered) {
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    const auto = meta.auto_react ? ' [AUTO_REACT]' : '';
    const role = String(r.role).toUpperCase().padEnd(9);
    console.log(`\n──────[${r.created_at}] ${role}${auto}──────`);
    console.log(String(r.content ?? ''));
  }
  process.exit(0);
})();
