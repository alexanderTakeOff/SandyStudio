// ──────────────────────────────────────────────────────────────────────────────
// app/api/system/governance-mode/route.ts
// Governance mode lever per uiux.md §8.4. Director-only hard limit.
//
// POST body: { targetMode: 1|2|3|4, scope: 'global' | { episodeId }, confirm: true }
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import { ValidationError, NotFoundError } from '@/lib/api/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GovernanceBody = z.object({
  targetMode: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  scope: z.union([
    z.literal('global'),
    z.object({ episodeId: z.string().uuid() }),
  ]),
  confirm: z.literal(true),
});

export const POST = withApiHandler(async (req) => {
  const { user, supabase } = await requireDirector();
  const body = await parseJson(req, GovernanceBody);
  if (!body.confirm) throw new ValidationError('confirm must be true');

  if (body.scope === 'global') {
    const { error } = await supabase
      .from('app_config')
      .upsert(
        {
          scope: 'system',
          key: 'governance_mode_default',
          value: body.targetMode,
          source: 'ui_edit',
          synced_at: new Date().toISOString(),
        },
        { onConflict: 'scope,key' },
      );
    if (error) throw new Error(`governance default update failed: ${error.message}`);
  } else {
    const { episodeId } = body.scope;
    const { data: ep, error: epErr } = await supabase
      .from('episodes')
      .select('id')
      .eq('id', episodeId)
      .single();
    if (epErr || !ep) throw new NotFoundError(`Episode ${episodeId}`);
    const { error: updErr } = await supabase
      .from('episodes')
      .update({ governance_mode: body.targetMode })
      .eq('id', episodeId);
    if (updErr) throw new Error(`episode mode update failed: ${updErr.message}`);
  }

  const severity = body.targetMode === 4 ? 'warning' : 'info';
  await supabase.from('activity_events').insert({
    event_type: 'governance_mode_change',
    severity,
    title: `Governance mode → ${body.targetMode}`,
    description:
      body.scope === 'global'
        ? `Global default set by ${user.email ?? user.id}`
        : `Episode override by ${user.email ?? user.id}`,
    actor: user.id,
    episode_id: body.scope === 'global' ? null : body.scope.episodeId,
    metadata: { target_mode: body.targetMode, scope: body.scope },
  });

  return apiOk({ targetMode: body.targetMode, scope: body.scope });
});
