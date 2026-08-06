// Unit tests for the shared delivery-targets leaf module + the aspect→target
// reverse helper that lets Episode Settings write the canonical delivery_targets.
import { describe, expect, it } from 'vitest';
import {
  readDeliveryTargetsFromMetadata,
  readEpisodeDeliveryTargets,
  resolveDeliveryTargets,
  readEpisodeRuntimeTarget,
  resolveRuntimeTarget,
  resolveGagPlan,
  gagPlanBriefLine,
  DEFAULT_RUNTIME_SECONDS,
  DEFAULT_SHORTS_RUNTIME_SECONDS,
} from '@/lib/agents/delivery-targets';
import { deliveryTargetsForAspect } from '@/lib/api/provider-capabilities';

describe('readDeliveryTargetsFromMetadata', () => {
  it('reads string entries, null on absent/garbage', () => {
    expect(readDeliveryTargetsFromMetadata({ delivery_targets: ['youtube_shorts'] })).toEqual(['youtube_shorts']);
    expect(readDeliveryTargetsFromMetadata({})).toBeNull();
    expect(readDeliveryTargetsFromMetadata(null)).toBeNull();
    expect(readDeliveryTargetsFromMetadata({ delivery_targets: 'x' })).toBeNull();
  });
  it('filters non-string / empty entries', () => {
    expect(readDeliveryTargetsFromMetadata({ delivery_targets: ['youtube_shorts', 3, '', null] })).toEqual(['youtube_shorts']);
  });
});

describe('readEpisodeDeliveryTargets', () => {
  it('reads off an episode row, always an array', () => {
    expect(readEpisodeDeliveryTargets({ metadata: { delivery_targets: ['tiktok'] } })).toEqual(['tiktok']);
    expect(readEpisodeDeliveryTargets({ metadata: {} })).toEqual([]);
    expect(readEpisodeDeliveryTargets(null)).toEqual([]);
  });
});

describe('resolveDeliveryTargets — precedence', () => {
  it('1. episode metadata wins', () => {
    expect(
      resolveDeliveryTargets({
        episodeMetadata: { delivery_targets: ['youtube_shorts'] },
        seriesDeliveryTargets: ['youtube_landscape'],
      }),
    ).toEqual(['youtube_shorts']);
  });
  it('2. falls back to series default', () => {
    expect(
      resolveDeliveryTargets({ episodeMetadata: {}, seriesDeliveryTargets: ['instagram_reels'] }),
    ).toEqual(['instagram_reels']);
  });
  it('3. final fallback is youtube_landscape', () => {
    expect(resolveDeliveryTargets({ episodeMetadata: {}, seriesDeliveryTargets: null })).toEqual(['youtube_landscape']);
    expect(resolveDeliveryTargets({ episodeMetadata: null })).toEqual(['youtube_landscape']);
  });
});

describe('deliveryTargetsForAspect — reverse map (Settings writes the canonical key)', () => {
  it('maps vertical/landscape/square to a canonical representative', () => {
    expect(deliveryTargetsForAspect('9:16')).toEqual(['youtube_shorts']);
    expect(deliveryTargetsForAspect('16:9')).toEqual(['youtube_landscape']);
    expect(deliveryTargetsForAspect('1:1')).toEqual(['instagram_post']);
  });
  it('returns [] for unmapped aspects so the caller leaves delivery_targets untouched', () => {
    expect(deliveryTargetsForAspect('auto')).toEqual([]);
    expect(deliveryTargetsForAspect('21:9')).toEqual([]);
    expect(deliveryTargetsForAspect(null)).toEqual([]);
  });
});

describe('readEpisodeRuntimeTarget', () => {
  it('reads a valid integer in [5,300]', () => {
    expect(readEpisodeRuntimeTarget({ metadata: { target_runtime_seconds: 60 } })).toBe(60);
    expect(readEpisodeRuntimeTarget({ metadata: { target_runtime_seconds: 5 } })).toBe(5);
    expect(readEpisodeRuntimeTarget({ metadata: { target_runtime_seconds: 300 } })).toBe(300);
  });
  it('rounds fractional values', () => {
    expect(readEpisodeRuntimeTarget({ metadata: { target_runtime_seconds: 59.6 } })).toBe(60);
  });
  it('returns null for absent / out-of-range / garbage', () => {
    expect(readEpisodeRuntimeTarget({ metadata: {} })).toBeNull();
    expect(readEpisodeRuntimeTarget({ metadata: { target_runtime_seconds: 0 } })).toBeNull();
    expect(readEpisodeRuntimeTarget({ metadata: { target_runtime_seconds: 999 } })).toBeNull();
    expect(readEpisodeRuntimeTarget({ metadata: { target_runtime_seconds: 'x' } })).toBeNull();
    expect(readEpisodeRuntimeTarget(null)).toBeNull();
  });
});

