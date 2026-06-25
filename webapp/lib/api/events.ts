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
  const triggerId = data?.id;
  if (!triggerId) return;

  // Fire-and-forget — Inngest send must never block or throw into the caller.
  void inngest
    .send({
      name: 'sandystudio/pa/notify-needed',
      data: {
        episodeId: input.episode_id ?? null,
        source: 'ambient',
        triggerId,
        eventType: input.event_type,
      },
    })
    .catch((sendErr) => {
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.error('[logEvent] pa/notify-needed send failed:', sendErr);
      }
    });
}
