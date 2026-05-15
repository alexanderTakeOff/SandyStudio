// ──────────────────────────────────────────────────────────────────────────────
// hooks/useConciergeTurnsRealtime.ts
//
// Sprint α 2026-05-14 — replaces the fragile activity_events client-side
// subscription with a direct subscription on `concierge_turns`. Migration
// 0030 wires:
//   activity_events INSERT → Postgres trigger → concierge_turns INSERT
// so the browser only needs one publication to render two voices:
//   - role='system' metadata.kind='pipeline_event' → ambient pipeline rows
//   - role='system' metadata.kind='claude_message' → team-chat from Claude
//
// Why this hook replaces useActivityRealtime:
//   - Production showed 0 POSTs to /api/concierge/ambient via the old hook
//     despite RLS fix in 0027 — root cause was fragile client state +
//     channel teardown races. The new path has zero client→server hops
//     for ingestion (trigger does it); the browser subscribes only to read.
//   - One channel, one filter, one render path. Less surface, less drift.
//
// Caller contract: pass a stable `threadId`. While null, hook short-circuits.
// `onNewTurn` fires with the inserted row so the ConciergePanel can append
// it to the visible message timeline.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useEffect, useRef } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export interface ConciergeTurnRow {
  id: string;
  thread_id: string;
  role: 'director' | 'assistant' | 'tool' | 'system';
  event_type: string;
  content: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface UseConciergeTurnsRealtimeOptions {
  onNewTurn?: (turn: ConciergeTurnRow) => void;
}

export function useConciergeTurnsRealtime(
  threadId: string | null,
  opts: UseConciergeTurnsRealtimeOptions = {},
): void {
  const onNewTurn = opts.onNewTurn;
  const callbackRef = useRef(onNewTurn);
  useEffect(() => {
    callbackRef.current = onNewTurn;
  }, [onNewTurn]);

  useEffect(() => {
    if (!threadId) return;

    const supabase = createSupabaseBrowserClient();
    const channelTopic = `concierge_turns:${threadId}`;
    // Defensive cleanup against HMR / StrictMode dupes.
    for (const existing of supabase.getChannels()) {
      if (existing.topic === `realtime:${channelTopic}` || existing.topic === channelTopic) {
        void supabase.removeChannel(existing);
      }
    }

    // Sprint γ 2026-05-15 hotfix — Director reported: claude_message bubbles
    // arrived only after Ctrl+R despite migration 0031 fixing the
    // publication. Service-role probe receives events; authenticated browser
    // session does not. Root cause is the `thread_id=eq.X` postgres_changes
    // server-side filter clashing with the `authenticated` role's RLS
    // evaluation under Supabase Realtime v2 (known quirk). Drop the
    // server-side filter and discriminate in the handler — we accept the
    // tiny extra fanout cost in exchange for delivery actually working.
    const channel = supabase
      .channel(channelTopic)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'concierge_turns',
        },
        (payload) => {
          const row = payload.new as Partial<ConciergeTurnRow> | undefined;
          if (!row?.id || !row.role) return;
          if (row.thread_id !== threadId) return;
          callbackRef.current?.(row as ConciergeTurnRow);
        },
      )
      .subscribe((status) => {
        // eslint-disable-next-line no-console
        console.log('[useConciergeTurnsRealtime] subscribe status:', status, 'thread:', threadId);
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [threadId]);
}
