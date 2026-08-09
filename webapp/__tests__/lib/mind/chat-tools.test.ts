// Кил-лист Ф4.2: диспетчерский класс исключён из тулсета ума НАВСЕГДА.
// Сторож держит границу грепом по факту, а не по памяти: появление любого
// умершего имени в MIND_CHAT_TOOLS — это возврат старой парадигмы под новым
// соусом, и тест обязан упасть раньше, чем это заметит Директор.
import { describe, it, expect } from 'vitest';
import { MIND_CHAT_TOOLS, findMindChatTool } from '@/lib/mind/chat-tools';
import { mindToolSpecs } from '@/lib/mind/tool-bridge';

/**
 * 29 умерших — переписаны из кил-листа chat-tools.ts.
 *
 * Было 30. `castEpisode` ВОЗВРАЩЁН 2026-08-09 и вычеркнут отсюда осознанно, а не
 * ослаблением сторожа: он попал в кил-лист по соседству с `triggerAgent`/
 * `fanoutShots`, за компанию по слову «диспетчерский», но работу роли не заказывал —
 * он держал КОНТРАКТ изделия (`SPC-episode_cast` в REVIEW, машиночитаемые слаги,
 * преflight «канон существует и LOCKED»). Без него форма исчезла: на SS-S20-E04 ум
 * написал каст markdown-таблицей, машина не увидела ничего, эпизод молча пошёл на
 * всём каноне серии. Граница парадигмы не сдвинулась — диспетчерские мертвы;
 * поправлено ОТНЕСЕНИЕ одного инструмента к классу.
 */
const KILLED = [
  // диспетчерские
  'triggerAgent', 'fanoutShots', 'reconcileEpisode', 'getStateMatrix',
  'getNextGate', 'listPendingApprovals', 'markAwaitingDirector',
  // плановый конвейер
  'getRefPlan', 'listRefPlans', 'getCriticVerdict', 'getShotPlan', 'listShotPlans',
  'getAnimatorCriticVerdict', 'regenerateRefPlan', 'regenerateImageFromPlan',
  'regenerateVideoFromPlan', 'regenerateShot', 'regenerateShotPlan',
  'unstickPlanForApproval', 'reorderShots',
  // дубли дверей реестра
  'getAsset', 'listShots', 'createEpisode', 'editBrief', 'writeStartNotice',
  'approveAsset', 'requestRevision', 'regenerateBibleImage', 'copyAssetImage',
];

describe('кил-лист Ф4.2', () => {
  it('счёт сходится: 20 выживших + 29 умерших = 49 тулов старого диспетчера', () => {
    expect(MIND_CHAT_TOOLS.length).toBe(20);
    expect(KILLED.length).toBe(29);
  });

  it('castEpisode жив — контракт каста держит инструмент, а не память ума', () => {
    expect(findMindChatTool('castEpisode')).toBeDefined();
  });

  it('ни одно умершее имя не выжило', () => {
    for (const name of KILLED) {
      expect(findMindChatTool(name), `«${name}» должен быть мёртв`).toBeUndefined();
    }
  });

  it('имена двух миров не сталкиваются (kebab у реестра, camel у чата)', () => {
    const bridge = new Set(mindToolSpecs().map((s) => s.name));
    for (const t of MIND_CHAT_TOOLS) {
      expect(bridge.has(t.name)).toBe(false);
    }
  });

  it('runVisualCritic выжил как второе мнение и статусов не меняет', () => {
    const critic = findMindChatTool('runVisualCritic');
    expect(critic).toBeDefined();
    expect(critic!.mutating).toBe(false);
  });
});
