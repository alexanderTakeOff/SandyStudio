// ──────────────────────────────────────────────────────────────────────────────
// app/api/episodes/[id]/regenerate-image-from-plan/route.ts
//
// Sprint Designer plan-driven image execution path (2026-05-22). Closes the
// architectural gap Director surfaced this morning: an APPROVED SPC-ref_plan
// asset exists for a shot, but Polina had no manual path to execute it —
// `triggerAgent(EXEC-EREF)` routes to `/start` (pilot pass for the whole
// episode), which ignores `planAssetId` / `shotId` and never produces the
// requested single-shot IMG.
//
// This endpoint is the manual counterpart to the auto-chain in
// `/api/assets/[id]/approve` route: when Director APPROVES a Plan, that
// route fires `sandystudio/exec-eref/execute-from-plan` automatically.
// Manual re-fire from Polina or a UI button posts here.
//
// Body: { shotId, planAssetId, reason }
//   - shotId: storyboard shot id matching planAssetId.metadata.shot_id
//   - planAssetId: UUID of an APPROVED SPC-ref_plan-* asset for this episode
//   - reason: short audit reason (Director's spoken intent paraphrased)
//
// Validation:
//   - Plan asset exists, is SPC-ref_plan or SPC-ref_plan-* (TD-24 shape),
//     status APPROVED, belongs to this episode.
//   - shotId matches the Plan's metadata.shot_id when present.
//
// Fires: `sandystudio/exec-eref/execute-from-plan` Inngest event.
//        Mirror written to activity_events as `manual_trigger` so Polina's
//        ambient feed sees the dispatch.
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { logEvent } from '@/lib/api/events';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/api/errors';
import { resolveShotId } from '@/lib/api/shot-id';
import { inngest } from '@/lib/inngest/client';
import {
  parseContinuityAnchors,
  parseLastJsonBlock,
} from '@/lib/agents/runners/episode-references';
import {
  checkPlanAnchorFreshness,
  formatStaleAnchorMessage,
} from '@/lib/agents/runners/episode-reference-freshness';
import { assertPlanIsFreshAndExecutable, assertPlanRegenWithinCap } from '@/lib/api/plan-regen-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  shotId: z.string().min(1, 'shotId is required'),
  planAssetId: z.string().uuid('planAssetId must be a UUID'),
  reason: z.string().min(3).max(500),
  // Anchor-mode targeted regen (2026-06-20): regen only one side of the
  // anchor_pair. Omit / 'both' = legacy whole-pair behaviour.
  anchorTarget: z.enum(['start', 'end', 'both']).optional(),
});

