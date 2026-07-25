// ──────────────────────────────────────────────────────────────────────────────
// __tests__/lib/api/work-role-language.test.ts
// Unified work-state language (2026-07-02) — role detection + palette.
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  workRoleForAgent,
  activeWorkByShot,
  workRolePalette,
  stageRamp,
  rampStop,
  stageIdentity,
} from '@/lib/api/pipeline-stages';

describe('workRoleForAgent', () => {
  it('maps designer / critic / artist agents for both objects', () => {
    // References pipeline
    expect(workRoleForAgent('EXEC-EREF-DESIGNER')).toBe('designer');
    expect(workRoleForAgent('EXEC-EPREV')).toBe('critic');
    expect(workRoleForAgent('EXEC-EREF')).toBe('artist');
    // Video pipeline — same three roles
    expect(workRoleForAgent('EXEC-VANIM')).toBe('designer');
    expect(workRoleForAgent('EXEC-VPREV')).toBe('critic');
    expect(workRoleForAgent('EXEC-VGEN')).toBe('artist');
  });

  it('returns null for agents outside the two per-shot pipelines', () => {
    expect(workRoleForAgent('EXEC-SW')).toBeNull();
    expect(workRoleForAgent('EXEC-STITCH')).toBeNull();
    expect(workRoleForAgent('nonsense')).toBeNull();
  });
});

describe('activeWorkByShot', () => {
  const job = (agent_id: string, status: string, shotId: string) => ({
    agent_id,
    status,
    input_snapshot: { shotId },
  });

  it('collects roles per shot and ignores non-running jobs', () => {
    const map = activeWorkByShot([
      job('EXEC-VANIM', 'RUNNING', 'SH01'), // designer on video
      job('EXEC-VPREV', 'RUNNING', 'SH01'), // critic on video → both
      job('EXEC-EREF-DESIGNER', 'COMPLETED', 'SH02'), // not running → ignored
      job('EXEC-EREF', 'QUEUED', 'SH03'), // artist on references
    ]);
    expect(map.get('SH01')?.object).toBe('animate');
    expect(new Set(map.get('SH01')?.roles)).toEqual(new Set(['designer', 'critic']));
    expect(map.has('SH02')).toBe(false);
    expect(map.get('SH03')).toEqual({ object: 'design', roles: ['artist'] });
  });

  it('animate is the dominant object when both fire on one shot', () => {
    const map = activeWorkByShot([
      job('EXEC-EREF-DESIGNER', 'RUNNING', 'SH09'), // design
      job('EXEC-VANIM', 'RUNNING', 'SH09'), // animate → wins
    ]);
    expect(map.get('SH09')?.object).toBe('animate');
  });
});

describe('workRolePalette', () => {
  it('picks the right token: both > critic > designer > artist', () => {
    expect(workRolePalette(['designer', 'critic']).token).toBe('both');
    expect(workRolePalette(['critic']).token).toBe('critic');
    expect(workRolePalette(['designer']).token).toBe('designer');
    expect(workRolePalette(['artist']).token).toBe('artist');
    expect(workRolePalette([]).token).toBe('artist'); // empty → generating default
  });

  it('emits a human label (colour now composed from the ramp, not here)', () => {
    expect(workRolePalette(['designer', 'critic']).label).toBe('Designer + Critic');
    expect(workRolePalette(['critic']).label).toBe('Critic');
    expect(workRolePalette(['designer']).label).toBe('Designer');
    expect(workRolePalette([]).label).toBe('Generating');
  });
});

// ── Kebab colour grammar (2026-07-25) — hue = family × role, status never writes it.
describe('kebab colour grammar (stageRamp / rampStop / stageIdentity)', () => {
  it('rampStop maps a work token to its ramp stop (both rides critic)', () => {
    expect(rampStop('designer')).toBe('plan');
    expect(rampStop('critic')).toBe('critic');
    expect(rampStop('both')).toBe('critic');
    expect(rampStop('artist')).toBe('artist');
  });

  it('stageRamp emits the family×role token (theme-invariant, no inline hex)', () => {
    expect(stageRamp('ref', 'plan')).toBe('var(--stage-ref-plan)');
    expect(stageRamp('ref', 'critic')).toBe('var(--stage-ref-critic)');
    expect(stageRamp('vid', 'artist')).toBe('var(--stage-vid-artist)');
    // composition: video designer work → warm plan stop.
    expect(stageRamp('vid', rampStop('designer'))).toBe('var(--stage-vid-plan)');
    expect(stageRamp('ref', rampStop('designer'))).toBe('var(--stage-ref-plan)');
  });

  it('stageIdentity maps cell kinds + enriched paletteKinds to family×role', () => {
    expect(stageIdentity('image')).toEqual({ family: 'ref', role: 'artist' });
    expect(stageIdentity('video-canonical')).toEqual({ family: 'vid', role: 'artist' });
    expect(stageIdentity('ref-plan')).toEqual({ family: 'ref', role: 'plan' });
    expect(stageIdentity('vid-critic')).toEqual({ family: 'vid', role: 'critic' });
  });

  it('stageIdentity returns null for placeholders / unknown (→ not started)', () => {
    expect(stageIdentity('placeholder')).toBeNull();
    expect(stageIdentity(undefined)).toBeNull();
  });
});
