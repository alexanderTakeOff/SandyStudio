// ──────────────────────────────────────────────────────────────────────────────
// __tests__/lib/api/start-video-latch.test.ts
// Pure coverage for the "Start Video" latch retro-fanout selection (E18,
// 2026-07-09). No auth / inngest / supabase — just the decision seam.
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { selectRetroFanoutShots } from '@/lib/api/start-video-latch';
import { SHOT_REFERENCE_CONTRACT } from '@/lib/api/shot-reference';

/** A valid v2 shot-reference asset row for `shotId`. */
function ref(shotId: string) {
  return { metadata: { shot_reference: { contract: SHOT_REFERENCE_CONTRACT, shot_id: shotId } } };
}

/** A shot-plan row that resolves (via metadata) to `shotId`. */
function planMeta(shotId: string) {
  return { metadata: { shot_id: shotId } };
}

const NONE = new Set<string>();

describe('selectRetroFanoutShots — Start Video latch backlog sweep', () => {
  it('fires an approved reference whose shot has no plan yet', () => {
    expect(selectRetroFanoutShots([ref('SH01')], [], NONE)).toEqual(['SH01']);
  });

  it('skips a shot that already has a plan (metadata)', () => {
    expect(selectRetroFanoutShots([ref('SH01')], [planMeta('SH01')], NONE)).toEqual([]);
  });

  it('skips a shot that already has a plan (resolved from content json)', () => {
    const planContent = {
      content: ['```json', JSON.stringify({ shot_id: 'SH01' }), '```'].join('\n'),
    };
    expect(selectRetroFanoutShots([ref('SH01')], [planContent], NONE)).toEqual([]);
  });

  it('skips an excluded shot even without a plan', () => {
    expect(selectRetroFanoutShots([ref('SH01')], [], new Set(['SH01']))).toEqual([]);
  });

  it('ignores a non-v2 reference (missing shot_reference contract)', () => {
    const legacy = { metadata: { shot_id: 'SH01' } }; // no shot_reference.contract
    expect(selectRetroFanoutShots([legacy], [], NONE)).toEqual([]);
  });

  it('dedupes multiple references for the same shot', () => {
    expect(selectRetroFanoutShots([ref('SH01'), ref('SH01')], [], NONE)).toEqual(['SH01']);
  });

  it('fires only the shots that still need a plan, preserving order', () => {
    const out = selectRetroFanoutShots(
      [ref('SH01'), ref('SH02'), ref('SH03')],
      [planMeta('SH02')], // SH02 already planned
      new Set(['SH03']), // SH03 excluded
    );
    expect(out).toEqual(['SH01']);
  });

  it('returns empty on empty inputs', () => {
    expect(selectRetroFanoutShots([], [], NONE)).toEqual([]);
  });
});
