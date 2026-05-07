// ──────────────────────────────────────────────────────────────────────────────
// app/api/episodes/[id]/vgen/generate-single-shot/route.ts
//
// Director-facing endpoint to generate (or re-generate) a single VGEN shot
// without going through the Pilot Pass / fan-out flow. Used by the
// EpisodeTimeline drawer when Director clicks a missing-VGEN cell (animatic
// image fallback) — there's no VID-shot row yet to call /regenerate-video on,
// so we fire a fresh `vgen/single-shot` event for that shot_id.
//
// Validates that the episode has an APPROVED animatic v1 contract (required
// upstream for VGEN), that the shot_id exists in shot_list, and that no
// REVIEW/APPROVED VID-shot row already exists for that shot_id (else
// /regenerate-video is the right path — guides the caller).
//
// Body: { shot_id: string, directorConfirm?: boolean,
//         duration_seconds?: number, aspect_ratio?, quality_tier? }
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
  ValidationError,
} from '@/lib/api/errors';
import { enforceMode, type GovernanceEpisode } from '@/lib/governance';
import { inngest } from '@/lib/inngest/client';
import { isAnimaticV1, type AnimaticContract } from '@/lib/api/animatic-shotlist';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  shot_id: z.string().min(1),
  directorConfirm: z.boolean().optional(),
  duration_seconds: z.number().min(1).max(8).optional(),
  aspect_ratio: z.enum(['16:9', '9:16', '1:1']).optional(),
  quality_tier: z.enum(['fast', 'standard']).optional(),
});

const ACTIVE_VGEN_STATUSES = new Set([
  'REVIEW',
  'APPROVED',
  'LOCKED',
  'NEEDS_HUMAN_TWEAK',
]);

export const POST = withApiHandler(async (req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const episodeId = params?.id;
  if (!episodeId) throw new NotFoundError('Episode');

  const { user, supabase } = await requireDirector();
  const body = await parseJson(req, Body);
  const shotId = body.shot_id;

  // Episode + governance.
  const { data: ep, error: epErr } = await supabase
    .from('episodes')
    .select('id,governance_mode,episode_code')
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

  // Validate shot_id exists in the latest APPROVED animatic v1 contract.
  const { data: animatic, error: anErr } = await supabase
    .from('assets')
    .select('id,metadata,version')
    .eq('episode_id', episodeId)
    .eq('file_type', 'VID-animatic')
    .in('status', ['APPROVED', 'LOCKED'])
    .order('version', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (anErr) throw new Error(`animatic fetch: ${anErr.message}`);
  if (!animatic || !isAnimaticV1((animatic as { metadata?: unknown }).metadata)) {
    throw new ValidationError(
      'No APPROVED animatic@v1 found for this episode. Approve the animatic first.',
    );
  }
  const v1 = (animatic.metadata as unknown as { animatic_v1: AnimaticContract }).animatic_v1;
  const shot = v1.shot_list?.find((s) => s.shot_id === shotId);
  if (!shot) {
    throw new ValidationError(
      `shot_id ${shotId} not in animatic shot_list (have ${v1.shot_list?.length ?? 0} shots).`,
    );
  }

  // Guard: if a REVIEW/APPROVED VID-shot row already exists for this shot_id,
  // tell the caller to use /regenerate-video instead — that path is wired to
  // create a new asset row from existing one's settings, which is faster than
  // a fresh single-shot fire (no need to re-resolve EREF, prompt, etc.).
  const { data: existingRows, error: rowsErr } = await supabase
    .from('assets')
    .select('id,status,metadata')
    .eq('episode_id', episodeId)
    .like('file_type', 'VID-shot%');
  if (rowsErr) throw new Error(`vid-shot rows fetch: ${rowsErr.message}`);
  const conflictRow = (existingRows ?? []).find((row) => {
    const meta = (row as { metadata?: unknown }).metadata;
    if (!meta || typeof meta !== 'object') return false;
    const sid = (meta as { shot_id?: unknown }).shot_id;
    if (sid !== shotId) return false;
    const status = (row as { status?: string }).status;
    return status ? ACTIVE_VGEN_STATUSES.has(status) : false;
  });
  if (conflictRow) {
    throw new ConflictError(
      `Shot ${shotId} already has an active VID-shot row (status=${(conflictRow as { status?: string }).status}). Use /regenerate-video on that asset instead.`,
    );
  }

  // Fire the per-shot event. Per-shot handler (exec-vgen.ts:execVgenSingleShot)
  // looks up storyboard shot + EREF internally, applies Universal Core defaults,
  // and produces the mp4. Concurrency-1-or-2 per episode (concurrency.ts).
  await inngest.send({
    name: 'sandystudio/exec-vgen/single-shot',
    data: {
      episodeId,
      shotId,
      duration_seconds:
        body.duration_seconds ?? shot.duration_seconds,
      ...(body.aspect_ratio ? { aspect_ratio: body.aspect_ratio } : {}),
      ...(body.quality_tier ? { quality_tier: body.quality_tier } : {}),
    } as never,
  });

  // Activity feedback so timeline picks it up promptly.
  await supabase
    .from('activity_events')
    .insert({
      event_type: 'agent_started',
      severity: 'info',
      title: `VGEN single-shot triggered for ${shotId}`,
      description: `Director ${user.email ?? user.id} requested generation for missing shot`,
      actor: user.id,
      episode_id: episodeId,
      metadata: {
        agent: 'EXEC-VGEN',
        kind: 'vgen_single_shot',
        shot_id: shotId,
      },
    } as never)
    .then(
      () => undefined,
      () => undefined,
    );

  return apiOk({ accepted: true, shot_id: shotId });
});
