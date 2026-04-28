// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/prompts.ts
// Filesystem path resolver for each agent's system prompt (`agents/exec/*.md`).
//
// Phase 4 ships in **mock mode** (config/providers.yaml: provider_mode: mock).
// In mock mode, runner.ts does NOT actually load these prompts and call
// Anthropic — it generates deterministic stub outputs. The map exists so
// Sprint 10 can swap in real LLM calls without touching the function bodies.
//
// Path is resolved relative to the repo root, two levels above webapp/.
// At runtime use loadPromptFile() — it reads, caches, and validates existence.
// ──────────────────────────────────────────────────────────────────────────────

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { AgentId } from './types';
import { getAgent } from './registry';

/**
 * Repo root resolution: webapp/lib/agents/prompts.ts → ../../../
 * In server runtime `process.cwd()` is the webapp/ directory when started via
 * `next dev` or `next start`, so we go one level up.
 */
const REPO_ROOT = path.resolve(process.cwd(), '..');
const PROMPT_DIR = path.join(REPO_ROOT, 'agents', 'exec');

/**
 * Map AgentId → absolute path to the agent's system prompt markdown.
 * Derived from registry.prompt_file. Agents without a prompt (model: 'none')
 * are absent from this map.
 */
export const AGENT_PROMPT_MAP: Readonly<Partial<Record<AgentId, string>>> = (() => {
  const map: Partial<Record<AgentId, string>> = {};
  for (const id of Object.keys({}) as AgentId[]) {
    // populated below via getAgent loop
  }
  // Build via a single registry pass — keeps this map and registry in sync.
  const ids: AgentId[] = [
    'EXEC-SW',
    'EXEC-SREV',
    'EXEC-SB',
    'EXEC-WCHK',
    'EXEC-EDIT',
    'EXEC-VGEN',
    'EXEC-MGEN',
    'EXEC-COPY',
    'EXEC-THUMB',
    'EXEC-PUB',
    'EXEC-ANAL',
    'EXEC-STY',
    'EXEC-ARCH',
    'EXEC-ORCH',
    'EXEC-CONC',
  ];
  for (const id of ids) {
    const entry = getAgent(id);
    if (entry.prompt_file) {
      map[id] = path.join(PROMPT_DIR, entry.prompt_file);
    }
  }
  return Object.freeze(map);
})();

// In-memory cache. Prompts don't change at runtime, no invalidation needed.
const promptCache = new Map<AgentId, string>();

/**
 * Load and cache an agent's system prompt.
 * Throws if the agent has no prompt_file in the registry, or if the file
 * cannot be read. Both are developer errors.
 */
export async function loadPromptFile(id: AgentId): Promise<string> {
  const cached = promptCache.get(id);
  if (cached !== undefined) return cached;

  const promptPath = AGENT_PROMPT_MAP[id];
  if (!promptPath) {
    throw new Error(
      `Agent ${id} has no prompt_file in registry — it is either deterministic (model: 'none') or has not been created.`
    );
  }

  const content = await readFile(promptPath, 'utf-8');
  promptCache.set(id, content);
  return content;
}

/** Test-only: clear the prompt cache. Used by vitest setup files. */
export function clearPromptCache(): void {
  promptCache.clear();
}
