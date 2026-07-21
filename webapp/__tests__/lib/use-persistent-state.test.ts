// Preference persistence codec — the part worth locking.
//
// Following the precedent set by useAssetNotificationRealtime.test.ts: the repo
// runs a node-only vitest environment, so we test the pure read/write pair with
// an injected store rather than pulling in jsdom + React Testing Library for a
// hook this small.
//
// Why it exists at all (Director 2026-07-21): every view forgot its filters on
// reload — "иначе устану тыкать кнопочки каждый раз".

import { describe, it, expect } from 'vitest';
import {
  readPreference,
  writePreference,
  type PreferenceStore,
} from '@/lib/use-persistent-state';

function fakeStore(seed: Record<string, string> = {}): PreferenceStore & { dump: () => Record<string, string> } {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    dump: () => Object.fromEntries(map),
  };
}

describe('preference codec', () => {
  it('round-trips a value under the studio-wide key prefix', () => {
    const store = fakeStore();
    writePreference('factory.showAll', true, store);
    expect(store.dump()).toEqual({ 'sandystudio.factory.showAll': 'true' });
    expect(readPreference<boolean>('factory.showAll', store)).toBe(true);
  });

  it('round-trips the array behind a Set-valued preference', () => {
    const store = fakeStore();
    writePreference('factory.series', [...new Set(['director', 'polina'])], store);
    expect(new Set(readPreference<string[]>('factory.series', store))).toEqual(
      new Set(['director', 'polina']),
    );
  });

  it('returns undefined for a key that was never written', () => {
    expect(readPreference('factory.nothing', fakeStore())).toBeUndefined();
  });

  it('falls back to undefined on corrupt JSON instead of throwing', () => {
    const store = fakeStore({ 'sandystudio.factory.picked': '{not json' });
    expect(readPreference('factory.picked', store)).toBeUndefined();
  });

  it('distinguishes a stored `false` from a missing key', () => {
    const store = fakeStore();
    writePreference('factory.excludeArchived', false, store);
    // The hook only overrides its default when the read is not undefined, so a
    // stored `false` MUST survive — otherwise unticking a default-on box would
    // silently revert on every reload.
    expect(readPreference<boolean>('factory.excludeArchived', store)).toBe(false);
  });

  it('is inert when there is no store (SSR) rather than throwing', () => {
    expect(readPreference('factory.showAll', null)).toBeUndefined();
    expect(() => writePreference('factory.showAll', true, null)).not.toThrow();
  });

  it('survives a store that throws on write (quota / private mode)', () => {
    const hostile: PreferenceStore = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(() => writePreference('factory.showAll', true, hostile)).not.toThrow();
  });
});
