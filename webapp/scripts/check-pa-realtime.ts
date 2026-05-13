// Diagnostic: are pipeline_event system turns landing in concierge_turns?
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
const THREAD = 'bdbdafcf-2a38-4c58-b706-362fd7ff0f16';

async function main() {
  console.log('=== Ambient pipeline_event turns in concierge_turns (last 60 min) ===');
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data, error } = await sb
    .from('concierge_turns')
    .select('id,role,event_type,content,metadata,created_at')
    .eq('thread_id', THREAD)
    .eq('role', 'system')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) {
    console.error('ERR:', error.message);
    return;
  }
  console.log(`Found ${data?.length ?? 0} system turns`);
  for (const t of data ?? []) {
    const m = t.metadata as { kind?: string; event_type?: string } | null;
    if (m?.kind === 'pipeline_event') {
      console.log(`  ${t.created_at.slice(11, 19)} ${m.event_type ?? '?'} · ${t.content.slice(0, 100)}`);
    }
  }

  console.log('\n=== Recent activity_events (last 30 min, would-be ambient) ===');
  const since30 = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: evts } = await sb
    .from('activity_events')
    .select('id,event_type,actor,title,created_at')
    .eq('episode_id', '763c5c1e-44dc-4e10-92fb-e7671e5d4a44')
    .gte('created_at', since30)
    .in('event_type', ['agent_completed', 'agent_failed', 'approval_granted', 'approval_revision'])
    .order('created_at', { ascending: false })
    .limit(15);
  console.log(`Found ${evts?.length ?? 0} events that SHOULD have arrived as ambient turns`);
  for (const e of evts ?? []) {
    console.log(`  ${e.created_at.slice(11, 19)} ${e.event_type} · ${e.actor ?? '?'} · ${e.title.slice(0, 80)}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
