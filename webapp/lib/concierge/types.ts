// ──────────────────────────────────────────────────────────────────────────────
// lib/concierge/types.ts
// Shared types for the Studio Concierge / Prod Assistant subsystem.
//
// Source of truth for event_type values is the SQL CHECK in
// supabase/migrations/0025_concierge_threads.sql. Keep these aligned.
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Event types written into `concierge_turns.event_type`.
 *
 * Phase 1 (Mode 2.5 MVP) emits only `message` / `tool_call` / `tool_result`.
 * The rest are reserved for Path A (Skill Editor / Learning Loop) and exist
 * here so adding them later is an insert-only code change with no migration.
 *
 * If you add a value here, also update the CHECK constraint in 0025.
 */
export type ConciergeEventType =
  | 'message'
  | 'tool_call'
  | 'tool_result'
  | 'gate_proposal'
  | 'feedback'
  | 'approval'
  | 'rejection'
  | 'rule_proposal'
  | 'rule_approved'
  | 'rule_rejected';

export type ConciergeTurnRole = 'director' | 'assistant' | 'tool' | 'system';

/** Governance modes mirrored from CLAUDE.md §6 / governance.md §4. */
export type ConciergeMode = '1' | '2' | '2.5' | '3' | '4';

export interface ConciergeThreadRow {
  id: string;
  director_id: string | null;
  episode_id: string | null;
  active_mode: ConciergeMode | null;
  active_gate: string | null;
  title: string | null;
  started_at: string;
  ended_at: string | null;
}

export interface ConciergeTurnRow {
  id: string;
  thread_id: string;
  role: ConciergeTurnRole;
  event_type: ConciergeEventType;
  content: string;
  metadata: Record<string, unknown>;
  token_count: number | null;
  created_at: string;
}

/** Slim turn shape suitable for sending to the LLM as message history. */
export interface ConciergeTurnInput {
  role: ConciergeTurnRole;
  event_type: ConciergeEventType;
  content: string;
  metadata?: Record<string, unknown>;
  token_count?: number;
}
