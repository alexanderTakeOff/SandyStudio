// next-events readability-gate routing (C1-Gate sprint 2026-06-10,
// dedup 2026-06-11 — single fire path doctrine).
// Covers the EXEC-CREAD wiring in computeNextEvents:
//   - STB-* APPROVED → NOTHING when READABILITY_GATE_ENABLED is on (CREAD is
//     fired by the factory critic chain at Storyboarder completion; the push
//     here double-fired deterministically in Mode 4)
//   - STB-* APPROVED → WCHK when the flag is off (byte-identical legacy)
//   - REV-readability PASS → NOTHING (CREAD's spec.nextEvent critic chain
//     owns the PASS→WCHK fire)
//   - REV-readability REVISE under AUTOTEST → exec-sb with revisionNote
//   - per-shot eref/vanim REV-readability rows are ignored (phase guard)
//
// A purpose-built mock supabase models just the query shapes computeNextEvents
// uses in these branches: count queries (countApproved / hasJob) and the
// order/limit/maybeSingle of findLatestApprovedAssetId.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { computeNextEvents, type AssetForChain } from '@/lib/agents/next-events';

interface Row {
  id?: string;
  episode_id?: string;
  agent_id?: string;
  status?: string;
  file_type?: string;
  version?: number;
  started_at?: string;
}

