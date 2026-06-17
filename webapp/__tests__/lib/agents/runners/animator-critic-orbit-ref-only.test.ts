// ──────────────────────────────────────────────────────────────────────────────
// __tests__/lib/agents/runners/animator-critic-orbit-ref-only.test.ts
// V15 (2026-06-17): deterministic orbit ⇒ ref-only. The E10 SH07+SH03 A/B smoke
// (seed-locked, only end_image varied) proved a pinned end_image fights a camera
// orbit — Director verdict «с рефом гораздо лучше». The LLM critic historically
// PASSed orbit+end_image (the Animator skill recommended it for "orbit landing"),
// so this covers the LLM-independent gate that catches it.
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';

import { checkOrbitEndImage } from '@/lib/agents/runners/animator-critic';

const SHOT = 'SS-S15-E10-A1-SC03-SH07';
const orbitMotion = { kind: 'rotate', direction: 'left', prose: 'camera orbits 10° right-to-left around Sandy' };
const endImage = { eref_asset_id: '0b19f65e-18e2-49fb-bf2e-f557cae13508', rationale: 'land on the recoil pose' };

describe('checkOrbitEndImage (V15 orbit ⇒ ref-only)', () => {
  it('flags an orbit shot that pins an end_image', () => {
    const v = checkOrbitEndImage(
      { opening_camera_motion: orbitMotion, end_image: endImage, provider: { id: 'seedance-standard' } },
      [],
      SHOT,
    );
    expect(v).toContain(SHOT);
    expect(v).toContain('ref-only');
  });

  it('flags an orbit shot using the with-end-image provider even if end_image asset is absent', () => {
    const v = checkOrbitEndImage(
      { opening_camera_motion: orbitMotion, provider: { id: 'seedance-with-end-image' } },
      [],
      SHOT,
    );
    expect(v).not.toBeNull();
  });

  it('detects orbit from prose when kind is not "rotate"', () => {
    const v = checkOrbitEndImage(
      {
        opening_camera_motion: { kind: null, direction: null, prose: 'slow orbit around the subject' },
        end_image: endImage,
      },
      [],
      SHOT,
    );
    expect(v).not.toBeNull();
  });

  it('passes a static (non-orbit) shot that legitimately uses two anchors', () => {
    expect(
      checkOrbitEndImage(
        { opening_camera_motion: { kind: null, direction: null, prose: null }, end_image: endImage },
        [],
        SHOT,
      ),
    ).toBeNull();
  });

  it('passes an orbit shot that is already ref-only (no end_image)', () => {
    expect(
      checkOrbitEndImage(
        { opening_camera_motion: orbitMotion, end_image: { eref_asset_id: null }, provider: { id: 'seedance-standard' } },
        [],
        SHOT,
      ),
    ).toBeNull();
  });

  it('is waived by an explicit Director orbit/anchor override', () => {
    const overrides = [{ check: 'orbit anchor', rationale: 'Director wants the locked landing here' }];
    expect(
      checkOrbitEndImage({ opening_camera_motion: orbitMotion, end_image: endImage }, overrides, SHOT),
    ).toBeNull();
  });

  it('fail-open on a null plan body', () => {
    expect(checkOrbitEndImage(null, [], SHOT)).toBeNull();
  });
});
