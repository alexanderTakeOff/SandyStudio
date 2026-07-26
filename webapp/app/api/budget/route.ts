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

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { pagedSelect } from '@/lib/api/paged-select';
import { apiOk } from '@/lib/api/response';
import { parseSearchParams } from '@/lib/api/zod-helpers';
import {
  aggregateBudget,
  type BudgetEpisodeInput,
  type BudgetLogInput,
} from '@/lib/budget-summary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ListQuery = z.object({
  // Workspace scope (Phase 3; ledger column since Phase 4e). Scoped view =
  // rows with budget_log.series_id (trigger-filled from episodes; Polina's
  // episode-less spend carries the thread's series). Truly global spend
  // (series_id NULL) stays only in the unscoped «вся студия» money board.
  series_id: z.string().uuid().optional(),
});

export const GET = withApiHandler(async (req) => {
  const { supabase } = await requireDirector();
  const q = parseSearchParams(req.url, ListQuery);

  // Both scans are independent → run them concurrently. Each is paged, so
  // neither can be silently truncated at 1000 rows. Phase 4e: a scoped view
  // filters in the DB via budget_log.series_id instead of fetching the whole
  // ledger and joining in JS.
  const [episodesAll, logs] = await Promise.all([
    pagedSelect<BudgetEpisodeInput & { series_id?: string | null }>(() =>
      supabase
        .from('episodes')
        .select('id,episode_code,status,budget_ceiling,budget_spent,created_at,series_id'),
    ),
    pagedSelect<BudgetLogInput>(() => {
      const sel = supabase
        .from('budget_log')
        .select(
          'episode_id,agent_id,api_provider,model_or_tier,operation,cost_usd,tokens_used,created_at',
        );
      return q.series_id ? sel.eq('series_id', q.series_id) : sel;
    }),
  ]);

  const episodes = q.series_id
    ? episodesAll.filter((e) => e.series_id === q.series_id)
    : episodesAll;

  return apiOk({
    generatedAt: new Date().toISOString(),
    scopedSeriesId: q.series_id ?? null,
    ...aggregateBudget(episodes, logs),
  });
});
