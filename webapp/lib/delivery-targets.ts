// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/delivery-targets.ts
// The ONE place episode `delivery_targets` are read + resolved. A leaf module (no
// imports from runner.ts / runners) so every agent — screenwriter, storyboarder,
// episode-reference-designer, animator — and runner.ts can share it without the
// circular-import that previously forced four near-identical private copies.
//
// `delivery_targets` is the canonical shorts/format signal: EREF sizes reference
// images from it (SIZE_BY_DELIVERY_TARGET), the Storyboarder + Screenwriter switch
// to vertical-safe / single-punch framing from it (hasVerticalDeliveryTarget, in
// provider-capabilities.ts). Pure — no DB calls.
// ──────────────────────────────────────────────────────────────────────────────

/** Read `metadata.delivery_targets[]` defensively (string entries only), or null
 *  when absent/garbage. Null (not []) so callers can distinguish "no key" from
 *  "empty" when applying precedence. */
export function readDeliveryTargetsFromMetadata(meta: unknown): readonly string[] | null {
  if (!meta || typeof meta !== 'object') return null;
  const raw = (meta as { delivery_targets?: unknown }).delivery_targets;
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v === 'string' && v.length > 0) out.push(v);
  }
  return out;
}

/** Read `episode.metadata.delivery_targets[]` off an episode row, always an array
 *  (never null) for the common "does this episode declare any target" checks. */
export function readEpisodeDeliveryTargets(episode: unknown): string[] {
  if (!episode || typeof episode !== 'object') return [];
  const fromMeta = readDeliveryTargetsFromMetadata((episode as { metadata?: unknown }).metadata);
  return fromMeta ? [...fromMeta] : [];
}

/**
 * Resolve `delivery_targets[]` for an episode. Precedence:
 *   1. episode.metadata.delivery_targets[] (per-episode override)
 *   2. series.metadata.delivery_targets[] (series default, passed by the caller)
 *   3. Fallback: ['youtube_landscape']
 *
 * Pure — no DB calls. Shared by the Inngest wiring, the runners, and unit tests.
 */
export function resolveDeliveryTargets(args: {
  episodeMetadata: unknown;
  seriesDeliveryTargets?: readonly string[] | null;
}): readonly string[] {
  const fromEpisode = readDeliveryTargetsFromMetadata(args.episodeMetadata);
  if (fromEpisode && fromEpisode.length > 0) return fromEpisode;
  if (args.seriesDeliveryTargets && args.seriesDeliveryTargets.length > 0) {
    return args.seriesDeliveryTargets;
  }
  return ['youtube_landscape'];
}

// ── Episode target runtime (2026-07-22) ─────────────────────────────────────
// The episode's target total runtime in SECONDS. Historically this was a
// "homeless" parameter: `target_runtime_seconds` was collected at episode
// creation but only leaked into the brief TEXT — it was never stored on the
// episode, and the Screenwriter ignored it and hard-coded "15–40s" in its
// prompt (single-punch for shorts). Result: a shorts episode always came out
// ~35s regardless of Director intent. This makes it a first-class, stored,
// authoritative parameter that the Writer/Storyboarder read from the episode.

/** Long-form default when no explicit target is set (Director: "60 by default"). */
export const DEFAULT_RUNTIME_SECONDS = 60;
/** Shorts default when no explicit target is set (single-punch vertical). */
export const DEFAULT_SHORTS_RUNTIME_SECONDS = 30;
const RUNTIME_MIN = 5;
const RUNTIME_MAX = 300;

/** Read `episode.metadata.target_runtime_seconds` defensively — a positive
 *  integer in [5, 300], or null when absent/garbage. */
export function readEpisodeRuntimeTarget(episode: unknown): number | null {
  if (!episode || typeof episode !== 'object') return null;
  const meta = (episode as { metadata?: unknown }).metadata;
  if (!meta || typeof meta !== 'object') return null;
  const raw = (meta as { target_runtime_seconds?: unknown }).target_runtime_seconds;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  const n = Math.round(raw);
  if (n < RUNTIME_MIN || n > RUNTIME_MAX) return null;
  return n;
}

/**
 * Resolve the target runtime (seconds) an authoring agent should aim for.
 * Precedence:
 *   1. episode.metadata.target_runtime_seconds — Director's explicit setting.
 *      AUTHORITATIVE: it wins even for a shorts episode, so a Director who sets
 *      60 gets 60 rather than the single-punch 15–40 default.
 *   2. Fallback: shorts → 30s, long-form → 60s.
 * Pure — no DB calls. Shared by the Screenwriter and Storyboarder.
 */
export function resolveRuntimeTarget(args: {
  episodeMetadata: unknown;
  shortsIsTarget: boolean;
}): number {
  const explicit = readEpisodeRuntimeTarget({ metadata: args.episodeMetadata });
  if (explicit != null) return explicit;
  return args.shortsIsTarget ? DEFAULT_SHORTS_RUNTIME_SECONDS : DEFAULT_RUNTIME_SECONDS;
}