export const POST = withApiHandler(async (req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const episodeId = params?.id;
  if (!episodeId) throw new NotFoundError('Episode');

  const { user, supabase, principal } = await requireDirector();
  const body = await parseJson(req, Body);

  // ── Validate episode exists ─────────────────────────────────────────────
  const { data: ep, error: epErr } = await supabase
    .from('episodes')
    .select('id,episode_code')
    .eq('id', episodeId)
    .maybeSingle();
  if (epErr) throw new Error(`episode fetch failed: ${epErr.message}`);
  if (!ep) throw new NotFoundError(`Episode ${episodeId}`);

  // Normalize the shot reference at the door (bare "SH18" → canonical
  // "S{s}-E{e}-SH{n}") using the same resolver the /trigger route applies. Polina
  // is told bare tokens are enough (tool schema + system prompt), so without this
  // the strict shot_id cross-check below rejected bare input and she burned
  // auto-react rounds re-firing with the canonical form until the loop backstop
  // cut her off. Resolve ONCE here so every downstream compare/lookup is canonical.
  const shotId = resolveShotId(body.shotId, ep.episode_code);

  // ── Validate Plan asset: exists, type, status, episode link ─────────────
  // TD-35: pull content + created_at too so we can run freshness check on
  // the Plan's continuity anchors before firing the executor.
  const { data: plan, error: planErr } = await supabase
    .from('assets')
    .select(
      'id,file_type,status,episode_id,metadata,filename,content,created_at',
    )
    .eq('id', body.planAssetId)
    .maybeSingle();
  if (planErr) throw new Error(`plan asset fetch failed: ${planErr.message}`);
  if (!plan) throw new NotFoundError(`Plan asset ${body.planAssetId}`);

  // TD-24: accept SPC-ref_plan OR SPC-ref_plan-<shot_id>
  const fileType = plan.file_type ?? '';
  if (
    fileType !== 'SPC-ref_plan' &&
    !fileType.startsWith('SPC-ref_plan-')
  ) {
    throw new ValidationError(
      `Plan ${body.planAssetId} has file_type "${fileType}", expected SPC-ref_plan or SPC-ref_plan-*`,
    );
  }
  if (plan.status !== 'APPROVED') {
    throw new ValidationError(
      `Plan ${body.planAssetId} status is "${plan.status}", must be APPROVED before execution`,
    );
  }
  if (plan.episode_id !== episodeId) {
    throw new ValidationError(
      `Plan ${body.planAssetId} belongs to a different episode (${plan.episode_id})`,
    );
  }

  // Optional cross-check: if Plan metadata carries a shot_id, ensure caller
  // passed the same one. Designer-written plans always have it; legacy bare
  // SPC-ref_plan rows may not — skip the check in that case.
  const planMeta = (plan.metadata ?? null) as { shot_id?: unknown } | null;
  const planShotId =
    typeof planMeta?.shot_id === 'string' ? planMeta.shot_id : null;
  if (planShotId && planShotId !== shotId) {
    throw new ValidationError(
      `Plan ${body.planAssetId} is for shot ${planShotId}, not ${shotId}`,
    );
  }

  // ── Revision-race guard (2026-07-18, E30 SH05) ──────────────────────────────
  // When the Director REJECTs / REQUEST_REVISIONs a reference, the approve route
  // auto-chains the Designer to re-author the plan with the note as HARD acceptance
  // criteria, then re-renders. If something ALSO fires this route in that window
  // (Polina auto-allowed it in Mode-3 "bold" 34s after the reject), the re-authored
  // plan does not exist yet, so it executes the STALE pre-revision plan — and Mode-3
  // auto-approves the same rejected image. Refuse two ways:
  //   (1) shot's latest reference is in REVISION → a re-author is in flight (the
  //       factory owns reject→re-render; do not race it).
  //   (2) the passed plan is superseded — a newer non-INVALIDATED plan exists.
  const { data: shotImgRows } = await supabase
    .from('assets')
    .select('status,version,metadata')
    .eq('episode_id', episodeId)
    .like('file_type', 'IMG-episode_ref%');
  const latestShotImg = ((shotImgRows ?? []) as Array<{ status?: string; version?: number; metadata?: unknown }>)
    .filter((r) => (r.metadata as { shot_reference?: { shot_id?: string } } | null)?.shot_reference?.shot_id === shotId)
    .sort((a, b) => (b.version ?? 0) - (a.version ?? 0))[0];
  if (latestShotImg?.status === 'REVISION') {
    throw new ConflictError(
      `Shot ${shotId} is in REVISION — the factory is re-authoring its plan from the Director's note and will re-render automatically. Executing a plan now races that and can render the stale pre-revision plan. Wait for the re-author to land, or use regenerateRefPlan.`,
    );
  }
  // Свежесть плана + его исполнимость проверяет ОБЩИЙ чокпоинт: та же функция
  // зовётся из /trigger (кнопка панели). Инлайн-копия жила здесь и не жила там —
  // ровно поэтому кнопка смогла послать исполнителя на отменённую v01 (E07/SH05).
  await assertPlanIsFreshAndExecutable({
    supabase,
    episodeId,
    planAssetId: body.planAssetId,
    shotId,
  });

  // ── TD-35 freshness guard ───────────────────────────────────────────────
  // Parse the Plan's continuity_anchors[] from its content JSON block and
  // verify each one is still the latest APPROVED at its scope. Hard-fail
  // with PLAN_ANCHOR_STALE (q9a Director ruling) so Polина switches to
  // regenerateRefPlan instead of reproducing outdated continuity.
  if (plan.content) {
    const planJsonBody = parseLastJsonBlock(plan.content);
    if (planJsonBody) {
      const planCreatedAt =
        typeof plan.created_at === 'string'
          ? plan.created_at
          : new Date(0).toISOString();
      const anchors = parseContinuityAnchors(planJsonBody, planCreatedAt);
      const freshness = await checkPlanAnchorFreshness(
        supabase,
        episodeId,
        anchors,
      );
      if (!freshness.ok) {
        const detail = formatStaleAnchorMessage(
          body.planAssetId,
          shotId,
          freshness.stale,
        );
        // Audit the rejection so Director's activity feed shows what was
        // attempted and why it was blocked.
        await logEvent(supabase, {
          event_type: 'plan_anchor_stale_block',
          severity: 'warning',
          title: `Image regen blocked — Plan anchors stale (shot ${shotId})`,
          description: detail,
          actor: user.id,
          episode_id: episodeId,
          asset_id: body.planAssetId,
          metadata: {
            agent: 'EXEC-EREF',
            operation: 'execute-from-plan-rejected',
            shot_id: shotId,
            plan_asset_id: body.planAssetId,
            stale_anchors: freshness.stale,
            reason: 'PLAN_ANCHOR_STALE',
          },
        });
        throw new ValidationError(detail);
      }
    }
  }

  // ── In-flight + runaway-cap guard ───────────────────────────────────────
  // The chokepoint Polina's "Mode 4 auto-recovery" loop bypassed: an advisory
  // visual-gate flag had her re-fire this route up to 6× per plan (E10 SH10),
  // each a ~4-min paid render with no escalation. The cap HALTs autonomous
  // re-fires after PLAN_REGEN_CAP attempts and tells her to escalate; the human
  // Director is never capped.
  await assertPlanRegenWithinCap({
    supabase,
    episodeId,
    agentId: 'EXEC-EREF',
    planAssetId: body.planAssetId,
    principal,
    shotId: shotId,
  });

  // ── Fire Inngest event ──────────────────────────────────────────────────
  const { ids } = await inngest.send({
    name: 'sandystudio/exec-eref/execute-from-plan',
    data: {
      episodeId,
      shotId: shotId,
      planAssetId: body.planAssetId,
      ...(body.anchorTarget ? { anchorTarget: body.anchorTarget } : {}),
    },
  });

  // ── Audit ──────────────────────────────────────────────────────────────
  await logEvent(supabase, {
    event_type: 'manual_trigger',
    severity: 'warning',
    title: `Manual trigger: EXEC-EREF execute-from-plan (shot ${shotId})`,
    description: body.reason,
    actor: user.id,
    episode_id: episodeId,
    asset_id: body.planAssetId,
    metadata: {
      agent: 'EXEC-EREF',
      operation: 'execute-from-plan',
      event: 'sandystudio/exec-eref/execute-from-plan',
      shot_id: shotId,
      plan_asset_id: body.planAssetId,
      reason: body.reason,
      inngest_event_ids: ids,
    },
  });

  return apiOk({
    triggered: true,
    operation: 'execute-from-plan',
    shotId: shotId,
    planAssetId: body.planAssetId,
    planFilename: plan.filename,
    inngest_event: 'sandystudio/exec-eref/execute-from-plan',
    inngest_event_ids: ids,
  });
});
