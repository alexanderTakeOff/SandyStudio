// Сторож закона «провайдеры и модели меняются через Studio Settings, не через env».
//
// Закон существовал с 08.08 — и лежал КОММЕНТАРИЕМ в `.env.local`, без единой
// проверки. Итог: мост, построенный позже, читал env напрямую, панель настроек
// показывала выбор, который ни на что не влиял, а сессия 12.08 предложила
// Директору «поправить env» — ровно запрещённый путь. Дефект был в записи, а не
// в памяти: запись без сторожа — это напоминание, которое ждёт, что кто-то
// вспомнит.
//
// Тест читает ИСХОДНИК моста (как сторож роли Полины): мост — процесс вне Next,
// его поведение нельзя проверить через импорт роутов.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CONCIERGE_PROVIDER_CATALOG,
  coerceConciergeProviderChoice,
} from '../../lib/api/concierge-provider-config';

const bridgeSource = readFileSync(resolve(process.cwd(), 'scripts', 'mind-bridge.ts'), 'utf-8');

describe('модель ума приходит из настроек студии', () => {
  it('каталог предлагает только два реальных подписочных harness-пути', () => {
    const harness = CONCIERGE_PROVIDER_CATALOG.filter((o) => o.provider === 'claude-code');
    expect(harness.map((o) => o.model).sort()).toEqual(['opus', 'sonnet']);
    const codex = CONCIERGE_PROVIDER_CATALOG.filter((o) => o.provider === 'codex');
    expect(codex.map((o) => o.model).sort()).toEqual([
      'gpt-5.6-luna',
      'gpt-5.6-sol',
      'gpt-5.6-terra',
    ]);
    expect(new Set(CONCIERGE_PROVIDER_CATALOG.map((o) => o.provider))).toEqual(
      new Set(['claude-code', 'codex']),
    );
    // Оба пути берут auth из подписочного CLI, не API-key.
    for (const o of CONCIERGE_PROVIDER_CATALOG) expect(o.envKey).toBe('');
  });

  it('мигрирует старый OpenAI Terra в подписочный Codex-runner', () => {
    expect(
      coerceConciergeProviderChoice({ provider: 'openai', model: 'gpt-5.6-terra' }),
    ).toEqual({ provider: 'codex', model: 'gpt-5.6-terra' });
  });

  it('мост берёт модель хода из app_config, а не из константы окружения', () => {
    expect(bridgeSource).toContain('await resolveHarnessChoice()');
    expect(bridgeSource).toContain('buildHarnessInvocation(choice');
    // Явный неподдерживаемый выбор не имеет ветки «иду на fallback».
    expect(bridgeSource).not.toContain('иду на ${HARNESS_FALLBACK');
  });

  it('мост читает ту же строку настроек, что пишет панель Settings', () => {
    expect(bridgeSource).toContain("eq('scope', 'providers')");
    expect(bridgeSource).toContain("eq('key', 'concierge_provider')");
  });

  it('модель исполненного хода попадает в карту сессии — шапка не должна врать', () => {
    expect(bridgeSource).toContain('provider: choice.provider');
    expect(bridgeSource).toContain('model: choice.model');
  });
});
