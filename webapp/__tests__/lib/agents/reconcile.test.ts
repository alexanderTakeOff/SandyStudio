// ──────────────────────────────────────────────────────────────────────────────
// __tests__/lib/agents/reconcile.test.ts
// Фаза 2 — the reconciler decision core (pure).
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  planReconcileActions,
  collectCriticSignals,
  collectOnModelSignals,
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
    refireCounts: new Map(),
    reservedShots: new Set(),
    criticCap: 3,
    recoveryCap: 1,
    governanceMode: 3, // DELEGATED by default — most permissive; mode-specific tests override
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

  it('auto-approves a no-critic creative render (video) in Mode 3 (delegated)', () => {
    const m = matrix([shot('SH01', { video: st({ status: 'REVIEW', asset_id: 'v1' }) })]);
    const acts = planReconcileActions(ctx({ matrix: m })); // default Mode 3
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

describe('planReconcileActions — mode-aware gate (Phase 2)', () => {
  const criticPassShot = () =>
    matrix([shot('SH01', { shot_plan: st({ status: 'REVIEW', asset_id: 'sp1', version: 1 }) })]);
  const passVerdict = () => new Map([[signalKey('SH01', 'shot_plan'), 'PASS']]);
  const creativeVideoShot = () =>
    matrix([shot('SH01', { video: st({ status: 'REVIEW', asset_id: 'v1' }) })]);

  it('Mode 1 (MANUAL): critic-PASS mechanical stage WAITS (Director approves)', () => {
    const acts = planReconcileActions(
      ctx({ matrix: criticPassShot(), verdicts: passVerdict(), governanceMode: 1 }),
    );
    expect(acts.filter((a) => a.kind === 'approve')).toHaveLength(0);
    expect(acts).toContainEqual(expect.objectContaining({ kind: 'wait', stage: 'shot_plan' }));
  });

  it('Mode 2 (HYBRID): critic-PASS mechanical stage AUTO-APPROVES', () => {
    const acts = planReconcileActions(
      ctx({ matrix: criticPassShot(), verdicts: passVerdict(), governanceMode: 2 }),
    );
    expect(acts).toContainEqual(
      expect.objectContaining({ kind: 'approve', assetId: 'sp1', stage: 'shot_plan' }),
    );
  });

  it('Mode 2 (HYBRID): creative render (video) WAITS — Director keeps the eye', () => {
    const acts = planReconcileActions(ctx({ matrix: creativeVideoShot(), governanceMode: 2 }));
    expect(acts.filter((a) => a.kind === 'approve')).toHaveLength(0);
    expect(acts).toContainEqual(expect.objectContaining({ kind: 'wait', stage: 'video' }));
  });

  it('Mode 1 (MANUAL): creative render (video) WAITS', () => {
    const acts = planReconcileActions(ctx({ matrix: creativeVideoShot(), governanceMode: 1 }));
    expect(acts.filter((a) => a.kind === 'approve')).toHaveLength(0);
  });

  it('Mode 3 (DELEGATED): creative render (video) AUTO-APPROVES', () => {
    const acts = planReconcileActions(ctx({ matrix: creativeVideoShot(), governanceMode: 3 }));
    expect(acts).toContainEqual(
      expect.objectContaining({ kind: 'approve', assetId: 'v1', stage: 'video' }),
    );
  });
});

describe('planReconcileActions — Failure-spine Slice 3 refire', () => {
  it('refires a FAILED authoring cell (ref_plan) below the recovery cap', () => {
    const m = matrix([shot('SH01', { ref_plan: st({ status: null, failure_count: 2 }) })]);
    const acts = planReconcileActions(ctx({ matrix: m, recoveryCap: 1 }));
    expect(acts).toContainEqual(
      expect.objectContaining({ kind: 'refire', shotId: 'SH01', stage: 'ref_plan' }),
    );
    // authoring stage carries no upstream plan id
    const refire = acts.find((a) => a.kind === 'refire');
    expect((refire as { assetId?: string }).assetId).toBeUndefined();
  });

  it('refires a FAILED money cell (video) with the UPSTREAM shot_plan asset id', () => {
    const m = matrix([
      shot('SH01', {
        shot_plan: st({ status: 'APPROVED', asset_id: 'sp1', version: 1 }),
        video: st({ status: null, failure_count: 1 }),
      }),
    ]);
    const acts = planReconcileActions(ctx({ matrix: m, recoveryCap: 1 }));
    expect(acts).toContainEqual(
      expect.objectContaining({ kind: 'refire', shotId: 'SH01', stage: 'video', assetId: 'sp1' }),
    );
  });

  it('does NOT refire a money cell whose upstream plan is not APPROVED', () => {
    const m = matrix([
      shot('SH01', {
        shot_plan: st({ status: 'REVIEW', asset_id: 'sp1' }),
        video: st({ status: null, failure_count: 1 }),
      }),
    ]);
    const acts = planReconcileActions(ctx({ matrix: m, recoveryCap: 1 }));
    expect(acts.filter((a) => a.kind === 'refire')).toHaveLength(0);
  });

  it('HALTs (escalates) once refires reach the recovery cap', () => {
    const m = matrix([shot('SH01', { ref_plan: st({ status: null, failure_count: 3 }) })]);
    const acts = planReconcileActions(
      ctx({
        matrix: m,
        recoveryCap: 1,
        refireCounts: new Map([[signalKey('SH01', 'ref_plan'), 1]]),
      }),
    );
    expect(acts).toContainEqual(
      expect.objectContaining({ kind: 'halt', shotId: 'SH01', stage: 'ref_plan' }),
    );
    expect(acts.filter((a) => a.kind === 'refire')).toHaveLength(0);
  });

  it('never refires a reserved (pilot) shot — the visual gate stays intact', () => {
    const m = matrix([shot('SH01', { ref_image: st({ status: null, failure_count: 5 }) })]);
    const acts = planReconcileActions(
      ctx({ matrix: m, reservedShots: new Set(['SH01']), recoveryCap: 1 }),
    );
    expect(acts).toHaveLength(0);
  });

  it('does not touch a cell that produced an asset (no failure trigger)', () => {
    const m = matrix([shot('SH01', { ref_plan: st({ status: 'REVIEW', asset_id: 'rp1' }) })]);
    const acts = planReconcileActions(ctx({ matrix: m, recoveryCap: 1 }));
    expect(acts.filter((a) => a.kind === 'refire')).toHaveLength(0);
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

describe('on-model gate (ref_image bounce)', () => {
  const imgKey = signalKey('SH01', 'ref_image');
  const refImageReview = () =>
    matrix([shot('SH01', { ref_image: st({ status: 'REVIEW', asset_id: 'img1', version: 1 }) })]);

  it('bounces a ref_image whose on_model verdict is FAIL (no approve)', () => {
    const acts = planReconcileActions(
      ctx({ matrix: refImageReview(), verdicts: new Map([[imgKey, 'FAIL']]) }),
    );
    expect(acts).toContainEqual(
      expect.objectContaining({ kind: 'bounce', assetId: 'img1', stage: 'ref_image' }),
    );
    expect(acts.filter((a) => a.kind === 'approve')).toHaveLength(0);
  });

  it('bounces a FAIL even in Mode 1 (escalate regardless of governance mode)', () => {
    const acts = planReconcileActions(
      ctx({ matrix: refImageReview(), governanceMode: 1, verdicts: new Map([[imgKey, 'FAIL']]) }),
    );
    expect(acts.filter((a) => a.kind === 'bounce')).toHaveLength(1);
  });

  it('PASS + Mode 3 → auto-approves via the creative gate (no bounce)', () => {
    const acts = planReconcileActions(
      ctx({ matrix: refImageReview(), governanceMode: 3, verdicts: new Map([[imgKey, 'PASS']]) }),
    );
    expect(acts).toContainEqual(
      expect.objectContaining({ kind: 'approve', assetId: 'img1', stage: 'ref_image' }),
    );
    expect(acts.filter((a) => a.kind === 'bounce')).toHaveLength(0);
  });

  it('PASS + Mode 2 → waits for a human (no approve, no bounce)', () => {
    const acts = planReconcileActions(
      ctx({ matrix: refImageReview(), governanceMode: 2, verdicts: new Map([[imgKey, 'PASS']]) }),
    );
    expect(acts.filter((a) => a.kind === 'approve')).toHaveLength(0);
    expect(acts.filter((a) => a.kind === 'bounce')).toHaveLength(0);
    expect(acts).toContainEqual(expect.objectContaining({ kind: 'wait', stage: 'ref_image' }));
  });

  it('MISSING verdict → fail-open → Mode 3 auto-approves (byte-identical to pre-gate)', () => {
    const acts = planReconcileActions(
      ctx({ matrix: refImageReview(), governanceMode: 3, verdicts: new Map() }),
    );
    expect(acts).toContainEqual(
      expect.objectContaining({ kind: 'approve', assetId: 'img1', stage: 'ref_image' }),
    );
    expect(acts.filter((a) => a.kind === 'bounce')).toHaveLength(0);
  });
});

describe('critic REVISE → re-author (reconcile owns the Phase 2+ edge)', () => {
  it('re-authors a shot_plan stuck in REVISION below the cap', () => {
    const m = matrix([shot('SH01', { shot_plan: st({ status: 'REVISION', asset_id: 'sp1', version: 1 }) })]);
    const acts = planReconcileActions(ctx({ matrix: m, criticCap: 2 }));
    expect(acts).toContainEqual(
      expect.objectContaining({ kind: 'reauthor', assetId: 'sp1', stage: 'shot_plan' }),
    );
  });

  it('re-authors a ref_plan in REVISION too (same shared edge)', () => {
    const m = matrix([shot('SH01', { ref_plan: st({ status: 'REVISION', asset_id: 'rp1', version: 2 }) })]);
    const acts = planReconcileActions(ctx({ matrix: m, criticCap: 3 }));
    expect(acts).toContainEqual(
      expect.objectContaining({ kind: 'reauthor', assetId: 'rp1', stage: 'ref_plan' }),
    );
  });

  it('does NOT re-author at/over the cap — the critic-loop already HALTed there', () => {
    // version 3 → revisionsSoFar 2 >= cap 2
    const m = matrix([shot('SH01', { shot_plan: st({ status: 'REVISION', asset_id: 'sp1', version: 3 }) })]);
    const acts = planReconcileActions(ctx({ matrix: m, criticCap: 2 }));
    expect(acts.filter((a) => a.kind === 'reauthor')).toHaveLength(0);
  });

  it('does NOT re-author a money stage in REVISION — authoring stages only', () => {
    const m = matrix([shot('SH01', { video: st({ status: 'REVISION', asset_id: 'v1', version: 1 }) })]);
    const acts = planReconcileActions(ctx({ matrix: m }));
    expect(acts.filter((a) => a.kind === 'reauthor')).toHaveLength(0);
  });
});

describe('collectOnModelSignals', () => {
  it('folds on_model.verdict into a ref_image-keyed map, latest version wins', () => {
    const verdicts = collectOnModelSignals([
      { version: 1, metadata: { shot_reference: { shot_id: 'SH01', on_model: { verdict: 'PASS' } } } },
      { version: 2, metadata: { shot_reference: { shot_id: 'SH01', on_model: { verdict: 'FAIL' } } } },
      { version: 1, metadata: { shot_reference: { shot_id: 'SH02', on_model: { verdict: 'PASS' } } } },
    ]);
    expect(verdicts.get(signalKey('SH01', 'ref_image'))).toBe('FAIL');
    expect(verdicts.get(signalKey('SH02', 'ref_image'))).toBe('PASS');
  });

  it('ignores rows with no verdict at all (legacy / loose-skipped images)', () => {
    const verdicts = collectOnModelSignals([
      { version: 1, metadata: { shot_reference: { shot_id: 'SH01' } } },
      { version: 1, metadata: { shot_reference: null } },
      { version: 1, metadata: null },
    ]);
    expect(verdicts.size).toBe(0);
  });

  // E33 P1 #8 — SH02/SH03/SH04/SH08 shipped APPROVED holding a final REGENERATE.
  it('reports a reviewer REGENERATE as FAIL even when the on-model gate passed', () => {
    const verdicts = collectOnModelSignals([
      {
        version: 1,
        metadata: {
          shot_reference: {
            shot_id: 'SH08',
            on_model: { verdict: 'PASS' },
            review: { verdict: 'REGENERATE' },
          },
        },
      },
    ]);
    expect(verdicts.get(signalKey('SH08', 'ref_image'))).toBe('FAIL');
  });

  it('reports a reviewer REGENERATE as FAIL on a loose episode with no on-model axis', () => {
    const verdicts = collectOnModelSignals([
      {
        version: 1,
        metadata: { shot_reference: { shot_id: 'SH03', review: { verdict: 'REGENERATE' } } },
      },
    ]);
    expect(verdicts.get(signalKey('SH03', 'ref_image'))).toBe('FAIL');
  });

  it('does NOT block on APPROVE or HUMAN_REVIEW (the latter asks for the Director)', () => {
    const verdicts = collectOnModelSignals([
      {
        version: 1,
        metadata: {
          shot_reference: {
            shot_id: 'SH01',
            on_model: { verdict: 'PASS' },
            review: { verdict: 'HUMAN_REVIEW' },
          },
        },
      },
      {
        version: 1,
        metadata: {
          shot_reference: {
            shot_id: 'SH02',
            on_model: { verdict: 'PASS' },
            review: { verdict: 'APPROVE' },
          },
        },
      },
    ]);
    expect(verdicts.get(signalKey('SH01', 'ref_image'))).toBe('PASS');
    expect(verdicts.get(signalKey('SH02', 'ref_image'))).toBe('PASS');
  });
});
