/**
 * compose-brand-clip.ts — bake a Director-supplied music track onto a brand
 * VISUAL clip (intro sting / outro card) to produce ONE finished mp4, ready to
 * upload + LOCK as a studio-level `SBL-video_*` bible asset.
 *
 * Created 2026-07-13 (INTRO/OUTRO bookends plan, Stage 1). Produce-once /
 * studio-level / amortized — a SCRIPT, not a route (a route would invite
 * auto-fire). Reuses the existing `ffmpegStitchEpisode` provider verbatim: a
 * single-element `shotMp4Bytes` array + the `music` shaping fields is the whole
 * compose. NO new ffmpeg infra. Do NOT also run `processMusicTrack` — that would
 * double-apply the fade.
 *
 * The visual mp4 comes from our IMG→VID stages (produced separately). The music
 * mp3 comes from the Director (manual Suno for intro/outro).
 *
 * Correctness note: `ffmpegStitchEpisode` maps `-map 1:a` when `music` is set —
 * i.e. the music REPLACES the visual's own audio (which is what we want here:
 * the brand clip's soundtrack IS the sting). The fade-out anchors at
 * `duration − fadeOut`, so `--duration` is REQUIRED (it is the exact clip length).
 *
 * Usage:
 *   tsx scripts/compose-brand-clip.ts \
 *     --visual "C:/path/intro-visual.mp4" \
 *     --music  "C:/path/intro-sting.mp3" \
 *     --out    "C:/path/SS-S15-BIB-intro.mp4" \
 *     --duration 2.0 [--fade-in 0] [--fade-out 0.3] [--id intro]
 *
 *   # music optional — omit to just conform the visual to --duration:
 *   tsx scripts/compose-brand-clip.ts --visual v.mp4 --out o.mp4 --duration 2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { ffmpegStitchEpisode } from '../lib/agents/providers/ffmpeg-stitch';

type MusicExt = 'mp3' | 'wav' | 'm4a' | 'aac';

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        out[key] = next;
        i++;
      } else {
        out[key] = 'true';
      }
    }
  }
  return out;
}

function musicExtFromPath(p: string): MusicExt {
  const e = path.extname(p).slice(1).toLowerCase();
  if (e === 'mp3' || e === 'wav' || e === 'm4a' || e === 'aac') return e;
  throw new Error(`Unsupported music ext ".${e}" — use mp3 | wav | m4a | aac`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const visualPath = args.visual;
  const outPath = args.out;
  const durationSeconds = args.duration ? Number(args.duration) : NaN;

  if (!visualPath || !outPath || !Number.isFinite(durationSeconds)) {
    console.error(
      'Required: --visual <mp4> --out <mp4> --duration <seconds>. ' +
        'Optional: --music <mp3|wav|m4a|aac> --fade-in <s> --fade-out <s> --id <intro|outro>',
    );
    process.exit(1);
    return;
  }
  if (durationSeconds <= 0) {
    console.error('--duration must be > 0 (it is the exact clip length; fade-out anchors on it).');
    process.exit(1);
    return;
  }

  const shotId = args.id || 'brand';
  const visualBytes = fs.readFileSync(visualPath);

  const music = args.music
    ? {
        bytes: fs.readFileSync(args.music),
        ext: musicExtFromPath(args.music),
        fade_in_seconds: args['fade-in'] ? Number(args['fade-in']) : undefined,
        fade_out_seconds: args['fade-out'] ? Number(args['fade-out']) : undefined,
      }
    : undefined;

  console.log(
    `[compose-brand-clip] visual=${path.basename(visualPath)} ` +
      `music=${args.music ? path.basename(args.music) : '(none)'} ` +
      `duration=${durationSeconds}s → ${path.basename(outPath)}`,
  );

  const result = await ffmpegStitchEpisode({
    shotMp4Bytes: [{ shotId, bytes: visualBytes, durationSeconds }],
    music,
  });

  fs.writeFileSync(outPath, Buffer.from(result.mp4Base64, 'base64'));
  console.log(
    `[compose-brand-clip] wrote ${outPath} — ${(result.sizeBytes / 1024).toFixed(0)} KB, ` +
      `probed ${result.durationSeconds ?? '?'}s`,
  );
  console.log('[compose-brand-clip] next: upload via /api/assets/[id]/upload then LOCK via the bible lock route.');
}

main().catch((err) => {
  console.error('[compose-brand-clip] FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});
