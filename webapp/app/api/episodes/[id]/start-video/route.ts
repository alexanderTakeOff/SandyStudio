// ──────────────────────────────────────────────────────────────────────────────
// app/api/episodes/[id]/start-video/route.ts
// "Start Video" latch (2026-07-09, animatic-stage demotion).
//
// Replaces the removed animatic-approval ceremony. Instead of approving a
// whole-episode animatic, the Director (or an authorized delegate) opens the
// video stream for the episode: from this moment every APPROVED episode
// reference — the ones already approved AND the ones approved later — flows
// straight to its Video Designer (ref → plan → critic → video), exactly the
// existing parallel-mode behaviour.
//
// The latch reuses `episodes.metadata.pipeline_mode` (no new field):
//   • absent / 'sequential' = waiting (video does not start on its own)
//   • 'parallel'            = stream open (this route flips it)
//
// It does three things:
//   1. Flip pipeline_mode → 'parallel'.
//   2. Advance the episode STORYBOARD_APPROVED → GENERATION_IN_PROGRESS so the
//      final-cut auto-advance (approve/route.ts) has a valid from-status.
//   3. Retro-fanout: emit exec-vanim/plan for every already-APPROVED reference
//      whose shot has no plan yet — the parallel edge in next-events only fires
//      for NEW approvals, so the backlog must be swept explicitly here.
// ──────────────────────────────────────────────────────────────────────────────

import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import { z } from 'zod';
import { GovernanceBlockError, NotFoundError } from '@/lib/api/errors';
import { enforceMode, type GovernanceEpisode } from '@/lib/governance';
import { inngest } from '@/lib/inngest/client';
import {
  assertEpisodeTransition,
  type EpisodeStatus,
} from '@/lib/api/status-transitions';
import { excludedShotIdsFromEpisodeMeta } from '@/lib/api/animatic-shotlist';
import { selectRetroFanoutShots } from '@/lib/api/start-video-latch';

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
    .select('id,status,governance_mode,episode_code,metadata')
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

  // 1. Flip the latch → parallel (idempotent).
  await supabase
    .from('episodes')
    .update({ metadata: { ...meta, pipeline_mode: 'parallel' } } as never)
    .eq('id', episodeId);

  // 2. Advance status into the generation window when still waiting. Only the
  //    STORYBOARD_APPROVED → GENERATION_IN_PROGRESS edge applies; if the episode
  //    is already further along (or in the anchor ANIMATIC_* path) leave it.
  const status = (ep as { status?: string }).status as EpisodeStatus | undefined;
  if (status === 'STORYBOARD_APPROVED') {
    assertEpisodeTransition(status, 'GENERATION_IN_PROGRESS');
    await supabase
      .from('episodes')
      .update({ status: 'GENERATION_IN_PROGRESS' } as never)
      .eq('id', episodeId)
      .eq('status', 'STORYBOARD_APPROVED');
  }

  // 3. Retro-fanout over already-APPROVED references whose shot has no plan yet.
  const excluded = excludedShotIdsFromEpisodeMeta(meta);

  const { data: refRows } = await supabase
    .from('assets')
    .select('metadata')
    .eq('episode_id', episodeId)
    .eq('status', 'APPROVED')
    .like('file_type', 'IMG-episode_ref%');

  const { data: planRows } = await supabase
    .from('assets')
    .select('metadata,content')
    .eq('episode_id', episodeId)
    .like('file_type', 'SPC-shot_plan%');

  const firedShotIds = selectRetroFanoutShots(
    (refRows ?? []) as Array<{ metadata?: unknown }>,
    (planRows ?? []) as Array<{ metadata?: unknown; content?: string | null }>,
    excluded,
  );

  const eventIds: string[] = [];
  for (const shotId of firedShotIds) {
    const { ids } = await inngest.send({
      name: 'sandystudio/exec-vanim/plan',
      data: { episodeId, shotId } as never,
    });
    eventIds.push(...ids);
  }

  await supabase.from('activity_events').insert({
    event_type: 'manual_trigger',
    severity: 'info',
    title: 'Video stream opened',
    description: `Director ${user.email ?? user.id} started video — ${firedShotIds.length} approved reference(s) fanned out; new approvals now flow automatically`,
    actor: user.id,
    episode_id: episodeId,
    metadata: {
      kind: 'start_video_latch',
      fanned_out_shots: firedShotIds.length,
      inngest_event_ids: eventIds,
    },
  } as never);

  return apiOk({
    started: true,
    pipeline_mode: 'parallel',
    fanned_out_shots: firedShotIds.length,
    shot_ids: firedShotIds,
  });
});
