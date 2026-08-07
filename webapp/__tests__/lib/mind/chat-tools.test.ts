// Кил-лист Ф4.2: диспетчерский класс исключён из тулсета ума НАВСЕГДА.
// Сторож держит границу грепом по факту, а не по памяти: появление любого
// умершего имени в MIND_CHAT_TOOLS — это возврат старой парадигмы под новым
// соусом, и тест обязан упасть раньше, чем это заметит Директор.
import { describe, it, expect } from 'vitest';
import { MIND_CHAT_TOOLS, findMindChatTool } from '@/lib/mind/chat-tools';
import { mindToolSpecs } from '@/lib/mind/tool-bridge';

/** 30 умерших — переписаны из кил-листа chat-tools.ts. */
const KILLED = [
  // диспетчерские
  'triggerAgent', 'fanoutShots', 'reconcileEpisode', 'castEpisode', 'getStateMatrix',
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
  it('счёт сходится: 19 выживших + 30 умерших = 49 тулов старого диспетчера', () => {
    expect(MIND_CHAT_TOOLS.length).toBe(19);
    expect(KILLED.length).toBe(30);
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
