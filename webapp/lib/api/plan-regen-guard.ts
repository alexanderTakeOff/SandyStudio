// ──────────────────────────────────────────────────────────────────────────────
// lib/api/plan-regen-guard.ts
// ONE chokepoint for every plan-driven re-fire (image OR video). Two guards in
// a single DB round-trip:
//
//   1. IN-FLIGHT (all principals): a QUEUED/RUNNING job already holds this plan
//      → refuse a duplicate concurrent dispatch. This is the 2026-06-12 E08
//      guard, previously inlined only in /trigger; consolidated here so the
//      sibling /regenerate-image-from-plan route (which had NO protection at
//      all) shares the exact same check.
//
//   2. RUNAWAY-CAP (autonomous only): EXEC-DIR-AI / Polina auto-recovery has
//      already produced `cap` attempts for this plan → HALT and escalate to the
//      human Director. The human Director is NEVER capped — she IS the
//      escalation target (critic_revision_cap doctrine: 2-3 attempts, then stop).
//
// Root incident: E10 SH10 anchor regenerated 6× by Polina's uncapped "Mode 4
// auto-recovery" loop on an advisory visual-gate flag (~4 min + image cost each,
// no escalation). The session hypothesis blamed factory.ts Mode-4 auto-chain;
// the activity-event trail proved the re-fires were Polina's manual_trigger
// recoveries via /regenerate-image-from-plan, which is exactly where this guard
// now bites.
// ──────────────────────────────────────────────────────────────────────────────

import type { DirectorPrincipal, ServerSupabaseClient } from './auth';
import { ConflictError } from './errors';
import { logEvent } from './events';
import { planRegenCap } from '@/lib/agents/chain-flags';

/**
 * Agents whose jobs count toward the per-shot runaway cap AND get the atomic
 * dispatch claim (dedup): the image executor (money — gpt-image), the video
 * executor (money — Seedance/Veo), and the plan regenerator (wall-clock + loop
 * fuel). EXEC-VGEN added 2026-07-04: the Director-mode plan-critic-autofire hook
 * makes the video fan-out self-drive, so VGEN needs the same race-free claim
 * EXEC-EREF already has (otherwise only the blind `planAlreadyExecuted` guards
 * it during the ~min gen window). Cap (SHOT_REGEN_CAP, default high) is generous
 * — normal 1-2 renders/shot never approach it. EPREV/VPREV (critics, free tier)
 * are deliberately excluded — cheap and neutralised at the source.
 */
export const SHOT_REGEN_AGENT_IDS = ['EXEC-EREF', 'EXEC-EREF-DESIGNER', 'EXEC-VGEN'] as const;

/**
 * Agents that AUTHOR a shot plan. Counted separately from SHOT_REGEN_AGENT_IDS
 * against PLAN_VERSION_CAP — see the note there. These burn wall-clock and LLM
 * spend rather than render spend, and an authoring loop is what produced E30's
 * 17 plan versions on one shot.
 */
export const PLAN_AUTHOR_AGENT_IDS = ['EXEC-VANIM'] as const;

/**
 * How many `SPC-shot_plan` versions already exist for this shot. Counts asset
 * rows (the version series is per-shot because file_type carries the shot id),
 * so the number spans every authoring path — reconciler, Director REVISE,
 * Polina's regenerateShotPlan, VGEN fan-out — and survives a queue reset.
 *
 * INVALIDATED versions still count: they are evidence of the loop, and
 * excluding them would let a re-authoring cycle that invalidates its own
 * predecessor run forever.
 */
export async function countShotPlanVersions(
  supabase: ServerSupabaseClient,
  episodeId: string,
  shotId: string,
): Promise<{ count: number; readError: boolean }> {
  const { data, error } = await supabase
    .from('assets')
    .select('id,metadata')
    .eq('episode_id', episodeId)
    .or('file_type.eq.SPC-shot_plan,file_type.like.SPC-shot_plan-%');
  if (error) return { count: 0, readError: true };
  const rows = (data ?? []) as Array<{ metadata?: unknown }>;
  const count = rows.filter((r) => {
    const sid = (r.metadata as { shot_id?: unknown } | null)?.shot_id;
    return typeof sid === 'string' && sid === shotId;
  }).length;
  return { count, readError: false };
}

export interface PlanRegenGuardArgs {
  supabase: ServerSupabaseClient;
  episodeId: string;
  /** Agent that consumes the plan, e.g. 'EXEC-EREF' (image) or 'EXEC-VGEN' (video). */
  agentId: string;
  planAssetId: string;
  /** From requireDirector(): 'director' bypasses the cap, 'exec_dir_ai' is capped. */
  principal: DirectorPrincipal;
  /** Optional shot id for a readable audit/error message. */
  shotId?: string;
}

