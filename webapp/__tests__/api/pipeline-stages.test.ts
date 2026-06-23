// ──────────────────────────────────────────────────────────────────────────────
// __tests__/api/pipeline-stages.test.ts
// Coverage for buildPipelineSnapshot — backbone v2.5 (per-agent rows).
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

describe('buildPipelineSnapshot — per-agent rows (Topic 3 19-row model)', () => {
  it('returns per-agent rows in canonical order (Brief → Casting → Writer, 2026-06-23)', () => {
    const stages = buildPipelineSnapshot('BRIEF_PENDING', [], []);
    expect(stages.map((s) => s.id)).toEqual([
      'brief',
      'casting',
      'screenwriter',
      'script_critic',
      'storyboarder',
      'continuity_critic',
      'reference_designer',
      'reference_critic',
      'episode_references',
      'music_generator',
      'animatic',
      'shot_designer',
      'shot_critic',
      'visual_generator',
      'final_cut',
      'copywriter',
      'thumbnail_designer',
      'thumbnail_critic',
      'thumbnail_creator',
      'publisher',
      'analytics_collector',
    ]);
  });

  it('tiers: Artist/Author/Editor + hard-gate = primary; Designer/Critic = muted', () => {
    const stages = buildPipelineSnapshot('BRIEF_PENDING', [], []);
    const byId = new Map(stages.map((s) => [s.id, s]));
    // PRIMARY
    for (const id of ['brief', 'screenwriter', 'storyboarder', 'episode_references', 'music_generator', 'animatic', 'visual_generator', 'final_cut', 'copywriter', 'thumbnail_creator', 'publisher', 'analytics_collector'] as const) {
      expect(byId.get(id)!.tier).toBe('primary');
    }
    // MUTED — Designers + Critics
    for (const id of ['script_critic', 'continuity_critic', 'reference_designer', 'reference_critic', 'shot_designer', 'shot_critic', 'thumbnail_designer', 'thumbnail_critic'] as const) {
      expect(byId.get(id)!.tier).toBe('muted');
    }
  });

  it('muted Critic rows declare the PRIMARY they serve', () => {
    const stages = buildPipelineSnapshot('BRIEF_PENDING', [], []);
    const byId = new Map(stages.map((s) => [s.id, s]));
    expect(byId.get('script_critic')!.serves).toBe('screenwriter');
    expect(byId.get('continuity_critic')!.serves).toBe('storyboarder');
    expect(byId.get('reference_critic')!.serves).toBe('episode_references');
    expect(byId.get('reference_designer')!.serves).toBe('episode_references');
    expect(byId.get('shot_critic')!.serves).toBe('visual_generator');
    expect(byId.get('shot_designer')!.serves).toBe('visual_generator');
    expect(byId.get('thumbnail_designer')!.serves).toBe('thumbnail_creator');
  });

  it('thumbnail_critic is an honest unstaffed empty slot (q11a)', () => {
    const stages = buildPipelineSnapshot('BRIEF_PENDING', [], []);
    const tc = stages.find((s) => s.id === 'thumbnail_critic')!;
    expect(tc.unstaffed).toBe(true);
    expect(tc.agents).toEqual([]);
    expect(tc.tier).toBe('muted');
    expect(tc.role).toBe('critic');
  });

  it('Reference Designer plan + Reference Critic verdict route to their own rows', () => {
    const stages = buildPipelineSnapshot(
      'PRODUCTION_IN_PROGRESS',
      [
        {
          ...baseAsset,
          filename: 'SS-S01-E01-SPC-ref_plan-SC01-SH01-v01-REVIEW.md',
          file_type: 'SPC-ref_plan-SC01-SH01',
          status: 'REVIEW',
        },
        {
          ...baseAsset,
          id: 'a2',
          filename: 'SS-S01-E01-REV-ref_plan-SC01-SH01-v01-APPROVED.md',
          file_type: 'REV-ref_plan-SC01-SH01',
          status: 'APPROVED',
          description: 'Produced by EXEC-EPREV · verdict PASS · cost $0.02',
        },
      ],
      [{ id: 'j1', agent_id: 'EXEC-EREF-DESIGNER', status: 'COMPLETED' }],
    );
    expect(stages.find((s) => s.id === 'reference_designer')!.state).toBe('blocked');
    const rc = stages.find((s) => s.id === 'reference_critic')!;
    expect(rc.state).toBe('approved');
    expect(rc.latest_verdict).toBe('PASS');
  });

  it('shot_critic surfaces REVISE verdict from the latest REV body', () => {
    const stages = buildPipelineSnapshot(
      'GENERATION_IN_PROGRESS',
      [
        {
          ...baseAsset,
          filename: 'SS-S01-E01-REV-shot_plan-SC01-SH01-v01-REVISION.md',
          file_type: 'REV-shot_plan-SC01-SH01',
          status: 'REVISION',
          content: 'notes\n```json\n{ "verdict": "REVISE" }\n```',
        },
      ],
      [],
    );
    const sc = stages.find((s) => s.id === 'shot_critic')!;
    expect(sc.latest_verdict).toBe('REVISE');
  });

  it('Music row sits in production phase BEFORE Animatic (audio reorg LT-04)', () => {
    const stages = buildPipelineSnapshot('BRIEF_PENDING', [], []);
    const musicIdx = stages.findIndex((s) => s.id === 'music_generator');
    const animaticIdx = stages.findIndex((s) => s.id === 'animatic');
    expect(musicIdx).toBeGreaterThan(-1);
    expect(animaticIdx).toBeGreaterThan(-1);
    expect(musicIdx).toBeLessThan(animaticIdx);
    expect(stages[musicIdx]!.phase).toBe('production');
  });

  it('Final Cut row sits in generation phase AFTER Visual Generator', () => {
    const stages = buildPipelineSnapshot('BRIEF_PENDING', [], []);
    const vgenIdx = stages.findIndex((s) => s.id === 'visual_generator');
    const finalIdx = stages.findIndex((s) => s.id === 'final_cut');
    expect(finalIdx).toBeGreaterThan(vgenIdx);
    expect(stages[finalIdx]!.phase).toBe('generation');
    expect(stages[finalIdx]!.agents).toEqual(['EXEC-STITCH']);
  });

  it('rows are grouped by phase', () => {
    const stages = buildPipelineSnapshot('BRIEF_PENDING', [], []);
    const phases = stages.map((s) => s.phase);
    // pre-production, then production, then generation, then distribution, then analytics
    expect(phases.slice(0, 3)).toEqual([
      'pre-production',
      'pre-production',
      'pre-production',
    ]);
    expect(phases[phases.length - 1]).toBe('analytics');
  });

  it('SPC-shot_plan asset routes to shot_designer row, EXEC-VANIM job too (Topic 3 rename)', () => {
    const stages = buildPipelineSnapshot(
      'GENERATION_IN_PROGRESS',
      [
        {
          ...baseAsset,
          filename:
            'SS-S15-E01-SPC-shot_plan-SS-S15-E01-A1-SC01-SH01-v01-REVIEW.md',
          file_type: 'SPC-shot_plan-SS-S15-E01-A1-SC01-SH01',
          status: 'REVIEW',
        },
      ],
      [{ id: 'j1', agent_id: 'EXEC-VANIM', status: 'RUNNING' }],
    );
    const sp = stages.find((s) => s.id === 'shot_designer')!;
    expect(sp.label).toBe('Video Designer');
    expect(sp.agents).toEqual(['EXEC-VANIM']);
    expect(sp.phase).toBe('generation');
    expect(sp.tier).toBe('muted');
    expect(sp.state).toBe('blocked'); // REVIEW asset → blocked
    expect(sp.assets_in_review).toBe(1);
    expect(sp.job_count?.running).toBe(1);
  });

  it('visual_generator row carries the Video Artist label (TD-46)', () => {
    const stages = buildPipelineSnapshot('BRIEF_PENDING', [], []);
    const vg = stages.find((s) => s.id === 'visual_generator')!;
    expect(vg.label).toBe('Video Artist');
    expect(vg.agents).toEqual(['EXEC-VGEN']);
  });

  it('VID-final_cut asset routes to final_cut row, EXEC-STITCH job too', () => {
    const stages = buildPipelineSnapshot(
      'GENERATION_APPROVED',
      [
        {
          ...baseAsset,
          filename: 'SS-S14-E01-VID-final_cut-v01-APPROVED.mp4',
          file_type: 'VID-final_cut',
          status: 'APPROVED',
        },
      ],
      [{ id: 'j1', agent_id: 'EXEC-STITCH', status: 'COMPLETED' }],
    );
    const fc = stages.find((s) => s.id === 'final_cut')!;
    expect(fc.state).toBe('approved');
    expect(fc.job_count?.total).toBe(1);
    expect(fc.job_count?.done).toBe(1);
  });

  it('all rows start idle when no assets/jobs', () => {
    const stages = buildPipelineSnapshot('BRIEF_PENDING', [], []);
    for (const s of stages) expect(s.state).toBe('idle');
  });

  it('approved brief asset → brief row approved', () => {
    const stages = buildPipelineSnapshot(
      'BRIEF_APPROVED',
      [{ ...baseAsset, filename: 'SS-S01-E01-SPC-brief-v01-APPROVED.md', status: 'APPROVED' }],
      [],
    );
    expect(stages.find((s) => s.id === 'brief')?.state).toBe('approved');
  });

  it('REV-script_qa goes to its own script_critic row, not screenwriter', () => {
    const stages = buildPipelineSnapshot(
      'SCRIPT_REVIEW',
      [
        {
          ...baseAsset,
          filename: 'SS-S01-E01-SCR-script-v01-APPROVED.md',
          file_type: 'SCR-script',
          status: 'APPROVED',
        },
        {
          ...baseAsset,
          id: 'a2',
          filename: 'SS-S01-E01-REV-script_qa-v01-REVIEW.md',
          file_type: 'REV-script_qa',
          status: 'REVIEW',
        },
      ],
      [],
    );
    expect(stages.find((s) => s.id === 'screenwriter')?.state).toBe('approved');
    expect(stages.find((s) => s.id === 'script_critic')?.state).toBe('blocked');
  });

  it('failed VGEN job → visual_generator row failed', () => {
    const stages = buildPipelineSnapshot(
      'GENERATION_IN_PROGRESS',
      [],
      [{ id: 'j1', agent_id: 'EXEC-VGEN', status: 'FAILED' }],
    );
    expect(stages.find((s) => s.id === 'visual_generator')?.state).toBe('failed');
  });

  it('running EXEC-SW job → screenwriter row running', () => {
    const stages = buildPipelineSnapshot(
      'SCRIPT_IN_PROGRESS',
      [],
      [{ id: 'j1', agent_id: 'EXEC-SW', status: 'RUNNING' }],
    );
    expect(stages.find((s) => s.id === 'screenwriter')?.state).toBe('running');
  });

  it('PUBLISHED status overrides publisher row to approved', () => {
    const stages = buildPipelineSnapshot('PUBLISHED', [], []);
    expect(stages.find((s) => s.id === 'publisher')?.state).toBe('approved');
  });

  it('counts running and failed jobs per row', () => {
    const stages = buildPipelineSnapshot(
      'GENERATION_IN_PROGRESS',
      [],
      [
        { id: 'j1', agent_id: 'EXEC-VGEN', status: 'RUNNING' },
        { id: 'j2', agent_id: 'EXEC-VGEN', status: 'FAILED' },
        { id: 'j3', agent_id: 'EXEC-VGEN', status: 'COMPLETED' },
      ],
    );
    const vgen = stages.find((s) => s.id === 'visual_generator')!;
    expect(vgen.job_count?.total).toBe(3);
    expect(vgen.job_count?.running).toBe(1);
    expect(vgen.job_count?.failed).toBe(1);
    expect(vgen.job_count?.done).toBe(1);
  });
});