// ── Плотность гэгов (2026-08-06, решение Директора) ─────────────────────────
//
// Второй «бездомный» параметр, ровно с той же биографией, что и хронометраж
// выше: он существовал только прозой в скиллах, до раскадровки не доезжал и
// раскадровку не переживал. Директор: «на шортсах каждый кадр должен иметь свой
// гэг… важно, чтобы это где-то фиксировалось и переживало по крайней мере
// раскадровку».
//
// Числа — его же, из разбора 06.08:
//   • ролик 30 с → ~10 кадров по 3 с → не меньше 10–12 гэгов;
//   • ролик 45 с → 10–20 кадров;
//   • яркий гэг не реже, чем раз в 10 секунд;
//   • интенсивность НАРАСТАЕТ к 10–15-й секунде — это критично для удержания.
//
// Почему не «гэгов в минуту»: на ролике в 30–45 секунд метрика «2 в минуту»
// разрешает ОДИН гэг на весь ролик. Единица измерения здесь — КАДР, а не минута.

/** Средняя длина кадра в плотной комедии. Директор: «10 кадров по 3 секунды». */
export const DENSE_COMEDY_SHOT_SECONDS = 3;
/** Максимальный зазор без яркого гэга — за ним внимание уходит. */
export const MAX_GAG_GAP_SECONDS = 10;

export interface GagPlan {
  /** Хронометраж, от которого всё считается. */
  runtimeSeconds: number;
  /** Сколько кадров должно получиться — знаменатель покадровых строк конвейера. */
  shotTarget: number;
  /** Средняя длина кадра, секунд. */
  shotSeconds: number;
  /** Минимальное число РАЗЛИЧНЫХ гэгов: по одному на кадр, не меньше. */
  minGags: number;
  /** Окно нарастания интенсивности, секунды от начала. */
  peakWindow: readonly [number, number];
  /** Предельный зазор без яркого гэга. */
  maxGapSeconds: number;
  /** true — числа заданы Директором явно, а не выведены из хронометража. */
  explicit: boolean;
}

/** Явное переопределение в паспорте эпизода: `metadata.gag_plan`. */
function readExplicitGagPlan(episodeMetadata: unknown): Partial<GagPlan> | null {
  if (!episodeMetadata || typeof episodeMetadata !== 'object') return null;
  const raw = (episodeMetadata as { gag_plan?: unknown }).gag_plan;
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as { shot_target?: unknown; min_gags?: unknown; shot_seconds?: unknown };
  const out: Partial<GagPlan> = {};
  if (typeof p.shot_target === 'number' && p.shot_target > 0) out.shotTarget = Math.round(p.shot_target);
  if (typeof p.min_gags === 'number' && p.min_gags > 0) out.minGags = Math.round(p.min_gags);
  if (typeof p.shot_seconds === 'number' && p.shot_seconds > 0) out.shotSeconds = p.shot_seconds;
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * План плотности эпизода — из хронометража, с правом Директора переопределить.
 * Чистая функция: её читают и Сценарист, и Раскадровщик, и приёмка, поэтому
 * число кадров у всех троих одно и то же.
 */
export function resolveGagPlan(args: {
  episodeMetadata: unknown;
  shortsIsTarget: boolean;
}): GagPlan {
  const runtimeSeconds = resolveRuntimeTarget(args);
  const explicit = readExplicitGagPlan(args.episodeMetadata);
  const shotSeconds = explicit?.shotSeconds ?? DENSE_COMEDY_SHOT_SECONDS;
  const shotTarget = explicit?.shotTarget ?? Math.max(3, Math.round(runtimeSeconds / shotSeconds));
  return {
    runtimeSeconds,
    shotTarget,
    shotSeconds,
    // Гэг на КАЖДОМ кадре — это и есть пол, а не потолок.
    minGags: explicit?.minGags ?? shotTarget,
    peakWindow: [10, 15],
    maxGapSeconds: MAX_GAG_GAP_SECONDS,
    explicit: explicit !== null,
  };
}

/** Строка плана для промпта автора — одна и та же формулировка везде. */
export function gagPlanBriefLine(plan: GagPlan): string {
  return (
    `GAG DENSITY (hard, from the episode passport): ~${plan.shotTarget} shots of ~${plan.shotSeconds}s ` +
    `for ${plan.runtimeSeconds}s of runtime. EVERY shot carries its own gag — at least ${plan.minGags} ` +
    `DISTINCT gags, never a re-skin of the same one. No gap longer than ${plan.maxGapSeconds}s without a ` +
    `bright gag. Intensity RISES toward seconds ${plan.peakWindow[0]}–${plan.peakWindow[1]} — that window ` +
    `decides retention. If the beat count is short of the shot count, ADD shots; never merge stages to fit.`
  );
}
