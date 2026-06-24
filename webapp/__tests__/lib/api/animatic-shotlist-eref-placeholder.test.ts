// ──────────────────────────────────────────────────────────────────────────────
// Regression-lock for the 2026-06-23 E12 incident: buildShotListFromApprovedEREF
// fabricated a per-shot image via `refs[i % refs.length]` for any shot without
// an approved ref. With only SH01/SH02 approved, EVERY other shot's cell showed
// SH01/SH02's image (Director: "на все 26 кадров только два первых").
//
// Fix: in v2 (refs carry shot_id metadata) an unmatched shot gets a null-image
// PLACEHOLDER, never a borrowed image. v1 (no shot_id on any ref) still
// round-robins so the legacy path is unbroken.
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildShotListFromApprovedEREF } from '@/lib/api/animatic-shotlist';

function storyboard(shotIds: string[]): string {
  const shots = shotIds.map((id) => ({ shot_id: id }));
  return '# board\n\n```json\n' + JSON.stringify({ acts: [{ shots }] }) + '\n```\n';
}

function ref(shotId: string | null, n: number) {
  return {
    id: `asset-${n}`,
    file_type: 'IMG-episode_ref',
    status: 'APPROVED',
    staging_path: `/img/${n}.png`,
    drive_path: null,
    drive_web_view_url: null,
    filename: `f${n}.png`,
    metadata: shotId ? { shot_reference: { shot_id: shotId } } : {},
  };
}

/** Chainable thenable that resolves the single assets query to `{ data, error }`. */
function mockSupabase(refs: unknown[]): SupabaseClient {
  const result = { data: refs, error: null };
  const chain: Record<string, unknown> = {};
  const passthrough = () => chain;
  for (const m of ['from', 'select', 'eq', 'like', 'order']) chain[m] = passthrough;
  chain.then = (res: (v: typeof result) => unknown) => Promise.resolve(result).then(res);
  return chain as unknown as SupabaseClient;
}

describe('buildShotListFromApprovedEREF — v2 placeholder (no round-robin borrow)', () => {
  it('gives unmatched shots a null-image placeholder, not another shot’s image', async () => {
    const sb = mockSupabase([ref('SH01', 1), ref('SH02', 2)]);
    const list = await buildShotListFromApprovedEREF(
      sb,
      'ep',
      storyboard(['SH01', 'SH02', 'SH03', 'SH04']),
    );
    expect(list).toHaveLength(4); // every shot present (assertCompleteShotList)
    const by = Object.fromEntries(list.map((s) => [s.shot_id, s]));
    // matched shots → their own ref
    expect(by.SH01.image_url).toBe('/img/1.png');
    expect(by.SH01.asset_id).toBe('asset-1');
    expect(by.SH02.image_url).toBe('/img/2.png');
    // unmatched shots → placeholder, NOT borrowed
    expect(by.SH03.image_url).toBeNull();
    expect(by.SH03.asset_id).toBeNull();
    expect(by.SH04.image_url).toBeNull();
    expect(by.SH04.asset_id).toBeNull();
    // the exact bug: never equals an existing ref url
    expect(by.SH03.image_url).not.toBe('/img/1.png');
    expect(by.SH04.image_url).not.toBe('/img/2.png');
  });

  it('v1 (no shot_id metadata on any ref) still round-robins — legacy path unbroken', async () => {
    const sb = mockSupabase([ref(null, 1), ref(null, 2)]);
    const list = await buildShotListFromApprovedEREF(
      sb,
      'ep',
      storyboard(['SH01', 'SH02', 'SH03', 'SH04']),
    );
    expect(list).toHaveLength(4);
    expect(list.map((s) => s.image_url)).toEqual([
      '/img/1.png',
      '/img/2.png',
      '/img/1.png',
      '/img/2.png',
    ]);
    expect(list.every((s) => s.image_url !== null)).toBe(true);
  });
});
