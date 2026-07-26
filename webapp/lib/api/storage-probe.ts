// ──────────────────────────────────────────────────────────────────────────────
// lib/api/storage-probe.ts
// Filesystem write-test probe per storage_configuration.md §4.
// Server-only.
// ──────────────────────────────────────────────────────────────────────────────

import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ValidationError, ApiError } from './errors';

export interface ProbeResult {
  writable: boolean;
  error?: string;
  errorCode?: string;
}

const STUDIO_REPO_ROOT = 'C:\\SandyStudio\\';
const STUDIO_FILMS_SUBDIR = 'C:\\SandyStudio\\FILMS\\';
const FORBIDDEN_PREFIXES = [
  'C:\\Windows\\',
  'C:\\Program Files\\',
  'C:\\Program Files (x86)\\',
];

/**
 * Reject paths that are clearly unsafe per storage_configuration.md §8.1.
 * Returns ValidationError on reject, undefined on accept.
 */
export function validateStoragePath(rawPath: string): void {
  if (!rawPath || rawPath.trim().length === 0) {
    throw new ValidationError('Path must not be empty');
  }
  if (rawPath.length > 240) {
    throw new ValidationError('Path is longer than 240 chars');
  }

  // Normalize and detect traversal.
  const normalized = path.normalize(rawPath);
  if (normalized.includes('..')) {
    throw new ValidationError('Path contains traversal (..) after normalization');
  }

  // Case-insensitive comparison on Windows-style paths.
  const lc = normalized.toLowerCase();

  // Studio repo guard — only allow C:\SandyStudio\FILMS\ subtree.
  if (lc.startsWith(STUDIO_REPO_ROOT.toLowerCase())) {
    if (!lc.startsWith(STUDIO_FILMS_SUBDIR.toLowerCase())) {
      throw new ValidationError(
        `Path is inside the studio repo (${STUDIO_REPO_ROOT}) but not under FILMS\\. ` +
          `The studio repo is forbidden as a write target except for FILMS\\.`,
      );
    }
  }

  for (const forbidden of FORBIDDEN_PREFIXES) {
    if (lc.startsWith(forbidden.toLowerCase())) {
      throw new ValidationError(`Path is inside a system directory (${forbidden})`);
    }
  }
}

/**
 * Run the probe. Creates and deletes a 0-byte file at the target.
 * Errors are mapped to friendly messages per storage_configuration.md §4.1.
 * `createIfMissing` (Phase 4e, media-cache dir): mkdir -p the folder first —
 * the cache root is created on demand by writers anyway, so demanding a
 * pre-existing folder from the Director was pure friction.
 */
export async function runWriteTest(
  rawPath: string,
  opts?: { createIfMissing?: boolean },
): Promise<ProbeResult> {
  try {
    validateStoragePath(rawPath);
  } catch (e) {
    if (e instanceof ApiError) {
      return { writable: false, error: e.message, errorCode: e.code };
    }
    throw e;
  }

  const dir = path.normalize(rawPath);
  const probeName = `.sandystudio_probe_${crypto.randomUUID()}`;
  const probePath = path.join(dir, probeName);

  try {
    if (opts?.createIfMissing) {
      await fs.mkdir(dir, { recursive: true });
    }
    // Verify the directory exists and is a directory.
    const stat = await fs.stat(dir).catch(() => null);
    if (!stat) {
      return {
        writable: false,
        error: 'Folder does not exist. Create it manually or pick a different path.',
        errorCode: 'ENOENT',
      };
    }
    if (!stat.isDirectory()) {
      return {
        writable: false,
        error: 'Path points to a file, not a folder.',
        errorCode: 'ENOTDIR',
      };
    }

    await fs.writeFile(probePath, '', { flag: 'wx' });
    const written = await fs.stat(probePath);
    if (written.size !== 0) {
      // unlikely; treat as failure
      await fs.unlink(probePath).catch(() => undefined);
      return {
        writable: false,
        error: 'Probe file size mismatch; storage may be corrupt.',
        errorCode: 'PROBE_SIZE',
      };
    }
    await fs.unlink(probePath);
    return { writable: true };
  } catch (e) {
    // best-effort cleanup
    await fs.unlink(probePath).catch(() => undefined);
    const code = (e as { code?: string }).code ?? 'UNKNOWN';
    return { writable: false, error: friendlyError(code), errorCode: code };
  }
}

function friendlyError(code: string): string {
  switch (code) {
    case 'EACCES':
    case 'EPERM':
      return 'Permission denied. Run SandyStudio as the user that owns this folder, or grant write access.';
    case 'ENOENT':
      return 'Folder does not exist. Create it manually or pick a different path.';
    case 'EROFS':
      return 'Read-only filesystem. Pick a writable drive (HDD/SSD/Drive sync).';
    case 'ENOSPC':
      return 'No free space on this drive.';
    case 'ENOTDIR':
      return 'Path points to a file, not a folder.';
    case 'EEXIST':
      return 'A probe file already exists; previous test may have crashed. Retry.';
    default:
      return `Probe failed: ${code}`;
  }
}
