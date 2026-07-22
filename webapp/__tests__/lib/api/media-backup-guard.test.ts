// ──────────────────────────────────────────────────────────────────────────────
// __tests__/lib/api/media-backup-guard.test.ts
// Guard blocks finalizing a media asset without a Drive backup (2026-07-22 fix).
// ──────────────────────────────────────────────────────────────────────────────

import { describe, expect, it, vi, beforeEach } from 'vitest';

const { resolveProviderMock } = vi.hoisted(() => ({ resolveProviderMock: vi.fn() }));
vi.mock('@/lib/agents/provider-resolver', () => ({
  resolveProvider: resolveProviderMock,
}));

import { assertFinalizedMediaHasDriveBackup } from '@/lib/api/media-backup-guard';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = {} as any;
const asDrive = () => resolveProviderMock.mockResolvedValue({ providerId: 'drive_native' });
const asMock = () => resolveProviderMock.mockResolvedValue({ providerId: 'mock' });

describe('assertFinalizedMediaHasDriveBackup', () => {
  beforeEach(() => resolveProviderMock.mockReset());

  it('is a no-op for an EPISODE IMG (out of scope — episode media not guarded)', async () => {
    asDrive();
    await expect(
      assertFinalizedMediaHasDriveBackup(
        sb,
        { filename: 'SS-S15-E01-IMG-ref-v01-APPROVED.png', file_type: 'IMG-episode_ref', drive_file_id: null },
        'APPROVED',
      ),
    ).resolves.toBeUndefined();
    expect(resolveProviderMock).not.toHaveBeenCalled();
  });

  it('blocks an SBL image LOCK with null drive_file_id', async () => {
    asDrive();
    await expect(
      assertFinalizedMediaHasDriveBackup(
        sb,
        { filename: 'SS-S15-SBL-location_empty_background-v01-LOCKED.png', file_type: 'SBL-location_empty_background', drive_file_id: null },
        'LOCKED',
      ),
    ).rejects.toThrow(/Drive backup/i);
  });

  it('passes when drive_file_id is present', async () => {
    asDrive();
    await expect(
      assertFinalizedMediaHasDriveBackup(
        sb,
        { filename: 'SS-S15-SBL-character_metelka-v01-LOCKED.png', file_type: 'SBL-character_metelka', drive_file_id: 'abc123' },
        'LOCKED',
      ),
    ).resolves.toBeUndefined();
  });

  it('passes on mock storage even without a Drive backup (local-dev exempt)', async () => {
    asMock();
    await expect(
      assertFinalizedMediaHasDriveBackup(
        sb,
        { filename: 'SS-S15-SBL-location_x-v01-LOCKED.png', file_type: 'SBL-location_x', drive_file_id: null },
        'LOCKED',
      ),
    ).resolves.toBeUndefined();
  });

  it('is a no-op for a non-final target status (never even resolves storage)', async () => {
    asDrive();
    await expect(
      assertFinalizedMediaHasDriveBackup(
        sb,
        { filename: 'SS-S15-SBL-location_x-v01-DRAFT.png', file_type: 'SBL-location_x', drive_file_id: null },
        'REVISION',
      ),
    ).resolves.toBeUndefined();
    expect(resolveProviderMock).not.toHaveBeenCalled();
  });

  it('is a no-op for a non-media text canon (.md)', async () => {
    asDrive();
    await expect(
      assertFinalizedMediaHasDriveBackup(
        sb,
        { filename: 'SS-S15-SBL-general_idea_main-v01-LOCKED.md', file_type: 'SBL-general_idea_main', drive_file_id: null },
        'LOCKED',
      ),
    ).resolves.toBeUndefined();
    expect(resolveProviderMock).not.toHaveBeenCalled();
  });
});
