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
import { invalidateProviderCache } from '@/lib/agents/provider-resolver';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PutBody = z.object({
  active_provider_id: z.string().min(1).max(80),
  is_active: z.boolean().optional(),
  notes: z.string().max(500).optional(),
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

  const { user, supabase } = await requireDirector();
  const body = await parseJson(req, PutBody);

  // Validate the requested provider exists in the catalog for this contract.
  const catalog = getProviderCatalog();
  const candidates = catalog[contract as ContractName];
  const target = candidates.find((c) => c.id === body.active_provider_id);
  if (!target) {
    throw new ValidationError(
      `Provider '${body.active_provider_id}' is not registered for contract '${contract}'.`,
    );
  }

  const patch: Record<string, unknown> = {
    active_provider_id: body.active_provider_id,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  };
  if (body.is_active !== undefined) patch.is_active = body.is_active;
  if (body.notes !== undefined) patch.notes = body.notes;

  const { data, error } = await supabase
    .from('provider_assignments')
    .update(patch as never)
    .eq('contract', contract)
    .select('*')
    .single();
  if (error) throw new Error(`provider_assignments update failed: ${error.message}`);

  invalidateProviderCache(contract as ContractName);

  await supabase.from('activity_events').insert({
    event_type: 'provider_switched_global',
    severity: 'info',
    title: `Provider for '${contract}' switched to ${target.display_name}`,
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
