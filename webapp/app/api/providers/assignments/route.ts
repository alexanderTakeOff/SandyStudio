// ──────────────────────────────────────────────────────────────────────────────
// app/api/providers/assignments/route.ts
// GET — full list of provider_assignments rows with health flags.
//
// Health is computed server-side: env key present? real adapter wired?
// The Director needs both badges to know whether flipping a contract to
// a given provider will succeed (real call) or silently auto-downgrade to
// mock (resolver's safe fallback).
// ──────────────────────────────────────────────────────────────────────────────

import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import {
  getProviderCatalog,
  type ContractName,
} from '@/lib/api/provider-catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface AssignmentRow {
  contract: string;
  active_provider_id: string;
  fallback_provider_id: string | null;
  is_active: boolean;
  updated_at: string;
  notes: string | null;
}

export const GET = withApiHandler(async () => {
  const { supabase } = await requireDirector();

  const { data, error } = await supabase
    .from('provider_assignments')
    .select('contract,active_provider_id,fallback_provider_id,is_active,updated_at,notes')
    .order('contract');
  if (error) throw new Error(`provider_assignments fetch failed: ${error.message}`);

  const catalog = getProviderCatalog();
  const rows = (data ?? []) as AssignmentRow[];

  const enriched = rows.map((row) => {
    const contract = row.contract as ContractName;
    const candidates = catalog[contract] ?? [];
    const active = candidates.find((c) => c.id === row.active_provider_id);
    const envOk =
      active === undefined
        ? false
        : active.envKey === null
          ? true
          : Boolean(process.env[active.envKey]?.trim());
    return {
      ...row,
      candidates,
      active_provider: active ?? null,
      env_ok: envOk,
      effective_provider_id: envOk ? row.active_provider_id : 'mock',
    };
  });

  return apiOk(enriched);
});