describe('resolveRuntimeTarget', () => {
  it('Director-set value is authoritative — wins even for a shorts episode', () => {
    expect(resolveRuntimeTarget({ episodeMetadata: { target_runtime_seconds: 60 }, shortsIsTarget: true })).toBe(60);
  });
  it('falls back to shorts default when unset + shorts', () => {
    expect(resolveRuntimeTarget({ episodeMetadata: {}, shortsIsTarget: true })).toBe(DEFAULT_SHORTS_RUNTIME_SECONDS);
  });
  it('falls back to long-form default when unset + not shorts', () => {
    expect(resolveRuntimeTarget({ episodeMetadata: {}, shortsIsTarget: false })).toBe(DEFAULT_RUNTIME_SECONDS);
  });
  it('DEFAULT_RUNTIME_SECONDS is 60 (Director: "60 by default")', () => {
    expect(DEFAULT_RUNTIME_SECONDS).toBe(60);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Плотность гэгов (2026-08-06, решение Директора). Второй «бездомный» параметр
// после хронометража: жил прозой в скиллах, до раскадровки не доезжал и её не
// переживал. Единица измерения — КАДР, а не минута: на ролике в 30–45 секунд
// метрика «2 гэга в минуту» разрешает ОДИН гэг на весь ролик.
// ──────────────────────────────────────────────────────────────────────────────

describe('resolveGagPlan — плотность считается кадрами, а не минутами', () => {
  it('30 секунд → ~10 кадров по 3 с и не меньше 10 различных гэгов', () => {
    const plan = resolveGagPlan({ episodeMetadata: { target_runtime_seconds: 30 }, shortsIsTarget: true });
    expect(plan.shotTarget).toBe(10);
    expect(plan.shotSeconds).toBe(3);
    expect(plan.minGags).toBe(10);
    expect(plan.runtimeSeconds).toBe(30);
  });

  it('45 секунд → 15 кадров: попадает в названный Директором диапазон 10–20', () => {
    const plan = resolveGagPlan({ episodeMetadata: { target_runtime_seconds: 45 }, shortsIsTarget: true });
    expect(plan.shotTarget).toBe(15);
    expect(plan.shotTarget).toBeGreaterThanOrEqual(10);
    expect(plan.shotTarget).toBeLessThanOrEqual(20);
  });

  it('гэг на КАЖДОМ кадре — минимум гэгов не ниже числа кадров', () => {
    for (const runtime of [15, 30, 45, 60, 90]) {
      const plan = resolveGagPlan({ episodeMetadata: { target_runtime_seconds: runtime }, shortsIsTarget: true });
      expect(plan.minGags).toBeGreaterThanOrEqual(plan.shotTarget);
    }
  });

  it('окно нарастания 10–15 с и зазор не длиннее 10 с — те же во всех эпизодах', () => {
    const plan = resolveGagPlan({ episodeMetadata: {}, shortsIsTarget: true });
    expect(plan.peakWindow).toEqual([10, 15]);
    expect(plan.maxGapSeconds).toBe(10);
  });

  it('без настроек берёт дефолт хронометража: шортс 30 с, длинный 60 с', () => {
    expect(resolveGagPlan({ episodeMetadata: {}, shortsIsTarget: true }).shotTarget).toBe(10);
    expect(resolveGagPlan({ episodeMetadata: {}, shortsIsTarget: false }).shotTarget).toBe(20);
  });

  it('Директор может переопределить явно — и это видно в плане', () => {
    const plan = resolveGagPlan({
      episodeMetadata: { target_runtime_seconds: 30, gag_plan: { shot_target: 14, min_gags: 16 } },
      shortsIsTarget: true,
    });
    expect(plan.shotTarget).toBe(14);
    expect(plan.minGags).toBe(16);
    expect(plan.explicit).toBe(true);
  });

  it('мусор в паспорте игнорируется, план остаётся выведенным', () => {
    const plan = resolveGagPlan({
      episodeMetadata: { target_runtime_seconds: 30, gag_plan: { shot_target: 'много', min_gags: -3 } },
      shortsIsTarget: true,
    });
    expect(plan.shotTarget).toBe(10);
    expect(plan.explicit).toBe(false);
  });

  it('строка для промпта несёт все числа плана — автор и раскадровка видят одно и то же', () => {
    const plan = resolveGagPlan({ episodeMetadata: { target_runtime_seconds: 30 }, shortsIsTarget: true });
    const line = gagPlanBriefLine(plan);
    expect(line).toContain('10 shots');
    expect(line).toContain('at least 10');
    expect(line).toContain('10s without a bright gag');
    expect(line).toContain('10–15');
    // Запрет сливать стадии ради числа — та самая ошибка, что ловит критик R02.
    expect(line).toContain('ADD shots');
  });
});
