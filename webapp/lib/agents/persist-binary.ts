// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/persist-binary.ts
// Single helper for binary persistence used by EXEC-THUMB / EXEC-EDIT /
// EXEC-VGEN. Always writes a local cache under webapp/public/staging/ so the
// browser can render fast; additionally uploads to Drive when the resolver
// reports storage='drive_native'.
//
// Per provider_strategy.md §5: Drive is the canonical store for binaries,
// the local cache is best-effort fast-load. If Drive upload fails, the agent
// run does NOT fail — we log and continue with local-only. This matches the
// resolver's auto-downgrade-to-mock philosophy.
// ──────────────────────────────────────────────────────────────────────────────

import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/types.gen';
import { ensureFolder, uploadBinary, DriveError } from './providers/drive';
import { resolveProvider } from './provider-resolver';

export type BinaryExt = 'png' | 'jpg' | 'webp' | 'mp4' | 'mov' | 'wav' | 'mp3';

const CONTENT_TYPE_BY_EXT: Record<BinaryExt, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
};

export interface PersistBinaryArgs {
  /** base64-encoded body, no data: URI prefix. */
  base64: string;
  ext: BinaryExt;
  /** Drive filename. Should be the canonical SS-... filename when known. */
  driveFilename: string;
  /** Hint for local cache filename (will get a random suffix appended). */
  localHint?: string;
  /**
   * Legacy layout (kept for backward compat with S14 episode chain).
   * Maps to `/SandyStudio/<episodeCode>/<file>` when none of the new-layout
   * fields are supplied. Director's directive 2026-05-20: leave S14 files
   * alone, start writing S15+ into the new layout via `seriesCode + bucket`.
   */
  episodeCode?: string;
  /**
   * New layout 2026-05-20. When `seriesCode` AND `bucket` are both set, the
   * Drive folder layout becomes:
   *   /SandyStudio/<seriesCode>/<bucket>/<assetType>/<file>
   *   e.g. /SandyStudio/SS-S15/bible/images/SS-S15-SBL-*.png
   *        /SandyStudio/SS-S15/E01/video/SS-S15-E01-VID-shot_*.mp4
   * `bucket` is either the literal string 'bible' (series-scoped Library)
   * or an episode short like 'E01' / 'E02' (episode-scoped).
   * `assetType` defaults to derive-from-ext (png/jpg/webp → images,
   *  mp4/mov → video, wav/mp3 → audio).
   */
  seriesCode?: string;
  bucket?: 'bible' | string;
  assetType?: 'images' | 'video' | 'audio';
  /** Authenticated Supabase client for the resolver lookup. */
  supabase: SupabaseClient<Database>;
}

function deriveAssetTypeFromExt(ext: BinaryExt): 'images' | 'video' | 'audio' {
  if (ext === 'png' || ext === 'jpg' || ext === 'webp') return 'images';
  if (ext === 'mp4' || ext === 'mov') return 'video';
  return 'audio';
}

export interface PersistedBinary {
  /** Public URL the browser can fetch — always set. e.g. "/staging/<file>". */
  browserUrl: string;
  /** Server-side absolute path to the local cache. */
  absolutePath: string;
  /** Drive file id when storage=drive_native and upload succeeded. */
  driveFileId: string | null;
  /** Drive web view link (preview page URL) when uploaded. */
  driveWebViewUrl: string | null;
  /** Provider id reported by the resolver — useful for telemetry. */
  storageProviderId: string;
  /** True if drive_native was requested but upload failed (we still kept local). */
  driveUploadFailed: boolean;
}

const STAGING_DIR_NAME = ['public', 'staging'] as const;

async function writeLocalCache(args: {
  base64: string;
  ext: BinaryExt;
  hint?: string;
}): Promise<{ browserUrl: string; absolutePath: string }> {
  const dir = path.join(process.cwd(), ...STAGING_DIR_NAME);
  await fs.mkdir(dir, { recursive: true });
  const rand = crypto.randomBytes(6).toString('hex');
  const filename = `${args.hint ? `${args.hint}-` : ''}${rand}.${args.ext}`;
  const absolutePath = path.join(dir, filename);
  await fs.writeFile(absolutePath, Buffer.from(args.base64, 'base64'));
  return {
    absolutePath,
    browserUrl: `/staging/${filename}`,
  };
}

