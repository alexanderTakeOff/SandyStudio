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
  /**
   * Home series of the thread (chat-per-series, 0049). When episodeId is set
   * the DB trigger derives this from the episode — passing it matters only for
   * threads born without an episode binding.
   */
  seriesId?: string | null;
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
      series_id: input.seriesId ?? null,
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

/**
 * Re-bind a thread to a different episode (2026-06-23, Director «чат должен
 * следовать за открытым эпизодом»). The chat route calls this when the
 * Director's OPEN episode page differs from the thread's current binding, so a
 * single global Prod-Assistant thread follows whatever episode the Director is
 * looking at instead of being pinned to the first episode forever.
 */
export async function updateThreadEpisode(
  client: Client,
  threadId: string,
  episodeId: string,
): Promise<void> {
  const { error } = await client
    .from(THREADS_TABLE)
    .update({ episode_id: episodeId })
    .eq('id', threadId);
  if (error) {
    throw new Error(`[concierge.threads] updateThreadEpisode failed: ${error.message}`);
  }
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

export interface ResolveOpenThreadArgs {
  episodeId?: string | null;
  /** Known series scope; derived from the episode when omitted. */
  seriesId?: string | null;
}

/**
 * Resolve the target OPEN concierge thread the same way the Postgres trigger
 * does (migration 0049, series-scoped): latest open thread for the episode,
 * else for its series, else NONE. The old «latest open thread globally»
 * fallback survives ONLY for studio-global lookups (no episode AND no series) —
 * it was the cross-series leak (multi-channel.md §8 Phase 2, Director q1:
 * a series event with no open series thread is NOT injected into chat; it
 * stays visible in the Activity feed + Inbox). Shared so the watchdog and the
 * auto-react consumer agree on "which thread" with the DB trigger.
 */
export async function resolveOpenThreadId(
  client: Client,
  args: ResolveOpenThreadArgs,
): Promise<string | null> {
  const episodeId = args.episodeId ?? null;
  let seriesId = args.seriesId ?? null;

  if (episodeId) {
    const { data } = await client
      .from(THREADS_TABLE)
      .select('id')
      .is('ended_at', null)
      .eq('episode_id', episodeId)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.id) return (data as { id: string }).id;
    if (!seriesId) {
      const { data: ep } = await client
        .from('episodes')
        .select('series_id')
        .eq('id', episodeId)
        .maybeSingle();
      seriesId = (ep as { series_id?: string | null } | null)?.series_id ?? null;
    }
  }

  if (seriesId) {
    const { data } = await client
      .from(THREADS_TABLE)
      .select('id')
      .is('ended_at', null)
      .eq('series_id', seriesId)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data as { id: string } | null)?.id ?? null;
  }

  // Episode known but its series unresolvable (row gone) — never leak globally.
  if (episodeId) return null;

  // СТУДИЙНЫЙ разговор — это тред БЕЗ сущности, а не «любой открытый» (12.08).
  // Прежний вариант отдавал первый попавшийся открытый тред, то есть студийный
  // вопрос мог попасть в переписку конкретного эпизода — та же болезнь «где я»,
  // что и рассинхрон дропдауна, только в канале ума.
  const { data: anyOpen } = await client
    .from(THREADS_TABLE)
    .select('id')
    .is('ended_at', null)
    .is('episode_id', null)
    .is('series_id', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (anyOpen as { id: string } | null)?.id ?? null;
}

/**
 * Карта headless-сессии Полины ЖИВЁТ НА ТРЕДЕ (миграция 0057).
 *
 * Раньше она лежала в `episodes.metadata.mind_session`, и это привязывало ум к
 * одной сущности: студийных и сериальных разговоров вести было негде. Тред уже
 * знает свою сущность (`episode_id` / `series_id` / оба null = студия), поэтому
 * сессия следует за сущностью по построению.
 */
export interface MindSessionMap {
  session_id?: string | null;
  previous_session_id?: string | null;
  busy?: { pid: number; turn_ids: string[]; started_at: string } | null;
  context_tokens?: number | null;
  context_limit?: number | null;
  updated_at?: string;
}

export async function readThreadMindSession(
  client: Client,
  threadId: string,
): Promise<MindSessionMap> {
  const { data, error } = await client
    .from(THREADS_TABLE)
    .select('mind_session')
    .eq('id', threadId)
    .maybeSingle();
  if (error) throw new Error(`[concierge.threads] readThreadMindSession: ${error.message}`);
  return ((data as { mind_session?: MindSessionMap } | null)?.mind_session ?? {}) as MindSessionMap;
}

export async function writeThreadMindSession(
  client: Client,
  threadId: string,
  patch: Partial<MindSessionMap>,
): Promise<void> {
  const current = await readThreadMindSession(client, threadId);
  const next = { ...current, ...patch, updated_at: new Date().toISOString() };
  const { error } = await client
    .from(THREADS_TABLE)
    .update({ mind_session: next as never })
    .eq('id', threadId);
  if (error) throw new Error(`[concierge.threads] writeThreadMindSession: ${error.message}`);
}

/**
 * Close (set ended_at) OPEN threads whose latest turn is older than ttlMin.
 * A closed thread is skipped by exec-pa-react and the ambient injection, so
 * this structurally stops watchdog / ambient nudges from landing on dead
 * threads (a contributor to the 2026-06-25 runaway: many stale OPEN threads
 * each polled by the watchdog). Bounded scan, best-effort, resilient per-row.
 * Empty threads (no turns yet) are left alone. Returns count closed.
 */
export async function closeStaleConciergeThreads(
  client: Client,
  ttlMin: number,
  scanLimit = 50,
): Promise<number> {
  const { data: open } = await client
    .from(THREADS_TABLE)
    .select('id')
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(scanLimit);
  const rows = (open as Array<{ id: string }> | null) ?? [];
  if (rows.length === 0) return 0;
  const cutoff = Date.now() - ttlMin * 60_000;
  let closed = 0;
  for (const t of rows) {
    try {
      const last = (await loadRecentTurns(client, t.id, 1))[0];
      if (!last) continue; // empty/just-created thread — leave it
      const lastTs = last.created_at ? new Date(last.created_at).getTime() : 0;
      if (lastTs >= cutoff) continue; // active recently
      await endThread(client, t.id);
      closed += 1;
    } catch {
      // best-effort: a single bad thread must not abort the sweep
    }
  }
  return closed;
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
