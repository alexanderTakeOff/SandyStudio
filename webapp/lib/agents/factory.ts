// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/factory.ts
// createAgentInngestFunction — emits an Inngest function with the canonical
// 6-step shape from phase-4-jiggly-wave.md §3.
//
// Why a factory:
//   - 11 production agents share the same shape (insert → load+validate →
//     execute → record-cost → save-and-complete → fan-out)
//   - Per-agent variations are small: agent id, event name, fan-out target,
//     extra event-data fields (shotId, section, collectionPoint)
//   - Without a factory, each function file would be ~100 lines of paste
//   - With it, each function file is ~30 lines declaring just the variations
//
// Specialized cases (EXEC-PUB governance, EXEC-EDIT per-shot fan-out, the
// schedule-analytics cron) bypass this factory and write the function inline.
// ──────────────────────────────────────────────────────────────────────────────

import { NonRetriableError } from 'inngest';

import { inngest } from '../inngest/client';
import { concurrencyFor, type AgentConcurrencyId } from '../inngest/concurrency';
import { recordCost } from '../budget';
import { agentDisplayName } from '../api/agent-names';
import { validateAgentInputs } from './gate';
import {
  closeOpenJobsForRun,
  insertJobRow,
  loadAgentInputs,
  markJobCompleted,
  markJobFailed,
  runAgent,
  saveAgentOutput,
  type RunAgentArgs,
} from './runner';
import type { AgentResult } from './types';
import { resolveModelId } from './registry';
import { createSupabaseServiceRoleClient } from '../supabase/server';
import { logEvent } from '../api/events';
import { raiseBlockerOnce } from '../api/blocker-escalation';
import { isReconcilerArmed } from './production-plan';
import { shotRegenCap, planVersionCap } from './chain-flags';
import {
  countShotAutonomousAttempts,
  countShotPlanVersions,
  hasUnclearedBillingLock,
  SHOT_REGEN_AGENT_IDS,
  PLAN_AUTHOR_AGENT_IDS,
} from '../api/plan-regen-guard';
import {
  claimDispatchIntent,
  computeInputHash,
  markDispatchIntent,
  type DispatchKey,
} from './dispatch-intent';
import {
  isPersistentBillingFailure,
  isPlanAnchorStaleFailure,
  isTerminalAgentFailure,
} from './provider-failure';
import { decideGate, recordGateDecision } from './gate-decision';
import { resolveProvider, type ContractName, type ResolvedProvider } from './provider-resolver';
import type { AgentId } from './types';
// The shared rich fan-out router — the SAME one the Director-driven approve
// route uses. In the factory it's called by the plan-critic autofire (Modes 2/3,
// PASS → execute-from-plan); the approve route owns the rest of the forward
// routing. Phase 4+: the reconciler becomes its sole caller.
import { computeNextEvents, type AssetForChain } from './next-events';
// Single-approved-per-slot helper, shared with the Director approve route: demote
// the prior APPROVED sibling of a slot before occupying it, so regenerating an
// already-approved anchor/plan doesn't collide with the per-slot unique index
// (assets_one_approved_per_anchor / _ref_plan).
import {
  resolveSlotDescriptor,
  demoteSiblingApproved,
  type AssetForSlot,
} from '../api/single-approved';

// Maps an agent to the provider contract it consumes. Agents not listed here
// don't go through the resolver (text-only agents → Anthropic / mock LLM).
const CONTRACT_BY_AGENT: Partial<Record<AgentId, ContractName>> = {
  'EXEC-THUMB': 'image',
  'EXEC-VGEN': 'character_video',
  'EXEC-EDIT': 'video',
  'EXEC-MGEN': 'music',
  'EXEC-PUB': 'publish',
};

/**
 * Rough p50 runtime estimates per agent — surfaced in activity feed so Director
 * can tell "still working, ~30s left" vs "stuck". Tune from real telemetry over
 * time. Conservative — better to under-promise.
 */
const EXPECTED_RUNTIME_SECONDS: Partial<Record<AgentId, number>> = {
  'EXEC-SW':    70,   // Sonnet ~6k output tokens
  'EXEC-SREV':  50,   // Sonnet ~3k output tokens
  'EXEC-SB':    140,  // Sonnet ~8k output tokens, 16-shot JSON
  'EXEC-CREAD': 60,   // C1-Gate — Sonnet readability verdict, short output
  'EXEC-WCHK':  60,   // Sonnet ~3k output tokens (Continuity)
  'EXEC-EREF':  180,  // gpt-image-1 fan-out (up to 6 images × 25-40s)
  'EXEC-EREF-DESIGNER': 30, // Sonnet 4.6 Plan generation per shot (~6-12s typical)
  'EXEC-EPREV': 15, // Day 4 — Designer's Critic, Sonnet 4.6, short output (~3-8s)
  'EXEC-VANIM': 35, // Day 6-7 — Animator, Sonnet 4.6 Plan author per shot
  'EXEC-VPREV': 15, // Day 8 — Animator's Critic
  'EXEC-EDIT':  30,   // slideshow assembly (no LLM, just JSON build)
  'EXEC-VGEN':  150,  // Veo per-shot
  'EXEC-MGEN':  60,   // Music gen (mock for now)
  'EXEC-STITCH': 60,  // Local ffmpeg concat: 13 shots × ~4s + music = ~60s
  'EXEC-COPY':  30,   // Haiku, short output
  'EXEC-THUMB': 45,   // gpt-image-1 single
  'EXEC-PUB':   20,   // YouTube upload mock
  'EXEC-ANAL':  10,
};

/** Activity-feed asset bucket hint so per-stage filter works while job is running. */
const FILE_TYPE_HINT_BY_AGENT: Partial<Record<AgentId, string>> = {
  'EXEC-SW':    'SCR-script',
  'EXEC-SREV':  'REV-script_qa',
  'EXEC-SB':    'STB-storyboard',
  'EXEC-CREAD': 'REV-readability',
  'EXEC-WCHK':  'REV-world_check',
  'EXEC-EREF':  'IMG-episode_ref',
  'EXEC-EREF-DESIGNER': 'SPC-ref_plan',
  'EXEC-EPREV':         'REV-ref_plan',
  'EXEC-VANIM':         'SPC-shot_plan',
  'EXEC-VPREV':         'REV-shot_plan',
  'EXEC-EDIT':  'VID-animatic',
  'EXEC-VGEN':  'VID-shot',
  'EXEC-MGEN':  'AUD-music',
  'EXEC-STITCH': 'VID-final_cut',
  'EXEC-COPY':  'SPC-metadata',
  'EXEC-THUMB': 'IMG-thumbnail',
  'EXEC-PUB':   'REV-publish_log',
  'EXEC-ANAL':  'REV-analytics',
};

