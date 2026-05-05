// ──────────────────────────────────────────────────────────────────────────────
// app/api/episodes/[id]/eref/cancel/route.ts
// EREF kill switch (technology.md §4).
//
// Sets `app_config.eref_cancel:<episode_id>=true` so the in-flight EREF
// runner aborts at the next shot boundary. The currently running shot
// finishes (≈$0.05 wasted), subsequent shots skip.
//
// Also resets eref_pilot_state to NONE so the UI immediately shows a clean
// pillbar after cancellation.
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import { NotFoundError } from '@/lib/api/errors';
import { setErefCancel } from '@/lib/api/eref-cancel';
import { setPilotState } from '@/lib/api/eref-pilot-state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  reason: z.string().max(500).optional(),
});

export const POST = withApiHandler(async (req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const episodeId = params?.id;
  if (!episodeId) throw new NotFoundError('Episode');

  const { user, supabase } = await requireDirector();
  const body = await parseJson(req, Body);

  const { data: ep, error: epErr } = await supabase
    .from('episodes')
    .select('id,episode_code')
    .eq('id', episodeId)
    .maybeSingle();
  if (epErr) throw new Error(`episode fetch: ${epErr.message}`);
  if (!ep) throw new NotFoundError(`Episode ${episodeId}`);

  await setErefCancel(supabase, episodeId, user.email ?? user.id);
  await setPilotState(supabase, episodeId, 'NONE');

  await supabase.from('activity_events').insert({
    event_type: 'manual_trigger',
    severity: 'warning',
    title: 'EREF cancelled',
    description:
      body.reason ?? `Director ${user.email ?? user.id} cancelled in-flight EREF run`,
    actor: user.id,
    episode_id: episodeId,
    metadata: {
      kind: 'eref_cancel',
      reason: body.reason ?? null,
    },
  } as never);

  return apiOk({
    cancelled: true,
    pilot_state: 'NONE',
  });
});
