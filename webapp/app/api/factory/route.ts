// ──────────────────────────────────────────────────────────────────────────────
// app/api/factory/route.ts
// Factory Overview data — the whole-factory ADAPTATION picture (slow-loop trends
// across episodes), sibling of /api/audience (quality) and /api/budget (price).
// Read-only, read-time aggregator: joins episode_scorecard (churn/KPI SSOT) with
// live activity_events (3-way touch split + pre/post-cast), episodes.budget_spent
// (complete total) + budget_log (itemized where present), per episode.
//
// Returns ALL episodes computed; the client filters (relevant / all / exclude
// archived) with no refetch.
// ──────────────────────────────────────────────────────────────────────────────

import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import type { CriticDiscriminatorResult } from '@/lib/agents/scorecard/critic-discriminator';
import {
  TOUCH_EVENT_TYPES,
  splitTouches,
  productionStartFromJobs,
  foldCost,
  isPostCast,
  type TouchEvent,
} from '@/lib/agents/scorecard/factory-metrics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DIRECTOR_TOUCH_TARGET = 6;
const PAGE = 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function pagedSelect<Row>(make: () => any): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await make()
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Row[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

const round = (n: number, d = 2): number => +n.toFixed(d);

export const GET = withApiHandler(async () => {
  const { supabase } = await requireDirector();

  // 1. Latest scorecard row per episode.
  const { data: cards } = await supabase
    .from('episode_scorecard')
    .select('episode_id, phase, shot_count, kpi1_runs_per_shot, agent_failures, metrics, created_at')
    .order('created_at', { ascending: false });
  const latestByEpisode = new Map<string, NonNullable<typeof cards>[number]>();
  for (const c of cards ?? []) {
    if (!latestByEpisode.has(c.episode_id)) latestByEpisode.set(c.episode_id, c);
  }
  const episodeIds = [...latestByEpisode.keys()];
  if (episodeIds.length === 0) {
    return apiOk({ generatedAt: new Date().toISOString(), directorTouchTarget: DIRECTOR_TOUCH_TARGET, episodes: [], openProposals: [] });
  }

  // 2. Episode facts — code, status, budget_spent (the COMPLETE total), created_at.
  const { data: eps } = await supabase
    .from('episodes')
    .select('id, episode_code, status, budget_spent, created_at')
    .in('id', episodeIds);
  const epById = new Map((eps ?? []).map((e) => [e.id, e]));

  // 3-5. The three paged reads are INDEPENDENT — run them concurrently. Measured
  // 2026-07-20: sequentially they cost ~12s wall (5.0 + 4.1 + 2.1 over 22 round
  // trips), which is long enough for the 30s SWR refresh to overlap itself and for
  // the page to sit on "Failed to load factory data" with no reason given.
  const [touchRows, budgetRows, jobRows] = await Promise.all([
    pagedSelect<{
      episode_id: string;
      event_type: string;
      actor: string | null;
      description: string | null;
      metadata: unknown;
      created_at: string;
    }>(() =>
      supabase
        .from('activity_events')
        .select('episode_id, event_type, actor, description, metadata, created_at')
        .in('episode_id', episodeIds)
        .in('event_type', [...TOUCH_EVENT_TYPES]),
    ),
    pagedSelect<{
      episode_id: string;
      agent_id: string | null;
      operation: string | null;
      cost_usd: number | null;
      created_at: string;
    }>(() =>
      supabase
        .from('budget_log')
        .select('episode_id, agent_id, operation, cost_usd, created_at')
        .in('episode_id', episodeIds),
    ),
    pagedSelect<{ episode_id: string; agent_id: string; created_at: string }>(() =>
      supabase.from('jobs').select('episode_id, agent_id, created_at').in('episode_id', episodeIds),
    ),
  ]);

  const touchByEpisode = new Map<string, typeof touchRows>();
  for (const r of touchRows) {
    (touchByEpisode.get(r.episode_id) ?? touchByEpisode.set(r.episode_id, []).get(r.episode_id)!).push(r);
  }

  // budget_log — itemized ledger (per-agent / per-operation, timestamped).
  const budgetByEpisode = new Map<string, typeof budgetRows>();
  for (const r of budgetRows) {
    (budgetByEpisode.get(r.episode_id) ?? budgetByEpisode.set(r.episode_id, []).get(r.episode_id)!).push(r);
  }

  // jobs — for the pre-cast stage denominator (distinct agents run before lock).
  const jobsByEpisode = new Map<string, typeof jobRows>();
  for (const r of jobRows) {
    (jobsByEpisode.get(r.episode_id) ?? jobsByEpisode.set(r.episode_id, []).get(r.episode_id)!).push(r);
  }

  // 6. Assemble.
  const openProposals: Array<{ episodeCode: string; critic: string; zone: string; action: string; target: string }> = [];
  const rows = [];
  for (const [episodeId, c] of latestByEpisode) {
    const metrics = (c.metrics ?? {}) as Record<string, unknown>;
    const disc = metrics.critic_discriminator as CriticDiscriminatorResult | undefined;
    const shotCount = c.shot_count ?? 0;
    const ep = epById.get(episodeId);
    const episodeCode = ep?.episode_code ?? episodeId.slice(0, 8);
    const status = ep?.status ?? 'UNKNOWN';
    const archived = status === 'ARCHIVED';

    const events = touchByEpisode.get(episodeId) ?? [];
    const jobs = jobsByEpisode.get(episodeId) ?? [];
    // Pre/post boundary = production-start = the ref ARTIST's first render
    // (Director: "pre-cast = [0 → start ref artist]"). DESIGN (brief / script /
    // storyboard / critics / casting / ref-planning) before it; PRODUCTION
    // (refs / video / stitch) at-or-after. NOT casting-lock (that fires early).
    const productionStart = productionStartFromJobs(jobs);
    const touches = splitTouches(events as TouchEvent[], productionStart);

    // Sharp leak: leadership rework DURING PRODUCTION — a revision/reject after the
    // factory should be autonomously rendering. Design-phase revisions are legit
    // creative iteration; production-phase rework/shot → 0 is the real target.
    const postCastRework = events.filter(
      (e) =>
        (e.event_type === 'approval_revision' || e.event_type === 'approval_rejected') &&
        isPostCast(e.created_at, productionStart),
    ).length;

    // pre-cast (design) stage denominator: distinct agents that ran before production.
    const preStages = new Set(
      jobs.filter((j) => !productionStart || j.created_at < productionStart).map((j) => j.agent_id),
    ).size || 1;

    // Budget — two sources that disagree: episodes.budget_spent tracks reservations
    // (misses Polina/concierge spend), budget_log is the itemized per-agent ledger
    // (includes it). To keep the display CONSISTENT (total = pre + post), the total
    // IS the itemized sum whenever budget_log has rows; budget_spent is shown apart
    // as "reserved" for reference. Only when budget_log is empty do we fall back to
    // budget_spent (reservation-only, no itemized split possible).
    const bl = budgetByEpisode.get(episodeId) ?? [];
    const reservedTotal = Number(ep?.budget_spent ?? 0);
    const itemizedTotal = bl.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
    const reservationOnly = bl.length === 0;
    const total = reservationOnly ? reservedTotal : itemizedTotal;
    const preCastRows = bl.filter((r) => !isPostCast(r.created_at, productionStart));
    const postCastRows = bl.filter((r) => isPostCast(r.created_at, productionStart));
    const budget = {
      total: round(total),
      perShot: shotCount > 0 && total > 0 ? round(total / shotCount) : null,
      reservationOnly,
      reservedTotal: round(reservedTotal),
      itemizedTotal: round(itemizedTotal),
      preCast: reservationOnly ? null : round(preCastRows.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0)),
      postCast: reservationOnly ? null : round(postCastRows.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0)),
      byAgent: reservationOnly ? [] : foldCost(bl, (r: { agent_id: string | null }) => r.agent_id ?? 'unknown'),
      byOp: reservationOnly ? [] : foldCost(bl, (r: { operation: string | null }) => r.operation ?? 'unknown'),
    };

    const trueChurn = disc?.trueCriticChurn ?? null;
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
      status,
      archived,
      reachedFinalCut: metrics.reached_final_cut === true,
      shotCount,
      productionStarted: productionStart !== null,
      // #2 + #5 + #6 — touches, 3-way, pre/post, normalized.
      // The factory model (Director 2026-07-16): agents/code = the free base
      // (~10 touches/shot, NOT counted here — touchClass excludes them). The
      // COST is LEADERSHIP intervention, tiered: Polina (L1, AI assistant) then
      // Director (L2, human). Both → 0 as the factory self-runs, especially
      // post-cast. AI-EP = autonomous delegation, tracked apart (not a human cost).
      touches: {
        all: touches.all,
        pre: touches.pre,
        post: touches.post,
        // leadership = Director + Polina (the intervention cost to drive → 0)
        leadershipTotal: touches.all.director + touches.all.polina,
        leadershipPerShot: shotCount > 0 ? round((touches.all.director + touches.all.polina) / shotCount, 2) : null,
        // post-cast leadership /shot — the sharp "factory not autonomous yet" leak (→ 0)
        postLeadershipPerShot: shotCount > 0 ? round((touches.post.director + touches.post.polina) / shotCount, 2) : null,
        // pre-cast leadership normalized per stage traversed
        preStages,
        prePerStage: round(touches.pre.total / preStages, 2),
        // secondary quality signal: post-cast rework (revision/reject) per shot
        postCastRework,
        reworkPerShot: shotCount > 0 ? round(postCastRework / shotCount, 2) : null,
      },
      // #4 — churn, normalized per shot alongside naive runs/shot
      churn: {
        trueChurn,
        truePerShot: trueChurn !== null && shotCount > 0 ? round(trueChurn / shotCount, 2) : null,
        naivePerShot: c.kpi1_runs_per_shot ?? 0,
        producerFirstPassRejectRate: disc?.producerFirstPassRejectRate ?? null,
        reworkRegens: disc?.reworkRegens ?? null,
      },
      autonomyPct: typeof metrics.autonomy_pct === 'number' ? metrics.autonomy_pct : null,
      agentFailures: c.agent_failures ?? 0,
      budget,
      criticVerdicts: (disc?.perCritic ?? [])
        .filter((pc) => pc.reviseCount > 0 || pc.verdict !== 'healthy')
        .map((pc) => ({ critic: pc.critic, verdict: pc.verdict, reviseCount: pc.reviseCount, repeatedPoints: pc.repeatedPoints })),
    });
  }

  rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return apiOk({
    generatedAt: new Date().toISOString(),
    directorTouchTarget: DIRECTOR_TOUCH_TARGET,
    episodes: rows,
    openProposals,
  });
});
