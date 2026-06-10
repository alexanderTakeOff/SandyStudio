// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/types.ts
// Shared types for the EXEC-* agent layer. No runtime dependencies.
//
// The agent layer is intentionally split into:
//   - stable machine identifiers (AgentId / AgentCode) used in events, jobs,
//     concurrency keys, and any persisted record;
//   - human-facing display fields (registry.ts) used in UI and Concierge text.
//
// Renaming machine identifiers is destructive (Inngest event log retention is
// permanent). Renaming display fields is safe.
// ──────────────────────────────────────────────────────────────────────────────

/** Canonical PascalCase-with-prefix identifier. Used in jobs.agent_id, logs, code. */
export type AgentId =
  | 'EXEC-SW'
  | 'EXEC-SREV'
  | 'EXEC-SB'
  | 'EXEC-CREAD' // C1-Gate sprint 2026-06-10 — universal Creative Readability Critic (slot after STB, before WCHK)
  | 'EXEC-WCHK'
  | 'EXEC-EREF'
  | 'EXEC-EREF-DESIGNER' // Sprint «Дизайнер и Аниматор» 2026-05-18 — Plan writer for EREF
  | 'EXEC-EPREV' // Sprint «Дизайнер и Аниматор» 2026-05-19 — Designer's Critic (Plan validator)
  | 'EXEC-VANIM' // Sprint «Дизайнер и Аниматор» Day 6-7 2026-05-19 — Animator (VID Plan author)
  | 'EXEC-VPREV' // Sprint «Дизайнер и Аниматор» Day 8 2026-05-19 — Animator's Critic
  | 'EXEC-EDIT'
  | 'EXEC-VGEN'
  | 'EXEC-MGEN'
  | 'EXEC-STITCH'
  | 'EXEC-THUMB-DESIGNER' // distribution tail 2026-06-01 — viral thumbnail Plan author
  | 'EXEC-THUMB'
  | 'EXEC-COPY'
  | 'EXEC-PUB'
  | 'EXEC-ANAL'
  | 'EXEC-ARCH'
  | 'EXEC-STY'
  | 'EXEC-BIBLE-AUTHOR'
  | 'EXEC-STYLE-CHECK'
  | 'EXEC-EREF-CHECK'
  | 'EXEC-ORCH'
  | 'EXEC-CONC';

/** Lowercase slug. Used in Inngest event names, concurrency map keys, file paths. */
export type AgentCode =
  | 'exec-sw'
  | 'exec-srev'
  | 'exec-sb'
  | 'exec-cread'
  | 'exec-wchk'
  | 'exec-eref'
  | 'exec-eref-designer'
  | 'exec-eprev'
  | 'exec-vanim'
  | 'exec-vprev'
  | 'exec-edit'
  | 'exec-vgen'
  | 'exec-mgen'
  | 'exec-stitch'
  | 'exec-thumb-designer'
  | 'exec-thumb'
  | 'exec-copy'
  | 'exec-pub'
  | 'exec-anal'
  | 'exec-arch'
  | 'exec-sty'
  | 'exec-bible-author'
  | 'exec-style-check'
  | 'exec-eref-check'
  | 'exec-orch'
  | 'exec-conc';

export type AgentCategory =
  | 'production' // writes/edits creative content
  | 'review' // QA gates
  | 'media' // generates binary assets
  | 'distribution' // publish + analytics
  | 'orchestration'; // coordination, routing

/** Model routing tier per CLAUDE.md §5. Exact model IDs resolved at runtime. */
export type AgentModelTier =
  | 'haiku' // claude-haiku-4-5 — boilerplate, tagging
  | 'sonnet' // claude-sonnet-4-6 — script/storyboard/QA
  | 'opus' // claude-opus-4-7 — strategy, world bible
  | 'openai-mini' // gpt-5.4-mini — Concierge only (CLAUDE.md §5)
  | 'none'; // deterministic agent, no LLM

/** Approval category per CLAUDE.md §6 + governance.md. */
export type GovernanceCategory =
  | 'A' // hard limits — Director only, all modes (PUBLISH, LOCK, Budget, Mode-change)
  | 'B' // creative gates — Director or EXEC-DIR-AI by mode
  | 'C'; // autonomous — agent self-checks

