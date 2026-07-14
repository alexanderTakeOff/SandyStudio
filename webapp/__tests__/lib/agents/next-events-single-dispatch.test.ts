// Single-dispatch doctrine — F1 fix-sprint 2026-06-12 (E07 smoke fallout).
// Each agent has exactly ONE dispatch source. These tests pin the closed
// double-fire paths:
//
//   1. SCR-script APPROVED → NO exec-srev (critic chain at Writer completion
//      owns SREV; the push here was the SREV×2 → STB×2 → SH03-deadlock root).
//   2. SPC-ref_plan / SPC-shot_plan APPROVED → execute-from-plan / single-shot
//      once, for every principal (Mode-4/AUTOTEST branches removed Phase 1; the
//      plan-critic autofire flips the plan APPROVED then re-enters this router).
//   3. Per-Plan idempotency reads BOTH metadata shapes — top-level
//      `plan_asset_id` (what exec-vgen writes) and `provenance.plan_asset_id`
//      (what EREF writes). The provenance-only readers were blind to VID-shots
//      (SH03 rendered twice, +$1.21).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  computeNextEvents,
  hasActiveJob,
  planIdFromAssetMeta,
  type AssetForChain,
} from '@/lib/agents/next-events';
import { mockSupabase } from './helpers/mock-supabase-next-events';

const EP = 'ep-1';

const FLAGS = ['DESIGNER_CHAIN_ENABLED', 'ANIMATOR_CHAIN_ENABLED'] as const;
const ORIGINAL: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const f of FLAGS) {
    ORIGINAL[f] = process.env[f];
    delete process.env[f];
  }
});
afterEach(() => {
  for (const f of FLAGS) {
    if (ORIGINAL[f] === undefined) delete process.env[f];
    else process.env[f] = ORIGINAL[f];
  }
});

function jsonContent(body: Record<string, unknown>): string {
  return ['# Doc', '```json', JSON.stringify(body), '```'].join('\n');
}

describe('SCR-script approval — SREV is critic-chain-only', () => {
  it('fires EXEC-COPY but never exec-srev', async () => {
    const { client } = mockSupabase({ assets: [], jobs: [] });
    const asset: AssetForChain = {
      id: 'scr-1',
      filename: 'scr',
      file_type: 'SCR-script',
      episode_id: EP,
      updated_at: '2026-06-12T00:00:00Z',
    };
    const events = await computeNextEvents(client, asset, 'director-1');
    const names = events.map((e) => e.name);
    expect(names).toContain('sandystudio/exec-copy/write-metadata');
    expect(names).not.toContain('sandystudio/exec-srev/review-script');
  });

  it('AUTOTEST (Mode 4) — same: no exec-srev from the router', async () => {
    const { client } = mockSupabase({ assets: [], jobs: [] });
    const asset: AssetForChain = {
      id: 'scr-1',
      filename: 'scr',
      file_type: 'SCR-script',
      episode_id: EP,
      updated_at: '2026-06-12T00:00:00Z',
    };
    const events = await computeNextEvents(client, asset, 'AUTOTEST');
    expect(events.map((e) => e.name)).not.toContain(
      'sandystudio/exec-srev/review-script',
    );
  });
});

describe('Brief → Casting → Writer gate (2026-06-23, q22a/q30a)', () => {
  function brief(): AssetForChain {
    return {
      id: 'brief-1',
      filename: 'brief',
      file_type: 'SPC-brief',
      episode_id: EP,
      updated_at: '2026-06-23T00:00:00Z',
    };
  }

  it('Brief APPROVED does NOT fire the Writer — Casting is the next gate', async () => {
    const { client } = mockSupabase({ assets: [], jobs: [] });
    const events = await computeNextEvents(client, brief(), 'director-1');
    expect(events.map((e) => e.name)).not.toContain('sandystudio/exec-sw/write-script');
  });

  it('Director mode: Brief APPROVED emits a decision_requested nudge to cast (D1/D2)', async () => {
    const { client, inserts } = mockSupabase({ assets: [], jobs: [] });
    await computeNextEvents(client, brief(), 'director-1');
    const nudges = inserts.filter(
      (i) => i.table === 'activity_events' && i.row.event_type === 'decision_requested',
    );
    expect(nudges).toHaveLength(1);
  });

  it('Director mode: no cast nudge once a cast already exists (fire-once)', async () => {
    const { client, inserts } = mockSupabase({
      assets: [{ id: 'cast-1', episode_id: EP, file_type: 'SPC-episode_cast', status: 'REVIEW' }],
      jobs: [],
    });
    await computeNextEvents(client, brief(), 'director-1');
    const nudges = inserts.filter(
      (i) => i.table === 'activity_events' && i.row.event_type === 'decision_requested',
    );
    expect(nudges).toHaveLength(0);
  });

  it('Director mode: Casting APPROVED fires the Writer with the approved brief id', async () => {
    const { client } = mockSupabase({
      assets: [{ id: 'brief-1', episode_id: EP, file_type: 'SPC-brief', status: 'APPROVED' }],
      jobs: [],
    });
    const cast: AssetForChain = {
      id: 'cast-1',
      filename: 'cast',
      file_type: 'SPC-episode_cast',
      episode_id: EP,
      updated_at: '2026-06-23T00:00:00Z',
    };
    const events = await computeNextEvents(client, cast, 'director-1');
    const fires = events.filter((e) => e.name === 'sandystudio/exec-sw/write-script');
    expect(fires).toHaveLength(1);
    expect(fires[0].data.briefAssetId).toBe('brief-1');
  });
});

