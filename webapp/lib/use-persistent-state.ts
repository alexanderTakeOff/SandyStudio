// ──────────────────────────────────────────────────────────────────────────────
// lib/use-persistent-state.ts
// One place for "remember what the Director picked".
//
// Why this exists (Director, 2026-07-21): «надо бы сохранять конфигурацию
// программы и настроек выбров опций тоже, иначе устану тыкать кнопочки каждый
// раз». Every view that offers filters/toggles currently forgets them on reload,
// so the same clicks are re-done every visit.
//
// It is also a de-duplication: the same hydrate-in-effect / write-in-effect /
// swallow-the-error dance was hand-copied into seven places (StudioSidebar,
// ConciergePanel, AppearanceProvider, VGENBatchPanel, the episode rail width,
// lib/hints/preferences, the episode page). New call sites use this; existing
// ones can collapse onto it as they are touched — do NOT mass-rewrite them.
//
// SSR contract: the server always renders `initial`, and the stored value is
// applied in an effect after mount. That is deliberate — reading localStorage
// during render would desync server and client HTML. It costs one extra paint,
// which is invisible for filter state and is what every existing call site
// already does.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** All studio preference keys share this prefix, matching the existing ones
 *  (`sandystudio.sidebar.collapsed`, `sandystudio.hints_enabled`, …). */
const PREFIX = 'sandystudio.';

/** The slice of the Storage API used here. Injectable so the codec is testable
 *  in the repo's node-only test environment (no jsdom dependency — same call the
 *  existing hook tests make). */
export interface PreferenceStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStore(): PreferenceStore | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}

/** Read a stored preference. `undefined` means "nothing usable" — missing,
 *  corrupt, or storage unavailable — and the caller keeps its default. */
export function readPreference<T>(
  key: string,
  store: PreferenceStore | null = defaultStore(),
): T | undefined {
  if (!store) return undefined;
  try {
    const raw = store.getItem(PREFIX + key);
    if (raw === null) return undefined;
    return JSON.parse(raw) as T;
  } catch {
    return undefined; // corrupt JSON / unavailable storage — fall back
  }
}

export function writePreference<T>(
  key: string,
  value: T,
  store: PreferenceStore | null = defaultStore(),
): void {
  if (!store) return;
  try {
    store.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* quota / private mode — a lost preference must never break the view */
  }
}

/**
 * `useState`, but the value survives a reload.
 *
 * @param key   stable name, no prefix (e.g. `factory.showAll`)
 * @param initial value used on the server and before hydration
 */
export function usePersistentState<T>(
  key: string,
  initial: T,
): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(initial);
  // Skip the write on the very first commit: otherwise the pre-hydration default
  // would immediately overwrite whatever is stored, and nothing would ever persist.
  const hydrated = useRef(false);

  useEffect(() => {
    const stored = readPreference<T>(key);
    if (stored !== undefined) setValue(stored);
    hydrated.current = true;
    // `key` is a literal at every call site; re-running on change is still correct.
  }, [key]);

  useEffect(() => {
    if (!hydrated.current) return;
    writePreference(key, value);
  }, [key, value]);

  return [value, setValue as (next: T | ((prev: T) => T)) => void];
}

/**
 * The same, for a `Set<string>` — the shape filter/toggle UIs actually hold.
 * Stored as an array, so the JSON stays readable in devtools.
 */
export function usePersistentSet(
  key: string,
  initial: Iterable<string>,
): [Set<string>, (next: Set<string> | ((prev: Set<string>) => Set<string>)) => void] {
  const [asArray, setArray] = usePersistentState<string[]>(key, [...initial]);
  const value = new Set(asArray);
  const setValue = useCallback(
    (next: Set<string> | ((prev: Set<string>) => Set<string>)) => {
      setArray((prev) =>
        typeof next === 'function' ? [...next(new Set(prev))] : [...next],
      );
    },
    [setArray],
  );
  return [value, setValue];
}
