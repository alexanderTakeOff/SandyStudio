/**
 * gen-brand-visual.ts — produce the studio INTRO / OUTRO brand VISUAL (silent)
 * for the Sandy series bookends, ON LOCKED S15 CANON (Director q14/q15).
 *
 * Composition (Director): Sandy front-and-centre as the hero/logo; Anvil and
 * Madam Parfum (both S15 canon) walking in the background. S15 2D canon style.
 *
 * Two-step, money-gated:
 *   PASS 1 (default, ~$0.08/still): gpt-image-2 MULTI-REF edit over the LOCKED
 *          S15 canon (Sandy + Anvil + Madam Parfum + style) — reuses the exact
 *          EXEC-THUMB `openai-edits-multi` on-model path. Review before spending.
 *   PASS 2 (--animate, ~$3.81/clip fast 1080p): Seedance 2.0 img2vid, 7s, 16:9,
 *          1080p, generate_audio:false → SILENT 1920×1080 mp4 (matches episode
 *          body → branded-master concat needs no conform). Music baked LATER by
 *          compose-brand-clip.ts.
 *
 * In-image text (wordmark/CTA) is NOT baked here — multi-ref edits render text
 * unreliably; the logo/wordmark is a follow-up (overlay or the Director's badge).
 *
 * Usage:
 *   tsx scripts/gen-brand-visual.ts --kind both              # stills only (cheap)
 *   tsx scripts/gen-brand-visual.ts --kind intro --animate   # still + 7s video
 */

import * as fs from 'fs';
import * as path from 'path';

// Load .env.local (same shape as the other dist-* / brand scripts).
const env = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

import { createClient } from '@supabase/supabase-js';
import { openAIEditsMultiProvider } from '../lib/providers/openai-edits-multi';
import type { MultiImageRef } from '../lib/providers/image-gen-multi';
import { readBibleImageAsBase64 } from '../lib/providers/openai-image-edit';
import { downloadFile } from '../lib/providers/drive';
import { generateVideoFalSeedance } from '../lib/providers/fal-seedance';

const OUT_DIR = 'C:/SandyStudio/FILMS/_media_cache/_brand';
const S15_SERIES_ID = '45351141-6334-4bf0-8a0f-4e00a994f670';

// LOCKED S15 canon file_types (discovered 2026-07-13).
const CANON_FILE_TYPES = {
  sandy: 'SBL-character_sandy_hourglass',
  anvil: 'SBL-character_anvil',
  parfum: 'SBL-character_madam_parfum',
  style: 'SBL-style_s15_style_canon_2d_v1',
} as const;

const IDENTITY_CLAUSE =
  'The provided reference images are the CANONICAL model sheets for Sandy (the ' +
  'hourglass character), Anvil, and Madam Parfum. Render each character EXACTLY ' +
  'on-model as in its reference — identical proportions, materials, colours and ' +
  'silhouette. Do NOT restyle, redesign, simplify, or substitute a generic figure.';

const STILL_PROMPT: Record<'intro' | 'outro', string> = {
  intro:
    `${IDENTITY_CLAUSE} Brand intro / logo bumper for the "Sandy the Hourglass" ` +
    `channel. Sandy stands LARGE and CENTRED in the foreground as the hero, facing ` +
    `camera in a confident friendly pose. In the BACKGROUND, smaller and softer, ` +
    `Anvil and Madam Parfum walk across the scene. Cohesive S15 2D flat cartoon ` +
    `style, bright warm palette, clean uncluttered premium composition, cinematic ` +
    `16:9. Do NOT render any text, letters, words, or logos inside the image.`,
  outro:
    `${IDENTITY_CLAUSE} Brand end-card for the "Sandy the Hourglass" channel. Sandy ` +
    `stands large in the foreground giving a friendly wave; in the BACKGROUND, ` +
    `smaller and softer, Anvil and Madam Parfum walk across the scene. Keep the ` +
    `LOWER THIRD visually simple and clear so a subscribe button and caption can be ` +
    `placed there afterward. Cohesive S15 2D flat cartoon style, bright warm palette, ` +
    `cinematic 16:9. Do NOT render any text, letters, words, or logos inside the image.`,
};

