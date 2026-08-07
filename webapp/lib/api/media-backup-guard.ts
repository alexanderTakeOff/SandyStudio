// ──────────────────────────────────────────────────────────────────────────────
// lib/api/media-backup-guard.ts
// Fail-loud guard: a Bible canon image/video must not be finalized (APPROVED /
// LOCKED) without a Drive backup. Root-cause fix for the 2026-07-22 incident
// where SS-S15-SBL-location_empty_background was LOCKED with drive_file_id =
// null — its bytes lived only in the local media cache and vanished on the next
// cache clear (stack rebuild for E31), leaving a placeholder in the Library.
//
// Drive is the canonical binary store (provider_strategy.md §5); the local cache
// is best-effort fast-load. Finalizing a canon without the canonical copy is a
// silent time-bomb, so we block it at the Bible finalize points.
//
// SCOPE — deliberately narrowed to Bible canon (`SBL-*` image/video). The
// 2026-07-22 audit (scripts/audit-media-backup.ts) found 28 finalized EPISODE
// media (mostly music, some old thumbnails/shots) already sitting at NULL
// drive_file_id — episode audio/video persistence does NOT reliably carry a
// Drive id today, so guarding APPROVE on those would false-block the pipeline
// (and the E31 smoke). Bible canon is the point of pain and is always
// Drive-backed on the healthy path; episode-media backing is a separate,
// documented debt to close once VGEN/music persistence is confirmed.
//
// Exempt by design: mock / local-dev storage (resolver reports a non-drive
// provider) — those installs legitimately have no Drive id.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/types.gen';
import { resolveProvider } from '../provider-resolver';
import { ValidationError } from './errors';

/** Bible canon binary filenames whose bytes MUST be Drive-backed before finalize. */
const MEDIA_EXT = /\.(png|jpe?g|webp|mp4|mov)$/i;
const FINALIZE_STATUSES: ReadonlySet<string> = new Set(['APPROVED', 'LOCKED']);

/** Minimal asset shape — structurally compatible with the full `assets` row. */
export interface MediaBackupAsset {
  filename?: string | null;
  file_type?: string | null;
  drive_file_id?: string | null;
}

/** True only for a Bible canon (`SBL-*`) image/video — the guarded family. */
function isBibleCanonMedia(asset: MediaBackupAsset): boolean {
  const ft = asset.file_type ?? '';
  return typeof ft === 'string' && ft.startsWith('SBL-') && MEDIA_EXT.test(asset.filename ?? '');
}

/**
 * Throw a ValidationError when `asset` is a Bible canon image/video being
 * finalized to APPROVED / LOCKED while it has no Drive backup (`drive_file_id`
 * is null) AND the active storage provider is Drive. No-op for non-Bible /
 * non-media assets, text canon (.md), non-final target statuses, already-backed
 * assets, and mock/local storage.
 */
export async function assertFinalizedMediaHasDriveBackup(
  supabase: SupabaseClient<Database>,
  asset: MediaBackupAsset,
  targetStatus: string,
): Promise<void> {
  if (!FINALIZE_STATUSES.has(targetStatus)) return;
  if (!isBibleCanonMedia(asset)) return;
  if (asset.drive_file_id) return; // already backed up — nothing to guard

  // Only enforce when Drive is the active binary store. Mock / missing-key
  // installs auto-downgrade to 'mock' and are legitimately Drive-less.
  let providerId = 'mock';
  try {
    providerId = (await resolveProvider(supabase, 'storage')).providerId;
  } catch {
    providerId = 'mock';
  }
  if (providerId !== 'drive_native') return;

  throw new ValidationError(
    `Cannot finalize "${asset.filename ?? asset.file_type}" to ${targetStatus} ` +
      `without a Drive backup (drive_file_id is null). The media lives only in the ` +
      `local cache and would be lost on the next cache clear. Re-upload / re-persist ` +
      `the media (which uploads to Drive) and retry.`,
  );
}
