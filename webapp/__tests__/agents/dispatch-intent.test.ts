import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/supabase/types.gen';
import {
  computeInputHash,
  claimDispatchIntent,
  markDispatchIntent,
} from '@/lib/agents/dispatch-intent';
import { makeMockSupabase } from '../helpers/mock-supabase';

describe('dispatch-intent — computeInputHash', () => {
  it('is stable regardless of key order', () => {
    const a = computeInputHash({ shotId: 'S1-E13-SH03', agentId: 'EXEC-EREF', plan: 'p1' });
    const b = computeInputHash({ plan: 'p1', agentId: 'EXEC-EREF', shotId: 'S1-E13-SH03' });
    expect(a).toBe(b);
  });

  it('ignores volatile keys (principal, runId, confirmedBy, directorConfirm)', () => {
    const base = computeInputHash({ shotId: 'S1-E13-SH03', agentId: 'EXEC-EREF' });
    const withVolatile = computeInputHash({
      shotId: 'S1-E13-SH03',
      agentId: 'EXEC-EREF',
      principal: 'director',
      runId: 'run-xyz',
      confirmedBy: 'alex',
      directorConfirm: true,
    });
    expect(withVolatile).toBe(base);
  });

  it('changes when identifying payload changes', () => {
    const a = computeInputHash({ shotId: 'S1-E13-SH03' });
    const b = computeInputHash({ shotId: 'S1-E13-SH04' });
    expect(a).not.toBe(b);
  });
});

describe('dispatch-intent — claimDispatchIntent (atomic claim)', () => {
  const key = { episodeId: 'ep-1', shotId: 'S1-E13-SH03', agentId: 'EXEC-EREF' };

  it('grants the claim on a fresh (episode, shot, agent)', async () => {
    const { client } = makeMockSupabase();
    const r = await claimDispatchIntent(client, key, 'h1', 'run-1');
    expect(r.claimed).toBe(true);
  });

  it('blocks a second concurrent dispatch for the same shot+agent', async () => {
    const { client, tables } = makeMockSupabase();
    const first = await claimDispatchIntent(client, key, 'h1', 'run-1');
    const second = await claimDispatchIntent(client, key, 'h1', 'run-2');
    expect(first.claimed).toBe(true);
    expect(second.claimed).toBe(false);
    expect(second.blockingRunId).toBe('run-1');
    expect(second.blockingStatus).toBe('claimed');
    // dup-waste recorded on the holder
    expect(tables.dispatch_intent[0].blocked_count).toBe(1);
  });

  it('does NOT block a different shot (independent claim)', async () => {
    const { client } = makeMockSupabase();
    await claimDispatchIntent(client, key, 'h1', 'run-1');
    const other = await claimDispatchIntent(
      client,
      { ...key, shotId: 'S1-E13-SH04' },
      'h2',
      'run-2',
    );
    expect(other.claimed).toBe(true);
  });

  it('does NOT block a different agent for the same shot', async () => {
    const { client } = makeMockSupabase();
    await claimDispatchIntent(client, key, 'h1', 'run-1');
    const designer = await claimDispatchIntent(
      client,
      { ...key, agentId: 'EXEC-EREF-DESIGNER' },
      'h2',
      'run-2',
    );
    expect(designer.claimed).toBe(true);
  });

  it('allows a sequential re-claim after the prior run is marked terminal', async () => {
    const { client } = makeMockSupabase();
    await claimDispatchIntent(client, key, 'h1', 'run-1');
    await markDispatchIntent(client, key, 'done');
    const regen = await claimDispatchIntent(client, key, 'h1', 'run-2');
    expect(regen.claimed).toBe(true);
  });

  it('still blocks while the holder is RUNNING (not yet terminal)', async () => {
    const { client } = makeMockSupabase();
    await claimDispatchIntent(client, key, 'h1', 'run-1');
    await markDispatchIntent(client, key, 'running');
    const dup = await claimDispatchIntent(client, key, 'h1', 'run-2');
    expect(dup.claimed).toBe(false);
    expect(dup.blockingStatus).toBe('running');
  });

  it('FAILS OPEN (claimed=true) when the RPC errors', async () => {
    const erroringClient = {
      rpc: () => Promise.resolve({ data: null, error: { message: 'boom' } }),
    } as unknown as SupabaseClient<Database>;
    const r = await claimDispatchIntent(erroringClient, key, 'h1', 'run-1');
    expect(r.claimed).toBe(true);
  });
});
