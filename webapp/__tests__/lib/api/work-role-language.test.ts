// ──────────────────────────────────────────────────────────────────────────────
// __tests__/lib/api/work-role-language.test.ts
// Unified work-state language (2026-07-02) — role detection + palette.
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  workRoleForAgent,
  activeWorkByShot,
  workRolePalette,
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

  it('emits theme-token colours (no inline hex) + a human label', () => {
    const both = workRolePalette(['designer', 'critic']);
    expect(both.color).toBe('var(--accent-role-both)');
    expect(both.label).toBe('Designer + Critic');
    expect(workRolePalette(['designer']).color).toBe('var(--accent-role-designer)');
  });
});
