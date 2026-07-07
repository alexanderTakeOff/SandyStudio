// ──────────────────────────────────────────────────────────────────────────────
// app/api/episodes/[id]/shot-exclusion/route.ts
// Toggle a shot's "excluded (button)" flag — the explicit, stage-independent
// replacement for the ≤0.5s duration hack (Director 2026-07-03).
//
// SSOT: episodes.metadata.excluded_shot_ids: string[]. Lives on the EPISODE (not
// the animatic contract), so the toggle works at ANY stage — reference, video,
// after approval, or before anything exists — including parallel/synthetic mode
// where no VID-animatic asset exists to PATCH.
//
// Read by isDeletedShot (via excludedShotIdsFromEpisodeMeta): the stitch gate,
// the STITCH runner, the per-shot generation guards, and Polina's listShots.
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { logEvent } from '@/lib/api/events';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import { NotFoundError } from '@/lib/api/errors';
import { resolveShotId } from '@/lib/api/shot-id';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  shotId: z.string().min(1).max(120),
  excluded: z.boolean(),
});

export const POST = withApiHandler(async (req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const episodeId = params?.id;
  if (!episodeId) throw new NotFoundError('Episode');

  const { user, supabase } = await requireDirector();
  const body = await parseJson(req, Body);

  const { data: ep, error } = await supabase
    .from('episodes')
    .select('id,episode_code,metadata')
    .eq('id', episodeId)
    .maybeSingle();
  if (error) throw new Error(`episode fetch: ${error.message}`);
  if (!ep) throw new NotFoundError(`Episode ${episodeId}`);

  // Normalize at the door (bare "SH18" → canonical) so excluded_shot_ids is stored
  // under the same canonical id the rest of the pipeline reads (isDeletedShot,
  // stitch gate, listShots) — a bare id here would silently fail to match.
  const shotId = resolveShotId(
    body.shotId,
    (ep as { episode_code?: string | null }).episode_code,
  );

  const meta = ((ep as { metadata?: Record<string, unknown> | null }).metadata ??
    {}) as Record<string, unknown>;
  const current = Array.isArray(meta.excluded_shot_ids)
    ? (meta.excluded_shot_ids as unknown[]).filter(
        (v): v is string => typeof v === 'string' && v.length > 0,
      )
    : [];
  const set = new Set(current);
  if (body.excluded) set.add(shotId);
  else set.delete(shotId);
  const next = [...set];

  const { error: upErr } = await supabase
    .from('episodes')
    .update({ metadata: { ...meta, excluded_shot_ids: next } as never } as never)
    .eq('id', episodeId);
  if (upErr) throw new Error(`episode update failed: ${upErr.message}`);

  // Passive audit only — 'asset_updated' is NOT in the actionable whitelist, so
  // this deliberately does NOT wake Polina (a toggle is not a gate).
  await logEvent(supabase, {
    event_type: 'asset_updated',
    severity: 'info',
    title: `Shot ${shotId} ${body.excluded ? 'excluded from' : 'restored to'} final cut`,
    description: `Director ${user.email ?? user.id} ${
      body.excluded ? 'excluded' : 'restored'
    } shot ${shotId}`,
    actor: user.id,
    episode_id: episodeId,
    metadata: { kind: 'shot_exclusion', shot_id: shotId, excluded: body.excluded },
  });

  return apiOk({
    episode_id: episodeId,
    shot_id: shotId,
    excluded: body.excluded,
    excluded_shot_ids: next,
  });
});
