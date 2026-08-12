// ──────────────────────────────────────────────────────────────────────────────
// components/providers/WorkspaceScopeProvider.tsx
// КОНТЕКСТ ОПЕРАТОРА — «что у меня открыто прямо сейчас»: студия, сериал или
// эпизод. ЕДИНСТВЕННЫЙ держатель этого факта; все поверхности (дропдаун, вкладки,
// чат Полины) его ЧИТАЮТ и ни одна не выводит собственный ответ.
//
// ЗАКОН: источник контекста — МАРШРУТ (2026-08-12, замечание Директора о
// рассинхроне дропдауна). До этого в провайдер втекал только `?series_id=`, а
// сегменты пути — нет: на `/series/<id>` и `/episodes/<id>` он продолжал держать
// прошлый выбор, дропдаун показывал SS-S20 при открытом SS-S17. Тот же корень
// давал 404 в чате (он выводил эпизод своим regex'ом) и слепые вкладки.
//
// Правила источника (по убыванию силы):
//   • СЕГМЕНТ ПУТИ `/series/<uuid>` или `/episodes/<uuid>` — сильнейший: он и есть
//     то, что оператор открыл.
//   • URL `?series_id=` — для плоских вкладок и шаримых ссылок; перечитывается на
//     каждой смене маршрута. Читается через window.location (НЕ useSearchParams —
//     тот потребовал бы Suspense на статических страницах).
//   • Иначе последний выбор: в памяти между переходами (провайдер живёт в layout
//     (studio) и не перемонтируется) и в localStorage между перезагрузками.
//
// Серия ОТКРЫТОГО ЭПИЗОДА приходит от самой страницы эпизода через
// `adoptEntitySeries` — она эти данные и так грузит. Провайдер не делает своего
// запроса: это была бы вторая загрузка того же факта, а не второй источник истины.
//
// Канал не хранится: он выводится (series.channel_id) теми, кому нужен (Audience).
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
import { contextFromPath, UUID_RE, type OperatorContextKind } from '@/lib/operator-context';

const STORAGE_KEY = 'sandystudio.workspace.scope';

interface WorkspaceScope {
  /** null = вся студия (без скоупа). */
  seriesId: string | null;
  /** Открытый эпизод — только на его странице. */
  episodeId: string | null;
  /** Самая узкая открытая сущность. */
  kind: OperatorContextKind;
  /** Вкладка сайдбара: первый сегмент пути (`factory`, `audience`, …). */
  tab: string;
  setSeriesId: (id: string | null) => void;
  /**
   * Страница сущности сообщает её серию — она эти данные уже загрузила.
   * Провайдер остаётся единственным ДЕРЖАТЕЛЕМ контекста; страница лишь
   * приносит свойство того, что открыто по маршруту.
   */
  adoptEntitySeries: (seriesId: string | null) => void;
}

const Ctx = createContext<WorkspaceScope>({
  seriesId: null,
  episodeId: null,
  kind: 'studio',
  tab: '',
  setSeriesId: () => {},
  adoptEntitySeries: () => {},
});

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

  // МАРШРУТ СИЛЬНЕЕ ПАМЯТИ: открытая сущность задаёт скоуп, а не наоборот.
  // Без этого дропдаун на `/series/<id>` продолжал показывать прошлый выбор.
  const route = contextFromPath(pathname);
  useEffect(() => {
    if (route.seriesIdFromPath && route.seriesIdFromPath !== seriesId) {
      setState(route.seriesIdFromPath);
      persist(route.seriesIdFromPath);
    }
    // Уход из сущности скоуп НЕ сбрасывает: он остаётся рабочей областью вкладок.
  }, [route.seriesIdFromPath, seriesId]);

  // Серия открытого эпизода — от страницы, которая её загрузила (см. шапку).
  const adoptEntitySeries = useCallback(
    (id: string | null) => {
      if (!id || !UUID_RE.test(id)) return;
      setState((prev) => (prev === id ? prev : id));
      persist(id);
    },
    [],
  );

  const setSeriesId = useCallback(
    (id: string | null) => {
      setState(id);
      persist(id);
      // СО СТРАНИЦЫ СУЩНОСТИ переключение сериала — это НАВИГАЦИЯ, а не смена
      // фильтра: остаться на чужом эпизоде с новым скоупом значит вернуть тот
      // самый рассинхрон, ради которого всё это делается (решение Директора 24).
      const onEntityPage = route.kind !== 'studio';
      if (onEntityPage) {
        router.push(id ? `/episodes?series_id=${id}` : '/episodes');
        return;
      }
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
    [pathname, router, route.kind],
  );

  return (
    <Ctx.Provider
      value={{
        seriesId,
        episodeId: route.episodeId,
        kind: route.episodeId ? 'episode' : seriesId ? 'series' : 'studio',
        tab: route.tab,
        setSeriesId,
        adoptEntitySeries,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
