// ──────────────────────────────────────────────────────────────────────────────
// lib/api/events.ts
// Single helper for inserting into `activity_events`. Centralises the JSON
// metadata cast so route handlers don't sprinkle `as never` everywhere.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types.gen';

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
 */
export async function logEvent(
  supabase: SupabaseClient<Database>,
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
  const { error } = await supabase.from('activity_events').insert(payload);
  if (error && process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.error('[logEvent] failed:', error.message, payload);
  }
}