describe('SPC-ref_plan APPROVED → execute-from-plan', () => {
  function refPlan(): AssetForChain {
    return {
      id: 'plan-img-1',
      filename: 'plan',
      file_type: 'SPC-ref_plan-SS-S15-E07-A1-SC01-SH01',
      episode_id: EP,
      updated_at: '2026-06-12T00:00:00Z',
      content: jsonContent({ shot_id: 'SS-S15-E07-A1-SC01-SH01' }),
    };
  }

  it('approved plan fires execute-from-plan once', async () => {
    process.env.DESIGNER_CHAIN_ENABLED = 'true';
    const { client } = mockSupabase({
      assets: [
        {
          id: 'plan-img-1',
          episode_id: EP,
          file_type: 'SPC-ref_plan-SS-S15-E07-A1-SC01-SH01',
          status: 'APPROVED',
        },
      ],
      jobs: [],
    });
    const events = await computeNextEvents(client, refPlan(), 'director-1');
    const fires = events.filter(
      (e) => e.name === 'sandystudio/exec-eref/execute-from-plan',
    );
    expect(fires).toHaveLength(1);
    expect(fires[0].data.planAssetId).toBe('plan-img-1');
  });
});

describe('SPC-shot_plan APPROVED → exec-vgen/single-shot', () => {
  function shotPlan(): AssetForChain {
    return {
      id: 'plan-vid-1',
      filename: 'plan',
      file_type: 'SPC-shot_plan-SS-S15-E07-A1-SC01-SH03',
      episode_id: EP,
      updated_at: '2026-06-12T00:00:00Z',
      content: jsonContent({
        shot_id: 'SS-S15-E07-A1-SC01-SH03',
        duration_seconds: 4,
      }),
    };
  }

  it('Director mode: approval fires single-shot once', async () => {
    process.env.ANIMATOR_CHAIN_ENABLED = 'true';
    const { client } = mockSupabase({ assets: [], jobs: [] });
    const events = await computeNextEvents(client, shotPlan(), 'director-1');
    const fires = events.filter((e) => e.name === 'sandystudio/exec-vgen/single-shot');
    expect(fires).toHaveLength(1);
  });

  it('Director mode: VID with top-level plan_asset_id suppresses re-fire', async () => {
    process.env.ANIMATOR_CHAIN_ENABLED = 'true';
    const { client } = mockSupabase({
      assets: [
        {
          id: 'vid-1',
          episode_id: EP,
          file_type: 'VID-shot-ss-s15-e07-a1-sc01-sh03',
          status: 'APPROVED',
          metadata: { plan_asset_id: 'plan-vid-1' },
        },
      ],
      jobs: [],
    });
    const events = await computeNextEvents(client, shotPlan(), 'director-1');
    expect(events.map((e) => e.name)).not.toContain('sandystudio/exec-vgen/single-shot');
  });
});

