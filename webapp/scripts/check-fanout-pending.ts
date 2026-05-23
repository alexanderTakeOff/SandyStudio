import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) for (const raw of readFileSync(envPath, 'utf-8').split('\n')) { const l=raw.trim(); if (!l||l.startsWith('#')) continue; const eq=l.indexOf('='); if (eq<=0) continue; let v=l.slice(eq+1).trim(); if ((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1); process.env[l.slice(0,eq).trim()]=v; }
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
(async () => {
  // episodes.metadata carries the pending list (not REV-world_check asset)
  const { data: ep } = await sb
    .from('episodes')
    .select('id,episode_code,metadata')
    .eq('id', 'f019c29f-5e1e-4964-b62b-6c59fc3aa966')
    .maybeSingle();
  if (!ep) { console.log('Episode not found'); process.exit(0); }
  const r = ep as { id: string; episode_code: string; metadata: Record<string, unknown> | null };
  const meta = (r.metadata ?? {}) as Record<string, unknown>;
  const pending = (meta.designer_fanout_pending as string[] | undefined) ?? [];
  const pilots = meta.designer_pilot_count;
  const total = meta.designer_fanout_total;
  console.log(`Episode ${r.id} (${r.episode_code})`);
  console.log(`  designer_pilot_count: ${pilots}`);
  console.log(`  designer_fanout_total: ${total}`);
  console.log(`  designer_fanout_pending (${pending.length}):`);
  for (const shotId of pending) console.log(`    - ${shotId}`);

  // Current Plan + IMG counts
  const { count: planTotal } = await sb.from('assets').select('id',{count:'exact',head:true}).eq('episode_id','f019c29f-5e1e-4964-b62b-6c59fc3aa966').like('file_type','SPC-ref_plan%');
  const { count: planApproved } = await sb.from('assets').select('id',{count:'exact',head:true}).eq('episode_id','f019c29f-5e1e-4964-b62b-6c59fc3aa966').like('file_type','SPC-ref_plan%').eq('status','APPROVED');
  const { count: imgTotal } = await sb.from('assets').select('id',{count:'exact',head:true}).eq('episode_id','f019c29f-5e1e-4964-b62b-6c59fc3aa966').like('file_type','IMG-episode_ref%').neq('status','INVALIDATED');
  const { count: imgApproved } = await sb.from('assets').select('id',{count:'exact',head:true}).eq('episode_id','f019c29f-5e1e-4964-b62b-6c59fc3aa966').like('file_type','IMG-episode_ref%').eq('status','APPROVED');
  console.log(`\nCounts (ex-INVALIDATED):`);
  console.log(`  SPC-ref_plan:    ${planTotal} total, ${planApproved} APPROVED`);
  console.log(`  IMG-episode_ref: ${imgTotal} total, ${imgApproved} APPROVED`);
  process.exit(0);
})();
