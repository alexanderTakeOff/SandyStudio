// Unit tests for ffmpeg-stitch helper. We don't actually spawn ffmpeg here —
// just verify the pure command-shape builders are correct so the integration
// surface is reproducible without a real ffmpeg install in CI.

import { describe, it, expect } from 'vitest';
import {
  buildConcatList,
  buildFfmpegArgs,
  buildMusicAudioFilter,
} from '@/lib/agents/providers/ffmpeg-stitch';

describe('buildConcatList', () => {
  it('emits one file directive per input path', () => {
    const list = buildConcatList([
      { path: '/tmp/a.mp4' },
      { path: '/tmp/b.mp4' },
      { path: '/tmp/c.mp4' },
    ]);
    expect(list).toBe(`file '/tmp/a.mp4'\nfile '/tmp/b.mp4'\nfile '/tmp/c.mp4'`);
  });

  it("escapes single quotes inside paths so the concat demuxer doesn't choke", () => {
    const list = buildConcatList([{ path: `/tmp/it's a path/clip.mp4` }]);
    // Single quote escaped via close-quote + escaped-single + reopen-quote.
    expect(list).toBe(`file '/tmp/it'\\''s a path/clip.mp4'`);
  });

  it('returns empty string for empty input (caller validates non-empty)', () => {
    expect(buildConcatList([])).toBe('');
  });

  it('converts Windows backslashes to forward slashes (ffmpeg refuses backslashes inside single-quoted concat paths)', () => {
    const list = buildConcatList([
      {
        path: 'C:\\Users\\me\\AppData\\Local\\Temp\\ss-stitch\\shot-000.mp4',
      },
    ]);
    expect(list).toBe(
      "file 'C:/Users/me/AppData/Local/Temp/ss-stitch/shot-000.mp4'",
    );
  });

  it('emits `outpoint <seconds>` directive when durationSeconds is set (trims Veo clips to animatic intent)', () => {
    const list = buildConcatList([
      { path: '/tmp/a.mp4', durationSeconds: 4 },
      { path: '/tmp/b.mp4', durationSeconds: 3.5 },
    ]);
    expect(list).toBe(
      [
        `file '/tmp/a.mp4'`,
        'outpoint 4.000',
        `file '/tmp/b.mp4'`,
        'outpoint 3.500',
      ].join('\n'),
    );
  });

  it('omits `outpoint` when durationSeconds is undefined or 0 (use native clip length)', () => {
    const list = buildConcatList([
      { path: '/tmp/a.mp4' },
      { path: '/tmp/b.mp4', durationSeconds: 0 },
      { path: '/tmp/c.mp4', durationSeconds: 5 },
    ]);
    expect(list).toBe(
      [
        `file '/tmp/a.mp4'`,
        `file '/tmp/b.mp4'`,
        `file '/tmp/c.mp4'`,
        'outpoint 5.000',
      ].join('\n'),
    );
  });

  it('emits `inpoint <seconds>` head-trim directive when inpointSeconds is set (2026-06-06)', () => {
    const list = buildConcatList([
      { path: '/tmp/a.mp4', inpointSeconds: 1.2 },
    ]);
    expect(list).toBe([
      `file '/tmp/a.mp4'`,
      'inpoint 1.200',
    ].join('\n'),
    );
  });

  it('with both inpoint AND duration set, outpoint = inpoint + duration (absolute timestamp)', () => {
    // ffmpeg outpoint is absolute in the source file. A 2s head trim + a
    // 3s desired playback duration must read source seconds [2, 5), not
    // [2, 3) — otherwise we get a 1s clip instead of a 3s one.
    const list = buildConcatList([
      { path: '/tmp/a.mp4', inpointSeconds: 2, durationSeconds: 3 },
    ]);
    expect(list).toBe([
      `file '/tmp/a.mp4'`,
      'inpoint 2.000',
      'outpoint 5.000',
    ].join('\n'),
    );
  });

  it('omits inpoint when inpointSeconds is 0 or undefined (no head trim requested)', () => {
    const list = buildConcatList([
      { path: '/tmp/a.mp4', inpointSeconds: 0, durationSeconds: 3 },
      { path: '/tmp/b.mp4', durationSeconds: 4 },
    ]);
    expect(list).toBe([
      `file '/tmp/a.mp4'`,
      'outpoint 3.000',
      `file '/tmp/b.mp4'`,
      'outpoint 4.000',
    ].join('\n'),
    );
  });
});

