// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/providers/ffmpeg-stitch.ts
//
// Local-ffmpeg episode assembly for EXEC-STITCH (Phase A.2 PR β, 2026-05-08).
// Per `specs/system/assembly_tool.md` §D-002 (APPROVED) ffmpeg is the chosen
// assembly tool — full automation, no subscription cost, fits autopilot mode.
//
// What this module does:
//   1. Probe `ffmpeg -version`. If absent, return a typed error so the caller
//      surfaces a clean "install ffmpeg" message to the Director instead of a
//      cryptic spawn failure.
//   2. Build a concat-demuxer file list from the input shot mp4s.
//   3. Invoke ffmpeg with the canonical command from assembly_tool.md.
//   4. Return the assembled mp4 bytes (base64 — matches the persistBinary
//      contract used by EXEC-VGEN / EXEC-EDIT).
//
// All file I/O happens under `os.tmpdir()` — never under the repo. The temp
// directory is removed after assembly, success or failure.
// ──────────────────────────────────────────────────────────────────────────────

import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

/** Inputs for one episode assembly. */
export interface FfmpegStitchInput {
  /** Per-shot mp4 inputs in storyboard order. Each entry is one shot file. */
  shotMp4Bytes: ReadonlyArray<{
    /** Stable shot id used for filename (e.g. "ss-s14-e01-a1-sc01-sh01"). */
    shotId: string;
    /** Raw mp4 bytes for this shot. */
    bytes: Buffer;
    /**
     * Optional desired output duration in seconds. When set, the concat
     * demuxer emits an `outpoint <seconds>` directive so this shot is
     * trimmed to exactly that length. Required when the provider clip is
     * longer than the animatic intent (e.g. Veo Standard img2vid returns
     * fixed 8s clips but animatic shot may want 3s).
     */
    durationSeconds?: number;
    /**
     * 2026-06-06 — optional head trim in seconds. When set, the concat
     * demuxer emits an `inpoint <seconds>` directive so this shot starts
     * reading the source at this timestamp. Pairs with `durationSeconds`
     * for shots where Director wants to drop a slow lead-in without
     * re-rendering. Default 0 = read from the start of the file.
     */
    inpointSeconds?: number;
  }>;
  /** Optional music track. If absent, assembled mp4 keeps the per-shot audio. */
  music?: {
    bytes: Buffer;
    /** Container hint — driven by source filename ext or content sniffing. */
    ext: 'mp3' | 'wav' | 'm4a' | 'aac';
    // ── Director audio shaping (2026-06-06) ───────────────────────────────
    // Mirrors the `AudioTrack` shaping fields from animatic-shotlist.ts; the
    // EXEC-STITCH runner forwards them here so all `afade`/`atrim` filter
    // construction lives in one place. All optional — absence = no transform.
    fade_in_seconds?: number;
    fade_out_seconds?: number;
    trim_in_seconds?: number;
    trim_out_seconds?: number;
  };
}

export interface FfmpegStitchResult {
  /** Final assembled mp4, base64-encoded. */
  mp4Base64: string;
  /** Bytes count for telemetry / cost reporting. */
  sizeBytes: number;
  /** The exact ffmpeg command we ran — persisted in asset metadata for audit. */
  ffmpegCommand: string;
  /**
   * Final mp4 duration in seconds — probed via ffprobe on the output. Lets
   * EXEC-STITCH persist the real cut length in VID-final_cut metadata
   * (closing the audit gap where metadata was null after the first E02 run).
   * Null when ffprobe is unavailable on PATH.
   */
  durationSeconds: number | null;
}

export class FfmpegStitchError extends Error {
  constructor(
    message: string,
    public readonly kind:
      | 'ffmpeg_not_installed'
      | 'no_input_shots'
      | 'ffmpeg_failed'
      | 'concat_io',
    public readonly stderr?: string,
  ) {
    super(message);
    this.name = 'FfmpegStitchError';
  }
}

