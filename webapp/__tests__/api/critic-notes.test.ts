import { describe, it, expect } from 'vitest';

import { mergeRevisionNote } from '@/lib/api/critic-notes';

describe('mergeRevisionNote (ref revision auto-loop)', () => {
  it('returns just the Director note when there are no critic bullets', () => {
    expect(mergeRevisionNote('fix the left hand', [])).toBe('fix the left hand');
  });

  it('returns just the critic bullets when there is no Director note', () => {
    const out = mergeRevisionNote(null, ['V03: eyes off-canon', 'match the palette']);
    expect(out).toContain('Critic acceptance criteria');
    expect(out).toContain('- V03: eyes off-canon');
    expect(out).toContain('- match the palette');
  });

  it('merges both — Director note leads, critic bullets follow', () => {
    const out = mergeRevisionNote('fix hand', ['match palette']);
    expect(out).not.toBeNull();
    expect(out!.indexOf('fix hand')).toBeLessThan(out!.indexOf('match palette'));
  });

  it('returns null when there is nothing to say', () => {
    expect(mergeRevisionNote('', [])).toBeNull();
    expect(mergeRevisionNote('   ', [])).toBeNull();
    expect(mergeRevisionNote(null, [])).toBeNull();
    expect(mergeRevisionNote(undefined, [])).toBeNull();
  });
});