/** Spec passed to createAgentInngestFunction. */
export interface AgentFunctionSpec<EventName extends string = string> {
  /** Inngest function id (kebab-case). */
  id: string;
  /** Display name for Inngest UI. */
  name: string;
  /** AgentId from registry. */
  agentId: AgentId;
  /** Concurrency lookup key (lowercase agent code). */
  concurrencyId: AgentConcurrencyId;
  /** Event this function listens to. */
  eventName: EventName;
  /** Operation label written to budget_log. */
  operation: string;
  /** Inngest retry count. Default 2. */
  retries?: number;
  /**
   * Optional per-function total wall-clock cap (Inngest `timeouts.finish`,
   * e.g. "10m"). Belt against a run whose SDK roundtrip hangs and never
   * returns — Inngest cancels the run and RELEASES its concurrency slot, so a
   * single wedged run can't starve the whole episode-keyed partition (E17
   * critic stall 2026-07-07). Set ONLY on short pure-LLM functions (critics);
   * do NOT set on long paid gens (EREF/VGEN) that legitimately run minutes.
   */
  finishTimeout?: string;
  /**
   * Optional next-event emitter. Receives the saved asset id, original
   * event data, AND the runAgent result (so callbacks can read metadata
   * like shot counts). Returns one event, an array of events for fan-out,
   * or null for no further dispatch.
   */
  nextEvent?: (
    saved: { assetId: string },
    eventData: Record<string, unknown>,
    result: AgentResult
  ) =>
    | { name: string; data: Record<string, unknown> }
    | Array<{ name: string; data: Record<string, unknown> }>
    | null;
  /**
   * Optional resolver for runAgent extras (shotId, section, collectionPoint,
   * youtubeVideoId, planAssetId). Defaults to no extras. Day 3.2 added
   * planAssetId for the Plan-driven EREF executor (q1a additive branch).
   */
  resolveRunArgs?: (eventData: Record<string, unknown>) => Partial<
    Pick<
      RunAgentArgs,
      | 'shotId'
      | 'section'
      | 'collectionPoint'
      | 'youtubeVideoId'
      | 'planAssetId'
      | 'storyboardAssetId'
      | 'creadPhase'
    >
  >;
  /**
   * 2026-05-22 — Director directive: agent_started / agent_completed events
   * must carry enough context that BOTH the UI feed and Polina can tell
   * which shot (or which sub-operation) is running, not just which agent.
   *
   * Per-shot functions implement this to extract a short label
   * (e.g. "SH08") that gets appended to the activity title, plus extra
   * metadata fields (shot_id, plan_asset_id, etc.) merged into the
   * activity_events row.
   *
   * Defaults to no extra context — agents that don't operate per-shot
   * keep their original title/metadata shape.
   */
  resolveActivityContext?: (eventData: Record<string, unknown>) => {
    /** Short human label appended to title, e.g. "SH08" or "act 2 / SC04". */
    shortLabel?: string;
    /** Additional metadata fields merged into agent_started/completed rows. */
    metadata?: Record<string, unknown>;
  };
  /**
   * Asset statuses to load into upstream_assets for this agent. Defaults to
   * `['APPROVED']`. Reviewer agents override with `['APPROVED','REVIEW','REVISION']`
   * so the asset under review is actually loaded. Closes the 3rd layer of the
   * gate→runner→loader REVIEW-status bug discovered 2026-05-12.
   */
  inputAllowedStatuses?: readonly string[];
}