/**
 * Resolve the ffmpeg binary path. Strategy:
 *   1. `FFMPEG_PATH` env var — explicit override.
 *   2. Plain `ffmpeg` — works when binary is on PATH (Linux/macOS, Windows
 *      with shell that inherited the right PATH).
 *   3. Windows winget canonical install path — covers Director's setup
 *      where the user's persistent PATH includes winget but the spawning
 *      Node process's stripped-down env didn't inherit it.
 *   4. Common Linux/macOS install locations.
 *
 * Returns the FIRST path whose `-version` probe succeeds, or null if none.
 */
async function probeFfmpegBinary(candidate: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(candidate, ['-version'], { stdio: 'ignore' });
    proc.on('error', () => resolve(false));
    proc.on('exit', (code) => resolve(code === 0));
  });
}

/**
 * 2026-06-06 — probe an mp4 file's duration via ffprobe. Used to stamp
 * VID-final_cut metadata with the real assembled length (previously null in
 * DB for the first E02 cut). Resolves the ffprobe binary the same way
 * `resolveFfmpegPath` resolves ffmpeg: env override → PATH → winget canonical
 * path. Throws if no ffprobe is reachable.
 */
async function probeMp4Duration(mp4Path: string): Promise<number | null> {
  const candidates: string[] = [];
  if (process.env.FFPROBE_PATH?.trim()) candidates.push(process.env.FFPROBE_PATH.trim());
  // 2026-06-08 — derive ffprobe from the RESOLVED ffmpeg path: ffprobe ships in
  // the same bin/ dir. The hardcoded winget candidate below was pinned to
  // ffmpeg-7.1 while resolveFfmpegPath finds ffmpeg-8.1.1 under a different
  // root, so ffprobe was never found → final_cut metadata.duration_seconds was
  // null on every render (Director's missing-duration audit gap).
  const resolvedFfmpeg = await resolveFfmpegPath();
  if (resolvedFfmpeg && /ffmpeg(\.exe)?$/i.test(resolvedFfmpeg)) {
    candidates.push(resolvedFfmpeg.replace(/ffmpeg(\.exe)?$/i, 'ffprobe$1'));
  }
  candidates.push('ffprobe');
  if (process.platform === 'win32') {
    candidates.push(
      'C:\\Program Files\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-7.1-full_build\\bin\\ffprobe.exe',
    );
  }
  for (const bin of candidates) {
    try {
      const out = await new Promise<string>((resolve, reject) => {
        let stdout = '';
        const proc = spawn(bin, [
          '-v', 'error',
          '-show_entries', 'format=duration',
          '-of', 'default=noprint_wrappers=1:nokey=1',
          mp4Path,
        ]);
        proc.stdout.on('data', (chunk) => { stdout += String(chunk); });
        proc.on('error', reject);
        proc.on('exit', (code) => code === 0 ? resolve(stdout) : reject(new Error(`ffprobe exit ${code}`)));
      });
      const dur = parseFloat(out.trim());
      if (Number.isFinite(dur) && dur > 0) return Math.round(dur * 1000) / 1000;
      return null;
    } catch {
      // try next candidate
    }
  }
  return null;
}

let cachedFfmpegPath: string | null | undefined = undefined;

export async function resolveFfmpegPath(): Promise<string | null> {
  if (cachedFfmpegPath !== undefined) return cachedFfmpegPath;

  const envPath = process.env.FFMPEG_PATH?.trim();
  const candidates: string[] = [];
  if (envPath) candidates.push(envPath);
  candidates.push('ffmpeg');
  // Windows winget canonical install — Gyan.FFmpeg full build.
  if (process.platform === 'win32') {
    const userProfile =
      process.env.USERPROFILE ?? process.env.HOMEPATH ?? null;
    if (userProfile) {
      // Glob-ish: any version directory under WinGet/Packages.
      // We try the well-known 8.1.1 layout first; fall through is fine since
      // the env override path covers other versions.
      candidates.push(
        `${userProfile}\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.1-full_build\\bin\\ffmpeg.exe`,
      );
    }
  }
  // Common Unix install locations.
  candidates.push('/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/opt/homebrew/bin/ffmpeg');

  for (const cand of candidates) {
    if (await probeFfmpegBinary(cand)) {
      cachedFfmpegPath = cand;
      return cand;
    }
  }
  cachedFfmpegPath = null;
  return null;
}

