// ──────────────────────────────────────────────────────────────────────────────
// app/api/episodes/[id]/video/fanout/route.ts
// Video Pilot Pass → Fan-out trigger (2026-07-23, E31 72-job storm fix).
//
// Mirror of eref/approve-pilots for the video stream, without its EREF pilot
// state machine (deliberately NOT parameterised into that route — it is ~70%
// eref_pilot_state plumbing the video stash does not need):
//   1. "Start Video" fired PILOT_COUNT_VIDEO pilot shots and stashed the rest
//      into episodes.metadata.video_fanout_pending (start-video/route.ts).
//   2. Director reviewed the pilots end-to-end (plan → critic → video).
//   3. Director clicks "Fan Out" — POST here releases the stash: one event per
//      pending candidate (plan-edge → exec-vanim/plan, render-edge →
//      exec-vgen/single-shot), then clears it. Width from here on is bounded by
//      the episode-keyed Inngest concurrency (vanim 3 / vprev 5 / vgen-shot 2)
//      and the depth caps (critic revision cap, plan-version cap).
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import {
  ConflictError,
  GovernanceBlockError,
  NotFoundError,
} from '@/lib/api/errors';
import { enforceMode, type GovernanceEpisode } from '@/lib/governance';
import { inngest } from '@/lib/inngest/client';
import { logEvent } from '@/lib/api/events';
import { readVideoFanoutPending } from '@/lib/api/start-video-latch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  directorConfirm: z.boolean().optional(),
});

export const POST = withApiHandler(async (req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const episodeId = params?.id;
  if (!episodeId) throw new NotFoundError('Episode');

  const { user, supabase } = await requireDirector();
  const body = await parseJson(req, Body);

  const { data: ep, error: epErr } = await supabase
    .from('episodes')
    .select('id,governance_mode,episode_code,metadata')
    .eq('id', episodeId)
    .maybeSingle();
  if (epErr) throw new Error(`episode fetch: ${epErr.message}`);
  if (!ep) throw new NotFoundError(`Episode ${episodeId}`);

  const decision = enforceMode('AGENT_RUN', ep as GovernanceEpisode, {
    directorConfirm: body.directorConfirm ?? true,
    confirmedBy: user.id,
  });
  if (!decision.passed) {
    throw new GovernanceBlockError(decision.reason ?? 'Governance gate refused');
  }

  const meta = ((ep as { metadata?: Record<string, unknown> | null }).metadata ??
    {}) as Record<string, unknown>;
  const pending = readVideoFanoutPending(meta);
  if (pending.length === 0) {
    throw new ConflictError(
      'No shots queued in video_fanout_pending — either the episode already fanned out, or Start Video was never pressed.',
    );
  }

  const { ids } = await inngest.send(
    pending.map((c) =>
      c.kind === 'render'
        ? {
            name: 'sandystudio/exec-vgen/single-shot' as const,
            data: { episodeId, shotId: c.shotId, planAssetId: c.planAssetId } as never,
          }
        : {
            name: 'sandystudio/exec-vanim/plan' as const,
            data: { episodeId, shotId: c.shotId } as never,
          },
    ),
  );

  // Clear the stash — from here every candidate runs its own per-shot chain.
  const nextMeta = { ...meta };
  delete nextMeta.video_fanout_pending;
  await supabase
    .from('episodes')
    .update({ metadata: nextMeta as never } as never)
    .eq('id', episodeId);

  await logEvent(supabase, {
    event_type: 'manual_trigger',
    severity: 'info',
    title: 'Video fan-out triggered',
    description: `Director ${user.email ?? user.id} approved the video pilots; fanning out ${pending.length} shot(s) (${pending.filter((c) => c.kind === 'plan').length} to plan, ${pending.filter((c) => c.kind === 'render').length} to render)`,
    actor: user.id,
    episode_id: episodeId,
    metadata: {
      kind: 'video_fanout',
      pending_count: pending.length,
      inngest_event_ids: ids,
    },
  });

  return apiOk({
    triggered: true,
    fanned_out: pending.length,
    inngest_event_ids: ids,
  });
});
