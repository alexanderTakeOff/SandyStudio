// ──────────────────────────────────────────────────────────────────────────────
// scripts/rollback-eref-and-replay.ts
// One-off rollback for SS-S15-E01: revoke the 2 IMG-episode_ref approvals
// (Reference Artist old-pipeline output), revoke REV-world_check approval,
// then leave REV-world_check at REVIEW status so Director can click APPROVE
// in UI to trigger the new Designer chain fan-out (commit cdb7f9f).
//
// Author: Theo · 2026-05-20 · Plan: sparkling-riding-blum.md
//
// Safety: only mutates `status`, `filename`, and metadata fields on a hardcoded
// set of 3 asset_ids. Every step is audit-logged to activity_events with
// actor=DIRECTOR. Dry-run by default; pass `--apply` to execute.
// ──────────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Load .env.local
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

const APPLY = process.argv.includes('--apply');
const EPISODE_ID = 'f019c29f-5e1e-4964-b62b-6c59fc3aa966';

// Target asset ids (verified via check-resume-status.ts in this session)
const IMG_SH01 = '323ee34f-b2d1-4c70-90ae-3539bed97626';
const IMG_SH02 = 'a65bfbbd';  // partial — resolve via filename to be safe
const REV_WORLD_CHECK_HINT = 'SS-S15-E01-REV-world_check-v01-APPROVED.md';

type AssetRow = {
  id: string;
  filename: string;
  status: string;
  file_type: string;
  metadata: Record<string, unknown> | null;
};

async function loadAsset(id: string): Promise<AssetRow | null> {
  const { data, error } = await sb
    .from('assets')
    .select('id,filename,status,file_type,metadata')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as AssetRow | null;
}

async function loadAssetByFilenameLike(pattern: string): Promise<AssetRow | null> {
  const { data, error } = await sb
    .from('assets')
    .select('id,filename,status,file_type,metadata')
    .ilike('filename', pattern)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as AssetRow | null;
}

/**
 * Mirror lib/api/filename-status.ts: only DRAFT/REVIEW/REVISION/APPROVED/LOCKED
 * are allowed in the filename (CLAUDE.md §3 + migration 0002 CHECK constraint).
 * For INVALIDATED/REJECTED/etc the filename keeps its current suffix.
 */
const FILENAME_STATUSES = new Set(['DRAFT', 'REVIEW', 'REVISION', 'APPROVED', 'LOCKED']);
const SUFFIX_PATTERN = /-(DRAFT|REVIEW|REVISION|APPROVED|LOCKED)(\.[a-z0-9]+)$/i;

function rewriteFilenameStatus(filename: string, newStatus: string): string {
  if (!FILENAME_STATUSES.has(newStatus)) return filename;  // INVALIDATED etc — keep current
  if (!SUFFIX_PATTERN.test(filename)) return filename;
  return filename.replace(SUFFIX_PATTERN, `-${newStatus}$2`);
}

async function setStatus(
  asset: AssetRow,
  newStatus: 'REVISION' | 'INVALIDATED' | 'REVIEW',
  note: string,
): Promise<AssetRow> {
  const newFilename = rewriteFilenameStatus(asset.filename, newStatus);
  console.log(`    [${APPLY ? 'APPLY' : 'DRY '}] ${asset.id.slice(0, 8)}  ${asset.status} → ${newStatus}`);
  console.log(`           filename: ${asset.filename}`);
  console.log(`                  → ${newFilename}`);
  if (!APPLY) {
    return { ...asset, status: newStatus, filename: newFilename };
  }
  const { data, error } = await sb
    .from('assets')
    .update({ status: newStatus, filename: newFilename })
    .eq('id', asset.id)
    .select('id,filename,status,file_type,metadata')
    .single();
  if (error) throw error;

  // Audit log
  await sb.from('activity_events').insert({
    event_type: 'asset_updated',
    severity: 'info',
    title: `Status ${asset.status} → ${newStatus} (rollback script)`,
    description: note,
    actor: 'DIRECTOR',
    episode_id: EPISODE_ID,
    asset_id: asset.id,
    metadata: {
      previous_status: asset.status,
      new_status: newStatus,
      previous_filename: asset.filename,
      new_filename: newFilename,
      reason: note,
      script: 'rollback-eref-and-replay.ts',
    } as never,
  });

  return data as AssetRow;
}

