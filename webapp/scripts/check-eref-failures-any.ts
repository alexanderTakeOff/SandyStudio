import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) for (const raw of readFileSync(envPath, 'utf-8').split('\n')) { const l=raw.trim(); if (!l||l.startsWith('#')) continue; const eq=l.indexOf('='); if (eq<=0) continue; let v=l.slice(eq+1).trim(); if ((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1); process.env[l.slice(0,eq).trim()]=v; }
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
(async () => {
  const { data } = await sb
    .from('activity_events')
    .select('created_at,event_type,actor,title,description,metadata')
    .eq('event_type', 'agent_failed')
    .gte('created_at', '2026-05-20T15:06:00Z')
    .order('created_at', { ascending: false })
    .limit(20);
  for (const r of data ?? []) {
    console.log(`\n[${r.created_at}] actor=${r.actor}`);
    console.log(`  title: ${r.title}`);
    console.log(`  desc:  ${(r.description as string) ?? '-'}`);
    const m = r.metadata as Record<string, unknown> | null;
    if (m) console.log(`  meta:  ${JSON.stringify(m).slice(0, 400)}`);
  }
  process.exit(0);
})();
