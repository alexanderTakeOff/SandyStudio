/**
 * clip-frames.ts — let Claude "watch" a LOCAL mp4 by sampling evenly-spaced frames
 * to PNG, which are then Read (Claude views images natively). Zero new deps — reuses
 * the project's own ffmpeg (resolveFfmpegPath + runFfmpeg from ffmpeg-stitch).
 *
 * Created 2026-07-13 (Director q2a — the subtractive alternative to the community
 * /watch-video skill: our render QA is on LOCAL clips, not YouTube URLs, so the
 * yt-dlp/Python/Whisper chain buys us nothing; frame extraction is all we need and
 * our ffmpeg already does it). Images need no tool — Read renders PNG/JPG directly.
 *
 * Usage:
 *   npx tsx scripts/clip-frames.ts --file <path.mp4> [--frames 12] [--width 640] [--out <dir>]
 * Prints the frame paths; the agent then Reads them to see the clip.
 */
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'node:child_process';
import { resolveFfmpegPath, runFfmpeg } from '../lib/providers/ffmpeg-stitch';

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

/** ffprobe duration in seconds, deriving the ffprobe binary from the resolved ffmpeg. */
async function probeDurationSeconds(mp4: string): Promise<number | null> {
  const ffmpeg = await resolveFfmpegPath();
  const candidates: string[] = [];
  if (ffmpeg && /ffmpeg(\.exe)?$/i.test(ffmpeg)) {
    candidates.push(ffmpeg.replace(/ffmpeg(\.exe)?$/i, 'ffprobe$1'));
  }
  candidates.push('ffprobe');
  for (const bin of candidates) {
    try {
      const out = await new Promise<string>((resolve, reject) => {
        let stdout = '';
        const proc = spawn(bin, [
          '-v', 'error',
          '-show_entries', 'format=duration',
          '-of', 'default=noprint_wrappers=1:nokey=1',
          mp4,
        ]);
        proc.stdout.on('data', (c) => { stdout += String(c); });
        proc.on('error', reject);
        proc.on('exit', (code) => (code === 0 ? resolve(stdout) : reject(new Error(`ffprobe exit ${code}`))));
      });
      const dur = parseFloat(out.trim());
      if (Number.isFinite(dur) && dur > 0) return dur;
    } catch { /* try next */ }
  }
  return null;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const file = args.file;
  const frames = args.frames ? Math.max(1, parseInt(args.frames, 10)) : 12;
  const width = args.width ? Math.max(64, parseInt(args.width, 10)) : 640;

  if (!file || !fs.existsSync(file)) {
    console.error('Required: --file <path.mp4> (file must exist). Optional: --frames 12 --width 640 --out <dir>');
    process.exit(1);
    return;
  }

  const base = path.basename(file).replace(/\.[^.]+$/, '');
  const outDir = args.out || path.join('C:/SandyStudio/FILMS/_media_cache/_watch', `${base}-${Date.now()}`);
  fs.mkdirSync(outDir, { recursive: true });

  const dur = await probeDurationSeconds(file);
  // Even sampling: fps = frames / duration. Fall back to 2 fps when duration
  // is unknown (rare — a short QA clip still yields a usable strip).
  const fps = dur && dur > 0 ? frames / dur : 2;

  console.log(
    `[clip-frames] ${path.basename(file)} · dur=${dur ? dur.toFixed(2) + 's' : '?'} · ` +
      `sampling ~${frames} frames @ ${fps.toFixed(3)} fps → ${width}px`,
  );

  const pattern = path.join(outDir, 'frame_%02d.png').replace(/\\/g, '/');
  await runFfmpeg([
    '-i', file,
    '-vf', `fps=${fps},scale=${width}:-1`,
    '-vsync', 'vfr',
    '-y', pattern,
  ]);

  const written = fs.readdirSync(outDir).filter((f) => f.endsWith('.png')).sort();
  if (written.length === 0) {
    console.error('[clip-frames] no frames produced — check the file is a valid mp4.');
    process.exit(1);
    return;
  }
  console.log(`[clip-frames] ${written.length} frames → ${outDir}`);
  for (const f of written) console.log(path.join(outDir, f).replace(/\\/g, '/'));
  console.log('[clip-frames] DONE — Read the frames above to view the clip.');
}

main().catch((err) => {
  console.error('[clip-frames] FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});
