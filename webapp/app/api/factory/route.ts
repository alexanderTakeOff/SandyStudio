// ──────────────────────────────────────────────────────────────────────────────
// app/api/factory/route.ts
// Factory Overview data — the whole-factory ADAPTATION picture (slow-loop trends
// across episodes), sibling of /api/audience (quality) and /api/budget (price).
// Reads episode_scorecard (SSOT) + budget_log ($/shot) + open calibration
// proposals. Read-only.
//
// North-Star scorecard v2 (per the Factory brief 2026-07-14):
//   • Director touches / episode        → target 6 (Start·Brief·Script·Casting·Publish·Close)
//   • Creative touches after casting     → target 0 (Phase-1 leak proxy)
//   • Honest critic churn (REVISE/ver)   vs the naive runs/shot that mis-diagnoses
//   • Producer first-pass reject rate + paid regens (the E28 real-cost axis)
//   • $/shot trend · autonomy% · failures (emergencies → 0)
// ──────────────────────────────────────────────────────────────────────────────

import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import type { CriticDiscriminatorResult } from '@/lib/agents/scorecard/critic-discriminator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DIRECTOR_TOUCH_TARGET = 6;

interface FactoryEpisodeRow {
  episodeId: string;
  episodeCode: string;
  phase: string;
  createdAt: string;
  shotCount: number;
  reachedFinalCut: boolean;
  // North-Star
  directorTouches: number; // codeable_touches_human — target 6
  creativeTouchesAfterCasting: number; // approvals_creative_human — leak proxy, target 0
  autonomyPct: number | null;
  agentFailures: number;
  costPerShot: number | null;
  costTotal: number | null;
  // discriminator (the three honest axes)
  naiveRunsPerShot: number;
  trueCriticChurn: number | null;
  producerFirstPassRejectRate: number | null;
  reworkRegens: number | null;
  criticVerdicts: Array<{ critic: string; verdict: string; reviseCount: number; repeatedPoints: string[] }>;
}

export const GET = withApiHandler(async () => {
  const { supabase } = await requireDirector();

  // 1. All scorecard rows → reduce to the LATEST per episode.
  const { data: cards } = await supabase
    .from('episode_scorecard')
    .select(
      'episode_id, phase, shot_count, kpi1_runs_per_shot, codeable_touches_human, approvals_creative_human, agent_failures, metrics, created_at',
    )
    .order('created_at', { ascending: false });

  const latestByEpisode = new Map<string, NonNullable<typeof cards>[number]>();
  for (const c of cards ?? []) {
    if (!latestByEpisode.has(c.episode_id)) latestByEpisode.set(c.episode_id, c);
  }
  const episodeIds = [...latestByEpisode.keys()];
  if (episodeIds.length === 0) {
    return apiOk({ generatedAt: new Date().toISOString(), directorTouchTarget: DIRECTOR_TOUCH_TARGET, episodes: [], openProposals: [] });
  }

  // 2. Episode codes.
  const { data: eps } = await supabase
    .from('episodes')
    .select('id, episode_code')
    .in('id', episodeIds);
  const codeById = new Map((eps ?? []).map((e) => [e.id, e.episode_code]));

  // 3. $/shot — sum budget_log per episode (single scan, aggregated in JS).
  const { data: budget } = await supabase
    .from('budget_log')
    .select('episode_id, cost_usd')
    .in('episode_id', episodeIds);
  const costByEpisode = new Map<string, number>();
  for (const b of budget ?? []) {
    const id = b.episode_id as string | null;
    if (!id) continue;
    costByEpisode.set(id, (costByEpisode.get(id) ?? 0) + Number(b.cost_usd ?? 0));
  }

  // 4. Assemble per-episode rows.
  const openProposals: Array<{ episodeCode: string; critic: string; zone: string; action: string; target: string }> = [];
  const rows: FactoryEpisodeRow[] = [];
  for (const [episodeId, c] of latestByEpisode) {
    const metrics = (c.metrics ?? {}) as Record<string, unknown>;
    const disc = metrics.critic_discriminator as CriticDiscriminatorResult | undefined;
    const shotCount = c.shot_count ?? 0;
    const costTotal = costByEpisode.get(episodeId) ?? null;
    const episodeCode = codeById.get(episodeId) ?? episodeId.slice(0, 8);

    if (disc?.proposals) {
      for (const p of disc.proposals) {
        openProposals.push({ episodeCode, critic: p.critic, zone: p.zone, action: p.action, target: p.target });
      }
    }

    rows.push({
      episodeId,
      episodeCode,
      phase: c.phase,
      createdAt: c.created_at,
      shotCount,
      reachedFinalCut: metrics.reached_final_cut === true,
      directorTouches: c.codeable_touches_human ?? 0,
      creativeTouchesAfterCasting: c.approvals_creative_human ?? 0,
      autonomyPct: typeof metrics.autonomy_pct === 'number' ? metrics.autonomy_pct : null,
      agentFailures: c.agent_failures ?? 0,
      costTotal,
      costPerShot: costTotal !== null && shotCount > 0 ? +(costTotal / shotCount).toFixed(2) : null,
      naiveRunsPerShot: c.kpi1_runs_per_shot ?? 0,
      trueCriticChurn: disc?.trueCriticChurn ?? null,
      producerFirstPassRejectRate: disc?.producerFirstPassRejectRate ?? null,
      reworkRegens: disc?.reworkRegens ?? null,
      criticVerdicts: (disc?.perCritic ?? [])
        .filter((pc) => pc.reviseCount > 0 || pc.verdict !== 'healthy')
        .map((pc) => ({
          critic: pc.critic,
          verdict: pc.verdict,
          reviseCount: pc.reviseCount,
          repeatedPoints: pc.repeatedPoints,
        })),
    });
  }

  // Chronological for trend reading (oldest → newest).
  rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return apiOk({
    generatedAt: new Date().toISOString(),
    directorTouchTarget: DIRECTOR_TOUCH_TARGET,
    episodes: rows,
    openProposals,
  });
});
