import { describe, it, expect } from 'vitest';

import { validateAgentInputs } from '@/lib/agents/gate';
import { makeMockSupabase } from '../helpers/mock-supabase';

// S-reorder (2026-07-01): EXEC-VGEN's `VID-animatic` requirement is mode-conditional.
// Parallel mode drops it (video flows straight from an approved shot plan); sequential
// / absent-flag keeps it (⇒ replay-pilot and every existing episode unchanged).
describe('validateAgentInputs — EXEC-VGEN pipeline-mode override', () => {
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

  it('sequential (default, absent flag): EXEC-VGEN BLOCKS without an approved animatic', async () => {
    const sup = withMode({}); // no pipeline_mode ⇒ sequential
    const r = await validateAgentInputs({
      supabase: sup.client,
      agentId: 'EXEC-VGEN',
      episodeId: 'ep-1',
    });
    expect(r.passed).toBe(false);
    expect(r.reason ?? '').toMatch(/animatic/i);
  });
});
