// ──────────────────────────────────────────────────────────────────────────────
// app/api/episodes/[id]/route.ts
// GET episode detail (episode + assets + jobs).
// PATCH episode status with transition guard.
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector, assertHumanDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import {
  assertEpisodeTransition,
  type EpisodeStatus,
} from '@/lib/api/status-transitions';
import { deleteFile } from '@/lib/agents/providers/drive';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PatchBody = z.object({
  status: z.string().optional(),
  title_working: z.string().min(1).max(80).optional(),
  budget_ceiling: z.number().positive().optional(),
});

export const GET = withApiHandler(async (_req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const id = params?.id;
  if (!id) throw new NotFoundError('Episode');

  const { supabase } = await requireDirector();

  const [epRes, assetsRes, jobsRes] = await Promise.all([
    supabase.from('episodes').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('assets')
      .select('*')
      .eq('episode_id', id)
      .order('created_at', { ascending: true }),
    supabase
      .from('jobs')
      .select('*')
      .eq('episode_id', id)
      .order('created_at', { ascending: false })
      // q4a — the timeline reads input_snapshot.shotId from these jobs to pulse
      // per-shot live work; 50 could truncate an early shot's RUNNING job on a
      // busy episode, so match the pipeline route's 200 ceiling.
      .limit(200),
  ]);

  if (epRes.error) throw new Error(`episode fetch failed: ${epRes.error.message}`);
  if (!epRes.data) throw new NotFoundError(`Episode ${id}`);

  return apiOk({
    episode: epRes.data,
    assets: assetsRes.data ?? [],
    jobs: jobsRes.data ?? [],
  });
});

export const PATCH = withApiHandler(async (req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const id = params?.id;
  if (!id) throw new NotFoundError('Episode');

  const { user, supabase } = await requireDirector();
  const body = await parseJson(req, PatchBody);

  const { data: ep, error: getErr } = await supabase
    .from('episodes')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (getErr) throw new Error(`episode fetch failed: ${getErr.message}`);
  if (!ep) throw new NotFoundError(`Episode ${id}`);

  const patch: Record<string, unknown> = {};
  if (body.status) {
    assertEpisodeTransition(ep.status as EpisodeStatus, body.status as EpisodeStatus);
    patch.status = body.status;
  }
  if (body.title_working !== undefined) patch.title_working = body.title_working;
  if (body.budget_ceiling !== undefined) patch.budget_ceiling = body.budget_ceiling;

  if (Object.keys(patch).length === 0) {
    return apiOk(ep);
  }

  const { data: updated, error: updErr } = await supabase
    .from('episodes')
    .update(patch as never)
    .eq('id', id)
    .select('*')
    .single();
  if (updErr) throw new Error(`episode update failed: ${updErr.message}`);

  await supabase.from('activity_events').insert({
    event_type: 'episode_updated',
    severity: 'info',
    title: `Episode ${ep.episode_code} updated`,
    description: `By ${user.email ?? user.id}`,
    actor: user.id,
    episode_id: id,
    metadata: { patch },
  } as never);

  return apiOk(updated);
});

// ──────────────────────────────────────────────────────────────────────────────
// DELETE — permanent "Delete forever" purge from Trash (Director q3/q5, 2026-07-13).
//
// Guardrails:
//   - HUMAN Director only (irreversible; EXEC-DIR-AI service token rejected).
//   - Only episodes already in TRASH (status ARCHIVED) may be purged — you must
//     move an episode to Trash first, then delete it. This makes accidental
//     one-click loss of a live episode impossible by construction.
//
// Effects:
//   - `delete_media:true` → also purge the episode's Drive files (raw + approved
//     images/video/audio) via drive.deleteFile. Best-effort per file. Published
//     YouTube videos are a separate surface and are NEVER touched (q6y).
//   - The episode row is deleted; assets + jobs cascade away via FK ON DELETE.
//   - Audit event is written with episode_id:null (so it survives the cascade)
//     and the code/id preserved in metadata.
// ──────────────────────────────────────────────────────────────────────────────
const DeleteBody = z.object({
  delete_media: z.boolean().optional().default(false),
});

export const DELETE = withApiHandler(async (req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const id = params?.id;
  if (!id) throw new NotFoundError('Episode');

  const dirCtx = await requireDirector();
  const { user, supabase } = dirCtx;
  assertHumanDirector(dirCtx);
  const body = await parseJson(req, DeleteBody);

  const { data: ep, error: getErr } = await supabase
    .from('episodes')
    .select('id, episode_code, status')
    .eq('id', id)
    .maybeSingle();
  if (getErr) throw new Error(`episode fetch failed: ${getErr.message}`);
  if (!ep) throw new NotFoundError(`Episode ${id}`);

  if (ep.status !== 'ARCHIVED') {
    throw new ValidationError(
      `Only trashed episodes can be deleted. Episode ${ep.episode_code} is "${ep.status}" — move it to Trash first.`,
    );
  }

  // Optionally purge Drive media. Best-effort: a failed file does not abort the
  // row delete, but we report the counts so the Director sees partial failure.
  let mediaDeleted = 0;
  let mediaFailed = 0;
  if (body.delete_media) {
    const { data: mediaAssets } = await supabase
      .from('assets')
      .select('id, drive_file_id')
      .eq('episode_id', id)
      .not('drive_file_id', 'is', null);
    for (const a of mediaAssets ?? []) {
      const fileId = (a as { drive_file_id?: string | null }).drive_file_id;
      if (!fileId) continue;
      try {
        await deleteFile(fileId);
        mediaDeleted += 1;
      } catch {
        mediaFailed += 1;
      }
    }
  }

  // Audit BEFORE delete, detached from the episode (episode_id:null) so the row
  // survives the cascade that is about to remove this episode.
  await supabase.from('activity_events').insert({
    event_type: 'episode_updated',
    severity: 'warn',
    title: `Episode ${ep.episode_code} deleted forever`,
    description: `Director ${user.email ?? user.id} permanently deleted ${ep.episode_code} from Trash. delete_media=${body.delete_media} (${mediaDeleted} Drive files removed, ${mediaFailed} failed).`,
    actor: user.id,
    episode_id: null,
    metadata: {
      kind: 'episode_deleted_forever',
      episode_id: id,
      episode_code: ep.episode_code,
      delete_media: body.delete_media,
      media_deleted: mediaDeleted,
      media_failed: mediaFailed,
    },
  } as never);

  const { error: delErr } = await supabase.from('episodes').delete().eq('id', id);
  if (delErr) throw new Error(`episode delete failed: ${delErr.message}`);

  return apiOk({
    id,
    deleted: true,
    episode_code: ep.episode_code,
    media_deleted: mediaDeleted,
    media_failed: mediaFailed,
  });
});
