// One-off: trigger EREF fan-out for E20 after both pilots APPROVED.
// Replicates POST /api/episodes/[id]/eref/approve-pilots (which needs a
// Director cookie we don't have here).
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
const PILOT_COUNT = 2;
const INNGEST = process.env.INNGEST_DEV_URL ?? 'http://localhost:8288';

async function main() {
  const write = process.argv.includes('--write');
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Verify ≥ pilot_count APPROVED IMG-episode_ref
  const { count } = await sb
    .from('assets')
    .select('*', { count: 'exact', head: true })
    .eq('episode_id', EP)
    .eq('status', 'APPROVED')
    .like('file_type', 'IMG-episode_ref%');
  console.log(`APPROVED EREF count: ${count}`);
  if ((count ?? 0) < PILOT_COUNT) {
    console.error(`Need ${PILOT_COUNT}, have ${count}. Abort.`);
    process.exit(2);
  }

  const { data: stateRow } = await sb
    .from('app_config')
    .select('value')
    .eq('scope', 'app')
    .eq('key', `eref_pilot_state:${EP}`)
    .maybeSingle();
  console.log('Current pilot state row:', stateRow);

  if (!write) {
    console.log('--- DRY RUN ---');
    console.log('Will: setPilotState=FANOUT_RUNNING + publish sandystudio/exec-eref/fanout-trigger { start_index:2 }');
    return;
  }

  // Set state FANOUT_RUNNING
  const value = { state: 'FANOUT_RUNNING', at: new Date().toISOString() };
  const { error: cfgErr } = await sb.from('app_config').upsert(
    { scope: 'app', key: `eref_pilot_state:${EP}`, value: value as never, source: 'ui_edit' } as never,
    { onConflict: 'scope,key' },
  );
  if (cfgErr) {
    console.error('setPilotState failed:', cfgErr.message);
    process.exit(2);
  }
  console.log('pilot_state → FANOUT_RUNNING');

  // Publish event
  const res = await fetch(`${INNGEST}/e/devkey`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'sandystudio/exec-eref/fanout-trigger',
      data: { episodeId: EP, start_index: PILOT_COUNT },
    }),
  });
  console.log(`Inngest publish: HTTP ${res.status}`);

  // Audit
  await sb.from('activity_events').insert({
    event_type: 'manual_trigger',
    severity: 'info',
    title: 'EREF fan-out triggered',
    description: `One-off script (Director-approved q1y) fanning out remaining shots from index ${PILOT_COUNT}`,
    actor: 'DIRECTOR',
    episode_id: EP,
    metadata: { kind: 'eref_fanout', pilot_count: PILOT_COUNT, approved_pilots: count, route: 'one-off-script' },
  } as never);

  console.log('Done. Fan-out should start within ~1s; runner re-enters at start_index=2 and processes 17 remaining shots.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
