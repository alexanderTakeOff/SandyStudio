// ──────────────────────────────────────────────────────────────────────────────
// lib/concierge/tools/index.ts
// Tool registry for the Prod Assistant Phase 1-B function-calling loop.
//
// Add new tools here. The OpenAI Chat Completions API consumes the
// `openaiSchemas` export; the chat route looks each tool up by name when
// the model emits a tool_call.
// ──────────────────────────────────────────────────────────────────────────────

import { getStudioStatus, getEpisode, getAsset, getRecentActivityEvents } from './studio';
import { getNextGate, listPendingApprovals } from './pipeline';
import { triggerAgent, approveAsset, requestRevision } from './dispatch';
import {
  listSeries,
  listSeriesBibles,
  enrichBible,
  setBibleContent,
  regenerateBibleImage,
  createSeries,
  copyAssetImage,
} from './series';
import { createEpisode, findEpisode, editBrief, writeStartNotice } from './episode-create';
import { listSkills, getSkill, proposeSkill, updateSkill, approveSkill } from './skills';
import { getRefPlan, listRefPlans, getCriticVerdict, regenerateRefPlan } from './eref';
import { regenerateImageFromPlan } from './eref-execute';
import { regenerateVideoFromPlan, regenerateShot } from './vgen-execute';
import { listShots } from './storyboard';
import {
  getShotPlan,
  listShotPlans,
  getAnimatorCriticVerdict,
  regenerateShotPlan,
  unstickPlanForApproval,
} from './animator';
import { reorderShots } from './shot-reorder';
import { castEpisode } from './cast';
import { listThemes, proposeTheme } from './themes';
import { markAwaitingDirector } from './mark-awaiting';
import { getWorkPlan, updateWorkPlan } from './work-plan';
import { getStateMatrix, reconcileEpisode } from './conductor';
import { fanoutShots } from './fanout';
import type { OpenAIToolSchema, Tool } from './types';

export type { Tool, ToolContext, ToolResult, OpenAIToolSchema } from './types';
export { ok, okWithPatch, fail } from './types';

/**
 * Canonical registry. Add a tool here once it's implemented; the chat route
 * picks up the OpenAI schemas via {@link openaiSchemas}.
 */
// Each Tool has its own TArgs generic. Registering them together requires
// a less strict element type — the chat route only needs `name`, `schema`,
// `parse`, `execute`, `mutating` which are invariant.
type AnyTool = Tool<Record<string, unknown>>;

