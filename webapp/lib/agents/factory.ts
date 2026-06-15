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
import { shotRegenCap } from './chain-flags';
import {
  countShotAutonomousAttempts,
  SHOT_REGEN_AGENT_IDS,
} from '../api/plan-regen-guard';
import { resolveProvider, type ContractName, type ResolvedProvider } from './provider-resolver';
import type { AgentId } from './types';
// TD-87 (2026-06-09): the Mode-4 autonomous chain now routes forward through
// the SAME rich fan-out router the Director-driven approve route uses, instead
// of the thin per-agent `spec.nextEvent`. Closes the Mode-4 divergence where
// WCHK → straight to EXEC-EDIT skipped the EREF + MGEN fan-out and per-shot
// designer/animator advancement, leaving EXEC-EDIT to fail with no episode refs.
import { computeNextEvents, type AssetForChain } from './next-events';
// 2026-06-15 supersede fix: the Mode-4 auto-approve now demotes the prior
// APPROVED sibling of the same slot before occupying it, sharing the exact
// helper the Director approve route uses. Without it, regenerating an
// already-approved anchor/plan in Mode 4 collided with the per-slot unique
// index (assets_one_approved_per_anchor / _ref_plan).
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
      const shotIdForCap =
        typeof eventData.shotId === 'string' ? (eventData.shotId as string) : null;
      if (
        shotIdForCap &&
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
          return true;
        });
        if (halted) return;
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

      // ── Step 2: load + validate (one checkpoint) ───────────────────────────
      const gate = await step.run('load-and-validate', async () => {
        const supabase = createSupabaseServiceRoleClient();
        await loadAgentInputs({
          supabase,
          agentId: spec.agentId,
          episodeId,
          allowedStatuses: spec.inputAllowedStatuses,
        });
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
        await step.run('mark-failed-gate', async () => {
          const supabase = createSupabaseServiceRoleClient();
          await markJobFailed(supabase, job.id, gate.reason ?? 'Gate failed');
        });
        throw new NonRetriableError(gate.reason ?? `Gate failed for ${spec.agentId}`);
      }

      // ── Step 3: execute agent ──────────────────────────────────────────────
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
            provider = await resolveProvider(supabase, contract);
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

        // Mode 4 (AUTOTEST) auto-approves so downstream gates pass without a
        // Director click (mirrors replay-pilot's autoApproveOutput); Modes 1-3
        // land REVIEW for the Director Inbox.
        //
        // 2026-06-15 supersede fix: in Mode 4 we must NOT insert/flip straight
        // to APPROVED — the per-slot unique index (assets_one_approved_per_anchor
        // / _ref_plan, migration 0036) rejects a 2nd APPROVED per slot, so
        // regenerating an already-approved anchor/plan exploded (E10: SH12
        // anchor, SH07 ref_plan). So we always INSERT as REVIEW, then in Mode 4
        // demote the prior APPROVED sibling of each produced asset's slot (shared
        // single-approved helper — same as the approve route) and flip it
        // APPROVED. This also approves the WHOLE anchor pair (start+end), where
        // before only `out.assetId` (one side) flipped — leaving the end anchor
        // REVIEW so the anchor-chain gate never reached the animatic.
        //
        // F3 / TD-76 (2026-06-12): Modes 1-3 still get status atomically in the
        // insert (no flip window). The Mode-4 flip below is ERROR-CHECKED.
        const autoApprove = ep.governance_mode === 4;
        const out = await saveAgentOutput({
          supabase,
          agentId: spec.agentId,
          episodeId,
          episodeCode: ep.episode_code,
          result: exec.result,
          outputKind: exec.outputKind,
          variant,
          // Never insert APPROVED directly — see supersede note above.
          initialStatus: 'REVIEW',
        });

        if (autoApprove) {
          // Every asset this run produced. skip_save agents (EREF anchors,
          // THUMB) insert a pair/list themselves and report inserted_asset_ids;
          // normal agents produce the single out.assetId.
          const producedIds: string[] =
            exec.result.metadata.skip_save === true
              ? ((exec.result.metadata.inserted_asset_ids as unknown[] | undefined) ?? [])
                  .filter((v): v is string => typeof v === 'string')
              : [out.assetId];
          for (const assetId of producedIds) {
            const { data: row } = await supabase
              .from('assets')
              .select('file_type,episode_id,series_id,metadata,content')
              .eq('id', assetId)
              .maybeSingle();
            if (row) {
              const slot = resolveSlotDescriptor(row as AssetForSlot);
              if (slot) {
                await demoteSiblingApproved(supabase, { slot, currentId: assetId });
              }
            }
            const { error: flipErr } = await supabase
              .from('assets')
              .update({ status: 'APPROVED' })
              .eq('id', assetId);
            if (flipErr) {
              throw new Error(
                `save-and-complete: Mode-4 approve flip failed for ${assetId}: ${flipErr.message}`,
              );
            }
          }
        }
        await markJobCompleted(supabase, job.id, out.assetId);

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
        try {
          // Lazy import to avoid pulling Supabase types into the in-memory
          // replay-pilot harness.
          const { parseExtensionsFromContent, emitExtensionRequest } = await import(
            '../api/canon-extensions'
          );
          const { data: assetRow } = await supabase
            .from('assets')
            .select('content,file_type,episode_id')
            .eq('id', out.assetId)
            .maybeSingle();
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

        await logEvent(supabase, {
          event_type: 'agent_completed',
          severity: 'info',
          title: `${agentDisplayName(spec.agentId)} completed${completedSuffix}`,
          description: spec.name,
          actor: spec.agentId,
          episode_id: episodeId,
          asset_id: out.assetId,
          job_id: job.id,
          metadata: {
            agent: spec.agentId,
            status: autoApprove ? 'APPROVED' : 'REVIEW',
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

      // Auto-chain only in Mode 4 (AUTOTEST) for downstream EXECUTOR agents.
      // In Modes 1-3 the next executor (e.g. Artist after Plan APPROVED) is
      // fired by Director's asset approval (POST /api/assets/[id]/approve);
      // chaining here would cause the next agent to FAIL its gate because
      // the just-saved asset is REVIEW, not APPROVED.
      //
      // TD-58 (2026-05-26): CRITICs are special-case — they validate Plan-in-
      // REVIEW and don't gate on APPROVED status. Critic chain MUST fire in
      // all modes, otherwise Director approves Plans blindly without any
      // structural validation. This was broken since Sprint Day 4 wiring
      // 2026-05-19; live diagnosis 2026-05-26 surfaced it after SH09 EREF
      // Plan v03 + SH08 VANIM Plan v05 both landed with hasVerdict=false.
      // Critic events recognized by their event name prefix.
      const autoChain = await step.run('check-mode', async () => {
        const supabase = createSupabaseServiceRoleClient();
        const { data } = await supabase
          .from('episodes')
          .select('governance_mode')
          .eq('id', episodeId)
          .single();
        return data?.governance_mode === 4;
      });

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

      // TD-87 (2026-06-09): Mode-4 forward routing now goes through
      // computeNextEvents — the SAME rich router the Director-driven approve
      // route uses — instead of the thin per-agent `spec.nextEvent`. The
      // factory's step.5 already auto-promoted the output asset to APPROVED in
      // Mode 4, so we feed that APPROVED asset to computeNextEvents and dispatch
      // EVERY returned event. This restores the full fan-out (e.g. WCHK
      // APPROVED → EREF + MGEN in parallel, per-shot designer/animator
      // advancement) that the linear `spec.nextEvent` was silently skipping,
      // which left EXEC-EDIT firing with zero episode reference frames.
      //
      // hasJob idempotency inside computeNextEvents makes re-dispatch safe, so
      // there is no double-fire risk vs. the approve route running the same
      // milestone later.
      //
      // The Critic-chain path is ORTHOGONAL and still fires the thin
      // `nextEventCandidate` in ALL modes — critics validate Plans-in-REVIEW
      // and must auto-advance whether or not Mode-4 auto-chaining is on.
      if (autoChain) {
        const richEvents = await step.run('compute-next-events', async () => {
          const supabase = createSupabaseServiceRoleClient();
          // Fetch the just-saved + auto-approved asset row so computeNextEvents
          // sees the same shape the approve route passes it (id, file_type,
          // episode_id, updated_at, metadata, content). updated_at is the
          // idempotency "since" floor.
          const { data: row } = await supabase
            .from('assets')
            .select('id,filename,file_type,episode_id,updated_at,metadata,content')
            .eq('id', saved.assetId)
            .maybeSingle();
          const assetForChain: AssetForChain = {
            id: saved.assetId,
            filename:
              (row as { filename?: string } | null)?.filename ?? saved.assetId,
            file_type:
              (row as { file_type?: string } | null)?.file_type ??
              (FILE_TYPE_HINT_BY_AGENT[spec.agentId] ?? ''),
            episode_id:
              (row as { episode_id?: string | null } | null)?.episode_id ??
              episodeId,
            updated_at: (row as { updated_at?: string | null } | null)?.updated_at ?? null,
            metadata: (row as { metadata?: unknown } | null)?.metadata,
            content: (row as { content?: string | null } | null)?.content ?? null,
          };
          // 'AUTOTEST' sentinel for confirmedBy — only consumed by the EXEC-PUB
          // branch, and Mode 4 auto-passes the publish gate anyway.
          return computeNextEvents(supabase, assetForChain, 'AUTOTEST');
        });
        // Dispatch as ONE batched sendEvent (matches the runner-fan-out path
        // below). computeNextEvents can return multiple events — including
        // several with the SAME name (e.g. one `exec-eref-designer/plan` per
        // pilot shot) — so a per-event loop would need indexed step ids;
        // batching sidesteps that and keeps a single idempotent step.
        if (richEvents.length > 0) {
          await step.sendEvent(
            'fan-out-next-events',
            richEvents.map((ev) => ({ name: ev.name, data: ev.data })) as unknown as SendEventPayload,
          );
        }
      }

      // Critic chain (all modes) + runner-emitted events. In Mode 4 the rich
      // router above already covered the forward EXECUTOR routing, so here we
      // only fire the thin candidate when it is a Critic chain (it would
      // otherwise duplicate a milestone computeNextEvents handles). In Modes
      // 1-3 autoChain is false, so the forward executor fires from the approve
      // route, never here — only the Critic candidate dispatches.
      if (isCriticChain && nextEventCandidate) {
        await step.sendEvent('fan-out', nextEventCandidate as SendEventPayload);
      }
      if (autoChain || isCriticChain) {
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
            // TD-20.B 2026-05-20 — via logEvent so pa/notify-needed fires
            // on failure too. Polina should react to a stalled / errored
            // agent without waiting on Director to notice.
            const failedCtx = spec.resolveActivityContext
              ? spec.resolveActivityContext(eventData)
              : null;
            const failedSuffix = failedCtx?.shortLabel
              ? ` — ${failedCtx.shortLabel}`
              : '';
            await logEvent(supabase, {
              event_type: 'agent_failed',
              severity: 'error',
              title: `${agentDisplayName(spec.agentId)} failed${failedSuffix}`,
              description: errMsg.slice(0, 500),
              actor: spec.agentId,
              episode_id: episodeId,
              job_id: capturedJobId,
              metadata: {
                agent: spec.agentId,
                inngest_run_id: runId,
                error: errMsg.slice(0, 500),
                ...(failedCtx?.metadata ?? {}),
              },
            });
            if (capturedJobId) {
              await markJobFailed(supabase, capturedJobId, errMsg.slice(0, 500));
            }
          } catch {
            // Swallow logging errors so we don't mask the original failure.
          }
          return { logged: true };
        });
        throw err;
      }
    },
  );
}
