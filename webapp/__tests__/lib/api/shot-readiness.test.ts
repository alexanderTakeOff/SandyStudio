// Unit tests for the q21 readiness gate (validateShotReadyForGeneration).
// Mocks the supabase query chain so the orchestration logic is exercised
// without filesystem/Drive reads (media resolution is covered by
// media-preflight's own tests). The gate tests pass an explicit planAssetId so
// resolveApprovedShotPlan takes the maybeSingle() path; refs are kept empty or
// "not found" to avoid invoking the real media reader. The by-shot branch of
// resolveApprovedShotPlan gets its own block at the bottom.

import { describe, it, expect } from 'vitest';
import {
  validateShotReadyForGeneration,
  assertShotReadyForGeneration,
  resolveApprovedShotPlan,
  shotPlanRenderParams,
  ShotNotReadyError,
} from '@/lib/api/shot-readiness';
import { parseShotPlanContract } from '@/lib/api/shot-plan-contract';
import { ValidationError } from '@/lib/api/errors';

function planMarkdown(body: Record<string, unknown>): string {
  return `# Plan\n\n\`\`\`json\n${JSON.stringify(body, null, 2)}\n\`\`\`\n`;
}

// Minimal chainable supabase mock. `.maybeSingle()` resolves the plan row;
// `.in()` resolves the ref rows. Tests always pass planAssetId.
function makeSupabase(opts: { plan: unknown; refs?: unknown[] }): never {
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.like = () => builder;
  builder.in = () => Promise.resolve({ data: opts.refs ?? [], error: null });
  builder.maybeSingle = () => Promise.resolve({ data: opts.plan, error: null });
  return { from: () => builder } as never;
}

const GOOD_BODY = {
  prompt: 'Sandy points at the call button.',
  provider: { id: 'seedance-standard' },
  resolution: '720p',
  duration_seconds: 5,
};

const ARGS = { shotId: 'SS-S15-E10-A1-SC01-SH02', episodeId: 'ep-1', planAssetId: 'plan-1' };

describe('validateShotReadyForGeneration', () => {
  it('passes a well-formed APPROVED plan with no refs', async () => {
    const sb = makeSupabase({
      plan: { id: 'plan-1', status: 'APPROVED', version: 2, file_type: 'SPC-shot_plan', content: planMarkdown(GOOD_BODY) },
    });
    const r = await validateShotReadyForGeneration(sb, ARGS);
    expect(r.ok).toBe(true);
    expect(r.blockers).toEqual([]);
  });

  it('blocks (fail-loud) when VGEN is cancelled for the episode', async () => {
    // q10: an active cancel is caught HERE at the gate, not silently in the
    // runner. The mock returns the cancel token shape from maybeSingle().
    const sb = makeSupabase({ plan: { value: { cancelled: true } } });
    const r = await validateShotReadyForGeneration(sb, ARGS);
    expect(r.ok).toBe(false);
    expect(r.blockers.map((b) => b.code)).toContain('vgen_cancelled');
  });

  it('blocks when the plan is missing', async () => {
    const sb = makeSupabase({ plan: null });
    const r = await validateShotReadyForGeneration(sb, ARGS);
    expect(r.ok).toBe(false);
    expect(r.blockers.map((b) => b.code)).toContain('plan_missing');
  });

  it('blocks a non-APPROVED plan', async () => {
    const sb = makeSupabase({
      plan: { id: 'plan-1', status: 'REVIEW', version: 1, file_type: 'SPC-shot_plan', content: planMarkdown(GOOD_BODY) },
    });
    const r = await validateShotReadyForGeneration(sb, ARGS);
    expect(r.blockers.map((b) => b.code)).toContain('plan_not_approved');
  });

  it('blocks an unparseable plan body', async () => {
    const sb = makeSupabase({
      plan: { id: 'plan-1', status: 'APPROVED', version: 1, file_type: 'SPC-shot_plan', content: '```json\n{ bad }\n```' },
    });
    const r = await validateShotReadyForGeneration(sb, ARGS);
    expect(r.blockers.map((b) => b.code)).toContain('plan_unparseable');
  });

  it('blocks a plan with no prompt', async () => {
    const sb = makeSupabase({
      plan: { id: 'plan-1', status: 'APPROVED', version: 1, file_type: 'SPC-shot_plan', content: planMarkdown({ provider: { id: 'seedance-standard' } }) },
    });
    const r = await validateShotReadyForGeneration(sb, ARGS);
    expect(r.blockers.map((b) => b.code)).toContain('prompt_missing');
  });

  it('WARNS (not blocks) on an off-allowlist provider id — runner falls back', async () => {
    // q21 must never be stricter than the runner: the runner soft-falls-back on
    // an unknown provider.id, so q21 warns instead of refusing the dispatch.
    const sb = makeSupabase({
      plan: { id: 'plan-1', status: 'APPROVED', version: 1, file_type: 'SPC-shot_plan', content: planMarkdown({ ...GOOD_BODY, provider: { id: 'made-up-provider' } }) },
    });
    const r = await validateShotReadyForGeneration(sb, ARGS);
    expect(r.ok).toBe(true);
    expect(r.warnings.map((w) => w.code)).toContain('provider_unknown');
  });

  it('WARNS (not blocks) on duration outside the provider range — runner clamps', async () => {
    const sb = makeSupabase({
      plan: { id: 'plan-1', status: 'APPROVED', version: 1, file_type: 'SPC-shot_plan', content: planMarkdown({ ...GOOD_BODY, provider: { id: 'veo-standard' }, resolution: undefined, duration_seconds: 12 }) },
    });
    const r = await validateShotReadyForGeneration(sb, ARGS);
    expect(r.ok).toBe(true);
    expect(r.warnings.map((w) => w.code)).toContain('duration_out_of_range');
  });

  it('warns (not blocks) when a fixed-resolution provider gets a declared resolution', async () => {
    const sb = makeSupabase({
      plan: { id: 'plan-1', status: 'APPROVED', version: 1, file_type: 'SPC-shot_plan', content: planMarkdown({ ...GOOD_BODY, provider: { id: 'veo-standard' }, duration_seconds: 6 }) },
    });
    const r = await validateShotReadyForGeneration(sb, ARGS);
    expect(r.ok).toBe(true);
    expect(r.warnings.map((w) => w.code)).toContain('resolution_ignored');
  });

  it('blocks when a referenced anchor asset is not found', async () => {
    const sb = makeSupabase({
      plan: {
        id: 'plan-1',
        status: 'APPROVED',
        version: 1,
        file_type: 'SPC-shot_plan',
        content: planMarkdown({ ...GOOD_BODY, start_anchor: { asset_id: 'anchor-x' } }),
      },
      refs: [], // anchor-x not returned → not found
    });
    const r = await validateShotReadyForGeneration(sb, ARGS);
    expect(r.blockers.map((b) => b.code)).toContain('ref_not_found');
  });
});

