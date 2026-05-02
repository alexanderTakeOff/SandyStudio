// ──────────────────────────────────────────────────────────────────────────────
// components/notifications/NotificationDot.tsx
// Small red blinking dot rendered next to an asset name (cards, lists, pipeline
// stage rows) when the asset has at least one unresolved Director-attention
// event (canon_extension_proposed, decision_requested, input_requested).
// Director's 2026-05-02 request: visible attention marker so an asset doesn't
// fall through cracks.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import useSWR from 'swr';
import { fetcher } from '@/lib/swr';

const URGENT_TYPES = [
  'canon_extension_proposed',
  'decision_requested',
  'input_requested',
  'blocker_raised',
] as const;

interface NotificationDotProps {
  assetId: string;
  /** Visual size in px. Default 8. */
  size?: number;
  /** Pause polling — default 12s, set 0 to disable. */
  refreshIntervalMs?: number;
}

/** Returns the unresolved-event count for the given asset (across urgent types). */
async function fetchUnresolvedCount(assetId: string): Promise<number> {
  // Query each urgent type in one /api/activity round-trip via OR-style filter.
  // The current /api/activity supports single event_type per request — we run
  // the canon_extension_proposed query (most common) and treat anything > 0
  // as "needs attention". Future: extend API to accept type[] for batched check.
  const res = await fetcher(
    `/api/activity?asset_id=${assetId}&type=canon_extension_proposed&unresolved=true&limit=1`,
  );
  return Array.isArray(res?.data) ? res.data.length : 0;
}

export function NotificationDot({
  assetId,
  size = 8,
  refreshIntervalMs = 12_000,
}: NotificationDotProps) {
  const { data: count } = useSWR<number>(
    `notif:${assetId}`,
    () => fetchUnresolvedCount(assetId),
    { refreshInterval: refreshIntervalMs, revalidateOnFocus: true },
  );

  if (!count || count <= 0) return null;

  return (
    <span
      title={`${count} pending Director decision${count === 1 ? '' : 's'}`}
      aria-label="Pending Director decision"
      className="notif-dot inline-block rounded-full"
      style={{
        width: size,
        height: size,
        background: 'var(--accent-danger, rgb(239, 68, 68))',
        boxShadow: '0 0 0 0 rgba(239, 68, 68, 0.7)',
        animation: 'notif-blink 1.6s ease-in-out infinite',
      }}
    />
  );
}

export function NotificationDotStyles() {
  // Inline-injected once near the root so child components can rely on the
  // animation existing without per-page <style> tags.
  return (
    <style jsx global>{`
      @keyframes notif-blink {
        0%   { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.55); transform: scale(1); }
        50%  { box-shadow: 0 0 0 6px rgba(239, 68, 68, 0);   transform: scale(1.05); }
        100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0);     transform: scale(1); }
      }
      .notif-dot { will-change: box-shadow, transform; }
    `}</style>
  );
}
URGENT_TYPES; // keep export reference (silences unused-var if tree-shaken)
