// Unit tests for the act-structure + shot-identity helpers.
//
// Act-count history (2026-06-22): the Storyboarder used to hardcode "exactly 3
// acts"; every episode through S15-E10 was 3-act so it never surfaced. E11 (first
// 4-act script) drifted. The act count is now script-owned.
//
// Shot-identity refactor (2026-06-26, Director q2): shot_id = `S{season}-
// E{episode}-SH{number}` — no studio prefix, no act, no scene. Act/scene were
// POSITION baked into the id and drifted (root of SH10 / SH12-14 / E11 chaos).
// Numbers are now assigned deterministically by position (canonicalShotId), and
// collectShotIdViolations rejects the legacy compound id as malformed.

import { describe, expect, test } from 'vitest';
import {
  canonicalShotId,
  collectShotIdViolations,
  countScriptActs,
  episodeShort,
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

describe('episodeShort / canonicalShotId', () => {
  test('strips the SS studio prefix from the episode code', () => {
    expect(episodeShort('SS-S15-E12')).toBe('S15-E12');
    expect(episodeShort('S15-E12')).toBe('S15-E12'); // idempotent
    expect(episodeShort('')).toBe('');
  });

  test('builds a zero-padded, SS-free, act/scene-free id by position', () => {
    expect(canonicalShotId('SS-S15-E12', 7)).toBe('S15-E12-SH07');
    expect(canonicalShotId('SS-S15-E12', 1)).toBe('S15-E12-SH01');
    expect(canonicalShotId('SS-S15-E12', 123)).toBe('S15-E12-SH123');
  });
});

describe('collectShotIdViolations', () => {
  const shot = (shot_id: string) => ({ shot_id });

  test('passes a continuous, unique, canonical board', () => {
    const body = {
      acts: [
        { act: 1, shots: [shot('S15-E12-SH01'), shot('S15-E12-SH02')] },
        { act: 2, shots: [shot('S15-E12-SH03')] },
      ],
    };
    expect(collectShotIdViolations(body)).toEqual([]);
  });

  test('flags non-continuous SH numbering (position drift)', () => {
    // SH must equal episode position; here #2 has SH05 and #3 has SH06.
    const body = {
      acts: [
        { act: 1, shots: [shot('S15-E11-SH01'), shot('S15-E11-SH05')] },
        { act: 2, shots: [shot('S15-E11-SH06')] },
      ],
    };
    const v = collectShotIdViolations(body);
    expect(v.length).toBeGreaterThan(0);
    expect(v.some((m) => m.includes('expected SH02'))).toBe(true);
    expect(v.some((m) => m.includes('expected SH03'))).toBe(true);
  });

  test('flags the legacy compound shot_id as malformed (rejects SS/A/SC)', () => {
    const body = {
      acts: [{ act: 1, shots: [shot('SS-S15-E12-A1-SC01-SH01')] }],
    };
    const v = collectShotIdViolations(body);
    expect(v.some((m) => m.startsWith('malformed shot_id'))).toBe(true);
  });

  test('flags a malformed shot_id with no canonical -SH tail', () => {
    const body = {
      acts: [{ act: 1, shots: [shot('S15-E12')] }],
    };
    const v = collectShotIdViolations(body);
    expect(v.some((m) => m.startsWith('malformed shot_id'))).toBe(true);
  });

  test('flags duplicate full shot_ids', () => {
    const body = {
      acts: [
        {
          act: 1,
          shots: [shot('S15-E12-SH01'), shot('S15-E12-SH01')],
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
