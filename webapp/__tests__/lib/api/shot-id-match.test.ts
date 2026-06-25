import { describe, it, expect } from 'vitest';

import { shotIdsMatchLoose } from '@/lib/api/vgen-shot-helpers';

describe('shotIdsMatchLoose — bare/canonical-tolerant shot match', () => {
  it('matches identical canonical ids', () => {
    expect(
      shotIdsMatchLoose('SS-S15-E12-A2-SC06-SH10', 'SS-S15-E12-A2-SC06-SH10'),
    ).toBe(true);
  });

  it('matches a bare SH id against a canonical id (one side lacks scene)', () => {
    expect(shotIdsMatchLoose('SH10', 'SS-S15-E12-A2-SC06-SH10')).toBe(true);
    expect(shotIdsMatchLoose('SS-S15-E12-A2-SC06-SH10', 'SH10')).toBe(true);
  });

  it('matches scene-qualified vs full canonical (both scene-qualified, same scene)', () => {
    expect(shotIdsMatchLoose('A2-SC06-SH10', 'SS-S15-E12-A2-SC06-SH10')).toBe(true);
  });

  it('does NOT match two scene-qualified ids in different scenes (no false dedup)', () => {
    expect(shotIdsMatchLoose('A2-SC06-SH10', 'A3-SC09-SH10')).toBe(false);
  });

  it('does NOT match different shot numbers', () => {
    expect(shotIdsMatchLoose('SH10', 'SH11')).toBe(false);
    expect(shotIdsMatchLoose('A2-SC06-SH10', 'A2-SC06-SH11')).toBe(false);
  });

  it('matches bare vs bare same number', () => {
    expect(shotIdsMatchLoose('SH10', 'sh10')).toBe(true); // case-insensitive
  });
});
