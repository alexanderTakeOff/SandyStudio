/**
 * dedup-approved-anchors — one-time cleanup of the single-approved-per-shot
 * invariant for IMG-anchor assets. Before the approve-route anchor auto-demote
 * (commit 040a8e7), approving a new anchor version did NOT demote prior approved
 * versions, so multiple APPROVED anchors piled up per (shot_id, anchor_position).
 *
 * This keeps the NEWEST approved anchor per (episode, shot_id, position) and
 * demotes the older APPROVED ones to REJECTED (+ demoted_reason), matching the
 * approve-route behaviour. Idempotent: a group with <=1 approved is skipped.
 *
 * Usage (from webapp/):
 *   npm run dedup-approved-anchors -- --dry-run [--episode <uuid>]
 *   npm run dedup-approved-anchors --            [--episode <uuid>]
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (load via --env-file=.env.local)');
}
const sb = createClient(url, key);

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const epIdx = args.indexOf('--episode');
const episodeFilter = epIdx >= 0 ? args[epIdx + 1] : null;

interface AnchorRow {
  id: string;
  episode_id: string | null;
  status: string;
  version: number | null;
  created_at: string | null;
  metadata: { shot_reference?: { shot_id?: unknown }; anchor_position?: unknown } | null;
}

async function main(): Promise<void> {
  let q = sb.from('assets')
    .select('id,episode_id,status,version,created_at,metadata')
    .eq('status', 'APPROVED')
    .like('file_type', 'IMG-anchor%');
  if (episodeFilter) q = q.eq('episode_id', episodeFilter);
  const { data, error } = await q;
  if (error) throw new Error(`fetch failed: ${error.message}`);
  const rows = (data ?? []) as AnchorRow[];

  // group by episode_id | shot_id | position
  const groups = new Map<string, AnchorRow[]>();
  for (const r of rows) {
    const sid = r.metadata?.shot_reference?.shot_id;
    const pos = r.metadata?.anchor_position;
    if (typeof sid !== 'string' || (pos !== 'start' && pos !== 'end')) continue;
    const k = `${r.episode_id}|${sid}|${pos}`;
    const arr = groups.get(k) ?? [];
    arr.push(r);
    groups.set(k, arr);
  }

  let demoted = 0;
  let groupsWithDupes = 0;
  console.log(`\n  DEDUP APPROVED ANCHORS  ${dryRun ? '(DRY-RUN)' : 'APPLYING'}${episodeFilter ? ` ep=${episodeFilter}` : ' ALL EPISODES'}`);
  console.log('  ' + '-'.repeat(60));
  for (const [k, arr] of groups) {
    if (arr.length <= 1) continue;
    groupsWithDupes++;
    // newest first: version desc, then created_at desc
    arr.sort((a, b) => {
      const vd = (b.version ?? 0) - (a.version ?? 0);
      if (vd !== 0) return vd;
      return (b.created_at ?? '').localeCompare(a.created_at ?? '');
    });
    const keep = arr[0]!;
    const losers = arr.slice(1);
    console.log(`  ${k}  keep=${keep.id} (v${keep.version}) demote=${losers.length}`);
    for (const l of losers) {
      if (dryRun) { demoted++; continue; }
      const newMeta = { ...((l.metadata as Record<string, unknown>) ?? {}), demoted_reason: 'superseded_cleanup' };
      const { error: dErr } = await sb.from('assets')
        .update({ status: 'REJECTED', metadata: newMeta as unknown as Record<string, unknown> } as never)
        .eq('id', l.id)
        .eq('status', 'APPROVED'); // guard: only demote if still APPROVED (idempotent)
      if (dErr) { console.log(`    ! failed ${l.id}: ${dErr.message}`); continue; }
      demoted++;
    }
  }
  console.log('  ' + '-'.repeat(60));
  console.log(`  groups with duplicates: ${groupsWithDupes}   anchors ${dryRun ? 'WOULD demote' : 'demoted'}: ${demoted}`);
  if (dryRun) console.log('\n  Dry-run only. Re-run without --dry-run to apply.\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
