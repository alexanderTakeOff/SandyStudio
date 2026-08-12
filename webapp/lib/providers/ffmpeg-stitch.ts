// ──────────────────────────────────────────────────────────────────────────────
// lib/providers/ffmpeg-stitch.ts
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
 * The ONE message for "we could not launch ffmpeg". It must not assert a cause
 * it has not established: a failed spawn means "could not start the process",
 * which is a missing binary OR a saturated machine. The old text asserted "not
 * installed → install it" and sent the Director to install a binary that had
 * been sitting on disk for two months (E29, 2026-07-16).
 */
const FFMPEG_UNREACHABLE_MESSAGE =
  'ffmpeg could not be launched — every candidate (FFMPEG_PATH, PATH, winget/unix fallbacks) failed to spawn. ' +
  'This is often TRANSIENT (the machine could not spawn a process — e.g. another job saturating it), not a missing binary: retry first. ' +
  'If it persists, check that ffmpeg is installed (winget install ffmpeg / brew install ffmpeg / apt install ffmpeg) or set FFMPEG_PATH.';

/** True when `<candidate> -version` exits 0 — i.e. the binary is launchable. */
async function probeBinary(candidate: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(candidate, ['-version'], { stdio: 'ignore' });
    proc.on('error', () => resolve(false));
    proc.on('exit', (code) => resolve(code === 0));
  });
}

/**
 * WinGet package roots that can hold a Gyan.FFmpeg install. BOTH are real:
 * winget writes per-user installs under %LOCALAPPDATA% and machine-scope ones
 * under %ProgramFiles%, and we can't know which scope was used.
 */
