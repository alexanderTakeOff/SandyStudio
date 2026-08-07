// Recovery: re-download an episode's media from Google Drive into the local
// public/staging cache. Needed after the shared staging dir was lost (the
// agitated-lederberg worktree that held it was deleted during cleanup, taking
// every worktree's symlinked /staging/* media with it). Originals are safe in
// Drive (drive_file_id); this restores the local /staging/<file> URLs so the
// preview <img>/<video> stop 404-ing.
//   npx tsx scripts/restore-staging-from-drive.ts SS-S15-E01
import { readFileSync } from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

function loadEnv(f: string) {
  try {
    for (const raw of readFileSync(resolve(process.cwd(), f), 'utf-8').split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      let v = line.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      process.env[line.slice(0, eq).trim()] = v;
    }
  } catch {}
}
loadEnv('.env.local');

import { downloadFile } from '../lib/providers/drive';

/** Extract the `/staging/<file>` basename from a path field. */
function stagingName(p: string | null | undefined): string | null {
  if (!p) return null;
  const m = p.match(/\/staging\/([^/?#]+)$/);
  return m ? m[1] : null;
}

async function main() {
  const epCode = process.argv[2] ?? 'SS-S15-E01';
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const ep = await sb.from('episodes').select('id').eq('episode_code', epCode).single();
  if (ep.error || !ep.data) throw new Error(`episode ${epCode} not found`);
  const episodeId = (ep.data as { id: string }).id;

  const { data, error } = await sb
    .from('assets')
    .select('id,filename,file_type,drive_file_id,drive_path,staging_path')
    .eq('episode_id', episodeId)
    .not('drive_file_id', 'is', null);
  if (error) throw new Error(`asset fetch failed: ${error.message}`);

  const stagingDir = join(process.cwd(), 'public', 'staging');
  await mkdir(stagingDir, { recursive: true });

  let restored = 0,
    skipped = 0,
    failed = 0;
  for (const a of data ?? []) {
    const row = a as { drive_file_id: string; drive_path?: string; staging_path?: string; filename: string };
    const name = stagingName(row.staging_path) ?? stagingName(row.drive_path);
    if (!name) {
      skipped++;
      continue;
    }
    try {
      const buf = Buffer.from(await downloadFile(row.drive_file_id));
      await writeFile(join(stagingDir, name), buf);
      restored++;
      if (restored % 10 === 0) console.log(`  …${restored} restored`);
    } catch (e) {
      failed++;
      console.error(`  FAIL ${row.filename}: ${(e as Error).message}`);
    }
  }
  console.log(`\n✓ restore done: ${restored} restored, ${skipped} skipped (no /staging path), ${failed} failed`);
}
main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