/**
 * The single source of truth row for one agent.
 * UI/Concierge text reads from `display_ru`/`display_en`/`emoji`.
 * Pipeline routing reads from `next_agent`.
 * Skill composition is via `skills[]` referencing ECC skill ids.
 */
export interface AgentRegistryEntry {
  id: AgentId;
  code: AgentCode;
  display_ru: string;
  display_en: string;
  emoji: string;
  category: AgentCategory;
  model: AgentModelTier;
  /** ECC skill ids from CLAUDE.md §5. Composable — add/remove without renaming. */
  skills: readonly string[];
  /** Default downstream agent. EXEC-ORCH may override per Mode/state. null = terminal. */
  next_agent: AgentId | null;
  governance: GovernanceCategory;
  /** Filename inside agents/exec/ (e.g. "screenwriter.md"). null = no system prompt. */
  prompt_file: string | null;
  /** True if this agent has an Inngest function in inngest/functions/. */
  has_inngest_function: boolean;
}

/** Result of an upstream-input gate check before running an agent. */
export interface GateResult {
  passed: boolean;
  missing: readonly string[];
  reason?: string;
}

/** One idempotent cost-recording row written to activity_events. */
export interface CostRecord {
  job_id: string;
  episode_id: string | null;
  agent_id: AgentId;
  cost_usd: number;
  recorded_at: string; // ISO 8601
}

/** Loaded inputs handed to runAgent. Loose by design — gate.ts validates per agent. */
export interface AgentInputs {
  episode_id: string;
  /**
   * Approve-with-notes propagation (Sprint γ 2026-05-15).
   * Director directive: «утверждаем с замечаниями → замечания должны
   * поступать следующему исполнителю». For every upstream asset that has
   * an `approvals.notes` row, the latest APPROVE note is surfaced here
   * keyed by asset_id. Runners that produce new artefacts downstream of
   * an approval gate (Storyboarder, World Checker, Editor, etc.) read
   * this and inject `[DOWNSTREAM_NOTES_FROM_PREVIOUS_GATE]` into their
   * prompt so the note isn't lost at the gate transition.
   */
  upstream_approval_notes?: Record<string, string>;
  /** Sprint σ.1 (2026-05-15). `series.genre` resolved at input-load time,
   *  passed to the Skill selector so genre-scoped skills (comedy, etc.)
   *  match. Null when series unknown or mock supabase environment. */
  series_genre?: string | null;
  [key: string]: unknown;
}

/** Output of runAgent. saveAgentOutput maps this to assets + asset_relations rows. */
export interface AgentResult {
  asset_id?: string;
  asset_paths: readonly string[];
  cost_usd: number;
  metadata: Record<string, unknown>;
  /** Next event to fire after save-and-complete. Omitted = end of chain. */
  next_event?: {
    name: string;
    data: Record<string, unknown>;
  };
  /** Multiple next events for fan-out (e.g. EXEC-EDIT → N × EXEC-VGEN). */
  fan_out_events?: ReadonlyArray<{
    name: string;
    data: Record<string, unknown>;
  }>;
}

/**
 * Action codes that governance enforces. Each maps to a Category (A/B/C):
 *  A — hard limit, always Director (PUBLISH, LOCK, BUDGET_OVERRIDE, MODE_CHANGE)
 *  B — creative gate, Mode-dependent (REGENERATE_IMAGE, ENRICH_ASSET, AGENT_RUN, ...)
 *  C — autonomous / direct Director (UPLOAD_ASSET, EDIT_DESCRIPTION)
 */
export type GovernanceAction =
  | 'PUBLISH'
  | 'LOCK'
  | 'BUDGET_OVERRIDE'
  | 'MODE_CHANGE'
  | 'AGENT_RUN'
  | 'REGENERATE_IMAGE'
  | 'ENRICH_ASSET'
  | 'UPLOAD_ASSET'
  | 'EDIT_DESCRIPTION';

/** Single source of truth for category mapping. Read by `enforceMode`. */
export type ActionCategory = 'A' | 'B' | 'C';
