// ──────────────────────────────────────────────────────────────────────────────
// hooks/useAssetNotificationRealtime.ts
//
// Step 4 of the 2026-05-22 Supabase recovery sprint. Replaces the
// useSWR `refreshInterval: 12_000` polling in NotificationDot with a
// per-asset Supabase Realtime subscription on `activity_events` —
// event-driven, no fixed-interval polling against a paid external
// service.
//
// Cost profile change (per Explore audit 2026-05-22):
//
//   BEFORE (useSWR polling):
//     - 5 polls/min per visible asset (refreshInterval=12s)
//     - Director's Episode view has 10-20 assets in sidebar
//     - = 50-100 polls/min → /api/activity → Supabase reads
//     - Continuous baseline egress even when nothing is happening
//
//   AFTER (Realtime subscription):
//     - 1 socket connection per asset id (bounded by visible-asset count)
//     - 1 initial REST fetch on mount to seed the count
//     - Server pushes INSERT events as they happen — zero polls
//     - Idle cost: zero Supabase reads beyond the open socket
//
// Pattern mirrors `useActivityRealtime.ts` (the concierge thread realtime)
// — same singleton client, same channel cleanup on HMR/StrictMode re-runs.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  URGENT_EVENT_TYPES,
  classifyNotificationEvent,
} from './useAssetNotificationRealtime-core';

// Re-export so existing imports of the urgent set / classifier from this
// module path keep working.
export { URGENT_EVENT_TYPES, classifyNotificationEvent };

interface ActivityRow {
  id?: string;
  asset_id?: string | null;
  event_type?: string;
  resolved_at?: string | null;
}

interface UseAssetNotificationRealtimeResult {
  /** Best-effort unresolved-event count. Starts at 0, may briefly lag a beat behind reality. */
  count: number;
  /** True while the initial REST seed query is in flight. */
  loading: boolean;
}

/**
 * Subscribe to `activity_events` for one asset id. Seeds the count via one
 * REST fetch on mount, then increments on INSERT events of URGENT_EVENT_TYPES
 * pushed by Postgres → Realtime. Decrements when an event's resolved_at
 * flips non-null (UPDATE event). Empty assetId short-circuits.
 */
export function useAssetNotificationRealtime(
  assetId: string,
): UseAssetNotificationRealtimeResult {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!assetId) {
      setLoading(false);
      return;
    }

    let aborted = false;

    // ── 1. Initial seed via existing REST endpoint ──────────────────────────
    // Single fetch on mount — same shape NotificationDot used before, but
    // called ONCE instead of every 12s. No further polling.
    fetch(
      `/api/activity?asset_id=${encodeURIComponent(assetId)}&type=canon_extension_proposed&unresolved=true&limit=1`,
    )
      .then(async (res) => {
        if (!res.ok) return;
        const body = (await res.json()) as { data?: unknown[] } | null;
        const initial = Array.isArray(body?.data) ? body!.data!.length : 0;
        if (!aborted) {
          setCount(initial);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!aborted) setLoading(false);
      });

    // ── 2. Realtime subscription on activity_events for this asset ──────────
    const supabase = createSupabaseBrowserClient();
    const channelTopic = `activity_events:asset:${assetId}`;
    // Defensive: HMR / StrictMode can re-run with the same assetId and leak
    // channels. Drop any pre-existing channel for this topic before creating
    // a new one.
    for (const existing of supabase.getChannels()) {
      if (
        existing.topic === `realtime:${channelTopic}` ||
        existing.topic === channelTopic
      ) {
        void supabase.removeChannel(existing);
      }
    }

    const channel = supabase
      .channel(channelTopic)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'activity_events',
          filter: `asset_id=eq.${assetId}`,
        },
        (payload) => {
          const row = payload.new as ActivityRow | undefined;
          if (!row || !row.event_type) return;
          if (!URGENT_EVENT_TYPES.has(row.event_type)) return;
          if (row.resolved_at) return; // already resolved on insert
          if (!aborted) setCount((prev) => prev + 1);
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'activity_events',
          filter: `asset_id=eq.${assetId}`,
        },
        (payload) => {
          const row = payload.new as ActivityRow | undefined;
          if (!row || !row.event_type) return;
          if (!URGENT_EVENT_TYPES.has(row.event_type)) return;
          // If something flipped from unresolved → resolved, decrement.
          // We don't track per-event ids client-side; this is best-effort
          // and may briefly desync — the next page navigation reseeds.
          if (row.resolved_at && !aborted) {
            setCount((prev) => (prev > 0 ? prev - 1 : 0));
          }
        },
      )
      .subscribe();

    return () => {
      aborted = true;
      void supabase.removeChannel(channel);
    };
  }, [assetId]);

  return { count, loading };
}
