// Diagnose Realtime publication + RLS on activity_events.
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

async function main() {
  // 1. Publication membership
  const pubRes = await sb.rpc('debug_check_realtime' as never, {} as never);
  console.log('rpc:', pubRes);

  // Alternative: direct select via PostgREST. Supabase exposes nothing for this — use raw if possible.
  // Use a workaround: try selecting from activity_events with anon key vs service to see RLS gap.
  console.log('\n=== Anon-key SELECT test ===');
  const anonSb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: anonRow, error: anonErr } = await anonSb
    .from('activity_events')
    .select('id,title,created_at')
    .order('created_at', { ascending: false })
    .limit(1);
  if (anonErr) {
    console.log('ANON SELECT err:', anonErr.message, '(RLS would silently block Realtime too)');
  } else {
    console.log(`ANON SELECT ok — returned ${anonRow?.length ?? 0} rows. Sample:`, anonRow?.[0]);
  }

  console.log('\n=== Service-role SELECT test ===');
  const { data: svcRow, error: svcErr } = await sb
    .from('activity_events')
    .select('id,title,created_at')
    .order('created_at', { ascending: false })
    .limit(1);
  if (svcErr) console.log('SVC err:', svcErr.message);
  else console.log(`SVC ok — returned ${svcRow?.length ?? 0} rows. Sample:`, svcRow?.[0]);
}
main().catch((e) => { console.error(e); process.exit(1); });
