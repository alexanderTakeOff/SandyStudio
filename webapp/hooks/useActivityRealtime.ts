// ──────────────────────────────────────────────────────────────────────────────
// hooks/useActivityRealtime.ts
//
// Subscribe to public.activity_events INSERT events via Supabase Realtime
// and forward each one to the server's ambient endpoint, which decides
// whether to persist a `system`-role turn into the active PA conversation
// thread.
//
// Phase 10A.0 Realtime push (Director directive 2026-05-13).
//
// Activation contract:
//   - Pass a non-null `threadId`. While null, the hook short-circuits.
//   - Caller is the ConciergePanel — one subscription per browser tab.
//   - Migration 0026 enables the publication for activity_events. Without
//     it, this hook compiles and runs but never receives events.
//
// Resilience:
//   - Silently retries via supabase-js's built-in reconnect logic.
//   - Each event POSTs once; the server endpoint dedupes by event id, so
//     parallel tabs / a rapid reconnect won't double-inject.
//   - Errors are console.warn'd, not thrown — Realtime drop should never
//     crash the chat panel.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useEffect, useRef } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

interface ActivityEventRow {
  id: string;
  event_type: string;
}

interface UseActivityRealtimeOptions {
  /**
   * Fired after the server endpoint reports a new ambient turn was persisted.
   * Caller can use this to nudge the PA panel into refetching or to render
   * a subtle UI indicator.
   */
  onAmbientPersisted?: (turnId: string) => void;
}

export function useActivityRealtime(
  threadId: string | null,
  opts: UseActivityRealtimeOptions = {},
): void {
  const onAmbientPersisted = opts.onAmbientPersisted;
  // Hold a stable ref to the callback so the subscription effect doesn't
  // tear down whenever the parent component re-renders with a new closure.
  const callbackRef = useRef(onAmbientPersisted);
  useEffect(() => {
    callbackRef.current = onAmbientPersisted;
  }, [onAmbientPersisted]);

  useEffect(() => {
    if (!threadId) return;

    const supabase = createSupabaseBrowserClient();
    // Defensive: HMR / StrictMode can re-run this effect with the same
    // threadId and leak channels. If a channel for this name already exists
    // on the singleton client, drop it first so we never accumulate dupes.
    const channelTopic = `activity_events:${threadId}`;
    for (const existing of supabase.getChannels()) {
      if (existing.topic === `realtime:${channelTopic}` || existing.topic === channelTopic) {
        void supabase.removeChannel(existing);
      }
    }
    const channel = supabase
      .channel(channelTopic)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'activity_events' },
        (payload) => {
          const row = payload.new as Partial<ActivityEventRow> | undefined;
          const eventId = row?.id;
          if (!eventId) return;
          // Server-side endpoint owns the filter + dedupe — we just forward.
          // Fire-and-forget; failures are non-fatal to the chat experience.
          fetch('/api/concierge/ambient', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              thread_id: threadId,
              activity_event_id: eventId,
            }),
          })
            .then(async (res) => {
              if (!res.ok) return;
              const body = (await res.json()) as
                | { data?: { persisted?: boolean; turn_id?: string } }
                | null;
              const persisted = body?.data?.persisted === true;
              const turnId = body?.data?.turn_id;
              if (persisted && turnId) callbackRef.current?.(turnId);
            })
            .catch((err: unknown) => {
              // eslint-disable-next-line no-console
              console.warn('[useActivityRealtime] ambient post failed:', err);
            });
        },
      )
      .subscribe();

    return () => {
      // removeChannel returns a Promise but we don't need to await on cleanup.
      void supabase.removeChannel(channel);
    };
  }, [threadId]);
}
