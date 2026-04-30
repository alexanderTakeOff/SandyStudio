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
  /** Episode code for Drive folder organisation, e.g. "SS-S01-E02". */
  episodeCode?: string;
  /** Authenticated Supabase client for the resolver lookup. */
  supabase: SupabaseClient<Database>;
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
}): Promise<{ id: string; webViewLink: string }> {
  // Folder layout: /SandyStudio/{episodeCode}/<file> (top folder created on first use)
  const seriesFolder = await ensureFolder('SandyStudio');
  const targetFolder = args.episodeCode
    ? await ensureFolder(args.episodeCode, seriesFolder.id)
    : seriesFolder;

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

  // 3. Drive upload. Failure is non-fatal — local cache still serves the
  //    asset, the next agent re-trigger or a follow-up sync job can heal it.
  try {
    const drive = await uploadToDrive({
      base64: args.base64,
      ext: args.ext,
      filename: args.driveFilename,
      episodeCode: args.episodeCode,
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
