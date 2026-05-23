// Read the content of the 2 SPC-ref_plan assets so Theo can review.
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) for (const raw of readFileSync(envPath, 'utf-8').split('\n')) { const l=raw.trim(); if (!l||l.startsWith('#')) continue; const eq=l.indexOf('='); if (eq<=0) continue; let v=l.slice(eq+1).trim(); if ((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1); process.env[l.slice(0,eq).trim()]=v; }
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
(async () => {
  const { data, error } = await sb
    .from('assets')
    .select('id,filename,status,file_type,content,metadata,created_at')
    .like('filename', 'SS-S15-E01-SPC-ref_plan-%')
    .order('created_at', { ascending: true });
  if (error) { console.error(error); process.exit(1); }
  for (const r of data ?? []) {
    console.log(`\n${'═'.repeat(80)}`);
    console.log(`  ${r.filename}`);
    console.log(`  id=${r.id}  status=${r.status}  created=${r.created_at}`);
    console.log(`  file_type=${r.file_type}`);
    const meta = r.metadata as Record<string, unknown> | null;
    if (meta) console.log(`  metadata keys: ${Object.keys(meta).join(', ')}`);
    console.log(`${'═'.repeat(80)}\n`);
    console.log(String(r.content ?? '<NO CONTENT>'));
  }
  process.exit(0);
})();
