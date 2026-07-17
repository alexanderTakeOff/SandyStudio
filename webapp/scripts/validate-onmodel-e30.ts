// ──────────────────────────────────────────────────────────────────────────────
// scripts/validate-onmodel-e30.ts
// One-off: validate the on-model detector over E30's rendered reference frames.
// Runs the detector on the latest IMG-episode_ref per shot, prints raw axes + the
// strict/medium gate verdicts, and diffs against the calibration's known off-model set.
//
//   DRY=1  → load frames + character canon, NO vision call (plumbing check, $0).
//   (real) → one claude-opus-4-8 vision call per frame (~30 calls).
// ──────────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { readAssetMediaAsBase64 } from '../lib/media-cache';
import { runOnModelDetector, resolveOnModelDetectorModel } from '../lib/agents/runners/on-model-detector';
import { decideOnModel, type OnModelStrictness } from '../lib/api/on-model';

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

const EP_ID = '85d37225-bd18-428b-a238-3ee9621b5e63';
const SERIES_ID = '45351141-6334-4bf0-8a0f-4e00a994f670';
const DRY = process.env.DRY === '1';

// Calibration ground truth (memory: session_2026-07-17_e30-calibration-onmodel-gate).
const KNOWN_SILHOUETTE = new Set(['09', '14', '15', '16', '25']);
const KNOWN_TRANSPARENCY = new Set(['01', '04', '06', '08', '12']);

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

type AssetRow = {
  id: string;
  filename: string | null;
  file_type: string | null;
  version: number | null;
  drive_file_id: string | null;
  staging_path: string | null;
  metadata: Record<string, unknown> | null;
};

function shotNum(shotId: string): string {
  const m = shotId.match(/SH(\d+)/i);
  return m ? m[1].padStart(2, '0') : shotId;
}

async function loadCharacterRefs() {
  const { data } = await sb
    .from('assets')
    .select('filename,file_type,drive_file_id,staging_path,description')
    .eq('series_id', SERIES_ID)
    .eq('status', 'LOCKED')
    .like('file_type', 'SBL-character_%');
  const refs: Array<{ slug: string; image_b64: string | null; description: string }> = [];
  for (const a of (data ?? []) as Array<AssetRow & { description?: string }>) {
    const slug = (a.file_type ?? '').replace('SBL-character_', '');
    const image_b64 = await readAssetMediaAsBase64({
      filename: a.filename,
      driveFileId: a.drive_file_id,
      stagingPath: a.staging_path,
    });
    refs.push({ slug, image_b64, description: a.description ?? '' });
  }
  return refs;
}

async function loadLatestFrames() {
  const { data } = await sb
    .from('assets')
    .select('id,filename,file_type,version,drive_file_id,staging_path,metadata')
    .eq('episode_id', EP_ID)
    .like('file_type', 'IMG-episode_ref%');
  const byType = new Map<string, AssetRow>();
  for (const a of (data ?? []) as AssetRow[]) {
    const ft = a.file_type ?? '';
    const prev = byType.get(ft);
    if (!prev || (a.version ?? 0) >= (prev.version ?? 0)) byType.set(ft, a);
  }
  const frames = [...byType.values()].map((a) => {
    const sr = (a.metadata?.shot_reference ?? {}) as { shot_id?: string };
    return { asset: a, shotId: sr.shot_id ?? a.file_type ?? '?' };
  });
  frames.sort((x, y) => shotNum(x.shotId).localeCompare(shotNum(y.shotId)));
  return frames;
}

(async () => {
  const refs = await loadCharacterRefs();
  const frames = await loadLatestFrames();
  const withImg = refs.filter((r) => r.image_b64).length;
  console.log(`Character canon refs: ${refs.length} (${withImg} with image bytes) — [${refs.map((r) => r.slug).join(', ')}]`);
  console.log(`E30 frames (latest per shot): ${frames.length}\n`);

  if (DRY) {
    let ok = 0;
    for (const f of frames) {
      const b64 = await readAssetMediaAsBase64({
        filename: f.asset.filename,
        driveFileId: f.asset.drive_file_id,
        stagingPath: f.asset.staging_path,
      });
      if (b64) ok++;
      console.log(`  ${shotNum(f.shotId).padEnd(3)} v${String(f.asset.version ?? 0).padStart(2, '0')}  bytes=${b64 ? `${Math.round(b64.length / 1365)}KB` : 'MISSING'}  ${f.asset.filename ?? ''}`);
    }
    console.log(`\nDRY: ${ok}/${frames.length} frames loadable, ${withImg} char refs loadable. No API spend.`);
    return;
  }

  const model = await resolveOnModelDetectorModel(sb);
  console.log(`Detector model: ${model}\n`);
  const header = 'shot  sil  trans  STRICT  MEDIUM  reason';
  console.log(header);
  console.log('-'.repeat(header.length + 30));

  const bouncedStrict: string[] = [];
  const bouncedMedium: string[] = [];
  let cost = 0;
  for (const f of frames) {
    const candidate = await readAssetMediaAsBase64({
      filename: f.asset.filename,
      driveFileId: f.asset.drive_file_id,
      stagingPath: f.asset.staging_path,
    });
    const n = shotNum(f.shotId);
    if (!candidate) {
      console.log(`${n.padEnd(5)} — frame bytes missing, skipped`);
      continue;
    }
    // Anchor identity to the character(s) named in the frame filename (mirrors the
    // production path where refs are the characters IN that shot). Fallback: all refs.
    const fname = (f.asset.filename ?? '').toLowerCase();
    const shotRefs = refs.filter((r) => r.image_b64 && fname.includes(r.slug.toLowerCase()));
    const usedRefs = shotRefs.length > 0 ? shotRefs : refs.filter((r) => r.image_b64);
    const raw = await runOnModelDetector({
      candidateImageB64: candidate,
      characterRefs: usedRefs,
      episodeCode: 'SS-S15-E30',
      shotId: f.shotId,
      model,
    });
    cost += raw.cost_usd;
    const strict = decideOnModel(raw, 'strict' as OnModelStrictness, false);
    const medium = decideOnModel(raw, 'medium' as OnModelStrictness, false);
    if (strict === 'FAIL') bouncedStrict.push(n);
    if (medium === 'FAIL') bouncedMedium.push(n);
    console.log(
      `${n.padEnd(5)} ${(raw.silhouette_ok ? 'ok ' : 'NO ')}  ${(raw.transparency_ok ? 'ok  ' : 'NO  ')}  ${strict.padEnd(6)}  ${medium.padEnd(6)}  ${raw.reason.slice(0, 70)}`,
    );
  }

  const setStr = (s: string[]) => `{${s.join(',')}}`;
  console.log(`\n── SUMMARY ──`);
  console.log(`STRICT bounces (${bouncedStrict.length}): ${setStr(bouncedStrict)}`);
  console.log(`MEDIUM bounces (${bouncedMedium.length}): ${setStr(bouncedMedium)}`);
  console.log(`\nCalibration expected — silhouette ${setStr([...KNOWN_SILHOUETTE])}, transparency ${setStr([...KNOWN_TRANSPARENCY])}`);
  console.log(`  MEDIUM should ≈ silhouette set; STRICT should ≈ silhouette ∪ transparency.`);
  console.log(`\nDetector cost: $${cost.toFixed(4)} over ${frames.length} frames.`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
