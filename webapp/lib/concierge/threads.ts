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
import type { Database, Json } from '@/lib/supabase/types.gen';
import { inngest } from '@/lib/inngest/client';
import type {
  ConciergeMode,
  ConciergeThreadRow,
  ConciergeTurnInput,
  ConciergeTurnRow,
} from './types';

// Canonical Supabase client shape per `lib/api/auth.ts` (single generic).
// All other generics derive from Database via defaults in supabase-js
// v2.105+. types.gen.ts includes concierge_threads / concierge_turns
// (migration 0025) so insert/update payloads are fully typed.
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
  client: Client,
  input: CreateThreadInput,
): Promise<ConciergeThreadRow> {
  const { data, error } = await client
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
  client: Client,
  threadId: string,
): Promise<ConciergeThreadRow | null> {
  const { data, error } = await client
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
  client: Client,
  threadId: string,
): Promise<void> {
  const { error } = await client
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
  client: Client,
  threadId: string,
  turn: ConciergeTurnInput,
): Promise<ConciergeTurnRow> {
  const { data, error } = await client
    .from(TURNS_TABLE)
    .insert({
      thread_id: threadId,
      role: turn.role,
      event_type: turn.event_type,
      content: turn.content,
      // Public API keeps `metadata?: Record<string, unknown>` for caller
      // convenience; coerce to the strict recursive Json type at the DB
      // boundary. Safe because the value originates from typed local code.
      metadata: (turn.metadata ?? {}) as Json,
      token_count: turn.token_count ?? null,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(
      `[concierge.threads] persistTurn failed: ${error?.message ?? 'no row returned'}`,
    );
  }
  const row = data as unknown as ConciergeTurnRow;

  // Step 2 of Supabase recovery sprint (2026-05-22): fire two Inngest events
  // so the event-driven `pa-escalation-timer` (replacement for the old
  // every-minute watchdog cron) can cancel itself when Director replies and
  // arm a new timer when Polina marks an awaiting state. Fire-and-forget —
  // never throw out of persistTurn just because Inngest is down or paused.
  fireTurnInsertedEvent(row).catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.warn(
      '[concierge.threads] turn-inserted event dispatch failed (non-fatal):',
      err instanceof Error ? err.message : err,
    );
  });
  fireAwaitingSetEventIfApplicable(row).catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.warn(
      '[concierge.threads] awaiting-set event dispatch failed (non-fatal):',
      err instanceof Error ? err.message : err,
    );
  });

  return row;
}

/**
 * Dispatch `sandystudio/concierge/turn-inserted` for every turn. The timer
 * subscribes via `cancelOn` to director-role turns in the same thread so
 * the escalation sleep can be cancelled the instant Director answers.
 */
async function fireTurnInsertedEvent(row: ConciergeTurnRow): Promise<void> {
  if (!row.thread_id || !row.id) return;
  await inngest.send({
    name: 'sandystudio/concierge/turn-inserted',
    data: {
      threadId: row.thread_id,
      turnId: row.id,
      role: row.role,
      eventType: row.event_type,
    },
  });
}

/**
 * Dispatch `sandystudio/pa/awaiting-set` ONLY when the assistant turn carries
 * `metadata.awaiting_director_input` — that is, Polina has declared a
 * blocking question (via the `markAwaitingDirector` tool ideally, or via
 * the deprecated regex detector as a fallback).
 */
async function fireAwaitingSetEventIfApplicable(
  row: ConciergeTurnRow,
): Promise<void> {
  if (row.role !== 'assistant') return;
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const awaiting = meta.awaiting_director_input;
  if (!awaiting || typeof awaiting !== 'object') return;
  const a = awaiting as {
    question?: unknown;
    deadline_sec?: unknown;
    source?: unknown;
  };
  const question = typeof a.question === 'string' ? a.question : '';
  if (!question) return; // can't escalate without a question to surface
  // Clamp deadlineSec defensively — the tool clamps too but a stray regex
  // turn might bypass.
  const rawDeadline =
    typeof a.deadline_sec === 'number' && Number.isFinite(a.deadline_sec)
      ? a.deadline_sec
      : 90;
  const deadlineSec = Math.min(3600, Math.max(30, Math.round(rawDeadline)));
  const source: 'tool' | 'regex' = a.source === 'markAwaitingDirector' ? 'tool' : 'regex';
  await inngest.send({
    name: 'sandystudio/pa/awaiting-set',
    data: {
      threadId: row.thread_id,
      turnId: row.id,
      episodeId: null, // resolved by the timer if needed via thread lookup
      question,
      deadlineSec,
      source,
    },
  });
}

/**
 * Load the most recent N turns for a thread, oldest-first. Used to seed the
 * LLM with conversation history when the page reloads.
 */
export async function loadRecentTurns(
  client: Client,
  threadId: string,
  limit: number,
): Promise<ConciergeTurnRow[]> {
  const { data, error } = await client
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
