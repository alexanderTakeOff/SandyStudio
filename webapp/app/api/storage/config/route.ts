// ──────────────────────────────────────────────────────────────────────────────
// app/api/storage/config/route.ts
// Storage configuration per specs/system/storage_configuration.md §6.
//
//   GET  → current paths + writable flags + last_validated_at
//   POST → write paths (runs probe server-side before persisting)
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import { ApiError, ValidationError } from '@/lib/api/errors';
import { runWriteTest, validateStoragePath } from '@/lib/api/storage-probe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const StorageBody = z.object({
  project_root: z.string().min(1).max(240),
  media_storage_root: z.string().min(1).max(240),
});

interface StorageConfig {
  project_root: string;
  media_storage_root: string;
  project_root_writable: boolean;
  media_root_writable: boolean;
  last_validated_at: string | null;
  last_validated_by: string | null;
}

async function readStorageConfig(
  supabase: Awaited<ReturnType<typeof requireDirector>>['supabase'],
): Promise<StorageConfig> {
  const { data, error } = await supabase
    .from('app_config')
    .select('key,value')
    .eq('scope', 'storage');
  if (error) throw new Error(`storage config read failed: ${error.message}`);
  const map = new Map<string, unknown>();
  for (const row of data ?? []) map.set(row.key, row.value);
  return {
    project_root: (map.get('project_root') as string | undefined) ?? 'C:\\SandyStudio\\FILMS\\',
    media_storage_root:
      (map.get('media_storage_root') as string | undefined) ??
      'H:\\My Drive\\SandyStudio_Media\\',
    project_root_writable: (map.get('project_root_writable') as boolean | undefined) ?? false,
    media_root_writable: (map.get('media_root_writable') as boolean | undefined) ?? false,
    last_validated_at: (map.get('last_validated_at') as string | null | undefined) ?? null,
    last_validated_by: (map.get('last_validated_by') as string | null | undefined) ?? null,
  };
}

async function upsertStorage(
  supabase: Awaited<ReturnType<typeof requireDirector>>['supabase'],
  rows: Array<{ key: string; value: unknown }>,
) {
  const now = new Date().toISOString();
  const { error } = await supabase.from('app_config').upsert(
    rows.map((r) => ({
      scope: 'storage',
      key: r.key,
      value: r.value as never,
      source: 'ui_edit',
      synced_at: now,
    })),
    { onConflict: 'scope,key' },
  );
  if (error) throw new Error(`storage config write failed: ${error.message}`);
}

export const GET = withApiHandler(async () => {
  const { supabase } = await requireDirector();
  const cfg = await readStorageConfig(supabase);
  return apiOk(cfg);
});

export const POST = withApiHandler(async (req) => {
  const { user, supabase } = await requireDirector();
  const body = await parseJson(req, StorageBody);

  // Server-side validation of both paths (cheap, before any FS I/O).
  try {
    validateStoragePath(body.project_root);
    validateStoragePath(body.media_storage_root);
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ValidationError('Path validation failed');
  }

  const [pr, mr] = await Promise.all([
    runWriteTest(body.project_root),
    runWriteTest(body.media_storage_root),
  ]);

  if (!pr.writable || !mr.writable) {
    throw new ValidationError('One or more paths failed write-test', {
      project_root: pr,
      media_storage_root: mr,
    });
  }

  const old = await readStorageConfig(supabase);
  const now = new Date().toISOString();
  await upsertStorage(supabase, [
    { key: 'project_root', value: body.project_root },
    { key: 'media_storage_root', value: body.media_storage_root },
    { key: 'project_root_writable', value: true },
    { key: 'media_root_writable', value: true },
    { key: 'last_validated_at', value: now },
    { key: 'last_validated_by', value: user.id },
  ]);

  await supabase.from('activity_events').insert({
    event_type: 'storage_config_change',
    severity: 'warning',
    title: 'Storage paths updated',
    description: `project_root: ${old.project_root} → ${body.project_root}; media_root: ${old.media_storage_root} → ${body.media_storage_root}`,
    actor: user.id,
    metadata: { old, new: body },
  });

  const cfg = await readStorageConfig(supabase);
  return apiOk(cfg);
});
