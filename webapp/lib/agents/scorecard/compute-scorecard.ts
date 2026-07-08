// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/scorecard/compute-scorecard.ts
// Episode Autonomy Scorecard — the deriver (read-only).
//
// Answers the real factory question: not "did the episode ship?" but "how much
// of it moved ITSELF (code) vs needed an intelligent agent (human OR AI-EP) to
// push?". Every intelligent touch is cost — human = Director time, AI-EP =
// Opus tokens — so both are driven toward zero by transferring muscle to code.
//
//   KPI-1  agent-runs / shot           (churn; self-moving ~1-2, E16 ~11)
//   KPI-2  code-able intelligent touches = manual_trigger (any actor, a dispatch
//          is code's job) + mechanical-gate approvals, split human vs AI-EP.
//   Floor  creative-gate approvals — judgement, not waste (AI-EP here = Mode-3
//          delegation that saves Director time). Tracked, not minimised.
//   Ledger chain_fired vs codeable → Autonomy%.
//
// Pure read: jobs + activity_events + gate_decision_log + STB shot count. No
// writes. Template: tools/episode-timing.ts. Reuses listStoryboardShots,
// excludedShotIdsFromEpisodeMeta, actorKind — never reinvents them.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/supabase/types.gen';
import { actorKind } from '@/lib/api/agent-names';
import { listStoryboardShots } from '@/lib/api/vgen-shot-helpers';
import {
  excludedShotIdsFromEpisodeMeta,
  DELETED_SHOT_MAX_SECONDS,
} from '@/lib/api/animatic-shotlist';

export type ScorecardPhase = 'snapshot' | 'published' | 'analytics';

export interface ScorecardRecord {
  episodeId: string;
  seriesId: string | null;
  phase: ScorecardPhase;

  shotCount: number;

  // KPI-1
  totalAgentRuns: number;
  kpi1RunsPerShot: number;

  // KPI-2 — code-able intelligent touches (cost to reduce)
  codeableTouchesTotal: number;
  codeableTouchesHuman: number;
  codeableTouchesAiEp: number;

  // Autonomy ledger
  chainFiredAdvances: number;
  totalAdvances: number;

  // Floor — judgement approvals (not waste)
  approvalsCreativeHuman: number;
  approvalsCreativeAi: number;

  // Reliability / churn / latency
  agentFailures: number;
  churnRefires: number;
  stuckShotsFinal: number;
  latencyFirstFinalCutS: number | null;

  runsByStage: Record<string, number>;
  failuresByStage: Record<string, number>;

  metrics: Record<string, unknown>;
}

type Sb = SupabaseClient<Database>;

const PAGE = 1000;

/**
 * Fetch ALL rows of a query, paging past PostgREST's 1000-row default cap. A big
 * episode's activity_events exceeds 1000; a single unpaged select silently
 * truncates (and, unordered, returns a DIFFERENT 1000 each call on a live
 * episode). `make()` must return a FRESH builder each call; we add a stable
 * order so concurrent inserts can't shift rows across a page boundary.
 */
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

const APPROVAL_TYPES = new Set([
  'approval_granted',
  'approval_revision',
  'approval_rejected',
]);

/**
 * Gate class of the asset an approval acted on, keyed by file_type prefix.
 * Mechanical = auto-pass candidate (a critic/check report). Everything the
 * Director actually judges (script, storyboard, refs, video, plan, music,
 * metadata, thumbnail, bibles) is creative. Mirrors GATE_CLASS intent
 * (lib/agents/gate-decision.ts) but keyed off the approved asset's file_type,
 * which is what the approval event carries in metadata.
 */
function approvalGateClass(fileType: string | null | undefined): 'mechanical' | 'creative' {
  if (typeof fileType === 'string' && fileType.startsWith('REV-')) return 'mechanical';
  return 'creative';
}

/** Bare SH token from any shot id / snapshot value, else null. */
function shotToken(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = v.match(/SH\d+/i);
  return m ? m[0].toUpperCase() : null;
}