/** Probe `ffmpeg -version` to confirm the binary is on PATH. */
export async function ffmpegInstalled(): Promise<boolean> {
  return (await resolveFfmpegPath()) !== null;
}

/**
 * Run ffmpeg with the given args, capturing stderr for error reporting.
 * Resolves with stderr (ffmpeg writes its progress logs there) on exit code 0;
 * rejects with FfmpegStitchError otherwise.
 */
// 2026-06-06 — exported so music-processor.ts can reuse the same spawn +
// stderr-capture path without duplicating the binary-resolution dance.
export async function runFfmpeg(args: ReadonlyArray<string>): Promise<string> {
  const ffmpegBin = await resolveFfmpegPath();
  if (!ffmpegBin) {
    throw new FfmpegStitchError(
      'ffmpeg binary not found on PATH or via FFMPEG_PATH/winget fallbacks. Install ffmpeg (winget install ffmpeg / brew install ffmpeg / apt install ffmpeg) and restart the Inngest dev server.',
      'ffmpeg_not_installed',
    );
  }
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegBin, [...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    proc.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(
          new FfmpegStitchError(
            'ffmpeg binary not found on PATH. Install ffmpeg (winget install ffmpeg / brew install ffmpeg / apt install ffmpeg) and restart the Inngest dev server.',
            'ffmpeg_not_installed',
          ),
        );
        return;
      }
      reject(new FfmpegStitchError(err.message, 'ffmpeg_failed'));
    });
    proc.on('exit', (code) => {
      if (code === 0) {
        resolve(stderr);
      } else {
        reject(
          new FfmpegStitchError(
            `ffmpeg exited with code ${code}`,
            'ffmpeg_failed',
            stderr.slice(-2000),
          ),
        );
      }
    });
  });
}

/**
 * Assemble a final-cut mp4 from per-shot inputs.
 *
 * Pipeline:
 *   1. Write each shot mp4 + (optional) music track to a per-run temp dir.
 *   2. Build a concat-demuxer list file (`file '<path>'\n` per shot).
 *   3. Run ffmpeg in two phases — first re-encodes each shot to a uniform
 *      codec/timebase (Veo outputs may have variable container quirks that
 *      the concat demuxer rejects), then concatenates and muxes optional
 *      music. We collapse this into ONE call using the `-f concat` demuxer
 *      with `-safe 0` and a trailing `-c:v libx264 -c:a aac` re-encode pass
 *      so the output is browser-friendly and YouTube-ready.
 *   4. Read the result back as base64. Cleanup runs in `finally`.
 */
