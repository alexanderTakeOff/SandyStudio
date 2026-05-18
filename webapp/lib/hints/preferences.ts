// ──────────────────────────────────────────────────────────────────────────────
// lib/hints/preferences.ts
// Global "show inline hints" preference. Persisted in localStorage.
//
// Drives the <PeekHint> component: when off, hints don't render (or render
// only as the small `i` affordance behind a hover). When on, hints auto-peek
// on mount and pin while the user inspects them.
//
// v1 default: ON (good for onboarding). Director can flip in Settings header.
// ──────────────────────────────────────────────────────────────────────────────

import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'sandystudio.hints_enabled';
const EVENT = 'sandystudio:hints-changed';

function readEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === null) return true;
  return raw === '1';
}

function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => callback();
  window.addEventListener(EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}

export function useHintsEnabled(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => readEnabled(),
    () => true,
  );
}

export function setHintsEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
  window.dispatchEvent(new Event(EVENT));
}
