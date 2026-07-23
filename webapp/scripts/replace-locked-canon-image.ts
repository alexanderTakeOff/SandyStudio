// ─────────────────────────────────────────────────────────────────────────────
// Replace a LOCKED canon asset's IMAGE (and optionally its TEXT) IN PLACE.
// The deterministic, gotcha-proof muscle behind the `locked-canon-asset-replace`
// skill (steps 5–8). Reusable for ANY LOCKED SBL-* asset — no hardcoded subject.
//
//   npx tsx scripts/replace-locked-canon-image.ts \
//     --id <assetId> --image scripts/_candidate.png \
//     [--text-replacements scripts/_replacements.json] [--dry-run]
//
// text-replacements JSON: [{ "label": "...", "find": "...", "replace": "..." }]
// Each is applied with an EXACT 1-match guard (0 or >1 matches → abort).
//
// Guarantees the two steps that were forgotten by hand twice:
//   • abort the whole write if the Drive upload fails (no dangling row),
//   • bump image_prompt.current_version so the browser refetches (immutable cache).
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { persistBinary, type BinaryExt } from '../lib/agents/persist-binary';
import { bumpPreviewFreshness } from '../lib/asset-preview-resolver';

// --- load .env.local (no override of already-set env; Windows-safe) ---
const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) for (const raw of readFileSync(envPath, 'utf-8').split('\n')) { const l = raw.trim(); if (!l || l.startsWith('#')) continue; const eq = l.indexOf('='); if (eq <= 0) continue; let v = l.slice(eq + 1).trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); if (process.env[l.slice(0, eq).trim()] === undefined) process.env[l.slice(0, eq).trim()] = v; }

// --- tiny arg parser ---
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

const ID = arg('id');
const IMAGE = arg('image');
const REPL_PATH = arg('text-replacements');
const DRY = hasFlag('dry-run');
if (!ID) { console.error('missing --id <assetId>'); process.exit(2); }
if (!IMAGE && !REPL_PATH) { console.error('nothing to do: pass --image and/or --text-replacements'); process.exit(2); }

type Repl = { label: string; find: string; replace: string };

function canonicalName(filename: string, ext: string): string { return `${filename.replace(/\.[A-Za-z0-9]+$/, '')}.${ext}`; }
function layout(filename: string): Record<string, string> {
  const ser = /^(SS-S\d+)-/i.exec(filename);
  return ser ? { seriesCode: ser[1].toUpperCase(), bucket: 'bible' } : {};
}
const md5 = (b: Buffer) => createHash('md5').update(b).digest('hex');

(async () => {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: a, error } = await sb.from('assets').select('*').eq('id', ID).maybeSingle();
  if (error || !a) { console.error('asset not found:', error?.message); process.exit(1); }
  const asset = a as any;
  console.log(`asset: ${asset.filename} | status=${asset.status} | version=${asset.version} | OLD drive_file_id=${asset.drive_file_id}`);
  if (asset.status !== 'LOCKED') console.warn(`  ⚠ status is ${asset.status}, not LOCKED — proceeding anyway (in-place replace)`);

  // 1) TEXT — exact-1-match guarded replacements
  let newContent: string | undefined;
  if (REPL_PATH) {
    const repls = JSON.parse(readFileSync(REPL_PATH, 'utf-8')) as Repl[];
    let content = asset.content ?? '';
    for (const r of repls) {
      const n = content.split(r.find).length - 1;
      if (n !== 1) { console.error(`  ✗ [${r.label}] expected exactly 1 match, got ${n} — abort`); process.exit(1); }
      content = content.replace(r.find, r.replace);
      console.log(`  ✓ text: ${r.label}`);
    }
    newContent = content;
  }

  // 2) IMAGE — persistBinary → Drive (abort on failure)
  let imagePatch: Record<string, unknown> = {};
  let candidateBytes: Buffer | undefined;
  if (IMAGE) {
    candidateBytes = readFileSync(IMAGE);
    const ext = (asset.filename.split('.').pop() ?? 'png').toLowerCase() as BinaryExt;
    console.log(`  image: ${IMAGE} (${candidateBytes.length}b, md5=${md5(candidateBytes)})`);
    if (DRY) { console.log('  [dry-run] would persistBinary → Drive + patch row'); }
    else {
      const persisted = await persistBinary({
        base64: candidateBytes.toString('base64'), ext,
        driveFilename: canonicalName(asset.filename, ext), ...layout(asset.filename), supabase: sb,
      });
      if (persisted.driveUploadFailed) { console.error('  ✗ DRIVE UPLOAD FAILED — aborting (would point row at missing file)'); process.exit(1); }
      console.log(`  ✓ Drive: NEW drive_file_id=${persisted.driveFileId}`);
      imagePatch = {
        staging_path: persisted.browserUrl, drive_path: persisted.browserUrl,
        drive_file_id: persisted.driveFileId, drive_web_view_url: persisted.driveWebViewUrl,
      };
      const meta0 = (asset.metadata ?? {}) as any;
      const hist = meta0?.image_prompt?.history;
      if (Array.isArray(hist) && hist.length) {
        const last = hist[hist.length - 1];
        last.staging_path = persisted.browserUrl; last.drive_file_id = persisted.driveFileId; last.drive_web_view_url = persisted.driveWebViewUrl;
      }
    }
  }

  // 3) FRESHNESS bump — always when the image changed (immutable-cache buster)
  const bumpedMeta = IMAGE ? bumpPreviewFreshness(asset.metadata, asset.version) : (asset.metadata ?? {});

  if (DRY) { console.log('  [dry-run] no writes performed ✓'); return; }

  // 4) ONE update
  const patch: Record<string, unknown> = { ...imagePatch, metadata: bumpedMeta };
  if (newContent !== undefined) patch.content = newContent;
  const upd = await sb.from('assets').update(patch as never).eq('id', ID);
  if (upd.error) { console.error('  ✗ DB update failed:', upd.error.message); process.exit(1); }
  const newVer = (bumpedMeta as any)?.image_prompt?.current_version;
  console.log(`  ✓ row updated (LOCKED stays LOCKED)${IMAGE ? ` | current_version→${newVer}` : ''}`);

  // 5) VERIFY served bytes match candidate (best-effort — needs app up)
  if (IMAGE && candidateBytes) {
    const url = `http://localhost:3000/api/media/${asset.filename}?cb=${newVer ?? 'x'}`;
    try {
      const res = await fetch(url);
      if (res.ok) {
        const served = Buffer.from(await res.arrayBuffer());
        const ok = md5(served) === md5(candidateBytes);
        console.log(`  ${ok ? '✓' : '✗'} served md5 ${ok ? 'MATCHES' : 'DIFFERS FROM'} candidate (${served.length}b)`);
        if (!ok) process.exitCode = 1;
      } else console.log(`  · verify skipped: media route ${res.status} (app up?)`);
    } catch { console.log('  · verify skipped: app not reachable on :3000'); }
  }
})().catch((e) => { console.error('FAILED:', e); process.exit(1); });
