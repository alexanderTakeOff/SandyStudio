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
import { makeShort, probeDimensions, isVertical, type EndCtaOptions } from '../lib/agents/providers/ffmpeg-shorts';
import { appendParentBacklink, recutWindowMarker } from '../lib/agents/providers/short-linkage';

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

// ── Re-cut path: build Shorts from clean time windows in short-windows.json ──────

/** One clean-window re-cut entry from the sidecar config. */
interface RecutWindow {
  ep: string;
  start: number;
  end: number;
  endCta?: EndCtaOptions;
  /** Overrides for episodes not present in PLAN (else resolved from PLAN[ep]). */
  file?: string;
  title?: string;
  parentVideoId?: string;
}

const WINDOWS_CONFIG = path.join(process.cwd(), 'scripts', 'short-windows.json');

/** Load + validate the sidecar re-cut config. Missing file → empty (no-op). */
function loadRecutWindows(): RecutWindow[] {
  if (!fs.existsSync(WINDOWS_CONFIG)) { console.log(`  no ${path.basename(WINDOWS_CONFIG)} — nothing to re-cut`); return []; }
  const raw = JSON.parse(fs.readFileSync(WINDOWS_CONFIG, 'utf8')) as { windows?: unknown };
  if (!Array.isArray(raw.windows)) return [];
  const out: RecutWindow[] = [];
  for (const w of raw.windows) {
    if (!w || typeof w !== 'object') continue;
    const o = w as Record<string, unknown>;
    if (typeof o.ep !== 'string' || typeof o.start !== 'number' || typeof o.end !== 'number') {
      console.log(`  SKIP malformed window entry: ${JSON.stringify(o)}`); continue;
    }
    if (o.end <= o.start) { console.log(`  SKIP ${o.ep} — end (${o.end}) must be > start (${o.start})`); continue; }
    const cta = o.endCta && typeof o.endCta === 'object' && typeof (o.endCta as any).text === 'string'
      ? { text: (o.endCta as any).text, durationSeconds: (o.endCta as any).durationSeconds }
      : undefined;
    out.push({
      ep: o.ep, start: o.start, end: o.end, endCta: cta,
      file: typeof o.file === 'string' ? o.file : undefined,
      title: typeof o.title === 'string' ? o.title : undefined,
      parentVideoId: typeof o.parentVideoId === 'string' ? o.parentVideoId : undefined,
    });
  }
  return out;
}

async function runRecut(doUpload: boolean) {
  console.log(`RE-CUT from short-windows.json${doUpload ? ' + UPLOAD (unlisted)' : ' (local only)'}\n`);
  const windows = loadRecutWindows();
  if (!windows.length) { console.log('No re-cut windows configured.'); return; }
  const planByEp = new Map(PLAN.map((p) => [p.ep, p]));
  const existing = doUpload ? (await listAllUploads()).map((v) => ({ ...v, n: norm(v.title) })) : [];

  for (const w of windows) {
    const base = planByEp.get(w.ep);
    const file = w.file ?? base?.file;
    const title = w.title ?? base?.title;
    if (!file || !title) { console.log(`  SKIP ${w.ep} — no PLAN entry and no file/title override`); continue; }
    if (base?.short && !w.file) { console.log(`  SKIP ${w.ep} — flagged already-vertical`); continue; }
    const parent = w.parentVideoId ?? (base ? PARENT_VID[base.ep] : null) ?? null;

    // Idempotency: the window marker makes each re-cut distinct, so a valid new
    // window is never mistaken for the old rough crop already on the channel.
    const marker = recutWindowMarker(w.start, w.end);
    const recutTitle = `${title} #Shorts ${marker}`;
    if (doUpload && existing.some((v) => v.n.includes(norm(title)) && v.n.includes(norm(marker)))) {
      console.log(`  SKIP ${w.ep} ${marker} — re-cut already on channel`); continue;
    }

    const full = path.join(FINALS, file);
    if (!fs.existsSync(full)) { console.log(`  SKIP ${w.ep} — file not found: ${full}`); continue; }
    const out = outPath(`${file.replace(/\.mp4$/i, '').trim()} ${marker}`);
    ensureOutDir();
    const window = `${w.start}s→${w.end}s (${(w.end - w.start).toFixed(0)}s)`;
    console.log(`  ffmpeg ${w.ep} "${title}" ${window}${w.endCta ? ` +CTA "${w.endCta.text}"` : ''} → ${path.basename(out)}`);
    await makeShort(full, out, {
      overlayText: OVERLAY,
      startSec: w.start,
      endSec: w.end,
      endCta: w.endCta ?? null,
    });
    const outDims = await probeDimensions(out);
    console.log(`    ✅ ${(fs.statSync(out).size / 1024 / 1024).toFixed(1)}MB  ${outDims?.width}x${outDims?.height}`);
    if (!doUpload) continue;

    const bytes = new Uint8Array(fs.readFileSync(out));
    console.log(`  ⬆ uploading ${w.ep} "${recutTitle}" (${(bytes.length / 1024 / 1024).toFixed(1)}MB, unlisted)...`);
    try {
      const r = await uploadVideo({
        bytes,
        title: recutTitle,
        description: appendParentBacklink(DESCRIPTION, parent),
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
  if (args.includes('--recut')) {
    await runRecut(args.includes('--upload'));
    return;
  }
  if (args.includes('--all')) {
    await runAll(args.includes('--upload'));
    return;
  }
  console.log('Usage:\n  --sample "<file>"   one local short, no upload\n  --all               build all locally (full center-crop)\n  --all --upload      build all + upload unlisted\n  --recut             re-cut clean windows from short-windows.json (local)\n  --recut --upload    re-cut + upload unlisted');
})().catch((e) => { console.error('ERROR:', e?.message || e); process.exit(1); });
