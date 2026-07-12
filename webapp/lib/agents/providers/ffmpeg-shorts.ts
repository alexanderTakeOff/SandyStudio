/**
 * ffmpeg-shorts.ts — turn a landscape (16:9) episode final-cut into a vertical
 * (9:16, 1080×1920) YouTube Short via a center-crop, with an optional burned-in
 * text overlay for the first few seconds.
 *
 * Created 2026-07-12 (Shorts-factory). Reuses `resolveFfmpegPath` / `runFfmpeg`
 * from ffmpeg-stitch.ts — no second binary-resolution or spawn path. The pure
 * builders (`buildShortFilter` / `buildShortArgs`) are exported for unit tests
 * and are the ONE place the ffmpeg geometry lives, so the deferred Distribution
 * "video to shorts" UI can drive the exact same conversion (start/end/overlay).
 *
 * Director decisions (2026-07-12): center-crop (not blur-pad), overlay
 * "SANDY the HOURGLASS" ~4s, upload unlisted-first.
 */

import { spawn } from 'node:child_process';
import { resolveFfmpegPath, runFfmpeg } from './ffmpeg-stitch';

/** Vertical Shorts master resolution. */
export const SHORT_WIDTH = 1080;
export const SHORT_HEIGHT = 1920;

/** Default overlay window, seconds from the (trimmed) start. */
export const DEFAULT_OVERLAY_SECONDS = 4;

/**
 * Default font for the drawtext overlay. Arial Black ships with Windows and was
 * verified present at C:\Windows\Fonts\ariblk.ttf. Override with SHORTS_FONT
 * (forward-slash path) on non-Windows hosts.
 */
export const DEFAULT_FONT_PATH =
  process.env.SHORTS_FONT?.trim() || 'C:/Windows/Fonts/ariblk.ttf';

export interface MakeShortOptions {
  /** Overlay caption; null/undefined/empty → no overlay. */
  overlayText?: string | null;
  /** Overlay shows for the first N seconds of the (trimmed) clip. */
  overlaySeconds?: number;
  /** Trim start (seconds). Omit for whole-clip ("fill all"). */
  startSec?: number | null;
  /** Trim end (seconds, exclusive). Omit for "to the end". */
  endSec?: number | null;
  /** Font file for drawtext (forward-slash path). Defaults to DEFAULT_FONT_PATH. */
  fontFile?: string;
}

/**
 * Escape a filesystem path for use inside an ffmpeg filter option value.
 * ffmpeg's filtergraph parser treats `:` as an option separator and `\` as an
 * escape, so a Windows path like `C:\Windows\Fonts\ariblk.ttf` must become
 * `C\:/Windows/Fonts/ariblk.ttf` (forward slashes + escaped drive colon).
 */
export function escapeFilterPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/:/g, '\\:');
}

/** Escape user text for a drawtext `text=` value (commas, colons, quotes, backslash). */
export function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/,/g, '\\,')
    .replace(/%/g, '\\%');
}

/**
 * Build the `-vf` filter string: center-crop to 9:16, scale to 1080×1920, then
 * (optionally) a drawtext caption enabled for the first `overlaySeconds`.
 * Pure — no I/O — so it is unit-testable and shared with the future UI.
 */
export function buildShortFilter(opts: MakeShortOptions = {}): string {
  // Center vertical strip of width = height*9/16, guarded so it never exceeds
  // the source width (handles near-square sources like 3:2 refs too).
  const chain = [
    "crop='min(iw,ih*9/16)':ih",
    `scale=${SHORT_WIDTH}:${SHORT_HEIGHT}`,
    'setsar=1',
  ];

  const text = opts.overlayText?.trim();
  if (text) {
    const seconds = opts.overlaySeconds ?? DEFAULT_OVERLAY_SECONDS;
    const fontFile = escapeFilterPath(opts.fontFile || DEFAULT_FONT_PATH);
    const drawtext = [
      `drawtext=fontfile='${fontFile}'`,
      `text='${escapeDrawtext(text)}'`,
      'fontcolor=white',
      'fontsize=54',
      'box=1',
      'boxcolor=black@0.45',
      'boxborderw=16',
      'x=(w-text_w)/2',
      'y=h-h/6',
      // comma inside the enable expression must be escaped so it doesn't split
      // the comma-chained filtergraph.
      `enable='lt(t\\,${seconds})'`,
    ].join(':');
    chain.push(drawtext);
  }

  return chain.join(',');
}

/**
 * Build the full ffmpeg argv for one short. Pure — no I/O. `-ss` goes BEFORE
 * `-i` (fast seek); with a pre-input seek the drawtext clock restarts at 0, so
 * the "first N seconds" overlay still lands at the clip's visible start.
 */
export function buildShortArgs(
  inputPath: string,
  outputPath: string,
  opts: MakeShortOptions = {},
): string[] {
  const start = opts.startSec ?? null;
  const end = opts.endSec ?? null;
  const args: string[] = ['-y'];
  if (start != null && start > 0) args.push('-ss', String(start));
  args.push('-i', inputPath);
  if (end != null) {
    const dur = end - (start ?? 0);
    if (dur > 0) args.push('-t', String(dur));
  }
  args.push(
    '-vf', buildShortFilter(opts),
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '20',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-movflags', '+faststart',
    outputPath,
  );
  return args;
}

/** Render one Short to disk. Reuses the shared ffmpeg runner (errors + binary resolution). */
export async function makeShort(
  inputPath: string,
  outputPath: string,
  opts: MakeShortOptions = {},
): Promise<void> {
  await runFfmpeg(buildShortArgs(inputPath, outputPath, opts));
}

export interface VideoDimensions {
  width: number;
  height: number;
}

/**
 * Probe a video's pixel dimensions via ffprobe (ffprobe ships beside the
 * resolved ffmpeg). Used to skip clips that are already vertical. Returns null
 * if ffprobe is unreachable or the stream can't be read.
 */
export async function probeDimensions(videoPath: string): Promise<VideoDimensions | null> {
  const candidates: string[] = [];
  if (process.env.FFPROBE_PATH?.trim()) candidates.push(process.env.FFPROBE_PATH.trim());
  const ffmpeg = await resolveFfmpegPath();
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
          '-select_streams', 'v:0',
          '-show_entries', 'stream=width,height',
          '-of', 'csv=s=x:p=0',
          videoPath,
        ]);
        proc.stdout.on('data', (c) => { stdout += String(c); });
        proc.on('error', reject);
        proc.on('exit', (code) => (code === 0 ? resolve(stdout) : reject(new Error(`ffprobe exit ${code}`))));
      });
      const m = out.trim().match(/^(\d+)x(\d+)/);
      if (m) return { width: Number(m[1]), height: Number(m[2]) };
      return null;
    } catch {
      // try next candidate
    }
  }
  return null;
}

/** True when the clip is already portrait/vertical (height ≥ width) → skip conversion. */
export function isVertical(dims: VideoDimensions | null): boolean {
  return !!dims && dims.height >= dims.width;
}
