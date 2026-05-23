// Inspect agent_failed metadata for EXEC-EREF-DESIGNER cascade.
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
  console.log('\n=== Recent EXEC-EREF-DESIGNER agent_failed events with metadata ===\n');
  const { data, error } = await sb
    .from('activity_events')
    .select('created_at,event_type,actor,title,description,metadata')
    .eq('actor', 'EXEC-EREF-DESIGNER')
    .eq('event_type', 'agent_failed')
    .order('created_at', { ascending: false })
    .limit(8);
  if (error) { console.error(error); process.exit(1); }
  for (const r of data ?? []) {
    console.log(`[${r.created_at}] ${r.title}`);
    console.log(`  desc: ${(r.description as string | null) ?? '-'}`);
    console.log(`  meta: ${JSON.stringify(r.metadata).slice(0, 400)}`);
    console.log();
  }

  console.log('\n=== Recent manual_trigger events (last 5) ===\n');
  const { data: mt } = await sb
    .from('activity_events')
    .select('created_at,actor,title,description,metadata')
    .eq('event_type', 'manual_trigger')
    .order('created_at', { ascending: false })
    .limit(5);
  for (const r of mt ?? []) {
    console.log(`[${r.created_at}] ${r.title}`);
    console.log(`  actor (user): ${r.actor}`);
    console.log(`  meta: ${JSON.stringify(r.metadata).slice(0, 300)}`);
    console.log();
  }

  process.exit(0);
})();
