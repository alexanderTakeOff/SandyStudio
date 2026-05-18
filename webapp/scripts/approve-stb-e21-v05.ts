// ──────────────────────────────────────────────────────────────────────────────
// scripts/approve-stb-e21-v05.ts
//
// Sprint φ smoke — approve E21 STB v05 produced by the new two-call skill
// pattern (storyboarder-situational-comedy playbook landed; Polina reviewed
// and recommended approve 2026-05-16 08:05 UTC). Drives the pipeline forward:
//
//   1. Verify v05 status = REVIEW
//   2. Insert approvals row (DIRECTOR, APPROVE)
//   3. UPDATE assets SET status = APPROVED
//   4. INSERT activity_events approval_granted
//   5. PUBLISH sandystudio/exec-wchk/check-world for v05
//
// Idempotency: re-running is safe (priorApproval check + status guard).
// Default DRY-RUN. Pass --write to apply.
// ──────────────────────────────────────────────────────────────────────────────

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
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

const E21_EPISODE_ID = '21f7bd6a-f52c-4ae0-bd47-06ff328ec6e7';
const TARGET_ASSET_ID = '97a483b7-19b6-4bb0-b59b-6af6f095d768'; // STB v05 REVIEW
const APPROVAL_NOTE =
  'Director approve via Sprint φ smoke — Storyboarder ran with new two-call skill activation pattern (storyboarder-situational-comedy playbook). Polina reviewed and recommended approval 2026-05-16 08:05 UTC: 22 shots / 3 acts / 60s, action_prose + expected_gag + camera_motivation populated, mandatory beats (pull-up micro-beat, jump-rope tangle, water bottle topple) incorporated.';
const INNGEST_DEV_URL = process.env.INNGEST_DEV_URL ?? 'http://localhost:8288';

async function main() {
  const writeMode = process.argv.includes('--write');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE creds.');
    process.exit(2);
  }
  const sb = createClient(url, key);

  console.log(`Loading asset ${TARGET_ASSET_ID}…`);
  const { data: asset, error: aerr } = await sb
    .from('assets')
    .select('id,filename,file_type,status,episode_id,updated_at')
    .eq('id', TARGET_ASSET_ID)
    .maybeSingle();
  if (aerr || !asset) {
    console.error('Asset fetch failed:', aerr?.message);
    process.exit(2);
  }
  console.log(`  ${asset.filename} (status=${asset.status}, type=${asset.file_type})`);

  if (asset.status === 'APPROVED') {
    console.log('Asset already APPROVED — idempotent no-op.');
    return;
  }
  if (asset.status !== 'REVIEW') {
    console.error(`Cannot approve — status is ${asset.status} (must be REVIEW).`);
    process.exit(2);
  }

  const { data: priorApproval } = await sb
    .from('approvals')
    .select('id')
    .eq('asset_id', TARGET_ASSET_ID)
    .eq('approved_by', 'DIRECTOR')
    .maybeSingle();
  if (priorApproval) {
    console.log('Prior approval row exists — skipping insert. Status flip + chain fire only.');
  }

  if (!writeMode) {
    console.log('--- DRY RUN ---');
    console.log('Would:');
    console.log('  1. INSERT approvals (DIRECTOR, APPROVE)');
    console.log('  2. UPDATE assets SET status=APPROVED');
    console.log('  3. INSERT activity_events approval_granted');
    console.log('  4. PUBLISH sandystudio/exec-wchk/check-world');
    console.log('Pass --write to apply.');
    return;
  }

  if (!priorApproval) {
    console.log('Inserting approvals row…');
    const { error: apErr } = await sb.from('approvals').insert({
      asset_id: TARGET_ASSET_ID,
      episode_id: E21_EPISODE_ID,
      approved_by: 'DIRECTOR',
      approval_type: 'APPROVE',
      notes: APPROVAL_NOTE,
    } as never);
    if (apErr) {
      console.error('Approval insert failed:', apErr.message);
      process.exit(2);
    }
  }

  console.log('Updating asset status REVIEW → APPROVED…');
  const { error: upErr } = await sb
    .from('assets')
    .update({ status: 'APPROVED' } as never)
    .eq('id', TARGET_ASSET_ID);
  if (upErr) {
    console.error('Status update failed:', upErr.message);
    process.exit(2);
  }

  console.log('Recording activity_event…');
  await sb.from('activity_events').insert({
    event_type: 'approval_granted',
    severity: 'info',
    title: `APPROVE on ${asset.filename}`,
    description: APPROVAL_NOTE,
    actor: 'DIRECTOR',
    asset_id: TARGET_ASSET_ID,
    episode_id: E21_EPISODE_ID,
    metadata: {
      decision: 'APPROVE',
      file_type: asset.file_type,
      route: 'one-off-script',
      sprint: 'phi-smoke',
    },
  } as never);

  console.log(`Publishing sandystudio/exec-wchk/check-world → ${INNGEST_DEV_URL}/e/devkey…`);
  const res = await fetch(`${INNGEST_DEV_URL}/e/devkey`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'sandystudio/exec-wchk/check-world',
      data: { episodeId: E21_EPISODE_ID, storyboardAssetIds: [TARGET_ASSET_ID] },
    }),
  });
  console.log(`  Inngest response: HTTP ${res.status}`);
  const body = await res.text();
  console.log(`  ${body.slice(0, 300)}`);

  console.log('\nDone. Script Supervisor (EXEC-WCHK) should pick up within ~1s.');
  console.log('Next: check WCHK output then decide on EREF full re-run from v05.');
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
