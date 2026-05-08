// Unit tests for ffmpeg-stitch helper. We don't actually spawn ffmpeg here —
// just verify the pure command-shape builders are correct so the integration
// surface is reproducible without a real ffmpeg install in CI.

import { describe, it, expect } from 'vitest';
import {
  buildConcatList,
  buildFfmpegArgs,
} from '@/lib/agents/providers/ffmpeg-stitch';

describe('buildConcatList', () => {
  it('emits one file directive per input path', () => {
    const list = buildConcatList(['/tmp/a.mp4', '/tmp/b.mp4', '/tmp/c.mp4']);
    expect(list).toBe(`file '/tmp/a.mp4'\nfile '/tmp/b.mp4'\nfile '/tmp/c.mp4'`);
  });

  it("escapes single quotes inside paths so the concat demuxer doesn't choke", () => {
    const list = buildConcatList([`/tmp/it's a path/clip.mp4`]);
    // Single quote escaped via close-quote + escaped-single + reopen-quote.
    expect(list).toBe(`file '/tmp/it'\\''s a path/clip.mp4'`);
  });

  it('returns empty string for empty input (caller validates non-empty)', () => {
    expect(buildConcatList([])).toBe('');
  });

  it('converts Windows backslashes to forward slashes (ffmpeg refuses backslashes inside single-quoted concat paths)', () => {
    const list = buildConcatList([
      'C:\\Users\\me\\AppData\\Local\\Temp\\ss-stitch\\shot-000.mp4',
    ]);
    expect(list).toBe(
      "file 'C:/Users/me/AppData/Local/Temp/ss-stitch/shot-000.mp4'",
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
