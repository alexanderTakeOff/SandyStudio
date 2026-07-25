// ──────────────────────────────────────────────────────────────────────────────
// components/providers/WorkspaceScopeProvider.tsx
// Global workspace scope — «какой СЕРИАЛ я сейчас смотрю» (multi-channel Phase 3).
//
// Source-of-truth rules (mirrors AppearanceProvider's storage pattern):
//   • URL `?series_id=` WINS whenever present — re-checked on every route change,
//     so deep links (/episodes?series_id=…) adopt into the scope and links stay
//     shareable. Read via window.location (client-only) — deliberately NOT
//     useSearchParams, which would force Suspense boundaries on static pages.
//   • Otherwise the last choice persists: in-memory across navigations (this
//     provider lives in the (studio) layout and never remounts), localStorage
//     across reloads.
//   • setSeriesId reflects the choice onto the CURRENT page's URL via
//     router.replace (default scope = no param, like the series tabs pattern).
//
// The channel is NOT stored: it is derived (series.channel_id) by the consumers
// that need it (Audience). Scope null = «вся студия», the pre-Phase-3 behaviour.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';

const STORAGE_KEY = 'sandystudio.workspace.scope';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface WorkspaceScope {
  /** null = вся студия (без скоупа). */
  seriesId: string | null;
  setSeriesId: (id: string | null) => void;
}

const Ctx = createContext<WorkspaceScope>({ seriesId: null, setSeriesId: () => {} });

export function useWorkspaceScope(): WorkspaceScope {
  return useContext(Ctx);
}

function persist(id: string | null): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ seriesId: id }));
  } catch {
    /* private mode etc. — scope simply won't survive reload */
  }
}

export function WorkspaceScopeProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [seriesId, setState] = useState<string | null>(null);

  // Hydrate the remembered choice once (SSR-safe, mirrors AppearanceProvider).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { seriesId?: unknown };
        if (typeof parsed.seriesId === 'string' && UUID_RE.test(parsed.seriesId)) {
          setState(parsed.seriesId);
        }
      }
    } catch {
      /* corrupted value — stay unscoped */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // URL adoption — on every route change, an explicit ?series_id= wins.
  useEffect(() => {
    try {
      const fromUrl = new URLSearchParams(window.location.search).get('series_id');
      if (fromUrl && UUID_RE.test(fromUrl)) {
        setState(fromUrl);
        persist(fromUrl);
      }
    } catch {
      /* no window during prerender — client effect never runs there anyway */
    }
  }, [pathname]);

  const setSeriesId = useCallback(
    (id: string | null) => {
      setState(id);
      persist(id);
      // Reflect on the current page URL for shareability; default = clean URL.
      try {
        const sp = new URLSearchParams(window.location.search);
        if (id) sp.set('series_id', id);
        else sp.delete('series_id');
        const qs = sp.toString();
        router.replace(qs ? `${pathname}?${qs}` : (pathname ?? '/'));
      } catch {
        /* URL reflection is cosmetic — the state above is the source */
      }
    },
    [pathname, router],
  );

  return <Ctx.Provider value={{ seriesId, setSeriesId }}>{children}</Ctx.Provider>;
}
