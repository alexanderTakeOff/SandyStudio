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
  CTA_Y_EXPR,
  DEFAULT_CTA_SECONDS,
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

describe('buildShortFilter — tail CTA', () => {
  it('places the CTA in the last N seconds (timing), derived from the trim window', () => {
    // window 10→40 = 30s long; CTA 3s → shows from t>27.
    const f = buildShortFilter({ endCta: { text: 'Full episode below', durationSeconds: 3 }, startSec: 10, endSec: 40 });
    expect(f).toContain('drawtext=');
    expect(f).toContain("text='Full episode below'");
    expect(f).toContain("enable='gt(t\\,27)'"); // last 3s of a 30s clip
  });

  it('derives the CTA window from clipDurationSec when the clip is not trimmed', () => {
    const f = buildShortFilter({ endCta: { text: 'Watch more' }, clipDurationSec: 20 });
    // default CTA seconds when unspecified → shows from t>(20-DEFAULT).
    expect(f).toContain(`enable='gt(t\\,${20 - DEFAULT_CTA_SECONDS})'`);
  });

  it('anchors the CTA in the top-centre safe zone (clears right rail + bottom UI)', () => {
    const f = buildShortFilter({ endCta: { text: 'Full episode below' }, clipDurationSec: 20 });
    expect(f).toContain('x=(w-text_w)/2'); // centred → not over the right action rail
    expect(f).toContain(`y=${CTA_Y_EXPR}`); // top band → not over the bottom title/description
    expect(CTA_Y_EXPR).toBe('h/7');
  });

  it('does not collide with the brand caption — different geometry AND different time window', () => {
    const f = buildShortFilter({
      overlayText: 'SANDY the HOURGLASS', overlaySeconds: 4,
      endCta: { text: 'Full episode below', durationSeconds: 3 }, startSec: 0, endSec: 30,
    });
    // brand: head of clip, bottom sixth
    expect(f).toContain("enable='lt(t\\,4)'");
    expect(f).toContain('y=h-h/6');
    // CTA: tail of clip, top seventh
    expect(f).toContain("enable='gt(t\\,27)'");
    expect(f).toContain('y=h/7');
    // two distinct drawtext nodes present
    expect(f.match(/drawtext=/g)?.length).toBe(2);
  });

  it('throws when a CTA is requested but the duration is unknown (no trim end, no clipDurationSec)', () => {
    expect(() => buildShortFilter({ endCta: { text: 'Watch more' }, startSec: 5 })).toThrow(/duration/i);
  });

  it('treats empty/whitespace CTA text as no CTA', () => {
    expect(buildShortFilter({ endCta: { text: '   ' }, clipDurationSec: 20 })).not.toContain('drawtext');
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

  it('re-cut: output duration equals the window AND the CTA lands in the tail', () => {
    const args = buildShortArgs('/in.mp4', '/out.mp4', {
      overlayText: 'SANDY the HOURGLASS',
      startSec: 12, endSec: 38, // 26s window
      endCta: { text: 'Full episode below', durationSeconds: 3 },
    });
    expect(args[args.indexOf('-ss') + 1]).toBe('12');
    expect(args[args.indexOf('-t') + 1]).toBe('26'); // duration == window
    const vf = args[args.indexOf('-vf') + 1];
    expect(vf).toContain("enable='gt(t\\,23)'"); // last 3s of the 26s window
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
