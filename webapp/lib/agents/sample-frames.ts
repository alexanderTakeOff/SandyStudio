// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/sample-frames.ts
// Sample evenly-spaced frames from a local mp4 as base64 PNGs — the in-memory
// counterpart of scripts/clip-frames.ts, for the Visual Critic's video path.
// Reuses the project's own ffmpeg (resolveFfmpegPath + runFfmpeg). Writes to a
// temp dir, reads the PNGs, cleans up. NO new binary deps.
// ──────────────────────────────────────────────────────────────────────────────

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { resolveFfmpegPath, runFfmpeg } from './providers/ffmpeg-stitch';

/** ffprobe duration in seconds, deriving ffprobe from the resolved ffmpeg. */
async function probeDurationSeconds(mp4: string): Promise<number | null> {
  const ffmpeg = await resolveFfmpegPath();
  const candidates: string[] = [];
  if (ffmpeg && /ffmpeg(\.exe)?$/i.test(ffmpeg)) candidates.push(ffmpeg.replace(/ffmpeg(\.exe)?$/i, 'ffprobe$1'));
  candidates.push('ffprobe');
  for (const bin of candidates) {
    try {
      const out = await new Promise<string>((resolve, reject) => {
        let stdout = '';
        const proc = spawn(bin, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', mp4]);
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

/**
 * Sample ~`frames` evenly-spaced frames from `mp4Path`, scaled to `width`, and
 * return them as base64 PNG strings (in shot order). Falls back to 2 fps when the
 * duration can't be probed. Temp files are cleaned up.
 */
export async function sampleVideoFrames(
  mp4Path: string,
  opts: { frames?: number; width?: number } = {},
): Promise<string[]> {
  const frames = Math.max(1, opts.frames ?? 10);
  const width = Math.max(64, opts.width ?? 512);
  const dur = await probeDurationSeconds(mp4Path);
  const fps = dur && dur > 0 ? frames / dur : 2;

  const tmp = path.join(os.tmpdir(), `vcrit-frames-${Date.now()}-${Math.round(fps * 1000)}`);
  await fs.mkdir(tmp, { recursive: true });
  try {
    const pattern = path.join(tmp, 'f_%02d.png').replace(/\\/g, '/');
    await runFfmpeg(['-i', mp4Path, '-vf', `fps=${fps},scale=${width}:-1`, '-vsync', 'vfr', '-y', pattern]);
    const files = (await fs.readdir(tmp)).filter((f) => f.endsWith('.png')).sort();
    const out: string[] = [];
    for (const f of files) out.push((await fs.readFile(path.join(tmp, f))).toString('base64'));
    return out;
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}