async function uploadToDrive(args: {
  base64: string;
  ext: BinaryExt;
  filename: string;
  episodeCode?: string;
  seriesCode?: string;
  bucket?: string;
  assetType?: 'images' | 'video' | 'audio';
}): Promise<{ id: string; webViewLink: string }> {
  // Two layouts coexist (Director directive 2026-05-20):
  //
  //  NEW: /SandyStudio/<seriesCode>/<bucket>/<assetType>/<file>
  //         used when both seriesCode AND bucket are supplied.
  //         bucket is 'bible' for series Library, 'E01' / 'E02' for episodes.
  //         assetType is images / video / audio (derived from ext if omitted).
  //
  //  LEGACY: /SandyStudio/<episodeCode>/<file>  (S14 episode flow)
  //         used when only episodeCode is supplied. Director said leave S14
  //         files where they are — this branch keeps that contract.
  //
  // If neither is supplied, falls back to root /SandyStudio/<file> (the old
  // Bible behaviour that left files homeless — should not happen after the
  // route refactor in the same commit).
  const sandyFolder = await ensureFolder('SandyStudio');

  if (args.seriesCode && args.bucket) {
    const seriesFolder = await ensureFolder(args.seriesCode, sandyFolder.id);
    const bucketFolder = await ensureFolder(args.bucket, seriesFolder.id);
    const assetType = args.assetType ?? deriveAssetTypeFromExt(args.ext);
    const typeFolder = await ensureFolder(assetType, bucketFolder.id);
    const uploaded = await uploadBinary({
      filename: args.filename,
      contentType: CONTENT_TYPE_BY_EXT[args.ext],
      bytes: Buffer.from(args.base64, 'base64'),
      parentFolderId: typeFolder.id,
    });
    return { id: uploaded.id, webViewLink: uploaded.webViewLink };
  }

  const targetFolder = args.episodeCode
    ? await ensureFolder(args.episodeCode, sandyFolder.id)
    : sandyFolder;
  const uploaded = await uploadBinary({
    filename: args.filename,
    contentType: CONTENT_TYPE_BY_EXT[args.ext],
    bytes: Buffer.from(args.base64, 'base64'),
    parentFolderId: targetFolder.id,
  });
  return { id: uploaded.id, webViewLink: uploaded.webViewLink };
}

export async function persistBinary(args: PersistBinaryArgs): Promise<PersistedBinary> {
  // 1. Local cache — always succeeds (fs writable).
  const local = await writeLocalCache({
    base64: args.base64,
    ext: args.ext,
    hint: args.localHint,
  });

  // 2. Resolve storage provider. On error (no row, contract disabled), default
  //    to mock semantics (no Drive upload). This mirrors the runner's own
  //    "provider undefined → mock" fallback.
  let storageProviderId = 'mock';
  try {
    const resolved = await resolveProvider(args.supabase, 'storage');
    storageProviderId = resolved.providerId;
  } catch {
    storageProviderId = 'mock';
  }

  if (storageProviderId !== 'drive_native') {
    return {
      ...local,
      driveFileId: null,
      driveWebViewUrl: null,
      storageProviderId,
      driveUploadFailed: false,
    };
  }

  // 3. Auto-resolve new layout from legacy episodeCode (Director directive
  //    2026-05-20). Episode runners (runner.ts, episode-references.ts,
  //    eref-upscale-only.ts) all pass episodeCode like "SS-S15-E01" but no
  //    seriesCode/bucket — split that string into the new layout so they
  //    don't need touching individually. Bible callers pass seriesCode +
  //    bucket explicitly and bypass this path.
  let resolvedSeriesCode = args.seriesCode;
  let resolvedBucket = args.bucket;
  let resolvedAssetType = args.assetType;
  if (!resolvedSeriesCode && !resolvedBucket && args.episodeCode) {
    const m = /^(SS-[A-Z0-9]+)-(E\d+)$/i.exec(args.episodeCode);
    if (m) {
      resolvedSeriesCode = m[1];
      resolvedBucket = m[2].toUpperCase();
      resolvedAssetType = resolvedAssetType ?? deriveAssetTypeFromExt(args.ext);
    }
  }

  // 4. Drive upload. Failure is non-fatal — local cache still serves the
  //    asset, the next agent re-trigger or a follow-up sync job can heal it.
  try {
    const drive = await uploadToDrive({
      base64: args.base64,
      ext: args.ext,
      filename: args.driveFilename,
      // Legacy episodeCode is only honoured when auto-resolve fails (i.e.
      // unparseable episodeCode like "SS-PILOT-old"). That falls back to
      // the flat /SandyStudio/<episodeCode>/<file> layout.
      episodeCode: resolvedSeriesCode ? undefined : args.episodeCode,
      seriesCode: resolvedSeriesCode,
      bucket: resolvedBucket,
      assetType: resolvedAssetType,
    });
    return {
      ...local,
      driveFileId: drive.id,
      driveWebViewUrl: drive.webViewLink,
      storageProviderId,
      driveUploadFailed: false,
    };
  } catch (err) {
    const detail = err instanceof DriveError ? `${err.message}${err.body ? ` — ${err.body.slice(0, 200)}` : ''}` : (err as Error).message;
    // Use console.warn rather than logger lib (we don't have one centralised yet).
    // eslint-disable-next-line no-console
    console.warn(`[persistBinary] Drive upload failed, kept local only: ${detail}`);
    return {
      ...local,
      driveFileId: null,
      driveWebViewUrl: null,
      storageProviderId,
      driveUploadFailed: true,
    };
  }
}
