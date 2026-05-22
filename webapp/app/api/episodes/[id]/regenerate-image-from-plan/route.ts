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
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { inngest } from '@/lib/inngest/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  shotId: z.string().min(1, 'shotId is required'),
  planAssetId: z.string().uuid('planAssetId must be a UUID'),
  reason: z.string().min(3).max(500),
});

export const POST = withApiHandler(async (req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const episodeId = params?.id;
  if (!episodeId) throw new NotFoundError('Episode');

  const { user, supabase } = await requireDirector();
  const body = await parseJson(req, Body);

  // ── Validate episode exists ─────────────────────────────────────────────
  const { data: ep, error: epErr } = await supabase
    .from('episodes')
    .select('id,episode_code')
    .eq('id', episodeId)
    .maybeSingle();
  if (epErr) throw new Error(`episode fetch failed: ${epErr.message}`);
  if (!ep) throw new NotFoundError(`Episode ${episodeId}`);

  // ── Validate Plan asset: exists, type, status, episode link ─────────────
  const { data: plan, error: planErr } = await supabase
    .from('assets')
    .select('id,file_type,status,episode_id,metadata,filename')
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
  if (planShotId && planShotId !== body.shotId) {
    throw new ValidationError(
      `Plan ${body.planAssetId} is for shot ${planShotId}, not ${body.shotId}`,
    );
  }

  // ── Fire Inngest event ──────────────────────────────────────────────────
  const { ids } = await inngest.send({
    name: 'sandystudio/exec-eref/execute-from-plan',
    data: {
      episodeId,
      shotId: body.shotId,
      planAssetId: body.planAssetId,
    },
  });

  // ── Audit ──────────────────────────────────────────────────────────────
  await logEvent(supabase, {
    event_type: 'manual_trigger',
    severity: 'warning',
    title: `Manual trigger: EXEC-EREF execute-from-plan (shot ${body.shotId})`,
    description: body.reason,
    actor: user.id,
    episode_id: episodeId,
    asset_id: body.planAssetId,
    metadata: {
      agent: 'EXEC-EREF',
      operation: 'execute-from-plan',
      event: 'sandystudio/exec-eref/execute-from-plan',
      shot_id: body.shotId,
      plan_asset_id: body.planAssetId,
      reason: body.reason,
      inngest_event_ids: ids,
    },
  });

  return apiOk({
    triggered: true,
    operation: 'execute-from-plan',
    shotId: body.shotId,
    planAssetId: body.planAssetId,
    planFilename: plan.filename,
    inngest_event: 'sandystudio/exec-eref/execute-from-plan',
    inngest_event_ids: ids,
  });
});