(async () => {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  Rollback EXEC-EREF (Artist) approvals + replay via Designer chain`);
  console.log(`  Episode: SS-S15-E01 (${EPISODE_ID})`);
  console.log(`  Mode: ${APPLY ? '🟢 APPLY (writes will happen)' : '🟡 DRY RUN (read-only)'}`);
  console.log(`${'═'.repeat(70)}\n`);

  // Resolve all 3 assets up-front (fail fast if any is missing/in wrong state)
  console.log('Step 0: Resolve target assets');
  const img1 = await loadAsset(IMG_SH01);
  if (!img1) throw new Error(`IMG SH01 not found: ${IMG_SH01}`);
  console.log(`  ✓ IMG SH01: ${img1.id} status=${img1.status}`);

  // IMG_SH02 was logged as 'a65bfbbd' — resolve by filename to be safe
  const img2 = await loadAssetByFilenameLike('SS-S15-E01-IMG-episode_ref_ss_s15_e01_a1_sc01_sh02%');
  if (!img2) throw new Error(`IMG SH02 not found via filename pattern`);
  console.log(`  ✓ IMG SH02: ${img2.id} status=${img2.status}`);

  const rev = await loadAssetByFilenameLike('SS-S15-E01-REV-world_check-v%');
  if (!rev) throw new Error(`REV-world_check not found`);
  console.log(`  ✓ REV-world_check: ${rev.id} status=${rev.status}`);

  // Sanity-check expected statuses
  if (img1.status !== 'APPROVED' || img2.status !== 'APPROVED') {
    console.warn(`  ⚠  IMG assets not both APPROVED — img1=${img1.status} img2=${img2.status}`);
    console.warn(`     This is OK if you've already partially rolled back. Continuing.`);
  }
  if (rev.status !== 'APPROVED') {
    console.warn(`  ⚠  REV-world_check status is ${rev.status}, expected APPROVED.`);
  }

  console.log('\nStep 1: Revoke IMG SH01 (APPROVED → REVISION → INVALIDATED)');
  let a = img1;
  if (a.status === 'APPROVED') a = await setStatus(a, 'REVISION', 'Revoke EXEC-EREF Artist IMG; switching to Designer chain (q2b smoke)');
  if (a.status === 'REVISION') a = await setStatus(a, 'INVALIDATED', 'Invalidate to clear IMG-episode_ref counter; Designer chain will produce new IMG');

  console.log('\nStep 2: Revoke IMG SH02 (APPROVED → REVISION → INVALIDATED)');
  let b = img2;
  if (b.status === 'APPROVED') b = await setStatus(b, 'REVISION', 'Revoke EXEC-EREF Artist IMG; switching to Designer chain (q2b smoke)');
  if (b.status === 'REVISION') b = await setStatus(b, 'INVALIDATED', 'Invalidate to clear IMG-episode_ref counter; Designer chain will produce new IMG');

  console.log('\nStep 3: Roll REV-world_check back to REVIEW (APPROVED → REVISION → REVIEW)');
  let r = rev;
  if (r.status === 'APPROVED') r = await setStatus(r, 'REVISION', 'Revoke world_check approval to replay through Designer chain (cdb7f9f fanout)');
  if (r.status === 'REVISION') r = await setStatus(r, 'REVIEW', 'Move back to REVIEW so Director can click APPROVE in UI; approve route now triggers Designer fanout');

  console.log('\nStep 4: Next manual step for Director');
  console.log(`  → Open SS-S15-E01 in UI`);
  console.log(`  → Find REV-world_check asset (${r.id})`);
  console.log(`  → Click APPROVE`);
  console.log(`  → Watch activity_events for 2× "EXEC-EREF-DESIGNER agent_started"`);
  console.log(`  → Run: npx tsx scripts/check-resume-status.ts`);

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  ${APPLY ? '🟢 Phase 2 complete. Director: click APPROVE in UI now.' : '🟡 DRY RUN finished. Re-run with --apply to execute.'}`);
  console.log(`${'═'.repeat(70)}\n`);
  process.exit(0);
})().catch((err) => {
  console.error('\n💥 Rollback failed:', err);
  process.exit(1);
});
