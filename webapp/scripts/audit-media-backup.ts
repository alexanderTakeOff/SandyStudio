// audit-media-backup.ts — Part C of the 2026-07-22 canon-loss fix.
// Scan every FINALIZED (APPROVED/LOCKED) media asset whose drive_file_id is
// NULL (no Drive backup — a time-bomb that vanishes on the next cache clear).
// For each, if its bytes still live in the local media cache, re-persist to
// Drive (persistBinary) and set drive_file_id. Bytes-less ones are LOST and
// listed for Director regeneration.
//
// Usage:  npx tsx scripts/audit-media-backup.ts          (report only)
//         npx tsx scripts/audit-media-backup.ts --fix     (also back up recoverable)
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { promises as fsp } from 'node:fs';
import { persistBinary, type BinaryExt } from '../lib/agents/persist-binary';
import { localCacheAbsPath } from '../lib/media-cache';

for (const raw of readFileSync('.env.local', 'utf-8').split('\n')) {
  const l = raw.trim(); if (!l || l.startsWith('#')) continue;
  const e = l.indexOf('='); if (e <= 0) continue;
  let v = l.slice(e + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  process.env[l.slice(0, e).trim()] = v;
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const DO_FIX = process.argv.includes('--fix');
const MEDIA_EXT = /\.(png|jpe?g|webp|mp4|mov|wav|mp3)$/i;

function extOf(filename: string): BinaryExt | null {
  const m = MEDIA_EXT.exec(filename);
  if (!m) return null;
  const e = m[1].toLowerCase();
  return (e === 'jpeg' ? 'jpg' : e) as BinaryExt;
}
// Derive persistBinary layout hints from the canonical filename.
function layoutFor(filename: string): { seriesCode?: string; bucket?: string; episodeCode?: string } {
  const series = filename.match(/^(SS-[A-Z0-9]+?)-/i)?.[1];
  const ep = filename.match(/^SS-[A-Z0-9]+-(E\d+)-/i)?.[1];
  if (ep && series) return { seriesCode: series, bucket: ep };
  if (filename.includes('-SBL-') && series) return { seriesCode: series, bucket: 'bible' };
  return {};
}

(async () => {
  const { data } = await sb.from('assets')
    .select('id,filename,file_type,status,drive_file_id,staging_path,drive_path')
    .in('status', ['APPROVED', 'LOCKED'])
    .is('drive_file_id', null);
  const media = ((data ?? []) as Array<Record<string, unknown>>)
    .filter((a) => MEDIA_EXT.test(String(a.filename ?? '')));
  console.log(`Finalized media assets with NULL drive_file_id: ${media.length}\n`);

  const lost: string[] = [];
  const recovered: string[] = [];
  for (const a of media) {
    const filename = String(a.filename);
    const abs = localCacheAbsPath(filename);
    let hasBytes = false;
    try { await fsp.access(abs); hasBytes = true; } catch { hasBytes = false; }
    if (!hasBytes) { console.log(`  LOST      ${filename}`); lost.push(filename); continue; }
    if (!DO_FIX) { console.log(`  RECOVER?  ${filename} (local bytes present — run with --fix)`); continue; }
    const ext = extOf(filename);
    if (!ext) { console.log(`  SKIP      ${filename} (unknown ext)`); continue; }
    const base64 = (await fsp.readFile(abs)).toString('base64');
    const persisted = await persistBinary({ base64, ext, driveFilename: filename, supabase: sb as never, ...layoutFor(filename) });
    if (!persisted.driveFileId) { console.log(`  FAIL      ${filename} (Drive upload returned no id)`); continue; }
    await sb.from('assets').update({
      drive_file_id: persisted.driveFileId,
      drive_web_view_url: persisted.driveWebViewUrl,
      staging_path: persisted.browserUrl,
      drive_path: persisted.browserUrl,
      updated_at: new Date().toISOString(),
    }).eq('id', a.id as string);
    console.log(`  RECOVERED ${filename} → ${persisted.driveFileId}`);
    recovered.push(filename);
  }

  console.log(`\nSummary: ${recovered.length} recovered, ${lost.length} LOST (need regeneration).`);
  if (lost.length) console.log('LOST (Director must regenerate):\n' + lost.map((f) => '  - ' + f).join('\n'));
})().catch((e) => { console.error(e); process.exit(1); });
