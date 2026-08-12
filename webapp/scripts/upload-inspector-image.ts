// Replace the Inspector Stopwatch canon IMAGE in place (v01, stays LOCKED) —
// Director q11a, 2026-07-23. Bytes = the approved gpt-image-2 edit candidate.
// Mirrors backfill-uploaded-canon.ts persistBinary path (Drive + media cache).
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { persistBinary, type BinaryExt } from '../lib/persist-binary';

const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) for (const raw of readFileSync(envPath, 'utf-8').split('\n')) { const l = raw.trim(); if (!l || l.startsWith('#')) continue; const eq = l.indexOf('='); if (eq <= 0) continue; let v = l.slice(eq + 1).trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); process.env[l.slice(0, eq).trim()] = v; }

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const ID = '6dce86ff-76ef-4f00-8734-59401212b426';
const SRC = 'scripts/_inspector_candidate.png';

function canonicalName(filename: string, ext: string): string { return `${filename.replace(/\.[A-Za-z0-9]+$/, '')}.${ext}`; }
function layout(filename: string): Record<string, string> {
  const ser = /^(SS-S\d+)-/i.exec(filename);
  if (ser) return { seriesCode: ser[1].toUpperCase(), bucket: 'bible' };
  return {};
}

(async () => {
  const { data: a, error } = await sb.from('assets').select('*').eq('id', ID).maybeSingle();
  if (error || !a) { console.error('asset not found', error?.message); process.exit(1); }
  const asset = a as any;
  console.log(`asset: ${asset.filename} | status=${asset.status} | OLD drive_file_id=${asset.drive_file_id}`);

  const ext = (asset.filename.split('.').pop() ?? 'png').toLowerCase() as BinaryExt;
  const bytes = readFileSync(SRC);
  console.log(`candidate bytes: ${bytes.length}`);

  const persisted = await persistBinary({
    base64: bytes.toString('base64'),
    ext,
    driveFilename: canonicalName(asset.filename, ext),
    ...layout(asset.filename),
    supabase: sb,
  });
  console.log(`persisted: browserUrl=${persisted.browserUrl}\n  NEW driveFileId=${persisted.driveFileId} providerFailed=${persisted.driveUploadFailed}`);
  if (persisted.driveUploadFailed) { console.error('DRIVE UPLOAD FAILED — aborting DB patch (would point at missing file)'); process.exit(1); }

  const meta = (asset.metadata ?? {}) as any;
  const hist = meta?.image_prompt?.history;
  if (Array.isArray(hist) && hist.length) {
    const last = hist[hist.length - 1];
    last.staging_path = persisted.browserUrl;
    last.drive_file_id = persisted.driveFileId;
    last.drive_web_view_url = persisted.driveWebViewUrl;
  }
  const upd = await sb.from('assets').update({
    staging_path: persisted.browserUrl,
    drive_path: persisted.browserUrl,
    drive_file_id: persisted.driveFileId,
    drive_web_view_url: persisted.driveWebViewUrl,
    metadata: meta,
  } as never).eq('id', ID);
  if (upd.error) { console.error('DB update failed:', upd.error.message); process.exit(1); }
  console.log('row updated ✓ — image replaced in place (v01 stays LOCKED)');
})().catch((e) => { console.error('FAILED:', e); process.exit(1); });
