// Unit tests for the pure short-linkage helpers (no DB). Cover the funnel
// backlink and the re-cut window marker that keeps batch idempotency correct.

import { describe, it, expect } from 'vitest';
import { appendParentBacklink, recutWindowMarker } from '@/lib/agents/providers/short-linkage';

describe('appendParentBacklink', () => {
  it('appends the parent watch URL once', () => {
    const out = appendParentBacklink('desc', 'abc123');
    expect(out).toContain('▶ Full episode: https://youtu.be/abc123');
  });

  it('is idempotent (does not double-append)', () => {
    const once = appendParentBacklink('desc', 'abc123');
    expect(appendParentBacklink(once, 'abc123')).toBe(once);
  });

  it('is a no-op when the parent id is unknown', () => {
    expect(appendParentBacklink('desc', null)).toBe('desc');
  });
});

describe('recutWindowMarker', () => {
  it('encodes the window so two cuts of the same episode are distinguishable', () => {
    expect(recutWindowMarker(12, 38)).toBe('W12-38');
    expect(recutWindowMarker(8, 34)).toBe('W8-34');
  });

  it('rounds fractional seconds to a stable integer token', () => {
    expect(recutWindowMarker(12.4, 37.9)).toBe('W12-38');
  });

  it('produces different markers for different windows (idempotency key)', () => {
    expect(recutWindowMarker(0, 20)).not.toBe(recutWindowMarker(20, 40));
  });
});