describe('buildFfmpegArgs', () => {
  const listPath = '/tmp/concat-list.txt';
  const outPath = '/tmp/final-cut.mp4';

  it('produces the canonical concat-demuxer argv when no music is given', () => {
    const args = buildFfmpegArgs({ listPath, outPath, musicPath: null });
    expect(args).toEqual([
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      '/tmp/concat-list.txt',
      '-map',
      '0:v',
      '-map',
      '0:a?',
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
      '/tmp/final-cut.mp4',
    ]);
  });

  it('uses optional audio mapping when music is absent (Veo mp4s sometimes have no audio stream)', () => {
    const args = buildFfmpegArgs({ listPath, outPath, musicPath: null });
    // The "?" suffix on 0:a is what makes ffmpeg silently ignore videos
    // without audio streams instead of failing.
    expect(args).toContain('0:a?');
  });

  it('adds music as second input + maps audio from input 1 when music given', () => {
    const args = buildFfmpegArgs({
      listPath,
      outPath,
      musicPath: '/tmp/music.mp3',
    });
    // music is second -i input
    expect(args).toContain('/tmp/music.mp3');
    // audio mapped from input 1, not input 0
    const aMapIdx = args.indexOf('1:a');
    expect(aMapIdx).toBeGreaterThan(-1);
  });

  it('appends -shortest only when music is present (so silence does not dangle)', () => {
    const withMusic = buildFfmpegArgs({
      listPath,
      outPath,
      musicPath: '/tmp/m.mp3',
    });
    expect(withMusic).toContain('-shortest');

    const withoutMusic = buildFfmpegArgs({ listPath, outPath, musicPath: null });
    expect(withoutMusic).not.toContain('-shortest');
  });

  it('always emits faststart for browser-friendly streaming', () => {
    const args = buildFfmpegArgs({ listPath, outPath, musicPath: null });
    const flagIdx = args.indexOf('-movflags');
    expect(args[flagIdx + 1]).toBe('+faststart');
  });

  it('places output path last (ffmpeg argv convention)', () => {
    const args = buildFfmpegArgs({ listPath, outPath, musicPath: null });
    expect(args[args.length - 1]).toBe(outPath);
  });
});

describe('buildMusicAudioFilter — Director audio shaping (2026-06-06)', () => {
  // Closes the "конец как обрыв" feedback on the first E02 final cut. The
  // filter chain string is what ffmpeg sees behind `-filter:a`; the test
  // doesn't run ffmpeg, just asserts the canonical filter shape.

  it('returns null when no shaping requested — caller omits -filter:a entirely', () => {
    expect(buildMusicAudioFilter({}, 60)).toBeNull();
  });

  it('emits afade=t=in only when fade_in_seconds > 0', () => {
    const f = buildMusicAudioFilter({ fade_in_seconds: 2 }, 60);
    expect(f).toBe('afade=t=in:d=2');
  });

  it('anchors afade=t=out to (total - fade_out_seconds) so the fade lands at video end', () => {
    const f = buildMusicAudioFilter({ fade_out_seconds: 1.5 }, 72.125);
    // 72.125 - 1.5 = 70.625
    expect(f).toBe('afade=t=out:st=70.625:d=1.5');
  });

  it('skips fade-out when totalVideoSeconds <= fade duration (no room to fade)', () => {
    // Edge case: a 1s video with a 2s fade can't fit — we just skip it
    // rather than emit a nonsense negative st= value.
    expect(buildMusicAudioFilter({ fade_out_seconds: 2 }, 1)).toBeNull();
  });

  it('emits atrim with asetpts=PTS-STARTPTS so fades anchor to the trimmed window', () => {
    const f = buildMusicAudioFilter(
      { trim_in_seconds: 5, trim_out_seconds: 30 },
      20,
    );
    expect(f).toBe('atrim=start=5:end=30,asetpts=PTS-STARTPTS');
  });

  it('combines trim + fade-in + fade-out in canonical order (trim first, then fades)', () => {
    const f = buildMusicAudioFilter(
      {
        trim_in_seconds: 5,
        trim_out_seconds: 50,
        fade_in_seconds: 2,
        fade_out_seconds: 1.5,
      },
      72.125,
    );
    expect(f).toBe(
      'atrim=start=5:end=50,asetpts=PTS-STARTPTS,afade=t=in:d=2,afade=t=out:st=70.625:d=1.5',
    );
  });

  it('zero / negative values are ignored (treated as "no shaping for this control")', () => {
    expect(
      buildMusicAudioFilter(
        { fade_in_seconds: 0, fade_out_seconds: 0, trim_in_seconds: 0 },
        60,
      ),
    ).toBeNull();
  });
});
