// Post-archive verification: prove E20 is ARCHIVED, metadata.archival has
// the expected payload, 8 jobs are CANCELLED, and the audit event landed.
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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[line.slice(0, eq).trim()] = val;
  }
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const EP = '763c5c1e-44dc-4e10-92fb-e7671e5d4a44';

async function main() {
  const { data: ep } = await sb
    .from('episodes')
    .select('episode_code,title_working,status,metadata,updated_at')
    .eq('id', EP)
    .maybeSingle();
  console.log('=== Episode ===');
  console.log(JSON.stringify(ep, null, 2));

  const { count: stillRunning } = await sb
    .from('jobs')
    .select('id', { count: 'exact', head: true })
    .eq('episode_id', EP)
    .in('status', ['QUEUED', 'RUNNING', 'RETRYING']);
  console.log(`\nstill RUNNING/QUEUED/RETRYING jobs: ${stillRunning ?? '?'}`);

  const { data: ev } = await sb
    .from('activity_events')
    .select('event_type,severity,title,actor,created_at,metadata')
    .eq('episode_id', EP)
    .eq('event_type', 'episode_archived')
    .order('created_at', { ascending: false })
    .limit(1);
  console.log('\n=== Latest episode_archived event ===');
  console.log(JSON.stringify(ev?.[0], null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
