// One-shot backfill — assets where DB `status` doesn't match the `-STATUS`
// suffix in `filename` (per CLAUDE.md §3). Fixes historical drift from
// approve flows that pre-dated the 2026-05-14 rename patch.
//
// Modes:
//   default (dry-run) — print mismatches.
//   --apply            — write the corrected filename.
//   --episode <id>     — limit to one episode.
//
// Skips assets whose DB status has no filename representation
// (REJECTED, INVALIDATED, NEEDS_HUMAN_TWEAK, TEST).
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

const APPLY = process.argv.includes('--apply');
const epFlag = process.argv.indexOf('--episode');
const EP = epFlag >= 0 ? process.argv[epFlag + 1] : null;

const FILENAME_STATUSES = new Set(['DRAFT', 'REVIEW', 'REVISION', 'APPROVED', 'LOCKED']);
const SUFFIX_PATTERN = /-(DRAFT|REVIEW|REVISION|APPROVED|LOCKED)(\.[a-z0-9]+)$/i;

function filenameForStatus(filename: string, status: string): string | null {
  if (!FILENAME_STATUSES.has(status)) return null;
  if (!SUFFIX_PATTERN.test(filename)) return null;
  return filename.replace(SUFFIX_PATTERN, `-${status}$2`);
}

(async () => {
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}${EP ? ` · episode=${EP}` : ' · all assets'}`);
  let q = sb.from('assets').select('id,filename,status,episode_id,file_type').limit(2000);
  if (EP) q = q.eq('episode_id', EP);
  const { data, error } = await q;
  if (error) {
    console.error(error);
    process.exit(1);
  }

  type Row = { id: string; filename: string; status: string; episode_id: string | null; file_type: string };
  const mismatches: Array<{ row: Row; newName: string }> = [];
  const skippedNoSuffix: Row[] = [];
  const skippedStatus: Row[] = [];
  for (const row of (data ?? []) as Row[]) {
    const renamed = filenameForStatus(row.filename, row.status);
    if (renamed === null) {
      if (!FILENAME_STATUSES.has(row.status)) skippedStatus.push(row);
      else skippedNoSuffix.push(row);
      continue;
    }
    if (renamed !== row.filename) {
      mismatches.push({ row, newName: renamed });
    }
  }

  console.log(`Scanned: ${(data ?? []).length}`);
  console.log(`Mismatches: ${mismatches.length}`);
  console.log(`Skipped (status has no filename slot, e.g. REJECTED): ${skippedStatus.length}`);
  console.log(`Skipped (filename has no recognised suffix — manual review): ${skippedNoSuffix.length}`);

  console.log('\n=== top 30 mismatches ===');
  for (const m of mismatches.slice(0, 30)) {
    console.log(`  ${m.row.id}  ${m.row.status.padEnd(8)}  ${m.row.filename}  →  ${m.newName}`);
  }

  if (!APPLY) {
    console.log('\n[DRY-RUN] re-run with --apply to commit.');
    return;
  }

  let ok = 0;
  let fail = 0;
  for (const m of mismatches) {
    const { error: upErr } = await sb
      .from('assets')
      .update({ filename: m.newName } as never)
      .eq('id', m.row.id);
    if (upErr) {
      fail++;
      console.error(`  FAIL ${m.row.id}: ${upErr.message}`);
    } else {
      ok++;
    }
  }
  console.log(`\nApplied: ${ok} ok, ${fail} failed.`);
})();
