// ─── LEGACY SINGLE-CHANNEL (Sandy) — multi-channel Phase 4a guard ────────────
// This script predates the channels passport: it calls YouTube with the legacy
// global token (no per-channel auth, no identity guard) and carries hardcoded
// Sandy-era paths/ids. Running it against a multi-channel studio can silently
// touch the WRONG channel. Use the in-app flows (EXEC-PUB / shorts route) —
// they resolve the channel and verify identity. To run anyway, acknowledge:
//   LEGACY_SINGLE_CHANNEL=1
if (process.env.LEGACY_SINGLE_CHANNEL !== '1') {
  console.error(
    '[legacy-guard] This is a LEGACY single-channel (Sandy) script with no per-channel auth. ' +
      'Set LEGACY_SINGLE_CHANNEL=1 to run it anyway.',
  );
  process.exit(1);
}

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs'; import * as path from 'path';
const env = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
for (const line of env.split('\n')) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g,''); }
import { updateVideoMetadata, setThumbnail } from '../lib/providers/youtube';
import { downloadFile } from '../lib/providers/drive';
import { parseVideoMetadata } from '../lib/publish-metadata';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Episode → its raw-manual-upload YouTube id (stable match, survives renames).
// E25 excluded — published via pipeline, already dressed.
const MAP: Array<{ ep: string; vid: string }> = [
  { ep: 'SS-S15-E01', vid: 'mCGE4FBcSrQ' },
  { ep: 'SS-S15-E07', vid: 'BvIHVozwdKQ' },
  { ep: 'SS-S15-E09', vid: 'gU8BBvnoHu0' },
  { ep: 'SS-S15-E11', vid: 'LgGPVYUEzf8' },
  { ep: 'SS-S15-E12', vid: 'iT8nwWABBqE' },
  { ep: 'SS-S15-E13', vid: 'ywNKJYsbnrE' },
  { ep: 'SS-S15-E14', vid: 'S2vIiuUCUGg' },
  { ep: 'SS-S15-E15', vid: '2efpY_JPYUo' },
  { ep: 'SS-S15-E16', vid: 'rzBgn07Ucsg' },
];

function isImage(b: Uint8Array): 'png' | 'jpeg' | null {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8) return 'jpeg';
  return null;
}

async function thumbBytes(driveId: string | null, staging: string | null): Promise<{ bytes: Uint8Array | null; note: string }> {
  if (driveId) {
    try { const b = new Uint8Array(await downloadFile(driveId)); return { bytes: b, note: `drive ${(b.length/1024).toFixed(0)}KB` }; } catch { /* fall through */ }
  }
  if (staging && /^[A-Za-z]:\\/.test(staging) && fs.existsSync(staging)) {
    const b = new Uint8Array(fs.readFileSync(staging)); return { bytes: b, note: `local ${(b.length/1024).toFixed(0)}KB` };
  }
  if (staging && staging.startsWith('/api/')) {
    try { const r = await fetch('http://localhost:3000' + staging); if (r.ok) { const b = new Uint8Array(await r.arrayBuffer()); return { bytes: b, note: `api ${(b.length/1024).toFixed(0)}KB` }; } } catch { /* fall through */ }
  }
  return { bytes: null, note: 'no fetchable thumbnail' };
}

// Compress an oversized thumbnail to under YouTube's 2MB limit (1280x720 JPEG).
async function compress(bytes: Uint8Array): Promise<Uint8Array | null> {
  try {
    const sharp = (await import('sharp')).default;
    const out = await sharp(Buffer.from(bytes)).resize(1280, 720, { fit: 'inside' }).jpeg({ quality: 85 }).toBuffer();
    return new Uint8Array(out);
  } catch { return null; }
}

(async () => {
  for (const { ep, vid } of MAP) {
    const { data: e } = await sb.from('episodes').select('id').eq('episode_code', ep).maybeSingle();
    if (!e) { console.log(`⏭  ${ep}: episode not found`); continue; }
    const { data: metaRows } = await sb.from('assets').select('content').eq('episode_id', e.id).eq('file_type', 'SPC-metadata').eq('status', 'APPROVED').order('version', { ascending: false }).limit(1);
    const { data: thumbRows } = await sb.from('assets').select('drive_file_id,staging_path').eq('episode_id', e.id).eq('file_type', 'IMG-thumbnail').eq('status', 'APPROVED').order('version', { ascending: false }).limit(1);
    const content = metaRows?.[0]?.content;
    if (!content) { console.log(`⏭  ${ep} [${vid}]: no APPROVED SPC-metadata`); continue; }

    const { title, description, tags } = parseVideoMetadata(content);
    console.log(`\n${ep} [${vid}]  title="${title}"  desc=${description.length}c  tags=${tags.length}`);
    try {
      await updateVideoMetadata(vid, { title, description, tags });
      console.log(`   ✅ metadata updated`);
    } catch (e: any) {
      console.log(`   ❌ metadata: ${e?.message}${e?.body ? '\n      ' + String(e.body).replace(/\s+/g, ' ').slice(0, 300) : ''}`);
    }
    const t = await thumbBytes(thumbRows?.[0]?.drive_file_id ?? null, thumbRows?.[0]?.staging_path ?? null);
    let bytes = t.bytes;
    if (!bytes) { console.log(`   ⏭  thumbnail: ${t.note}`); continue; }
    let kind = isImage(bytes);
    if (!kind) { console.log(`   ⏭  thumbnail: not valid PNG/JPEG (${t.note}, head=${Array.from(bytes.slice(0,4)).map(x=>x.toString(16)).join(' ')})`); continue; }
    let note = t.note;
    if (bytes.length > 2 * 1024 * 1024) {
      const c = await compress(bytes);
      if (!c) { console.log(`   ⏭  thumbnail: too large ${(bytes.length/1024/1024).toFixed(1)}MB, compress (sharp) unavailable`); continue; }
      bytes = c; kind = 'jpeg'; note += ` → compressed ${(bytes.length/1024).toFixed(0)}KB`;
    }
    try {
      await setThumbnail(vid, bytes, kind === 'png' ? 'image/png' : 'image/jpeg');
      console.log(`   ✅ thumbnail set (${kind}, ${note})`);
    } catch (e: any) {
      console.log(`   ❌ thumbnail: ${e?.message}${e?.body ? '\n      ' + String(e.body).replace(/\s+/g, ' ').slice(0, 200) : ''}`);
    }
  }
})().catch(e => { console.error('ERROR:', e?.message || e); process.exit(1); });
