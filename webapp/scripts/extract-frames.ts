/**
 * Extract N evenly-spaced frames from an mp4 — used to display generated
 * video probes inline in the Claude Code chat via the multimodal Read tool.
 *
 * Usage:
 *   npx tsx scripts/extract-frames.ts <input.mp4> [n_frames] [out_dir]
 *
 * Frames written as `frame-001.png` … in <out_dir> (default: same dir as
 * input). Returns list of paths to stdout for downstream tooling.
 */
import { existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, basename, extname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { resolveFfmpegPath, probeDurationSeconds } from '../lib/agents/providers/ffmpeg-stitch';

async function probeFfmpegBin(): Promise<string> {
  const bin = await resolveFfmpegPath();
  if (!bin) throw new Error('ffmpeg not found on PATH or via winget fallback');
  return bin;
}

async function ffprobeDuration(file: string): Promise<number> {
  const n = await probeDurationSeconds(file);
  if (n == null) throw new Error(`ffprobe could not determine duration of ${file}`);
  return n;
}

async function extractFrame(ffmpegBin: string, input: string, timeSec: number, outPath: string): Promise<void> {
  return new Promise((res, rej) => {
    const p = spawn(ffmpegBin, ['-y', '-ss', timeSec.toFixed(3), '-i', input, '-frames:v', '1', '-vf', 'scale=512:-1', outPath], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    p.stderr?.on('data', (c) => (stderr += c.toString()));
    p.on('error', rej);
    p.on('exit', (code) => {
      if (code !== 0) return rej(new Error(`ffmpeg frame extract failed (${code}): ${stderr.slice(-300)}`));
      res();
    });
  });
}

async function main() {
  const input = resolve(process.argv[2] ?? '');
  const n = Number(process.argv[3] ?? 4);
  const outDir = resolve(process.argv[4] ?? dirname(input));
  if (!input || !existsSync(input)) {
    console.error('Usage: extract-frames.ts <input.mp4> [n_frames=4] [out_dir]');
    process.exit(2);
  }
  mkdirSync(outDir, { recursive: true });

  const ffmpegBin = await probeFfmpegBin();
  const duration = await ffprobeDuration(input);
  console.log(`[extract-frames] ${basename(input)} duration=${duration.toFixed(2)}s → ${n} frames`);

  const inputStem = basename(input, extname(input));
  const paths: string[] = [];
  for (let i = 0; i < n; i++) {
    // Spread frames between 0 and duration-epsilon so the last frame is
    // before EOF (some encoders refuse to seek exactly to file end).
    const t = (i / Math.max(1, n - 1)) * (duration - 0.05);
    const fname = `${inputStem}-frame-${String(i + 1).padStart(2, '0')}-t${t.toFixed(2).replace('.', '_')}s.png`;
    const out = join(outDir, fname);
    await extractFrame(ffmpegBin, input, t, out);
    const stat = await fs.stat(out);
    console.log(`  ${fname}  (${stat.size} bytes)`);
    paths.push(out);
  }
  console.log('\nFRAMES:');
  for (const p of paths) console.log(p);
}

main().catch((e) => {
  console.error('[extract-frames] FAILED:', e);
  process.exit(1);
});
