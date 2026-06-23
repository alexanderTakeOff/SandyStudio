// Unit tests for the act-structure helpers behind the E11 root-cause fix
// (2026-06-22). The Storyboarder used to hardcode "exactly 3 acts"; every
// episode through S15-E10 was 3-act so it never surfaced. E11 (first 4-act
// script) drifted — A4 shots got filed under act:3. These helpers make the act
// count script-owned and let the postcondition assert the triple invariant.

import { describe, expect, test } from 'vitest';
import {
  collectShotIdViolations,
  countScriptActs,
  maxActInShotIds,
} from '@/lib/agents/runners/storyboarder';

describe('countScriptActs', () => {
  test('counts distinct Act headers (## or ###, any dash suffix)', () => {
    const script = [
      '### Act 1 — Завязка: Жаркий день',
      'scene text',
      '### Act 2 — Развитие: Борьба с Вентилятором',
      '### Act 3 — Кульминация: Полное рассыпание',
      '### Act 4 — Развязка: Сборка',
    ].join('\n');
    expect(countScriptActs(script)).toBe(4); // the E11 shape
  });

  test('returns 3 for the historical 3-act shape', () => {
    const script = '## Act 1 — A\n## Act 2 — B\n## Act 3 — C';
    expect(countScriptActs(script)).toBe(3);
  });

  test('de-duplicates repeated Act headers', () => {
    const script = '## Act 1\n...\n## Act 1 (continued)\n## Act 2';
    expect(countScriptActs(script)).toBe(2);
  });

  test('returns 0 when no Act header is present (caller falls back)', () => {
    expect(countScriptActs('just prose, no headers')).toBe(0);
    expect(countScriptActs('')).toBe(0);
  });
});

describe('maxActInShotIds', () => {
  const shot = (shot_id: string) => ({ shot_id });

  test('returns the highest A# across all shot_ids', () => {
    const body = {
      acts: [
        { act: 1, shots: [shot('SS-S15-E11-A1-SC01-SH01')] },
        { act: 2, shots: [shot('SS-S15-E11-A2-SC25-SH01')] },
        // E11 drift: act-object 3 carries both A3 and A4 shot_ids
        {
          act: 3,
          shots: [
            shot('SS-S15-E11-A3-SC01-SH01'),
            shot('SS-S15-E11-A4-SC02-SH02'),
          ],
        },
      ],
    };
    expect(maxActInShotIds(body)).toBe(4); // exposes the 3-objects/4-acts drift
  });

  test('matches act-object count for a clean 3-act board', () => {
    const body = {
      acts: [
        { act: 1, shots: [shot('SS-S15-E10-A1-SC01-SH01')] },
        { act: 2, shots: [shot('SS-S15-E10-A2-SC01-SH01')] },
        { act: 3, shots: [shot('SS-S15-E10-A3-SC01-SH01')] },
      ],
    };
    expect(maxActInShotIds(body)).toBe(3);
  });

  test('tolerates missing/!malformed bodies and shot_ids', () => {
    expect(maxActInShotIds(null)).toBe(0);
    expect(maxActInShotIds({})).toBe(0);
    expect(maxActInShotIds({ acts: [{ act: 1, shots: [{}, { shot_id: 5 }] }] })).toBe(0);
  });
});

describe('collectShotIdViolations', () => {
  const shot = (shot_id: string) => ({ shot_id });

  test('passes a continuous, unique, canonical board', () => {
    const body = {
      acts: [
        { act: 1, shots: [shot('SS-S15-E12-A1-SC01-SH01'), shot('SS-S15-E12-A1-SC01-SH02')] },
        { act: 2, shots: [shot('SS-S15-E12-A2-SC02-SH03')] },
      ],
    };
    expect(collectShotIdViolations(body)).toEqual([]);
  });

  test('flags the E11 symptom — per-scene SH reset breaks continuity', () => {
    // Each scene restarts SH at 01 (what gemini produced for E11). Full ids are
    // unique (different SC) but SH no longer equals episode position.
    const body = {
      acts: [
        { act: 1, shots: [shot('SS-S15-E11-A1-SC01-SH01'), shot('SS-S15-E11-A1-SC02-SH01')] },
        { act: 2, shots: [shot('SS-S15-E11-A2-SC03-SH01')] },
      ],
    };
    const v = collectShotIdViolations(body);
    expect(v.length).toBeGreaterThan(0);
    // shot #2 should be SH02, shot #3 should be SH03
    expect(v.some((m) => m.includes('expected SH02'))).toBe(true);
    expect(v.some((m) => m.includes('expected SH03'))).toBe(true);
  });

  test('flags a malformed shot_id with no canonical -SH tail', () => {
    const body = {
      acts: [{ act: 1, shots: [shot('SS-S15-E12-A1-SC01')] }],
    };
    const v = collectShotIdViolations(body);
    expect(v.some((m) => m.startsWith('malformed shot_id'))).toBe(true);
  });

  test('flags duplicate full shot_ids', () => {
    const body = {
      acts: [
        {
          act: 1,
          shots: [shot('SS-S15-E12-A1-SC01-SH01'), shot('SS-S15-E12-A1-SC01-SH01')],
        },
      ],
    };
    const v = collectShotIdViolations(body);
    expect(v.some((m) => m.startsWith('duplicate shot_id'))).toBe(true);
  });

  test('flags a shot missing its shot_id', () => {
    const body = { acts: [{ act: 1, shots: [{}] }] };
    const v = collectShotIdViolations(body);
    expect(v.some((m) => m.includes('no shot_id'))).toBe(true);
  });

  test('tolerates missing/empty bodies', () => {
    expect(collectShotIdViolations(null)).toEqual([]);
    expect(collectShotIdViolations({})).toEqual([]);
    expect(collectShotIdViolations({ acts: [] })).toEqual([]);
  });
});