const MOTION_PROMPT: Record<'intro' | 'outro', string> = {
  intro:
    'Logo sting: Sandy gives a light bouncy hop and playful flip as the sand ' +
    'streams, then settles and holds; Anvil and Madam Parfum keep walking in the ' +
    'background. Camera locked, snappy and energetic, smooth motion.',
  outro:
    'Calm end-card: Sandy idles with a gentle bob and a friendly wave, sand ' +
    'trickling softly; Anvil and Madam Parfum stroll past in the background. Steady ' +
    'hold, warm and inviting, smooth motion.',
};

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { out[key] = next; i++; }
      else out[key] = 'true';
    }
  }
  return out;
}

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
    try {
      return Buffer.from(await downloadFile(row.drive_file_id)).toString('base64');
    } catch { /* fall through */ }
  }
  return null;
}

async function loadCanonRefs(): Promise<MultiImageRef[]> {
  const wanted: Array<{ ft: string; kind: 'identity' | 'style' }> = [
    { ft: CANON_FILE_TYPES.sandy, kind: 'identity' },
    { ft: CANON_FILE_TYPES.anvil, kind: 'identity' },
    { ft: CANON_FILE_TYPES.parfum, kind: 'identity' },
    { ft: CANON_FILE_TYPES.style, kind: 'style' },
  ];
  const refs: MultiImageRef[] = [];
  for (const w of wanted) {
    const { data, error } = await sb
      .from('assets')
      .select('id,staging_path,drive_file_id')
      .eq('series_id', S15_SERIES_ID)
      .eq('file_type', w.ft)
      .eq('status', 'LOCKED')
      .limit(1);
    if (error) throw new Error(`canon fetch ${w.ft}: ${error.message}`);
    const row = data?.[0] as { id: string; staging_path: string | null; drive_file_id: string | null } | undefined;
    if (!row) throw new Error(`LOCKED canon not found: ${w.ft}`);
    const b64 = await bytesFor(row);
    if (!b64) throw new Error(`could not resolve bytes for ${w.ft}`);
    refs.push({ kind: w.kind, bible_asset_id: row.id, image_b64: b64 });
    console.log(`  ref ${w.kind.padEnd(8)} ${w.ft}`);
  }
  return refs;
}

async function genOne(kind: 'intro' | 'outro', refs: MultiImageRef[], animate: boolean): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const stillPath = path.join(OUT_DIR, `sandy-${kind}-still-v02-canon.png`);

  console.log(`\n[${kind}] PASS 1 — gpt-image-2 multi-ref edit (S15 canon, quality=medium, 1536x1024)…`);
  const img = await openAIEditsMultiProvider.generate({
    prompt: STILL_PROMPT[kind],
    references: refs,
    size: '1536x1024',
    quality: 'medium',
  });
  fs.writeFileSync(stillPath, Buffer.from(img.b64_data, 'base64'));
  console.log(`[${kind}] still → ${stillPath}  ($${img.cost_usd.toFixed(3)})`);

  if (!animate) {
    console.log(`[${kind}] stopping after still (no --animate). Review it, then re-run with --animate.`);
    return;
  }

  console.log(`[${kind}] PASS 2 — Seedance 2.0 fast img2vid, 7s, 1080p, 16:9, SILENT…`);
  const vid = await generateVideoFalSeedance({
    prompt: MOTION_PROMPT[kind],
    referenceImageBase64: img.b64_data,
    referenceImageMime: 'image/png',
    quality: 'fast',
    resolution: '1080p',
    aspectRatio: '16:9',
    durationSeconds: 7,
  });
  const videoPath = path.join(OUT_DIR, `sandy-${kind}-v02-7s-silent.mp4`);
  fs.writeFileSync(videoPath, Buffer.from(vid.mp4_b64, 'base64'));
  console.log(
    `[${kind}] video → ${videoPath}  ${vid.width}x${vid.height} ${vid.duration_seconds}s ` +
      `${(vid.size_bytes / 1024 / 1024).toFixed(1)}MB  ($${vid.cost_usd.toFixed(2)})`,
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const kindArg = (args.kind ?? 'both') as 'intro' | 'outro' | 'both';
  const animate = args.animate === 'true';
  const kinds: Array<'intro' | 'outro'> = kindArg === 'both' ? ['intro', 'outro'] : [kindArg];

  console.log(
    `gen-brand-visual (S15 canon) — kinds=${kinds.join(',')} animate=${animate} ` +
      `(${animate ? 'STILL + VIDEO — spends fal' : 'STILL ONLY — cheap preview'})`,
  );
  console.log('Loading LOCKED S15 canon refs…');
  const refs = await loadCanonRefs();
  for (const k of kinds) await genOne(k, refs, animate);
  console.log('\nDone.');
}

main().catch((err) => {
  console.error('[gen-brand-visual] FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});
