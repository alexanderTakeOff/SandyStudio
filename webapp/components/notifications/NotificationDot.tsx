// ──────────────────────────────────────────────────────────────────────────────
// components/notifications/NotificationDot.tsx
// Small red blinking dot rendered next to an asset name (cards, lists, pipeline
// stage rows) when the asset has at least one unresolved Director-attention
// event (canon_extension_proposed, decision_requested, input_requested).
// Director's 2026-05-02 request: visible attention marker so an asset doesn't
// fall through cracks.
//
// 2026-05-22 (Step 4 of Supabase recovery sprint): swapped from 12s SWR
// polling to a per-asset Supabase Realtime subscription. Each visible asset
// previously fired 5 polls/min against `/api/activity` → Supabase reads;
// the Episode sidebar with 10-20 visible assets ran 50-100 polls/min
// 24/7. Realtime gives one socket per asset id with idle = zero polls.
// See ~/.claude/plans/synchronous-petting-waffle.md for the audit.
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useAssetNotificationRealtime } from '@/hooks/useAssetNotificationRealtime';

interface NotificationDotProps {
  assetId: string;
  /** Visual size in px. Default 8. */
  size?: number;
}

export function NotificationDot({ assetId, size = 8 }: NotificationDotProps) {
  const { count } = useAssetNotificationRealtime(assetId);

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

/**
 * Global keyframe injection — call once near the StudioShell root so the
 * blink animation is available everywhere a NotificationDot renders.
 */
export function NotificationDotStyles() {
  return (
    <style
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{
        __html: `
@keyframes notif-blink {
  0%   { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.55); transform: scale(1); }
  50%  { box-shadow: 0 0 0 6px rgba(239, 68, 68, 0);   transform: scale(1.05); }
  100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0);     transform: scale(1); }
}
.notif-dot { will-change: box-shadow, transform; }
`,
      }}
    />
  );
}
