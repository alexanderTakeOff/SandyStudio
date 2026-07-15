// ──────────────────────────────────────────────────────────────────────────────
// app/api/system/governance-mode/route.ts
// Governance mode lever per uiux.md §8.4. Director-only hard limit.
//
// POST body: { targetMode: 1|2|3, scope: 'global' | { episodeId }, confirm: true }
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { assertHumanDirector, requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import { ValidationError, NotFoundError } from '@/lib/api/errors';
import { resolveEffectiveConciergeMode } from '@/lib/concierge/resolve-mode';
import { armForMode } from '@/lib/agents/production-plan';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// F11 (2026-07-01): the topbar badge previously read ONLY the global
// app_config default and never the in-focus episode's own governance_mode —
// so it showed "Mode 2" while an episode ran Mode 3 and cascaded. This GET
// returns the EFFECTIVE mode (episode override → global default) so the badge
// reflects what the pipeline actually runs under. `?episodeId=<uuid>` optional.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET = withApiHandler(async (req) => {
  const { supabase } = await requireDirector();
  const episodeId = new URL(req.url).searchParams.get('episodeId');

  const { data: cfg } = await supabase
    .from('app_config')
    .select('value')
    .eq('scope', 'system')
    .eq('key', 'governance_mode_default')
    .maybeSingle();
  const globalMode = Number((cfg as { value?: unknown } | null)?.value) || 1;

  if (!episodeId || !UUID_RE.test(episodeId)) {
    return apiOk({ effective: globalMode, global: globalMode, episode: null, scope: 'global' });
  }
  const effective = Number(await resolveEffectiveConciergeMode(supabase, episodeId));
  const { data: ep } = await supabase
    .from('episodes')
    .select('governance_mode')
    .eq('id', episodeId)
    .maybeSingle();
  const episodeMode = (ep as { governance_mode?: number } | null)?.governance_mode ?? null;
  return apiOk({ effective, global: globalMode, episode: episodeMode, scope: 'episode' });
});

const GovernanceBody = z.object({
  targetMode: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  scope: z.union([
    z.literal('global'),
    z.object({ episodeId: z.string().uuid() }),
  ]),
  confirm: z.literal(true),
});

export const POST = withApiHandler(async (req) => {
  const ctx = await requireDirector();
  assertHumanDirector(ctx); // hard limit — MODE_CHANGE is human-Director-only
  const { user, supabase } = ctx;
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
      .select('id, metadata')
      .eq('id', episodeId)
      .single();
    if (epErr || !ep) throw new NotFoundError(`Episode ${episodeId}`);
    // Phase 2b: the mode switch is the Director's deliberate arm/disarm lever —
    // →2/3 arms the conductor, →1 disarms it (pause). Mirror it into
    // metadata.reconciler_armed alongside the column, preserving other keys.
    const prevMeta = (ep as { metadata?: Record<string, unknown> | null }).metadata ?? {};
    const nextMeta = { ...prevMeta, reconciler_armed: armForMode(body.targetMode) };
    const { error: updErr } = await supabase
      .from('episodes')
      .update({ governance_mode: body.targetMode, metadata: nextMeta })
      .eq('id', episodeId);
    if (updErr) throw new Error(`episode mode update failed: ${updErr.message}`);
  }

  const severity = 'info';
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
  } as never);

  return apiOk({ targetMode: body.targetMode, scope: body.scope });
});
