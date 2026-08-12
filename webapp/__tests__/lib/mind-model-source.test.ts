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
import { CONCIERGE_PROVIDER_CATALOG } from '../../lib/api/concierge-provider-config';

const bridgeSource = readFileSync(resolve(process.cwd(), 'scripts', 'mind-bridge.ts'), 'utf-8');

describe('модель ума приходит из настроек студии', () => {
  it('каталог настроек предлагает то, чем ум работает НА САМОМ ДЕЛЕ — алиасы подписки', () => {
    const harness = CONCIERGE_PROVIDER_CATALOG.filter((o) => o.provider === 'claude-code');
    expect(harness.map((o) => o.model).sort()).toEqual(['opus', 'sonnet']);
    // Подписке ключ не нужен: непустой envKey зажёг бы в UI ложное «no key».
    for (const o of harness) expect(o.envKey).toBe('');
  });

  it('мост берёт модель хода из app_config, а не из константы окружения', () => {
    expect(bridgeSource).toContain('await resolveModel()');
    expect(bridgeSource).toContain("'--model', model");
    // Env остаётся ФОЛБЭКОМ — но не источником: подстановка константы в argv
    // означала бы, что выбор в Settings снова ни на что не влияет.
    expect(bridgeSource).not.toContain("'--model', MODEL_FALLBACK");
  });

  it('мост читает ту же строку настроек, что пишет панель Settings', () => {
    expect(bridgeSource).toContain("eq('scope', 'providers')");
    expect(bridgeSource).toContain("eq('key', 'concierge_provider')");
  });

  it('модель исполненного хода попадает в карту сессии — шапка не должна врать', () => {
    expect(bridgeSource).toMatch(/model,\s*\}\);/);
  });
});
