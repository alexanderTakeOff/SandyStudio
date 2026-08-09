// Сторож роли Полины (миграция «Полина в харнес», Ф0).
//
// Роль — сгенерированный файл: карта маршрута из ROW_DEFINITIONS, инструменты из
// ToolSpec.stations, скиллы из манифестов. Этот тест — тот же закон, что у
// docs/TOOLS.md: реестр, разошедшийся с кодом, ломает прогон, а не ждёт, пока
// кто-то вспомнит его обновить (ровно так умерли старые якоря — компас 07-27).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildPolinaRole } from '../../scripts/gen-role-polina';

describe('gen-role-polina', () => {
  it('roles/polina.md совпадает с выводом из реестров (иначе: npx tsx scripts/gen-role-polina.ts --write)', () => {
    const committed = readFileSync(resolve(process.cwd(), 'roles', 'polina.md'), 'utf-8');
    expect(committed).toBe(buildPolinaRole());
  });

  it('роль несёт обязательные блоки харнеса', () => {
    const role = buildPolinaRole();
    // Станция самосверки — решение Директора 09.08: кадр не предъявляется без
    // вердикта сверки с плитами канона.
    expect(role).toContain('САМОСВЕРКА КАДРА');
    // Хард-лимиты включают merge/деплой — гейты вместо запрета на код.
    expect(role).toContain('merge в master');
    // Скиллы читаются нативно, не мёртвым getSkill.
    expect(role).not.toContain('getSkill');
    // Карта маршрута выведена, а не пересказана.
    expect(role).toContain('[МАРШРУТ СТУДИИ');
    // Жанровые границы скиллов видны в карте (урок sandy-gag-library).
    expect(role).toContain('[жанр: comedy]');
  });
});