// D3 (2026-07-11, E27): storyboard fired TWICE. Root cause — the three SB-fire
// branches guarded only with hasJob(EXEC-SB, { since }), and in production the
// `started_at >= since-5s` filter is blind to a prior approval's QUEUED job (no
// started_at) or a RUNNING job that started before the window → a later approval
// re-dispatched. Fix: a `since`-free in-flight guard (hasActiveJob) on every
// SB-fire site — «no re-fire if the agent is already running». (The mock's `gte`
// is a no-op, so it can't reproduce the real started_at miss; hence the direct
// unit test of hasActiveJob below plus the behavioural single-fire lock.)
describe('hasActiveJob — in-flight guard (D3)', () => {
  const job = (status: string, agent = 'EXEC-SB') => ({
    episode_id: EP,
    agent_id: agent,
    status,
  });
  it('true when a QUEUED job exists', async () => {
    const { client } = mockSupabase({ jobs: [job('QUEUED')] });
    expect(await hasActiveJob(client, EP, 'EXEC-SB')).toBe(true);
  });
  it('true when a RUNNING job exists', async () => {
    const { client } = mockSupabase({ jobs: [job('RUNNING')] });
    expect(await hasActiveJob(client, EP, 'EXEC-SB')).toBe(true);
  });
  it('false when only a COMPLETED job exists (terminal, not in flight)', async () => {
    const { client } = mockSupabase({ jobs: [job('COMPLETED')] });
    expect(await hasActiveJob(client, EP, 'EXEC-SB')).toBe(false);
  });
  it('false when no job exists', async () => {
    const { client } = mockSupabase({ jobs: [] });
    expect(await hasActiveJob(client, EP, 'EXEC-SB')).toBe(false);
  });
  it('scoped to the agent (a running EXEC-SW does not count for EXEC-SB)', async () => {
    const { client } = mockSupabase({ jobs: [job('RUNNING', 'EXEC-SW')] });
    expect(await hasActiveJob(client, EP, 'EXEC-SB')).toBe(false);
  });
});

describe('Storyboard single-fire — no re-fire while EXEC-SB is in flight (D3)', () => {
  const review = (): AssetForChain => ({
    id: 'rev-1',
    filename: 'rev',
    file_type: 'REV-script_qa',
    episode_id: EP,
    updated_at: '2026-07-11T00:00:00Z',
  });
  const approved = () => [
    { id: 'scr-1', episode_id: EP, file_type: 'SCR-script', status: 'APPROVED' },
    { id: 'cast-1', episode_id: EP, file_type: 'SPC-episode_cast', status: 'APPROVED' },
  ];
  const SB_EVENT = 'sandystudio/exec-sb/create-storyboard';

  it('fires storyboard once when script+cast approved and no SB job', async () => {
    const { client } = mockSupabase({ assets: approved(), jobs: [] });
    const events = await computeNextEvents(client, review(), 'director-1');
    expect(events.filter((e) => e.name === SB_EVENT)).toHaveLength(1);
  });

  it('does NOT re-fire when an EXEC-SB job is already QUEUED', async () => {
    const { client } = mockSupabase({
      assets: approved(),
      jobs: [{ episode_id: EP, agent_id: 'EXEC-SB', status: 'QUEUED' }],
    });
    const events = await computeNextEvents(client, review(), 'director-1');
    expect(events.map((e) => e.name)).not.toContain(SB_EVENT);
  });

  it('does NOT re-fire when an EXEC-SB job is RUNNING', async () => {
    const { client } = mockSupabase({
      assets: approved(),
      jobs: [{ episode_id: EP, agent_id: 'EXEC-SB', status: 'RUNNING' }],
    });
    const events = await computeNextEvents(client, review(), 'director-1');
    expect(events.map((e) => e.name)).not.toContain(SB_EVENT);
  });
});

describe('planIdFromAssetMeta — both historical shapes', () => {
  it('reads provenance.plan_asset_id (EREF shape)', () => {
    expect(planIdFromAssetMeta({ provenance: { plan_asset_id: 'p1' } })).toBe('p1');
  });
  it('reads top-level plan_asset_id (VGEN shape)', () => {
    expect(planIdFromAssetMeta({ plan_asset_id: 'p2' })).toBe('p2');
  });
  it('provenance wins when both present', () => {
    expect(
      planIdFromAssetMeta({ provenance: { plan_asset_id: 'a' }, plan_asset_id: 'b' }),
    ).toBe('a');
  });
  it('null on absent/malformed', () => {
    expect(planIdFromAssetMeta(null)).toBeNull();
    expect(planIdFromAssetMeta({})).toBeNull();
    expect(planIdFromAssetMeta({ provenance: { plan_asset_id: 5 } })).toBeNull();
  });
});
