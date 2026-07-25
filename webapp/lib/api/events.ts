// ──────────────────────────────────────────────────────────────────────────────
// lib/api/events.ts
// Single helper for inserting into `activity_events`. Centralises the JSON
// metadata cast so route handlers don't sprinkle `as never` everywhere.
// ──────────────────────────────────────────────────────────────────────────────

import type { ServerSupabaseClient } from './auth';
import { isActionableEventType, isSelfCausedNotify } from './event-actionable';
import { inngest } from '@/lib/inngest/client';

export type EventSeverity = 'info' | 'warning' | 'error';

export interface ActivityEventInput {
  event_type: string;
  severity?: EventSeverity;
  title: string;
  description?: string | null;
  actor?: string | null;
  episode_id?: string | null;
  /**
   * Series scope (0049). For episode events the DB BEFORE-INSERT trigger fills
   * it from episodes.series_id — pass explicitly only for series-scoped events
   * that have no episode (Bible, themes, series lifecycle).
   */
  series_id?: string | null;
  asset_id?: string | null;
  job_id?: string | null;
  metadata?: unknown;
}

/**
 * Best-effort fire-and-forget activity event insert. Errors are NOT thrown —
 * the caller's main work has already succeeded by the time we log; we never
 * want a failed audit log to corrupt a successful approval / mode change.
 * The error is logged via console.error in dev and silently swallowed in prod.
 *
 * Side effect (TD-20.B autonomy 2026-05-20): when the row is actionable
 * (mirrors the trigger whitelist in migration 0030), we also publish a
 * `pa/notify-needed` Inngest event so Polina can react without waiting on
 * Director input. Both the insert and the Inngest send are fire-and-forget;
 * neither blocks nor throws into the caller.
 */
export async function logEvent(
  supabase: ServerSupabaseClient,
  input: ActivityEventInput,
): Promise<void> {
  const payload = {
    event_type: input.event_type,
    severity: input.severity ?? 'info',
    title: input.title,
    description: input.description ?? null,
    actor: input.actor ?? null,
    episode_id: input.episode_id ?? null,
    series_id: input.series_id ?? null,
    asset_id: input.asset_id ?? null,
    job_id: input.job_id ?? null,
    metadata: (input.metadata ?? null) as never,
  };
  const { data, error } = await supabase
    .from('activity_events')
    .insert(payload)
    .select('id')
    .maybeSingle();
  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.error('[logEvent] failed:', error.message, payload);
    }
    return;
  }

  if (!isActionableEventType(input.event_type)) return;
  // Loop-breaker (2026-06-25): never wake Polina to react to her OWN decision /
  // dispatch (actor = AI principal). The audit row above is already written; we
  // skip only the `pa/notify-needed` fan-out. Pipeline advance is mechanical,
  // so the chain still progresses. Stops the watchdog↔auto-react cost spiral.
  if (isSelfCausedNotify(input.event_type, input.actor)) return;
  // Loop-breaker (2026-06-28, S2/F3): a PERSISTENT billing/quota failure returns
  // the same wall on every retry. Waking Polina to "react" to it just makes her
  // re-fire the agent into the same wall (cross-wake spend spiral). The emitter
  // tags such events with metadata.auto_react=false → escalate to the human
  // Director (the audit row IS written + visible in the feed), but DON'T spend a
  // model wake. The Director is the only one who can top up funds.
  if ((input.metadata as { auto_react?: unknown } | null | undefined)?.auto_react === false) {
    return;
  }
  const triggerId = data?.id;
  if (!triggerId) return;

  // Fire-and-forget — Inngest send must never block or throw into the caller.
  void inngest
    .send({
      name: 'sandystudio/pa/notify-needed',
      data: {
        episodeId: input.episode_id ?? null,
        // 0049: lets exec-pa-react resolve the series thread for episode-less
        // series-scoped events (Bible / themes) instead of skipping them.
        seriesId: input.series_id ?? null,
        source: 'ambient',
        triggerId,
        eventType: input.event_type,
        // D17 fail-dedup (2026-07-08): carried so exec-pa-react's `:fail` debounce
        // bucket can key on (actor, asset_id) — distinct failing shots each wake,
        // repeated failures of the SAME stuck asset collapse within the window.
        actor: input.actor ?? null,
        assetId: input.asset_id ?? null,
      },
    })
    .catch((sendErr) => {
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.error('[logEvent] pa/notify-needed send failed:', sendErr);
      }
    });
}
