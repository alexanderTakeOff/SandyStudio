// Factory metrics — pure helper tests. Locks the two things the raw scorecard
// gets wrong: the Director/Polina/AI-EP 3-way split (Polina must NOT count as the
// human Director) and the pre/post-cast bucketing around the casting-lock.

import { describe, it, expect } from 'vitest';

import {
  touchClass,
  isPostCast,
  splitTouches,
  castLockFromEvents,
  foldCost,
  type TouchEvent,
} from '@/lib/agents/scorecard/factory-metrics';

const DIRECTOR_UUID = '95c8bf1a-9f4b-43b7-b40a-359e3ac8a5ea';

describe('touchClass — 3-way actor split', () => {
  it('AI-EP token → ai_ep', () => {
    expect(touchClass('exec-dir-ai', null)).toBe('ai_ep');
    expect(touchClass('EXEC-DIR-AI', 'anything')).toBe('ai_ep');
  });
  it('Director UUID without marker → director', () => {
    expect(touchClass(DIRECTOR_UUID, 'Approve pilot SH01')).toBe('director');
    expect(touchClass(DIRECTOR_UUID, null)).toBe('director');
  });
  it('Director UUID WITH [Prod Assistant] marker → polina (not director)', () => {
    expect(touchClass(DIRECTOR_UUID, '[Prod Assistant] regenerate ref — looks off')).toBe('polina');
  });
  it('pipeline agent / system → null (not a touch)', () => {
    expect(touchClass('EXEC-SW', null)).toBeNull();
    expect(touchClass(null, null)).toBeNull();
  });
});

describe('isPostCast — casting boundary', () => {
  const lock = '2026-07-16T10:00:00Z';
  it('no lock ⇒ nothing is post-cast', () => {
    expect(isPostCast('2026-07-16T12:00:00Z', null)).toBe(false);
  });
  it('strictly after lock ⇒ post-cast', () => {
    expect(isPostCast('2026-07-16T10:00:01Z', lock)).toBe(true);
  });
  it('at/before lock ⇒ pre-cast (the casting approval is the last pre-cast act)', () => {
    expect(isPostCast(lock, lock)).toBe(false);
    expect(isPostCast('2026-07-16T09:00:00Z', lock)).toBe(false);
  });
});

describe('castLockFromEvents', () => {
  it('earliest approval_granted of SPC-episode_cast', () => {
    const events = [
      { event_type: 'approval_granted', created_at: '2026-07-16T11:00:00Z', metadata: { file_type: 'SPC-episode_cast' } },
      { event_type: 'approval_granted', created_at: '2026-07-16T09:00:00Z', metadata: { file_type: 'SPC-episode_cast' } },
      { event_type: 'approval_granted', created_at: '2026-07-16T08:00:00Z', metadata: { file_type: 'STB-storyboard' } },
    ];
    expect(castLockFromEvents(events)).toBe('2026-07-16T09:00:00Z');
  });
  it('null when casting never approved', () => {
    expect(castLockFromEvents([{ event_type: 'approval_granted', created_at: 'x', metadata: { file_type: 'VID-shot' } }])).toBeNull();
  });
});

describe('splitTouches — buckets + pre/post', () => {
  const lock = '2026-07-16T10:00:00Z';
  const ev = (actor: string | null, description: string | null, created_at: string): TouchEvent => ({
    event_type: 'approval_granted',
    actor,
    description,
    created_at,
  });
  it('splits 3 ways and by pre/post-cast, ignoring system actors', () => {
    const events: TouchEvent[] = [
      ev(DIRECTOR_UUID, 'human approve', '2026-07-16T09:00:00Z'), // pre director
      ev(DIRECTOR_UUID, '[Prod Assistant] regen', '2026-07-16T11:00:00Z'), // post polina
      ev('exec-dir-ai', 'auto', '2026-07-16T12:00:00Z'), // post ai_ep
      ev('EXEC-SW', 'pipeline', '2026-07-16T12:30:00Z'), // ignored
    ];
    const s = splitTouches(events, lock);
    expect(s.all).toEqual({ director: 1, polina: 1, aiEp: 1, total: 3 });
    expect(s.pre).toEqual({ director: 1, polina: 0, aiEp: 0, total: 1 });
    expect(s.post).toEqual({ director: 0, polina: 1, aiEp: 1, total: 2 });
  });
});

describe('foldCost', () => {
  it('folds rows by key, sums cost + calls, sorts desc', () => {
    const rows = [
      { agent_id: 'EXEC-VGEN', cost_usd: 3 },
      { agent_id: 'EXEC-EREF', cost_usd: 1 },
      { agent_id: 'EXEC-VGEN', cost_usd: 2 },
    ];
    const out = foldCost(rows, (r: { agent_id: string | null }) => r.agent_id ?? 'unknown');
    expect(out[0]).toEqual({ key: 'EXEC-VGEN', costUsd: 5, calls: 2 });
    expect(out[1]).toEqual({ key: 'EXEC-EREF', costUsd: 1, calls: 1 });
  });
});
