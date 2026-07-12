/**
 * dist-shorts.ts — turn landscape episode finals into 9:16 YouTube Shorts and
 * (optionally) upload them UNLISTED to the Sandy channel.
 *
 * Created 2026-07-12. Mirrors dist-youtube-upload.ts (standalone tsx, manual
 * .env.local, hardcoded PLAN) and reuses the shared `makeShort` helper so the
 * ffmpeg geometry lives in exactly one place.
 *
 * Usage:
 *   tsx scripts/dist-shorts.ts --sample "Sandy and Elevator.mp4"   # one local short, NO upload
 *   tsx scripts/dist-shorts.ts --all                               # build all shorts locally, NO upload
 *   tsx scripts/dist-shorts.ts --all --upload                      # build all + upload UNLISTED
 *
 * Director decisions (2026-07-12): center-crop · overlay "SANDY the HOURGLASS" ~4s ·
 * unlisted-first (Director flips to public after review; the upload scope can't delete).
 */

import * as fs from 'fs';
import * as path from 'path';

// Load .env.local (same shape as the other dist-* scripts).
const env = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

import { listAllUploads, uploadVideo } from '../lib/agents/providers/youtube';
import { makeShort, probeDimensions, isVertical } from '../lib/agents/providers/ffmpeg-shorts';
import { appendParentBacklink } from '../lib/agents/providers/short-linkage';

// Parent landscape video id per episode (funnel bridge — the ONE programmable
// Shorts→long-form link goes in the description). Same ids as dist-youtube-polish.ts.
const PARENT_VID: Record<string, string> = {
  'S15-E01': 'mCGE4FBcSrQ', 'S15-E07': 'BvIHVozwdKQ', 'S15-E09': 'gU8BBvnoHu0',
  'S15-E11': 'LgGPVYUEzf8', 'S15-E12': 'iT8nwWABBqE', 'S15-E13': 'ywNKJYsbnrE',
  'S15-E14': 'S2vIiuUCUGg', 'S15-E15': '2efpY_JPYUo', 'S15-E16': 'rzBgn07Ucsg',
};

const FINALS = 'H:/Мой диск/SandyStudio_Media/Finals';
const OUT_DIR = 'C:/SandyStudio/FILMS/_media_cache/_shorts';
const OVERLAY = 'SANDY the HOURGLASS';
const DESCRIPTION =
  '⏳ Sandy the Hourglass — silent physical comedy. Life is short. Flip yourself. #Shorts';

/** Finals file → Short title + match token. `short:true` = already vertical, skip. */
const PLAN: Array<{ file: string; title: string; ep: string; match: string; short?: boolean }> = [
  { file: 'Sandy and Heavy Friend.mp4',     title: 'Sandy and the Heavy Friend',    ep: 'S15-E01', match: 'heavy friend' },
  { file: 'Sandy Cleaning Up.mp4',          title: 'Sandy Cleaning Up',             ep: 'S15-E07', match: 'cleaning' },
  { file: 'Sandy and Elevator.mp4',         title: 'Sandy in the Elevator',         ep: 'S15-E09', match: 'elevator' },
  { file: 'Sandy and Power Fan.mp4',        title: 'Sandy and the Power Fan',       ep: 'S15-E11', match: 'power fan' },
  { file: 'sandy and smartphone .mp4',      title: 'Sandy and the Smartphone',      ep: 'S15-E12', match: 'smartphone' },
  { file: 'Sandy and Vending Machine.mp4',  title: 'Sandy and the Vending Machine', ep: 'S15-E13', match: 'vending' },
  { file: 'Sandy and Madam Parfume v03.mp4',title: 'Sandy and Madam Parfume',       ep: 'S15-E14', match: 'parfume' },
  { file: 'Sandy and Car Wash 1.17.mp4',    title: 'Sandy and the Car Wash',        ep: 'S15-E15', match: 'car wash' },
  { file: 'Sandy in the Gym.mp4',           title: 'Sandy in the Gym',              ep: 'S15-E16', match: 'gym' },
  // Already a vertical short on the channel — skip conversion.
  { file: 'Sandy in the Airport 4 v03 .mp4',title: 'Sandy in the Airport',          ep: 'S15-E25', match: 'airport', short: true },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const shortTitle = (title: string) => `${title} #Shorts`;
const outPath = (file: string) => path.join(OUT_DIR, file.replace(/\.mp4$/i, '').trim() + '-SHORT.mp4');

function ensureOutDir() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
}

