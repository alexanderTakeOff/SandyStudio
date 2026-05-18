// ──────────────────────────────────────────────────────────────────────────────
// lib/concierge/ambient-events.ts
//
// Map a `public.activity_events` row → an ambient pipeline message that the
// Prod Assistant (Polina) consumes as conversation context.
//
// Why this layer exists (Director directive 2026-05-13):
//   Until now PA was pull-only — she learned about pipeline events only by
//   running `getRecentActivityEvents` on her own initiative. With Realtime
//   push (migration 0026 + frontend hook + this formatter), every meaningful
//   pipeline event is injected into PA's thread within ~1 second so her
//   next reply is event-aware without explicit prompting from Director.
//
// Filter rules:
//   - Skip auto-sync chatter and low-signal events (heartbeat, internal
//     bookkeeping). PA cares about agent lifecycle, approvals, asset
//     transitions, blockers — not about the noise floor.
//   - Skip Director's own `approval_*` events — Director just clicked the
//     button, telling her about her own click is redundant noise.
//   - Skip `agent_started` for agents whose runtime is < 30s — they will
//     finish before PA's next turn anyway, the `agent_completed` event is
//     the actionable one.
// ──────────────────────────────────────────────────────────────────────────────

export interface ActivityEventRow {
  id: string;
  event_type: string;
  severity: string | null;
  title: string;
  description: string | null;
  actor: string | null;
  episode_id: string | null;
  asset_id: string | null;
  job_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

/** Event types PA should react to. Anything outside this set is filtered out. */
const ACTIONABLE_EVENT_TYPES: ReadonlySet<string> = new Set([
  'agent_started',
  'agent_completed',
  'agent_failed',
  'approval_granted',
  'approval_revision',
  'approval_rejected',
  'manual_trigger',
  'budget_threshold_reached',
  'blocker_raised',
  'decision_requested',
  'input_requested',
  'canon_extension_proposed',
]);

/** Director-typed approvals don't need to be echoed back to PA. */
const DIRECTOR_OWN_EVENTS: ReadonlySet<string> = new Set([
  'approval_granted',
  'approval_revision',
  'approval_rejected',
]);

export interface AmbientEventDecision {
  /** Should this row be injected into the PA thread at all? */
  inject: boolean;
  /** Why it was filtered (for telemetry / debug). */
  reason?: string;
  /** Human-readable single-line summary for the system turn content. */
  content?: string;
  /** Severity label PA can read in its prompt. */
  severity?: 'info' | 'warning' | 'error';
}

/**
 * Decide whether this activity_event row should become an ambient PA turn,
 * and if so, format the content. Pure function — easy to unit test.
 */
export function decideAmbientEvent(
  row: ActivityEventRow,
  opts: { directorUserId?: string | null } = {},
): AmbientEventDecision {
  if (!ACTIONABLE_EVENT_TYPES.has(row.event_type)) {
    return { inject: false, reason: `event_type ${row.event_type} not actionable` };
  }

  // Director clicked Approve/Revise/Reject — PA already saw the click as the
  // Director's preceding chat turn, no need to echo.
  if (
    DIRECTOR_OWN_EVENTS.has(row.event_type) &&
    opts.directorUserId &&
    row.actor === opts.directorUserId
  ) {
    return { inject: false, reason: 'Director-own approval — already seen as chat turn' };
  }

  const severity =
    row.severity === 'error'
      ? 'error'
      : row.severity === 'warning'
        ? 'warning'
        : 'info';

  // Compose a one-line summary that's useful in a prompt without being noisy.
  // The full row metadata is also persisted so PA can drill in via tools.
  const actor = row.actor ?? 'system';
  const desc = row.description?.trim() ?? '';
  const summary = desc.length > 0 && desc.length <= 220
    ? `${row.title} — ${desc}`
    : row.title;
  const content = `[ambient pipeline event · ${row.event_type}] ${summary} (actor=${actor})`;

  return {
    inject: true,
    content,
    severity,
  };
}

/**
 * Subset of metadata the PA tools can inspect via `metadata.kind` etc. Kept
 * narrow so PA doesn't drown in implementation detail (we forward only the
 * fields she actually needs to act).
 */
export function extractAmbientMetadata(row: ActivityEventRow): Record<string, unknown> {
  const m = row.metadata ?? {};
  return {
    kind: 'pipeline_event',
    activity_event_id: row.id,
    event_type: row.event_type,
    severity: row.severity ?? 'info',
    actor: row.actor ?? null,
    episode_id: row.episode_id,
    asset_id: row.asset_id,
    job_id: row.job_id,
    created_at: row.created_at,
    // Pass through file_type and agent so PA's filter heuristics work.
    file_type: typeof m.file_type === 'string' ? m.file_type : null,
    agent: typeof m.agent === 'string' ? m.agent : null,
  };
}
