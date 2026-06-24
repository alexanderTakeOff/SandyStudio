// ──────────────────────────────────────────────────────────────────────────────
// app/api/episodes/[id]/route.ts
// GET episode detail (episode + assets + jobs).
// PATCH episode status with transition guard.
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import { NotFoundError } from '@/lib/api/errors';
import {
  assertEpisodeTransition,
  type EpisodeStatus,
} from '@/lib/api/status-transitions';

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
