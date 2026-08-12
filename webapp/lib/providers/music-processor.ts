// ──────────────────────────────────────────────────────────────────────────────
// lib/providers/music-processor.ts
//
// Server-side music track pre-processor. Spawns ffmpeg to bake Director's
// fade/trim shaping into a derived mp3 so the animatic preview plays the
// same audio that EXEC-STITCH will mux into the final cut.
//
// 2026-06-06 — added after Director hit "saved fade/trim but preview still
// plays the raw track". Reuses `buildMusicAudioFilter` + `runFfmpeg` from
// ffmpeg-stitch.ts; no new ffmpeg infrastructure is introduced.
//
// Failure semantics: ffmpeg missing on PATH → throw a typed error; the
// `/animatic-timing` PATCH handler catches it, logs, keeps the raw URL so
// preview still works (audio just doesn't fade).
// ──────────────────────────────────────────────────────────────────────────────

import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  buildMusicAudioFilter,
  runFfmpeg,
  FfmpegStitchError,
} from './ffmpeg-stitch';

export type AudioExt = 'mp3' | 'wav' | 'm4a' | 'aac';

export interface ProcessMusicTrackInput {
  /** Raw source audio bytes (read from media cache / Drive). */
  sourceBytes: Buffer;
  /** Source container hint; drives the input filename ffmpeg writes. */
  ext: AudioExt;
  /** Director's shaping; if all fields are unset/zero the function is a no-op. */
  filters: {
    fade_in_seconds?: number;
    fade_out_seconds?: number;
    trim_in_seconds?: number;
    trim_out_seconds?: number;
  };
  /**
   * Total video length in seconds; needed by `buildMusicAudioFilter` to
   * anchor the fade-out at (total − fade_out_seconds). Pass the animatic's
   * recomputed total — same value EXEC-STITCH will use later.
   */
  totalVideoSeconds: number;
}

export interface ProcessMusicTrackResult {
  /** Processed mp3 bytes ready to write to the media cache. */
  bytes: Buffer;
  /**
   * True iff the filter chain was actually applied (i.e. Director set at
   * least one shaping field). When false, `bytes` is the original source —
   * the caller can skip the file write and reuse the original URL.
   */
  shaped: boolean;
}

/**
 * Apply Director's audio shaping to a music source. The output is always an
 * mp3 (192 kbps) because the AnimaticPlayer's `<audio>` element + the
 * /api/media route handle mp3 most reliably and the final cut also re-mux
 * via libmp3lame/aac downstream — quality remains transparent.
 *
 * The function is pure with respect to the filesystem: it writes into a
 * per-call tmpdir under `os.tmpdir()` and cleans up in `finally`.
 */
export async function processMusicTrack(
  input: ProcessMusicTrackInput,
): Promise<ProcessMusicTrackResult> {
  const audioFilter = buildMusicAudioFilter(input.filters, input.totalVideoSeconds);
  if (!audioFilter) {
    // No shaping requested → caller should just keep the original file.
    return { bytes: input.sourceBytes, shaped: false };
  }

  const tmpRoot = await fs.realpath(os.tmpdir());
  const tmpDir = await fs.mkdtemp(path.join(tmpRoot, 'ss-music-'));
  try {
    const srcPath = path.join(tmpDir, `source.${input.ext}`);
    const outPath = path.join(tmpDir, 'out.mp3');
    await fs.writeFile(srcPath, input.sourceBytes);

    // Re-encode to mp3 with the shaping filter baked in. -y overwrites in
    // case of a retry; -vn drops any embedded album art so the output is a
    // clean audio-only stream (some mp3s carry an mjpeg "video" track).
    const args = [
      '-y',
      '-i',
      srcPath,
      '-vn',
      '-filter:a',
      audioFilter,
      '-c:a',
      'libmp3lame',
      '-b:a',
      '192k',
      outPath,
    ];
    try {
      await runFfmpeg(args);
    } catch (err) {
      // Re-throw with a tagged class so the route handler can decide whether
      // to surface the failure or silently fall back to the raw source.
      throw new FfmpegStitchError(
        `music pre-process failed: ${err instanceof Error ? err.message : String(err)}`,
        'ffmpeg_failed',
      );
    }

    const bytes = await fs.readFile(outPath);
    return { bytes, shaped: true };
  } finally {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
}
