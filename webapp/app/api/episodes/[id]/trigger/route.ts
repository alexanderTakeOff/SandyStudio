// ──────────────────────────────────────────────────────────────────────────────
// app/api/episodes/[id]/trigger/route.ts
// Manual agent re-trigger override per webapp.md §5.3 + pipeline_view.md §7.
// Director always; EXEC-DIR-AI in Mode 2/3 (Phase 8 issues service token).
//
// Body: { agentCode, payload?, reason }    — reason is REQUIRED.
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { assertHumanDirector, requireDirector } from '@/lib/api/auth';
import { logEvent } from '@/lib/api/events';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/api/errors';
import { inngest, type StudioEventName } from '@/lib/inngest/client';
import { isAnimaticV1, type AnimaticContract } from '@/lib/api/animatic-shotlist';
import { pickPilotVgenShots, normalizeShotId } from '@/lib/api/vgen-shot-helpers';
import { setVgenPilotState } from '@/lib/api/vgen-pilot-state';
import { assertPlanRegenWithinCap } from '@/lib/api/plan-regen-guard';
import { validateShotReadyForGeneration } from '@/lib/api/shot-readiness';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TriggerBody = z.object({
  agentCode: z.string().min(1),
  reason: z.string().min(3).max(500),
  payload: z.record(z.string(), z.unknown()).optional(),
});

const AGENT_TO_EVENT: Record<string, StudioEventName> = {
  'EXEC-SW':    'sandystudio/exec-sw/write-script',
  'EXEC-SREV':  'sandystudio/exec-srev/review-script',
  'EXEC-SB':    'sandystudio/exec-sb/create-storyboard',
  'EXEC-WCHK':  'sandystudio/exec-wchk/check-world',
  'EXEC-EREF':  'sandystudio/exec-eref/start',
  // Sprint «Дизайнер и Аниматор» 2026-05-18+19 — Designer/Critic re-trigger
  // via PA. Designer accepts shotId + optional revisionNote in payload; Critic
  // accepts planAssetId + shotId.
  'EXEC-EREF-DESIGNER': 'sandystudio/exec-eref-designer/plan',
  'EXEC-EPREV': 'sandystudio/exec-eprev/review-plan',
  // Day 6-7 + Day 8 (Sprint «Дизайнер и Аниматор» 2026-05-19)
  'EXEC-VANIM': 'sandystudio/exec-vanim/plan',
  'EXEC-VPREV': 'sandystudio/exec-vprev/review-plan',
  'EXEC-EDIT':  'sandystudio/exec-edit/create-animatic',
  'EXEC-VGEN':   'sandystudio/exec-vgen/generate-shot',
  'EXEC-MGEN':   'sandystudio/exec-mgen/generate-music',
  // EXEC-STITCH added 2026-05-10 — agent shipped in d1c820d (Final Cut row
  // in pipeline DAG + StageKebabMenu wiring), but the re-trigger whitelist
  // was missed. Event payload is BaseEpisodeEvent (episodeId only); the
  // generic path below already injects episodeId, so no special handling.
  'EXEC-STITCH': 'sandystudio/exec-stitch/assemble-episode',
  'EXEC-COPY':   'sandystudio/exec-copy/write-metadata',
  // Distribution tail 2026-06-01 — viral thumbnail is plan-first: the Designer
  // authors SPC-thumb_plan, the renderer (EXEC-THUMB) consumes the APPROVED plan.
  'EXEC-THUMB-DESIGNER': 'sandystudio/exec-thumb-designer/plan',
  'EXEC-THUMB':  'sandystudio/exec-thumb/generate-thumbnail',
  'EXEC-PUB':    'sandystudio/exec-pub/publish',
  'EXEC-ANAL':   'sandystudio/exec-anal/collect',
};

