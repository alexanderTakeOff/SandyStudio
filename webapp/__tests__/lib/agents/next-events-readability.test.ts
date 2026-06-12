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
// Mock supabase shared with the single-dispatch suite — see
// helpers/mock-supabase-next-events.ts (extracted 2026-06-12).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { computeNextEvents, type AssetForChain } from '@/lib/agents/next-events';
import {
  mockSupabase as makeMock,
  type MockRow as Row,
} from './helpers/mock-supabase-next-events';

function mockSupabase(seed: { jobs?: Row[]; assets?: Row[] }) {
  return makeMock(seed).client;
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
