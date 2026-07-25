// ──────────────────────────────────────────────────────────────────────────────
// app/api/budget/route.ts
// Budget summary aggregator — the studio's PRICE sensor (sibling of /api/audience
// = quality and /api/factory = adaptation). Read-only.
//
// ── 2026-07-25 restore ───────────────────────────────────────────────────────
// This route used to scan `budget_log` with a bare `.select(...)`. PostgREST caps
// an unranged select at `db-max-rows` (1000) and returns NO error, so once the
// ledger passed 1000 rows the tab silently froze: the earliest episodes still
// showed spend (their rows come first by insertion order) and every newer episode
// read $0. That is the "it worked on the first episodes and then stopped" the
// Director reported. Both scans now go through `pagedSelect`, which reads the FULL
// table, and the response carries row counts so a future truncation is visible.
//
// The money math itself lives in `lib/budget-summary.ts` (pure, unit-tested) —
// see that file for the two-ledger accounting model and the rules on what must
// never be silently dropped (Polina's spend, episode-less Bible spend, $0 mock
// rows, overruns).
// ──────────────────────────────────────────────────────────────────────────────

import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { pagedSelect } from '@/lib/api/paged-select';
import { apiOk } from '@/lib/api/response';
import {
  aggregateBudget,
  type BudgetEpisodeInput,
  type BudgetLogInput,
} from '@/lib/budget-summary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withApiHandler(async () => {
  const { supabase } = await requireDirector();

  // Both scans are independent → run them concurrently. Each is paged, so
  // neither can be silently truncated at 1000 rows.
  const [episodes, logs] = await Promise.all([
    pagedSelect<BudgetEpisodeInput>(() =>
      supabase
        .from('episodes')
        .select('id,episode_code,status,budget_ceiling,budget_spent,created_at'),
    ),
    pagedSelect<BudgetLogInput>(() =>
      supabase
        .from('budget_log')
        .select(
          'episode_id,agent_id,api_provider,model_or_tier,operation,cost_usd,tokens_used,created_at',
        ),
    ),
  ]);

  return apiOk({
    generatedAt: new Date().toISOString(),
    ...aggregateBudget(episodes, logs),
  });
});
