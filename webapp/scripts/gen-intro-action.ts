/**
 * gen-intro-action.ts — the choreographed INTRO shot (Director 2026-07-13, v2):
 *   Golden rolling-hills scene (like the outro). Sandy SMALLER, centred; Anvil
 *   on the left, Madam Parfum on the right (both S15 canon). Sandy lifts his top
 *   glass cap like a HAT; shining sand grains pour from above and FILL his empty
 *   upper bulb; he beams happy. Slight slow zoom-in. Silent-slapstick homage.
 *   "Sandy" wordmark + iris-in are added in POST (ffmpeg) so they survive the
 *   zoom and land crisp — see post-intro.sh / the ffmpeg step. Audio = later.
 *
 *   PASS 1 (~$0.08): gpt-image-2 multi-ref START FRAME on LOCKED S15 canon
 *          (Sandy + Anvil + Madam Parfum + style), upper bulb EMPTY, clean (no text).
 *   PASS 2 (--animate, ~$1.69 fast 720p): Seedance 2.0 img2vid 7s / 16:9 / 720p /
 *          silent (fast tier maxes at 720p; upscaled to 1080p in post for stitch).
 */

import * as fs from 'fs';
import * as path from 'path';

const env = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

import { createClient } from '@supabase/supabase-js';
import { openAIEditsMultiProvider } from '../lib/agents/providers/openai-edits-multi';
import type { MultiImageRef } from '../lib/agents/providers/image-gen-multi';
import { readBibleImageAsBase64 } from '../lib/agents/providers/openai-image-edit';
import { downloadFile } from '../lib/agents/providers/drive';
import { generateVideoFalSeedance } from '../lib/agents/providers/fal-seedance';

const OUT_DIR = 'C:/SandyStudio/FILMS/_media_cache/_brand';
const S15_SERIES_ID = '45351141-6334-4bf0-8a0f-4e00a994f670';

const IDENTITY_CLAUSE =
  'The provided reference images are the CANONICAL model sheets for Sandy (the ' +
  'hourglass character), Anvil, and Madam Parfum, plus the S15 style. Render each ' +
  'character EXACTLY on-model — identical proportions, materials, colours and ' +
  'silhouette. Do NOT restyle, redesign, simplify, or substitute generic figures.';

const SCENE =
  `set in warm GOLDEN ROLLING HILLS at soft sunset. Sandy stands in the CENTRE but ` +
  `SMALLER — mid-size, NOT filling the frame — on-model, facing camera, cheerful. On ` +
  `the LEFT stands Anvil; on the RIGHT stands Madam Parfum — both smaller, in the same ` +
  `scene. Keep the UPPER SKY area clear and simple for a title. Cohesive S15 2D flat ` +
  `cartoon style, bright warm palette, cinematic 16:9. Do NOT render any text, letters, ` +
  `words, or logos inside the image.`;

const START_PROMPT: Record<'intro' | 'outro', string> = {
  intro:
    `${IDENTITY_CLAUSE} Brand INTRO scene for the "Sandy the Hourglass" channel, ${SCENE} ` +
    `Sandy's top cap is on and his UPPER glass bulb is EMPTY and clear, ALL the gold sand ` +
    `pooled in the LOWER bulb.`,
  outro:
    `${IDENTITY_CLAUSE} Brand OUTRO / sign-off scene for the "Sandy the Hourglass" channel, ` +
    `${SCENE} Sandy's UPPER glass bulb is comfortably FULL of gold sand (freshly filled), ` +
    `and he looks warm and inviting, ready to wave goodbye.`,
};

const MOTION_PROMPT: Record<'intro' | 'outro', string> = {
  intro:
    'Silent-slapstick logo sting. In the centre, Sandy reaches up and lifts his top ' +
    'glass cap like tipping a hat, then a stream of golden shining sand grains pours ' +
    'down from above and gradually FILLS his empty upper glass bulb; as it fills near ' +
    'the top Sandy beams with a big happy smile and sets his cap back. On the sides, ' +
    'Anvil and Madam Parfum gently mill about. Playful, bouncy, snappy vaudeville ' +
    'timing; a very slight slow camera zoom-in (subtle push-in, not much); smooth 2D ' +
    'cartoon motion.',
  outro:
    'Silent-slapstick sign-off. In the centre, Sandy gives a big cheeky WINK with one ' +
    'eye and an energetic INVITING beckoning wave of his arm — a "come on, let\'s go, ' +
    'onward!" come-along gesture, warm and encouraging. On the sides, Anvil and Madam ' +
    'Parfum wave goodbye too. Playful, bouncy, snappy vaudeville timing; a very slight ' +
    'slow camera zoom-in (subtle push-in, not much); smooth 2D cartoon motion.',
};

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function bytesFor(row: { staging_path?: string | null; drive_file_id?: string | null }): Promise<string | null> {
  if (row.staging_path) {
    const b64 = await readBibleImageAsBase64(row.staging_path);
    if (b64) return b64;
  }
  if (row.drive_file_id) {
    try { return Buffer.from(await downloadFile(row.drive_file_id)).toString('base64'); } catch { /* */ }
  }
  return null;
}

