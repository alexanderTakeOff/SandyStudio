// ──────────────────────────────────────────────────────────────────────────────
// hooks/useEpisodeRealtime.ts
//
// Realtime PUSH for the Episode Timeline (2026-07-18, Director "5s polling жутко
// бесит"). Replaces tight 4s/8s SWR polling of `/api/episodes/[id]` with an
// event-driven refetch: subscribe to `activity_events` INSERTs (already in the
// `supabase_realtime` publication since migration 0026, RLS done) and, whenever
// one lands for THIS episode, invalidate the timeline so it re-reads the computed
// state-matrix. Server-side aggregation stays the single source of truth — we do
// NOT rebuild the matrix from raw row payloads on the client.
//
// Every timeline-relevant change (job started/completed, asset approve/bounce,
// reconcile) writes an activity_event, so this one already-published stream is a
// sufficient "something changed" trigger — no new table needs publishing.
//
// Why filter in the handler, not the subscription: Supabase Realtime v2 has a
// known quirk where a server-side `filter` (episode_id=eq.X) clashes with the
// `authenticated` role's RLS evaluation and silently delivers nothing (see the
// note in useConciergeTurnsRealtime + migration 0031). We subscribe unfiltered
// and discriminate by episode_id here — a tiny extra fanout for delivery that works.
//
// onChange is DEBOUNCED (bursts of events in one pipeline step coalesce into one
// refetch), so a busy step costs one `/api/episodes/[id]` fetch, not one per event.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useEffect, useRef } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const DEBOUNCE_MS = 400;

export function useEpisodeRealtime(
  episodeId: string | null,
  onChange: () => void,
): void {
  const cbRef = useRef(onChange);
  useEffect(() => {
    cbRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!episodeId) return;

    const supabase = createSupabaseBrowserClient();
    const channelTopic = `episode_activity:${episodeId}`;
    // Defensive cleanup against HMR / StrictMode dupes.
    for (const existing of supabase.getChannels()) {
      if (existing.topic === `realtime:${channelTopic}` || existing.topic === channelTopic) {
        void supabase.removeChannel(existing);
      }
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    const fire = () => {
      if (timer) return; // already scheduled — coalesce the burst
      timer = setTimeout(() => {
        timer = null;
        cbRef.current();
      }, DEBOUNCE_MS);
    };

    const channel = supabase
      .channel(channelTopic)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'activity_events' },
        (payload) => {
          const row = payload.new as { episode_id?: string } | undefined;
          if (row?.episode_id !== episodeId) return; // discriminate here (RLS-safe)
          fire();
        },
      )
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [episodeId]);
}
