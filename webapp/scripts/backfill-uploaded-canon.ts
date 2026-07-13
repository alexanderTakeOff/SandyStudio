// One-time backfill: re-persist a Director-uploaded canon through the canonical
// generation path (persistBinary → canonical cache filename + Google Drive) so
// its bytes resolve for the agent media-preflight gate. Fixes the E16 EXEC-EREF
// "Media unreachable" HALT for assets uploaded before the upload-route fix.
//
// Usage: npx tsx scripts/backfill-uploaded-canon.ts <assetId>
import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { persistBinary, type BinaryExt } from '../lib/agents/persist-binary';
import { localCacheAbsPath } from '../lib/media-cache';

const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) for (const raw of readFileSync(envPath, 'utf-8').split('\n')) { const l = raw.trim(); if (!l || l.startsWith('#')) continue; const eq = l.indexOf('='); if (eq <= 0) continue; let v = l.slice(eq + 1).trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); process.env[l.slice(0, eq).trim()] = v; }

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const assetId = process.argv[2];
if (!assetId) { console.error('usage: backfill-uploaded-canon.ts <assetId>'); process.exit(1); }

function canonicalName(filename: string, ext: string): string {
  return `${filename.replace(/\.[A-Za-z0-9]+$/, '')}.${ext}`;
}
function layout(filename: string): Record<string, string> {
  const ep = /^(SS-S\d+)-(E\d+)-/i.exec(filename);
  if (ep) return { episodeCode: `${ep[1]}-${ep[2]}`.toUpperCase() };
  const ser = /^(SS-S\d+)-/i.exec(filename);
  if (ser) return { seriesCode: ser[1].toUpperCase(), bucket: 'bible' };
  return {};
}
function stagingToCacheAbs(stagingPath: string): string {
  const name = decodeURIComponent(stagingPath.replace(/^\/api\/media\//, ''));
  return localCacheAbsPath(name);
}

(async () => {
  const { data: a, error } = await sb.from('assets').select('*').eq('id', assetId).maybeSingle();
  if (error) throw error;
  if (!a) { console.error('asset not found'); process.exit(1); }
  const asset = a as any;
  console.log(`asset: ${asset.filename} | status=${asset.status} | drive_file_id=${asset.drive_file_id}`);
  if (asset.drive_file_id) { console.log('already has drive_file_id — nothing to backfill'); process.exit(0); }

  const ext = (asset.filename.split('.').pop() ?? 'png').toLowerCase() as BinaryExt;
  const abs = stagingToCacheAbs(asset.staging_path);
  console.log(`reading current bytes from: ${abs}`);
  const bytes = await readFile(abs);
  console.log(`read ${bytes.length} bytes`);

  const persisted = await persistBinary({
    base64: bytes.toString('base64'),
    ext,
    driveFilename: canonicalName(asset.filename, ext),
    ...layout(asset.filename),
    supabase: sb,
  });
  console.log(`persisted: browserUrl=${persisted.browserUrl} driveFileId=${persisted.driveFileId} providerFailed=${persisted.driveUploadFailed}`);

  // Patch the row + the current history entry.
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
  } as never).eq('id', assetId);
  if (upd.error) throw upd.error;
  console.log('row updated ✓');
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e); process.exit(1); });