/**
 * Throws ConflictError (HTTP 409) when a plan-driven re-fire must be refused.
 * Call it right before `inngest.send(...execute-from-plan / single-shot...)`.
 */
export async function assertPlanRegenWithinCap(
  args: PlanRegenGuardArgs,
): Promise<void> {
  const { supabase, episodeId, agentId, planAssetId, principal, shotId } = args;
  const label = shotId ?? planAssetId;

  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('id,status,started_at')
    .eq('episode_id', episodeId)
    .eq('agent_id', agentId)
    .in('status', ['QUEUED', 'RUNNING', 'COMPLETED'])
    .eq('input_snapshot->>planAssetId' as never, planAssetId);

  // Fail CLOSED on a read error: failing open would re-open the runaway loop.
  // One blocked re-fire on a transient error is recoverable; an uncapped loop
  // burning render budget is not.
  if (error) {
    throw new ConflictError(
      `Could not verify regeneration history for plan ${label} (${error.message}). ` +
        `Not dispatching — retry shortly.`,
    );
  }

  const rows = jobs ?? [];

  // Guard 1 — in-flight (every principal, incl. human double-click).
  const inFlight = rows.find(
    (j) => j.status === 'QUEUED' || j.status === 'RUNNING',
  );
  if (inFlight) {
    throw new ConflictError(
      `${agentId} is already running for plan ${label} (job ${inFlight.id}, since ` +
        `${inFlight.started_at}). Not dispatching a duplicate — wait for the run ` +
        `to finish or fail.`,
    );
  }

  // Guard 2 — runaway cap (autonomous only). The human Director is the
  // escalation target, so she is never blocked here.
  if (principal === 'director') return;

  const cap = planRegenCap();
  if (rows.length >= cap) {
    // Audit-only row (event_type not in the actionable whitelist → no
    // pa/notify-needed, so this does NOT itself feed Polina's auto-react loop).
    await logEvent(supabase, {
      event_type: 'regen_cap_halt',
      severity: 'warning',
      title: `Regen cap reached — ${agentId} (${label})`,
      description:
        `${rows.length} autonomous attempts already made for this plan ` +
        `(cap ${cap}). Auto-recovery HALTED; needs the human Director.`,
      actor: 'exec-dir-ai',
      episode_id: episodeId,
      asset_id: planAssetId,
      metadata: {
        agent: agentId,
        shot_id: shotId ?? null,
        plan_asset_id: planAssetId,
        attempts: rows.length,
        cap,
        reason: 'REGEN_CAP_REACHED',
      },
    });
    throw new ConflictError(
      `Regeneration cap reached for ${label}: ${rows.length} autonomous attempts ` +
        `(cap ${cap}). HALT — stop auto-recovering and ask the human Director ` +
        `whether to change the Plan, accept the current frame, or override.`,
    );
  }
}

export interface ShotAttemptCount {
  /** image-gen + plan-regen jobs already produced for this shot, all plan versions. */
  count: number;
  /** True when the jobs read failed — caller MUST fail closed (treat as over-cap). */
  readError: boolean;
}

/**
 * Count AUTONOMOUS attempts for ONE shot ACROSS ALL plan versions — the
 * shot-level runaway cap's input (E10 SH23, 2026-06-15). Counts image-gen
 * (EXEC-EREF) + plan-regen (EXEC-EREF-DESIGNER) jobs keyed on
 * `input_snapshot->>shotId`, which is stable because factory writes the full
 * event payload as input_snapshot and both events carry `shotId`.
 *
 * Statuses QUEUED/RUNNING/COMPLETED only — FAILED jobs are excluded so a
 * transient provider failure (e.g. a billing-limit 400) does not permanently
 * lock the shot out of recovery. Mirrors `assertPlanRegenWithinCap` semantics.
 *
 * Returns `readError: true` (not a throw) so the factory pre-run hook can fail
 * CLOSED — HALT+escalate — without making Inngest retry the whole function.
 */
export async function countShotAutonomousAttempts(
  supabase: ServerSupabaseClient,
  episodeId: string,
  shotId: string,
): Promise<ShotAttemptCount> {
  const { count, error } = await supabase
    .from('jobs')
    .select('id', { count: 'exact', head: true })
    .eq('episode_id', episodeId)
    .in('agent_id', SHOT_REGEN_AGENT_IDS as unknown as string[])
    .in('status', ['QUEUED', 'RUNNING', 'COMPLETED'])
    .eq('input_snapshot->>shotId' as never, shotId);

  if (error) {
    return { count: 0, readError: true };
  }
  return { count: count ?? 0, readError: false };
}
