// ──────────────────────────────────────────────────────────────────────────────
// app/api/providers/assignments/route.ts
// GET — full list of provider_assignments rows with health flags.
//
// Health is computed server-side: env key present? real adapter wired?
// The Director needs both badges to know whether flipping a contract to
// a given provider will succeed (real call) or silently auto-downgrade to
// mock (resolver's safe fallback).
//
// Multi-channel Phase 4d: `?series_id=` adds the series' overlay view — each
// row gains `override_provider_id` (null = inherits the studio default) and
// `series_overridable` (storage/publish can never be overridden per series).
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseSearchParams } from '@/lib/api/zod-helpers';
import {
  getProviderCatalog,
  type ContractName,
} from '@/lib/api/provider-catalog';
import {
  isEnvKeySatisfied,
  providerOverlayKey,
  SERIES_OVERRIDABLE_CONTRACTS,
} from '@/lib/provider-resolver';

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

const Query = z.object({
  series_id: z.string().uuid().optional(),
});

export const GET = withApiHandler(async (req) => {
  const { supabase } = await requireDirector();
  const q = parseSearchParams(req.url, Query);

  const { data, error } = await supabase
    .from('provider_assignments')
    .select('contract,active_provider_id,fallback_provider_id,is_active,updated_at,notes')
    .order('contract');
  if (error) throw new Error(`provider_assignments fetch failed: ${error.message}`);

  // Series overlay rows (one query for all contracts).
  const overlays = new Map<string, string>();
  if (q.series_id) {
    const keys = SERIES_OVERRIDABLE_CONTRACTS.map((c) => providerOverlayKey(c, q.series_id!));
    const { data: cfgRows } = await supabase
      .from('app_config')
      .select('key,value')
      .eq('scope', 'providers')
      .in('key', keys);
    for (const row of cfgRows ?? []) {
      const v = (row.value as { active_provider_id?: unknown } | null)?.active_provider_id;
      if (typeof v === 'string' && v.trim()) {
        // key = assignment:<contract>:<seriesId>
        const contract = (row.key as string).split(':')[1];
        if (contract) overlays.set(contract, v);
      }
    }
  }

  const catalog = getProviderCatalog();
  const rows = (data ?? []) as AssignmentRow[];

  const enriched = rows.map((row) => {
    const contract = row.contract as ContractName;
    const candidates = catalog[contract] ?? [];
    const overridable = SERIES_OVERRIDABLE_CONTRACTS.includes(contract);
    const override = q.series_id ? overlays.get(contract) ?? null : null;
    const effectiveId = override ?? row.active_provider_id;
    const active = candidates.find((c) => c.id === effectiveId);
    const envOk = active === undefined ? false : isEnvKeySatisfied(active.envKey);
    return {
      ...row,
      // In series scope the row surfaces the EFFECTIVE provider; the studio
      // default stays visible via inherited_provider_id.
      active_provider_id: effectiveId,
      inherited_provider_id: row.active_provider_id,
      override_provider_id: override,
      series_overridable: overridable,
      candidates,
      active_provider: active ?? null,
      env_ok: envOk,
      effective_provider_id: envOk ? effectiveId : 'mock',
    };
  });

  return apiOk(enriched);
});
