// ──────────────────────────────────────────────────────────────────────────────
// __tests__/lib/asset-preview-freshness.test.ts
// bumpPreviewFreshness forces the media-URL cache-bust key to change on an
// in-place image replacement (2026-07-22 metelka stale-preview fix).
// ──────────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';
import { bumpPreviewFreshness } from '@/lib/asset-preview-resolver';

describe('bumpPreviewFreshness', () => {
  it('increments an existing current_version', () => {
    const out = bumpPreviewFreshness({ image_prompt: { current_version: 6, history: [] } });
    expect((out.image_prompt as { current_version: number }).current_version).toBe(7);
  });

  it('creates the image_prompt node when absent, seeding from rowVersion', () => {
    const out = bumpPreviewFreshness({ foo: 1 }, 3);
    expect((out.image_prompt as { current_version: number }).current_version).toBe(4);
    expect(out.foo).toBe(1); // preserves sibling metadata
  });

  it('seeds from 0 when no version signal anywhere', () => {
    const out = bumpPreviewFreshness(null);
    expect((out.image_prompt as { current_version: number }).current_version).toBe(1);
  });

  it('prefers image_prompt.current_version over the rowVersion fallback', () => {
    const out = bumpPreviewFreshness({ image_prompt: { current_version: 10 } }, 2);
    expect((out.image_prompt as { current_version: number }).current_version).toBe(11);
  });

  it('does not mutate the input object', () => {
    const input = { image_prompt: { current_version: 2 } };
    bumpPreviewFreshness(input);
    expect(input.image_prompt.current_version).toBe(2);
  });
});
