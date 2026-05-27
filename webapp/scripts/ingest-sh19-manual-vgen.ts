// Ingest the manual direct-VGEN MP4 as a canonical VID-shot v03 APPROVED
// asset for SH19. After this:
//   - assets row exists with proper schema (file_type, staging_path, metadata)
//   - staging_path serves at /staging/<canonical_filename>
//   - approvals row records the manual approval
//   - activity_event logs the ingest (Polина sees it)
//   - downstream EXEC-STITCH picks SH19 up as APPROVED, alongside other shots
//
// Source MP4: webapp/public/staging/manual-sh19-direct-vgen-2026-05-27T15-33-02-986Z.mp4
// (the direct fal.ai test that Director approved 2026-05-27.)
//
// Run: cd webapp && npx tsx scripts/ingest-sh19-manual-vgen.ts

import { readFileSync, existsSync, copyFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) {
  for (const raw of readFileSync(envPath, 'utf-8').split('\n')) {
    const l = raw.trim(); if (!l || l.startsWith('#')) continue;
    const eq = l.indexOf('='); if (eq <= 0) continue;
    let v = l.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[l.slice(0, eq).trim()] = v;
  }
}

const U = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const K = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const EPISODE = 'f019c29f-5e1e-4964-b62b-6c59fc3aa966';
const SHOT_ID = 'SS-S15-E01-A2-SC09-SH19';
const SHOT_SLUG = 'ss-s15-e01-a2-sc09-sh19';
const SOURCE_MP4 = 'manual-sh19-direct-vgen-2026-05-27T15-33-02-986Z.mp4';
// Plan whose prompt body Director approved empirically (v09 — REVISE'd by
// Critic on end_image structural ground, but its PROMPT was correct content,
// which is what the manual run used). For audit trail.
const SOURCE_PLAN_ID = 'a08a33f1-259c-4388-abec-74b8216eb907';
const START_REF_ID = 'de322626-70ab-4b0e-bd8c-28257874f6b8'; // SH19 IMG-episode_ref v02
const END_REF_ID = '3f634026-aa7e-4e2f-815d-81fd36206302';   // SH22 IMG-episode_ref v04
const FAL_REQUEST_ID = '019e6a0d-7048-7413-a6e7-e098d0796fff';

