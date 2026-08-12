// ──────────────────────────────────────────────────────────────────────────────
// lib/operator-context.ts
// Разбор МАРШРУТА в контекст оператора — «что открыто прямо сейчас».
//
// Живёт отдельно от провайдера (`components/providers/WorkspaceScopeProvider`)
// по одной причине: это чистая функция, и закон, который она держит (uiux.md
// §8.0 — источник контекста один, и это маршрут), обязан иметь сторожа в тестах.
// ──────────────────────────────────────────────────────────────────────────────

/** Что открыто у оператора — от самого узкого к самому широкому. */
export type OperatorContextKind = 'episode' | 'series' | 'studio';

export interface RouteContext {
  kind: OperatorContextKind;
  episodeId: string | null;
  /** Сериал, названный САМИМ путём (`/series/<uuid>`), а не выбранный скоупом. */
  seriesIdFromPath: string | null;
  /** Вкладка сайдбара: первый сегмент пути (`factory`, `audience`, …). */
  tab: string;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Единственное место, где студия отвечает на вопрос «где я». */
export function contextFromPath(pathname: string | null): RouteContext {
  const path = pathname ?? '/';
  const tab = path.split('/').filter(Boolean)[0] ?? '';
  const episode = /\/episodes\/([^/?#]+)/.exec(path)?.[1];
  if (episode && UUID_RE.test(episode)) {
    return { kind: 'episode', episodeId: episode, seriesIdFromPath: null, tab };
  }
  const series = /\/series\/([^/?#]+)/.exec(path)?.[1];
  if (series && UUID_RE.test(series)) {
    return { kind: 'series', episodeId: null, seriesIdFromPath: series, tab };
  }
  return { kind: 'studio', episodeId: null, seriesIdFromPath: null, tab };
}
