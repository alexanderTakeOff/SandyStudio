// ──────────────────────────────────────────────────────────────────────────────
// lib/api/channel-stages.ts
//
// СОСТОЯНИЕ КАНАЛА — контур, которого не было в конвейере вовсе.
//
// Паспорт, упаковка, каденция, аудитория и виабильность живут в отдельных
// таблицах (`channels`, `channel_snapshots`, `channel_reports`, `hog_memory`) и
// не имеют ни строки, ни гейта. Структурная причина: `assets` знает только
// `episode_id` и `series_id` — колонки `channel_id` в ней нет, канальному
// артефакту негде лежать. Всё, что не влезло, ушло из конвейера в таблицы и
// стало невидимым (решение Директора 18, 2026-08-06).
//
// ГЛАВНОЕ ПРАВИЛО, и оно первое: **канал ОПЦИОНАЛЕН**.
// Директор, 06.08: «не каждый сериал будет иметь или нуждаться в канале».
// Сериал без канала — ЗАКОННОЕ СОСТОЯНИЕ, а не незаполненное поле:
//   • отсутствие канала НЕ ошибка и не даёт HALT само по себе;
//   • контур не показывается вовсе, а не показывается пустым;
//   • зависимое падает на дефолты сериала и НИКОГДА не блокирует производство.
// HALT на серии без канала верен ровно в один момент — когда запрошена
// публикация, — и нигде больше.
//
// Модуль ЧИСТЫЙ: никакого I/O, как `canon-stages.ts`.
// ──────────────────────────────────────────────────────────────────────────────

export interface ChannelRowLike {
  id: string;
  name?: string | null;
  credential_key?: string | null;
  youtube_channel_id?: string | null;
  metadata?: unknown;
}

/** Снимок аудитории — строка `channel_snapshots`, самая свежая. */
export interface ChannelSnapshotRowLike {
  captured_at?: string | null;
  views?: number | null;
  subscribers?: number | null;
}

export interface ChannelReadiness {
  /** Что именно готово — по одному факту, без интерпретаций. */
  hasPassport: boolean;
  hasCredentials: boolean;
  hasPublishDefaults: boolean;
  hasBranding: boolean;
  hasAudienceData: boolean;
  /** Возраст свежайшего снимка аудитории в часах; null — снимков нет. */
  audienceAgeHours: number | null;
}

export type ChannelContourState =
  /** У серии канала нет — контур не показывается. Это НЕ ошибка. */
  | 'not_applicable'
  /** Канал есть и готов принимать публикации. */
  | 'ready'
  /** Канал есть, но чего-то не хватает именно для ПУБЛИКАЦИИ. */
  | 'incomplete';

export interface ChannelSnapshot {
  state: ChannelContourState;
  channelId: string | null;
  channelName: string | null;
  readiness: ChannelReadiness;
  /**
   * Чего не хватает — и это блокирует ТОЛЬКО публикацию, никогда производство.
   * Пусто при `not_applicable`: у серии без канала нечему не хватать.
   */
  publishBlockers: string[];
  /**
   * Наблюдения, которые не блокируют ничего: устаревшие снимки, пустая упаковка.
   * Отделены от блокеров намеренно — смешанные, они учат игнорировать оба.
   */
  notes: string[];
}

const STALE_AUDIENCE_HOURS = 48;

function metaOf(channel: ChannelRowLike): Record<string, unknown> {
  return (channel.metadata && typeof channel.metadata === 'object'
    ? (channel.metadata as Record<string, unknown>)
    : {});
}

function hoursSince(iso: string | null | undefined, nowMs: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, (nowMs - t) / 3_600_000);
}

/**
 * Состояние канального контура серии.
 *
 * `channel` = null означает «у серии нет канала» — законное состояние, а не
 * отсутствие данных. Время передаётся аргументом, чтобы функция осталась чистой
 * и тестируемой.
 */
export function buildChannelSnapshot(args: {
  channel: ChannelRowLike | null;
  latestAudience?: ChannelSnapshotRowLike | null;
  nowMs?: number;
}): ChannelSnapshot {
  const { channel } = args;
  const nowMs = args.nowMs ?? Date.now();

  if (!channel) {
    return {
      state: 'not_applicable',
      channelId: null,
      channelName: null,
      readiness: {
        hasPassport: false,
        hasCredentials: false,
        hasPublishDefaults: false,
        hasBranding: false,
        hasAudienceData: false,
        audienceAgeHours: null,
      },
      publishBlockers: [],
      notes: [],
    };
  }

  const meta = metaOf(channel);
  const audienceAgeHours = hoursSince(args.latestAudience?.captured_at ?? null, nowMs);

  const readiness: ChannelReadiness = {
    hasPassport: Boolean(channel.youtube_channel_id),
    hasCredentials: Boolean(channel.credential_key),
    hasPublishDefaults: Boolean(meta.publish_defaults),
    hasBranding: Boolean(meta.branding),
    hasAudienceData: audienceAgeHours !== null,
    audienceAgeHours,
  };

  // Блокирует ТОЛЬКО публикацию. Производство идёт без канала целиком.
  const publishBlockers: string[] = [];
  if (!readiness.hasPassport) publishBlockers.push('у канала нет id площадки — публиковать некуда');
  if (!readiness.hasCredentials) publishBlockers.push('нет ключа доступа — заливка невозможна');

  const notes: string[] = [];
  if (!readiness.hasPublishDefaults) notes.push('упаковка по умолчанию не задана — публикация возьмёт общие значения');
  if (!readiness.hasBranding) notes.push('брендинг канала не заполнен — тексты пойдут без призыва подписаться');
  if (!readiness.hasAudienceData) notes.push('снимков аудитории нет — рост измерять нечем');
  else if (audienceAgeHours !== null && audienceAgeHours > STALE_AUDIENCE_HOURS) {
    notes.push(`свежайший снимок аудитории старше ${Math.round(audienceAgeHours)} ч — цифры устарели`);
  }

  return {
    state: publishBlockers.length === 0 ? 'ready' : 'incomplete',
    channelId: channel.id,
    channelName: channel.name ?? null,
    readiness,
    publishBlockers,
    notes,
  };
}

/**
 * Мешает ли состояние канала ПРОИЗВОДСТВУ. Ответ всегда «нет» — функция
 * существует затем, чтобы это правило было написано в коде, а не подразумевалось:
 * серия без канала снимается ровно так же, как серия с каналом.
 */
export function blocksProduction(_snapshot: ChannelSnapshot): false {
  return false;
}
