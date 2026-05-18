// Quick read of latest turns in the active PA thread.
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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[line.slice(0, eq).trim()] = val;
  }
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const THREAD = process.argv[2] ?? 'bdbdafcf-2a38-4c58-b706-362fd7ff0f16';
const LIMIT = Number(process.argv[3] ?? 12);

(async () => {
  const { data } = await sb
    .from('concierge_turns')
    .select('id,role,event_type,content,metadata,created_at')
    .eq('thread_id', THREAD)
    .order('created_at', { ascending: false })
    .limit(LIMIT);
  for (const t of (data ?? []).reverse()) {
    const m = (t.metadata ?? {}) as Record<string, unknown>;
    const kind = (m.kind ?? '-') as string;
    const head = String(t.content).slice(0, 160).replace(/\n/g, ' ');
    console.log(`${t.created_at.slice(11, 19)} [${t.role.padEnd(9)} ${kind.padEnd(16)}] ${head}`);
  }
})();
