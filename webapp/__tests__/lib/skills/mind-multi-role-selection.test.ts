// Единый ум забирает скиллы СПИСКОМ ролей (D77, 2026-08-08).
//
// Регрессия, которую этот файл держит: роут ума звал селектор БЕЗ `agent`, а все
// ACTIVE-скиллы на диске объявляют `applies_when.agent`. `fieldMatches` при
// заданном скоупе и пустом значении в контексте отвечает «не подходит», поэтому
// ум получал РОВНО НОЛЬ скиллов и работал без всей ремесленной библиотеки студии.
// Это корень D76: Полина написала сториборд без машиночитаемого контракта
// `storyboarder@v2`, потому что скилл `storyboarder-cosmic-horror` ей не выдали.
//
// Почему список ролей, а не снятие скоупа: снятие пустило бы `sandy-gag-library`
// (`genre:[comedy]`, Sandy-специфичный) в cosmic_horror. Оси `genre`/`series_id`/
// `episode_id` продолжают фильтровать — именно они держат изоляцию каналов, а
// изоляция обязана работать и между ЭПИЗОДАМИ (несколько идут параллельно).
//
// Тест намеренно бьёт по РЕАЛЬНЫМ скиллам на диске, как соседний
// skill-loader-hardening.test.ts: подменённый набор доказал бы работу мока, а не
// студии.
import { describe, it, expect, beforeEach } from 'vitest';
import { listSkillManifests, clearSkillsCache } from '../../../lib/skills/select-skills';
import { AGENT_REGISTRY } from '../../../lib/agents/registry';

const ALL_ROLES = Object.keys(AGENT_REGISTRY);

async function slugsFor(ctx: Parameters<typeof listSkillManifests>[0]): Promise<string[]> {
  const list = await listSkillManifests(ctx, { limit: Infinity });
  return list.map((m) => m.slug);
}

describe('выборка скиллов для единого ума', () => {
  beforeEach(() => clearSkillsCache());

  it('БЕЗ agent отдаёт ноль — та самая регрессия, ради которой всё это', async () => {
    const slugs = await slugsFor({ genre: 'cosmic_horror' });
    expect(slugs).toHaveLength(0);
  });

  it('со списком ролей отдаёт непустой репертуар', async () => {
    const slugs = await slugsFor({ agent: ALL_ROLES, genre: 'cosmic_horror' });
    expect(slugs.length).toBeGreaterThan(0);
  });

  it('жанровая изоляция держится при списке ролей: comedy не течёт в cosmic_horror', async () => {
    const horror = await slugsFor({ agent: ALL_ROLES, genre: 'cosmic_horror' });
    expect(horror).toContain('storyboarder-cosmic-horror');
    expect(horror).not.toContain('sandy-gag-library');
    expect(horror).not.toContain('storyboarder-situational-comedy');
  });

  it('жанровая изоляция держится в обратную сторону: cosmic_horror не течёт в comedy', async () => {
    const comedy = await slugsFor({ agent: ALL_ROLES, genre: 'comedy' });
    expect(comedy).toContain('storyboarder-situational-comedy');
    expect(comedy).not.toContain('storyboarder-cosmic-horror');
    expect(comedy).not.toContain('eref-prompt-cosmic-horror');
  });

  it('одиночная роль строкой работает как раньше — старые вызывающие не задеты', async () => {
    const single = await slugsFor({ agent: 'EXEC-SB', genre: 'cosmic_horror' });
    expect(single).toContain('storyboarder-cosmic-horror');
    // Скилл чужой роли не притягивается одиночным вызовом.
    expect(single).not.toContain('eref-prompt-cosmic-horror');
  });

  it('роль из списка подтягивает скиллы КАЖДОЙ своей роли, а не только первой', async () => {
    const both = await slugsFor({ agent: ['EXEC-SB', 'EXEC-EREF-DESIGNER'], genre: 'cosmic_horror' });
    expect(both).toContain('storyboarder-cosmic-horror'); // EXEC-SB
    expect(both).toContain('eref-prompt-cosmic-horror'); // EXEC-EREF-DESIGNER
  });

  it('пустой список ролей не превращается в wildcard', async () => {
    const slugs = await slugsFor({ agent: [], genre: 'cosmic_horror' });
    expect(slugs).toHaveLength(0);
  });

  it('дублей в выдаче нет, хотя роли перебираются списком', async () => {
    const slugs = await slugsFor({ agent: ALL_ROLES, genre: 'comedy' });
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
