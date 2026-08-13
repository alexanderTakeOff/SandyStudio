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

/**
 * ГЕЙТ КНОПКИ: исполняется САМЫЙ СВЕЖИЙ план, и только машиночитаемый.
 *
 * Директор, 12.08: «кнопка должна работать правильно». Инцидент E07/SH05: панель
 * послала исполнителя на план **v01**, тогда как живой была **v02** с правками
 * Директора (три строки, оранжевый, тусклый планктон). Агент упал на разборе — и
 * это была УДАЧА: распарсив, он отрендерил бы отменённую версию за деньги, и
 * никто бы не заметил подмены.
 *
 * Две проверки, обе до траты и до запуска агента:
 *
 *  1. **Свежесть.** Существует более новая версия плана этого шота → отказ с
 *     указанием, какую исполнять. Проверка жила ТОЛЬКО в
 *     `/regenerate-image-from-plan`, а `/trigger` (та самая кнопка) принимал
 *     `planAssetId` из тела запроса и исполнял что дали — два входа к одному
 *     исполнителю с разными правилами. Теперь правило одно и живёт здесь.
 *
 *  2. **Исполнимость.** В новой парадигме план пишет УМ — прозой, с разбором и
 *     промптом в текстовом блоке, потому что исполняет его сам через `gen-frame`.
 *     Старый конвейерный исполнитель ждёт в том же `file_type` JSON-контракт.
 *     Два читателя одного типа изделия, договора между ними нет. Пока договор не
 *     написан, кнопка обязана отказывать ВНЯТНО («это план для ума»), а не
 *     ронять агента сообщением про code block.
 */
export async function assertPlanIsFreshAndExecutable(args: {
  supabase: ServerSupabaseClient;
  episodeId: string;
  planAssetId: string;
  shotId?: string;
}): Promise<void> {
  const { supabase, episodeId, planAssetId, shotId } = args;

  if (shotId) {
    const { data: planRows } = await supabase
      .from('assets')
      .select('id,version,status,file_type,metadata')
      .eq('episode_id', episodeId)
      .like('file_type', 'SPC-ref_plan%');
    const latest = ((planRows ?? []) as Array<{
      id: string;
      version?: number;
      status?: string;
      file_type?: string;
      metadata?: unknown;
    }>)
      .filter((r) => r.status !== 'INVALIDATED')
      .filter(
        (r) =>
          (r.metadata as { shot_id?: string } | null)?.shot_id === shotId ||
          (r.file_type ?? '') === `SPC-ref_plan-${shotId}`,
      )
      .sort((a, b) => (b.version ?? 0) - (a.version ?? 0))[0];
    if (latest && latest.id !== planAssetId) {
      throw new ConflictError(
        `План ${planAssetId} вытеснен: у шота ${shotId} есть более свежий — ${latest.id} ` +
          `(v${latest.version ?? '?'}, ${latest.status}). Исполнять надо его: старая версия ` +
          `не содержит правок Директора и отрендерит отменённое.`,
      );
    }
  }

  const { data: plan } = await supabase
    .from('assets')
    .select('content,file_type')
    .eq('id', planAssetId)
    .maybeSingle();
  const content = (plan as { content?: string | null } | null)?.content ?? '';
  // Тот же разбор, что у исполнителя (`parseLastJsonBlock`), но здесь он решает
  // не «как рендерить», а «применима ли кнопка вообще».
  const hasJsonBlock = /```json\s*[\s\S]*?```/i.test(content) || /```\s*\{[\s\S]*?```/.test(content);
  if (!hasJsonBlock) {
    throw new ConflictError(
      `План ${planAssetId} написан как ДОКУМЕНТ для ума (без JSON-контракта), а кнопка ` +
        `запускает конвейерного исполнителя, который читает только JSON. Исполнять этот план ` +
        `должен ум — прямым вызовом gen-frame. Кнопка применима к планам, рождённым агентом-дизайнером.`,
    );
  }
}

export interface BillingLockState {
  /** True when a provider billing wall is standing and uncleared. */
  locked: boolean;
  /** True when the read failed — caller MUST fail closed (treat as locked). */
  readError: boolean;
  /** When the wall was last hit (ISO), for the escalation message. */
  since: string | null;
  /** The provider's own words, truncated, for the escalation message. */
  message: string | null;
}

/**
 * Is a PERSISTENT provider billing wall (out of funds / over quota) currently
 * standing for this episode?
 *
 * Why this exists (E30, 2026-07-18): the two billing guards we already had are
 * both PER-RUN — `exec-vgen` wraps the fal 403 as NonRetriableError so Inngest
 * stops retrying, and `factory` flags the event so Polina is not woken. Neither
 * stops a NEW dispatch. The video fan-out re-fired each shot anyway, so one
 * exhausted fal balance produced 120 identical 403 failures across ~10 shots in
 * a 37-minute window, each one a fresh run against a wall that could not move.
 * The missing piece was never detection — it was a breaker at the dispatch door.
 *
 * Self-clearing by construction, so there is no reset flag to forget: the wall
 * counts as cleared as soon as ANY job for the episode completes after it. The
 * human Director is never blocked (same exemption as the regen caps), so her
 * re-trigger after a top-up is what produces that completion.
 */
export async function hasUnclearedBillingLock(
  supabase: ServerSupabaseClient,
  episodeId: string,
): Promise<BillingLockState> {
  const clear: BillingLockState = {
    locked: false,
    readError: false,
    since: null,
    message: null,
  };

  const { data: lockRows, error: lockErr } = await supabase
    .from('activity_events')
    .select('created_at,description')
    .eq('episode_id', episodeId)
    .eq('event_type', 'agent_failed')
    .eq('metadata->>reason' as never, 'PROVIDER_BILLING_LOCK')
    .order('created_at', { ascending: false })
    .limit(1);

  // Fail CLOSED: an unverifiable billing state must not open the money door.
  if (lockErr) return { ...clear, readError: true };

  const lock = (lockRows ?? [])[0] as
    | { created_at?: string | null; description?: string | null }
    | undefined;
  if (!lock?.created_at) return clear;

  const { data: okRows, error: okErr } = await supabase
    .from('jobs')
    .select('created_at')
    .eq('episode_id', episodeId)
    .eq('status', 'COMPLETED')
    .order('created_at', { ascending: false })
    .limit(1);
  if (okErr) return { ...clear, readError: true };

  const lastOk = (okRows ?? [])[0] as { created_at?: string | null } | undefined;
  const cleared = Boolean(lastOk?.created_at && lastOk.created_at > lock.created_at);

  return {
    locked: !cleared,
    readError: false,
    since: lock.created_at,
    message: (lock.description ?? '').slice(0, 200) || null,
  };
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
