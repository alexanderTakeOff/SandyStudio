// ──────────────────────────────────────────────────────────────────────────────
// scripts/migrate-s15-bible-to-new-layout.ts
//
// One-off migration 2026-05-20 — Director directive q20a.
//
// Moves SS-S15 Bible Library files from the flat /SandyStudio/<file> Drive
// location into the new layout /SandyStudio/SS-S15/bible/images/<file>.
// S14 files stay where they are (Director's explicit "S14 не трогай").
//
// Drive file IDs do NOT change when a file is reparented, so Supabase rows
// referencing these IDs need no update.
//
// One important guard: any drive_file_id referenced from BOTH S15 AND S14
// rows (e.g. Sandy carry-over — S15 Sandy DRAFT row links to the same Drive
// file as S14 Sandy LOCKED) is SKIPPED. Moving it out of root would yank
// the canonical S14 file too.
//
// Usage: from webapp/ run
//   npx tsx scripts/migrate-s15-bible-to-new-layout.ts [--dry]
// --dry prints plan without touching Drive. Default is to execute.
// ──────────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';
import { ensureFolder, moveFile, DriveError } from '../lib/agents/providers/drive';

interface AssetRow {
  id: string;
  filename: string;
  drive_file_id: string | null;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    // eslint-disable-next-line no-console
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env');
    process.exit(1);
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  // 1. S15 Bible assets with a Drive file.
  const { data: s15Raw, error: s15Err } = await sb
    .from('assets')
    .select('id,filename,drive_file_id')
    .like('filename', 'SS-S15-SBL-%')
    .not('drive_file_id', 'is', null);
  if (s15Err) {
    // eslint-disable-next-line no-console
    console.error('S15 fetch failed:', s15Err.message);
    process.exit(1);
  }
  const s15 = (s15Raw ?? []) as unknown as AssetRow[];

  // 2. Set of drive_file_id that ALSO appear in S14 — those we MUST NOT move.
  const { data: s14Raw, error: s14Err } = await sb
    .from('assets')
    .select('drive_file_id')
    .like('filename', 'SS-S14-%')
    .not('drive_file_id', 'is', null);
  if (s14Err) {
    // eslint-disable-next-line no-console
    console.error('S14 fetch failed:', s14Err.message);
    process.exit(1);
  }
  const s14Ids = new Set(
    (s14Raw ?? [])
      .map((r) => (r as { drive_file_id?: string | null }).drive_file_id)
      .filter((id): id is string => Boolean(id)),
  );

  const toMove: AssetRow[] = [];
  const skipped: AssetRow[] = [];
  for (const row of s15) {
    if (!row.drive_file_id) continue;
    if (s14Ids.has(row.drive_file_id)) {
      skipped.push(row);
    } else {
      toMove.push(row);
    }
  }

  // eslint-disable-next-line no-console
  console.log(`S15 Bible candidates: ${s15.length}`);
  // eslint-disable-next-line no-console
  console.log(`To move: ${toMove.length}`);
  // eslint-disable-next-line no-console
  console.log(`Skipped (shared with S14): ${skipped.length}`);
  for (const s of skipped) {
    // eslint-disable-next-line no-console
    console.log(`  SKIP ${s.filename}  (file_id=${s.drive_file_id} shared with S14)`);
  }
  if (toMove.length === 0) {
    // eslint-disable-next-line no-console
    console.log('Nothing to move. Done.');
    return;
  }

  if (dryRun) {
    for (const m of toMove) {
      // eslint-disable-next-line no-console
      console.log(`  DRY  would move ${m.filename}  file_id=${m.drive_file_id}`);
    }
    return;
  }

  // 3. Resolve target folder /SandyStudio/SS-S15/bible/images/.
  const sandy = await ensureFolder('SandyStudio');
  const series = await ensureFolder('SS-S15', sandy.id);
  const bible = await ensureFolder('bible', series.id);
  const images = await ensureFolder('images', bible.id);
  // eslint-disable-next-line no-console
  console.log(`Target Drive folder ready: SandyStudio/SS-S15/bible/images/  id=${images.id}`);

  // 4. Move each. Continue on per-file failure — record what didn't move.
  let ok = 0;
  const failures: Array<{ filename: string; reason: string }> = [];
  for (const m of toMove) {
    try {
      // eslint-disable-next-line no-console
      console.log(`  moving ${m.filename} (${m.drive_file_id}) …`);
      // m.drive_file_id is guaranteed non-null by the earlier filter.
      await moveFile(m.drive_file_id as string, images.id);
      ok += 1;
    } catch (err) {
      const reason = err instanceof DriveError ? err.message : (err as Error).message;
      failures.push({ filename: m.filename, reason });
      // eslint-disable-next-line no-console
      console.error(`  FAIL ${m.filename}: ${reason}`);
    }
  }

  // eslint-disable-next-line no-console
  console.log(`Moved ${ok} / ${toMove.length}.`);
  if (failures.length > 0) {
    // eslint-disable-next-line no-console
    console.log('Failures:');
    for (const f of failures) {
      // eslint-disable-next-line no-console
      console.log(`  ${f.filename}: ${f.reason}`);
    }
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('migration crashed:', err);
  process.exit(1);
});
