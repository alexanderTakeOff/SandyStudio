// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/providers/drive.ts
// Google Drive API v3 adapter for the `storage` contract.
// Phase 8 step 10 — replaces local public/staging/ as the canonical binary
// location. Asset rows get drive_file_id + drive_web_view_url.
//
// Operations exposed:
//   - uploadBinary({ filename, contentType, bytes, parentFolderId? }) → file id + view URL
//   - listAssetFolder({ folderId }) → minimal listing (debug)
//   - ensureFolder(name, parentId?) → folder id (creates if missing, idempotent)
//   - downloadFile(fileId) → ArrayBuffer
//   - deleteFile(fileId) → void
//
// All calls use OAuth refresh-token flow via google-auth.ts.
// Uploads use multipart/related (one round trip, metadata + bytes).
// ──────────────────────────────────────────────────────────────────────────────

import { getGoogleAccessToken, GoogleAuthError } from './google-auth';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

export class DriveError extends Error {
  constructor(
    message: string,
    public readonly status: number | null = null,
    public readonly body: string | null = null,
  ) {
    super(message);
    this.name = 'DriveError';
  }
}

async function authedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  let token: string;
  try {
    token = await getGoogleAccessToken();
  } catch (err) {
    if (err instanceof GoogleAuthError) throw new DriveError(err.message);
    throw err;
  }
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(url, { ...init, headers });
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  size?: string;
  createdTime?: string;
}

export async function ensureFolder(
  name: string,
  parentId?: string,
): Promise<DriveFile> {
  const queryParts = [
    `name = '${name.replace(/'/g, "\\'")}'`,
    `mimeType = '${FOLDER_MIME}'`,
    'trashed = false',
  ];
  if (parentId) queryParts.push(`'${parentId}' in parents`);
  const q = encodeURIComponent(queryParts.join(' and '));
  const listRes = await authedFetch(
    `${DRIVE_API}/files?q=${q}&fields=files(id,name,mimeType,webViewLink)&pageSize=1&spaces=drive`,
  );
  if (!listRes.ok) {
    throw new DriveError(
      `ensureFolder list failed (${listRes.status})`,
      listRes.status,
      (await listRes.text()).slice(0, 600),
    );
  }
  const listJson = (await listRes.json()) as { files?: DriveFile[] };
  const existing = listJson.files?.[0];
  if (existing) return existing;

  const meta: Record<string, unknown> = { name, mimeType: FOLDER_MIME };
  if (parentId) meta.parents = [parentId];
  const createRes = await authedFetch(`${DRIVE_API}/files?fields=id,name,mimeType,webViewLink`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(meta),
  });
  if (!createRes.ok) {
    throw new DriveError(
      `ensureFolder create failed (${createRes.status})`,
      createRes.status,
      (await createRes.text()).slice(0, 600),
    );
  }
  return (await createRes.json()) as DriveFile;
}

export interface UploadBinaryInput {
  filename: string;
  contentType: string;
  /** Raw bytes. Pass Buffer or Uint8Array. */
  bytes: Uint8Array;
  /** Optional Drive parent folder id. */
  parentFolderId?: string;
}

export interface UploadedDriveFile extends DriveFile {
  webViewLink: string;
}

export async function uploadBinary(input: UploadBinaryInput): Promise<UploadedDriveFile> {
  // Drive's multipart upload: a single body with metadata + binary, separated
  // by a boundary. Lighter on round trips than resumable upload for files <5MB,
  // perfectly fine up to ~100MB.
  const boundary = `sandystudio-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const meta: Record<string, unknown> = { name: input.filename, mimeType: input.contentType };
  if (input.parentFolderId) meta.parents = [input.parentFolderId];

  const metaPart =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify(meta) +
    `\r\n`;
  const fileHeader =
    `--${boundary}\r\n` +
    `Content-Type: ${input.contentType}\r\n\r\n`;
  const closing = `\r\n--${boundary}--`;

  const enc = new TextEncoder();
  const metaBytes = enc.encode(metaPart);
  const fileHeaderBytes = enc.encode(fileHeader);
  const closingBytes = enc.encode(closing);

  const body = new Uint8Array(
    metaBytes.length + fileHeaderBytes.length + input.bytes.length + closingBytes.length,
  );
  body.set(metaBytes, 0);
  body.set(fileHeaderBytes, metaBytes.length);
  body.set(input.bytes, metaBytes.length + fileHeaderBytes.length);
  body.set(closingBytes, metaBytes.length + fileHeaderBytes.length + input.bytes.length);

  const url = `${UPLOAD_API}?uploadType=multipart&fields=id,name,mimeType,webViewLink,size,createdTime`;
  const res = await authedFetch(url, {
    method: 'POST',
    headers: { 'content-type': `multipart/related; boundary=${boundary}` },
    body,
  });

  if (!res.ok) {
    throw new DriveError(
      `uploadBinary failed (${res.status})`,
      res.status,
      (await res.text()).slice(0, 800),
    );
  }
  const file = (await res.json()) as DriveFile;
  if (!file.id) throw new DriveError('uploadBinary: response missing id');
  return file as UploadedDriveFile;
}

export async function listAssetFolder(folderId: string): Promise<DriveFile[]> {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const res = await authedFetch(
    `${DRIVE_API}/files?q=${q}&fields=files(id,name,mimeType,webViewLink,size,createdTime)&pageSize=50`,
  );
  if (!res.ok) {
    throw new DriveError(`listAssetFolder failed (${res.status})`, res.status);
  }
  const json = (await res.json()) as { files?: DriveFile[] };
  return json.files ?? [];
}

export async function downloadFile(fileId: string): Promise<ArrayBuffer> {
  const res = await authedFetch(`${DRIVE_API}/files/${fileId}?alt=media`);
  if (!res.ok) {
    throw new DriveError(`downloadFile failed (${res.status})`, res.status);
  }
  return res.arrayBuffer();
}

export async function deleteFile(fileId: string): Promise<void> {
  const res = await authedFetch(`${DRIVE_API}/files/${fileId}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) {
    throw new DriveError(`deleteFile failed (${res.status})`, res.status);
  }
}
