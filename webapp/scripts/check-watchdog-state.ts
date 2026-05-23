import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) for (const raw of readFileSync(envPath, 'utf-8').split('\n')) { const l=raw.trim(); if (!l||l.startsWith('#')) continue; const eq=l.indexOf('='); if (eq<=0) continue; let v=l.slice(eq+1).trim(); if ((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1); process.env[l.slice(0,eq).trim()]=v; }
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
(async () => {
  const since30 = new Date(Date.now() - 30*60_000).toISOString();
  const { data: esc } = await sb.from('activity_events').select('created_at,title,description').eq('event_type','pa_watchdog_escalation').gte('created_at', since30).order('created_at',{ascending:false}).limit(10);
  console.log('=== Watchdog escalations in last 30 min ===');
  for (const r of esc ?? []) console.log(`  ${r.created_at}  ${String(r.title).slice(0,60)}`);
  if (!esc || esc.length === 0) console.log('  (none yet)');

  console.log('\n=== Recent assistant turns with awaiting_director_input ===');
  const since60 = new Date(Date.now() - 60*60_000).toISOString();
  const { data: turns } = await sb.from('concierge_turns').select('id,thread_id,created_at,content,metadata').eq('role','assistant').gte('created_at', since60).order('created_at',{ascending:false}).limit(10);
  for (const t of turns ?? []) {
    const m = (t.metadata ?? {}) as Record<string,unknown>;
    const aw = m.awaiting_director_input as Record<string,unknown> | undefined;
    const ageMin = Math.round((Date.now() - new Date(t.created_at).getTime())/60000);
    console.log(`  ${t.created_at} (${ageMin}m ago)  awaiting=${aw ? 'YES' : 'no'}  content="${String(t.content).slice(0,60).replace(/\n/g,' ')}"`);
  }
  process.exit(0);
})();