export async function computeScorecard(
  supabase: Sb,
  episodeId: string,
  phase: ScorecardPhase,
): Promise<ScorecardRecord> {
  // 1. Episode ----------------------------------------------------------------
  const { data: ep, error: epErr } = await supabase
    .from('episodes')
    .select('id, series_id, created_at, metadata')
    .eq('id', episodeId)
    .maybeSingle();
  if (epErr) throw new Error(`episode fetch failed: ${epErr.message}`);
  if (!ep) throw new Error(`episode ${episodeId} not found`);
  const seriesId = (ep as { series_id: string | null }).series_id ?? null;
  const episodeCreatedAt = (ep as { created_at: string }).created_at;
  const episodeMeta = (ep as { metadata: unknown }).metadata;

  // 2. Canonical shot count (REUSE storyboard SSOT, not IMG-ref approximation) -
  const { data: stb } = await supabase
    .from('assets')
    .select('content')
    .eq('episode_id', episodeId)
    .eq('file_type', 'STB-storyboard')
    .eq('status', 'APPROVED')
    .order('version', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const excludedIds = excludedShotIdsFromEpisodeMeta(episodeMeta);
  const excludedTokens = new Set(
    [...excludedIds].map(shotToken).filter((t): t is string => t !== null),
  );
  const isExcluded = (shotId: string): boolean =>
    excludedIds.has(shotId) || excludedTokens.has(shotToken(shotId) ?? '');

  const stbContent = (stb as { content?: string | null } | null)?.content ?? '';
  const allShots = stbContent.trim() ? listStoryboardShots(stbContent) : [];
  const liveShots = allShots.filter(
    (s) =>
      !isExcluded(s.shotId) &&
      !(
        typeof s.durationSeconds === 'number' &&
        s.durationSeconds <= DELETED_SHOT_MAX_SECONDS
      ),
  );
  const shotCount = liveShots.length;
  const shotCountSource = stbContent.trim() ? 'storyboard' : 'none';

  // 3. Jobs — runs per stage, total, churn -----------------------------------
  const jobs = await pagedSelect<{
    agent_id: string;
    status: string;
    input_snapshot: unknown;
    created_at: string;
  }>(() =>
    supabase
      .from('jobs')
      .select('agent_id, status, input_snapshot, created_at')
      .eq('episode_id', episodeId),
  );

  const runsByStage: Record<string, number> = {};
  const perAgentShot: Record<string, number> = {};
  let jobsWithShot = 0;
  for (const j of jobs) {
    const agent = j.agent_id;
    runsByStage[agent] = (runsByStage[agent] ?? 0) + 1;
    const snap = j.input_snapshot as { shotId?: unknown; shot_id?: unknown } | null;
    const tok = shotToken(snap?.shotId) ?? shotToken(snap?.shot_id);
    if (tok) {
      jobsWithShot += 1;
      const key = `${agent}::${tok}`;
      perAgentShot[key] = (perAgentShot[key] ?? 0) + 1;
    }
  }
  const totalAgentRuns = jobs.length;
  const churnRefires = Object.values(perAgentShot).reduce(
    (acc, n) => acc + Math.max(0, n - 1),
    0,
  );
  const churnCoverage = totalAgentRuns > 0 ? jobsWithShot / totalAgentRuns : 0;

  // 4. Activity events — touches, approvals, failures -------------------------
  const acts = await pagedSelect<{
    event_type: string;
    actor: string | null;
    metadata: unknown;
  }>(() =>
    supabase
      .from('activity_events')
      .select('event_type, actor, metadata')
      .eq('episode_id', episodeId),
  );

  let manualHuman = 0;
  let manualAiEp = 0;
  let mechApprovalHuman = 0;
  let mechApprovalAiEp = 0;
  let approvalsCreativeHuman = 0;
  let approvalsCreativeAi = 0;
  const failuresByStage: Record<string, number> = {};

  for (const a of acts) {
    const kind = actorKind(a.actor);
    const et = a.event_type;
    if (et === 'manual_trigger') {
      if (kind === 'director') manualHuman += 1;
      else if (kind === 'ai-director') manualAiEp += 1;
      // other actors (system/agent) are code-fired, not intelligent touches
    } else if (APPROVAL_TYPES.has(et)) {
      const ft = (a.metadata as { file_type?: unknown } | null)?.file_type;
      const gc = approvalGateClass(typeof ft === 'string' ? ft : null);
      if (gc === 'mechanical') {
        if (kind === 'director') mechApprovalHuman += 1;
        else if (kind === 'ai-director') mechApprovalAiEp += 1;
      } else {
        if (kind === 'director') approvalsCreativeHuman += 1;
        else if (kind === 'ai-director') approvalsCreativeAi += 1;
      }
    } else if (et === 'agent_failed') {
      const stage = typeof a.actor === 'string' ? a.actor : 'unknown';
      failuresByStage[stage] = (failuresByStage[stage] ?? 0) + 1;
    }
  }

  const codeableTouchesHuman = manualHuman + mechApprovalHuman;
  const codeableTouchesAiEp = manualAiEp + mechApprovalAiEp;
  const codeableTouchesTotal = codeableTouchesHuman + codeableTouchesAiEp;
  const agentFailures = Object.values(failuresByStage).reduce((a, n) => a + n, 0);

  // chain-fired = agent runs the code dispatched itself (not manually triggered)
  const totalManualTriggers = manualHuman + manualAiEp;
  const totalAdvances = totalAgentRuns;
  const chainFiredAdvances = Math.max(0, totalAgentRuns - totalManualTriggers);
  const autonomyPct =
    totalAdvances > 0 ? chainFiredAdvances / totalAdvances : 0;

  // 5. Gate decision log — demanded gates + autonomy tally --------------------
  const gates = await pagedSelect<{
    decision: string;
    gate_class: string;
    decided_by: string;
    autonomous: boolean;
  }>(() =>
    supabase
      .from('gate_decision_log')
      .select('decision, gate_class, decided_by, autonomous')
      .eq('episode_id', episodeId),
  );
  const gateLogAvailable = gates.length > 0;
  let approvalsDemanded = 0;
  const gateByClass: Record<string, { human: number; factory: number }> = {};
  for (const g of gates) {
    if (g.decision === 'require_human') approvalsDemanded += 1;
    const c = String(g.gate_class);
    gateByClass[c] = gateByClass[c] ?? { human: 0, factory: 0 };
    if (g.decided_by === 'human') gateByClass[c].human += 1;
    else gateByClass[c].factory += 1;
  }

  // 6. Latency to first final cut — the moment the cut was first assembled.
  // Any status: a final_cut asset is authored DRAFT/REVIEW and never carries an
  // APPROVED status (the Director just views it), so keying off APPROVED would
  // always read n/a. This matches the auto-hook, which fires on the VID-final_cut
  // save regardless of status.
  const { data: finalCut } = await supabase
    .from('assets')
    .select('created_at')
    .eq('episode_id', episodeId)
    .eq('file_type', 'VID-final_cut')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  const firstFinalCutAt = (finalCut as { created_at?: string } | null)?.created_at ?? null;
  const latencyFirstFinalCutS = firstFinalCutAt
    ? Math.round(
        (new Date(firstFinalCutAt).getTime() - new Date(episodeCreatedAt).getTime()) / 1000,
      )
    : null;

  // 7. Stuck shots — live shots with no APPROVED VID-shot ---------------------
  const { data: vids } = await supabase
    .from('assets')
    .select('file_type, status')
    .eq('episode_id', episodeId)
    .like('file_type', 'VID-shot%')
    .eq('status', 'APPROVED');
  const approvedVidTokens = new Set(
    (vids ?? [])
      .map((v) => shotToken(v.file_type))
      .filter((t): t is string => t !== null),
  );
  const stuckShotsFinal = liveShots.filter(
    (s) => !approvedVidTokens.has(shotToken(s.shotId) ?? ''),
  ).length;

  // Per-stage runs/shot — the churn-sink localiser
  const runsPerShotByStage: Record<string, number> = {};
  if (shotCount > 0) {
    for (const [agent, n] of Object.entries(runsByStage)) {
      runsPerShotByStage[agent] = +(n / shotCount).toFixed(2);
    }
  }

  return {
    episodeId,
    seriesId,
    phase,
    shotCount,
    totalAgentRuns,
    kpi1RunsPerShot: shotCount > 0 ? +(totalAgentRuns / shotCount).toFixed(2) : 0,
    codeableTouchesTotal,
    codeableTouchesHuman,
    codeableTouchesAiEp,
    chainFiredAdvances,
    totalAdvances,
    approvalsCreativeHuman,
    approvalsCreativeAi,
    agentFailures,
    churnRefires,
    stuckShotsFinal,
    latencyFirstFinalCutS,
    runsByStage,
    failuresByStage,
    metrics: {
      shot_count_source: shotCountSource,
      // Completeness flag — autonomy% / touches are only comparable for episodes
      // that actually reached a final cut. A barely-run episode reads a fake
      // "100% autonomy" from near-zero activity; this flag lets the trend exclude
      // it. reached_final_cut ⇔ a VID-final_cut asset exists.
      reached_final_cut: firstFinalCutAt !== null,
      autonomy_pct: +(autonomyPct * 100).toFixed(1),
      manual_triggers: { human: manualHuman, ai_ep: manualAiEp },
      mechanical_approvals: { human: mechApprovalHuman, ai_ep: mechApprovalAiEp },
      approvals_demanded: approvalsDemanded,
      gate_log_available: gateLogAvailable,
      gate_autonomy_by_class: gateByClass,
      churn_coverage: +(churnCoverage * 100).toFixed(1),
      runs_per_shot_by_stage: runsPerShotByStage,
    },
  };
}
