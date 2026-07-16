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

/** Default tail-CTA window, seconds before the (trimmed) end. */
export const DEFAULT_CTA_SECONDS = 3;

/** Tail-CTA type size (slightly larger than the brand caption for punch). */
export const CTA_FONT_SIZE = 60;

/**
 * Tail-CTA vertical anchor. `h/7` (~14% from the top) is a deliberate Shorts
 * safe-zone: it clears the right-rail action buttons (like/comment/share) because
 * it is centred, and it sits well above the bottom title/description UI. The
 * brand caption lives at the bottom (`y=h-h/6`), so the two never overlap in
 * geometry — and they never overlap in time either (brand plays at the head,
 * CTA at the tail).
 */
export const CTA_Y_EXPR = 'h/7';

/**
 * Default font for the drawtext overlay. Arial Black ships with Windows and was
 * verified present at C:\Windows\Fonts\ariblk.ttf. Override with SHORTS_FONT
 * (forward-slash path) on non-Windows hosts.
 */
export const DEFAULT_FONT_PATH =
  process.env.SHORTS_FONT?.trim() || 'C:/Windows/Fonts/ariblk.ttf';

/** Tail call-to-action burned into the LAST `durationSeconds` of the clip. */
export interface EndCtaOptions {
  /** CTA copy (short, 3-4 words). Comes from config — never hardcoded (CLAUDE.md §11). */
  text: string;
  /** How many seconds before the end the CTA shows. Defaults to DEFAULT_CTA_SECONDS. */
  durationSeconds?: number;
}

export interface MakeShortOptions {
  /** Overlay caption; null/undefined/empty → no overlay. */
  overlayText?: string | null;
  /** Overlay shows for the first N seconds of the (trimmed) clip. */
  overlaySeconds?: number;
  /** Trim start (seconds). Omit for whole-clip ("fill all"). */
  startSec?: number | null;
  /** Trim end (seconds, exclusive). Omit for "to the end". */
  endSec?: number | null;
  /** Tail CTA overlay; null/undefined/empty text → no CTA. */
  endCta?: EndCtaOptions | null;
  /**
   * Total output duration (seconds) — needed to place a tail CTA when the clip
   * is NOT trimmed to an explicit end. When a trim `endSec` is present the
   * builder derives duration itself; `makeShort` probes it otherwise.
   */
  clipDurationSec?: number | null;
  /** Font file for drawtext (forward-slash path). Defaults to DEFAULT_FONT_PATH. */
  fontFile?: string;
}

/**
 * Duration (seconds) of the produced clip, for tail-CTA placement. Prefers an
 * explicit `clipDurationSec`, else derives it from the trim window. Returns null
 * when the length is unknown (whole clip, no probe yet).
 */
function ctaClipDuration(opts: MakeShortOptions): number | null {
  if (opts.clipDurationSec != null && opts.clipDurationSec > 0) return opts.clipDurationSec;
  const start = opts.startSec ?? 0;
  const end = opts.endSec ?? null;
  if (end != null && end > start) return end - start;
  return null;
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

  const cta = opts.endCta;
  const ctaText = cta?.text?.trim();
  if (ctaText) {
    const total = ctaClipDuration(opts);
    if (total == null) {
      throw new Error(
        'endCta needs a known clip duration: pass clipDurationSec or a trim endSec (makeShort probes when neither is set).',
      );
    }
    const ctaSeconds = cta?.durationSeconds ?? DEFAULT_CTA_SECONDS;
    // Show only the LAST ctaSeconds — after the punch, at the tail, top-centre.
    const from = Math.max(0, total - ctaSeconds);
    const fontFile = escapeFilterPath(opts.fontFile || DEFAULT_FONT_PATH);
    const drawtext = [
      `drawtext=fontfile='${fontFile}'`,
      `text='${escapeDrawtext(ctaText)}'`,
      'fontcolor=white',
      `fontsize=${CTA_FONT_SIZE}`,
      'box=1',
      'boxcolor=black@0.55',
      'boxborderw=18',
      'x=(w-text_w)/2',
      `y=${CTA_Y_EXPR}`,
      `enable='gt(t\\,${from})'`,
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
  let effective = opts;
  // A tail CTA needs the total duration. When the clip is trimmed to an explicit
  // end the builder derives it; otherwise probe the source once here so the pure
  // builder never has to do I/O.
  if (opts.endCta?.text?.trim() && ctaClipDuration(opts) == null) {
    const dur = await probeDurationSeconds(inputPath);
    if (dur == null) {
      throw new Error(
        'endCta needs a clip duration: pass clipDurationSec or a trim endSec, or ensure ffprobe is available.',
      );
    }
    effective = { ...opts, clipDurationSec: dur };
  }
  await runFfmpeg(buildShortArgs(inputPath, outputPath, effective));
}

export interface VideoDimensions {
  width: number;
  height: number;
}

/**
 * Run ffprobe with the given args, trying FFPROBE_PATH, the ffprobe next to the
 * resolved ffmpeg, then a bare `ffprobe` on PATH. Returns stdout, or null if
 * every candidate failed. One place for ffprobe binary resolution + spawn.
 */
async function runFfprobe(args: string[]): Promise<string | null> {
  const candidates: string[] = [];
  if (process.env.FFPROBE_PATH?.trim()) candidates.push(process.env.FFPROBE_PATH.trim());
  const ffmpeg = await resolveFfmpegPath();
  if (ffmpeg && /ffmpeg(\.exe)?$/i.test(ffmpeg)) {
    candidates.push(ffmpeg.replace(/ffmpeg(\.exe)?$/i, 'ffprobe$1'));
  }
  candidates.push('ffprobe');

  for (const bin of candidates) {
    try {
      return await new Promise<string>((resolve, reject) => {
        let stdout = '';
        const proc = spawn(bin, args);
        proc.stdout.on('data', (c) => { stdout += String(c); });
        proc.on('error', reject);
        proc.on('exit', (code) => (code === 0 ? resolve(stdout) : reject(new Error(`ffprobe exit ${code}`))));
      });
    } catch {
      // try next candidate
    }
  }
  return null;
}

/**
 * Probe a video's pixel dimensions via ffprobe. Used to skip clips that are
 * already vertical. Returns null if ffprobe is unreachable or unparseable.
 */
export async function probeDimensions(videoPath: string): Promise<VideoDimensions | null> {
  const out = await runFfprobe([
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height',
    '-of', 'csv=s=x:p=0',
    videoPath,
  ]);
  if (out == null) return null;
  const m = out.trim().match(/^(\d+)x(\d+)/);
  return m ? { width: Number(m[1]), height: Number(m[2]) } : null;
}

/**
 * Probe a video's total duration in seconds via ffprobe. Used to place a tail
 * CTA on an un-trimmed clip. Returns null if ffprobe is unreachable/unparseable.
 */
export async function probeDurationSeconds(videoPath: string): Promise<number | null> {
  const out = await runFfprobe([
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'csv=p=0',
    videoPath,
  ]);
  if (out == null) return null;
  const s = parseFloat(out.trim());
  return Number.isFinite(s) && s > 0 ? s : null;
}

/** True when the clip is already portrait/vertical (height ≥ width) → skip conversion. */
export function isVertical(dims: VideoDimensions | null): boolean {
  return !!dims && dims.height >= dims.width;
}