export async function ffmpegStitchEpisode(
  input: FfmpegStitchInput,
): Promise<FfmpegStitchResult> {
  if (input.shotMp4Bytes.length === 0) {
    throw new FfmpegStitchError(
      'ffmpegStitchEpisode requires at least one shot mp4',
      'no_input_shots',
    );
  }

  const installed = await ffmpegInstalled();
  if (!installed) {
    throw new FfmpegStitchError(
      'ffmpeg binary not found on PATH. Install ffmpeg (winget install ffmpeg / brew install ffmpeg / apt install ffmpeg) and restart the Inngest dev server.',
      'ffmpeg_not_installed',
    );
  }

  // Resolve `os.tmpdir()` through `fs.realpath` to expand any 8.3 short
  // names (e.g. `C:\Users\NAVIAV~1\AppData\Local\Temp` → the full long form
  // `C:\Users\NAVIA VISION ONE\...`). ffmpeg refuses to open files via short
  // path names inside the concat demuxer's single-quoted form on Windows
  // (observed 2026-05-08: "Impossible to open 'C:/Users/NAVIAV~1/...'"), so
  // we make the path canonical before writing.
  const tmpRoot = await fs.realpath(os.tmpdir());
  const tmpDir = await fs.mkdtemp(path.join(tmpRoot, 'ss-stitch-'));
  // eslint-disable-next-line no-console
  console.log('[stitch] tmp dir:', tmpDir, 'shots:', input.shotMp4Bytes.length);
  try {
    // 1. Write per-shot mp4s + music.
    const shotEntries: ConcatShotEntry[] = [];
    for (let i = 0; i < input.shotMp4Bytes.length; i++) {
      const shot = input.shotMp4Bytes[i]!;
      // Phase A.2 PR β fix 2026-05-08: keep filenames ASCII-only and avoid
      // mixing case + the canonical SS- prefix from shotId so ffmpeg's
      // concat demuxer can't find ANY excuse to refuse opening the path.
      // Sanitization mirrors the existing regenerate-video safeShotId pattern.
      const safeShotId = shot.shotId.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
      const fname = `shot-${String(i).padStart(3, '0')}-${safeShotId}.mp4`;
      const fpath = path.join(tmpDir, fname);
      await fs.writeFile(fpath, shot.bytes);
      // eslint-disable-next-line no-console
      console.log(
        '[stitch] wrote',
        fname,
        '→',
        shot.bytes.length,
        'bytes',
        shot.durationSeconds !== undefined ? `(trim→${shot.durationSeconds}s)` : '',
        shot.inpointSeconds ? `(head→${shot.inpointSeconds}s)` : '',
      );
      const entry: ConcatShotEntry = { path: fpath };
      if (shot.durationSeconds !== undefined && shot.durationSeconds > 0) {
        entry.durationSeconds = shot.durationSeconds;
      }
      if (shot.inpointSeconds !== undefined && shot.inpointSeconds > 0) {
        entry.inpointSeconds = shot.inpointSeconds;
      }
      shotEntries.push(entry);
    }

    let musicPath: string | null = null;
    if (input.music) {
      const mfname = `music.${input.music.ext}`;
      musicPath = path.join(tmpDir, mfname);
      await fs.writeFile(musicPath, input.music.bytes);
    }

    // 2. Build concat list file.
    // ffmpeg's concat demuxer parses single-quoted file paths. On Windows the
    // path.join produces backslashes which ffmpeg refuses to open inside the
    // single-quoted form ("Impossible to open '<path>'"). Convert to forward
    // slashes — ffmpeg accepts both on Windows and forward slashes survive
    // the concat parser intact.
    // Per-shot `outpoint` directive trims each input to the animatic-intended
    // duration — required when provider clip length diverges from storyboard
    // (e.g. Veo Standard img2vid returns fixed 8s clips but a 3s shot is
    // wanted). 2026-05-13 — E20 stitched at 96s instead of 54s because
    // Veo Fast=4s / Standard=8s clips played at native length.
    const concatList = buildConcatList(shotEntries);
    const listPath = path.join(tmpDir, 'concat-list.txt');
    await fs.writeFile(listPath, concatList);

    // 3. Run ffmpeg.
    // Concat demuxer + re-encode to stabilize container quirks across shots.
    // Music (when present) replaces the per-shot audio: -map 0:v from concat
    // input + -map 1:a from music. -shortest stops at the shorter of video or
    // music so we don't dangle silence at the end. Without music, we use
    // -map 0:v + -map 0:a? to keep per-shot audio (the `?` flag makes the
    // audio mapping optional — Veo mp4s sometimes have no audio stream).
    const outPath = path.join(tmpDir, 'final-cut.mp4');
    const args: string[] = [
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listPath,
    ];
    if (musicPath) {
      // Loop the music if it's shorter than the stitched video. Without
      // `-stream_loop -1` and with `-shortest` further down, ffmpeg cuts
      // the final cut to the music's length — Director uploaded a 32s
      // loop file and the 54s episode got truncated to 32s.
      // 2026-05-13 regression caught right after STITCH ran on E20.
      args.push('-stream_loop', '-1', '-i', musicPath);
    }
    // 2026-06-06 — Director audio shaping. Pure builder (`buildMusicAudioFilter`)
    // returns null when no shaping is requested → no flag means zero overhead,
    // ffmpeg simply passes the audio through.
    const totalVideoSeconds = input.shotMp4Bytes.reduce(
      (acc, s) => acc + (s.durationSeconds ?? 0),
      0,
    );
    const audioFilter = musicPath && input.music
      ? buildMusicAudioFilter(input.music, totalVideoSeconds)
      : null;
    if (audioFilter) {
      args.push('-filter:a', audioFilter);
    }
    args.push(
      '-map',
      '0:v',
      '-map',
      musicPath ? '1:a' : '0:a?',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-movflags',
      '+faststart',
    );
    if (musicPath) {
      // 2026-06-06 — when music loops infinitely (`-stream_loop -1`), the
      // video stream is the only finite track; without explicit `-t` ffmpeg
      // would render forever. Compute the target total from the (already
      // trimmed) per-shot durations and bind output length to that. This
      // ALSO replaces the prior `-shortest` flag which produced an abrupt
      // cut at the music end if shortest didn't behave as expected (Director
      // saw the E02 final cut end "как обрыв"). Music fade-out is now
      // pre-anchored in the audio filter (above) so the fade lands cleanly.
      const totalVideoSeconds = input.shotMp4Bytes.reduce(
        (acc, s) => acc + (s.durationSeconds ?? 0),
        0,
      );
      if (totalVideoSeconds > 0) {
        args.push('-t', totalVideoSeconds.toFixed(3));
      } else {
        // No per-shot durations supplied → fall back to legacy `-shortest`
        // behaviour so we don't render forever on edge cases.
        args.push('-shortest');
      }
    }
    args.push(outPath);

    await runFfmpeg(args);

    // 4. Read result.
    const mp4Bytes = await fs.readFile(outPath);
    const ffmpegCommand = `ffmpeg ${args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`;

    // 2026-06-06 — probe the actual output duration so VID-final_cut metadata
    // carries it (Director hit a metadata=null case earlier today and we had
    // no audit trail of the real cut length). Failure is non-fatal — we
    // simply omit duration from the result.
    let durationSeconds: number | null = null;
    try {
      durationSeconds = await probeMp4Duration(outPath);
    } catch {
      // ffprobe missing or output unparseable — leave null.
    }

    return {
      mp4Base64: mp4Bytes.toString('base64'),
      sizeBytes: mp4Bytes.length,
      ffmpegCommand,
      durationSeconds,
    };
  } finally {
    // Best-effort cleanup. Don't throw on cleanup failures.
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

/** One concat-list entry: a shot file with optional trim window. */
export interface ConcatShotEntry {
  /** Absolute path to the shot mp4 on disk. */
  path: string;
  /**
   * Optional desired playback duration in seconds. With `inpoint=0` this maps
   * directly to ffmpeg's `outpoint <seconds>`; with a non-zero inpoint the
   * outpoint becomes `inpoint + durationSeconds` (ffmpeg's outpoint is an
   * absolute source timestamp, not a relative duration).
   */
  durationSeconds?: number;
  /**
   * 2026-06-06 — optional head trim. When set, emits `inpoint <seconds>`
   * before the `file '<path>'` line so concat reads the source starting at
   * this timestamp. Use 0/undefined to read from the file start.
   */
  inpointSeconds?: number;
}

/**
 * Build the music-track audio filter chain for ffmpeg's `-filter:a` flag.
 * Pure function — exposed for unit tests.
 *
 * Order matters: `atrim` cuts the source first so subsequent fades anchor to
 * the trimmed window. `afade=t=out` needs an explicit start timestamp (`st=`)
 * because we strip `-shortest` when the music loops infinitely; the start is
 * derived from the total stitched video duration (= sum of per-shot trimmed
 * durations) minus the requested fade length.
 *
 * Returns `null` when no shaping is requested — the caller then omits the
 * `-filter:a` flag entirely and ffmpeg passes the audio through.
 *
 * 2026-06-06 — added alongside the animatic = final-cut consolidation fix
 * after Director hit "конец как обрыв" on the first E02 final cut.
 */
export function buildMusicAudioFilter(
  music: {
    fade_in_seconds?: number;
    fade_out_seconds?: number;
    trim_in_seconds?: number;
    trim_out_seconds?: number;
  },
  totalVideoSeconds: number,
): string | null {
  const segments: string[] = [];
  const trimIn = music.trim_in_seconds;
  const trimOut = music.trim_out_seconds;
  if (
    (typeof trimIn === 'number' && trimIn > 0) ||
    (typeof trimOut === 'number' && trimOut > 0)
  ) {
    const parts: string[] = [];
    if (typeof trimIn === 'number' && trimIn > 0) parts.push(`start=${trimIn}`);
    if (typeof trimOut === 'number' && trimOut > 0) parts.push(`end=${trimOut}`);
    segments.push(`atrim=${parts.join(':')}`);
    segments.push('asetpts=PTS-STARTPTS');
  }
  if (typeof music.fade_in_seconds === 'number' && music.fade_in_seconds > 0) {
    segments.push(`afade=t=in:d=${music.fade_in_seconds}`);
  }
  if (
    typeof music.fade_out_seconds === 'number' &&
    music.fade_out_seconds > 0 &&
    totalVideoSeconds > music.fade_out_seconds
  ) {
    const startAt = totalVideoSeconds - music.fade_out_seconds;
    segments.push(
      `afade=t=out:st=${startAt.toFixed(3)}:d=${music.fade_out_seconds}`,
    );
  }
  return segments.length > 0 ? segments.join(',') : null;
}

/**
 * Build the concat-demuxer list contents for inspection or testing.
 * Pure function — no I/O. Exposed for unit tests.
 *
 * Output shape:
 *   file '<path>'
 *   outpoint <seconds>    # only when durationSeconds > 0
 *
 * `outpoint` is the canonical concat-demuxer trim directive (end timestamp
 * in the input stream). Because the runner re-encodes via libx264 the cut is
 * frame-accurate rather than keyframe-bound.
 */
export function buildConcatList(
  shots: ReadonlyArray<ConcatShotEntry>,
): string {
  return shots
    .map((s) => {
      const fileLine = `file '${s.path.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`;
      const lines: string[] = [fileLine];
      // 2026-06-06 — `inpoint` is an absolute source timestamp at which the
      // demuxer starts reading; `outpoint` is the absolute timestamp at which
      // it stops. With a non-zero inpoint, outpoint must therefore be
      // inpoint + durationSeconds (NOT the bare duration), otherwise ffmpeg
      // would read `[inpoint, durationSeconds]` instead of the intended
      // `[inpoint, inpoint+durationSeconds]`. The order on the line is the
      // canonical concat-demuxer order: `file '...'` first, then `inpoint`,
      // then `outpoint`.
      const inpoint = s.inpointSeconds;
      const hasInpoint = typeof inpoint === 'number' && inpoint > 0;
      if (hasInpoint) lines.push(`inpoint ${inpoint!.toFixed(3)}`);
      if (s.durationSeconds !== undefined && s.durationSeconds > 0) {
        const outpoint = hasInpoint ? inpoint! + s.durationSeconds : s.durationSeconds;
        lines.push(`outpoint ${outpoint.toFixed(3)}`);
      }
      return lines.join('\n');
    })
    .join('\n');
}

/**
 * Compose the ffmpeg argv for the given inputs. Pure function — exposed for
 * unit tests so we can assert the command shape without spawning ffmpeg.
 */
export function buildFfmpegArgs(args: {
  listPath: string;
  outPath: string;
  musicPath: string | null;
}): string[] {
  const out: string[] = [
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    args.listPath,
  ];
  if (args.musicPath) {
    out.push('-stream_loop', '-1', '-i', args.musicPath);
  }
  out.push(
    '-map',
    '0:v',
    '-map',
    args.musicPath ? '1:a' : '0:a?',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
  );
  if (args.musicPath) out.push('-shortest');
  out.push(args.outPath);
  return out;
}
