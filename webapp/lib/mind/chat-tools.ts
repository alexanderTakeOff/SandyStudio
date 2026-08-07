// ВЫЖИВШИЕ чат-тулы единого ума (Ф4.2) — и кил-лист с основаниями.
//
// Из 49 тулов старого диспетчера уму остаются 19. Закон отбора — два правила:
// (1) диспетчерские умирают КЛАССОМ: ум не заказывает работу ролям, он её делает;
// (2) анти-аддитивность: у изделия ОДНА дверь — читалка, дублирующая инструмент
//     реестра (`show-asset`, `ensure-episode`, `write-asset`, `set-status`,
//     `gen-frame`, `gen-video`), умирает, даже если удобна.
//
// ── КИЛ-ЛИСТ (30) ────────────────────────────────────────────────────────────
// Диспетчерские (заказ работы ролям / машинерия старого конвейера):
//   triggerAgent · fanoutShots · reconcileEpisode · castEpisode · getStateMatrix
//   getNextGate · listPendingApprovals · markAwaitingDirector
// Плановый конвейер (план-ассеты малых агентов и их перегенерация):
//   getRefPlan · listRefPlans · getCriticVerdict · getShotPlan · listShotPlans
//   getAnimatorCriticVerdict · regenerateRefPlan · regenerateImageFromPlan
//   regenerateVideoFromPlan · regenerateShot · regenerateShotPlan
//   unstickPlanForApproval · reorderShots
// Дубли дверей реестра (`scripts/run` — единственная дверь):
//   getAsset → show-asset · listShots → show-asset (STB — документ, ум читает его сам)
//   createEpisode → ensure-episode · editBrief / writeStartNotice → write-asset
//   approveAsset / requestRevision → set-status (+ замечание пишет сам ум)
//   regenerateBibleImage → gen-frame + register-canon · copyAssetImage → register-media
//
// ── ДОЛГ Ф6 ──────────────────────────────────────────────────────────────────
// Выжившие живут в lib/concierge/tools/*, а Ф6 сносит lib/concierge целиком —
// при сносе они ПЕРЕЕЗЖАЮТ (и портируются на defineTool-самоописание). Их
// reads/writes не декларированы, поэтому гейт честности реестра на них не
// распространяется — это сказано в реестре явно, а не умолчано.
//
// runVisualCritic — СМЕНА РОЛИ: был гейтом конвейера, стал ВТОРЫМ МНЕНИЕМ
// (совещательный взгляд на пиксели; статусы не меняет — решает ум).
import { getStudioStatus, getEpisode, getRecentActivityEvents } from '../concierge/tools/studio';
import { findEpisode } from '../concierge/tools/episode-create';
import {
  listSeries,
  listSeriesBibles,
  enrichBible,
  setBibleContent,
  createSeries,
} from '../concierge/tools/series';
import { listSkills, getSkill, proposeSkill, updateSkill, approveSkill } from '../concierge/tools/skills';
import { listThemes, proposeTheme } from '../concierge/tools/themes';
import { getWorkPlan, updateWorkPlan } from '../concierge/tools/work-plan';
import { runVisualCritic } from '../concierge/tools/visual-critic';
import type { Tool } from '../concierge/tools/types';

type AnyTool = Tool<Record<string, unknown>>;

export const MIND_CHAT_TOOLS: ReadonlyArray<AnyTool> = Object.freeze([
  // Обзор и чтение того, чего нет в реестре
  getStudioStatus as unknown as AnyTool,
  getEpisode as unknown as AnyTool,
  getRecentActivityEvents as unknown as AnyTool,
  findEpisode as unknown as AnyTool,
  listSeries as unknown as AnyTool,
  listSeriesBibles as unknown as AnyTool,
  // Канон: текстовые плиты (картиночные — через gen-frame + register-canon)
  enrichBible as unknown as AnyTool,
  setBibleContent as unknown as AnyTool,
  createSeries as unknown as AnyTool,
  // Ось знаний
  listSkills as unknown as AnyTool,
  getSkill as unknown as AnyTool,
  proposeSkill as unknown as AnyTool,
  updateSkill as unknown as AnyTool,
  approveSkill as unknown as AnyTool,
  // Темы — рождение эпизодов
  listThemes as unknown as AnyTool,
  proposeTheme as unknown as AnyTool,
  // Долговечная рабочая тетрадь эпизода (STA-work_plan)
  getWorkPlan as unknown as AnyTool,
  updateWorkPlan as unknown as AnyTool,
  // Второе мнение по пикселям (совещательное)
  runVisualCritic as unknown as AnyTool,
]);

const BY_NAME: ReadonlyMap<string, AnyTool> = new Map(MIND_CHAT_TOOLS.map((t) => [t.name, t]));

export function findMindChatTool(name: string): AnyTool | undefined {
  return BY_NAME.get(name);
}
