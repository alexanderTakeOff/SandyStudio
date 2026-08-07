// ──────────────────────────────────────────────────────────────────────────────
// Unit tests for the music-processor helper.
//
// We don't actually spawn ffmpeg here — the lower-level `runFfmpeg` and
// `buildMusicAudioFilter` are imported from ffmpeg-stitch.ts. Mock the spawn
// path so we can assert (a) no-op behaviour when no shaping is requested,
// (b) the filter chain passed to ffmpeg when shaping IS requested, and
// (c) graceful failure when ffmpeg errors out.
//
// Regression target: Director set fade_in_seconds=2 + saved timing, but the
// AnimaticPlayer preview still played the raw mp3 (no fade audible) until
// the EXEC-STITCH final-cut pass landed much later. This helper closes that
// preview / final-cut audio mismatch.
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/providers/ffmpeg-stitch', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/providers/ffmpeg-stitch')>();
  return {
    ...original,
    runFfmpeg: vi.fn(),
  };
});

import {
  processMusicTrack,
  type ProcessMusicTrackInput,
} from '@/lib/providers/music-processor';
import { runFfmpeg, FfmpegStitchError } from '@/lib/providers/ffmpeg-stitch';

type MockedRun = ReturnType<typeof vi.fn> & {
  mockResolvedValueOnce: (v: unknown) => unknown;
  mockRejectedValueOnce: (e: unknown) => unknown;
  mockImplementationOnce: (fn: (...args: unknown[]) => unknown) => unknown;
};
const mockedRunFfmpeg = runFfmpeg as unknown as MockedRun;

beforeEach(() => {
  mockedRunFfmpeg.mockReset?.();
});

function baseInput(): ProcessMusicTrackInput {
  return {
    sourceBytes: Buffer.from('SOURCE-AUDIO-BYTES'),
    ext: 'mp3',
    filters: {},
    totalVideoSeconds: 60,
  };
}

describe('processMusicTrack', () => {
  it('is a no-op when no shaping fields are set — returns source bytes untouched, shaped=false', async () => {
    const result = await processMusicTrack(baseInput());
    expect(result.shaped).toBe(false);
    expect(result.bytes).toEqual(Buffer.from('SOURCE-AUDIO-BYTES'));
    expect(mockedRunFfmpeg).not.toHaveBeenCalled();
  });

  it('spawns ffmpeg with -filter:a containing afade=t=in when fade_in_seconds is set', async () => {
    // The spawn side-effect we care about: a file is read back from the
    // tmp out path. We can't easily intercept fs.readFile in this test, so
    // we let the real fs path run but stub runFfmpeg to actually write a
    // tiny output stub through the file system. Easiest: have the mock
    // pull the output path off argv and write known bytes there.
    const { promises: fs } = await import('node:fs');
    mockedRunFfmpeg.mockImplementationOnce(async (args: ReadonlyArray<string>) => {
      const outPath = args[args.length - 1] as string;
      await fs.writeFile(outPath, Buffer.from('PROCESSED-BYTES'));
      return '';
    });
    const result = await processMusicTrack({
      ...baseInput(),
      filters: { fade_in_seconds: 2 },
    });
    expect(result.shaped).toBe(true);
    expect(result.bytes).toEqual(Buffer.from('PROCESSED-BYTES'));
    // Assert ffmpeg was called with a -filter:a flag containing the fade-in expression.
    const argv = mockedRunFfmpeg.mock.calls[0]?.[0] as string[] | undefined;
    expect(argv).toBeDefined();
    const filterIdx = argv!.indexOf('-filter:a');
    expect(filterIdx).toBeGreaterThan(-1);
    expect(argv![filterIdx + 1]).toContain('afade=t=in:d=2');
  });

  it('passes through fade-out + trim into the filter chain when set', async () => {
    const { promises: fs } = await import('node:fs');
    mockedRunFfmpeg.mockImplementationOnce(async (args: ReadonlyArray<string>) => {
      const outPath = args[args.length - 1] as string;
      await fs.writeFile(outPath, Buffer.from('X'));
      return '';
    });
    await processMusicTrack({
      ...baseInput(),
      totalVideoSeconds: 30,
      filters: {
        fade_out_seconds: 2,
        trim_in_seconds: 5,
      },
    });
    const argv = mockedRunFfmpeg.mock.calls[0]?.[0] as string[] | undefined;
    const filter = argv?.[argv.indexOf('-filter:a') + 1] ?? '';
    expect(filter).toContain('atrim=start=5');
    // fade-out anchored to (total − fade_out) = 28s
    expect(filter).toContain('afade=t=out:st=28.000:d=2');
  });

  it('rethrows as FfmpegStitchError when the ffmpeg spawn fails', async () => {
    mockedRunFfmpeg.mockRejectedValueOnce(new Error('ffmpeg exited 1: invalid filter'));
    await expect(
      processMusicTrack({
        ...baseInput(),
        filters: { fade_in_seconds: 1 },
      }),
    ).rejects.toBeInstanceOf(FfmpegStitchError);
  });

  it('emits mp3 output with libmp3lame at 192kbps regardless of source ext', async () => {
    const { promises: fs } = await import('node:fs');
    mockedRunFfmpeg.mockImplementationOnce(async (args: ReadonlyArray<string>) => {
      const outPath = args[args.length - 1] as string;
      await fs.writeFile(outPath, Buffer.from('OK'));
      return '';
    });
    await processMusicTrack({
      ...baseInput(),
      ext: 'wav',
      filters: { fade_in_seconds: 1 },
    });
    const argv = mockedRunFfmpeg.mock.calls[0]?.[0] as string[] | undefined;
    expect(argv).toContain('libmp3lame');
    expect(argv).toContain('-b:a');
    expect(argv).toContain('192k');
    // Output filename ends with .mp3 even when source is wav.
    expect(argv?.[argv.length - 1]).toMatch(/\.mp3$/);
  });
});
