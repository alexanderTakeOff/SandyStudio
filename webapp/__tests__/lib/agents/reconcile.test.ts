// ──────────────────────────────────────────────────────────────────────────────
// __tests__/lib/agents/reconcile.test.ts
// Фаза 2 — the reconciler decision core (pure).
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  planReconcileActions,
  collectCriticSignals,
  signalKey,
  type ReconcileContext,
} from '@/lib/agents/reconcile';
import type { EpisodeStateMatrix, StageName, StageState } from '@/lib/agents/state-matrix';

function st(over: Partial<StageState> = {}): StageState {
  return { status: null, version: null, asset_id: null, fresh: true, ...over };
}

function shot(
  shot_id: string,
  stages: Partial<Record<StageName, StageState>> = {},
  excluded = false,
) {
  return {
    shot_id,
    excluded,
    stages: {
      ref_plan: st(),
      ref_image: st(),
      shot_plan: st(),
      video: st(),
      ...stages,
    } as Record<StageName, StageState>,
  };
}

function matrix(
  shots: ReturnType<typeof shot>[],
  over: Partial<EpisodeStateMatrix> = {},
): EpisodeStateMatrix {
  return {
    episode_id: 'e',
    episode_code: 'E',
    governance_mode: null,
    shots,
    music: { status: null, asset_id: null },
    final_cut: { status: null, asset_id: null, version: null },
    gates: { reserved: [] },
    ...over,
  };
}

function ctx(over: Partial<ReconcileContext> & { matrix: EpisodeStateMatrix }): ReconcileContext {
  return {
    plan: null,
    verdicts: new Map(),
    reviseCounts: new Map(),
    reservedShots: new Set(),
    criticCap: 3,
    ...over,
  };
}

