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
} from './series';
import { createEpisode, findEpisode, editBrief } from './episode-create';
import { listSkills, getSkill, proposeSkill, updateSkill, approveSkill } from './skills';
import { getRefPlan, listRefPlans, getCriticVerdict, regenerateRefPlan } from './eref';
import {
  getShotPlan,
  listShotPlans,
  getAnimatorCriticVerdict,
  regenerateShotPlan,
} from './animator';
import type { OpenAIToolSchema, Tool } from './types';

export type { Tool, ToolContext, ToolResult, OpenAIToolSchema } from './types';
export { ok, fail } from './types';

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
  // Animator Shot Plan inspection (Day 8.5)
  getShotPlan as unknown as AnyTool,
  listShotPlans as unknown as AnyTool,
  getAnimatorCriticVerdict as unknown as AnyTool,
  // Mutating — verbal approval gated
  triggerAgent as unknown as AnyTool,
  approveAsset as unknown as AnyTool,
  requestRevision as unknown as AnyTool,
  enrichBible as unknown as AnyTool,
  setBibleContent as unknown as AnyTool,
  regenerateBibleImage as unknown as AnyTool,
  createSeries as unknown as AnyTool,
  createEpisode as unknown as AnyTool,
  editBrief as unknown as AnyTool,
  proposeSkill as unknown as AnyTool,
  updateSkill as unknown as AnyTool,
  approveSkill as unknown as AnyTool,
  regenerateRefPlan as unknown as AnyTool,
  regenerateShotPlan as unknown as AnyTool,
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
