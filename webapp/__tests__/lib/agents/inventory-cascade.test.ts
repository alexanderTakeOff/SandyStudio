// inventory-cascade — Motor 2 CHK-W04 pure validator (2026-06-11).
// Cascade: union(Bible SBL-object_* ∪ brief prop_delta); entities come from
// the SAME extraction deltas the state-ledger consumes.

import { describe, it, expect } from 'vitest';
import {
  validateInventory,
  parseBriefPropDelta,
  type PropSpec,
} from '@/lib/agents/inventory-cascade';
import type { ShotStateDelta } from '@/lib/agents/state-ledger';

const delta = (
  id: string,
  index: number,
  entities: string[],
  introduced?: string[],
): ShotStateDelta => ({
  shot_id: id,
  shot_index: index,
  entities_introduced: introduced,
  actions: entities.map((e) => ({ entity: e, verb: 'touch', state_after: 'touched' })),
});

describe('validateInventory — CHK-W04 cascade', () => {
  const bible: PropSpec[] = [
    { name: 'bed' },
    { name: 'round_side_table', aliases: ['side_table', 'round_table'] },
    { name: 'lamp', geometry: 'floor lamp on a cord' },
  ];

  it('empty union → NO_INVENTORY, zero violations (data-gated activation)', () => {
    const r = validateInventory([delta('SH01', 1, ['bed'])], [], ['sandy']);
    expect(r.status).toBe('NO_INVENTORY');
    expect(r.violations).toHaveLength(0);
  });

  it('resolves names, aliases, and skips known non-props', () => {
    const r = validateInventory(
      [delta('SH01', 1, ['bed', 'round_table', 'sandy', 'Sandy Bedroom'])],
      bible,
      ['sandy', 'sandy_bedroom'],
    );
    expect(r.status).toBe('OK');
    expect(r.violations).toHaveLength(0);
    expect(r.resolvedCount).toBe(2); // bed + round_table(alias)
  });

  it('union with brief delta resolves episode-only props; the rest violate MINOR once', () => {
    const briefDelta: PropSpec[] = [{ name: 'book_pile' }];
    const r = validateInventory(
      [
        delta('SH05', 5, ['book_pile', 'mystery_box']),
        delta('SH09', 9, ['mystery_box']), // dedup — one violation per entity
      ],
      [...bible, ...briefDelta],
      [],
    );
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0]).toMatchObject({
      rule: 'UNRESOLVED_PROP',
      entity: 'mystery_box',
      shot_id: 'SH05',
      severity: 'MINOR',
    });
    expect(r.unresolvedEntities).toEqual(['mystery_box']);
  });

  it('entities_introduced are checked too, normalization handles case/spaces', () => {
    const r = validateInventory(
      [delta('SH01', 1, [], ['Round Side Table', 'ghost_prop'])],
      bible,
      [],
    );
    expect(r.violations.map((v) => v.entity)).toEqual(['ghost_prop']);
  });
});

describe('parseBriefPropDelta — q3a brief convention', () => {
  it('parses prop_delta from the brief JSON block', () => {
    const brief = [
      '# Brief',
      'text',
      '```json',
      JSON.stringify({
        prop_delta: [
          { name: 'book_pile', aliases: ['books'], geometry: 'tall unstable stack' },
          { name: '' }, // dropped — empty name
          'garbage', // dropped
        ],
      }),
      '```',
    ].join('\n');
    const d = parseBriefPropDelta(brief);
    expect(d).toHaveLength(1);
    expect(d[0]).toEqual({
      name: 'book_pile',
      aliases: ['books'],
      geometry: 'tall unstable stack',
    });
  });

  it('no JSON block / no field / null content → empty delta', () => {
    expect(parseBriefPropDelta('plain markdown')).toEqual([]);
    expect(parseBriefPropDelta('```json\n{"other": 1}\n```')).toEqual([]);
    expect(parseBriefPropDelta(null)).toEqual([]);
  });

  it('skips non-matching JSON blocks and finds the one with prop_delta', () => {
    const brief = [
      '```json',
      '{"runtime_target_seconds": 60}',
      '```',
      '```json',
      '{"prop_delta": [{"name": "rug"}]}',
      '```',
    ].join('\n');
    expect(parseBriefPropDelta(brief)).toEqual([{ name: 'rug' }]);
  });
});
