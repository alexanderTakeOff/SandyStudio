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
  }>;
  /** Optional music track. If absent, assembled mp4 keeps the per-shot audio. */
  music?: {
    bytes: Buffer;
    /** Container hint — driven by source filename ext or content sniffing. */
    ext: 'mp3' | 'wav' | 'm4a' | 'aac';
  };
}

export interface FfmpegStitchResult {
  /** Final assembled mp4, base64-encoded. */
  mp4Base64: string;
  /** Bytes count for telemetry / cost reporting. */
  sizeBytes: number;
  /** The exact ffmpeg command we ran — persisted in asset metadata for audit. */
  ffmpegCommand: string;
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
async function runFfmpeg(args: ReadonlyArray<string>): Promise<string> {
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
    const shotPaths: string[] = [];
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
      console.log('[stitch] wrote', fname, '→', shot.bytes.length, 'bytes');
      shotPaths.push(fpath);
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
    const concatList = shotPaths
      .map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`)
      .join('\n');
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
      args.push('-i', musicPath);
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
    if (musicPath) args.push('-shortest');
    args.push(outPath);

    await runFfmpeg(args);

    // 4. Read result.
    const mp4Bytes = await fs.readFile(outPath);
    const ffmpegCommand = `ffmpeg ${args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`;

    return {
      mp4Base64: mp4Bytes.toString('base64'),
      sizeBytes: mp4Bytes.length,
      ffmpegCommand,
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

/**
 * Build the concat-demuxer list contents for inspection or testing.
 * Pure function — no I/O. Exposed for unit tests.
 */
export function buildConcatList(shotPaths: ReadonlyArray<string>): string {
  return shotPaths
    .map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`)
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
    out.push('-i', args.musicPath);
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
