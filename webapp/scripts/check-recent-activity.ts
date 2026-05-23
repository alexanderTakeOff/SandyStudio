import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) for (const raw of readFileSync(envPath, 'utf-8').split('\n')) { const l=raw.trim(); if (!l||l.startsWith('#')) continue; const eq=l.indexOf('='); if (eq<=0) continue; let v=l.slice(eq+1).trim(); if ((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1); process.env[l.slice(0,eq).trim()]=v; }
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const since = process.argv[2] ?? '2026-05-21T00:00:00Z';
const limit = Number(process.argv[3] ?? 25);
(async () => {
  const { data } = await sb.from('activity_events').select('created_at,event_type,actor,asset_id,title,description').gte('created_at', since).order('created_at', { ascending: false }).limit(limit);
  for (const r of data ?? []) {
    console.log(`[${r.created_at}] ${(r.event_type as string).padEnd(20)} ${((r.actor as string) ?? '-').padEnd(28)} a:${((r.asset_id as string | null) ?? '-').slice(0, 8)} | ${String(r.title ?? '').slice(0, 75)}`);
    if (r.description) console.log(`     desc: ${String(r.description).slice(0, 130)}`);
  }
  process.exit(0);
})();
