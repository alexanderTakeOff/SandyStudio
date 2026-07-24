// Unit tests for the pure short-linkage helpers (no DB). Cover the funnel
// backlink and the re-cut window marker that keeps batch idempotency correct.

import { describe, it, expect } from 'vitest';
import {
  appendParentBacklink,
  recutWindowMarker,
  persistShortId,
} from '@/lib/agents/providers/short-linkage';

/**
 * Minimal supabase double for persistShortId: one SELECT (returns the current
 * metadata) and one UPDATE (captured for assertion). Both chains funnel through
 * `from('episodes')`.
 */
function makeSb(initialMeta: Record<string, unknown>) {
  const captured: { metadata?: Record<string, unknown> } = {};
  const sb = {
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        single() {
          return Promise.resolve({ data: { metadata: initialMeta } });
        },
        update(payload: { metadata: Record<string, unknown> }) {
          captured.metadata = payload.metadata;
          return { eq: () => Promise.resolve({ error: null }) };
        },
      };
    },
  };
  return { sb, captured };
}

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

  it('queues the catalogue behind the episode when a playlist is known', () => {
    // Arrange / Act
    const out = appendParentBacklink('desc', 'abc123', 'PL_XYZ');

    // Assert — lands on the promised episode, with the rest queued after it.
    expect(out).toContain('▶ Full episode: https://www.youtube.com/watch?v=abc123&list=PL_XYZ');
  });

  it('falls back to the bare watch URL when no playlist is configured', () => {
    expect(appendParentBacklink('desc', 'abc123', null)).toContain('https://youtu.be/abc123');
  });

  it('stays idempotent with a playlist', () => {
    const once = appendParentBacklink('desc', 'abc123', 'PL_XYZ');
    expect(appendParentBacklink(once, 'abc123', 'PL_XYZ')).toBe(once);
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

describe('persistShortId (clobber fix — E15 «Автомойка»)', () => {
  it('appends to the durable list instead of overwriting the previous short', async () => {
    // Arrange — a prior good short is already recorded.
    const { sb, captured } = makeSb({
      youtube_short_ids: [{ id: 'GOOD', url: 'https://youtu.be/GOOD' }],
      youtube_short_id: 'GOOD',
    });

    // Act — a new (e.g. broken re-cut) short lands.
    await persistShortId(sb as never, 'ep-1', 'NEW', 'https://youtu.be/NEW');

    // Assert — the good short is STILL in the list (not lost), new one appended.
    const ids = (captured.metadata?.youtube_short_ids as Array<{ id: string }>).map((e) => e.id);
    expect(ids).toEqual(['GOOD', 'NEW']);
    // Scalar "latest" tracks the newest for back-compat readers.
    expect(captured.metadata?.youtube_short_id).toBe('NEW');
  });

  it('seeds the list from empty metadata', async () => {
    const { sb, captured } = makeSb({});
    await persistShortId(sb as never, 'ep-1', 'FIRST', 'https://youtu.be/FIRST');
    const ids = (captured.metadata?.youtube_short_ids as Array<{ id: string }>).map((e) => e.id);
    expect(ids).toEqual(['FIRST']);
  });

  it('dedupes by id, moving a re-uploaded short to newest-last', async () => {
    const { sb, captured } = makeSb({
      youtube_short_ids: [{ id: 'A' }, { id: 'B' }],
    });
    await persistShortId(sb as never, 'ep-1', 'A', 'https://youtu.be/A');
    const ids = (captured.metadata?.youtube_short_ids as Array<{ id: string }>).map((e) => e.id);
    expect(ids).toEqual(['B', 'A']);
  });
});
