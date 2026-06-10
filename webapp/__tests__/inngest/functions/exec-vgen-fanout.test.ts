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
    expect(result.event).toBe('sandystudio/exec-vanim/plan');
    expect(result.data).toEqual({ episodeId: EP_ID, shotId: SHOT.shot_id });
  });

  it('flag on + plan exists → routes to single-shot with planAssetId', () => {
    const planId = 'plan-asset-uuid';
    const result = decideFanoutEmit(EP_ID, SHOT, planId, true);
    expect(result.event).toBe('sandystudio/exec-vgen/single-shot');
    expect((result.data as Record<string, unknown>).planAssetId).toBe(planId);
    expect((result.data as Record<string, unknown>).shotId).toBe(SHOT.shot_id);
  });

  it('flag off + no plan → legacy single-shot without planAssetId', () => {
    const result = decideFanoutEmit(EP_ID, SHOT, undefined, false);
    expect(result.event).toBe('sandystudio/exec-vgen/single-shot');
    expect((result.data as Record<string, unknown>).planAssetId).toBeUndefined();
    expect((result.data as Record<string, unknown>).shotId).toBe(SHOT.shot_id);
  });
});
