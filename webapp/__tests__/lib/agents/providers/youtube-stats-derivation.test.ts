// ──────────────────────────────────────────────────────────────────────────────
// Guards for the two derivations that made the Audience sensor lie (2026-07-21):
//  1. a SCHEDULED video reports privacyStatus 'private' + publishAt — reading the
//     raw field mislabelled all 18 of ours as private;
//  2. averageViewPercentage can exceed 100% (measured 4228% off five playbacks),
//     which is one tab left running, not an audience.
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { isCompletionReadable } from '@/lib/agents/providers/youtube-stats';

/** Mirrors the derivation inside getVideoStatistics — kept in sync by these tests. */
function derive(privacy: string | undefined, publishAt: string | null, publishedAt: string | null) {
  if (privacy === 'public') return { state: 'public', liveAt: publishedAt };
  if (privacy === 'unlisted') return { state: 'unlisted', liveAt: publishedAt };
  if (publishAt) return { state: 'scheduled', liveAt: publishAt };
  return { state: 'private-draft', liveAt: null };
}

describe('publication state derivation', () => {
  it('reads a scheduled video as scheduled, not private', () => {
    // Arrange — exactly what the Data API returns for a scheduled upload.
    const privacy = 'private';
    const publishAt = '2026-07-23T20:00:00Z';

    // Act
    const result = derive(privacy, publishAt, '2026-07-16T09:00:00Z');

    // Assert
    expect(result.state).toBe('scheduled');
  });

  it('reports the release date, not the upload date, for a scheduled video', () => {
    const result = derive('private', '2026-07-30T20:00:00Z', '2026-07-10T08:00:00Z');
    expect(result.liveAt).toBe('2026-07-30T20:00:00Z');
  });

  it('calls a video with no publishAt a private draft', () => {
    const result = derive('private', null, '2026-07-10T08:00:00Z');
    expect(result.state).toBe('private-draft');
    expect(result.liveAt).toBeNull();
  });

  it('keeps public and unlisted distinct', () => {
    expect(derive('public', null, '2026-07-19T00:00:00Z').state).toBe('public');
    expect(derive('unlisted', null, '2026-07-19T00:00:00Z').state).toBe('unlisted');
  });
});

describe('isCompletionReadable', () => {
  it('rejects the loop-inflated values that topped the board', () => {
    expect(isCompletionReadable(4228)).toBe(false);
    expect(isCompletionReadable(2153)).toBe(false);
    expect(isCompletionReadable(127)).toBe(false);
  });

  it('accepts a sane completion percentage', () => {
    expect(isCompletionReadable(61)).toBe(true);
    expect(isCompletionReadable(100)).toBe(true);
  });

  it('rejects absent or zero readings rather than treating them as "watched nothing"', () => {
    expect(isCompletionReadable(null)).toBe(false);
    expect(isCompletionReadable(undefined)).toBe(false);
    expect(isCompletionReadable(0)).toBe(false);
  });
});
