// ──────────────────────────────────────────────────────────────────────────────
// Unit tests for the INTRO/OUTRO brand-bookend pure helpers (2026-07-13).
//
// Covers the three pure functions the EXEC-STITCH two-master wiring rides on:
//   - resolveStitchSettings — episode.metadata.stitch_settings → toggles
//   - buildBrandedInputs     — ordered [intro?, body, outro?] concat inputs
//   - bibleFilename / sectionFromFileType — SBL-video_* taxonomy round-trip
//
// No ffmpeg / DB — these are the logic gates, tested in isolation.
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { resolveStitchSettings } from '@/lib/api/animatic-shotlist';
import { buildBrandedInputs } from '@/lib/agents/providers/ffmpeg-stitch';
import { bibleFilename, sectionFromFileType } from '@/lib/api/series-bible';

describe('resolveStitchSettings — vertical delivery has no bookends', () => {
  // The only LOCKED SBL-video_intro/outro assets are authored 16:9. Prepending
  // them to a 9:16 body made E29's "branded" master 1920×1080 around a 720×1280
  // body — unusable as a Short. Vertical ⇒ skip branding until vertical
  // bookends exist.
  it('forces intro+outro OFF for a youtube_shorts episode', () => {
    expect(resolveStitchSettings({ delivery_targets: ['youtube_shorts'] })).toEqual({
      intro: false,
      outro: false,
      cold_open_seconds: 0,
    });
  });

  it('overrides explicit ON toggles — a 16:9 bookend is wrong for 9:16 whatever the operator asked', () => {
    expect(
      resolveStitchSettings({
        delivery_targets: ['youtube_shorts'],
        stitch_settings: { intro: true, outro: true },
      }),
    ).toEqual({ intro: false, outro: false, cold_open_seconds: 0 });
  });

  it.each([['instagram_reels'], ['tiktok']])(
    'treats %s as vertical too (shares the 9:16 slug set)',
    (target) => {
      const s = resolveStitchSettings({ delivery_targets: [target] });
      expect([s.intro, s.outro]).toEqual([false, false]);
    },
  );

  it('leaves landscape delivery branded — the fix must not disarm long-form', () => {
    expect(resolveStitchSettings({ delivery_targets: ['youtube_landscape'] })).toEqual({
      intro: true,
      outro: true,
      cold_open_seconds: 0,
    });
  });

  it('keeps cold_open_seconds passthrough while stripping bookends', () => {
    expect(
      resolveStitchSettings({
        delivery_targets: ['youtube_shorts'],
        stitch_settings: { cold_open_seconds: 3 },
      }),
    ).toEqual({ intro: false, outro: false, cold_open_seconds: 3 });
  });
});

describe('resolveStitchSettings', () => {
  it('defaults long-form to intro+outro ON, cold_open 0 when metadata absent', () => {
    expect(resolveStitchSettings(undefined)).toEqual({
      intro: true,
      outro: true,
      cold_open_seconds: 0,
    });
    expect(resolveStitchSettings(null)).toEqual({
      intro: true,
      outro: true,
      cold_open_seconds: 0,
    });
    expect(resolveStitchSettings({})).toEqual({
      intro: true,
      outro: true,
      cold_open_seconds: 0,
    });
  });

  it('only an explicit false turns a bookend off (absent = default ON)', () => {
    expect(resolveStitchSettings({ stitch_settings: { intro: false } })).toEqual({
      intro: false,
      outro: true,
      cold_open_seconds: 0,
    });
    expect(resolveStitchSettings({ stitch_settings: { outro: false } })).toEqual({
      intro: true,
      outro: false,
      cold_open_seconds: 0,
    });
    // A non-false truthy value keeps it ON.
    expect(resolveStitchSettings({ stitch_settings: { intro: true, outro: true } })).toEqual({
      intro: true,
      outro: true,
      cold_open_seconds: 0,
    });
  });

  it('passes through a positive cold_open_seconds, clamps junk to 0 (STUB field)', () => {
    expect(resolveStitchSettings({ stitch_settings: { cold_open_seconds: 3.5 } }).cold_open_seconds).toBe(3.5);
    expect(resolveStitchSettings({ stitch_settings: { cold_open_seconds: -2 } }).cold_open_seconds).toBe(0);
    expect(resolveStitchSettings({ stitch_settings: { cold_open_seconds: 'x' } }).cold_open_seconds).toBe(0);
  });
});

describe('buildBrandedInputs', () => {
  const intro = Buffer.from('INTRO');
  const body = Buffer.from('BODY');
  const outro = Buffer.from('OUTRO');

  it('orders [intro, body, outro] when both toggles on and both bytes present', () => {
    const out = buildBrandedInputs({
      intro: true,
      outro: true,
      introBytes: intro,
      outroBytes: outro,
      bodyBytes: body,
    });
    expect(out.map((s) => s.shotId)).toEqual(['brand-intro', 'body', 'brand-outro']);
    expect(out.map((s) => s.bytes)).toEqual([intro, body, outro]);
  });

  it('omits intro when its toggle is off', () => {
    const out = buildBrandedInputs({
      intro: false,
      outro: true,
      introBytes: intro,
      outroBytes: outro,
      bodyBytes: body,
    });
    expect(out.map((s) => s.shotId)).toEqual(['body', 'brand-outro']);
  });

  it('omits outro when its LOCKED bytes are absent (even with toggle on)', () => {
    const out = buildBrandedInputs({
      intro: true,
      outro: true,
      introBytes: intro,
      outroBytes: null,
      bodyBytes: body,
    });
    expect(out.map((s) => s.shotId)).toEqual(['brand-intro', 'body']);
  });

  it('always includes the body, even when both bookends are absent', () => {
    const out = buildBrandedInputs({
      intro: true,
      outro: true,
      introBytes: null,
      outroBytes: null,
      bodyBytes: body,
    });
    expect(out.map((s) => s.shotId)).toEqual(['body']);
    expect(out[0]!.bytes).toBe(body);
  });
});

describe('SBL-video taxonomy', () => {
  it('bibleFilename builds a canonical mp4 name for the video section', () => {
    expect(
      bibleFilename({
        seriesCode: 'SS-S15',
        section: 'video',
        slug: 'intro',
        version: 1,
        ext: 'mp4',
        status: 'DRAFT',
      }),
    ).toBe('SS-S15-SBL-video_intro-v01-DRAFT.mp4');
  });

  it('sectionFromFileType resolves SBL-video_intro / SBL-video_outro to the video section', () => {
    expect(sectionFromFileType('SBL-video_intro')).toBe('video');
    expect(sectionFromFileType('SBL-video_outro')).toBe('video');
  });
});