/** Build one short locally. Returns output path, or null if skipped (missing/vertical). */
async function buildOne(file: string, opts: { title: string; ep?: string }): Promise<string | null> {
  const full = path.join(FINALS, file);
  if (!fs.existsSync(full)) { console.log(`  SKIP ${opts.ep ?? ''} — file not found: ${full}`); return null; }
  const dims = await probeDimensions(full);
  if (isVertical(dims)) { console.log(`  SKIP ${opts.ep ?? ''} — already vertical (${dims?.width}x${dims?.height})`); return null; }
  const out = outPath(file);
  ensureOutDir();
  console.log(`  ffmpeg ${opts.ep ?? ''} "${opts.title}" (src ${dims?.width}x${dims?.height}) → ${path.basename(out)}`);
  await makeShort(full, out, { overlayText: OVERLAY });
  const outDims = await probeDimensions(out);
  console.log(`    ✅ ${(fs.statSync(out).size / 1024 / 1024).toFixed(1)}MB  ${outDims?.width}x${outDims?.height}`);
  return out;
}

async function runSample(file: string) {
  console.log(`SAMPLE → ${file}\n`);
  const title = file.replace(/\.mp4$/i, '').trim();
  const out = await buildOne(file, { title });
  if (out) console.log(`\nDone. Review locally (NOT uploaded):\n  ${out}`);
}

async function runAll(doUpload: boolean) {
  console.log(`BUILD ALL${doUpload ? ' + UPLOAD (unlisted)' : ' (local only)'}\n`);
  const existing = doUpload ? (await listAllUploads()).map((v) => ({ ...v, n: norm(v.title) })) : [];

  for (const p of PLAN) {
    if (p.short) { console.log(`  SKIP ${p.ep} — flagged already-vertical`); continue; }
    // Idempotency: a short is already on the channel if a title matches AND carries the shorts marker.
    if (doUpload && existing.some((v) => v.n.includes(norm(p.match)) && v.n.includes('shorts'))) {
      console.log(`  SKIP ${p.ep} — short already on channel`); continue;
    }
    const out = await buildOne(p.file, { title: p.title, ep: p.ep });
    if (!out || !doUpload) continue;
    const bytes = new Uint8Array(fs.readFileSync(out));
    console.log(`  ⬆ uploading ${p.ep} "${shortTitle(p.title)}" (${(bytes.length / 1024 / 1024).toFixed(1)}MB, unlisted)...`);
    try {
      const r = await uploadVideo({
        bytes,
        title: shortTitle(p.title),
        description: appendParentBacklink(DESCRIPTION, PARENT_VID[p.ep] ?? null),
        tags: ['Shorts', 'Sandy the Hourglass', 'animation', 'comedy'],
        privacyStatus: 'unlisted',
      });
      console.log(`    ✅ ${r.url}  [${r.id}]  privacy=${r.privacyStatus}`);
    } catch (e: any) {
      console.log(`    ❌ FAILED: ${e?.message || e}`);
      if (e?.body) console.log('       body:', String(e.body).slice(0, 400));
    }
  }
}

(async () => {
  const args = process.argv.slice(2);
  const sampleIdx = args.indexOf('--sample');
  if (sampleIdx !== -1) {
    const file = args[sampleIdx + 1];
    if (!file) { console.error('--sample needs a Finals filename'); process.exit(1); }
    await runSample(file);
    return;
  }
  if (args.includes('--all')) {
    await runAll(args.includes('--upload'));
    return;
  }
  console.log('Usage:\n  --sample "<file>"   one local short, no upload\n  --all               build all locally\n  --all --upload      build all + upload unlisted');
})().catch((e) => { console.error('ERROR:', e?.message || e); process.exit(1); });
