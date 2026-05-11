// ──────────────────────────────────────────────────────────────────────────────
// lib/concierge/threads.ts
//
// Persistence helpers for `concierge_threads` and `concierge_turns`
// (migration 0025). Used by the chat route to keep long-term Director
// conversation history in Supabase, replacing the Sprint 9 sessionStorage-only
// memory.
//
// Phase 1 only writes 'message' / 'tool_call' / 'tool_result' events. The full
// event_type enum exists in the SQL CHECK so Path A (Skill Editor / Learning
// Loop) can begin emitting 'feedback', 'rejection', 'rule_proposal' etc.
// without a schema migration.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types.gen';
import type {
  ConciergeMode,
  ConciergeThreadRow,
  ConciergeTurnInput,
  ConciergeTurnRow,
} from './types';

// Canonical Supabase client shape per `lib/api/auth.ts` (single generic).
// types.gen.ts now includes concierge_threads / concierge_turns from
// migration 0025 so the insert/update payloads are fully typed.
type Client = SupabaseClient<Database>;

const THREADS_TABLE = 'concierge_threads' as const;
const TURNS_TABLE = 'concierge_turns' as const;

export interface CreateThreadInput {
  directorId?: string | null;
  episodeId?: string | null;
  activeMode: ConciergeMode;
  activeGate?: string | null;
  title?: string | null;
}

export async function createThread(
  client: SupabaseClient,
  input: CreateThreadInput,
): Promise<ConciergeThreadRow> {
  const { data, error } = await (client as LooseClient)
    .from(THREADS_TABLE)
    .insert({
      director_id: input.directorId ?? null,
      episode_id: input.episodeId ?? null,
      active_mode: input.activeMode,
      active_gate: input.activeGate ?? null,
      title: input.title ?? null,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(
      `[concierge.threads] createThread failed: ${error?.message ?? 'no row returned'}`,
    );
  }
  return data as unknown as ConciergeThreadRow;
}

export async function getThread(
  client: SupabaseClient,
  threadId: string,
): Promise<ConciergeThreadRow | null> {
  const { data, error } = await (client as LooseClient)
    .from(THREADS_TABLE)
    .select('*')
    .eq('id', threadId)
    .maybeSingle();

  if (error) {
    throw new Error(`[concierge.threads] getThread failed: ${error.message}`);
  }
  return (data as unknown as ConciergeThreadRow) ?? null;
}

export async function endThread(
  client: SupabaseClient,
  threadId: string,
): Promise<void> {
  const { error } = await (client as LooseClient)
    .from(THREADS_TABLE)
    .update({ ended_at: new Date().toISOString() })
    .eq('id', threadId);

  if (error) {
    throw new Error(`[concierge.threads] endThread failed: ${error.message}`);
  }
}

/**
 * Append a single turn to a thread. Use for both director input and assistant
 * output (call once per role). For assistant streams, persist the final
 * accumulated content after the stream closes — not on every chunk.
 */
export async function persistTurn(
  client: SupabaseClient,
  threadId: string,
  turn: ConciergeTurnInput,
): Promise<ConciergeTurnRow> {
  const { data, error } = await (client as LooseClient)
    .from(TURNS_TABLE)
    .insert({
      thread_id: threadId,
      role: turn.role,
      event_type: turn.event_type,
      content: turn.content,
      metadata: turn.metadata ?? {},
      token_count: turn.token_count ?? null,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(
      `[concierge.threads] persistTurn failed: ${error?.message ?? 'no row returned'}`,
    );
  }
  return data as unknown as ConciergeTurnRow;
}

/**
 * Load the most recent N turns for a thread, oldest-first. Used to seed the
 * LLM with conversation history when the page reloads.
 */
export async function loadRecentTurns(
  client: SupabaseClient,
  threadId: string,
  limit: number,
): Promise<ConciergeTurnRow[]> {
  const { data, error } = await (client as LooseClient)
    .from(TURNS_TABLE)
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`[concierge.threads] loadRecentTurns failed: ${error.message}`);
  }
  const rows = (data as unknown as ConciergeTurnRow[]) ?? [];
  return rows.reverse();
}
