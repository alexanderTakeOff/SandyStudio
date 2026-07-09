// ──────────────────────────────────────────────────────────────────────────────
// app/api/episodes/[id]/eref/advance/route.ts
// "Advance to Animatic" — RETIRED (2026-07-09, animatic-stage demotion).
//
// The whole-episode animatic-approval ceremony is gone. References no longer
// "advance to an animatic"; the EDL is materialized silently on the timeline
// and the video stream is opened by the "Start Video" latch
// (POST /api/episodes/[id]/start-video). This endpoint is kept as a no-op so any
// stale client that still calls it does NOT build a second, ceremony-path
// animatic (which would collide with the silent EDL). It performs no writes and
// fires no events.
// ──────────────────────────────────────────────────────────────────────────────

import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { NotFoundError } from '@/lib/api/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withApiHandler(async (_req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const episodeId = params?.id;
  if (!episodeId) throw new NotFoundError('Episode');

  // Auth only — no writes, no events. The animatic stage no longer exists.
  await requireDirector();

  return apiOk({
    advanced: false,
    retired: true,
    message:
      'The animatic stage was removed. Open the video stream with "Start Video" on the Episode Timeline (POST /api/episodes/[id]/start-video).',
  });
});
