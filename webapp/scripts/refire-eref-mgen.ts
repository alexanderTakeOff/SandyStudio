// One-off: cancel stale jobs + re-fire EREF + MGEN events for E20.
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

const EP = '763c5c1e-44dc-4e10-92fb-e7671e5d4a44';
const STB_ID = 'a8f1eed9-0d8e-44c9-a270-d487a8c2898e';
const INNGEST = process.env.INNGEST_DEV_URL ?? 'http://localhost:8288';

async function main() {
  const write = process.argv.includes('--write');
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Stale jobs from the 18:27 burst — EREF zombie + MGEN failed.
  const { data: stale } = await sb
    .from('jobs')
    .select('id,agent_id,status,started_at')
    .eq('episode_id', EP)
    .in('agent_id', ['EXEC-EREF', 'EXEC-MGEN'])
    .lt('started_at', '2026-05-12T22:00:00Z')
    .order('started_at', { ascending: false })
    .limit(5);

  console.log('Stale jobs to mark CANCELLED:');
  for (const j of stale ?? []) console.log(`  ${j.id.slice(0, 8)} ${j.agent_id} ${j.status} @ ${j.started_at}`);

  if (!write) {
    console.log('--- DRY RUN — pass --write to apply ---');
    console.log('Will: mark stale jobs CANCELLED, publish new EREF + MGEN events.');
    return;
  }

  for (const j of stale ?? []) {
    if (j.status === 'RUNNING' || j.status === 'FAILED' || j.status === 'QUEUED') {
      await sb.from('jobs').update({
        status: 'CANCELLED',
        completed_at: new Date().toISOString(),
        last_error: 'Cancelled during 2026-05-12 22:30 UTC pipeline recovery (zombie/gate-failed job — gate.ts MGEN dependency fixed in same session).',
      } as never).eq('id', j.id);
      console.log(`  marked ${j.id.slice(0, 8)} CANCELLED`);
    }
  }

  console.log('\nPublishing sandystudio/exec-eref/generate-references…');
  const erefRes = await fetch(`${INNGEST}/e/devkey`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'sandystudio/exec-eref/generate-references',
      data: { episodeId: EP, storyboardAssetId: STB_ID },
    }),
  });
  console.log(`  HTTP ${erefRes.status}`);

  console.log('Publishing sandystudio/exec-mgen/generate-music…');
  const mgenRes = await fetch(`${INNGEST}/e/devkey`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'sandystudio/exec-mgen/generate-music',
      data: { episodeId: EP, animaticAssetId: '', section: 'main' },
    }),
  });
  console.log(`  HTTP ${mgenRes.status}`);

  console.log('\nDone. Both events published; agents should kick off within ~1s.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