async function loadRefs(): Promise<MultiImageRef[]> {
  const wanted: Array<{ ft: string; kind: 'identity' | 'style' }> = [
    { ft: 'SBL-character_sandy_hourglass', kind: 'identity' },
    { ft: 'SBL-character_anvil', kind: 'identity' },
    { ft: 'SBL-character_madam_parfum', kind: 'identity' },
    { ft: 'SBL-style_s15_style_canon_2d_v1', kind: 'style' },
  ];
  const refs: MultiImageRef[] = [];
  for (const w of wanted) {
    const { data, error } = await sb.from('assets')
      .select('id,staging_path,drive_file_id')
      .eq('series_id', S15_SERIES_ID).eq('file_type', w.ft).eq('status', 'LOCKED').limit(1);
    if (error) throw new Error(`canon ${w.ft}: ${error.message}`);
    const row = data?.[0] as { id: string; staging_path: string | null; drive_file_id: string | null } | undefined;
    if (!row) throw new Error(`LOCKED canon not found: ${w.ft}`);
    const b64 = await bytesFor(row);
    if (!b64) throw new Error(`bytes not resolved for ${w.ft}`);
    refs.push({ kind: w.kind, bible_asset_id: row.id, image_b64: b64 });
    console.log(`  ref ${w.kind.padEnd(8)} ${w.ft}`);
  }
  return refs;
}

async function main(): Promise<void> {
  const animate = process.argv.includes('--animate');
  const kind: 'intro' | 'outro' = process.argv.includes('--outro') ? 'outro' : 'intro';
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`gen-brand-bumper — kind=${kind} animate=${animate}`);
  console.log('Loading S15 canon refs (Sandy + Anvil + Madam Parfum + style)…');
  const refs = await loadRefs();

  const stillPath = path.join(OUT_DIR, `sandy-${kind}-action-v2-still.png`);
  let stillB64: string;
  if (fs.existsSync(stillPath)) {
    stillB64 = fs.readFileSync(stillPath).toString('base64');
    console.log(`start frame REUSED → ${stillPath} (delete it to regenerate)`);
  } else {
    console.log(`\nPASS 1 — gpt-image-2 multi-ref START FRAME (${kind}: Sandy small, Anvil+Parfum sides, hills)…`);
    const img = await openAIEditsMultiProvider.generate({
      prompt: START_PROMPT[kind], references: refs, size: '1536x1024', quality: 'medium',
    });
    stillB64 = img.b64_data;
    fs.writeFileSync(stillPath, Buffer.from(stillB64, 'base64'));
    console.log(`start frame → ${stillPath}  ($${img.cost_usd.toFixed(3)})`);
  }

  if (!animate) {
    console.log('Stopping after start frame (no --animate).');
    return;
  }

  console.log('\nPASS 2 — Seedance 2.0 fast img2vid, 7s, 720p, 16:9, SILENT…');
  const vid = await generateVideoFalSeedance({
    prompt: MOTION_PROMPT[kind],
    referenceImageBase64: stillB64,
    referenceImageMime: 'image/png',
    quality: 'fast', resolution: '720p', aspectRatio: '16:9', durationSeconds: 7,
  });
  const videoPath = path.join(OUT_DIR, `sandy-${kind}-action-v2-raw-720p.mp4`);
  fs.writeFileSync(videoPath, Buffer.from(vid.mp4_b64, 'base64'));
  console.log(`raw video → ${videoPath}  ${vid.width}x${vid.height} ${vid.duration_seconds}s ($${vid.cost_usd.toFixed(2)})`);
  console.log(`POST next: ffmpeg iris-${kind === 'intro' ? 'in' : 'out'} + "Sandy" wordmark + upscale 1080p.`);
}

main().catch((err) => {
  console.error('[gen-intro-action] FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});
