// Phase 4d — per-series provider overlay on the resolver.
// Law under test: the overlay (app_config providers/assignment:<contract>:<seriesId>)
// swaps ONLY the provider id; the global disable switch still wins; unscoped
// resolution and non-overridable contracts never read the overlay.

import { beforeEach, describe, expect, it } from 'vitest';
import {
  resolveProvider,
  invalidateProviderCache,
  providerOverlayKey,
  ContractDisabledError,
  SERIES_OVERRIDABLE_CONTRACTS,
} from '@/lib/agents/provider-resolver';

const SERIES = '11111111-2222-3333-4444-555555555555';

interface FakeDb {
  assignment: { contract: string; active_provider_id: string; is_active: boolean } | null;
  overlays: Map<string, { active_provider_id: string }>;
  overlayReads: number;
}

function makeSb(db: FakeDb) {
  return {
    from(table: string) {
      const state: { key?: string; scope?: string } = {};
      return {
        select() {
          return this;
        },
        eq(col: string, val: string) {
          if (col === 'key') state.key = val;
          if (col === 'scope') state.scope = val;
          return this;
        },
        maybeSingle() {
          if (table === 'provider_assignments') {
            return Promise.resolve({ data: db.assignment, error: null });
          }
          // app_config overlay read
          db.overlayReads++;
          const row = state.key ? db.overlays.get(state.key) : undefined;
          return Promise.resolve({ data: row ? { value: row } : null, error: null });
        },
      };
    },
  };
}

describe('resolveProvider — series overlay', () => {
  let db: FakeDb;

  beforeEach(() => {
    invalidateProviderCache();
    db = {
      assignment: { contract: 'image', active_provider_id: 'mock', is_active: true },
      overlays: new Map(),
      overlayReads: 0,
    };
  });

  it('no seriesId → global provider, overlay never read', async () => {
    const r = await resolveProvider(makeSb(db) as never, 'image');
    expect(r.providerId).toBe('mock');
    expect(db.overlayReads).toBe(0);
  });

  it('overlay swaps the provider for the series; global row untouched', async () => {
    db.overlays.set(providerOverlayKey('image', SERIES), { active_provider_id: 'gpt-image-1' });
    process.env.OPENAI_API_KEY = 'test-key';
    try {
      const scoped = await resolveProvider(makeSb(db) as never, 'image', SERIES);
      expect(scoped.providerId).toBe('gpt-image-1');
      const global = await resolveProvider(makeSb(db) as never, 'image');
      expect(global.providerId).toBe('mock');
    } finally {
      delete process.env.OPENAI_API_KEY;
    }
  });

  it('overlaid provider without its env key auto-downgrades to mock (same law as global)', async () => {
    db.overlays.set(providerOverlayKey('image', SERIES), { active_provider_id: 'gpt-image-1' });
    const prev = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const r = await resolveProvider(makeSb(db) as never, 'image', SERIES);
      expect(r.providerId).toBe('mock');
      expect(r.isMock).toBe(true);
    } finally {
      if (prev !== undefined) process.env.OPENAI_API_KEY = prev;
    }
  });

  it('globally disabled contract throws even with an overlay (overlay cannot re-enable)', async () => {
    db.assignment = { contract: 'image', active_provider_id: 'mock', is_active: false };
    db.overlays.set(providerOverlayKey('image', SERIES), { active_provider_id: 'gpt-image-1' });
    await expect(resolveProvider(makeSb(db) as never, 'image', SERIES)).rejects.toBeInstanceOf(
      ContractDisabledError,
    );
  });

  it('non-overridable contract (storage) ignores seriesId entirely', async () => {
    expect(SERIES_OVERRIDABLE_CONTRACTS).not.toContain('storage');
    db.assignment = { contract: 'storage', active_provider_id: 'mock', is_active: true };
    db.overlays.set(providerOverlayKey('storage', SERIES), { active_provider_id: 'drive_native' });
    const r = await resolveProvider(makeSb(db) as never, 'storage', SERIES);
    expect(r.providerId).toBe('mock');
    expect(db.overlayReads).toBe(0);
  });

  it('scoped and unscoped results cache independently', async () => {
    db.overlays.set(providerOverlayKey('image', SERIES), { active_provider_id: 'gpt-image-1' });
    process.env.OPENAI_API_KEY = 'test-key';
    try {
      await resolveProvider(makeSb(db) as never, 'image', SERIES);
      const reads = db.overlayReads;
      // Second scoped call served from cache — no extra overlay read.
      await resolveProvider(makeSb(db) as never, 'image', SERIES);
      expect(db.overlayReads).toBe(reads);
      // invalidate wipes both scoped and unscoped entries for the contract.
      invalidateProviderCache('image');
      await resolveProvider(makeSb(db) as never, 'image', SERIES);
      expect(db.overlayReads).toBe(reads + 1);
    } finally {
      delete process.env.OPENAI_API_KEY;
    }
  });
});
