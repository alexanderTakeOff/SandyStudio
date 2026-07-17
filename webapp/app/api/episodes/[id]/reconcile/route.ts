// ──────────────────────────────────────────────────────────────────────────────
// app/api/episodes/[id]/reconcile/route.ts
// POST → run the Фаза 2b reconciler executor for an episode: auto-advance the
// mechanical stages the plan allows, fire the stitch, surface HALTs. Dispatches
// the returned cascade events to Inngest. The manual engage point for the live
// smoke — guarded by the per-episode arm (reconciler_armed + mode 2/3) unless `?force=1`.
// ──────────────────────────────────────────────────────────────────────────────

import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { NotFoundError } from '@/lib/api/errors';
import { inngest } from '@/lib/inngest/client';
import { reconcileEpisode } from '@/lib/agents/reconcile-execute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withApiHandler(async (req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const id = params?.id;
  if (!id) throw new NotFoundError('Episode');

  const { user, supabase } = await requireDirector();
  const force = new URL(req.url).searchParams.get('force') === '1';

  const result = await reconcileEpisode(supabase, id, {
    force,
    actorUserId: user.id,
  });

  const fired: Array<{ name: string; ids: string[] }> = [];
  for (const ev of result.events) {
    const { ids } = await inngest.send({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      name: ev.name as any,
      data: ev.data as never,
    });
    fired.push({ name: ev.name, ids });
  }

  return apiOk({
    ran: result.ran,
    approved: result.approvedAssetIds,
    halted: result.halted,
    bounced: result.bounced,
    actions: result.actions,
    fired_events: fired,
  });
});