// ── shotPlanRenderParams — the ONE projection both render paths consume ─────
// E33 audit (2026-07-29): the runner extracted provider / quality / resolution
// / seed from the plan inline, and the manual re-render route did not extract
// them at all — it took them from the UI drawer. These tests pin the precedence
// so the two paths cannot drift apart again.

describe('shotPlanRenderParams', () => {
  const params = (body: Record<string, unknown>) =>
    shotPlanRenderParams(parseShotPlanContract(planMarkdown(body)));

  it('derives provider impl AND quality tier from provider.id (TD-44)', () => {
    const r = params({ ...GOOD_BODY, provider: { id: 'seedance-standard' } });
    expect(r.providerImpl).toBe('seedance-fal-img2vid');
    expect(r.format.provider_id).toBe('seedance-fal-img2vid');
    expect(r.format.quality_tier).toBe('standard');
    expect(r.providerUnknown).toBe(false);
  });

  it('lets an explicit quality_tier override the provider-derived tier (TD-33)', () => {
    const r = params({ ...GOOD_BODY, provider: { id: 'seedance-standard' }, quality_tier: 'fast' });
    expect(r.format.provider_id).toBe('seedance-fal-img2vid');
    expect(r.format.quality_tier).toBe('fast');
  });

  it('soft-falls back on an off-allowlist provider.id instead of throwing (TD-67)', () => {
    const r = params({ ...GOOD_BODY, provider: { id: 'made-up-provider' } });
    expect(r.providerUnknown).toBe(true);
    expect(r.providerImpl).toBeNull();
    expect(r.format.provider_id).toBeNull();
  });

  it('carries the plan-locked seed through — the E33 $0.968 dice roll', () => {
    // A retry that differs from take 1 ONLY by seed is money spent on chance
    // rather than on the revision. The plan locks the seed; every render path
    // must receive that exact value.
    const r = params({ ...GOOD_BODY, seed_strategy: { seed: 424242 } });
    expect(r.seed).toBe(424242);
  });

  it('reports seed null (send no seed) when the plan locks none', () => {
    expect(params(GOOD_BODY).seed).toBeNull();
  });

  it('carries resolution and duration verbatim; nulls an off-contract resolution', () => {
    expect(params({ ...GOOD_BODY, resolution: '1080p', duration_seconds: 9 })).toMatchObject({
      durationSeconds: 9,
      format: { resolution: '1080p' },
    });
    expect(params({ ...GOOD_BODY, resolution: '4k' }).format.resolution).toBeNull();
  });

  it('returns an all-null projection for a plan that declares nothing', () => {
    const r = params({ prompt: 'only a prompt' });
    expect(r).toMatchObject({
      providerImpl: null,
      providerUnknown: false,
      seed: null,
      durationSeconds: null,
      format: { provider_id: null, quality_tier: null, resolution: null },
    });
  });
});