export const TOOLS: ReadonlyArray<AnyTool> = Object.freeze([
  // Read-only — call freely
  getStudioStatus as unknown as AnyTool,
  getEpisode as unknown as AnyTool,
  getAsset as unknown as AnyTool,
  getRecentActivityEvents as unknown as AnyTool,
  findEpisode as unknown as AnyTool,
  getNextGate as unknown as AnyTool,
  listPendingApprovals as unknown as AnyTool,
  listSeries as unknown as AnyTool,
  listSeriesBibles as unknown as AnyTool,
  listSkills as unknown as AnyTool,
  getSkill as unknown as AnyTool,
  // EREF Plan inspection (Day 4.5)
  getRefPlan as unknown as AnyTool,
  listRefPlans as unknown as AnyTool,
  getCriticVerdict as unknown as AnyTool,
  // 2026-05-22 — storyboard shot resolution. Closes vocabulary gap where
  // Polina was asking Director for shotIds instead of fetching them from
  // the APPROVED STB asset.
  listShots as unknown as AnyTool,
  // Animator Shot Plan inspection (Day 8.5)
  getShotPlan as unknown as AnyTool,
  listShotPlans as unknown as AnyTool,
  getAnimatorCriticVerdict as unknown as AnyTool,
  // Unit A (2026-06-03) — durable per-episode work-plan / decision ledger.
  // Read-only: surfaces the STA-work_plan STATE asset content. The same doc is
  // auto-loaded into the [WORK_PLAN] system-prompt block every turn.
  getWorkPlan as unknown as AnyTool,
  // TD-25 P4 — intent declaration (replaces regex await-detector). Read-only:
  // doesn't change studio state, only annotates the assistant turn metadata.
  markAwaitingDirector as unknown as AnyTool,
  // Unit A (2026-06-03) — Polina maintains her own durable ledger. NOT mutating:
  // operational STATE she keeps current, not a creative gate, so no verbal
  // approval. Overwrites the STA-work_plan STATE asset in place.
  updateWorkPlan as unknown as AnyTool,
  // Фаза 4 (2026-07-04) — the conductor's eyes: the canonical State Matrix
  // projection. Read-only; read it before deciding the next move.
  getStateMatrix as unknown as AnyTool,
  // Mutating — verbal approval gated
  triggerAgent as unknown as AnyTool,
  // fanoutShots — the reliable per-shot Designer fan-out (reference/video). The
  // capability Polina lacked: batch triggerAgent(EXEC-*-DESIGNER) fails "requires
  // shotId"; this fires per-shot events WITH shotId. Bold-mode (Mode 3) tool.
  fanoutShots as unknown as AnyTool,
  approveAsset as unknown as AnyTool,
  requestRevision as unknown as AnyTool,
  enrichBible as unknown as AnyTool,
  setBibleContent as unknown as AnyTool,
  regenerateBibleImage as unknown as AnyTool,
  copyAssetImage as unknown as AnyTool,
  createSeries as unknown as AnyTool,
  createEpisode as unknown as AnyTool,
  editBrief as unknown as AnyTool,
  writeStartNotice as unknown as AnyTool,
  proposeSkill as unknown as AnyTool,
  updateSkill as unknown as AnyTool,
  approveSkill as unknown as AnyTool,
  regenerateRefPlan as unknown as AnyTool,
  // 2026-05-22 — plan-driven single-shot image execution. Closes the
  // architectural gap where Polina had no path to execute an APPROVED Plan
  // without going through triggerAgent(EXEC-EREF), which routes to pilot
  // pass and ignores planAssetId.
  regenerateImageFromPlan as unknown as AnyTool,
  // 2026-05-26 — sister of regenerateImageFromPlan but for video. Routes
  // via /api/episodes/:id/trigger with planAssetId so TD-50 reroute keeps
  // the Plan-driven path (Animator-declared provider + quality_tier).
  regenerateVideoFromPlan as unknown as AnyTool,
  // 2026-06-17 — anchor-mode flip (orbit⇒ref-only doctrine). Lets Director tell
  // Polина «перегени SH07 без якорей» → ref-only re-render via the existing
  // regenerate-video REST route. Sister of regenerateVideoFromPlan.
  regenerateShot as unknown as AnyTool,
  regenerateShotPlan as unknown as AnyTool,
  // TD-76 (2026-05-27) — state-machine recovery for Plans stuck in
  // REVISION despite a clean Critic verdict. Use INSTEAD of regenerateShotPlan
  // when content is already correct but state is wrong.
  unstickPlanForApproval as unknown as AnyTool,
  // TD-86 (2026-05-27) — Director-initiated shot swap. Atomically updates
  // storyboard shots[] AND animatic shot_list. Use when Director says
  // «поменяй кадры местами» / «swap shots». NOT a content regen.
  reorderShots as unknown as AnyTool,
  // Phase D (2026-06-14) — ART-AD Casting stage. Polина drafts the episode cast
  // gallery from canon slugs; canon-existence HARD GATE; Director ratifies the DRAFT.
  castEpisode as unknown as AnyTool,
  // q9a (2026-06-30) — Themes surface read + write.
  // listThemes: read-only, call freely to answer «какие темы есть».
  // proposeTheme: verbal-approval gated, persists a DRAFT theme.
  listThemes as unknown as AnyTool,
  proposeTheme as unknown as AnyTool,
  // Фаза 4 (2026-07-04) — the conductor's hands: run one reconciler convergence
  // pass (auto-advance mechanical PASS stages + stitch). Mutating; the /reconcile
  // route + MECHANICS_AUTO_ADVANCE flag + reserved gates are the guards.
  reconcileEpisode as unknown as AnyTool,
]);

const TOOL_BY_NAME: ReadonlyMap<string, AnyTool> = new Map(
  TOOLS.map((t) => [t.name, t]),
);

export function findTool(name: string): AnyTool | undefined {
  return TOOL_BY_NAME.get(name);
}

/** OpenAI Chat Completions tool definitions, ready to pass as `tools: …`. */
export const openaiSchemas: ReadonlyArray<OpenAIToolSchema> = Object.freeze(
  TOOLS.map((t) => t.schema),
);
