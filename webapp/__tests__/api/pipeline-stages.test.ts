// ──────────────────────────────────────────────────────────────────────────────
// __tests__/api/pipeline-stages.test.ts
// Coverage for buildPipelineSnapshot — the 10-stage DAG mapper.
// ──────────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';
import { buildPipelineSnapshot } from '@/lib/api/pipeline-stages';

const baseAsset = {
  id: 'a1',
  filename: '',
  file_type: 'SPC',
  status: 'DRAFT',
  agent_id: null,
  created_at: '2026-04-29T00:00:00Z',
};

describe('buildPipelineSnapshot', () => {
  it('returns 9 stages in canonical backbone-v2 order (Episode references inserted between Storyboard and Animatic; World Check hidden until Series Bible exists)', () => {
    const stages = buildPipelineSnapshot('BRIEF_PENDING', [], []);
    expect(stages.map((s) => s.id)).toEqual([
      'brief',
      'script',
      'storyboard',
      'episode_reference',
      'animatic',
      'generation',
      'distribution',
      'publish',
      'analytics',
    ]);
  });

  it('all stages start idle when no assets/jobs', () => {
    const stages = buildPipelineSnapshot('BRIEF_PENDING', [], []);
    for (const s of stages) expect(s.state).toBe('idle');
  });

  it('approved brief asset → brief stage approved', () => {
    const stages = buildPipelineSnapshot(
      'BRIEF_APPROVED',
      [{ ...baseAsset, filename: 'SS-S01-E01-SPC-brief-v01-APPROVED.md', status: 'APPROVED' }],
      [],
    );
    expect(stages.find((s) => s.id === 'brief')?.state).toBe('approved');
  });

  it('REVIEW asset shows blocked (waiting on Director)', () => {
    const stages = buildPipelineSnapshot(
      'SCRIPT_REVIEW',
      [{ ...baseAsset, filename: 'SS-S01-E01-SCR-script-v01-REVIEW.md', file_type: 'SCR', status: 'REVIEW' }],
      [],
    );
    expect(stages.find((s) => s.id === 'script')?.state).toBe('blocked');
  });

  it('failed job → stage failed', () => {
    const stages = buildPipelineSnapshot(
      'GENERATION_IN_PROGRESS',
      [],
      [{ id: 'j1', agent_id: 'EXEC-VGEN', status: 'FAILED' }],
    );
    expect(stages.find((s) => s.id === 'generation')?.state).toBe('failed');
  });

  it('running job + no failures → running', () => {
    const stages = buildPipelineSnapshot(
      'SCRIPT_IN_PROGRESS',
      [],
      [{ id: 'j1', agent_id: 'EXEC-SW', status: 'RUNNING' }],
    );
    expect(stages.find((s) => s.id === 'script')?.state).toBe('running');
  });

  it('PUBLISHED status overrides publish stage to approved', () => {
    const stages = buildPipelineSnapshot('PUBLISHED', [], []);
    expect(stages.find((s) => s.id === 'publish')?.state).toBe('approved');
  });

  it('counts running and failed jobs per stage', () => {
    const stages = buildPipelineSnapshot(
      'GENERATION_IN_PROGRESS',
      [],
      [
        { id: 'j1', agent_id: 'EXEC-VGEN', status: 'RUNNING' },
        { id: 'j2', agent_id: 'EXEC-VGEN', status: 'FAILED' },
        { id: 'j3', agent_id: 'EXEC-VGEN', status: 'COMPLETED' },
      ],
    );
    const gen = stages.find((s) => s.id === 'generation')!;
    expect(gen.job_count?.total).toBe(3);
    expect(gen.job_count?.running).toBe(1);
    expect(gen.job_count?.failed).toBe(1);
    expect(gen.job_count?.done).toBe(1);
  });
});
