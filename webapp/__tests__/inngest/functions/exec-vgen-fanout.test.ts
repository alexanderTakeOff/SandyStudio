// Unit tests for the pure decideFanoutEmit helper in exec-vgen.ts.
// These tests are pure — they verify only the routing decision logic
// extracted as a test seam. All heavy module-level dependencies (Inngest
// client, env, Supabase) are stubbed so no env vars are needed.
//
// Phase 3, C1-Gate sprint (2026-06-10).

import { describe, it, expect, vi } from 'vitest';

// Stub env before any imports from @/lib/... trigger it.
vi.mock('@/lib/env', () => ({
  PUBLIC_ENV: {
    SUPABASE_URL: 'http://localhost:54321',
    SUPABASE_ANON_KEY: 'test-anon-key',
    APP_URL: 'http://localhost:3000',
  },
  SERVER_ENV: {
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    INNGEST_EVENT_KEY: 'test-inngest-key',
    INNGEST_SIGNING_KEY: 'test-signing-key',
  },
}));

vi.mock('@/lib/inngest/client', () => ({
  inngest: {
    createFunction: vi.fn(),
    send: vi.fn(),
  },
  // Stub the event type — tests only import the pure helper, not the function
}));

vi.mock('@/lib/agents/factory', () => ({
  createAgentInngestFunction: vi.fn(),
}));

vi.mock('@/lib/inngest/concurrency', () => ({
  concurrencyFor: vi.fn(() => ({ limit: 1 })),
}));

import { decideFanoutEmit } from '@/inngest/functions/exec-vgen';

const EP_ID = 'episode-uuid-123';
const SHOT = { shot_id: 'SS-S01-E01-A1-SC01-SH01', duration_seconds: 5 };

describe('decideFanoutEmit — Animator chain routing', () => {
  it('flag on + no plan → routes to exec-vanim/plan', () => {
    const result = decideFanoutEmit(EP_ID, SHOT, undefined, true);
    expect(result).not.toBeNull();
    expect(result!.event).toBe('sandystudio/exec-vanim/plan');
    expect(result!.data).toEqual({ episodeId: EP_ID, shotId: SHOT.shot_id });
  });

  it('flag on + plan exists → routes to single-shot with planAssetId', () => {
    const planId = 'plan-asset-uuid';
    const result = decideFanoutEmit(EP_ID, SHOT, planId, true);
    expect(result).not.toBeNull();
    expect(result!.event).toBe('sandystudio/exec-vgen/single-shot');
    expect((result!.data as Record<string, unknown>).planAssetId).toBe(planId);
    expect((result!.data as Record<string, unknown>).shotId).toBe(SHOT.shot_id);
  });

  it('flag off + no plan → legacy single-shot without planAssetId', () => {
    const result = decideFanoutEmit(EP_ID, SHOT, undefined, false);
    expect(result).not.toBeNull();
    expect(result!.event).toBe('sandystudio/exec-vgen/single-shot');
    expect((result!.data as Record<string, unknown>).planAssetId).toBeUndefined();
    expect((result!.data as Record<string, unknown>).shotId).toBe(SHOT.shot_id);
  });
});

// ── Regression lock: the runaway plan-authoring loop (E30, 2026-07-19) ────────
// A plan that PASSes the critic is left in REVIEW by contract, so it was absent
// from the APPROVED-only plan map and read as "this shot has no plan" — every
// fan-out re-authored it. SH27 reached 17 versions with 108 PASS verdicts and
// only 9 REVISEs, so neither the regen cap nor the critic revision cap could
// see it. `hasLivePlan` now separates "should I author?" from "can I generate?".
describe('decideFanoutEmit — live-but-unapproved plan must not be re-authored', () => {
  it('plan exists in REVIEW (not approved) → waits, emits nothing', () => {
    const result = decideFanoutEmit(EP_ID, SHOT, undefined, true, true);
    expect(result).toBeNull();
  });

  it('no plan at all → still authors one', () => {
    const result = decideFanoutEmit(EP_ID, SHOT, undefined, true, false);
    expect(result).not.toBeNull();
    expect(result!.event).toBe('sandystudio/exec-vanim/plan');
  });

  it('approved plan wins over hasLivePlan → generates video', () => {
    const result = decideFanoutEmit(EP_ID, SHOT, 'plan-asset-uuid', true, true);
    expect(result).not.toBeNull();
    expect(result!.event).toBe('sandystudio/exec-vgen/single-shot');
  });

  it('never emits single-shot without an APPROVED plan id while chained', () => {
    // VGEN hard-fails on a plan whose status is not APPROVED — that is what
    // spammed SH05/SH06 with agent_failed. Waiting is the only safe outcome.
    const result = decideFanoutEmit(EP_ID, SHOT, undefined, true, true);
    expect(result).toBeNull();
  });

  it('chain OFF ignores hasLivePlan entirely (legacy behaviour byte-identical)', () => {
    const result = decideFanoutEmit(EP_ID, SHOT, undefined, false, true);
    expect(result).not.toBeNull();
    expect(result!.event).toBe('sandystudio/exec-vgen/single-shot');
  });
});