export function createAgentInngestFunction<E extends string>(
  spec: AgentFunctionSpec<E>
) {
  return inngest.createFunction(
    {
      id: spec.id,
      name: spec.name,
      // Inngest types retries as a literal union 0..20; default to 2.
      retries: (spec.retries ?? 2) as 2,
      concurrency: concurrencyFor(spec.concurrencyId),
      ...(spec.finishTimeout
        ? { timeouts: { finish: spec.finishTimeout as `${number}m` } }
        : {}),
      // Failure-spine Slice 2 (2026-07-16): Inngest calls onFailure ONCE, only
      // after all `retries` are exhausted — the natural "terminal failure" hook.
      // The per-attempt catch below suppresses the Polina wake (auto_react=false),
      // so the ONLY escalation on a genuinely-dead agent is this single deduped
      // blocker_raised → Director Inbox. Closes the E29 gap: 6× per-attempt
      // notify-needed woke read-only Polina, the Director was never told.
      onFailure: async ({ event, error }: { event: { data?: { run_id?: string; event?: { data?: Record<string, unknown> } } }; error: Error }) => {
        // ── Job-row close guarantee (E33, 2026-07-29) ────────────────────────
        // The per-attempt catch at the end of this function is a promise only a
        // LIVE process can keep: when the worker died mid-step (the E33 EXEC-EREF
        // row that sat RUNNING for hours) no user code ran at all. onFailure runs
        // from the OUTSIDE, on a fresh request, exactly once, after retries are
        // exhausted — so this is the one place that can close such a row. It
        // cannot fight a retry: a run that succeeds on retry is not failed and
        // never lands here; and the helper's own status filter leaves an
        // already-closed (FAILED or COMPLETED) row untouched.
        // Kept in its OWN try so a failing escalation below cannot skip it.
        const failedRunId = typeof event?.data?.run_id === 'string' ? event.data.run_id : null;
        if (failedRunId) {
          try {
            await closeOpenJobsForRun(
              createSupabaseServiceRoleClient(),
              failedRunId,
              `${spec.agentId} run failed after retries — ${error?.message ?? 'unknown error'}`,
            );
          } catch {
            // Best-effort — the hourly reaper still sits behind this.
          }
        }

        try {
          const original = event?.data?.event?.data;
          const episodeId = typeof original?.episodeId === 'string' ? original.episodeId : null;
          if (!episodeId) return;
          const shotId = typeof original?.shotId === 'string' ? original.shotId : null;
          const supabase = createSupabaseServiceRoleClient();

          // Failure-spine Slice 3.5: arm-aware escalation — "one brain per mode".
          // On an ARMED episode the reconciler owns recovery: tick it (it decides
          // refire-or-halt by the recovery cap) instead of escalating here, so
          // onFailure and the reconciler never double-escalate the same failure.
          // On an UNARMED episode the reconciler is asleep, so this terminal
          // failure IS the escalation → Director Inbox (Slice 2, unchanged).
          const { data: epRow } = await supabase
            .from('episodes')
            .select('metadata, governance_mode')
            .eq('id', episodeId)
            .maybeSingle();
          const epMeta = (epRow as { metadata?: unknown } | null)?.metadata;
          const rawMode = (epRow as { governance_mode?: unknown } | null)?.governance_mode;
          const mode = rawMode == null ? null : Number(rawMode);
          if (isReconcilerArmed(epMeta, mode)) {
            await inngest.send({ name: 'sandystudio/reconcile/episode', data: { episodeId } });
            return;
          }

          const ctx = spec.resolveActivityContext
            ? spec.resolveActivityContext(original as Record<string, unknown>)
            : null;
          const suffix = ctx?.shortLabel ? ` — ${ctx.shortLabel}` : '';
          await raiseBlockerOnce(supabase, {
            episodeId,
            stage: `agent_failed:${spec.agentId}`,
            shotId,
            actor: spec.agentId,
            title: `${agentDisplayName(spec.agentId)} failed after retries${suffix} — needs Director`,
            description: (error?.message ?? '').slice(0, 500),
            metadata: { agent: spec.agentId, reason: 'retries_exhausted', ...(ctx?.metadata ?? {}) },
          });
        } catch {
          // Best-effort — a failed escalation must never mask the original failure.
        }
      },
    },
    // The cast is safe: caller passes a string literal that matches a known
    // Events key. Validation is enforced at the wiring site, not here.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { event: spec.eventName as any },
    async ({ event, step, runId }) => {
      const eventData = event.data as Record<string, unknown> & {
        episodeId: string;
      };
      const { episodeId } = eventData;

      // job is captured outside try{} so the outer catch can reference it
      // when emitting agent_failed activity (closes the "PA can't see
      // pipeline failures" hole observed 2026-05-12).
      let capturedJobId: string | null = null;
      // S2/P2 — the dispatch claim this run holds (shot-scoped agents only).
      // Marked terminal on success/failure so a later sequential regen re-claims.
      let claimedDispatchKey: DispatchKey | null = null;

      try {

      // ── Step 0: shot-level runaway cap (autonomous loops only) ───────────
      // Universal chokepoint for the E10 SH23 doom-loop: both the image
      // executor (EXEC-EREF) and the plan regenerator (EXEC-EREF-DESIGNER)
      // route through this factory, so ONE check here catches EVERY dispatch
      // path — approve-route auto-chain, Mode-4 auto-approve, EPREV REVISE→
      // Designer auto-chain, and Polina's manual re-fires. The per-plan cap in
      // plan-regen-guard.ts misses this loop because the loop spawns a fresh
      // plan each turn (resetting the per-plan counter); this cap is keyed to
      // the SHOT and spans all plan versions, so it never resets. We early
      // RETURN (not throw) so Inngest does not retry: no job row, no provider
      // call (no money), no fan-out (the loop terminates by construction). The
      // human Director is never capped — she is the escalation target.
      // The human Director is NEVER capped — she is the escalation target, so a
      // Director-approved regen (event carries principal='director', e.g. the
      // approve-route execute-from-plan after a human APPROVE) bypasses the cap
      // even past the limit. Mirrors assertPlanRegenWithinCap's director
      // exemption; without it a legit post-cleanup re-approval is false-halted
      // (E10 SH26 hit 6 attempts during the furniture debacle — 2026-06-15).
      const shotIdForCap =
        typeof eventData.shotId === 'string' ? (eventData.shotId as string) : null;
      const isDirectorPrincipal = eventData.principal === 'director';
      if (
        shotIdForCap &&
        !isDirectorPrincipal &&
        (SHOT_REGEN_AGENT_IDS as readonly string[]).includes(spec.agentId)
      ) {
        const halted = await step.run('shot-regen-cap-check', async () => {
          const supabase = createSupabaseServiceRoleClient();
          const cap = shotRegenCap();
          const { count, readError } = await countShotAutonomousAttempts(
            supabase,
            episodeId,
            shotIdForCap,
          );
          // Fail CLOSED on a read error — an uncapped runaway burning render
          // budget is worse than one blocked autonomous attempt.
          if (!readError && count < cap) return false;
          await logEvent(supabase, {
            event_type: 'regen_cap_halt',
            severity: 'warning',
            title: `Shot regen cap reached — ${spec.agentId} (${shotIdForCap})`,
            description: readError
              ? `Could not verify shot regeneration history (failing closed). ` +
                `Auto-recovery HALTED; needs the human Director.`
              : `${count} autonomous attempts already made for this shot across ` +
                `all plan versions (cap ${cap}). Auto-recovery HALTED; needs the ` +
                `human Director.`,
            actor: 'exec-dir-ai',
            episode_id: episodeId,
            metadata: {
              agent: spec.agentId,
              shot_id: shotIdForCap,
              attempts: count,
              cap,
              read_error: readError,
              reason: 'SHOT_REGEN_CAP_REACHED',
            },
          });
          // 2026-07-19 — an audit row is not an escalation. This used to write
          // the event and return, so a capped runaway went silent: the Director
          // never saw it in the Inbox and the shot just stopped moving. Raise a
          // real blocker, the same way reconcile-execute does on its halt.
          await raiseBlockerOnce(supabase, {
            episodeId,
            stage: 'shot_regen_cap',
            shotId: shotIdForCap,
            title: `Shot regen cap reached — needs Director (${shotIdForCap})`,
            description:
              `${spec.agentId} stopped after ${count} autonomous attempts on this shot ` +
              `(cap ${cap}). Auto-recovery HALTED.`,
          });
          return true;
        });
        if (halted) return;
      }

      // ── Step 0a1: episode-level PROVIDER BILLING breaker ───────────────────
      // The two billing guards that predate this one are both PER-RUN: exec-vgen
      // wraps the fal 403 as NonRetriableError (stops Inngest's retries) and the
      // catch below flags the event so Polina is not woken. Neither refuses a NEW
      // dispatch — so on E30 the video fan-out kept re-firing shots into an
      // exhausted fal balance: 120 identical "User is locked. Reason: Exhausted
      // balance" failures across ~10 shots in 37 minutes, every one of them a run
      // that could not possibly succeed. Detection was never the gap; the door was.
      //
      // Money executors only (SHOT_REGEN_AGENT_IDS) — the same set the regen cap
      // guards. The Director is exempt, exactly as she is from the caps: she is the
      // escalation target, and her post-top-up re-trigger is what clears the wall
      // (any COMPLETED job newer than the lock counts as cleared — no reset flag).
      if (
        !isDirectorPrincipal &&
        (SHOT_REGEN_AGENT_IDS as readonly string[]).includes(spec.agentId)
      ) {
        const halted = await step.run('billing-lock-check', async () => {
          const supabase = createSupabaseServiceRoleClient();
          const lock = await hasUnclearedBillingLock(supabase, episodeId);
          if (!lock.locked && !lock.readError) return false;
          const detail = lock.readError
            ? `Could not verify the provider billing state (failing closed).`
            : `The provider reported it is out of funds at ${lock.since}` +
              `${lock.message ? ` — «${lock.message}»` : ''}.`;
          await logEvent(supabase, {
            event_type: 'regen_cap_halt',
            severity: 'warning',
            title: `Provider out of funds — ${spec.agentId} not dispatched`,
            description:
              `${detail} Refusing to dispatch a paid run that cannot succeed. ` +
              `Top up the provider, then re-trigger — the first completed job clears this.`,
            actor: 'exec-dir-ai',
            episode_id: episodeId,
            metadata: {
              agent: spec.agentId,
              ...(shotIdForCap ? { shot_id: shotIdForCap } : {}),
              read_error: lock.readError,
              locked_since: lock.since,
              reason: 'PROVIDER_BILLING_LOCK_BREAKER',
            },
          });
          await raiseBlockerOnce(supabase, {
            episodeId,
            stage: 'provider_billing_lock',
            title: `Provider out of funds — needs Director (top up)`,
            description:
              `${detail} Paid dispatches for this episode are HALTED until a run ` +
              `completes. Top up the provider balance, then re-trigger the shot.`,
          });
          return true;
        });
        if (halted) return;
      }

      // ── Step 0a2: per-shot PLAN AUTHORING cap ──────────────────────────────
      // The regen cap above counts the money executors only. The plan author is
      // in no counted set, which is how E30 accumulated 17 plan versions on one
      // shot while the critic PASSed 108 times — neither the regen cap nor the
      // critic revision cap can see an authoring loop. Counted from asset
      // versions so it spans every authoring path and survives a queue reset.
      if (
        shotIdForCap &&
        !isDirectorPrincipal &&
        (PLAN_AUTHOR_AGENT_IDS as readonly string[]).includes(spec.agentId)
      ) {
        const halted = await step.run('plan-version-cap-check', async () => {
          const supabase = createSupabaseServiceRoleClient();
          const cap = planVersionCap();
          const { count, readError } = await countShotPlanVersions(
            supabase,
            episodeId,
            shotIdForCap,
          );
          // Fail CLOSED, same rationale as the regen cap: an unbounded author
          // loop is worse than one refused autonomous authoring pass.
          if (!readError && count < cap) return false;
          await logEvent(supabase, {
            event_type: 'regen_cap_halt',
            severity: 'warning',
            title: `Plan version cap reached — ${spec.agentId} (${shotIdForCap})`,
            description: readError
              ? `Could not verify plan version history (failing closed). Authoring HALTED; needs the human Director.`
              : `${count} shot_plan versions already exist for this shot (cap ${cap}). ` +
                `Authoring HALTED; needs the human Director.`,
            actor: 'exec-dir-ai',
            episode_id: episodeId,
            metadata: {
              agent: spec.agentId,
              shot_id: shotIdForCap,
              plan_versions: count,
              cap,
              read_error: readError,
              reason: 'PLAN_VERSION_CAP_REACHED',
            },
          });
          await raiseBlockerOnce(supabase, {
            episodeId,
            stage: 'plan_version_cap',
            shotId: shotIdForCap,
            title: `Plan version cap reached — needs Director (${shotIdForCap})`,
            description:
              `${count} shot_plan versions exist for this shot (cap ${cap}). ` +
              `Plan authoring HALTED — approve or reject a version to move on.`,
          });
          return true;
        });
        if (halted) return;
      }

      // ── Step 0b: per-shot ATOMIC dispatch claim (S2/P2, 2026-06-28) ─────────
      // Supersedes the prior racy "eref-inflight-dedup-check" (a TOCTOU read of
      // in-flight jobs): two dispatches for the SAME shot both read "nothing in
      // flight" and both render → the E07 ×2 / E12 SH10 double image bill (~$1.21
      // each). claim_dispatch_intent (migration 0039) does an atomic INSERT…ON
      // CONFLICT test-and-set keyed on (episode, shot, agent): an in-flight claim
      // BLOCKS the duplicate; a terminal (done/failed) row is RE-CLAIMABLE so a
      // SEQUENTIAL regen still works. Both shotIds are canonical S-E-SH at the
      // dispatch door, so the exact key match is sufficient (same invariant the
      // old matcher relied on). Concurrency correctness for EVERY principal (incl.
      // the Director — nobody needs two simultaneous EREF runs for one shot);
      // Designer→Artist progression is fine (different agent_id). FAIL OPEN inside
      // the helper on RPC error. We early RETURN (not throw) so Inngest does not
      // retry: no job row, no provider call (no money), no fan-out.
      // Per-shot key for regen agents; an EPISODE-scoped key for EXEC-PUB. The
      // latter (Director E15 2026-07-05): a kebab "approve all" on 3 Key Art
      // variants fires 3 parallel approves → 3 `exec-pub/publish` events → 3
      // EXEC-PUB runs → TRIPLE YouTube upload. EXEC-PUB has no shotId so it
      // skipped this claim; give it an episode sentinel so only the FIRST of the
      // concurrent runs claims and the other two early-return (no job, no upload,
      // no spend). Reuses the exact claim + terminal-mark lifecycle (the factory
      // already marks claimedDispatchKey done/failed on completion), so a genuine
      // re-publish (after a failure or a new thumbnail) can re-claim.
      const dispatchKey: DispatchKey | null =
        shotIdForCap &&
        (SHOT_REGEN_AGENT_IDS as readonly string[]).includes(spec.agentId)
          ? { episodeId, shotId: shotIdForCap, agentId: spec.agentId }
          : spec.agentId === 'EXEC-PUB'
            ? { episodeId, shotId: 'EPISODE', agentId: spec.agentId }
            : null;
      if (dispatchKey) {
        const claim = await step.run('dispatch-intent-claim', async () => {
          const supabase = createSupabaseServiceRoleClient();
          const result = await claimDispatchIntent(
            supabase,
            dispatchKey,
            computeInputHash(eventData),
            runId,
          );
          if (!result.claimed) {
            await logEvent(supabase, {
              event_type: 'regen_duplicate_skipped',
              severity: 'info',
              title: `Duplicate ${spec.agentId} skipped — ${dispatchKey.shotId}`,
              description:
                `A ${spec.agentId} dispatch for this ${dispatchKey.shotId === 'EPISODE' ? 'episode' : 'shot'} ` +
                `is already in flight (run ${result.blockingRunId ?? 'unknown'}, status ` +
                `${result.blockingStatus ?? 'unknown'}). Skipped this concurrent ` +
                `duplicate to avoid a double ${spec.agentId === 'EXEC-PUB' ? 'publish' : 'generation'}.`,
              actor: (eventData.principal as string) ?? null,
              episode_id: episodeId,
              metadata: {
                agent: spec.agentId,
                shot_id: dispatchKey.shotId,
                blocking_run_id: result.blockingRunId,
                reason: 'DISPATCH_INTENT_DUPLICATE',
              },
            });
          }
          return result;
        });
        if (!claim.claimed) return;
        claimedDispatchKey = dispatchKey;
      }

      // ── Step 0.5: PRE-FLIGHT gate — validate BEFORE the agent "starts" ─────
      // Director UX (2026-07-03): check the gate (budget-approval, input
      // completeness, canon) BEFORE inserting a RUNNING job / emitting
      // agent_started — so a blocked dispatch never shows the "started → failed"
      // flicker nor leaves a phantom FAILED job. On block we surface ONE clear
      // "blocked — not started" notice, release the dispatch claim, and return
      // (no throw → the outer catch's failure path is not taken). When the
      // precondition is met (e.g. Director approves the budget) a re-trigger
      // re-claims and runs cleanly.
      // D6 (2026-07-11): the preflight loads NOTHING it uses — validateAgentInputs
      // runs its own targeted count/canon/governance queries and does not read the
      // loaded inputs. The old `await loadAgentInputs(...)` here re-ran the full
      // episode-wide asset + Series-Bible + genre load purely to discard it, i.e.
      // it doubled the heaviest DB work per run (~half the per-shot orchestration
      // cost of the eref-designer/critic fanout). The real load happens once, in
      // the execute-agent step below. Removed — pure throughput win, no behaviour
      // change (an unloadable episode still fails the gate via its own queries).
      const gate = await step.run('preflight-validate', async () => {
        const supabase = createSupabaseServiceRoleClient();
        return validateAgentInputs({
          supabase,
          agentId: spec.agentId,
          episodeId,
          eventContext: {
            directorConfirm: eventData.directorConfirm as boolean | undefined,
            confirmedBy: eventData.confirmedBy as string | undefined,
          },
        });
      });

      if (!gate.passed) {
        await step.run('mark-blocked-before-start', async () => {
          const supabase = createSupabaseServiceRoleClient();
          await logEvent(supabase, {
            event_type: 'agent_failed',
            severity: 'warning',
            title: `${agentDisplayName(spec.agentId)} blocked — not started`,
            description: gate.reason ?? `${spec.agentId} gate not satisfied`,
            actor: spec.agentId,
            episode_id: episodeId,
            metadata: {
              file_type: FILE_TYPE_HINT_BY_AGENT[spec.agentId] ?? null,
              inngest_run_id: runId,
              blocked_before_start: true,
              missing: gate.missing ?? null,
            },
          });
          if (claimedDispatchKey) {
            await markDispatchIntent(supabase, claimedDispatchKey, 'failed');
          }
        });
        return { blocked: true as const, reason: gate.reason ?? null };
      }

      // ── Step 1: insert RUNNING job row + emit agent_started activity ─────
      const job = await step.run('insert-job-row', async () => {
        const supabase = createSupabaseServiceRoleClient();
        const created = await insertJobRow({
          supabase,
          agentId: spec.agentId,
          episodeId,
          inngestEvent: spec.eventName,
          inngestRunId: runId,
          inputSnapshot: eventData,
        });
        // Activity feed entry so the Pipeline View shows "Storyboarder started"
        // immediately, not after ~70s of silence. Director's UX request from
        // 2026-05-02 — silent stages were unreadable.
        // TD-20.B 2026-05-20 — write via logEvent so pa/notify-needed fires
        // for the Inngest auto-react chain. Was direct insert which bypassed
        // the helper and left Polina silent on real pipeline progress.
        // 2026-05-22 — Director directive: per-shot functions must surface
        // the shot label in the activity feed so both UI and Polina can tell
        // which shot is running. resolveActivityContext is opt-in per spec.
        const activityCtx = spec.resolveActivityContext
          ? spec.resolveActivityContext(eventData)
          : null;
        const titleSuffix = activityCtx?.shortLabel
          ? ` — ${activityCtx.shortLabel}`
          : '';
        const descriptionDetail = activityCtx?.shortLabel
          ? `Working on ${activityCtx.shortLabel} (${spec.agentId})…`
          : `Working on episode (${spec.agentId})…`;

        await logEvent(supabase, {
          event_type: 'agent_started',
          severity: 'info',
          title: `${agentDisplayName(spec.agentId)} started${titleSuffix}`,
          description: descriptionDetail,
          actor: spec.agentId,
          episode_id: episodeId,
          metadata: {
            file_type: FILE_TYPE_HINT_BY_AGENT[spec.agentId] ?? null,
            job_id: created.id,
            inngest_run_id: runId,
            expected_seconds: EXPECTED_RUNTIME_SECONDS[spec.agentId] ?? 60,
            ...(activityCtx?.metadata ?? {}),
          },
        });
        return created;
      });
      capturedJobId = job.id;

      // ── Step 2: execute agent (gate already passed pre-flight) ─────────────
      const exec = await step.run('execute-agent', async () => {
        const supabase = createSupabaseServiceRoleClient();
        const inputs = await loadAgentInputs({
          supabase,
          agentId: spec.agentId,
          episodeId,
          allowedStatuses: spec.inputAllowedStatuses,
        });
        // Resolve provider for agents that consume an external contract.
        // Resolver auto-downgrades to 'mock' when the env key is missing,
        // so this is safe in test/dev environments without secrets.
        const contract = CONTRACT_BY_AGENT[spec.agentId];
        let provider: ResolvedProvider | undefined;
        if (contract) {
          try {
            // Phase 4d: honour the series' provider overlay (episode → series).
            const seriesId =
              (inputs.episode as { series_id?: string | null } | undefined)?.series_id ?? null;
            provider = await resolveProvider(supabase, contract, seriesId);
          } catch {
            // Disabled contract or no row — fall through to mock everywhere.
            provider = undefined;
          }
        }
        const episodeCode =
          (inputs.episode as { episode_code?: string } | undefined)?.episode_code ?? undefined;
        const runArgs: RunAgentArgs = {
          agentId: spec.agentId,
          inputs,
          provider,
          supabase,
          episodeCode,
          // Forward Director's revisionNote when this run originated from a
          // REQUEST_REVISION auto-chain (2026-05-12). Agents that accept it
          // (screenwriter for now) will treat it as hard acceptance criteria.
          revisionNote: typeof eventData.revisionNote === 'string'
            ? eventData.revisionNote
            : undefined,
          // TD-74 (2026-05-27) — Director-authorized check waivers. Same
          // forward-from-event-payload pattern as revisionNote. Animator
          // writes traceability; Critic uses to demote REVISE to
          // PASS_WITH_UNCERTAINTY on matching checks.
          directorOverrides: Array.isArray(eventData.directorOverrides)
            ? (eventData.directorOverrides as unknown[])
                .filter(
                  (o): o is { check: string; rationale: string } =>
                    o !== null &&
                    typeof o === 'object' &&
                    typeof (o as { check?: unknown }).check === 'string' &&
                    typeof (o as { rationale?: unknown }).rationale === 'string',
                )
            : undefined,
          ...(spec.resolveRunArgs ? spec.resolveRunArgs(eventData) : {}),
        };
        return runAgent(runArgs);
      });

      // ── Step 4: idempotent cost record ─────────────────────────────────────
      await step.run('record-cost', async () => {
        const supabase = createSupabaseServiceRoleClient();
        const providerUsed =
          (typeof exec.result.metadata.provider_used === 'string' &&
            exec.result.metadata.provider_used) ||
          (typeof exec.result.metadata.provider_id === 'string' &&
            exec.result.metadata.provider_id) ||
          'mock';
        return recordCost(supabase, {
          jobId: job.id,
          episodeId,
          agentId: spec.agentId,
          costUsd: exec.result.cost_usd,
          apiProvider: providerUsed,
          modelOrTier: resolveModelId(spec.agentId) || providerUsed,
          operation: spec.operation,
        });
      });

      // ── Step 5: save asset + mark job COMPLETED ────────────────────────────
      const saved = await step.run('save-and-complete', async () => {
        const supabase = createSupabaseServiceRoleClient();
        const { data: ep, error } = await supabase
          .from('episodes')
          .select('episode_code,governance_mode')
          .eq('id', episodeId)
          .single();
        if (error) {
          throw new Error(`save-and-complete: episode lookup failed: ${error.message}`);
        }
        // Variant carries shot/section info into the filename so multiple
        // assets-per-agent (shots, music sections) don't collide.
        const variant =
          (eventData.shotId as string | undefined) ??
          (eventData.section as string | undefined) ??
          (eventData.collectionPoint as string | undefined);

        // PHASE 1 (Mode-4 removed): every agent output lands REVIEW for the
        // Director/Polina gate — no auto-approve flip. The gate decision still
        // flows through the single `decideGate` choke-point and is recorded to
        // gate_decision_log (the taxonomy the Phase-2 mode-aware brain keys on).
        const gateDecision = decideGate({
          agentId: spec.agentId,
          governanceMode: ep.governance_mode,
        });
        await recordGateDecision(supabase, {
          episodeId,
          shotId: (eventData.shotId as string | undefined) ?? null,
          agentId: spec.agentId,
          governanceMode: ep.governance_mode,
          decision: gateDecision,
        });
        const out = await saveAgentOutput({
          supabase,
          agentId: spec.agentId,
          episodeId,
          episodeCode: ep.episode_code,
          result: exec.result,
          outputKind: exec.outputKind,
          variant,
          initialStatus: 'REVIEW',
        });
        await markJobCompleted(supabase, job.id, out.assetId);
        // S2/P2 — release the dispatch claim so a later sequential regen of this
        // shot can re-claim. No-op when this run held no claim.
        if (claimedDispatchKey) {
          await markDispatchIntent(supabase, claimedDispatchKey, 'done');
        }

        // (Removed 2026-05-02) Earlier code spoofed STB-act2 + STB-act3 mock
        // rows after EXEC-SB to satisfy a legacy WCHK gate that required
        // minCount=3. The real Storyboarder produces a single STB-storyboard
        // asset with all 3 acts inline (JSON), and gate.ts now uses minCount=1.

        // ── Bible Extension Proposals — Director-arbitrated canon growth.
        // Per Director's 2026-05-02 architecture decision: agents may propose
        // new canonical refs via `proposed_canon_extensions[]` in their JSON
        // output (or via `violations[]` for Continuity Check). Surface them as
        // an Inbox `canon_extension_proposed` event linking the producing
        // asset. Director's CanonExtensionsPanel approves/rejects per row.
        // Read the produced asset once here — reused BOTH for canon-extension
        // extraction AND for stamping the asset version onto the completion
        // event (Director 2026-07-05: "версии нужны тоже" — completion rows must
        // read "…completed SH20 video v03"). `filename` carries the version by
        // SS naming convention (…-v03-STATUS.ext).
        let completedAsset: { file_type: string | null; filename: string | null } | null = null;
        try {
          // Lazy import to avoid pulling Supabase types into the in-memory
          // replay-pilot harness.
          const { parseExtensionsFromContent, emitExtensionRequest } = await import(
            '../api/canon-extensions'
          );
          const { data: assetRow } = await supabase
            .from('assets')
            .select('content,file_type,episode_id,filename')
            .eq('id', out.assetId)
            .maybeSingle();
          completedAsset = assetRow
            ? { file_type: assetRow.file_type ?? null, filename: assetRow.filename ?? null }
            : null;
          const proposals = parseExtensionsFromContent(
            assetRow?.content ?? null,
            assetRow?.file_type ?? '',
          );
          if (proposals.length > 0) {
            await emitExtensionRequest(supabase, {
              assetId: out.assetId,
              episodeId,
              agentId: spec.agentId,
              fileType: assetRow?.file_type ?? undefined,
              proposals,
            });
          }
        } catch (err) {
          // Non-fatal: pipeline continues even if proposal extraction fails.
          // Director's manual workflow still works — Continuity verdict is
          // rendered as plain markdown.
          // eslint-disable-next-line no-console
          console.warn(
            `[factory] canon-extension extraction failed for ${spec.agentId}:`,
            err,
          );
        }

        // TD-20.B 2026-05-20 — write via logEvent so the Postgres trigger
        // mirrors into concierge_turns AND pa/notify-needed fires →
        // exec-pa-react → Polina auto-react. Was direct insert which kept
        // Polina silent on real pipeline completion (Director observed
        // Storyboarder finishing without any reaction in chat).
        // logEvent swallows failures internally, so we drop the .then() noop.
        // 2026-05-22 — same resolveActivityContext we used in agent_started,
        // re-evaluated here because eventData was captured at function entry
        // and the spec's resolver is pure. Keeps title + metadata symmetric
        // between started/completed events.
        const completedCtx = spec.resolveActivityContext
          ? spec.resolveActivityContext(eventData)
          : null;
        const completedSuffix = completedCtx?.shortLabel
          ? ` — ${completedCtx.shortLabel}`
          : '';

        // Asset version from the produced filename (…-v03-STATUS.ext). Carried in
        // metadata so the shared activity formatter (lib/api/activity-format.ts)
        // shows it on completion rows in BOTH the feed and Polina's chat. file_type
        // rides along so the formatter can name the asset kind (video/plan/…).
        const versionFromFile = completedAsset?.filename?.match(/-v(\d+)-/i)?.[1];
        const completedVersion = versionFromFile ? `v${versionFromFile}` : null;

        // 2026-06-16 (Director): surface a critic's outcome in the feed row —
        // "Video Critic completed — SH06 · REVISE" instead of a meaningless
        // "completed". Critics stamp `result.metadata.verdict` with the
        // effective verdict (PASS / REVISE / FAIL …); non-critic agents leave it
        // absent → no suffix. A non-PASS verdict also bumps severity to warning
        // so it stands out in the feed.
        const rawVerdict = (exec.result.metadata as { verdict?: unknown })?.verdict;
        const completedVerdict = typeof rawVerdict === 'string' ? rawVerdict : null;
        const verdictSuffix = completedVerdict ? ` · ${completedVerdict}` : '';

        // 2026-07-29 (E33 audit §20b): which craft playbooks actually reached the
        // model was written to a local `notes` string and dropped at save — so
        // "did the tool work?" was unanswerable postfactum. Runners that report
        // `active_playbooks` now surface it on the completion row. An EMPTY array
        // is the loud case (the agent worked blind — no playbook matched) and
        // raises severity exactly like a non-PASS verdict does. Absent (null) =
        // this agent has no skill shelf; stays silent.
        const rawPlaybooks = (exec.result.metadata as { active_playbooks?: unknown })
          ?.active_playbooks;
        const activePlaybooks = Array.isArray(rawPlaybooks)
          ? rawPlaybooks.filter((s): s is string => typeof s === 'string')
          : null;
        const blindRun = activePlaybooks !== null && activePlaybooks.length === 0;
        const playbookSuffix = blindRun ? ' · NO PLAYBOOKS' : '';

        const completedSeverity: 'info' | 'warning' =
          blindRun ||
          (completedVerdict &&
            completedVerdict !== 'PASS' &&
            completedVerdict !== 'PASS_WITH_UNCERTAINTY')
            ? 'warning'
            : 'info';

        await logEvent(supabase, {
          event_type: 'agent_completed',
          severity: completedSeverity,
          title: `${agentDisplayName(spec.agentId)} completed${completedSuffix}${verdictSuffix}${playbookSuffix}`,
          description: spec.name,
          actor: spec.agentId,
          episode_id: episodeId,
          asset_id: out.assetId,
          job_id: job.id,
          metadata: {
            agent: spec.agentId,
            status: 'REVIEW',
            ...(activePlaybooks !== null ? { active_playbooks: activePlaybooks } : {}),
            ...(completedVerdict ? { verdict: completedVerdict } : {}),
            ...(completedVersion ? { version: completedVersion } : {}),
            ...(completedAsset?.file_type ? { file_type: completedAsset.file_type } : {}),
            ...(completedCtx?.metadata ?? {}),
          },
        });

        return out;
      });

      // ── Step 6: fan-out (optional, single or array) ────────────────────────
      // Factory is generic over event names; per-function `nextEvent`
      // callbacks shape payloads. Cast at the boundary — runtime correctness
      // is the call site's responsibility, not the factory's.
      type SendEventPayload = Parameters<typeof step.sendEvent>[1];

      // ── Plan-critic PASS in Director auto-fire modes (2/3) → auto-approve the
      //    Plan + fire the executor via the SAME next-events branch the manual
      //    Director approve uses. Fixes the Designer-chain fan-out stall
      //    (regression: Day 3.2 replaced the self-driving legacy fan-out, then
      //    2f94b16e wired the critic-PASS→Artist fire for AUTOTEST only). In
      //    Modes 2/3 nothing re-entered computeNextEvents after critic PASS, so
      //    the 24-shot ref/video fan-out stalled — every Plan sat in REVIEW and
      //    the image/video never generated. Mode 1 stays manual (skip); Mode 4
      //    keeps flowing through next-events branch 1 (skip here). The REVISE
      //    re-author loop is unaffected — it runs via the critic's spec.nextEvent
      //    (critic-chain, all modes); this hook only fires on the terminal PASS.
      //    Double-fire safety: eref is covered by the atomic claim_dispatch_intent
      //    (EXEC-EREF ∈ SHOT_REGEN_AGENT_IDS); video parity via adding EXEC-VGEN.
      const isPlanCritic =
        spec.agentId === 'EXEC-EPREV' || spec.agentId === 'EXEC-VPREV';
      if (isPlanCritic) {
        // BUGFIX (2026-07-11, E27): `step.sendEvent` was nested INSIDE this
        // `step.run` — Inngest rejects that (NESTING_STEPS; 72 warnings in the
        // E27 prod log). Effect: the Plan flipped APPROVED (a plain supabase
        // update runs fine inside step.run) but the Artist/VGEN event was
        // SILENTLY DROPPED → 26 Mode-3 Plans APPROVED, 0 images generated. Fix:
        // the step.run only does the DB work and RETURNS the events; the
        // `step.sendEvent` now runs at the function top level (the only place
        // step.* tooling is allowed).
        const autofireEvents = await step.run('plan-critic-autofire', async () => {
          const supabase = createSupabaseServiceRoleClient();
          const { data: epRow } = await supabase
            .from('episodes')
            .select('governance_mode')
            .eq('id', episodeId)
            .single();
          const mode = epRow?.governance_mode;
          if (mode !== 2 && mode !== 3) return []; // Mode 1 = manual (Director clears the gate)
          const verdict = (exec.result.metadata as { verdict?: unknown })?.verdict;
          if (verdict !== 'PASS' && verdict !== 'PASS_WITH_UNCERTAINTY') return [];
          const planAssetId =
            typeof eventData.planAssetId === 'string' ? eventData.planAssetId : null;
          if (!planAssetId) return [];
          const { data: planRow } = await supabase
            .from('assets')
            .select('id,filename,file_type,episode_id,status,updated_at,metadata,content')
            .eq('id', planAssetId)
            .maybeSingle();
          if (!planRow) return [];
          // Flip the Plan APPROVED (demote sibling first — per-slot unique index
          // 0036), mirroring the Mode-4 flip above.
          const slot = resolveSlotDescriptor(planRow as AssetForSlot);
          if (slot) {
            await demoteSiblingApproved(supabase, { slot, currentId: planAssetId });
          }
          await supabase.from('assets').update({ status: 'APPROVED' }).eq('id', planAssetId);
          // Re-enter the proven next-events branch-2 (APPROVED Plan → executor)
          // with a NON-AUTOTEST principal so branch-2 (not the AUTOTEST branch-1)
          // fires. Branch-2 re-reads status from the DB, so the flip above is
          // committed first. Its own guards (planAlreadyExecuted / excluded-shot)
          // + the dispatch claim keep it idempotent.
          const events = await computeNextEvents(
            supabase,
            { ...(planRow as AssetForChain), status: 'APPROVED' } as AssetForChain,
            'exec-dir-ai',
          );
          return events.map((ev) => ({ name: ev.name, data: ev.data }));
        });
        // Top-level send — NOT nested in the step.run above.
        if (autofireEvents && autofireEvents.length > 0) {
          await step.sendEvent(
            'plan-critic-autofire-events',
            autofireEvents as unknown as SendEventPayload,
          );
        }
      }

      // Critic chain (all modes): critics validate a Plan-in-REVIEW and don't
      // gate on APPROVED status, so they MUST fire in every mode — otherwise the
      // Director approves Plans blindly without structural validation (TD-58).
      // Forward EXECUTOR routing (Artist after Plan APPROVED, etc.) is NOT fired
      // here — it fires from the Director/Polina approve route (Modes 1-3) or,
      // for plan critics, the plan-critic autofire above (Modes 2/3). Critic
      // events recognized by their event name prefix.
      const nextEventCandidate = spec.nextEvent
        ? spec.nextEvent(saved, eventData, exec.result)
        : null;
      // Critic chain detection: only single-event form qualifies. Array (fan-out)
      // form from spec.nextEvent is not used by Critic events today; if a future
      // spec returns array of Critic events, extend this check to any-element match.
      const isCriticChain =
        nextEventCandidate !== null &&
        !Array.isArray(nextEventCandidate) &&
        (nextEventCandidate.name.startsWith('sandystudio/exec-eprev/') ||
          nextEventCandidate.name.startsWith('sandystudio/exec-vprev/') ||
          // Script Critic (Story Editor) auto-reads the Writer's draft before the
          // Director sees it — parity with the Reference/Video critics (Director
          // 2026-06-02: «критик разве не должен сам читать?»). Safe re: the Mode-1
          // gate — SREV's PASS→Storyboard event is NOT a critic chain, so the
          // script still stops for the Director's approval, now WITH the Critic's
          // verdict attached. REVISE→Writer mirrors the other critics' loop policy.
          nextEventCandidate.name.startsWith('sandystudio/exec-srev/') ||
          // Creative Readability Critic (EXEC-CREAD) — C1-Gate sprint
          // 2026-06-10. Same gap the other critics had: the Storyboarder
          // declares nextEvent → exec-cread/review-storyboard (flag on), but
          // without this entry CREAD would only fire on the Director's manual
          // storyboard approval, never reading the board forward on its own.
          // Safe re: the Mode-1 gate — CREAD's PASS→exec-wchk event is NOT a
          // critic chain, so the storyboard still stops for the Director's
          // approval, now WITH the readability verdict attached.
          nextEventCandidate.name.startsWith('sandystudio/exec-cread/') ||
          // Continuity Critic (EXEC-WCHK) — same gap the Script Critic had until
          // dffe5b3. The Storyboarder declares nextEvent → exec-wchk/check-world,
          // but without this entry WCHK only fired on the Director's manual
          // storyboard approval, never reading the board forward on its own
          // (Director 2026-06-02: «Continuity Critic сам не запустился»). Safe re:
          // the Mode-1 gate — WCHK's own nextEvent is exec-edit/create-animatic,
          // NOT a critic chain, so the storyboard still stops for the Director's
          // approval, now WITH the continuity verdict attached.
          nextEventCandidate.name.startsWith('sandystudio/exec-wchk/'));

      // Critic chain (all modes) + runner-emitted events. The forward executor
      // fires from the approve route (Modes 1-3) / plan-critic autofire (2/3),
      // never here — only the Critic candidate dispatches.
      if (isCriticChain && nextEventCandidate) {
        await step.sendEvent('fan-out', nextEventCandidate as SendEventPayload);
      }
      if (isCriticChain) {
        // runAgent may also return its own next_event (e.g. EXEC-PUB → published).
        if (exec.result.next_event) {
          await step.sendEvent('runner-next', exec.result.next_event as SendEventPayload);
        }
        if (exec.result.fan_out_events && exec.result.fan_out_events.length > 0) {
          await step.sendEvent(
            'runner-fan-out',
            exec.result.fan_out_events as unknown as SendEventPayload,
          );
        }
      }

      // Phase 2b — self-advance: after ANY agent completes, tick the reconciler to
      // converge the episode. Fired unconditionally (debounced + concurrency-1);
      // reconcileEpisode itself no-ops unless the episode is ARMED (metadata
      // reconciler_armed + mode 2/3), so this is safe on every completion. The
      // code muscle advances; the conductor handles exceptions.
      if (episodeId) {
        await step.sendEvent('reconcile-trigger', {
          name: 'sandystudio/reconcile/episode',
          data: { episodeId },
        } as never);
      }

      // Autonomy Scorecard snapshot — EXEC-STITCH completing = a final cut was
      // assembled. Fire-and-forget: the episode-scorecard subscriber computes +
      // writes the SSOT row and the REV-scorecard .md. Debounced per episode, so
      // a re-stitch just refreshes. Cannot break the run (own Inngest function).
      if (spec.agentId === 'EXEC-STITCH' && episodeId) {
        await step.sendEvent('scorecard-snapshot', {
          name: 'sandystudio/scorecard/refresh',
          data: { episodeId },
        } as never);
      }

      return {
        ok: true,
        jobId: job.id,
        assetId: saved.assetId,
        runId,
      };

      } catch (err) {
        // Best-effort failure logging — writes one activity_event so the
        // Prod Assistant's `getRecentActivityEvents` surfaces the cause
        // instead of timing out silently. Wrapped in step.run for
        // idempotency across Inngest retries. Re-throws so Inngest still
        // marks the function FAILED (preserves existing semantics).
        const errMsg = err instanceof Error ? err.message : String(err);
        await step.run('log-agent-failure', async () => {
          try {
            const supabase = createSupabaseServiceRoleClient();
            // Failure-spine Slice 2 (2026-07-16): the per-attempt failure row is
            // written for the feed/audit, but does NOT wake Polina
            // (auto_react=false below). A transient failure that succeeds on retry
            // should never cry wolf; a genuinely-dead agent escalates ONCE via the
            // function's onFailure → blocker_raised (Director Inbox). This replaces
            // the old per-attempt wake that produced the E29 6× notify firehose.
            const failedCtx = spec.resolveActivityContext
              ? spec.resolveActivityContext(eventData)
              : null;
            const failedSuffix = failedCtx?.shortLabel
              ? ` — ${failedCtx.shortLabel}`
              : '';
            // S2/F3 — a PERSISTENT billing/quota wall is terminal across retries.
            // Escalate to the human Director (top-up is hers alone) and suppress
            // the auto-react wake so Polina does not re-fire into the same wall
            // (the cross-wake spend spiral). metadata.auto_react=false is the
            // suppression flag honoured by logEvent.
            const billingLocked = isPersistentBillingFailure(errMsg);
            // Same class, different wall: a stale continuity anchor re-reads the
            // same rows on every attempt and returns the same verdict. Naming it
            // here keeps the feed honest ("needs a decision", not "flaky agent").
            const anchorStale = isPlanAnchorStaleFailure(errMsg);
            const failTitle = billingLocked
              ? `⛔ Provider out of funds — ${agentDisplayName(spec.agentId)}${failedSuffix} (Director: top up)`
              : anchorStale
                ? `⚓ Якорь непрерывности сменился — ${agentDisplayName(spec.agentId)}${failedSuffix} (нужно решение Директора)`
                : `${agentDisplayName(spec.agentId)} failed${failedSuffix}`;
            await logEvent(supabase, {
              event_type: 'agent_failed',
              severity: 'error',
              title: failTitle,
              description: errMsg.slice(0, 500),
              actor: spec.agentId,
              episode_id: episodeId,
              job_id: capturedJobId,
              metadata: {
                agent: spec.agentId,
                inngest_run_id: runId,
                error: errMsg.slice(0, 500),
                // Suppress the per-attempt Polina wake for EVERY failure (not just
                // billing). Terminal escalation is the onFailure blocker_raised.
                auto_react: false,
                ...(billingLocked ? { reason: 'PROVIDER_BILLING_LOCK' } : {}),
                ...(anchorStale ? { reason: 'PLAN_ANCHOR_STALE' } : {}),
                ...(failedCtx?.metadata ?? {}),
              },
            });
            if (capturedJobId) {
              await markJobFailed(supabase, capturedJobId, errMsg.slice(0, 500));
            }
            // S2/P2 — release the claim on failure so recovery can re-claim.
            if (claimedDispatchKey) {
              await markDispatchIntent(supabase, claimedDispatchKey, 'failed');
            }
          } catch {
            // Swallow logging errors so we don't mask the original failure.
          }
          return { logged: true };
        });
        // A deterministic failure cannot be retried into success: the billing wall
        // and the stale anchor both re-read the same state and return the same
        // verdict. Retrying multiplies log noise and (for money stages) burns the
        // attempt budget on a wall — S20-E01 logged 100 identical PLAN_ANCHOR_STALE
        // before anyone looked. NonRetriable skips straight to onFailure, which
        // raises the ONE deduped blocker for the Director.
        if (isTerminalAgentFailure(errMsg)) {
          throw new NonRetriableError(errMsg, { cause: err });
        }
        throw err;
      }
    },
  );
}
