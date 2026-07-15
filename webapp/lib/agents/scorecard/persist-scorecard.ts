// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/scorecard/persist-scorecard.ts
// Persist + render for the Episode Autonomy Scorecard.
//
//   persistScorecard  → append one row to episode_scorecard (SSOT), returns id.
//   renderScorecard   → pure markdown from a record (the human face).
//   ScorecardRenderSink / assetRowSink → pluggable render target. assetRowSink
//     writes the .md as a REV-scorecard asset row (webapp stores episode text as
//     asset rows, not disk files). A future diskFileSink would swap here with no
//     change to the SSOT — the structured row is persisted before the sink runs.
//   refreshScorecard  → the one orchestrator (compute→persist→render→sink) that
//     the Inngest subscriber and the backfill script both call.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/supabase/types.gen';
import { logEvent } from '@/lib/api/events';
import type { ServerSupabaseClient } from '@/lib/api/auth';
import {
  computeScorecard,
  type ScorecardRecord,
  type ScorecardPhase,
} from './compute-scorecard';
import type {
  CriticDiscriminatorResult,
  CriticProposal,
} from './critic-discriminator';

type Sb = SupabaseClient<Database>;

/**
 * Escalate the discriminator's IRREVERSIBLE calibration proposals (producer
 * training / creative change) to the Director Inbox as `rule_proposal` events —
 * ONE per (episode, critic, signature), idempotent across re-runs.
 *
 * The Director's trap (2026-07-14): self-improvement must not become a 7th human
 * touch. So `auto_safe` proposals (reversible rubric wording / prompt / tier)
 * are NOT escalated — they live in scorecard.metrics for the Factory page and a
 * future safe auto-applier; only `escalate`-zone items ping the Director. Gated
 * to the post-distribution `published` phase so backfills / snapshots stay quiet.
 */
async function escalateCalibrationProposals(
  supabase: Sb,
  episodeId: string,
  proposals: CriticProposal[],
): Promise<void> {
  const escalate = proposals.filter((p) => p.zone === 'escalate');
  if (escalate.length === 0) return;

  // Idempotency — skip signatures already open for this episode.
  const { data: existing } = await supabase
    .from('activity_events')
    .select('metadata')
    .eq('episode_id', episodeId)
    .eq('event_type', 'rule_proposal');
  const seen = new Set(
    (existing ?? [])
      .map((e) => (e.metadata as { discriminator_signature?: unknown } | null)?.discriminator_signature)
      .filter((s): s is string => typeof s === 'string'),
  );

  for (const p of escalate) {
    const signature = `${episodeId}:${p.critic}:${p.action}`;
    if (seen.has(signature)) continue;
    await logEvent(supabase as unknown as ServerSupabaseClient, {
      event_type: 'rule_proposal',
      severity: 'warning',
      title: `Calibration proposal — ${p.critic}: ${p.target}`,
      description: `${p.action}. Rationale: ${p.rationale}`,
      episode_id: episodeId,
      // actor null = system-proposed; auto_react=false so it escalates to the
      // Director (a training change is his call) without spending a Polina wake.
      actor: null,
      metadata: {
        source: 'critic_discriminator',
        discriminator_signature: signature,
        critic: p.critic,
        zone: p.zone,
        target: p.target,
        auto_react: false,
      },
    });
  }
}

