// ──────────────────────────────────────────────────────────────────────────────
// pickPublishMaster — which master EXEC-PUB uploads (2026-07-16, E29 fallout).
//
// This pins the exact line that shipped E29's wrong aspect: the code read
// `branded ?? clean` for every episode while its own comment claimed the
// branded preference was "long-form only". A vertical episode with a stale
// branded row (authored before the stitch-side fix) must still publish its
// CLEAN 9:16 master, never the 16:9 branded one.
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { pickPublishMaster } from '@/lib/agents/runner';

const BRANDED = { id: 'branded' };
const CLEAN = { id: 'clean' };

describe('pickPublishMaster — vertical episodes', () => {
  it('takes the CLEAN master even when a branded row exists (the E29 case)', () => {
    expect(
      pickPublishMaster({
        branded: BRANDED,
        clean: CLEAN,
        deliveryTargets: ['youtube_shorts'],
      }),
    ).toBe(CLEAN);
  });

  it.each([['instagram_reels'], ['tiktok']])('treats %s as vertical too', (target) => {
    expect(
      pickPublishMaster({ branded: BRANDED, clean: CLEAN, deliveryTargets: [target] }),
    ).toBe(CLEAN);
  });

  it('does NOT fall back to the branded master when the clean one is missing — a landscape master is not a valid Short', () => {
    expect(
      pickPublishMaster({ branded: BRANDED, clean: null, deliveryTargets: ['youtube_shorts'] }),
    ).toBeNull();
  });
});

describe('pickPublishMaster — long-form is untouched', () => {
  it('prefers the branded master when one exists', () => {
    expect(
      pickPublishMaster({
        branded: BRANDED,
        clean: CLEAN,
        deliveryTargets: ['youtube_landscape'],
      }),
    ).toBe(BRANDED);
  });

  it('falls back to the clean master when no branded one exists', () => {
    expect(
      pickPublishMaster({ branded: null, clean: CLEAN, deliveryTargets: ['youtube_landscape'] }),
    ).toBe(CLEAN);
  });

  it('defaults to long-form behaviour when delivery_targets is empty', () => {
    expect(pickPublishMaster({ branded: BRANDED, clean: CLEAN, deliveryTargets: [] })).toBe(
      BRANDED,
    );
  });

  it('returns null when neither master exists — caller raises the missing-master error', () => {
    expect(pickPublishMaster({ branded: null, clean: null, deliveryTargets: [] })).toBeNull();
  });
});
