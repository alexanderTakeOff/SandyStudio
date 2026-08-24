// ──────────────────────────────────────────────────────────────────────────────
// __tests__/api/pipeline-stages.test.ts
// Coverage for buildPipelineSnapshot — backbone v2.5 (per-agent rows).
// ──────────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';
import {
  buildPipelineSnapshot,
  workPhaseForAgent,
  activeWorkPhaseByShot,
  completedWorkByShot,
} from '@/lib/api/pipeline-stages';

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
      // 2026-08-06 — канон СЕРИИ встал первой строкой: от него зависят шесть
      // строк ниже, и до сих пор его отказ читался как отказ эпизода.
      'series_canon',
      'brief',
      'casting',
      'screenwriter',
      'script_critic',
      'storyboarder',
      'readability_critic',
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
      'thumbnail_creator',
      'publisher',
      'analytics_collector',
    ]);
  });

  // 2026-08-06 — rows that named a worker who does not exist now say what they are.
  it('Casting and Музыка are declared as Director INPUT, not as agents', () => {
    const byId = new Map(buildPipelineSnapshot('BRIEF_PENDING', [], []).map((s) => [s.id, s]));
    for (const id of ['casting', 'music_generator'] as const) {
      expect(byId.get(id)!.role).toBe('input');
      expect(byId.get(id)!.agents).toEqual(['Director']);
    }
  });

  it('Continuity Critic names the worker that actually runs', () => {
    const byId = new Map(buildPipelineSnapshot('BRIEF_PENDING', [], []).map((s) => [s.id, s]));
    // `EXEC-CONT` was never shipped; `EXEC-WCHK` has always done the work.
    expect(byId.get('continuity_critic')!.agents).toEqual(['EXEC-WCHK']);
  });

  it('Key Art Critic is gone — an unstaffed slot is not a stage', () => {
    const stages = buildPipelineSnapshot('BRIEF_PENDING', [], []);
    expect(stages.find((s) => s.id === 'thumbnail_critic')).toBeUndefined();
  });

  it('tiers: Artist/Author/Editor + hard-gate = primary; Designer/Critic = muted', () => {
    const stages = buildPipelineSnapshot('BRIEF_PENDING', [], []);
    const byId = new Map(stages.map((s) => [s.id, s]));
    // PRIMARY
    for (const id of ['brief', 'screenwriter', 'storyboarder', 'episode_references', 'music_generator', 'animatic', 'visual_generator', 'final_cut', 'copywriter', 'thumbnail_creator', 'publisher', 'analytics_collector'] as const) {
      expect(byId.get(id)!.tier).toBe('primary');
    }
    // MUTED — Designers + Critics
    for (const id of ['script_critic', 'continuity_critic', 'reference_designer', 'reference_critic', 'shot_designer', 'shot_critic', 'thumbnail_designer'] as const) {
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

  it.skip('thumbnail_critic is an honest unstaffed empty slot (q11a) — row removed 2026-08-06', () => {
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

// ── q4a — per-shot live work phase (timeline strip overlay, 2026-06-22) ───────
describe('workPhaseForAgent', () => {
  it('classifies designer-group agents → design', () => {
    expect(workPhaseForAgent('EXEC-EREF-DESIGNER')).toBe('design');
    expect(workPhaseForAgent('EXEC-EPREV')).toBe('design');
    expect(workPhaseForAgent('EXEC-EREF')).toBe('design');
  });
  it('classifies video-artist-group agents → animate', () => {
    expect(workPhaseForAgent('EXEC-VANIM')).toBe('animate');
    expect(workPhaseForAgent('EXEC-VPREV')).toBe('animate');
    expect(workPhaseForAgent('EXEC-VGEN')).toBe('animate');
  });
  it('returns null for agents outside both per-shot groups', () => {
    for (const a of ['EXEC-SW', 'EXEC-MGEN', 'EXEC-EDIT', 'Director', 'NOPE']) {
      expect(workPhaseForAgent(a)).toBeNull();
    }
  });
});

describe('activeWorkPhaseByShot', () => {
  const job = (agent_id: string, status: string, shotId?: string) => ({
    agent_id,
    status,
    input_snapshot: shotId ? { shotId } : {},
  });

  it('maps a RUNNING designer job to design for its shot', () => {
    expect(activeWorkPhaseByShot([job('EXEC-EREF', 'RUNNING', 'SH01')]).get('SH01')).toBe('design');
  });

  it('maps a RUNNING video job to animate for its shot', () => {
    expect(activeWorkPhaseByShot([job('EXEC-VGEN', 'RUNNING', 'SH01')]).get('SH01')).toBe('animate');
  });

  it('treats QUEUED the same as RUNNING', () => {
    expect(activeWorkPhaseByShot([job('EXEC-VANIM', 'QUEUED', 'SH02')]).get('SH02')).toBe('animate');
  });

  it('ignores COMPLETED / FAILED jobs (shot rests at asset colour)', () => {
    const m = activeWorkPhaseByShot([
      job('EXEC-VGEN', 'COMPLETED', 'SH01'),
      job('EXEC-EREF', 'FAILED', 'SH02'),
    ]);
    expect(m.size).toBe(0);
  });

  it('animate wins over design on one shot, order-independent (q4a priority)', () => {
    const a = activeWorkPhaseByShot([
      job('EXEC-EREF-DESIGNER', 'RUNNING', 'SH01'),
      job('EXEC-VGEN', 'RUNNING', 'SH01'),
    ]);
    const b = activeWorkPhaseByShot([
      job('EXEC-VGEN', 'RUNNING', 'SH01'),
      job('EXEC-EREF-DESIGNER', 'RUNNING', 'SH01'),
    ]);
    expect(a.get('SH01')).toBe('animate');
    expect(b.get('SH01')).toBe('animate');
  });

  it('skips jobs without a shotId, and non-per-shot agents', () => {
    const m = activeWorkPhaseByShot([
      job('EXEC-VGEN', 'RUNNING', undefined),
      job('EXEC-MGEN', 'RUNNING', 'SH01'),
    ]);
    expect(m.size).toBe(0);
  });

  it('keeps shots independent (per-button)', () => {
    const m = activeWorkPhaseByShot([
      job('EXEC-EREF', 'RUNNING', 'SH01'),
      job('EXEC-VGEN', 'RUNNING', 'SH02'),
    ]);
    expect(m.get('SH01')).toBe('design');
    expect(m.get('SH02')).toBe('animate');
    expect(m.size).toBe(2);
  });
});

describe('completedWorkByShot — D7 persistent trail (settled, live excluded)', () => {
  const job = (agent_id: string, status: string, shotId?: string) => ({
    agent_id,
    status,
    input_snapshot: shotId ? { shotId } : {},
  });

  it('maps a COMPLETED designer job to its shot with the designer role', () => {
    const m = completedWorkByShot([job('EXEC-EREF-DESIGNER', 'COMPLETED', 'SH01')]);
    expect(m.get('SH01')?.roles).toEqual(['designer']);
  });

  it('ignores shots with no COMPLETED job (nothing to trail)', () => {
    expect(completedWorkByShot([job('EXEC-VGEN', 'RUNNING', 'SH01')]).size).toBe(0);
  });

  it('excludes a shot that ALSO has a live job — live wins, no double glow', () => {
    const m = completedWorkByShot([
      job('EXEC-EREF-DESIGNER', 'COMPLETED', 'SH01'),
      job('EXEC-VGEN', 'RUNNING', 'SH01'), // same shot still working
    ]);
    expect(m.has('SH01')).toBe(false);
  });

  it('a QUEUED job on the shot also excludes it from the trail', () => {
    const m = completedWorkByShot([
      job('EXEC-VANIM', 'COMPLETED', 'SH01'),
      job('EXEC-VGEN', 'QUEUED', 'SH01'),
    ]);
    expect(m.has('SH01')).toBe(false);
  });

  it('accumulates multiple completed roles on one shot (designer + critic)', () => {
    const m = completedWorkByShot([
      job('EXEC-EREF-DESIGNER', 'COMPLETED', 'SH01'),
      job('EXEC-EPREV', 'COMPLETED', 'SH01'),
    ]);
    expect(m.get('SH01')?.roles.sort()).toEqual(['critic', 'designer']);
  });

  it('animate wins over design as the dominant object on a settled shot', () => {
    const m = completedWorkByShot([
      job('EXEC-EREF-DESIGNER', 'COMPLETED', 'SH01'),
      job('EXEC-VGEN', 'COMPLETED', 'SH01'),
    ]);
    expect(m.get('SH01')?.object).toBe('animate');
  });

  it('skips jobs without a shotId and non-per-shot agents', () => {
    const m = completedWorkByShot([
      job('EXEC-VGEN', 'COMPLETED', undefined),
      job('EXEC-MGEN', 'COMPLETED', 'SH01'), // music has no per-shot role
    ]);
    expect(m.size).toBe(0);
  });

  it('keeps shots independent — one settled, one still live', () => {
    const m = completedWorkByShot([
      job('EXEC-VGEN', 'COMPLETED', 'SH01'),
      job('EXEC-EREF-DESIGNER', 'RUNNING', 'SH02'),
    ]);
    expect(m.get('SH01')?.roles).toEqual(['artist']);
    expect(m.has('SH02')).toBe(false);
    expect(m.size).toBe(1);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Per-shot progress (2026-08-06). Six rows in the pipeline belong to the SHOT,
// not the episode; a single lamp over 24 cells went green on the FIRST approved
// asset, so "1 of 24" read as "done". The counter replaces both that lie and the
// `eref_pilot_state` patch that had been papering over one of the six.
// ──────────────────────────────────────────────────────────────────────────────

describe('buildPipelineSnapshot — per-shot rows count cells, not lamps', () => {
  const clip = (shot: string, status = 'APPROVED') => ({
    ...baseAsset,
    id: `vid-${shot}`,
    file_type: `VID-shot-s15-e36-${shot.toLowerCase()}`,
    status,
    metadata: { shot_id: `S15-E36-${shot}` },
  });

  it('without a known shot count the old single-lamp rule stands', () => {
    const stages = buildPipelineSnapshot('IN_PROGRESS', [clip('SH01')], []);
    const row = stages.find((s) => s.id === 'visual_generator')!;
    expect(row.state).toBe('approved');
    expect(row.progress).toBeUndefined();
  });

  it('one shot of three is RUNNING, not approved, and says 1/3', () => {
    const stages = buildPipelineSnapshot('IN_PROGRESS', [clip('SH01')], [], null, 3);
    const row = stages.find((s) => s.id === 'visual_generator')!;
    expect(row.progress).toEqual({ done: 1, total: 3 });
    expect(row.state).toBe('running');
  });

  it('goes green only when the last shot closes', () => {
    const assets = [clip('SH01'), clip('SH02'), clip('SH03')];
    const row = buildPipelineSnapshot('IN_PROGRESS', assets, [], null, 3)
      .find((s) => s.id === 'visual_generator')!;
    expect(row.progress).toEqual({ done: 3, total: 3 });
    expect(row.state).toBe('approved');
  });

  it('counts DISTINCT shots — three versions of one shot are still one cell', () => {
    const assets = [clip('SH01'), { ...clip('SH01'), id: 'v2' }, { ...clip('SH01'), id: 'v3' }];
    const row = buildPipelineSnapshot('IN_PROGRESS', assets, [], null, 3)
      .find((s) => s.id === 'visual_generator')!;
    expect(row.progress).toEqual({ done: 1, total: 3 });
  });

  it('reads the shot id from all three live shapes', () => {
    const byMetadata = clip('SH01');
    const byShotReference = {
      ...baseAsset,
      id: 'img-2',
      file_type: 'IMG-episode_ref_whatever',
      status: 'APPROVED',
      metadata: { shot_reference: { shot_id: 'S15-E36-SH02' } },
    };
    const byFileType = {
      ...baseAsset,
      id: 'img-3',
      file_type: 'IMG-episode_ref_s15_e36_sh03',
      status: 'APPROVED',
      metadata: null,
    };
    const refs = buildPipelineSnapshot('IN_PROGRESS', [byShotReference, byFileType], [], null, 3)
      .find((s) => s.id === 'episode_references')!;
    expect(refs.progress).toEqual({ done: 2, total: 3 });
    const vids = buildPipelineSnapshot('IN_PROGRESS', [byMetadata], [], null, 3)
      .find((s) => s.id === 'visual_generator')!;
    expect(vids.progress).toEqual({ done: 1, total: 3 });
  });

  it('unapproved shots do not count, and one awaiting Director blocks the row', () => {
    // A shot sitting in REVIEW is not progress — it is a request for a decision,
    // and it outranks "work is happening" precisely because the work stopped.
    const assets = [clip('SH01'), clip('SH02', 'REVIEW')];
    const row = buildPipelineSnapshot('IN_PROGRESS', assets, [], null, 3)
      .find((s) => s.id === 'visual_generator')!;
    expect(row.progress).toEqual({ done: 1, total: 3 });
    expect(row.state).toBe('blocked');
  });

  it('episode-level rows never grow a counter', () => {
    const stages = buildPipelineSnapshot('IN_PROGRESS', [clip('SH01')], [], null, 3);
    for (const id of ['brief', 'screenwriter', 'storyboarder', 'final_cut', 'publisher'] as const) {
      expect(stages.find((s) => s.id === id)!.progress).toBeUndefined();
    }
  });

  it('the eref pilot patch yields to the counter', () => {
    // PENDING_REVIEW used to force `blocked` on the whole row. With a real
    // counter the row reports work in progress instead of a false block.
    const refs = [
      { ...baseAsset, id: 'r1', file_type: 'IMG-episode_ref_s15_e36_sh01', status: 'APPROVED' },
    ];
    const row = buildPipelineSnapshot(
      'IN_PROGRESS', refs, [], { eref_pilot_state: 'PENDING_REVIEW' }, 4,
    ).find((s) => s.id === 'episode_references')!;
    expect(row.progress).toEqual({ done: 1, total: 4 });
    expect(row.state).toBe('running');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Канон серии как строка конвейера (2026-08-06, решение 20). Единственная
// сущность студии, у которой не было состояния нигде: матрица кадров начинается
// после неё, гейт автора Библии информационный. От канона зависят шесть строк, и
// его отказ всплывал падением ЭПИЗОДА — Директор видел красный эпизод там, где
// болен сериал.
// ──────────────────────────────────────────────────────────────────────────────

describe('buildPipelineSnapshot — строка канона серии', () => {
  const canonRow = (canon?: Parameters<typeof buildPipelineSnapshot>[5]) =>
    buildPipelineSnapshot('BRIEF_PENDING', [], [], null, undefined, canon)
      .find((s) => s.id === 'series_canon')!;

  it('без снимка канона строка молчит, а не врёт', () => {
    const row = canonRow();
    expect(row.state).toBe('idle');
    expect(row.progress).toBeUndefined();
  });

  it('канон не готов → строка БЛОКИРУЕТ и показывает счётчик запертых плит', () => {
    const row = canonRow({
      plates: [], locked: 1, total: 4, productionReady: false,
      blockers: ['нет ни одного LOCKED стиля'],
    });
    expect(row.state).toBe('blocked');
    expect(row.progress).toEqual({ done: 1, total: 4 });
  });

  it('канон готов → зелёная, даже когда не все плиты заперты', () => {
    const row = canonRow({
      plates: [], locked: 2, total: 5, productionReady: true, blockers: [],
    });
    expect(row.state).toBe('approved');
    expect(row.progress).toEqual({ done: 2, total: 5 });
  });

  it('строка объявлена РАБОТОЙ Полины уровня сериала (слово Директора 24.08), гейт — его', () => {
    // До 24.08 канон был ВХОДОМ Директора («просишь и ждёшь»); на S22 он сменил
    // закон: недостающие плиты создаёт Полина на касте, Директор утверждает.
    const row = canonRow();
    expect(row.role).toBe('author');
    expect(row.phase).toBe('pre-production');
    expect(row.agents).toEqual(['EXEC-BIBLE-AUTHOR']);
  });
});