export const POST = withApiHandler(async (req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const id = params?.id;
  if (!id) throw new NotFoundError('Episode');

  const dir = await requireDirector();
  const { user, supabase } = dir;
  const body = await parseJson(req, TriggerBody);

  // q9 defence-in-depth: publishing (EXEC-PUB) is a hard limit (CLAUDE.md §6).
  // The EXEC-DIR-AI service token must never dispatch it, even though
  // gateMutation already blocks the publish tool upstream in every mode.
  if (body.agentCode === 'EXEC-PUB') {
    assertHumanDirector(dir);
  }

  const eventName = AGENT_TO_EVENT[body.agentCode];
  if (!eventName) {
    throw new ValidationError(
      `Unknown agentCode "${body.agentCode}". Allowed: ${Object.keys(AGENT_TO_EVENT).join(', ')}`,
    );
  }

  const { data: ep, error: epErr } = await supabase
    .from('episodes')
    .select('id,governance_mode,episode_code')
    .eq('id', id)
    .maybeSingle();
  if (epErr) throw new Error(`episode fetch failed: ${epErr.message}`);
  if (!ep) throw new NotFoundError(`Episode ${id}`);

  // 2026-06-22 — shotId canonicalization (conception-gap #10). This route is
  // the single door every dispatch funnels through (PA tools, tmp scripts, UI,
  // future auto-EP). Polина + the activity feed surface the bare key
  // "A2-SC25-SH01", but runners match the storyboard by the EXACT full id
  // "SS-S15-E11-A2-SC25-SH01" → a bare key hard-fails "not found in STB".
  // Normalize ONCE here so the full id flows everywhere below (pilot path,
  // VGEN/EREF reroutes, regen-cap guard, q21 readiness). Idempotent: already-
  // full ids and unrecognised shapes pass through untouched.
  if (typeof body.payload?.shotId === 'string') {
    body.payload.shotId = normalizeShotId(body.payload.shotId, ep.episode_code);
  }

  // ── EXEC-VGEN special path: route to Pilot Pass if animatic_v1 is approved
  // and no explicit shotId override is in payload.
  // Per purrfect-stirring-hollerith plan, manual re-trigger of VGEN should
  // enter the Pilot Pass flow (pick 1-2 pilots → /start) rather than legacy
  // 3-fake-shots fan-out. Caller can force legacy by passing payload.shotId.
  if (body.agentCode === 'EXEC-VGEN' && !body.payload?.shotId) {
    const { data: animatics, error: animErr } = await supabase
      .from('assets')
      .select('id,status,metadata,created_at')
      .eq('episode_id', id)
      .eq('file_type', 'VID-animatic')
      .order('created_at', { ascending: false })
      .limit(20);
    if (animErr) throw new Error(`animatic fetch failed: ${animErr.message}`);

    let v1: AnimaticContract | null = null;
    for (const a of animatics ?? []) {
      if ((a.status === 'APPROVED' || a.status === 'LOCKED') && isAnimaticV1(a.metadata)) {
        v1 = (a.metadata as { animatic_v1: AnimaticContract }).animatic_v1;
        break;
      }
    }
    if (v1) {
      const shotList = v1.shot_list ?? [];
      const pilots = pickPilotVgenShots(shotList);
      if (pilots.length === 0) {
        throw new ConflictError(
          'Approved animatic has no shots — cannot start VGEN Pilot Pass',
        );
      }

      // Set state PENDING_REVIEW upfront so the pillbar shows "VGEN Pilot 0/N"
      // immediately. Runner will reaffirm after each pilot completes.
      await setVgenPilotState(supabase, id, 'PENDING_REVIEW');

      const pilotEvents = pilots.map((p) => ({
        name: 'sandystudio/exec-vgen/start' as const,
        data: {
          episodeId: id,
          shotId: p.shotId,
          duration_seconds: p.durationSeconds,
          pilot: true,
        },
      }));
      const { ids } = await inngest.send(pilotEvents as never);

      // TD-29.5 (2026-05-21): route through logEvent — manual_trigger is in
      // the actionable whitelist, so Polina gets a pa/notify-needed signal.
      await logEvent(supabase, {
        event_type: 'manual_trigger',
        severity: 'warning',
        title: `Manual trigger: EXEC-VGEN (Pilot Pass, ${pilots.length} shots)`,
        description: body.reason,
        actor: user.id,
        episode_id: id,
        metadata: {
          agent: 'EXEC-VGEN',
          event: 'sandystudio/exec-vgen/start',
          reason: body.reason,
          pilot_count: pilots.length,
          pilot_shot_ids: pilots.map((p) => p.shotId),
          inngest_event_ids: ids,
        },
      });

      return apiOk({
        triggered: true,
        agent: 'EXEC-VGEN',
        flow: 'pilot_pass',
        pilot_count: pilots.length,
        pilot_shot_ids: pilots.map((p) => p.shotId),
        inngest_event: 'sandystudio/exec-vgen/start',
        inngest_event_ids: ids,
      });
    }
    // Fall through to legacy if no v1 animatic — keep replay-pilot working.
  }

  // Build event payload — caller is responsible for matching agent's expected shape.
  // We always inject episodeId and reason. directorConfirm passes for PUBLISH.
  const eventPayload: Record<string, unknown> = {
    episodeId: id,
    ...body.payload,
  };
  if (body.agentCode === 'EXEC-PUB') {
    eventPayload.directorConfirm = true;
    eventPayload.confirmedBy = user.id;
  }

  // TD-50 (2026-05-25) — Plan-driven VGEN through manual triggerAgent.
  //
  // Live SS-S15-E0X smoke surfaced the bug: Polина's `triggerAgent({agentCode:
  // 'EXEC-VGEN', payload:{shotId, planAssetId}})` routed to the legacy
  // `generate-shot` event handler (line 49 above), which historically only
  // extracts shotId via resolveRunArgs and ignores planAssetId. Result: even
  // when the Animator's Plan body declared `provider.id="seedance-with-end-image"`,
  // the manual-trigger path silently dropped to the DB-config default
  // (Seedance Fast) because TD-44's resolveVanimProviderId never saw the
  // Plan body — planAssetId was discarded at the legacy handler boundary.
  //
  // Approve-route already emits `single-shot` for Plan-driven path (TD-47
  // commit 6adb91e). This block extends the same routing to manual triggers
  // so the plan-driven path is honoured regardless of who fires VGEN.
  let effectiveEventName: string = eventName;
  if (body.agentCode === 'EXEC-VGEN') {
    const payloadShotId =
      typeof body.payload?.shotId === 'string' ? body.payload.shotId : null;
    const payloadPlanAssetId =
      typeof body.payload?.planAssetId === 'string'
        ? body.payload.planAssetId
        : null;
    if (payloadShotId && payloadPlanAssetId) {
      effectiveEventName = 'sandystudio/exec-vgen/single-shot';
      // Manual trigger = deliberate regeneration (Polина's verbal-approval
      // gated regenerateVideoFromPlan / Director's drawer). Bypass the
      // runner-side per-Plan dedup (exec-vgen.ts plan-dedup-check,
      // 2026-06-12) — that gate exists to stop ACCIDENTAL double-dispatch,
      // not an explicit re-render of the same plan.
      eventPayload.regenerate = true;
    }
  }

  // 2026-06-02 — Plan-driven EREF (anchor / per-shot reference) regen. Same
  // discard-the-plan bug as VGEN above: a "Regenerate" from the asset drawer
  // on an IMG-anchor passes {shotId, planAssetId} to re-run ONE shot's anchor
  // pair (with scene_master + identity refs). Without this reroute EXEC-EREF
  // fires the pilot-pass `start` event and re-runs the whole episode's pilot
  // instead — and the per-shot Plan (provider, prompt, anchor pairing) is lost.
  if (body.agentCode === 'EXEC-EREF') {
    const payloadShotId =
      typeof body.payload?.shotId === 'string' ? body.payload.shotId : null;
    const payloadPlanAssetId =
      typeof body.payload?.planAssetId === 'string' ? body.payload.planAssetId : null;
    if (payloadShotId && payloadPlanAssetId) {
      effectiveEventName = 'sandystudio/exec-eref/execute-from-plan';
    }
  }

  // In-flight + runaway-cap per-plan guard. Consolidated into the shared
  // assertPlanRegenWithinCap chokepoint (2026-06-14) so this route and its
  // sibling /regenerate-image-from-plan enforce the SAME rule:
  //   - in-flight (2026-06-12 E08): refuse a duplicate while a QUEUED/RUNNING
  //     job of the same agent already holds this planAssetId.
  //   - runaway cap (E10 SH10): HALT autonomous (EXEC-DIR-AI) re-fires after
  //     PLAN_REGEN_CAP attempts and escalate to the human Director, who is
  //     never capped. COMPLETED jobs count toward the cap but do not block the
  //     human's deliberate re-renders.
  const guardPlanAssetId =
    typeof body.payload?.planAssetId === 'string' ? body.payload.planAssetId : null;
  if (guardPlanAssetId) {
    const guardShotId =
      typeof body.payload?.shotId === 'string' ? body.payload.shotId : undefined;
    await assertPlanRegenWithinCap({
      supabase,
      episodeId: id,
      agentId: body.agentCode,
      planAssetId: guardPlanAssetId,
      principal: dir.principal,
      shotId: guardShotId,
    });
  }

  // q21 (2026-06-16) — readiness preflight for plan-driven video. Catch a
  // doomed render BEFORE the paid dispatch (silent C1 reject, dead refs,
  // unparseable plan, unsupported provider params) and refuse with the
  // concrete blockers, so the failure costs $0 and the Director sees why at
  // the click instead of inside a failed Inngest run. VGEN plan path only;
  // factory/autonomous + other routes are wired in the next slice.
  if (body.agentCode === 'EXEC-VGEN' && guardPlanAssetId) {
    const readyShotId =
      typeof body.payload?.shotId === 'string' ? body.payload.shotId : null;
    if (readyShotId) {
      const readiness = await validateShotReadyForGeneration(supabase, {
        shotId: readyShotId,
        episodeId: id,
        planAssetId: guardPlanAssetId,
      });
      if (!readiness.ok) {
        throw new ValidationError(
          `Shot not ready: ${readiness.blockers.map((b) => b.message).join('; ')}`,
        );
      }
    }
  }

  // Distribution tail 2026-06-01 — "Key Art Designer" is plan-first now.
  // Triggering EXEC-THUMB (the renderer) before an APPROVED SPC-thumb_plan
  // exists would hard-fail its gate (the failure Director hit via Polina).
  // Reroute such a trigger to the Designer so it authors the plan first.
  // Once an approved plan exists, the trigger renders as normal.
  if (body.agentCode === 'EXEC-THUMB') {
    const payloadPlanAssetId =
      typeof body.payload?.planAssetId === 'string' ? body.payload.planAssetId : null;
    if (!payloadPlanAssetId) {
      const { count } = await supabase
        .from('assets')
        .select('id', { count: 'exact', head: true })
        .eq('episode_id', id)
        .eq('file_type', 'SPC-thumb_plan')
        .eq('status', 'APPROVED');
      if (!count || count === 0) {
        effectiveEventName = 'sandystudio/exec-thumb-designer/plan';
      }
    }
  }

  const { ids } = await inngest.send({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    name: effectiveEventName as any,
    data: eventPayload as never,
  });

  // TD-29.5 (2026-05-21): route through logEvent — manual_trigger is in the
  // actionable whitelist, so Polina gets a pa/notify-needed signal.
  await logEvent(supabase, {
    event_type: 'manual_trigger',
    severity: 'warning',
    title: `Manual trigger: ${body.agentCode}${effectiveEventName !== eventName ? ' (plan-driven)' : ''}`,
    description: body.reason,
    actor: user.id,
    episode_id: id,
    metadata: {
      agent: body.agentCode,
      event: effectiveEventName,
      reason: body.reason,
      payload: body.payload ?? null,
      inngest_event_ids: ids,
      ...(effectiveEventName !== eventName
        ? { original_event: eventName, rerouted_reason: 'planAssetId-in-payload' }
        : {}),
    },
  });

  return apiOk({
    triggered: true,
    agent: body.agentCode,
    inngest_event: effectiveEventName,
    inngest_event_ids: ids,
  });
});
