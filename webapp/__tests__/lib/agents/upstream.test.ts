// F2 (2026-06-12) — newest-wins upstream resolver. Pins the E07 deadlock
// class: two APPROVED storyboards on the board → every consumer must bind
// to the SAME (newest) one, regardless of DB return order.

import { describe, it, expect } from 'vitest';
import { findApprovedAsset } from '@/lib/agents/upstream';

describe('findApprovedAsset — newest APPROVED wins', () => {
  it('picks the highest version among APPROVED duplicates, in any array order', () => {
    const v1 = { id: 'stb-v1', file_type: 'STB-storyboard', status: 'APPROVED', version: 1 };
    const v2 = { id: 'stb-v2', file_type: 'STB-storyboard', status: 'APPROVED', version: 2 };
    expect(findApprovedAsset([v1, v2], 'STB-storyboard')?.id).toBe('stb-v2');
    expect(findApprovedAsset([v2, v1], 'STB-storyboard')?.id).toBe('stb-v2');
  });

  it('ignores non-APPROVED rows by default', () => {
    const rows = [
      { id: 'a', file_type: 'SCR-script', status: 'REVIEW', version: 3 },
      { id: 'b', file_type: 'SCR-script', status: 'APPROVED', version: 1 },
    ];
    expect(findApprovedAsset(rows, 'SCR-script')?.id).toBe('b');
  });

  it('honours a custom status set (Story Editor REVIEWABLE semantics)', () => {
    const rows = [
      { id: 'a', file_type: 'SCR-script', status: 'REVIEW', version: 3 },
      { id: 'b', file_type: 'SCR-script', status: 'APPROVED', version: 1 },
    ];
    const reviewable = new Set(['REVIEW', 'REVISION', 'APPROVED']);
    expect(findApprovedAsset(rows, 'SCR-script', reviewable)?.id).toBe('a');
  });

  it('null on no match / undefined input', () => {
    expect(findApprovedAsset(undefined, 'STB-storyboard')).toBeNull();
    expect(findApprovedAsset([], 'STB-storyboard')).toBeNull();
    expect(
      findApprovedAsset([{ file_type: 'SCR-script', status: 'APPROVED' }], 'STB-storyboard'),
    ).toBeNull();
  });

  it('missing version sorts last among matches', () => {
    const rows = [
      { id: 'no-v', file_type: 'STB-storyboard', status: 'APPROVED' },
      { id: 'v2', file_type: 'STB-storyboard', status: 'APPROVED', version: 2 },
    ];
    expect(findApprovedAsset(rows, 'STB-storyboard')?.id).toBe('v2');
  });
});
