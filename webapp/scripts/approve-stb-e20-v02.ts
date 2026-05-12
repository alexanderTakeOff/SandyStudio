// ──────────────────────────────────────────────────────────────────────────────
// scripts/approve-stb-e20-v02.ts
//
// One-off Director-requested approve (2026-05-12 evening):
// Approve SS-S14-E20-STB-storyboard-v02-DRAFT after surgical camera patch.
// Drives the pipeline forward without going through the webapp route (which
// needs a session cookie we don't have here).
//
// Replicates the approve route's core 4 steps:
//   1. assert REVIEW → APPROVED transition
//   2. insert approval audit row (approved_by=DIRECTOR, type=APPROVE)
//   3. update asset.status = APPROVED
//   4. insert activity_event approval_granted
//   5. publish next Inngest event — STB-* approved → EXEC-WCHK check-world
//
// Idempotency: if approvals row exists OR status already APPROVED → exit 0
// without firing. Safe to re-run.
//
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

const E20_EPISODE_ID = '763c5c1e-44dc-4e10-92fb-e7671e5d4a44';
const TARGET_ASSET_ID = 'a8f1eed9-0d8e-44c9-a270-d487a8c2898e'; // STB v02 from patch script run
const APPROVAL_NOTE =
  'Approved by Director after surgical camera patch (19 shots, camera_movement + camera_motivation added). Storyboard production-usable.';
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

  // Idempotency: prior approval row?
  const { data: priorApproval } = await sb
    .from('approvals')
    .select('id')
    .eq('asset_id', TARGET_ASSET_ID)
    .eq('approved_by', 'DIRECTOR')
    .maybeSingle();
  if (priorApproval) {
    console.log('Prior approval row exists — skipping insert. Status still REVIEW though, will flip.');
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
      episode_id: E20_EPISODE_ID,
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
    episode_id: E20_EPISODE_ID,
    metadata: { decision: 'APPROVE', file_type: asset.file_type, route: 'one-off-script' },
  } as never);

  console.log(`Publishing Inngest event sandystudio/exec-wchk/check-world → ${INNGEST_DEV_URL}/e/devkey …`);
  const res = await fetch(`${INNGEST_DEV_URL}/e/devkey`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'sandystudio/exec-wchk/check-world',
      data: { episodeId: E20_EPISODE_ID, storyboardAssetIds: [TARGET_ASSET_ID] },
    }),
  });
  console.log(`  Inngest response: HTTP ${res.status}`);
  const body = await res.text();
  console.log(`  ${body.slice(0, 300)}`);

  console.log('Done. EXEC-WCHK (Continuity Supervisor) should pick up the event within ~1s.');
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
