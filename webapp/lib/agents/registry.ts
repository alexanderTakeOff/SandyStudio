// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/registry.ts
// Single source of truth for every agent in the studio.
//
// Every UI label, Concierge sentence, activity-log line, and pipeline routing
// decision reads from this file. Machine identifiers (id, code, prompt_file)
// are stable; display fields are safe to rewrite.
//
// Skill composition (skills[]) lets an agent gain new ECC capabilities without
// renaming or duplicating registry rows. Adding a skill is one line here.
//
// References:
//   - CLAUDE.md §4 (Level 3 agents)
//   - CLAUDE.md §5 (ECC skill mapping)
//   - CLAUDE.md §6 (governance modes)
//   - specs/system/webapp.md §4.1 (Inngest event names)
//   - specs/company/governance.md (approval categories A/B/C)
// ──────────────────────────────────────────────────────────────────────────────

import type {
  AgentCode,
  AgentId,
  AgentRegistryEntry,
} from './types';

/**
 * Canonical agent registry.
 *
 * Keep ordered by pipeline phase: production → review → media → distribution.
 * Orchestration agents (ORCH/CONC) at the end — they don't fit the linear flow.
 */
export const AGENT_REGISTRY: Readonly<Record<AgentId, AgentRegistryEntry>> = {
  // ── Production phase ────────────────────────────────────────────────────────

  'EXEC-STY': {
    id: 'EXEC-STY',
    code: 'exec-sty',
    display_ru: 'Создатель стиля',
    display_en: 'Style Creator',
    emoji: '🎨',
    category: 'production',
    model: 'opus',
    skills: ['gan-design'],
    next_agent: 'EXEC-SW',
    governance: 'B',
    prompt_file: 'style_creator.md',
    has_inngest_function: false, // run upstream/manually, not async
  },

  'EXEC-SW': {
    id: 'EXEC-SW',
    code: 'exec-sw',
    display_ru: 'Главный сценарист',
    display_en: 'Head Screenwriter',
    emoji: '✍️',
    category: 'production',
    model: 'sonnet',
    skills: ['agentic-engineering'],
    next_agent: 'EXEC-SREV',
    governance: 'B',
    prompt_file: 'screenwriter.md',
    has_inngest_function: true,
  },

  'EXEC-SREV': {
    id: 'EXEC-SREV',
    code: 'exec-srev',
    display_ru: 'Критик-редактор',
    display_en: 'Script Reviewer',
    emoji: '🔍',
    category: 'review',
    model: 'sonnet',
    skills: ['code-reviewer', 'silent-failure-hunter', 'eval-harness'],
    next_agent: 'EXEC-SB',
    governance: 'B',
    prompt_file: 'script_reviewer.md',
    has_inngest_function: true,
  },

  'EXEC-SB': {
    id: 'EXEC-SB',
    code: 'exec-sb',
    display_ru: 'Раскадровщик',
    display_en: 'Storyboarder',
    emoji: '🎬',
    category: 'production',
    model: 'sonnet',
    skills: ['plan', 'planner'],
    next_agent: 'EXEC-WCHK',
    governance: 'B',
    prompt_file: 'storyboarder.md',
    has_inngest_function: true,
  },

  'EXEC-WCHK': {
    id: 'EXEC-WCHK',
    code: 'exec-wchk',
    display_ru: 'Хранитель мира',
    display_en: 'World Checker',
    emoji: '🌍',
    category: 'review',
    model: 'sonnet',
    skills: ['gan-evaluator', 'eval-harness'],
    next_agent: 'EXEC-EDIT',
    governance: 'B',
    prompt_file: 'world_checker.md',
    has_inngest_function: true,
  },

  'EXEC-EREF-DESIGNER': {
    id: 'EXEC-EREF-DESIGNER',
    code: 'exec-eref-designer',
    display_ru: 'Дизайнер референсов',
    display_en: 'Episode Reference Designer',
    emoji: '🧠',
    category: 'production',
    model: 'sonnet', // Sprint «Дизайнер и Аниматор» 2026-05-18 — LLM-driven Plan author
    skills: ['eref-designer'],
    next_agent: 'EXEC-EPREV', // Day 4 — Critic validates Plan before Director sees it
    governance: 'B',
    prompt_file: 'episode_reference_designer.md',
    has_inngest_function: true,
  },

  'EXEC-EPREV': {
    id: 'EXEC-EPREV',
    code: 'exec-eprev',
    display_ru: 'Критик дизайнера',
    display_en: "Designer's Critic",
    emoji: '🧐',
    category: 'review',
    // Sonnet 4.6 — Critic enforces V01-V09 hard checks against the Plan JSON
    // body. Cheap (~$0.01-0.03 per Plan, no image generation). Verdict drives
    // auto-chain: PASS → Plan flips REVIEW (Director sees it); REVISE → Plan
    // flips REVISION + revisionNote fires Designer re-run with hard contract.
    model: 'sonnet',
    skills: [],
    next_agent: 'EXEC-EREF', // after Plan APPROVED, executor reads it and calls provider
    governance: 'B',
    prompt_file: 'episode_reference_critic.md',
    has_inngest_function: true,
  },

  'EXEC-VANIM': {
    id: 'EXEC-VANIM',
    code: 'exec-vanim',
    display_ru: 'Аниматор',
    display_en: 'Animator',
    emoji: '🎬',
    category: 'production',
    // Sonnet 4.6 — per-shot video generation Plan author. Replaces the
    // buildShotPromptV2 template path when ANIMATOR_CHAIN_ENABLED is on.
    model: 'sonnet',
    skills: ['animator'],
    next_agent: 'EXEC-VPREV', // Day 8 — Animator's Critic validates Plan
    governance: 'B',
    prompt_file: 'animator.md',
    has_inngest_function: true,
  },

  'EXEC-VPREV': {
    id: 'EXEC-VPREV',
    code: 'exec-vprev',
    display_ru: 'Критик аниматора',
    display_en: "Animator's Critic",
    emoji: '🧐',
    category: 'review',
    // Sonnet 4.6 — V01-V09 hard checks against shot Plan JSON body (provider
    // format match, ≤1 primary action, NEGATIVE baseline, continuity anchor,
    // duration consistency). Cheap (~$0.01-0.03 per Plan). Registered now
    // (Day 6-7) so Animator.next_agent resolves; Inngest function lands in
    // Day 8 — `has_inngest_function: false` until then.
    model: 'sonnet',
    skills: [],
    next_agent: 'EXEC-VGEN', // after Plan APPROVED, executor consumes it
    governance: 'B',
    prompt_file: 'animator_critic.md',
    has_inngest_function: false,
  },

  'EXEC-EREF': {
    id: 'EXEC-EREF',
    code: 'exec-eref',
    display_ru: 'Художник эпизод-референсов',
    display_en: 'Episode Reference Generator',
    emoji: '🖼️',
    category: 'production',
    model: 'haiku', // image generation is via gpt-image-1; text scaffold is light
    skills: ['fal-ai-media', 'prompt-optimizer'],
    next_agent: 'EXEC-EDIT',
    governance: 'B',
    prompt_file: 'episode_reference.md', // to be written in Step 5
    has_inngest_function: true,
  },

  'EXEC-EDIT': {
    id: 'EXEC-EDIT',
    code: 'exec-edit',
    display_ru: 'Монтажёр-аниматик',
    display_en: 'Animatic Editor',
    emoji: '🎞️',
    category: 'production',
    model: 'sonnet',
    skills: ['remotion-video-creation'],
    next_agent: 'EXEC-VGEN', // fan-out per shot after animatic approval
    governance: 'B',
    prompt_file: 'editor.md',
    has_inngest_function: true,
  },

  // ── Media generation phase (cost-bearing) ───────────────────────────────────

  'EXEC-VGEN': {
    id: 'EXEC-VGEN',
    code: 'exec-vgen',
    display_ru: 'Художник кадров',
    display_en: 'Visual Generator',
    emoji: '🎥',
    category: 'media',
    model: 'haiku',
    skills: [
      'fal-ai-media',
      'remotion-video-creation',
      'prompt-optimizer',
      'cost-aware-llm-pipeline',
    ],
    next_agent: null, // shots collect, EXEC-PUB picks them up after approval
    governance: 'B',
    prompt_file: 'visual_generator.md',
    has_inngest_function: true,
  },

  'EXEC-MGEN': {
    id: 'EXEC-MGEN',
    code: 'exec-mgen',
    display_ru: 'Композитор',
    display_en: 'Music Generator',
    emoji: '🎵',
    category: 'media',
    model: 'haiku',
    skills: ['fal-ai-media', 'video-editing', 'prompt-optimizer', 'cost-aware-llm-pipeline'],
    next_agent: null,
    governance: 'B',
    prompt_file: 'music_generator.md',
    has_inngest_function: true,
  },

  // EXEC-STITCH (Phase A.2 PR β, 2026-05-08): assembles 13 APPROVED VID-shot
  // mp4s + APPROVED music track into one final episode mp4 via local ffmpeg.
  // Per specs/system/assembly_tool.md §D-002 (APPROVED) ffmpeg is the chosen
  // tool. The agent shells out to system `ffmpeg` (no npm dep). Director
  // must have ffmpeg installed in PATH; missing-ffmpeg failure is reported
  // explicitly by the runner.
  'EXEC-STITCH': {
    id: 'EXEC-STITCH',
    code: 'exec-stitch',
    display_ru: 'Сборщик эпизода',
    display_en: 'Episode Stitcher',
    emoji: '🎬',
    category: 'media',
    model: 'haiku', // unused — runner uses local ffmpeg, not LLM
    skills: ['video-editing'],
    next_agent: null, // EXEC-PUB picks up the final cut from approve gate
    governance: 'B',
    prompt_file: 'episode_stitcher.md',
    has_inngest_function: true,
  },

  'EXEC-COPY': {
    id: 'EXEC-COPY',
    code: 'exec-copy',
    display_ru: 'Копирайтер',
    display_en: 'Copywriter',
    emoji: '📝',
    category: 'distribution',
    model: 'haiku',
    skills: ['content-engine', 'seo', 'brand-voice'],
    next_agent: 'EXEC-THUMB',
    governance: 'B',
    prompt_file: 'copywriter.md',
    has_inngest_function: true,
  },

  'EXEC-THUMB': {
    id: 'EXEC-THUMB',
    code: 'exec-thumb',
    display_ru: 'Иллюстратор обложек',
    display_en: 'Thumbnail Creator',
    emoji: '🖼️',
    category: 'media',
    model: 'haiku',
    skills: ['fal-ai-media', 'gan-generator', 'prompt-optimizer'],
    next_agent: null,
    governance: 'B',
    prompt_file: 'thumbnail_creator.md',
    has_inngest_function: true,
  },

  // ── Distribution phase ──────────────────────────────────────────────────────

  'EXEC-PUB': {
    id: 'EXEC-PUB',
    code: 'exec-pub',
    display_ru: 'Издатель',
    display_en: 'Publisher',
    emoji: '🚀',
    category: 'distribution',
    model: 'haiku',
    skills: ['crosspost', 'x-api', 'google-workspace-ops'],
    next_agent: 'EXEC-ANAL', // via schedule-analytics fan-out
    governance: 'A', // hard limit — Director only in Modes 1/2/3
    prompt_file: 'publisher.md',
    has_inngest_function: true,
  },

  'EXEC-ANAL': {
    id: 'EXEC-ANAL',
    code: 'exec-anal',
    display_ru: 'Аналитик',
    display_en: 'Analytics Collector',
    emoji: '📊',
    category: 'distribution',
    model: 'haiku',
    skills: ['deep-research', 'exa-search', 'research-ops', 'seo'],
    next_agent: null,
    governance: 'C',
    prompt_file: 'analytics_collector.md',
    has_inngest_function: true,
  },

  'EXEC-BIBLE-AUTHOR': {
    id: 'EXEC-BIBLE-AUTHOR',
    code: 'exec-bible-author',
    display_ru: 'Автор Библии',
    display_en: 'Bible Author',
    emoji: '📖',
    category: 'production',
    model: 'sonnet',
    skills: ['agentic-engineering', 'fal-ai-media', 'prompt-optimizer'],
    next_agent: null,
    governance: 'B',
    prompt_file: 'bible_author.md',
    has_inngest_function: false, // called inline from extension approval route
  },

  'EXEC-STYLE-CHECK': {
    id: 'EXEC-STYLE-CHECK',
    code: 'exec-style-check',
    display_ru: 'Хранитель стиля',
    display_en: 'Style Guardian',
    emoji: '🎨',
    category: 'review',
    model: 'sonnet',
    skills: ['eval-harness', 'brand-voice'],
    next_agent: null,
    governance: 'C',
    prompt_file: 'style_check.md',
    has_inngest_function: false, // called inline before every paid generation
  },

  'EXEC-EREF-CHECK': {
    id: 'EXEC-EREF-CHECK',
    code: 'exec-eref-check',
    display_ru: 'QC-инспектор кадра',
    display_en: 'Shot QC Inspector',
    emoji: '🔍',
    category: 'review',
    model: 'sonnet', // Sonnet 4.6 — vision-capable for image-to-text scoring
    skills: ['eval-harness', 'gan-evaluator'],
    next_agent: null,
    governance: 'C',
    prompt_file: null, // system prompt is inlined in lib/agents/runners/eref-check.ts
    has_inngest_function: false, // called inline from EREF runner after each generation
  },

  // ── Orchestration agents (no Inngest function) ──────────────────────────────

  'EXEC-ARCH': {
    id: 'EXEC-ARCH',
    code: 'exec-arch',
    display_ru: 'Архивариус',
    display_en: 'Archivist',
    emoji: '🗂️',
    category: 'orchestration',
    model: 'none', // deterministic naming/registry validation
    skills: ['knowledge-ops', 'sandystudio-archivist'],
    next_agent: null,
    governance: 'C',
    prompt_file: 'archivist.md',
    has_inngest_function: false,
  },

  'EXEC-ORCH': {
    id: 'EXEC-ORCH',
    code: 'exec-orch',
    display_ru: 'Координатор пайплайна',
    display_en: 'Pipeline Orchestrator',
    emoji: '🧭',
    category: 'orchestration',
    model: 'sonnet',
    skills: ['ralphinho-rfc-pipeline'],
    next_agent: null,
    governance: 'C',
    prompt_file: 'orchestrator.md',
    has_inngest_function: false, // routing is sync, not async
  },

  'EXEC-CONC': {
    id: 'EXEC-CONC',
    code: 'exec-conc',
    display_ru: 'Консьерж студии',
    display_en: 'Studio Concierge',
    emoji: '💬',
    category: 'orchestration',
    model: 'openai-mini', // CLAUDE.md §5: gpt-5.4-mini
    skills: [],
    next_agent: null,
    governance: 'C',
    prompt_file: 'concierge.md',
    has_inngest_function: false, // sync chat route, not Inngest
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Look up by AgentId. Throws on unknown id (developer error). */
export function getAgent(id: AgentId): AgentRegistryEntry {
  const entry = AGENT_REGISTRY[id];
  if (!entry) {
    throw new Error(`Unknown agent id: ${id}`);
  }
  return entry;
}

/** Look up by lowercase code. Returns undefined for unknown — caller decides. */
export function agentByCode(code: AgentCode): AgentRegistryEntry | undefined {
  return Object.values(AGENT_REGISTRY).find((e) => e.code === code);
}

/** Display label for a given language. Falls back to English then to id. */
export function displayName(id: AgentId, lang: 'ru' | 'en' = 'ru'): string {
  const entry = AGENT_REGISTRY[id];
  if (!entry) return id;
  return lang === 'ru' ? entry.display_ru : entry.display_en;
}

/** Display with emoji prefix — for Concierge messages and activity logs. */
export function displayWithEmoji(id: AgentId, lang: 'ru' | 'en' = 'ru'): string {
  const entry = AGENT_REGISTRY[id];
  if (!entry) return id;
  const name = lang === 'ru' ? entry.display_ru : entry.display_en;
  return `${entry.emoji} ${name}`;
}

/** All agents that have an Inngest function. Used by inngest/index.ts to register. */
export function inngestAgents(): readonly AgentRegistryEntry[] {
  return Object.values(AGENT_REGISTRY).filter((e) => e.has_inngest_function);
}

/** All agents in a given category. Used by UI groupings. */
export function agentsByCategory(
  category: AgentRegistryEntry['category']
): readonly AgentRegistryEntry[] {
  return Object.values(AGENT_REGISTRY).filter((e) => e.category === category);
}

/** Resolve concrete model id for runtime. Single switch — easy to evolve. */
export function resolveModelId(id: AgentId): string {
  const entry = getAgent(id);
  switch (entry.model) {
    case 'haiku':
      return 'claude-haiku-4-5';
    case 'sonnet':
      return 'claude-sonnet-4-6';
    case 'opus':
      return 'claude-opus-4-7';
    case 'openai-mini':
      return process.env.OPENAI_MODEL ?? 'gpt-5.4-mini';
    case 'none':
      return '';
  }
}

/** Convenience: array of all agent IDs. Type-safe iteration. */
export const ALL_AGENT_IDS: readonly AgentId[] = Object.keys(AGENT_REGISTRY) as AgentId[];

/** Convenience: array of all codes that have Inngest functions. */
export const INNGEST_AGENT_CODES: readonly AgentCode[] = inngestAgents().map((e) => e.code);
