// ──────────────────────────────────────────────────────────────────────────────
// lib/concierge/tools/index.ts
// Tool registry for the Prod Assistant Phase 1-B function-calling loop.
//
// Add new tools here. The OpenAI Chat Completions API consumes the
// `openaiSchemas` export; the chat route looks each tool up by name when
// the model emits a tool_call.
// ──────────────────────────────────────────────────────────────────────────────

import { getStudioStatus, getEpisode } from './studio';
import { getNextGate, listPendingApprovals } from './pipeline';
import { triggerAgent, approveAsset } from './dispatch';
import type { OpenAIToolSchema, Tool } from './types';

export type { Tool, ToolContext, ToolResult, OpenAIToolSchema } from './types';
export { ok, fail } from './types';

/**
 * Canonical registry. Add a tool here once it's implemented; the chat route
 * picks up the OpenAI schemas via {@link openaiSchemas}.
 */
export const TOOLS: ReadonlyArray<Tool> = Object.freeze([
  getStudioStatus,
  getEpisode,
  getNextGate,
  listPendingApprovals,
  triggerAgent,
  approveAsset,
] as ReadonlyArray<Tool>);

const TOOL_BY_NAME: ReadonlyMap<string, Tool> = new Map(
  TOOLS.map((t) => [t.name, t]),
);

export function findTool(name: string): Tool | undefined {
  return TOOL_BY_NAME.get(name);
}

/** OpenAI Chat Completions tool definitions, ready to pass as `tools: …`. */
export const openaiSchemas: ReadonlyArray<OpenAIToolSchema> = Object.freeze(
  TOOLS.map((t) => t.schema),
);