function mockSupabase(seed: { jobs?: Row[]; assets?: Row[] }) {
  const jobs = seed.jobs ?? [];
  const assets = seed.assets ?? [];

  function table(name: string) {
    const rows = name === 'jobs' ? jobs : assets;
    let isCount = false;
    let ordered: Row[] | null = null;
    const filters: Array<(r: Row) => boolean> = [];
    const apply = () => {
      let r = rows as Row[];
      for (const f of filters) r = r.filter(f);
      return r;
    };
    const builder = {
      select: (_c: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.count === 'exact' || opts?.head) isCount = true;
        return builder;
      },
      eq: (col: string, val: unknown) => {
        filters.push((r) => (r as Record<string, unknown>)[col] === val);
        return builder;
      },
      in: (col: string, vals: ReadonlyArray<unknown>) => {
        const set = new Set(vals);
        filters.push((r) => set.has((r as Record<string, unknown>)[col]));
        return builder;
      },
      like: (col: string, pattern: string) => {
        const t = pattern.endsWith('%') ? pattern.slice(0, -1) : pattern;
        filters.push((r) => String((r as Record<string, unknown>)[col] ?? '').startsWith(t));
        return builder;
      },
      gte: () => builder,
      order: (col: string, opts?: { ascending?: boolean }) => {
        const asc = opts?.ascending ?? true;
        ordered = [...apply()].sort((a, b) => {
          const av = Number((a as Record<string, unknown>)[col] ?? 0);
          const bv = Number((b as Record<string, unknown>)[col] ?? 0);
          return asc ? av - bv : bv - av;
        });
        return builder;
      },
      limit: () => builder,
      maybeSingle: async () => ({ data: (ordered ?? apply())[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown) => {
        const filtered = apply();
        if (isCount) return resolve({ data: null, count: filtered.length, error: null });
        return resolve({ data: filtered, error: null });
      },
    };
    return builder;
  }
  return { from: (n: string) => table(n) } as never;
}

const EP = 'ep-1';

const ORIGINAL_FLAG = process.env.READABILITY_GATE_ENABLED;
beforeEach(() => {
  delete process.env.READABILITY_GATE_ENABLED;
});
afterEach(() => {
  if (ORIGINAL_FLAG === undefined) delete process.env.READABILITY_GATE_ENABLED;
  else process.env.READABILITY_GATE_ENABLED = ORIGINAL_FLAG;
});

function stbAsset(): AssetForChain {
  return {
    id: 'stb-1',
    filename: 'stb',
    file_type: 'STB-storyboard',
    episode_id: EP,
    updated_at: '2026-06-10T00:00:00Z',
  };
}

describe('computeNextEvents — STB readability routing', () => {
  it('flag OFF: STB approval fires EXEC-WCHK (legacy, byte-identical)', async () => {
    const sb = mockSupabase({
      assets: [{ id: 'stb-1', episode_id: EP, file_type: 'STB-storyboard', status: 'APPROVED' }],
      jobs: [],
    });
    const events = await computeNextEvents(sb, stbAsset(), 'director-1');
    const names = events.map((e) => e.name);
    expect(names).toContain('sandystudio/exec-wchk/check-world');
    expect(names).not.toContain('sandystudio/exec-cread/review-storyboard');
  });

  it('flag ON: STB approval fires NOTHING — critic chain owns the CREAD fire', async () => {
    process.env.READABILITY_GATE_ENABLED = 'true';
    const sb = mockSupabase({
      assets: [{ id: 'stb-1', episode_id: EP, file_type: 'STB-storyboard', status: 'APPROVED' }],
      jobs: [],
    });
    const events = await computeNextEvents(sb, stbAsset(), 'director-1');
    const names = events.map((e) => e.name);
    expect(names).not.toContain('sandystudio/exec-cread/review-storyboard');
    expect(names).not.toContain('sandystudio/exec-wchk/check-world');
  });
});

describe('computeNextEvents — REV-readability routing', () => {
  function revAsset(verdict: string, extra?: Record<string, unknown>): AssetForChain {
    const body = { verdict, storyboard_asset_id: 'stb-1', ...extra };
    return {
      id: 'rev-1',
      filename: 'rev',
      file_type: 'REV-readability',
      episode_id: EP,
      updated_at: '2026-06-10T00:00:00Z',
      content: ['# Verdict', '```json', JSON.stringify(body), '```'].join('\n'),
    };
  }

  it('PASS fires NOTHING — CREAD spec.nextEvent critic chain owns PASS→WCHK', async () => {
    const sb = mockSupabase({
      assets: [
        { id: 'stb-9', episode_id: EP, file_type: 'STB-storyboard', status: 'APPROVED', version: 2 },
      ],
      jobs: [],
    });
    const events = await computeNextEvents(sb, revAsset('PASS'), 'director-1');
    expect(events.map((e) => e.name)).not.toContain('sandystudio/exec-wchk/check-world');
  });

  it('per-shot eref/vanim phase rows are ignored even on AUTOTEST REVISE', async () => {
    const sb = mockSupabase({
      assets: [
        { id: 'scr-1', episode_id: EP, file_type: 'SCR-script', status: 'APPROVED', version: 1 },
      ],
      jobs: [],
    });
    const shotRev: AssetForChain = {
      ...revAsset('REVISE', { acceptance_criteria: ['per-shot note'] }),
      metadata: { phase: 'vanim' },
    };
    const events = await computeNextEvents(sb, shotRev, 'AUTOTEST');
    expect(events.map((e) => e.name)).not.toContain('sandystudio/exec-sb/create-storyboard');
  });

  it('AUTOTEST REVISE → exec-sb with joined revisionNote', async () => {
    const sb = mockSupabase({
      assets: [
        { id: 'scr-1', episode_id: EP, file_type: 'SCR-script', status: 'APPROVED', version: 1 },
      ],
      jobs: [],
    });
    const events = await computeNextEvents(
      sb,
      revAsset('REVISE', { acceptance_criteria: ['Fix SH02 intent', 'Add false-success beat'] }),
      'AUTOTEST',
    );
    const sbEvt = events.find((e) => e.name === 'sandystudio/exec-sb/create-storyboard');
    expect(sbEvt).toBeDefined();
    expect(sbEvt?.data.scriptAssetId).toBe('scr-1');
    expect(sbEvt?.data.revisionNote).toBe('Fix SH02 intent; Add false-success beat');
  });

  it('REVISE in non-AUTOTEST (Director mode) fires no auto re-author', async () => {
    const sb = mockSupabase({ assets: [], jobs: [] });
    const events = await computeNextEvents(sb, revAsset('REVISE'), 'director-1');
    expect(events.map((e) => e.name)).not.toContain('sandystudio/exec-sb/create-storyboard');
  });
});
