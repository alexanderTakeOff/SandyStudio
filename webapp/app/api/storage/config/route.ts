// ──────────────────────────────────────────────────────────────────────────────
// app/api/storage/config/route.ts
// Storage configuration (multi-channel Phase 4e rework).
//
// The old panel managed `project_root` / `media_storage_root` — paths NOTHING
// in the runtime actually read (the real writers use MEDIA_CACHE_DIR + the
// Drive layout root). The two REAL knobs are:
//
//   media_cache_dir  → env MEDIA_CACHE_DIR (lib/media-cache.ts reads it lazily);
//                      persisted to .env.local + process.env via persistEnvValue
//                      so it applies without a restart. Probed with mkdir -p.
//   drive_root_name  → app_config scope='storage', key='drive_root_name';
//                      read by persist-binary's driveRootName() (TTL-cached).
//                      Validated with a REAL Drive ensureFolder when Drive
//                      credentials are configured.
//
//   GET  → current values + writable flag + last_validated_at
//   POST → validate + persist both
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import { ValidationError } from '@/lib/api/errors';
import { runWriteTest } from '@/lib/api/storage-probe';
import { persistEnvValue } from '@/lib/persist-env';
import { mediaCacheRoot } from '@/lib/media-cache';
import { bustDriveRootNameCache } from '@/lib/agents/persist-binary';
import { ensureFolder, DriveError } from '@/lib/agents/providers/drive';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const StorageBody = z.object({
  media_cache_dir: z.string().min(1).max(240),
  drive_root_name: z.string().regex(/^[A-Za-z0-9 _.-]{1,64}$/, 'Folder name: letters, digits, space, _ . - (max 64)'),
});

interface StorageConfig {
  media_cache_dir: string;
  media_cache_writable: boolean;
  drive_root_name: string;
  drive_validated: boolean;
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
    // Effective runtime value (env override or default) — NOT the DB mirror,
    // so the panel always shows what writers actually use.
    media_cache_dir: mediaCacheRoot(),
    media_cache_writable: (map.get('media_cache_writable') as boolean | undefined) ?? false,
    drive_root_name: (map.get('drive_root_name') as string | undefined) ?? 'SandyStudio',
    drive_validated: (map.get('drive_validated') as boolean | undefined) ?? false,
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

  // Cache dir: mkdir -p + write-probe (the cache root is created on demand by
  // writers anyway, so probing an absent folder should create it, not fail).
  const probe = await runWriteTest(body.media_cache_dir, { createIfMissing: true });
  if (!probe.writable) {
    throw new ValidationError('Media cache dir failed write-test', { media_cache_dir: probe });
  }

  // Drive root: validate with a REAL ensureFolder when Drive creds exist
  // (idempotent — finds or creates the root folder). Without creds (dev /
  // replay-pilot) we persist unvalidated and say so via drive_validated=false.
  let driveValidated = false;
  if (process.env.GOOGLE_REFRESH_TOKEN) {
    try {
      await ensureFolder(body.drive_root_name);
      driveValidated = true;
    } catch (err) {
      const detail = err instanceof DriveError ? err.message : (err as Error).message;
      throw new ValidationError(`Drive root folder check failed: ${detail}`);
    }
  }

  const old = await readStorageConfig(supabase);
  const now = new Date().toISOString();

  // Env is the runtime source for the cache dir — applies without a restart.
  persistEnvValue('MEDIA_CACHE_DIR', body.media_cache_dir);

  await upsertStorage(supabase, [
    { key: 'media_cache_dir', value: body.media_cache_dir },
    { key: 'media_cache_writable', value: true },
    { key: 'drive_root_name', value: body.drive_root_name },
    { key: 'drive_validated', value: driveValidated },
    { key: 'last_validated_at', value: now },
    { key: 'last_validated_by', value: user.id },
  ]);
  bustDriveRootNameCache();

  await supabase.from('activity_events').insert({
    event_type: 'storage_config_change',
    severity: 'warning',
    title: 'Storage config updated',
    description: `media_cache_dir: ${old.media_cache_dir} → ${body.media_cache_dir}; drive_root_name: ${old.drive_root_name} → ${body.drive_root_name}`,
    actor: user.id,
    metadata: { old, new: body },
  } as never);

  const cfg = await readStorageConfig(supabase);
  return apiOk(cfg);
});
