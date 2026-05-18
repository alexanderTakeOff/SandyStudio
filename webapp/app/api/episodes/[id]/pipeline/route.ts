// ──────────────────────────────────────────────────────────────────────────────
// app/api/episodes/[id]/pipeline/route.ts
// Pipeline View data source per pipeline_view.md §11.
// Returns episode + DAG snapshot + recent activity feed.
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseSearchParams } from '@/lib/api/zod-helpers';
import { NotFoundError } from '@/lib/api/errors';
import { buildPipelineSnapshot } from '@/lib/api/pipeline-stages';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Query = z.object({
  feed_limit: z.coerce.number().int().positive().max(100).default(50),
  feed_cursor: z.string().optional(),
});

export const GET = withApiHandler(async (req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const id = params?.id;
  if (!id) throw new NotFoundError('Episode');

  const { supabase } = await requireDirector();
  const q = parseSearchParams(req.url, Query);

  const [epRes, assetsRes, jobsRes, feedRes] = await Promise.all([
    supabase.from('episodes').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('assets')
      .select('id,filename,file_type,status,agent_id,created_at,description,version')
      .eq('episode_id', id)
      .order('created_at', { ascending: true }),
    supabase
      .from('jobs')
      .select('id,agent_id,status,inngest_event,created_at,completed_at')
      .eq('episode_id', id)
      .order('created_at', { ascending: false })
      .limit(200),
    (() => {
      let fq = supabase
        .from('activity_events')
        .select('*')
        .eq('episode_id', id)
        .order('created_at', { ascending: false })
        .limit(q.feed_limit);
      if (q.feed_cursor) fq = fq.lt('created_at', q.feed_cursor);
      return fq;
    })(),
  ]);

  if (epRes.error) throw new Error(`episode fetch failed: ${epRes.error.message}`);
  if (!epRes.data) throw new NotFoundError(`Episode ${id}`);

  const stages = buildPipelineSnapshot(
    epRes.data.status,
    (assetsRes.data ?? []).map((a) => ({
      id: a.id,
      filename: a.filename,
      file_type: a.file_type,
      status: a.status,
      agent_id: a.agent_id,
      created_at: a.created_at,
    })),
    (jobsRes.data ?? []).map((j) => ({
      id: j.id,
      agent_id: j.agent_id,
      status: j.status,
    })),
    // Sprint τ (2026-05-15) — feed EREF fan-out state from episode.metadata
    // so the snapshot builder can promote `running` over `blocked` while
    // pilots-in-REVIEW and remaining shots fan out in parallel.
    ((epRes.data as { metadata?: unknown }).metadata as Parameters<typeof buildPipelineSnapshot>[3]) ?? null,
  );

  const feedRows = feedRes.data ?? [];
  const nextCursor =
    feedRows.length === q.feed_limit ? feedRows[feedRows.length - 1]!.created_at : null;

  return apiOk({
    episode: epRes.data,
    stages,
    feed: feedRows,
    feed_cursor: nextCursor,
    asset_count: (assetsRes.data ?? []).length,
    job_count: (jobsRes.data ?? []).length,
  });
});