function wingetPackageRoots(): string[] {
  const roots: string[] = [];
  const localAppData = process.env.LOCALAPPDATA?.trim();
  const userProfile = process.env.USERPROFILE?.trim();
  if (localAppData) {
    roots.push(path.join(localAppData, 'Microsoft', 'WinGet', 'Packages'));
  } else if (userProfile) {
    roots.push(path.join(userProfile, 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages'));
  }
  const programFiles = process.env.ProgramFiles?.trim() ?? 'C:\\Program Files';
  roots.push(path.join(programFiles, 'WinGet', 'Packages'));
  return roots;
}

/**
 * Order ffmpeg build directories newest-version-first, so a winget upgrade is
 * picked up on its own. Pure — exported for tests.
 *
 * 2026-07-17 — this replaces a hardcoded `ffmpeg-8.1.1-full_build` candidate.
 * The box had been upgraded to 8.1.2, so that candidate pointed at a directory
 * that no longer existed and the winget fallback silently never fired. Version
 * strings must never be pinned in code: winget bumps them without warning.
 */
export function sortFfmpegBuildDirsDesc(names: ReadonlyArray<string>): string[] {
  const version = (n: string): number[] =>
    (n.match(/(\d+(?:\.\d+)*)/)?.[1] ?? '0').split('.').map(Number);
  return [...names].sort((a, b) => {
    const va = version(a);
    const vb = version(b);
    for (let i = 0; i < Math.max(va.length, vb.length); i++) {
      const diff = (vb[i] ?? 0) - (va[i] ?? 0);
      if (diff !== 0) return diff;
    }
    return a.localeCompare(b);
  });
}

/**
 * Discover winget-installed ffmpeg/ffprobe binaries by GLOBBING the package
 * tree — never by pinning a version. Newest build wins. Returns [] off Windows
 * or when nothing is installed; unreadable dirs are skipped, not fatal.
 */
async function wingetBinCandidates(bin: 'ffmpeg' | 'ffprobe'): Promise<string[]> {
  if (process.platform !== 'win32') return [];
  const found: string[] = [];
  // The winget shim dir — present when winget registered its Links on PATH.
  const localAppData = process.env.LOCALAPPDATA?.trim();
  if (localAppData) {
    found.push(path.join(localAppData, 'Microsoft', 'WinGet', 'Links', `${bin}.exe`));
  }
  for (const root of wingetPackageRoots()) {
    let packages: string[];
    try {
      packages = await fs.readdir(root);
    } catch {
      continue; // root absent on this machine — normal
    }
    for (const pkg of packages.filter((p) => /ffmpeg/i.test(p))) {
      const pkgDir = path.join(root, pkg);
      let builds: string[];
      try {
        builds = await fs.readdir(pkgDir);
      } catch {
        continue;
      }
      const buildDirs = sortFfmpegBuildDirsDesc(builds.filter((b) => /^ffmpeg-/i.test(b)));
      for (const build of buildDirs) {
        found.push(path.join(pkgDir, build, 'bin', `${bin}.exe`));
      }
    }
  }
  return found;
}

/**
 * Resolved ffmpeg path. ONLY successful resolutions are cached — a failed probe
 * is never memoised.
 *
 * 2026-07-16 — this used to cache `null` too. A probe can fail transiently (the
 * box was saturated with ffmpeg processes cutting shorts, so `spawn` itself
 * failed), and the cached `null` then blinded the whole server process for the
 * rest of its life: every later stitch/animatic/music call reported "ffmpeg not
 * installed" while ffmpeg sat on disk, working. E29 lost ~40 minutes to it.
 * Re-probing costs a few ms; a permanently blind process costs a production day.
 */
let cachedFfmpegPath: string | null = null;

export async function resolveFfmpegPath(): Promise<string | null> {
  if (cachedFfmpegPath) return cachedFfmpegPath;

  const candidates: string[] = [];
  const envPath = process.env.FFMPEG_PATH?.trim();
  if (envPath) candidates.push(envPath);
  candidates.push('ffmpeg');
  candidates.push(...(await wingetBinCandidates('ffmpeg')));
  // Common Unix install locations.
  candidates.push('/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/opt/homebrew/bin/ffmpeg');

  for (const cand of candidates) {
    if (await probeBinary(cand)) {
      cachedFfmpegPath = cand;
      return cand;
    }
  }
  return null;
}

/**
 * Resolved ffprobe path. Same success-only caching rule as ffmpeg above, and
 * the same resolution order: env override → the ffprobe sitting next to the
 * resolved ffmpeg → PATH → winget glob → unix locations.
 */
let cachedFfprobePath: string | null = null;

export async function resolveFfprobePath(): Promise<string | null> {
  if (cachedFfprobePath) return cachedFfprobePath;

  const candidates: string[] = [];
  const envPath = process.env.FFPROBE_PATH?.trim();
  if (envPath) candidates.push(envPath);
  // ffprobe ships in the same bin/ dir as ffmpeg — derive it from whatever
  // ffmpeg we just resolved before falling back to a bare PATH lookup.
  const resolvedFfmpeg = await resolveFfmpegPath();
  if (resolvedFfmpeg && /ffmpeg(\.exe)?$/i.test(resolvedFfmpeg)) {
    candidates.push(resolvedFfmpeg.replace(/ffmpeg(\.exe)?$/i, 'ffprobe$1'));
  }
  candidates.push('ffprobe');
  candidates.push(...(await wingetBinCandidates('ffprobe')));
  candidates.push('/usr/bin/ffprobe', '/usr/local/bin/ffprobe', '/opt/homebrew/bin/ffprobe');

  for (const cand of candidates) {
    if (await probeBinary(cand)) {
      cachedFfprobePath = cand;
      return cand;
    }
  }
  return null;
}

/** Probe `ffmpeg -version` to confirm the binary is on PATH. */
export async function ffmpegInstalled(): Promise<boolean> {
  return (await resolveFfmpegPath()) !== null;
}

/**
 * Run ffprobe and return stdout, or null when ffprobe is unreachable or exits
 * non-zero. THE one ffprobe spawn path — `sample-frames`, `ffmpeg-shorts` and
 * `extract-frames` each used to carry their own copy of this dance.
 */
export async function runFfprobe(args: ReadonlyArray<string>): Promise<string | null> {
  const bin = await resolveFfprobePath();
  if (!bin) return null;
  try {
    return await new Promise<string>((resolve, reject) => {
      let stdout = '';
      const proc = spawn(bin, [...args]);
      proc.stdout.on('data', (chunk) => { stdout += String(chunk); });
      proc.on('error', reject);
      proc.on('exit', (code) => (code === 0 ? resolve(stdout) : reject(new Error(`ffprobe exit ${code}`))));
    });
  } catch {
    return null;
  }
}

/**
 * Probe a media file's duration in seconds via ffprobe, or null when it can't
 * be determined. Used to stamp VID-final_cut metadata with the real assembled
 * length and to space out the Visual Critic's frame sampling.
 */
export async function probeDurationSeconds(file: string): Promise<number | null> {
  const out = await runFfprobe([
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    file,
  ]);
  if (out == null) return null;
  const dur = parseFloat(out.trim());
  return Number.isFinite(dur) && dur > 0 ? Math.round(dur * 1000) / 1000 : null;
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
    throw new FfmpegStitchError(FFMPEG_UNREACHABLE_MESSAGE, 'ffmpeg_not_installed');
  }
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegBin, [...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    proc.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        // The path probed OK moments ago, so ENOENT here is not "never
        // installed" — report the resolved path so the next reader can see
        // WHICH binary vanished rather than being told to install ffmpeg.
        reject(
          new FfmpegStitchError(
            `ffmpeg vanished between probe and run (ENOENT on "${ffmpegBin}"). ${FFMPEG_UNREACHABLE_MESSAGE}`,
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
    throw new FfmpegStitchError(FFMPEG_UNREACHABLE_MESSAGE, 'ffmpeg_not_installed');
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
      durationSeconds = await probeDurationSeconds(outPath);
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

/**
 * Order the BRANDED-master concat inputs: [intro?, body, outro?]. Pure — tested.
 *
 * 2026-07-13 — the branded master is a SECOND, music-FREE `ffmpegStitchEpisode`
 * pass over these three segments, each carrying its own baked audio (the intro
 * sting, the clean body's mix, the outro music). Passing NO `music` field keeps
 * `-map 0:a?` so each segment's own audio survives (a `music` field would map
 * `1:a` and clobber all three — see the audio-map note in `buildFfmpegArgs`).
 *
 * A bookend is included only when its toggle is ON **and** its LOCKED bytes are
 * present. A missing/absent LOCKED bookend is silently skipped — the body still
 * ships branded on the side that IS present (or, if neither, the caller skips the
 * branded master entirely). No per-segment trim: brand clips play native length.
 */
export function buildBrandedInputs(args: {
  intro: boolean;
  outro: boolean;
  introBytes: Buffer | null;
  outroBytes: Buffer | null;
  bodyBytes: Buffer;
}): Array<{ shotId: string; bytes: Buffer }> {
  const inputs: Array<{ shotId: string; bytes: Buffer }> = [];
  if (args.intro && args.introBytes) {
    inputs.push({ shotId: 'brand-intro', bytes: args.introBytes });
  }
  inputs.push({ shotId: 'body', bytes: args.bodyBytes });
  if (args.outro && args.outroBytes) {
    inputs.push({ shotId: 'brand-outro', bytes: args.outroBytes });
  }
  return inputs;
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
