// S2/F3 — logEvent's pa/notify-needed gate must SUPPRESS the auto-react wake for
// a persistent-billing failure (metadata.auto_react=false), while still writing
// the audit row, and still wake on a normal actionable failure.

import { describe, it, expect, vi, beforeEach } from 'vitest';

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

const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn((_event: unknown) => Promise.resolve({ ids: ['x'] })),
}));
vi.mock('@/lib/inngest/client', () => ({
  inngest: { createFunction: vi.fn(), send: sendMock },
}));

import { logEvent } from '@/lib/api/events';
import { makeMockSupabase } from '../../helpers/mock-supabase';
import type { ServerSupabaseClient } from '@/lib/api/auth';

beforeEach(() => sendMock.mockClear());

function client() {
  return makeMockSupabase().client as unknown as ServerSupabaseClient;
}

describe('logEvent — pa/notify-needed gate', () => {
  it('wakes Polina on a normal agent_failed (transient)', async () => {
    await logEvent(client(), {
      event_type: 'agent_failed',
      title: 'Animator failed',
      actor: 'EXEC-VANIM',
      episode_id: 'ep-1',
      metadata: { error: 'timeout' },
    });
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0]?.[0]).toMatchObject({
      name: 'sandystudio/pa/notify-needed',
    });
  });

  it('SUPPRESSES the wake when metadata.auto_react=false (billing lock)', async () => {
    await logEvent(client(), {
      event_type: 'agent_failed',
      severity: 'error',
      title: '⛔ Provider out of funds — Animator (Director: top up)',
      actor: 'EXEC-VANIM',
      episode_id: 'ep-1',
      metadata: { error: 'insufficient_quota', auto_react: false, reason: 'PROVIDER_BILLING_LOCK' },
    });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('still writes the audit row even when the wake is suppressed', async () => {
    const { client: c, tables } = makeMockSupabase();
    await logEvent(c as unknown as ServerSupabaseClient, {
      event_type: 'agent_failed',
      title: 'billing wall',
      actor: 'EXEC-EREF',
      episode_id: 'ep-1',
      metadata: { auto_react: false },
    });
    expect(tables.activity_events).toHaveLength(1);
    expect(sendMock).not.toHaveBeenCalled();
  });
});
