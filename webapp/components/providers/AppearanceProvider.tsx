// ──────────────────────────────────────────────────────────────────────────────
// components/providers/AppearanceProvider.tsx
// Client-side appearance state per uiux.md §7.3 — persistence in localStorage
// (no user_settings table yet — limitation documented).
// Sets `data-theme` and `data-ambient` on <html> so CSS variable cascades work.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  DEFAULT_APPEARANCE,
  type AppearanceState,
  type ThemeId,
  type AmbientMode,
} from '@/lib/uiux/types';

const STORAGE_KEY = 'sandystudio.appearance';

interface AppearanceContextValue extends AppearanceState {
  setTheme: (theme: ThemeId) => void;
  setAmbient: (ambient: AmbientMode) => void;
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppearanceState>(DEFAULT_APPEARANCE);

  // Hydrate from localStorage once on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AppearanceState>;
        setState({
          theme: parsed.theme ?? DEFAULT_APPEARANCE.theme,
          ambient: parsed.ambient ?? DEFAULT_APPEARANCE.ambient,
        });
      }
    } catch {
      // Corrupted storage — fall through to defaults.
    }
  }, []);

  // Apply to <html> attributes so CSS variables cascade.
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', state.theme);
    root.setAttribute('data-ambient', state.ambient);
  }, [state]);

  const setTheme = (theme: ThemeId) => {
    setState((s) => {
      const next = { ...s, theme };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* storage full / disabled — silently keep in-memory state */
      }
      return next;
    });
  };

  const setAmbient = (ambient: AmbientMode) => {
    setState((s) => {
      const next = { ...s, ambient };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* see above */
      }
      return next;
    });
  };

  return (
    <AppearanceContext.Provider value={{ ...state, setTheme, setAmbient }}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance(): AppearanceContextValue {
  const ctx = useContext(AppearanceContext);
  if (!ctx) {
    throw new Error('useAppearance must be used within <AppearanceProvider>');
  }
  return ctx;
}
