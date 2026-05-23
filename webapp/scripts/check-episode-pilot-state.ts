import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) for (const raw of readFileSync(envPath, 'utf-8').split('\n')) { const l=raw.trim(); if (!l||l.startsWith('#')) continue; const eq=l.indexOf('='); if (eq<=0) continue; let v=l.slice(eq+1).trim(); if ((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1); process.env[l.slice(0,eq).trim()]=v; }
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
(async () => {
  const { data } = await sb.from('episodes').select('id,episode_code,metadata').eq('id','f019c29f-5e1e-4964-b62b-6c59fc3aa966').maybeSingle();
  const m = (data?.metadata ?? {}) as Record<string, unknown>;
  console.log('episode_code:', (data as any)?.episode_code);
  console.log('eref_pilot_state:', m.eref_pilot_state);
  console.log('eref_pilot_shot_ids:', JSON.stringify(m.eref_pilot_shot_ids));
  console.log('designer_pilot_count:', m.designer_pilot_count);
  console.log('designer_fanout_pending count:', (m.designer_fanout_pending as string[] | undefined)?.length);
  console.log('all metadata keys:', Object.keys(m).join(', '));
  process.exit(0);
})();