/** Append one scorecard row (SSOT). Returns the new row id. */
export async function persistScorecard(
  supabase: Sb,
  rec: ScorecardRecord,
): Promise<string> {
  const { data, error } = await supabase
    .from('episode_scorecard')
    .insert({
      episode_id: rec.episodeId,
      series_id: rec.seriesId,
      phase: rec.phase,
      shot_count: rec.shotCount,
      total_agent_runs: rec.totalAgentRuns,
      kpi1_runs_per_shot: rec.kpi1RunsPerShot,
      codeable_touches_total: rec.codeableTouchesTotal,
      codeable_touches_human: rec.codeableTouchesHuman,
      codeable_touches_ai_ep: rec.codeableTouchesAiEp,
      chain_fired_advances: rec.chainFiredAdvances,
      total_advances: rec.totalAdvances,
      approvals_creative_human: rec.approvalsCreativeHuman,
      approvals_creative_ai: rec.approvalsCreativeAi,
      agent_failures: rec.agentFailures,
      churn_refires: rec.churnRefires,
      stuck_shots_final: rec.stuckShotsFinal,
      latency_first_final_cut_s: rec.latencyFirstFinalCutS,
      runs_by_stage: rec.runsByStage,
      failures_by_stage: rec.failuresByStage,
      metrics: rec.metrics as Database['public']['Tables']['episode_scorecard']['Insert']['metrics'],
    })
    .select('id')
    .single();
  if (error) throw new Error(`episode_scorecard insert failed: ${error.message}`);
  return (data as { id: string }).id;
}

/** Pure markdown render of a scorecard record. Never parsed back. */
export function renderScorecard(rec: ScorecardRecord, episodeCode: string): string {
  const m = rec.metrics as Record<string, unknown>;
  const autonomyPct = m.autonomy_pct ?? '?';
  const manual = m.manual_triggers as { human?: number; ai_ep?: number } | undefined;
  const mech = m.mechanical_approvals as { human?: number; ai_ep?: number } | undefined;
  const rps = (m.runs_per_shot_by_stage as Record<string, number>) ?? {};
  const latency =
    rec.latencyFirstFinalCutS === null
      ? 'n/a'
      : `${(rec.latencyFirstFinalCutS / 3600).toFixed(1)}h`;

  const sinkRows = Object.entries(rps)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `| ${k} | ${v} | ${rec.runsByStage[k] ?? 0} |`)
    .join('\n');

  return `# Autonomy Scorecard — ${episodeCode}

> Generated render of episode_scorecard (phase: **${rec.phase}**). Do not edit — SSOT is the DB row.
> The factory question is not "did it ship?" but "how much moved itself vs needed a hand".

**Shots (canonical):** ${rec.shotCount} · source \`${m.shot_count_source ?? '?'}\`

## KPI-1 — machine churn
- **runs / shot: ${rec.kpi1RunsPerShot}** (${rec.totalAgentRuns} runs) — self-moving target ~1-2

## KPI-2 — code-able intelligent touches (cost → drive to 0)
- **total: ${rec.codeableTouchesTotal}**
  - human (Director time): **${rec.codeableTouchesHuman}**
  - AI-EP (Opus tokens): **${rec.codeableTouchesAiEp}**
- manual_trigger — human ${manual?.human ?? 0} / AI-EP ${manual?.ai_ep ?? 0}
- mechanical-gate approvals — human ${mech?.human ?? 0} / AI-EP ${mech?.ai_ep ?? 0}

## Autonomy ledger
- chain-fired (code): **${rec.chainFiredAdvances} / ${rec.totalAdvances}** → **Autonomy ${autonomyPct}%**

## Floor — creative-gate approvals (judgement, not waste)
- human / AI-EP: ${rec.approvalsCreativeHuman} / ${rec.approvalsCreativeAi}

## Reliability / latency
- agent failures: **${rec.agentFailures}** ${JSON.stringify(rec.failuresByStage)}
- churn re-fires: **${rec.churnRefires}** (coverage ${m.churn_coverage ?? '?'}%)
- stuck shots at final: **${rec.stuckShotsFinal}**
- latency → first final cut: **${latency}**

## Churn-sink localiser — runs/shot by stage
| stage | runs/shot | runs |
|---|---|---|
${sinkRows}

## Gate decision log
- demanded (require_human): ${m.approvals_demanded ?? '?'} (log available: ${m.gate_log_available ?? '?'})
- by class: \`${JSON.stringify(m.gate_autonomy_by_class ?? {})}\`
`;
}

// ── Render sink ───────────────────────────────────────────────────────────────

export interface ScorecardRenderSink {
  write(args: {
    supabase: Sb;
    episodeId: string;
    seriesId: string | null;
    episodeCode: string;
    phase: ScorecardPhase;
    scorecardRowId: string;
    rec: ScorecardRecord;
    markdown: string;
  }): Promise<void>;
}

