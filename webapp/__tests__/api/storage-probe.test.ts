// ──────────────────────────────────────────────────────────────────────────────
// __tests__/api/storage-probe.test.ts
// Storage probe path validation per storage_configuration.md §8.
// FS-side runWriteTest is exercised against a tmp directory.
// ──────────────────────────────────────────────────────────────────────────────

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  validateStoragePath,
  runWriteTest,
  isProbablyDriveFolder,
} from '@/lib/api/storage-probe';

describe('validateStoragePath', () => {
  it('accepts FILMS subdirectory under studio repo', () => {
    expect(() => validateStoragePath('C:\\SandyStudio\\FILMS\\')).not.toThrow();
    expect(() => validateStoragePath('C:\\SandyStudio\\FILMS\\Sandy\\')).not.toThrow();
  });

  it('rejects studio repo root and non-FILMS subfolders', () => {
    expect(() => validateStoragePath('C:\\SandyStudio\\')).toThrow(/forbidden/i);
    expect(() => validateStoragePath('C:\\SandyStudio\\agents\\')).toThrow(/forbidden/i);
  });

  it('rejects system directories', () => {
    expect(() => validateStoragePath('C:\\Windows\\System32\\')).toThrow(/system directory/i);
    expect(() => validateStoragePath('C:\\Program Files\\AnyApp\\')).toThrow(/system directory/i);
  });

  it('rejects empty and overlong paths', () => {
    expect(() => validateStoragePath('')).toThrow();
    expect(() => validateStoragePath('a'.repeat(241))).toThrow();
  });

  it('rejects traversal even when normalised', () => {
    expect(() => validateStoragePath('C:\\foo\\..\\bar')).not.toThrow();   // normalises clean
    expect(() => validateStoragePath('..\\..\\evil')).toThrow();           // unresolved traversal
  });
});

describe('runWriteTest', () => {
  let tmpDir: string;
  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sandystudio-probe-'));
  });
  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  });

  it('writable: tmp dir created above', async () => {
    const result = await runWriteTest(tmpDir);
    // Note: tmpDir contains "..", so validateStoragePath should pass it (already normalised).
    expect(result.writable).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('non-writable: nonexistent path', async () => {
    const result = await runWriteTest(path.join(tmpDir, 'no-such-folder-here-xx99'));
    expect(result.writable).toBe(false);
    expect(result.errorCode).toBeDefined();
  });
});

describe('isProbablyDriveFolder', () => {
  it('detects Drive paths', () => {
    expect(isProbablyDriveFolder('H:\\My Drive\\foo\\')).toBe(true);
    expect(isProbablyDriveFolder('C:\\My Drive\\bar\\')).toBe(true);
  });
  it('does not flag non-Drive paths', () => {
    expect(isProbablyDriveFolder('C:\\Users\\me\\Documents\\')).toBe(false);
    expect(isProbablyDriveFolder('D:\\Studio\\')).toBe(false);
  });
});
