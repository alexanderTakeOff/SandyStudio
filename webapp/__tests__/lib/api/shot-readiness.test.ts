// Unit tests for the q21 readiness gate (validateShotReadyForGeneration).
// Mocks the supabase query chain so the orchestration logic is exercised
// without filesystem/Drive reads (media resolution is covered by
// media-preflight's own tests). Tests pass an explicit planAssetId so loadPlan
// takes the maybeSingle() path; refs are kept empty or "not found" to avoid
// invoking the real media reader.

import { describe, it, expect } from 'vitest';
import {
  validateShotReadyForGeneration,
  assertShotReadyForGeneration,
  ShotNotReadyError,
} from '@/lib/api/shot-readiness';

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

describe('assertShotReadyForGeneration', () => {
  it('throws ShotNotReadyError carrying the report when not ready', async () => {
    const sb = makeSupabase({ plan: null });
    await expect(assertShotReadyForGeneration(sb, ARGS)).rejects.toBeInstanceOf(ShotNotReadyError);
  });

  it('returns the report when ready', async () => {
    const sb = makeSupabase({
      plan: { id: 'plan-1', status: 'APPROVED', version: 1, file_type: 'SPC-shot_plan', content: planMarkdown(GOOD_BODY) },
    });
    const r = await assertShotReadyForGeneration(sb, ARGS);
    expect(r.ok).toBe(true);
  });
});
