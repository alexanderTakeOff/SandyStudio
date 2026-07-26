// ──────────────────────────────────────────────────────────────────────────────
// app/api/providers/assignments/[contract]/route.ts
// PUT — update active_provider_id + is_active for a single contract.
// Invalidates the resolver cache so the next agent call picks up the change.
// Writes an activity_event for audit (provider_strategy.md §4.1).
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { getProviderCatalog, type ContractName } from '@/lib/api/provider-catalog';
import {
  invalidateProviderCache,
  providerOverlayKey,
  SERIES_OVERRIDABLE_CONTRACTS,
} from '@/lib/agents/provider-resolver';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PutBody = z.object({
  // null + series_id ⇒ remove the series override (back to studio default).
  active_provider_id: z.string().min(1).max(80).nullable(),
  is_active: z.boolean().optional(),
  notes: z.string().max(500).optional(),
  // Phase 4d: present ⇒ write the SERIES overlay, never the global row.
  series_id: z.string().uuid().optional(),
});

const VALID_CONTRACTS: ContractName[] = [
  'image',
  'video',
  'character_video',
  'music',
  'sfx',
  'storage',
  'publish',
];

export const PUT = withApiHandler(async (req, ctx) => {
  const params = (await ctx?.params) as { contract: string } | undefined;
  const contract = params?.contract;
  if (!contract || !VALID_CONTRACTS.includes(contract as ContractName)) {
    throw new NotFoundError(`Contract '${contract}'`);
  }

  const { user } = await requireDirector();
  const body = await parseJson(req, PutBody);

  // Validate the requested provider exists in the catalog for this contract.
  // (null is only meaningful for a series-override removal.)
  const catalog = getProviderCatalog();
  const candidates = catalog[contract as ContractName];
  const target = body.active_provider_id
    ? candidates.find((c) => c.id === body.active_provider_id)
    : null;
  if (body.active_provider_id && !target) {
    throw new ValidationError(
      `Provider '${body.active_provider_id}' is not registered for contract '${contract}'.`,
    );
  }
  if (!body.active_provider_id && !body.series_id) {
    throw new ValidationError('active_provider_id: null is only valid with series_id (override removal)');
  }

  // Director identity is verified by requireDirector. Use service role client
  // for the actual write — RLS on provider_assignments restricts UPDATE/INSERT
  // to service_role (per migration 0014), and the user-session client returns
  // 0 affected rows + "Cannot coerce the result to a single JSON object".
  const sb = createSupabaseServiceRoleClient();

  // ── Series overlay branch (Phase 4d): app_config, never the global row ─────
  if (body.series_id) {
    if (!SERIES_OVERRIDABLE_CONTRACTS.includes(contract as ContractName)) {
      throw new ValidationError(
        `Contract '${contract}' is studio/channel-level and cannot be overridden per series`,
      );
    }
    const key = providerOverlayKey(contract as ContractName, body.series_id);
    if (body.active_provider_id) {
      const { error } = await sb.from('app_config').upsert(
        {
          scope: 'providers',
          key,
          value: { active_provider_id: body.active_provider_id } as never,
          source: 'ui_edit',
          synced_at: new Date().toISOString(),
        } as never,
        { onConflict: 'scope,key' },
      );
      if (error) throw new Error(`provider overlay upsert failed: ${error.message}`);
    } else {
      const { error } = await sb.from('app_config').delete().eq('scope', 'providers').eq('key', key);
      if (error) throw new Error(`provider overlay delete failed: ${error.message}`);
    }
    invalidateProviderCache(contract as ContractName);

    await sb.from('activity_events').insert({
      event_type: 'provider_switched_global',
      severity: 'info',
      title: body.active_provider_id
        ? `Provider for '${contract}' overridden for a series → ${target!.display_name}`
        : `Series provider override for '${contract}' removed (back to studio default)`,
      description: body.notes ?? `Director ${user.email ?? user.id} changed a per-series provider override`,
      actor: user.id,
      metadata: {
        contract,
        scope: 'series',
        series_id: body.series_id,
        active_provider_id: body.active_provider_id,
      },
    } as never);

    return apiOk({ contract, series_id: body.series_id, override_provider_id: body.active_provider_id });
  }

  const patch: Record<string, unknown> = {
    active_provider_id: body.active_provider_id,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  };
  if (body.is_active !== undefined) patch.is_active = body.is_active;
  if (body.notes !== undefined) patch.notes = body.notes;

  const { data, error } = await sb
    .from('provider_assignments')
    .update(patch as never)
    .eq('contract', contract)
    .select('*')
    .single();
  if (error) throw new Error(`provider_assignments update failed: ${error.message}`);

  invalidateProviderCache(contract as ContractName);

  await sb.from('activity_events').insert({
    event_type: 'provider_switched_global',
    severity: 'info',
    title: `Provider for '${contract}' switched to ${target!.display_name}`,
    description: body.notes ?? `Director ${user.email ?? user.id} switched the active provider`,
    actor: user.id,
    metadata: {
      contract,
      active_provider_id: body.active_provider_id,
      is_active: body.is_active,
    },
  } as never);

  return apiOk(data);
});
