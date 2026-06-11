// state-ledger — deterministic Class-B continuity judge (Motor 1, 2026-06-11).
// Fixtures are the four defect families found in the E02 gag-beat bank audit:
//   1. double-yank cord      → REPEAT_FIRST_DISCOVERY
//   2. resurrected book pile → STATE_REVERT_NO_CAUSE
//   3. causeless light-on    → STATE_CHANGE_NO_CAUSE
//   4. feathers from nowhere → ENTITY_FROM_NOWHERE
// Plus negative timelines (valid comedy escalation → zero violations) and the
// q2-softened verdict policy (never FAIL; REVISE only at ≥3 MAJOR).

import { describe, it, expect } from 'vitest';
import {
  validateStateLedger,
  reviseImpactForMajorPool,
  LEDGER_REVISE_MAJOR_THRESHOLD,
  type ShotStateDelta,
} from '@/lib/agents/state-ledger';

function shot(
  id: string,
  index: number,
  actions: ShotStateDelta['actions'],
  introduced?: string[],
): ShotStateDelta {
  return { shot_id: id, shot_index: index, actions, entities_introduced: introduced };
}

describe('validateStateLedger — Class-B defect fixtures', () => {
  it('double-yank: second "first discovery" of the cord → REPEAT_FIRST_DISCOVERY', () => {
    const deltas: ShotStateDelta[] = [
      shot('SH21', 21, [
        {
          entity: 'lamp_cord',
          verb: 'yank',
          agent: 'sandy',
          presented_as_first: true,
          state_after: 'yanked',
        },
      ]),
      shot('SH47', 47, [
        {
          entity: 'lamp_cord',
          verb: 'yank',
          agent: 'sandy',
          presented_as_first: true,
          state_after: 'yanked_again',
        },
      ]),
    ];
    const v = validateStateLedger(deltas);
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe('REPEAT_FIRST_DISCOVERY');
    expect(v[0].entity).toBe('lamp_cord');
    expect(v[0].shot_id).toBe('SH47');
    expect(v[0].prior_shot_id).toBe('SH21');
    expect(v[0].severity).toBe('MAJOR');
  });

  it('resurrected book pile: collapsed in SH15, standing precondition in SH41 → STATE_REVERT_NO_CAUSE', () => {
    const deltas: ShotStateDelta[] = [
      shot('SH13', 13, [
        {
          entity: 'book_pile',
          verb: 'stack',
          agent: 'sandy',
          state_after: 'standing',
        },
      ]),
      shot('SH15', 15, [
        {
          entity: 'book_pile',
          verb: 'collapse',
          agent: 'sandy',
          state_before: 'standing',
          state_after: 'collapsed',
        },
      ]),
      shot('SH41', 41, [
        {
          entity: 'book_pile',
          verb: 'knock_over',
          agent: 'sandy',
          state_before: 'standing',
          state_after: 'scattered',
        },
      ]),
    ];
    const v = validateStateLedger(deltas);
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe('STATE_REVERT_NO_CAUSE');
    expect(v[0].shot_id).toBe('SH41');
    expect(v[0].prior_shot_id).toBe('SH15');
    expect(v[0].severity).toBe('MAJOR');
  });

  it('causeless light-on: autonomous event with no cause → STATE_CHANGE_NO_CAUSE MAJOR', () => {
    const deltas: ShotStateDelta[] = [
      shot('SH50', 50, [
        {
          entity: 'room_lights',
          verb: 'switch_off',
          agent: 'sandy',
          cause: 'дёрнул шнур',
          state_after: 'off',
        },
      ]),
      shot('SH52', 52, [
        {
          entity: 'room_lights',
          verb: 'switch_on',
          agent: null,
          cause: null,
          state_after: 'on',
        },
      ]),
    ];
    const v = validateStateLedger(deltas);
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe('STATE_CHANGE_NO_CAUSE');
    expect(v[0].severity).toBe('MAJOR');
    expect(v[0].shot_id).toBe('SH52');
  });

  it('feathers from nowhere: pre-existing state on a never-introduced entity → ENTITY_FROM_NOWHERE MINOR', () => {
    const deltas: ShotStateDelta[] = [
      shot('SH43', 43, [
        { entity: 'pillow', verb: 'fluff', agent: 'sandy', state_after: 'fluffed' },
      ]),
      shot('SH44', 44, [
        {
          entity: 'feathers',
          verb: 'chase',
          agent: 'sandy',
          state_before: 'airborne',
          state_after: 'scattered',
        },
      ]),
    ];
    const v = validateStateLedger(deltas);
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe('ENTITY_FROM_NOWHERE');
    expect(v[0].severity).toBe('MINOR');
    expect(v[0].entity).toBe('feathers');
  });
});

