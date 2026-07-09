import { describe, it, expect } from 'vitest';

import { validateAgentInputs } from '@/lib/agents/gate';
import { makeMockSupabase } from '../helpers/mock-supabase';

// E18 (2026-07-09) animatic-stage demotion: the whole-episode `VID-animatic`
// requirement on EXEC-VGEN was removed in ALL modes — the «Start Video» latch
// (pipeline_mode), not a gate asset, decides when video opens; per-shot readiness
// is enforced downstream. This guards against re-introducing the episode-level
// animatic gate: EXEC-VGEN must pass without an approved animatic regardless of
// pipeline_mode.
describe('validateAgentInputs — EXEC-VGEN needs no episode animatic (any mode)', () => {
  const withMode = (metadata: Record<string, unknown>) =>
    makeMockSupabase({
      // governance_mode 4 ⇒ exempt from the F13 budget gate (Step 0c) so the test
      // isolates the animatic requirement.
      episodes: [{ id: 'ep-1', governance_mode: 4, metadata }],
      // No VID-animatic present anywhere in the episode.
      assets: [
        {
          id: 's1',
          episode_id: 'ep-1',
          file_type: 'SPC-shot_plan-S1-E1-SH1',
          status: 'APPROVED',
        },
      ],
    });

  it('parallel mode: EXEC-VGEN passes WITHOUT an approved animatic', async () => {
    const sup = withMode({ pipeline_mode: 'parallel' });
    const r = await validateAgentInputs({
      supabase: sup.client,
      agentId: 'EXEC-VGEN',
      episodeId: 'ep-1',
    });
    expect(r.passed).toBe(true);
  });

  it('sequential (default, absent flag): EXEC-VGEN ALSO passes without an animatic', async () => {
    const sup = withMode({}); // no pipeline_mode ⇒ sequential
    const r = await validateAgentInputs({
      supabase: sup.client,
      agentId: 'EXEC-VGEN',
      episodeId: 'ep-1',
    });
    expect(r.passed).toBe(true);
  });
});
