import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) for (const raw of readFileSync(envPath, 'utf-8').split('\n')) { const l=raw.trim(); if (!l||l.startsWith('#')) continue; const eq=l.indexOf('='); if (eq<=0) continue; let v=l.slice(eq+1).trim(); if ((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1); process.env[l.slice(0,eq).trim()]=v; }
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
(async () => {
  const { data } = await sb.from('assets').select('id,filename,status,metadata').eq('episode_id','f019c29f-5e1e-4964-b62b-6c59fc3aa966').like('file_type','IMG-episode_ref%').eq('status','APPROVED');
  for (const r of data ?? []) {
    console.log('\n───', r.filename);
    console.log('  id:', r.id, 'status:', r.status);
    const m = (r.metadata ?? {}) as Record<string, unknown>;
    console.log('  metadata keys:', Object.keys(m).join(', '));
    console.log('  shot_reference:', JSON.stringify(m.shot_reference ?? null));
    console.log('  provenance:', JSON.stringify(m.provenance ?? null));
  }
  process.exit(0);
})();
