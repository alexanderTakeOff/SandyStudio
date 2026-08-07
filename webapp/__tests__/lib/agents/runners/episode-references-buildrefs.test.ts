// TD-53 (2026-05-25) — buildMultiImageRefs ref-order contract.
//
// Phase 1 LAYOUT LOCK prompt promises «first attached anchor image is the
// canonical layout». Refs must therefore be emitted in this exact order:
//   1. location
//   2. identity (one or more)
//   3. style
//   4. continuity (spatial / temporal)
// Live smoke incident SS-S15-E01 SH08 v05-v07 (2026-05-25): identity was
// first → gpt-image-2 adopted Sandy's portrait as layout → mirror dropped.

import { describe, expect, test } from 'vitest';
import {
  buildMultiImageRefs,
  type ShotJob,
} from '@/lib/agents/runners/episode-references';
import type { MultiImageRef } from '@/lib/providers/image-gen-multi';

type BibleRefEntry = ShotJob['bibleRefs'][number];

function mkBibleRef(kind: 'character' | 'location' | 'style', slug: string): BibleRefEntry {
  return {
    asset: {
      id: `${kind}-${slug}-uuid`,
      filename: `SS-S15-SBL-${kind}_${slug}-v01-LOCKED.png`,
      description: null,
      content: null,
      staging_path: `/staging/${slug}.png`,
      drive_web_view_url: null,
      status: 'LOCKED',
      file_type: `SBL-${kind}_${slug}`,
    },
    kind,
    slug,
    description: '',
    image_b64: 'fake_base64_data',
  };
}

function mkJob(refs: BibleRefEntry[]): ShotJob {
  return {
    slug: 'test_slug',
    shot: {
      shot_id: 'SS-S15-E01-A1-SC01-SH01',
      act: 1,
      location: 'bedroom',
      characters_present: [],
      action: '',
      duration_seconds: 4,
    },
    testPlan: {
      characters: [],
      location_anchor_asset_id: null,
      style_anchor_asset_id: 'style-canon-uuid',
      expected_gag: null,
      shot_role: 'establishing',
    },
    bibleRefs: refs,
  };
}

describe('buildMultiImageRefs — ref order contract (TD-53)', () => {
  test('location FIRST, identity, style — matches LAYOUT LOCK prompt promise', () => {
    const job = mkJob([
      mkBibleRef('character', 'sandy'),
      mkBibleRef('character', 'anvil'),
      mkBibleRef('location', 'sandy_bedroom_continuity'),
      mkBibleRef('style', 's15_canon'),
    ]);
    const refs = buildMultiImageRefs(job);

    expect(refs.length).toBe(4);
    expect(refs[0]!.kind).toBe('location');
    expect(refs[0]!.bible_asset_id).toBe('location-sandy_bedroom_continuity-uuid');
    expect(refs[1]!.kind).toBe('identity');
    expect(refs[2]!.kind).toBe('identity');
    expect(refs[3]!.kind).toBe('style');
  });

  test('continuity refs follow style — TD-30 spatial / TD-33 temporal slot last', () => {
    const job = mkJob([
      mkBibleRef('character', 'sandy'),
      mkBibleRef('location', 'bedroom'),
      mkBibleRef('style', 'canon'),
    ]);
    const spatial: MultiImageRef = {
      kind: 'scene_continuity',
      bible_asset_id: 'spatial-uuid',
      image_b64: 'fake',
    };
    const temporal: MultiImageRef = {
      kind: 'temporal_continuity',
      bible_asset_id: 'temporal-uuid',
      image_b64: 'fake',
    };
    const refs = buildMultiImageRefs(job, [spatial, temporal]);

    expect(refs.length).toBe(5);
    expect(refs[0]!.kind).toBe('location');
    expect(refs[1]!.kind).toBe('identity');
    expect(refs[2]!.kind).toBe('style');
    expect(refs[3]!.kind).toBe('scene_continuity');
    expect(refs[4]!.kind).toBe('temporal_continuity');
  });

  test('skips refs with no image_b64', () => {
    const charNoImg = mkBibleRef('character', 'ghost');
    charNoImg.image_b64 = null;
    const job = mkJob([
      mkBibleRef('location', 'bedroom'),
      charNoImg,
      mkBibleRef('character', 'sandy'),
      mkBibleRef('style', 'canon'),
    ]);
    const refs = buildMultiImageRefs(job);

    expect(refs.length).toBe(3);
    expect(refs.find((r) => r.bible_asset_id === 'character-ghost-uuid')).toBeUndefined();
    expect(refs[0]!.kind).toBe('location');
  });

  test('character refs get kind=identity (renamed in MultiImageRef contract)', () => {
    const job = mkJob([mkBibleRef('character', 'sandy')]);
    const refs = buildMultiImageRefs(job);
    expect(refs.length).toBe(1);
    expect(refs[0]!.kind).toBe('identity');
  });

  test('no location ref present — identity first is OK (legacy MVP path)', () => {
    const job = mkJob([
      mkBibleRef('character', 'sandy'),
      mkBibleRef('style', 'canon'),
    ]);
    const refs = buildMultiImageRefs(job);
    expect(refs.length).toBe(2);
    expect(refs[0]!.kind).toBe('identity');
    expect(refs[1]!.kind).toBe('style');
  });

  test('multiple characters preserve insertion order within identity slot', () => {
    const job = mkJob([
      mkBibleRef('character', 'sandy'),
      mkBibleRef('character', 'anvil'),
      mkBibleRef('character', 'narrator'),
      mkBibleRef('location', 'bedroom'),
    ]);
    const refs = buildMultiImageRefs(job);
    expect(refs.length).toBe(4);
    expect(refs[0]!.bible_asset_id).toBe('location-bedroom-uuid');
    expect(refs[1]!.bible_asset_id).toBe('character-sandy-uuid');
    expect(refs[2]!.bible_asset_id).toBe('character-anvil-uuid');
    expect(refs[3]!.bible_asset_id).toBe('character-narrator-uuid');
  });
});
