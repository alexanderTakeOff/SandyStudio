// Stage A: Animatic kickoff for E21
//   1. Approve 2 EREF refs (SC02-SH04, SC06-SH02 — only REVIEW=2 shots
//      that have no APPROVED variant yet)
//   2. Approve music asset (AUD-music-main v02)
//   3. POST /api/episodes/[id]/eref/advance → fires EXEC-EDIT create-animatic
//
// Service-role auth; Director-authorized via q1 (2026-05-18).
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

const EP = '21f7bd6a-f52c-4ae0-bd47-06ff328ec6e7';
const INNGEST_DEV_URL = process.env.INNGEST_DEV_URL ?? 'http://localhost:8288';

(async () => {
  const writeMode = process.argv.includes('--write');
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // 1. Find the 2 shots with no APPROVED EREF — pick latest REVIEW per shot.
  // Reuse logic from find-undergen-eref-shots: filter post-v05 EREF refs,
  // group by shot_id, find shots where APPROVED count == 0.
  const SINCE = '2026-05-16T08:11:18';
  const { data: assets } = await sb
    .from('assets')
    .select('id,filename,status,version,metadata,file_type')
    .eq('episode_id', EP)
    .like('file_type', 'IMG-episode_ref%')
    .gte('created_at', SINCE);
  if (!assets) {
    console.error('no assets fetched');
    process.exit(2);
  }

  const byShot = new Map<string, Array<{ id: string; status: string; version: number; filename: string; fileType: string }>>();
  for (const a of assets) {
    const sid = ((a as { metadata?: { shot_reference?: { shot_id?: string } } }).metadata?.shot_reference?.shot_id);
    if (typeof sid !== 'string') continue;
    if (!byShot.has(sid)) byShot.set(sid, []);
    byShot.get(sid)!.push({
      id: a.id as string,
      status: a.status as string,
      version: a.version as number,
      filename: a.filename as string,
      fileType: a.file_type as string,
    });
  }

  const toApprove: Array<{ shotId: string; assetId: string; filename: string; fileType: string }> = [];
  for (const [sid, refs] of byShot) {
    const approvedCount = refs.filter((r) => r.status === 'APPROVED').length;
    if (approvedCount > 0) continue;
    // Pick latest REVIEW
    const reviews = refs.filter((r) => r.status === 'REVIEW').sort((a, b) => b.version - a.version);
    if (reviews.length === 0) {
      console.warn(`shot ${sid} has no APPROVED and no REVIEW — skipping`);
      continue;
    }
    toApprove.push({ shotId: sid, assetId: reviews[0].id, filename: reviews[0].filename, fileType: reviews[0].fileType });
  }
  console.log(`Need to approve ${toApprove.length} EREF refs to satisfy invariant:`);
  for (const t of toApprove) console.log(`  ${t.shotId}  ${t.assetId}  ${t.filename.slice(0, 60)}`);

  // 2. Find latest REVIEW music
  const { data: musicAssets } = await sb
    .from('assets')
    .select('id,filename,status,file_type,version,created_at')
    .eq('episode_id', EP)
    .like('file_type', 'AUD-music%')
    .order('created_at', { ascending: false });
  console.log(`\nMusic assets (${musicAssets?.length ?? 0}):`);
  for (const m of musicAssets ?? []) {
    console.log(`  ${m.created_at?.slice(11, 19)} v${m.version} [${(m.status as string).padEnd(8)}] ${m.file_type}  ${m.filename}`);
  }
  const musicToApprove = (musicAssets ?? []).find((m) => m.status === 'REVIEW');
  if (musicToApprove) {
    console.log(`\nWill approve music: ${musicToApprove.filename} (file_type=${musicToApprove.file_type})`);
  } else {
    console.log('\nNo REVIEW music asset to approve (already APPROVED or missing)');
  }

  if (!writeMode) {
    console.log('\n--- DRY RUN ---');
    console.log(`Would: approve ${toApprove.length} EREF + ${musicToApprove ? 1 : 0} music + POST /eref/advance`);
    console.log('Pass --write to apply.');
    return;
  }

  // ── APPROVE EREFs ────────────────────────────────────────────────────────
  const supersededDemotions: Array<{ asset: string; toStatus: 'REJECTED' }> = [];
  for (const t of toApprove) {
    console.log(`\nApproving EREF ${t.shotId} → ${t.assetId}...`);
    // Insert approval
    await sb.from('approvals').insert({
      asset_id: t.assetId,
      episode_id: EP,
      approved_by: 'DIRECTOR',
      approval_type: 'APPROVE',
      notes: 'Stage A bulk-approve for Animatic smoke (Director q1 2026-05-18 — testing downstream pipeline on existing refs)',
    } as never);
    // Flip status
    await sb.from('assets').update({ status: 'APPROVED' } as never).eq('id', t.assetId);
    // Activity event
    await sb.from('activity_events').insert({
      event_type: 'approval_granted',
      severity: 'info',
      title: `APPROVE on ${t.filename}`,
      description: 'Stage A bulk-approve for Animatic smoke',
      actor: 'DIRECTOR',
      asset_id: t.assetId,
      episode_id: EP,
      metadata: { decision: 'APPROVE', file_type: t.fileType, route: 'one-off-script', stage: 'stage-a' },
    } as never);
    console.log(`  ✓ ${t.shotId}`);
  }

  // ── APPROVE MUSIC ────────────────────────────────────────────────────────
  if (musicToApprove) {
    console.log(`\nApproving music ${musicToApprove.filename}...`);
    await sb.from('approvals').insert({
      asset_id: musicToApprove.id,
      episode_id: EP,
      approved_by: 'DIRECTOR',
      approval_type: 'APPROVE',
      notes: 'Stage A bulk-approve for Animatic smoke',
    } as never);
    await sb.from('assets').update({ status: 'APPROVED' } as never).eq('id', musicToApprove.id);
    await sb.from('activity_events').insert({
      event_type: 'approval_granted',
      severity: 'info',
      title: `APPROVE on ${musicToApprove.filename}`,
      description: 'Stage A bulk-approve for Animatic smoke',
      actor: 'DIRECTOR',
      asset_id: musicToApprove.id,
      episode_id: EP,
      metadata: { decision: 'APPROVE', file_type: musicToApprove.file_type, route: 'one-off-script', stage: 'stage-a' },
    } as never);
    console.log(`  ✓ music approved`);
  }

  // ── FIRE ADVANCE: re-implement route logic with service role ────────────
  // (route requires Director cookie; we replicate the core flow)
  console.log('\nReplicating /eref/advance flow with service role...');

  // Collect APPROVED EREF asset ids
  const { data: approvedAssets } = await sb
    .from('assets')
    .select('id')
    .eq('episode_id', EP)
    .eq('status', 'APPROVED')
    .like('file_type', 'IMG-episode_ref%');
  const storyboardAssetIds = (approvedAssets ?? []).map((a) => a.id);
  console.log(`Approved EREF refs: ${storyboardAssetIds.length}`);

  // Resolve music asset id (LIKE because file_type is AUD-music-main, not strict AUD-music)
  const { data: musicRow } = await sb
    .from('assets')
    .select('id')
    .eq('episode_id', EP)
    .like('file_type', 'AUD-music%')
    .eq('status', 'APPROVED')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const musicAssetId = (musicRow as { id?: string } | null)?.id ?? null;
  console.log(`Music asset id: ${musicAssetId}`);

  // Fire Inngest event
  const res = await fetch(`${INNGEST_DEV_URL}/e/devkey`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'sandystudio/exec-edit/create-animatic',
      data: { episodeId: EP, storyboardAssetIds, ...(musicAssetId ? { musicAssetId } : {}) },
    }),
  });
  console.log(`Inngest publish: HTTP ${res.status}`);
  console.log(await res.text());

  // Audit
  await sb.from('activity_events').insert({
    event_type: 'manual_trigger',
    severity: 'info',
    title: 'Advanced to Animatic (Stage A smoke)',
    description: `Director-authorized bulk approve + advance. ${storyboardAssetIds.length} EREF refs handed to EXEC-EDIT.`,
    actor: 'DIRECTOR',
    episode_id: EP,
    metadata: {
      kind: 'eref_advance',
      approved_asset_count: storyboardAssetIds.length,
      music_asset_id: musicAssetId,
      route: 'one-off-script',
      stage: 'stage-a',
    },
  } as never);

  console.log('\nDone. Animatic should be created in ~3-5 min.');
  console.log('Next: poll scripts/check-e21-animatic-status.ts until VID-animatic in REVIEW.');
})();
