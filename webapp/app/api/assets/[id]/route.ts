// ──────────────────────────────────────────────────────────────────────────────
// app/api/assets/[id]/route.ts
// GET asset detail. PATCH revision_log / description (status changes go through approve route).
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import {
  assertAssetTransition,
  type AssetStatus,
} from '@/lib/api/status-transitions';
import {
  buildProvenance,
  stampLastModified,
  type AssetMetadataDoc,
  type DescriptionHistoryEntry,
} from '@/lib/api/series-bible';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PatchBody = z.object({
  description:  z.string().max(2000).optional(),
  /** Markdown body — versioned in metadata.description_history when changed. */
  content:      z.string().max(200_000).optional(),
  revision_log: z.string().max(4000).optional(),
  status:       z.string().optional(),  // soft transition; hard ones go through /approve
});

export const GET = withApiHandler(async (_req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const id = params?.id;
  if (!id) throw new NotFoundError('Asset');

  const { supabase } = await requireDirector();
  const { data, error } = await supabase
    .from('assets')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`asset fetch failed: ${error.message}`);
  if (!data) throw new NotFoundError(`Asset ${id}`);
  return apiOk(data);
});

export const PATCH = withApiHandler(async (req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const id = params?.id;
  if (!id) throw new NotFoundError('Asset');

  const { user, supabase } = await requireDirector();
  const body = await parseJson(req, PatchBody);

  const { data: asset, error } = await supabase
    .from('assets')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`asset fetch failed: ${error.message}`);
  if (!asset) throw new NotFoundError(`Asset ${id}`);

  // Refuse mutations to LOCKED assets — defence in depth alongside DB CHECK.
  if (asset.status === 'LOCKED' && (body.description !== undefined || body.content !== undefined)) {
    throw new ValidationError('Asset is LOCKED — cannot edit description or content');
  }

  const patch: Record<string, unknown> = {};
  if (body.description !== undefined) patch.description = body.description;
  if (body.revision_log !== undefined) patch.revision_log = body.revision_log;
  if (body.status !== undefined) {
    // Disallow direct APPROVE/LOCKED via PATCH — those go through /approve
    if (body.status === 'APPROVED' || body.status === 'LOCKED') {
      throw new ValidationError(
        `Use /api/assets/[id]/approve to set status to ${body.status}`,
      );
    }
    assertAssetTransition(asset.status as AssetStatus, body.status as AssetStatus);
    patch.status = body.status;
  }

  // Markdown body version + provenance update — only when content actually changes.
  // We store description history in metadata so the audit trail survives without
  // proliferating columns. content stays in the dedicated `content` column.
  let contentChanged = false;
  if (body.content !== undefined && body.content !== (asset.content ?? '')) {
    contentChanged = true;
    patch.content = body.content;
  }

  const hasMeaningfulChange =
    contentChanged ||
    body.description !== undefined ||
    body.revision_log !== undefined ||
    body.status !== undefined;

  if (hasMeaningfulChange) {
    // types.gen lags behind migration 0020 — cast through unknown to read.
    const existingMeta = (((asset as unknown as { metadata?: AssetMetadataDoc | null }).metadata) ?? {}) as AssetMetadataDoc;
    const nowIso = new Date().toISOString();
    const directorLabel = user.email ?? user.id;

    // Resolve current Mode for audit. Episode-level uses governance_mode column;
    // series-level (Bible) defaults to 1 (Director's manual canon work).
    let modeAtTime: 1 | 2 | 3 | 4 = 1;
    if (asset.episode_id) {
      const { data: ep } = await supabase
        .from('episodes')
        .select('governance_mode')
        .eq('id', asset.episode_id)
        .maybeSingle();
      const m = (ep as { governance_mode?: number } | null)?.governance_mode;
      if (m === 1 || m === 2 || m === 3 || m === 4) modeAtTime = m;
    }

    // Append a new description_history entry only when the markdown body
    // changed (description-only PATCH is treated as a one-line summary edit).
    let nextDescriptionHistory = existingMeta.description_history;
    if (contentChanged) {
      const prevVersion = existingMeta.description_history?.current_version ?? 0;
      const nextVersion = prevVersion + 1;
      const entry: DescriptionHistoryEntry = {
        version: nextVersion,
        content: body.content ?? '',
        source: 'director_edit',
        at: nowIso,
      };
      nextDescriptionHistory = {
        current_version: nextVersion,
        history: [...(existingMeta.description_history?.history ?? []), entry],
      };
    }

    const provenance = existingMeta.provenance
      ? stampLastModified(existingMeta.provenance, directorLabel, 'director', nowIso, modeAtTime)
      : buildProvenance({
          by: directorLabel,
          byKind: 'director',
          source: 'manual_add',
          at: nowIso,
          modeAtTime,
        });

    const newMeta: AssetMetadataDoc = {
      ...existingMeta,
      provenance,
      ...(nextDescriptionHistory ? { description_history: nextDescriptionHistory } : {}),
    };
    patch.metadata = newMeta;
  }

  if (Object.keys(patch).length === 0) return apiOk(asset);

  const { data: updated, error: updErr } = await supabase
    .from('assets')
    .update(patch as never)
    .eq('id', id)
    .select('*')
    .single();
  if (updErr) throw new Error(`asset update failed: ${updErr.message}`);

  // Stamp mode_at_time for audit consistency with regenerate-image / upload.
  const modeForAudit = (((updated as unknown as { metadata?: AssetMetadataDoc | null })
    .metadata?.provenance?.last_modified_mode) ??
    ((updated as unknown as { metadata?: AssetMetadataDoc | null })
      .metadata?.provenance?.mode_at_time) ??
    1);

  await supabase.from('activity_events').insert({
    event_type: 'asset_updated',
    severity: 'info',
    title: `Asset ${asset.filename} updated`,
    description: `By ${user.email ?? user.id}`,
    actor: user.id,
    asset_id: id,
    episode_id: asset.episode_id,
    metadata: { patch, mode_at_time: modeForAudit },
  } as never);

  return apiOk(updated);
});