async function rest(method: 'GET' | 'POST', path: string, body?: unknown, prefer?: string): Promise<Response> {
  return fetch(`${U}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: K,
      Authorization: `Bearer ${K}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function main(): Promise<void> {
  // 1. Verify source MP4 exists.
  const stagingDir = join(process.cwd(), 'public', 'staging');
  const sourcePath = join(stagingDir, SOURCE_MP4);
  if (!existsSync(sourcePath)) {
    console.error(`Source MP4 missing: ${sourcePath}`);
    process.exit(1);
  }
  const fileBytes = readFileSync(sourcePath);
  console.log(`Source MP4: ${SOURCE_MP4}  (${(fileBytes.length / 1024 / 1024).toFixed(2)} MB)`);

  // 2. Determine next version: query existing VID-shot rows for SH19.
  const existing = await (await rest(
    'GET',
    `assets?episode_id=eq.${EPISODE}&filename=ilike.*VID-shot*${SHOT_SLUG}*&select=version,filename,status&order=version.desc`,
  )).json() as Array<{ version: number; filename: string; status: string }>;
  console.log('\nExisting SH19 VID-shot rows:');
  for (const r of existing) {
    console.log(`  v${String(r.version).padStart(2, '0')} ${r.status} — ${r.filename}`);
  }
  const nextVersion = (existing[0]?.version ?? 0) + 1;
  const versionTag = `v${String(nextVersion).padStart(2, '0')}`;
  const canonicalFilename = `SS-S15-E01-VID-shot-${SHOT_SLUG}-${versionTag}-APPROVED.mp4`;
  const canonicalStagingPath = `/staging/${canonicalFilename}`;
  console.log(`\nNext version: ${versionTag}`);
  console.log(`Canonical filename: ${canonicalFilename}`);

  // 3. Copy MP4 to canonical filename so /staging/<filename> serves it.
  const canonicalDiskPath = join(stagingDir, canonicalFilename);
  copyFileSync(sourcePath, canonicalDiskPath);
  console.log(`Copied to: ${canonicalDiskPath}`);

  // 4. Insert assets row.
  const metadata = {
    shot_id: SHOT_ID,
    plan_asset_id: SOURCE_PLAN_ID,
    model_id: 'bytedance/seedance-2.0/image-to-video',
    provider_id: 'seedance-fal-img2vid',
    provider_used: 'seedance-fal-img2vid',
    quality_tier: 'standard',
    aspect_ratio: '16:9',
    duration_seconds: 5,
    resolution: '720p',
    operation_name: FAL_REQUEST_ID,
    storyboard_asset_id: '524aca99-2269-425b-9fee-46c0fc9cd946',
    reference_eref_asset_id: START_REF_ID,
    end_image_eref_asset_id: END_REF_ID,
    cost_usd: 1.512,
    ingest_source: 'manual-direct-fal-vgen',
    ingest_script: 'scripts/manual-sh19-direct-vgen.ts',
    ingest_date: new Date().toISOString(),
    director_approved: true,
    director_approval_reason:
      'Director directive 2026-05-27: manual two-anchor test (SH19 ref start + SH22 ref end) produced satisfactory result with character canon preserved. Approved as canonical SH19 video.',
  };

  console.log('\nInserting assets row…');
  const insertRes = await rest(
    'POST',
    'assets',
    {
      episode_id: EPISODE,
      agent_id: 'EXEC-VGEN',
      file_type: `VID-shot-${SHOT_SLUG}`,
      filename: canonicalFilename,
      staging_path: canonicalStagingPath,
      status: 'APPROVED',
      version: nextVersion,
      description: `SH19 manual direct-fal-vgen result — two-anchor test (SH19→SH22), Plan v09 prompt, Seedance 2.0 standard 5s 16:9 720p. Director-approved 2026-05-27.`,
      metadata,
    },
    'return=representation',
  );
  if (!insertRes.ok) {
    console.error(`assets insert failed: ${insertRes.status} ${await insertRes.text()}`);
    process.exit(1);
  }
  const inserted = (await insertRes.json()) as Array<{ id: string; filename: string; status: string }>;
  const assetId = inserted[0].id;
  console.log(`✅ Assets row inserted. id=${assetId}`);

  // 5. approvals row for audit trail.
  console.log('\nInserting approvals row…');
  const approvalRes = await rest(
    'POST',
    'approvals',
    {
      asset_id: assetId,
      episode_id: EPISODE,
      approved_by: 'DIRECTOR',
      approval_type: 'VID-shot',
      notes:
        'Manual ingest — direct fal.ai test confirmed satisfactory two-anchor output. SH19 ref as start + SH22 ref v04 as end. Plan v09 prompt body used verbatim.',
    },
  );
  if (!approvalRes.ok) {
    console.error(`approvals insert failed: ${approvalRes.status} ${await approvalRes.text()}`);
    // Non-fatal — asset is already APPROVED, audit trail is bonus.
  } else {
    console.log('✅ Approvals row inserted.');
  }

  // 6. activity_events row so Polина sees the ingest in feed.
  console.log('\nInserting activity_events row…');
  const eventRes = await rest(
    'POST',
    'activity_events',
    {
      event_type: 'asset_submitted',
      severity: 'info',
      title: 'Video Artist completed — SH19 (manual ingest)',
      description:
        'Director-approved manual VGEN result for SH19 ingested as canonical v03 APPROVED. Two-anchor test (SH19 ref start, SH22 ref end). Seedance 2.0 standard 5s 16:9 720p, $1.51.',
      actor: 'EXEC-VGEN',
      episode_id: EPISODE,
      asset_id: assetId,
      metadata: {
        file_type: `VID-shot-${SHOT_SLUG}`,
        shot_id: SHOT_ID,
        plan_asset_id: SOURCE_PLAN_ID,
        cost_usd: 1.512,
        ingest_source: 'manual-direct-fal-vgen',
      },
    },
  );
  if (!eventRes.ok) {
    console.error(`activity_events insert failed: ${eventRes.status} ${await eventRes.text()}`);
  } else {
    console.log('✅ Activity event inserted.');
  }

  console.log(`\n══════════════════════════════════════════════════════════════════`);
  console.log(`SH19 is now APPROVED in DB. Episode ready for next stage (stitch).`);
  console.log(`══════════════════════════════════════════════════════════════════`);
  console.log(`  View: http://localhost:3000${canonicalStagingPath}`);
  console.log(`  Asset id: ${assetId}`);
}

main().catch((e) => {
  console.error('FAIL:', e?.message ?? e);
  process.exit(1);
});