describe('validateStateLedger — negative cases (cartoon logic stays legal)', () => {
  it('valid escalation timeline → zero violations', () => {
    const deltas: ShotStateDelta[] = [
      shot('SH01', 1, [], ['drawer', 'desk']),
      shot('SH06', 6, [
        {
          entity: 'drawer',
          verb: 'overstuff',
          agent: 'sandy',
          state_before: 'open',
          state_after: 'overstuffed',
        },
      ]),
      // No state_before declared — montage jump is fine.
      shot('SH09', 9, [
        { entity: 'drawer', verb: 'eject', agent: null, cause: 'переполнен и спружинил', state_after: 'erupted' },
      ]),
      shot('SH10', 10, [
        {
          entity: 'drawer',
          verb: 'sit_on',
          agent: 'sandy',
          state_before: 'erupted',
          state_after: 'jammed',
        },
      ]),
    ];
    expect(validateStateLedger(deltas)).toHaveLength(0);

    // SH06 has state_before 'open' with no prior state — first action on an
    // INTRODUCED entity is legal (establishing covered it).
  });

  it('autonomous event WITH a named cause is legal', () => {
    const deltas: ShotStateDelta[] = [
      shot('SH16', 16, [
        {
          entity: 'round_table',
          verb: 'roll',
          agent: null,
          cause: 'опрокинут падением пирамиды книг',
          state_after: 'rolling',
        },
      ], ['round_table']),
    ];
    expect(validateStateLedger(deltas)).toHaveLength(0);
  });

  it('novel precondition after a different state is a MINOR note, not MAJOR', () => {
    const deltas: ShotStateDelta[] = [
      shot('SH02', 2, [
        { entity: 'rug', verb: 'lift', agent: 'sandy', state_after: 'lifted' },
      ]),
      shot('SH08', 8, [
        {
          entity: 'rug',
          verb: 'roll_into',
          agent: 'sandy',
          state_before: 'flat_on_floor',
          state_after: 'rolled_with_sandy_inside',
        },
      ]),
    ];
    const v = validateStateLedger(deltas);
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe('STATE_CHANGE_NO_CAUSE');
    expect(v[0].severity).toBe('MINOR');
  });

  it('unordered input deltas are sorted by shot_index before judging', () => {
    const deltas: ShotStateDelta[] = [
      shot('SH47', 47, [
        {
          entity: 'lamp_cord',
          verb: 'yank',
          presented_as_first: true,
          state_after: 'yanked_again',
        },
      ]),
      shot('SH21', 21, [
        {
          entity: 'lamp_cord',
          verb: 'yank',
          presented_as_first: true,
          state_after: 'yanked',
        },
      ]),
    ];
    const v = validateStateLedger(deltas);
    expect(v).toHaveLength(1);
    expect(v[0].shot_id).toBe('SH47');
    expect(v[0].prior_shot_id).toBe('SH21');
  });
});

describe('reviseImpactForMajorPool — q2 comedy-softened policy', () => {
  it('below threshold: MAJORs are notes, verdict untouched', () => {
    expect(reviseImpactForMajorPool(0)).toBe('NONE');
    expect(reviseImpactForMajorPool(LEDGER_REVISE_MAJOR_THRESHOLD - 1)).toBe('NONE');
  });

  it('at threshold and above: systemic drift → REVISE (never FAIL)', () => {
    expect(reviseImpactForMajorPool(LEDGER_REVISE_MAJOR_THRESHOLD)).toBe('REVISE');
    expect(reviseImpactForMajorPool(10)).toBe('REVISE');
  });
});
