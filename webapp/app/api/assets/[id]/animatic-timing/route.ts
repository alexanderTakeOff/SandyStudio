// ──────────────────────────────────────────────────────────────────────────────
// app/api/assets/[id]/animatic-timing/route.ts
// Persist Director's per-shot duration overrides for a VID-animatic asset.
//
// Body:
//   {
//     overrides: { [shot_id: string]: { duration_seconds: number } },
//     directorConfirm?: boolean
//   }
//
// Behaviour:
//   - Asset must be `VID-animatic` and carry `metadata.animatic_v1`.
//   - Each duration_seconds must be a positive number ≤ 60.
//   - Overrides are merged into existing `director_overrides`; pass an empty
//     object to clear all (we do NOT clear by default — explicit Save).
//   - `total_duration` is recomputed from shot_list + merged overrides.
//
// Mode gate: Category C (UPLOAD_ASSET-equivalent) — Director-only edit, always
// allowed; we still go through enforceMode for audit / mode_at_time stamping.
// Refuses on LOCKED.
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { enforceMode } from '@/lib/governance';
import {
  isAnimaticV1,
  computeTotalDuration,
  type AnimaticContract,
  type AnimaticDirectorOverride,
} from '@/lib/api/animatic-shotlist';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  overrides: z.record(
    z.string(),
    z.object({
      duration_seconds: z.number().positive().max(60),
    }),
  ),
  directorConfirm: z.boolean().optional(),
});

interface AssetRow {
  id: string;
  episode_id: string | null;
  filename: string;
  file_type: string;
  status: string;
  metadata: unknown;
}

async function resolveMode(
  sb: ReturnType<typeof createSupabaseServiceRoleClient>,
  asset: AssetRow,
): Promise<1 | 2 | 3 | 4> {
  if (asset.episode_id) {
    const { data } = await sb
      .from('episodes')
      .select('governance_mode')
      .eq('id', asset.episode_id)
      .maybeSingle();
    const mode = (data as { governance_mode?: number } | null)?.governance_mode;
    if (mode === 1 || mode === 2 || mode === 3 || mode === 4) return mode;
  }
  return 1;
}

export const PATCH = withApiHandler(async (req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const assetId = params?.id;
  if (!assetId) throw new NotFoundError('Asset');

  const { user } = await requireDirector();
  const sb = createSupabaseServiceRoleClient();
  const body = await parseJson(req, Body);

  const { data: assetRaw, error } = await sb
    .from('assets')
    .select('id,episode_id,filename,file_type,status,metadata')
    .eq('id', assetId)
    .maybeSingle();
  if (error) throw new Error(`asset fetch: ${error.message}`);
  if (!assetRaw) throw new NotFoundError(`Asset ${assetId}`);
  const asset = assetRaw as unknown as AssetRow;

  if (asset.status === 'LOCKED') {
    throw new ValidationError('Asset is LOCKED — cannot edit timing');
  }
  if (!asset.file_type.startsWith('VID-animatic')) {
    throw new ValidationError(
      `Timing edit is only valid for VID-animatic assets (got ${asset.file_type})`,
    );
  }
  if (!isAnimaticV1(asset.metadata)) {
    throw new ValidationError(
      'Asset is not a v1 animatic. Re-trigger Animatic stage to upgrade.',
    );
  }

  const mode = await resolveMode(sb, asset);
  const decision = enforceMode(
    'UPLOAD_ASSET',
    { id: asset.episode_id ?? asset.id, governance_mode: mode },
    {
      directorConfirm: body.directorConfirm ?? true,
      confirmedBy: user.email ?? user.id,
      actor: 'director',
    },
  );
  if (!decision.allowed) {
    return apiOk(
      { action_blocked: true, reason: decision.reason ?? 'Edit not allowed' },
      undefined,
      { status: 403 },
    );
  }

  // Validate that every override key matches a shot in the canonical list —
  // unknown shot_ids are likely typos / drift between SB and animatic.
  const metaRaw = (asset.metadata ?? {}) as Record<string, unknown>;
  const v1 = metaRaw.animatic_v1 as AnimaticContract;
  const validShotIds = new Set(v1.shot_list.map((s) => s.shot_id));
  const unknownShots = Object.keys(body.overrides).filter((id) => !validShotIds.has(id));
  if (unknownShots.length > 0) {
    throw new ValidationError(
      `Unknown shot_id(s) in overrides: ${unknownShots.slice(0, 3).join(', ')}${unknownShots.length > 3 ? '…' : ''}`,
    );
  }

  const nowIso = new Date().toISOString();
  const mergedOverrides: Record<string, AnimaticDirectorOverride> = {
    ...(v1.director_overrides ?? {}),
  };
  for (const [shotId, override] of Object.entries(body.overrides)) {
    mergedOverrides[shotId] = {
      duration_seconds: override.duration_seconds,
      edited_at: nowIso,
    };
  }

  const newTotal = computeTotalDuration(v1.shot_list, mergedOverrides);
  const newV1: AnimaticContract = {
    ...v1,
    director_overrides: mergedOverrides,
    total_duration: newTotal,
  };
  const newMeta = { ...metaRaw, animatic_v1: newV1 };

  const { error: updateErr } = await sb
    .from('assets')
    .update({ metadata: newMeta as unknown as Record<string, unknown> } as never)
    .eq('id', assetId);
  if (updateErr) {
    throw new Error(`metadata update failed: ${updateErr.message}`);
  }

  await sb.from('activity_events').insert({
    event_type: 'asset_updated',
    severity: 'info',
    title: `Timing updated for ${asset.filename}`,
    description: `Director adjusted ${Object.keys(body.overrides).length} shot duration(s); new total ${newTotal}s`,
    actor: user.id,
    asset_id: assetId,
    episode_id: asset.episode_id,
    metadata: {
      kind: 'animatic_timing_edit',
      shot_count: Object.keys(body.overrides).length,
      new_total: newTotal,
      mode_at_time: decision.modeAtTime,
    },
  } as never);

  return apiOk({
    asset_id: assetId,
    director_overrides: mergedOverrides,
    total_duration: newTotal,
    mode_at_time: decision.modeAtTime,
  });
});
