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
import {
  selectRetroFanoutShots,
  selectRenderFanoutShots,
  splitVideoPilots,
  PILOT_COUNT_VIDEO,
} from '@/lib/api/start-video-latch';

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

  // Newest-version-first so the first APPROVED plan seen per shot is canonical
  // (selectRenderFanoutShots takes the first). id + status drive the render sweep.
  const { data: planRows } = await supabase
    .from('assets')
    .select('id,metadata,content,status')
    .eq('episode_id', episodeId)
    .like('file_type', 'SPC-shot_plan%')
    .order('version', { ascending: false });

  const { data: vidRows } = await supabase
    .from('assets')
    .select('metadata,content')
    .eq('episode_id', episodeId)
    .like('file_type', 'VID-shot%');

  // Edge 1 (ref → plan): approved reference, no plan yet → fire the Video Designer.
  const firedShotIds = selectRetroFanoutShots(
    (refRows ?? []) as Array<{ metadata?: unknown }>,
    (planRows ?? []) as Array<{ metadata?: unknown; content?: string | null }>,
    excluded,
  );

  // Edge 2 (plan → video): approved plan, no video yet → render straight from the
  // plan. This is the edge the sequential run needs — without it the latch does
  // nothing when plans already exist (E25 2026-07-10). EXEC-VGEN single-shot has
  // atomic dispatch-intent dedup, so a shot already rendering is a safe no-op.
  const renderShots = selectRenderFanoutShots(
    (planRows ?? []) as Array<{ id?: string | null; metadata?: unknown; content?: string | null; status?: string | null }>,
    (vidRows ?? []) as Array<{ metadata?: unknown; content?: string | null }>,
    excluded,
  );

  // Video Pilot Pass (2026-07-23, E31 72-job storm): mirror of the EREF
  // Designer Pilot Pass. Fire only the first PILOT_COUNT_VIDEO shots (both
  // edges merged, shot order); stash the rest into metadata so the Director
  // reviews the pilots end-to-end before "Fan Out" releases the width.
  const { pilots, pending } = splitVideoPilots(firedShotIds, renderShots);

  const eventIds: string[] = [];
  for (const c of pilots) {
    const { ids } = await inngest.send(
      c.kind === 'render'
        ? {
            name: 'sandystudio/exec-vgen/single-shot',
            data: { episodeId, shotId: c.shotId, planAssetId: c.planAssetId } as never,
          }
        : {
            name: 'sandystudio/exec-vanim/plan',
            data: { episodeId, shotId: c.shotId } as never,
          },
    );
    eventIds.push(...ids);
  }

  // Persist the stash (re-read meta AFTER the latch flip above so we extend the
  // just-written pipeline_mode rather than resurrecting the stale snapshot).
  {
    const { data: epRow } = await supabase
      .from('episodes')
      .select('metadata')
      .eq('id', episodeId)
      .maybeSingle();
    const freshMeta =
      ((epRow as { metadata?: unknown } | null)?.metadata as Record<string, unknown> | null) ?? {};
    const nextMeta: Record<string, unknown> = {
      ...freshMeta,
      video_pilot_count: PILOT_COUNT_VIDEO,
      video_fanout_total: pilots.length + pending.length,
    };
    if (pending.length > 0) nextMeta.video_fanout_pending = pending;
    else delete nextMeta.video_fanout_pending;
    await supabase
      .from('episodes')
      .update({ metadata: nextMeta as never } as never)
      .eq('id', episodeId);
  }

  await supabase.from('activity_events').insert({
    event_type: 'manual_trigger',
    severity: 'info',
    title: 'Video stream opened — pilot pass',
    description: `Director ${user.email ?? user.id} started video — pilot pass fired ${pilots.length} shot(s) (${pilots.map((c) => `${c.shotId}:${c.kind}`).join(', ') || 'none'}), ${pending.length} stashed for Fan Out`,
    actor: user.id,
    episode_id: episodeId,
    metadata: {
      kind: 'start_video_latch',
      pilot_shots: pilots.map((c) => c.shotId),
      pending_shots: pending.length,
      inngest_event_ids: eventIds,
    },
  } as never);

  return apiOk({
    started: true,
    pipeline_mode: 'parallel',
    pilot_shots: pilots.map((c) => ({ shotId: c.shotId, kind: c.kind })),
    pending_shots: pending.length,
  });
});
