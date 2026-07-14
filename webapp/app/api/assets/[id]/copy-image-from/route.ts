// ──────────────────────────────────────────────────────────────────────────────
// app/api/assets/[id]/copy-image-from/route.ts
//
// TD-20.B carry-over 2026-05-20 — Director directive: when a canonical
// character (e.g. Sandy) was finalised in a prior series (S14 LOCKED), the
// next series (S15) should reuse the same image as its starting reference
// instead of regenerating from scratch. Precedent was the one-off script
// scripts/clone-sandy-v02-with-text.ts on 2026-05-12; this endpoint plus the
// matching `copyAssetImage` PA tool replace that one-off with a proper
// flow Polina can invoke through verbal approval.
//
// Path: target asset id is in the URL — the row being POPULATED.
// Body: { fromAssetId, directorConfirm? } — source asset whose image fields
// are copied verbatim. Content / description / status of the TARGET stay
// intact (Polina's S15 canon text is preserved).
//
// Fields copied: staging_path, drive_path, drive_file_id, drive_web_view_url,
// metadata.image_prompt (if present on source — preserves prompt history so
// regenerate-image can roll back through ancestors), and a clone trace under
// metadata.cloned_from_asset_id / cloned_from_filename.
//
// Refuses on:
//   - target LOCKED
//   - source missing image (no staging + no drive_file_id)
//   - target == source
//
// Mode gate: Category C (UPLOAD_ASSET-equivalent — administrative move, no
// new generation cost). Stamps mode_at_time in metadata for audit.
//
// Side effect: fires `agent_completed` activity_event via logEvent so Polina
// auto-reacts to the target now having a real image (TD-20.B autonomy chain).
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { enforceMode } from '@/lib/governance';
import { logEvent } from '@/lib/api/events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  fromAssetId: z.string().uuid(),
  directorConfirm: z.boolean().optional(),
});

interface AssetRow {
  id: string;
  episode_id: string | null;
  series_id: string | null;
  filename: string;
  file_type: string;
  status: string;
  staging_path: string | null;
  drive_path: string | null;
  drive_file_id: string | null;
  drive_web_view_url: string | null;
  metadata: Record<string, unknown> | null;
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
    const m = (data as { governance_mode?: number } | null)?.governance_mode;
    if (m === 1 || m === 2 || m === 3) return m;
  }
  return 1;
}

export const POST = withApiHandler(async (req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const toAssetId = params?.id;
  if (!toAssetId) throw new NotFoundError('Target asset');

  const { user } = await requireDirector();
  const body = await parseJson(req, Body);
  if (body.fromAssetId === toAssetId) {
    throw new ValidationError('fromAssetId equals target id — nothing to do');
  }

  const sb = createSupabaseServiceRoleClient();

  const { data: targetRaw, error: targetErr } = await sb
    .from('assets')
    .select('*')
    .eq('id', toAssetId)
    .maybeSingle();
  if (targetErr) throw new Error(`target fetch: ${targetErr.message}`);
  if (!targetRaw) throw new NotFoundError(`Target asset ${toAssetId}`);
  const target = targetRaw as unknown as AssetRow;

  if (target.status === 'LOCKED') {
    throw new ValidationError('Target asset is LOCKED — cannot overwrite image');
  }

  const { data: sourceRaw, error: sourceErr } = await sb
    .from('assets')
    .select('*')
    .eq('id', body.fromAssetId)
    .maybeSingle();
  if (sourceErr) throw new Error(`source fetch: ${sourceErr.message}`);
  if (!sourceRaw) throw new NotFoundError(`Source asset ${body.fromAssetId}`);
  const source = sourceRaw as unknown as AssetRow;

  if (!source.staging_path && !source.drive_file_id) {
    throw new ValidationError(
      `Source asset ${source.filename} has neither staging_path nor drive_file_id — no image to copy`,
    );
  }

  // ── Mode gate ──────────────────────────────────────────────────────────────
  const mode = await resolveMode(sb, target);
  const decision = enforceMode(
    'UPLOAD_ASSET',
    { id: target.episode_id ?? target.id, governance_mode: mode },
    {
      directorConfirm: body.directorConfirm ?? false,
      confirmedBy: user.email ?? user.id,
      actor: 'director',
    },
  );
  if (!decision.allowed) {
    return apiOk(
      {
        action_blocked: true,
        reason: decision.reason ?? 'Action not allowed in this mode',
        mode_at_time: decision.modeAtTime,
        category: decision.category,
        requires_director: decision.requiresDirector,
      },
      undefined,
      { status: 403 },
    );
  }

  const sourceMeta = (source.metadata ?? {}) as Record<string, unknown>;
  const targetMeta = (target.metadata ?? {}) as Record<string, unknown>;
  const nowIso = new Date().toISOString();

  // Build new metadata: keep TARGET's content/provenance/description_history,
  // overlay source's image_prompt (if any), stamp clone trace + last_modified.
  const newMeta: Record<string, unknown> = {
    ...targetMeta,
    image_prompt: sourceMeta.image_prompt ?? targetMeta.image_prompt ?? null,
    cloned_from_asset_id: source.id,
    cloned_from_filename: source.filename,
    provenance: {
      ...((targetMeta.provenance as Record<string, unknown> | undefined) ?? {}),
      last_modified_at: nowIso,
      last_modified_by: 'EXEC-BIBLE-AUTHOR (copy-image-from)',
      last_modified_by_kind: 'agent',
      clone_trace: {
        from_asset_id: source.id,
        from_filename: source.filename,
        director_confirmed_by: user.email ?? user.id,
        mode_at_time: decision.modeAtTime,
        at: nowIso,
      },
    },
  };

  const { error: updErr } = await sb
    .from('assets')
    .update({
      staging_path: source.staging_path,
      drive_path: source.drive_path,
      drive_file_id: source.drive_file_id,
      drive_web_view_url: source.drive_web_view_url,
      metadata: newMeta as never,
    } as never)
    .eq('id', toAssetId);
  if (updErr) throw new Error(`target update failed: ${updErr.message}`);

  // TD-20.B autonomy — fires pa/notify-needed so Polina sees the clone.
  await logEvent(sb, {
    event_type: 'agent_completed',
    severity: 'info',
    title: `Image cloned: ${source.filename} → ${target.filename}`,
    description: `Carry-over image fields (staging + drive) from source asset. Text canon on target preserved.`,
    actor: 'EXEC-BIBLE-AUTHOR',
    asset_id: toAssetId,
    episode_id: target.episode_id,
    metadata: {
      kind: 'image_clone',
      from_asset_id: source.id,
      from_filename: source.filename,
      to_asset_id: target.id,
      to_filename: target.filename,
      mode_at_time: decision.modeAtTime,
      director_id: user.id,
    },
  });

  return apiOk({
    asset_id: toAssetId,
    action: 'image_cloned',
    from_asset_id: source.id,
    from_filename: source.filename,
    to_filename: target.filename,
    mode_at_time: decision.modeAtTime,
  });
});
