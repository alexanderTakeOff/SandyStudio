// ──────────────────────────────────────────────────────────────────────────────
// app/api/budget/route.ts
// Budget summary aggregator per webapp.md §5.2.
//
// Output:
//   {
//     totalAllocated, totalSpent, remaining,
//     burnRate,           // per episode trailing avg (last 5 published episodes)
//     projectedRunway,    // episodes remaining at current burn
//     byEpisode: [{ episodeId, code, total, breakdown }]
//   }
// ──────────────────────────────────────────────────────────────────────────────

import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface EpisodeRow {
  id: string;
  episode_code: string;
  budget_ceiling: number | null;
  budget_spent: number | null;
  status: string;
}

interface BudgetLogRow {
  episode_id: string | null;
  agent_id: string;
  api_provider: string;
  cost_usd: number;
}

const PUBLISHED_STATES = new Set(['PUBLISHED', 'ANALYTICS_COLLECTING', 'COMPLETE']);

export const GET = withApiHandler(async () => {
  const { supabase } = await requireDirector();

  const [episodesRes, logsRes] = await Promise.all([
    supabase.from('episodes').select('id,episode_code,budget_ceiling,budget_spent,status'),
    supabase.from('budget_log').select('episode_id,agent_id,api_provider,cost_usd'),
  ]);
  if (episodesRes.error) throw new Error(`episodes scan failed: ${episodesRes.error.message}`);
  if (logsRes.error) throw new Error(`budget_log scan failed: ${logsRes.error.message}`);

  const episodes = (episodesRes.data ?? []) as EpisodeRow[];
  const logs = (logsRes.data ?? []) as BudgetLogRow[];

  const totalAllocated = episodes.reduce((sum, e) => sum + (e.budget_ceiling ?? 0), 0);
  const totalSpent = logs.reduce((sum, l) => sum + Number(l.cost_usd), 0);
  const remaining = Math.max(0, totalAllocated - totalSpent);

  // burnRate: trailing average over last 5 published episodes
  const publishedEps = episodes.filter((e) => PUBLISHED_STATES.has(e.status));
  const lastFive = publishedEps.slice(-5);
  const burnRate =
    lastFive.length > 0
      ? lastFive.reduce((sum, e) => sum + Number(e.budget_spent ?? 0), 0) / lastFive.length
      : 0;
  const projectedRunway = burnRate > 0 ? Math.floor(remaining / burnRate) : Infinity;

  // byEpisode breakdown
  const byEpisode = episodes.map((e) => {
    const epLogs = logs.filter((l) => l.episode_id === e.id);
    const breakdown: Record<string, number> = {};
    for (const l of epLogs) {
      breakdown[l.api_provider] = (breakdown[l.api_provider] ?? 0) + Number(l.cost_usd);
    }
    return {
      episode_id: e.id,
      episode_code: e.episode_code,
      total: epLogs.reduce((s, l) => s + Number(l.cost_usd), 0),
      ceiling: e.budget_ceiling,
      breakdown,
    };
  });

  return apiOk({
    totalAllocated,
    totalSpent,
    remaining,
    burnRate,
    projectedRunway: projectedRunway === Infinity ? null : projectedRunway,
    byEpisode,
  });
});