/**
 * BUILD NOW — the .md lives as a REV-scorecard asset row (webapp stores episode
 * text artifacts as asset rows, not disk files). Mirrors the EXEC-CREAD
 * direct-insert (runner.ts:948) — per-episode auto-versioning, DRAFT status.
 */
export const assetRowSink: ScorecardRenderSink = {
  async write({ supabase, episodeId, episodeCode, phase, scorecardRowId, rec, markdown }) {
    const { data: existing } = await supabase
      .from('assets')
      .select('version')
      .eq('episode_id', episodeId)
      .eq('file_type', 'REV-scorecard');
    const maxV = (existing ?? []).reduce((mx, x) => Math.max(mx, x.version ?? 0), 0);
    const nextV = maxV + 1;
    const vStr = `v${String(nextV).padStart(2, '0')}`;
    const filename = `${episodeCode}-REV-scorecard-${phase}-${vStr}-DRAFT.md`;

    // assets_series_or_episode_check: an asset is XOR series- or episode-scoped.
    // This is episode-scoped → episode_id set, series_id null (mirrors CREAD).
    const { error } = await supabase.from('assets').insert({
      episode_id: episodeId,
      series_id: null,
      agent_id: 'EXEC-ORCH',
      file_type: 'REV-scorecard',
      filename,
      description: `Autonomy Scorecard (${phase}) — KPI-1 ${rec.kpi1RunsPerShot} runs/shot · KPI-2 ${rec.codeableTouchesTotal} touches`,
      status: 'DRAFT',
      version: nextV,
      content: markdown,
      metadata: {
        phase,
        scorecard_row_id: scorecardRowId,
        kpi1_runs_per_shot: rec.kpi1RunsPerShot,
        codeable_touches_total: rec.codeableTouchesTotal,
        autonomy_pct: (rec.metrics as Record<string, unknown>).autonomy_pct ?? null,
      },
    } as never);
    if (error) throw new Error(`REV-scorecard asset insert failed: ${error.message}`);
  },
};

// diskFileSink — NOTED ALTERNATIVE, NOT built. Would resolve <project_root>/e{NN}/
// reports/ from episode_code (readStorageConfig) and fs.writeFile the same
// markdown. SSOT row is already persisted, so switching sinks changes only where
// the human render lands.

/** The one orchestrator: compute → persist → render → sink. */
export async function refreshScorecard(
  supabase: Sb,
  episodeId: string,
  phase: ScorecardPhase,
  sink: ScorecardRenderSink = assetRowSink,
): Promise<{ scorecardRowId: string; rec: ScorecardRecord }> {
  const { data: ep, error: epErr } = await supabase
    .from('episodes')
    .select('episode_code, series_id')
    .eq('id', episodeId)
    .maybeSingle();
  if (epErr) throw new Error(`episode fetch failed: ${epErr.message}`);
  const episodeCode = (ep as { episode_code?: string } | null)?.episode_code ?? 'SS-UNKNOWN';
  const seriesId = (ep as { series_id?: string | null } | null)?.series_id ?? null;

  const rec = await computeScorecard(supabase, episodeId, phase);
  const scorecardRowId = await persistScorecard(supabase, rec);
  const markdown = renderScorecard(rec, episodeCode);
  await sink.write({
    supabase,
    episodeId,
    seriesId,
    episodeCode,
    phase,
    scorecardRowId,
    rec,
    markdown,
  });

  // Slow-loop escalation — only at post-distribution (published) so snapshots /
  // backfills don't flood the Inbox. Best-effort: a failed escalation must never
  // corrupt the already-persisted scorecard.
  if (phase === 'published') {
    const disc = (rec.metrics as { critic_discriminator?: CriticDiscriminatorResult })
      .critic_discriminator;
    if (disc?.proposals?.length) {
      try {
        await escalateCalibrationProposals(supabase, episodeId, disc.proposals);
      } catch {
        /* escalation is advisory — never fail the scorecard on it */
      }
    }
  }

  return { scorecardRowId, rec };
}
