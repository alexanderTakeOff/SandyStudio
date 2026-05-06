// ──────────────────────────────────────────────────────────────────────────────
// app/api/episodes/[id]/vgen/cancel/route.ts
// VGEN kill switch (purrfect-stirring-hollerith plan).
//
// Sets `app_config.vgen_cancel:<episode_id>=true` so the in-flight VGEN
// fan-out aborts at the next shot boundary. The currently running shot
// finishes (≈$0.20 wasted), subsequent shots skip.
//
// Also resets vgen_pilot_state to CANCELLED so the UI immediately shows the
// cancelled state in the pillbar.
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import { NotFoundError } from '@/lib/api/errors';
import { setVgenCancel } from '@/lib/api/vgen-cancel';
import { setVgenPilotState } from '@/lib/api/vgen-pilot-state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  reason: z.string().max(500).optional(),
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
    .select('id,episode_code')
    .eq('id', episodeId)
    .maybeSingle();
  if (epErr) throw new Error(`episode fetch: ${epErr.message}`);
  if (!ep) throw new NotFoundError(`Episode ${episodeId}`);

  await setVgenCancel(supabase, episodeId, user.email ?? user.id);
  await setVgenPilotState(supabase, episodeId, 'CANCELLED');

  await supabase.from('activity_events').insert({
    event_type: 'manual_trigger',
    severity: 'warning',
    title: 'VGEN cancelled',
    description:
      body.reason ?? `Director ${user.email ?? user.id} cancelled in-flight VGEN run`,
    actor: user.id,
    episode_id: episodeId,
    metadata: {
      kind: 'vgen_cancel',
      reason: body.reason ?? null,
    },
  } as never);

  return apiOk({
    cancelled: true,
    pilot_state: 'CANCELLED',
  });
});
