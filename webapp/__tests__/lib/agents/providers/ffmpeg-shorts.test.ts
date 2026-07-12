// Unit tests for ffmpeg-shorts helper. Like ffmpeg-stitch.test.ts we don't spawn
// ffmpeg — just verify the pure filter/argv builders so the conversion is
// reproducible without a real ffmpeg install in CI.

import { describe, it, expect } from 'vitest';
import {
  buildShortFilter,
  buildShortArgs,
  escapeFilterPath,
  escapeDrawtext,
  isVertical,
  SHORT_WIDTH,
  SHORT_HEIGHT,
} from '@/lib/agents/providers/ffmpeg-shorts';

describe('buildShortFilter', () => {
  it('center-crops to 9:16 and scales to 1080x1920 with no overlay', () => {
    expect(buildShortFilter()).toBe(
      `crop='min(iw,ih*9/16)':ih,scale=${SHORT_WIDTH}:${SHORT_HEIGHT},setsar=1`,
    );
  });

  it('appends a drawtext overlay enabled for the first N seconds', () => {
    const f = buildShortFilter({ overlayText: 'SANDY the HOURGLASS', overlaySeconds: 4, fontFile: 'C:/Windows/Fonts/ariblk.ttf' });
    expect(f).toContain('drawtext=');
    expect(f).toContain("text='SANDY the HOURGLASS'");
    // drive colon escaped, forward slashes
    expect(f).toContain("fontfile='C\\:/Windows/Fonts/ariblk.ttf'");
    // enable comma must be escaped so it doesn't split the filtergraph
    expect(f).toContain("enable='lt(t\\,4)'");
  });

  it('treats empty/whitespace overlay text as no overlay', () => {
    expect(buildShortFilter({ overlayText: '   ' })).not.toContain('drawtext');
  });
});

describe('escapeFilterPath', () => {
  it('converts backslashes to forward slashes and escapes the drive colon', () => {
    expect(escapeFilterPath('C:\\Windows\\Fonts\\ariblk.ttf')).toBe('C\\:/Windows/Fonts/ariblk.ttf');
  });
});

describe('escapeDrawtext', () => {
  it('escapes commas, colons and quotes', () => {
    expect(escapeDrawtext("a,b:c'd")).toBe("a\\,b\\:c\\'d");
  });
});

describe('buildShortArgs', () => {
  it('builds a whole-clip conversion when no trim is given', () => {
    const args = buildShortArgs('/in.mp4', '/out.mp4');
    expect(args[0]).toBe('-y');
    expect(args).not.toContain('-ss');
    expect(args).not.toContain('-t');
    const i = args.indexOf('-i');
    expect(args[i + 1]).toBe('/in.mp4');
    expect(args[args.length - 1]).toBe('/out.mp4');
    expect(args).toContain('libx264');
    expect(args).toContain('+faststart');
  });

  it('places -ss before -i (fast seek) and -t after with the correct duration', () => {
    const args = buildShortArgs('/in.mp4', '/out.mp4', { startSec: 10, endSec: 25 });
    const ss = args.indexOf('-ss');
    const i = args.indexOf('-i');
    const t = args.indexOf('-t');
    expect(ss).toBeGreaterThanOrEqual(0);
    expect(ss).toBeLessThan(i);
    expect(args[ss + 1]).toBe('10');
    expect(t).toBeGreaterThan(i);
    expect(args[t + 1]).toBe('15'); // 25 - 10
  });

  it('omits -ss when start is 0', () => {
    const args = buildShortArgs('/in.mp4', '/out.mp4', { startSec: 0, endSec: 8 });
    expect(args).not.toContain('-ss');
    expect(args[args.indexOf('-t') + 1]).toBe('8');
  });
});

describe('isVertical', () => {
  it('is true when height >= width', () => {
    expect(isVertical({ width: 496, height: 864 })).toBe(true);
    expect(isVertical({ width: 1080, height: 1080 })).toBe(true);
  });
  it('is false for landscape and for null', () => {
    expect(isVertical({ width: 1920, height: 1080 })).toBe(false);
    expect(isVertical(null)).toBe(false);
  });
});