describe('assertShotReadyForGeneration', () => {
  it('throws ShotNotReadyError carrying the report when not ready', async () => {
    const sb = makeSupabase({ plan: null });
    await expect(assertShotReadyForGeneration(sb, ARGS)).rejects.toBeInstanceOf(ShotNotReadyError);
  });

  it('refuses as a 400 ValidationError so routes need no adapter', async () => {
    // The manual re-render route (/api/assets/:id/regenerate-video) calls this
    // gate directly; a bare Error would have surfaced the refusal as an opaque
    // 500 instead of the concrete blockers.
    const sb = makeSupabase({ plan: null });
    const err = await assertShotReadyForGeneration(sb, ARGS).catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.status).toBe(400);
    expect(err.details).toMatchObject({ blockers: [{ code: 'plan_missing' }] });
  });

  it('returns the report when ready', async () => {
    const sb = makeSupabase({
      plan: { id: 'plan-1', status: 'APPROVED', version: 1, file_type: 'SPC-shot_plan', content: planMarkdown(GOOD_BODY) },
    });
    const r = await assertShotReadyForGeneration(sb, ARGS);
    expect(r.ok).toBe(true);
  });
});

// ── resolveApprovedShotPlan — the BY-SHOT path (planAssetId = null) ──────────
// This is the resolution the manual per-shot re-render uses
// (/api/assets/:id/regenerate-video, E33 audit P0 #4): never a plan id cached
// on the previous asset — always THE currently approved plan of this shot, so a
// plan re-authored after a REQUEST_REVISION is the one that renders. Covered
// separately because the tests above all take the explicit-id branch.
function makeByShotSupabase(rows: unknown[]): never {
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.like = () => builder;
  builder.eq = () => builder;
  // The by-shot query is awaited directly after the last .eq() — no
  // .maybeSingle() — so the builder itself must be thenable.
  builder.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: rows, error: null }).then(resolve);
  return { from: () => builder } as never;
}

describe('resolveApprovedShotPlan — by shot', () => {
  const SHOT = 'SS-S15-E33-SH01';

  it('returns the newest APPROVED plan matching metadata.shot_id', async () => {
    const sb = makeByShotSupabase([
      { id: 'plan-v1', status: 'APPROVED', version: 1, file_type: 'SPC-shot_plan', content: 'v1', metadata: { shot_id: SHOT } },
      { id: 'plan-v3', status: 'APPROVED', version: 3, file_type: 'SPC-shot_plan', content: 'v3', metadata: { shot_id: SHOT } },
      { id: 'other-shot', status: 'APPROVED', version: 9, file_type: 'SPC-shot_plan', content: 'x', metadata: { shot_id: 'SS-S15-E33-SH02' } },
    ]);
    const { plan, reason } = await resolveApprovedShotPlan(sb, 'ep-1', SHOT, null);
    expect(reason).toBeNull();
    expect(plan?.id).toBe('plan-v3');
  });

  it('falls back to the SPC-shot_plan-<shot> file_type when metadata has no shot_id', async () => {
    const sb = makeByShotSupabase([
      { id: 'legacy', status: 'APPROVED', version: 1, file_type: `SPC-shot_plan-${SHOT}`, content: 'legacy' },
    ]);
    const { plan } = await resolveApprovedShotPlan(sb, 'ep-1', SHOT, null);
    expect(plan?.id).toBe('legacy');
  });

  it('reports no approved plan rather than silently returning one from another shot', async () => {
    const sb = makeByShotSupabase([
      { id: 'other-shot', status: 'APPROVED', version: 2, file_type: 'SPC-shot_plan', content: 'x', metadata: { shot_id: 'SS-S15-E33-SH02' } },
    ]);
    const { plan, reason } = await resolveApprovedShotPlan(sb, 'ep-1', SHOT, null);
    expect(plan).toBeNull();
    expect(reason).toMatch(/no APPROVED shot plan/i);
  });
});
