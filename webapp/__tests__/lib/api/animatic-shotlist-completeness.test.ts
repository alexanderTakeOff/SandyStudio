// ──────────────────────────────────────────────────────────────────────────────
// Tests for the silent-drop guard in lib/api/animatic-shotlist.ts builders.
//
// Regression-lock for 2026-06-05 E02 incident:
//   `buildShotListFromAnchorChain` silently `continue`d past SH12 because its
//   START anchor was stuck in REVIEW (the query filters status=APPROVED).
//   Result: animatic v03..v06 each had 29 shots instead of 30; UI rendered
//   button labels by ordinal index (i+1), so btn12 showed SH13 content, etc.
//   The fix replaces the older "length === 0" check with a missing-shot list,
//   so the next time a single shot's start anchor is not APPROVED the build
//   throws loudly instead of producing a silently-shifted timeline.
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';

import {
  assertCompleteShotList,
  type AnimaticShot,
} from '@/lib/api/animatic-shotlist';

function shot(id: string): AnimaticShot {
  return {
    shot_id: id,
    asset_id: 'a-' + id,
    image_url: '/img/' + id,
    duration_seconds: 3,
  };
}

describe('assertCompleteShotList', () => {
  const all = ['SH01', 'SH02', 'SH03', 'SH04', 'SH05'].map((s) => ({ shot_id: s }));

  it('is a no-op when every storyboard shot is present in the built list', () => {
    const list = all.map((s) => shot(s.shot_id));
    expect(() => assertCompleteShotList(list, all, 'builder')).not.toThrow();
  });

  it('throws with the single missing shot_id when one shot is dropped', () => {
    const list = all.filter((s) => s.shot_id !== 'SH03').map((s) => shot(s.shot_id));
    expect(() => assertCompleteShotList(list, all, 'builder')).toThrow(
      /dropped 1\/5 shot\(s\) silently: SH03/,
    );
  });

  it('throws with the comma-separated missing shot_ids when several are dropped', () => {
    const list = [shot('SH01'), shot('SH04')];
    expect(() => assertCompleteShotList(list, all, 'builder')).toThrow(
      /dropped 3\/5 shot\(s\) silently: SH02, SH03, SH05/,
    );
  });

  it('throws with the full list when zero shots are built (subsumes legacy empty check)', () => {
    expect(() => assertCompleteShotList([], all, 'builder')).toThrow(
      /dropped 5\/5 shot\(s\) silently: SH01, SH02, SH03, SH04, SH05/,
    );
  });

  it('includes the builder name in the error so the surfacing path is obvious', () => {
    expect(() =>
      assertCompleteShotList([shot('SH01')], all, 'buildShotListFromAnchorChain'),
    ).toThrow(/buildShotListFromAnchorChain dropped/);
  });
});
