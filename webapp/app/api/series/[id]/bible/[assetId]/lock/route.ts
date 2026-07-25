// ──────────────────────────────────────────────────────────────────────────────
// app/api/series/[id]/bible/[assetId]/lock/route.ts
// Director-only LOCK transition for a Series Bible asset.
//
// LOCKED is final per specs/rules/canon_versioning.md. Once locked, the asset
// is immutable and cannot be deleted; only forked into a new version.
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { assertHumanDirector, requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { assertFinalizedMediaHasDriveBackup } from '@/lib/api/media-backup-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LockBody = z.object({
  /** Optional Director note for the audit log. */
  note: z.string().max(2000).optional(),
});

export const POST = withApiHandler(async (req, ctx) => {
  const params = (await ctx?.params) as { id: string; assetId: string } | undefined;
  const seriesId = params?.id;
  const assetId = params?.assetId;
  if (!seriesId) throw new NotFoundError('Series');
  if (!assetId) throw new NotFoundError('Bible asset');

  const dir = await requireDirector();
  assertHumanDirector(dir); // hard limit — LOCKED is human-Director-only
  const { user, supabase } = dir;
  const body = await parseJson(req, LockBody);

  const { data: asset, error } = await supabase
    .from('assets')
    .select('*')
    .eq('id', assetId)
    .maybeSingle();
  if (error) throw new Error(`asset fetch failed: ${error.message}`);
  if (!asset) throw new NotFoundError(`Bible asset ${assetId}`);

  if (asset.series_id !== seriesId) {
    throw new ValidationError(
      `Asset ${assetId} does not belong to series ${seriesId}`,
    );
  }
  if (!asset.file_type.startsWith('SBL-')) {
    throw new ValidationError(
      `Asset ${asset.filename} is not a Bible asset (file_type ${asset.file_type})`,
    );
  }
  if (asset.status === 'LOCKED') {
    throw new ValidationError(`Asset is already LOCKED — fork to v${(asset.version ?? 1) + 1} to evolve`);
  }
  if (asset.status === 'REJECTED') {
    throw new ValidationError(`Cannot lock a REJECTED asset; revise first`);
  }

  // Root-cause guard (2026-07-22 incident): a Bible canon image/video must have
  // a Drive backup before LOCK, else it is lost on the next cache clear (exactly
  // how empty_background became a placeholder). No-op for text canon (.md) and
  // mock storage.
  await assertFinalizedMediaHasDriveBackup(supabase, asset, 'LOCKED');

  // Filename rename: status segment goes from -DRAFT/REVIEW/REVISION/APPROVED to -LOCKED.
  // Pattern: <prefix>-v<NN>-<STATUS>.<ext>
  const newFilename = asset.filename.replace(
    /-(DRAFT|REVIEW|REVISION|APPROVED)\.([a-zA-Z0-9]+)$/,
    '-LOCKED.$2',
  );

  const { data: updated, error: uerr } = await supabase
    .from('assets')
    .update({ status: 'LOCKED', filename: newFilename })
    .eq('id', assetId)
    .select('*')
    .single();
  if (uerr) throw new Error(`lock update failed: ${uerr.message}`);

  await supabase.from('approvals').insert({
    asset_id: assetId,
    episode_id: null,
    approved_by: 'DIRECTOR',
    approval_type: 'LOCK',
    notes: body.note ?? null,
  } as never);

  await supabase.from('activity_events').insert({
    event_type: 'approval_granted',
    severity: 'info',
    title: `Bible LOCKED: ${updated.filename}`,
    description:
      body.note ?? `Director ${user.email ?? user.id} locked the canonical asset`,
    actor: user.id,
    asset_id: assetId,
    episode_id: null,
    series_id: seriesId,
    metadata: { kind: 'bible_lock', file_type: updated.file_type },
  } as never);

  return apiOk(updated);
});