describe('planReconcileActions', () => {
  it('auto-approves a critic-gated stage on PASS', () => {
    const m = matrix([shot('SH01', { shot_plan: st({ status: 'REVIEW', asset_id: 'sp1', version: 1 }) })]);
    const acts = planReconcileActions(
      ctx({ matrix: m, verdicts: new Map([[signalKey('SH01', 'shot_plan'), 'PASS']]) }),
    );
    expect(acts).toContainEqual(
      expect.objectContaining({ kind: 'approve', assetId: 'sp1', stage: 'shot_plan' }),
    );
  });

  it('auto-approves a no-critic mechanical artifact (video) in REVIEW', () => {
    const m = matrix([shot('SH01', { video: st({ status: 'REVIEW', asset_id: 'v1' }) })]);
    const acts = planReconcileActions(ctx({ matrix: m }));
    expect(acts).toContainEqual(
      expect.objectContaining({ kind: 'approve', assetId: 'v1', stage: 'video' }),
    );
  });

  it('never auto-approves a reserved shot', () => {
    const m = matrix([shot('SH01', { shot_plan: st({ status: 'REVIEW', asset_id: 'sp1' }) })]);
    const acts = planReconcileActions(
      ctx({
        matrix: m,
        verdicts: new Map([[signalKey('SH01', 'shot_plan'), 'PASS']]),
        reservedShots: new Set(['SH01']),
      }),
    );
    expect(acts.filter((a) => a.kind === 'approve')).toHaveLength(0);
  });

  it('never auto-approves an out-of-plan shot', () => {
    const m = matrix([shot('SH01', { video: st({ status: 'REVIEW', asset_id: 'v1' }) })]);
    const acts = planReconcileActions(ctx({ matrix: m, plan: { shots: ['SH02'] } }));
    expect(acts.filter((a) => a.kind === 'approve')).toHaveLength(0);
  });

  it('waits (never approves) a STALE cell even with a PASS verdict', () => {
    const m = matrix([
      shot('SH01', {
        shot_plan: st({ status: 'REVIEW', asset_id: 'sp1', fresh: false, blocked_reason: 'stale: upstream changed' }),
      }),
    ]);
    const acts = planReconcileActions(
      ctx({ matrix: m, verdicts: new Map([[signalKey('SH01', 'shot_plan'), 'PASS']]) }),
    );
    expect(acts.filter((a) => a.kind === 'approve')).toHaveLength(0);
    expect(acts).toContainEqual(expect.objectContaining({ kind: 'wait', reason: expect.stringMatching(/stale/i) }));
  });

  it('HALTs when REVISE count reaches the critic cap, waits below it', () => {
    const m = matrix([shot('SH01', { shot_plan: st({ status: 'REVIEW', asset_id: 'sp1' }) })]);
    const verdicts = new Map([[signalKey('SH01', 'shot_plan'), 'REVISE']]);

    const halted = planReconcileActions(
      ctx({ matrix: m, verdicts, reviseCounts: new Map([[signalKey('SH01', 'shot_plan'), 3]]), criticCap: 3 }),
    );
    expect(halted).toContainEqual(expect.objectContaining({ kind: 'halt', stage: 'shot_plan' }));

    const waiting = planReconcileActions(
      ctx({ matrix: m, verdicts, reviseCounts: new Map([[signalKey('SH01', 'shot_plan'), 2]]), criticCap: 3 }),
    );
    expect(waiting.filter((a) => a.kind === 'halt')).toHaveLength(0);
    expect(waiting).toContainEqual(expect.objectContaining({ kind: 'wait' }));
  });

  it('fires stitch when all live shots are approved and music is present', () => {
    const m = matrix(
      [
        shot('SH01', { video: st({ status: 'APPROVED', asset_id: 'v1' }) }),
        shot('SH02', { video: st({ status: 'APPROVED', asset_id: 'v2' }) }),
      ],
      { music: { status: 'APPROVED', asset_id: 'mus' } },
    );
    const acts = planReconcileActions(ctx({ matrix: m }));
    expect(acts).toContainEqual(expect.objectContaining({ kind: 'stitch' }));
  });

  it('withholds stitch (waits) when shots are approved but music is missing', () => {
    const m = matrix([shot('SH01', { video: st({ status: 'APPROVED', asset_id: 'v1' }) })]);
    const acts = planReconcileActions(ctx({ matrix: m }));
    expect(acts.filter((a) => a.kind === 'stitch')).toHaveLength(0);
    expect(acts).toContainEqual(expect.objectContaining({ kind: 'wait', reason: expect.stringMatching(/music/i) }));
  });

  it('excluded shots do not block the stitch denominator', () => {
    const m = matrix(
      [
        shot('SH01', { video: st({ status: 'APPROVED', asset_id: 'v1' }) }),
        shot('SH02', {}, true), // excluded, no video
      ],
      { music: { status: 'APPROVED', asset_id: 'mus' } },
    );
    const acts = planReconcileActions(ctx({ matrix: m }));
    expect(acts).toContainEqual(expect.objectContaining({ kind: 'stitch' }));
  });

  it('does not re-stitch when a final cut already exists', () => {
    const m = matrix(
      [shot('SH01', { video: st({ status: 'APPROVED', asset_id: 'v1' }) })],
      { music: { status: 'APPROVED', asset_id: 'mus' }, final_cut: { status: 'REVIEW', asset_id: 'fc', version: 1 } },
    );
    const acts = planReconcileActions(ctx({ matrix: m }));
    expect(acts.filter((a) => a.kind === 'stitch')).toHaveLength(0);
  });
});

describe('collectCriticSignals', () => {
  it('takes the latest verdict per shot×stage and counts REVISEs', () => {
    const { verdicts, reviseCounts } = collectCriticSignals([
      { file_type: 'REV-shot_plan', version: 1, metadata: { shot_id: 'SH01', verdict: 'REVISE' } },
      { file_type: 'REV-shot_plan', version: 2, metadata: { shot_id: 'SH01', verdict: 'PASS' } },
      { file_type: 'REV-ref_plan', version: 1, metadata: { shot_id: 'SH01', verdict: 'PASS' } },
    ]);
    expect(verdicts.get(signalKey('SH01', 'shot_plan'))).toBe('PASS');
    expect(reviseCounts.get(signalKey('SH01', 'shot_plan'))).toBe(1);
    expect(verdicts.get(signalKey('SH01', 'ref_plan'))).toBe('PASS');
  });
});
