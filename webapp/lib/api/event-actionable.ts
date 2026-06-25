// ──────────────────────────────────────────────────────────────────────────────
// lib/api/event-actionable.ts
// The canonical list of activity_events.event_type values that the Postgres
// trigger tg_inject_activity_event_into_concierge (migration 0030) mirrors
// into concierge_turns as pipeline events. Same list reused server-side to
// decide whether logEvent should ALSO fire a `pa/notify-needed` Inngest
// event for autonomous Polina reaction.
//
// Source of truth lives in migration 0030 — when adding a new actionable
// event_type, update BOTH the migration and this list, with the same commit.
// ──────────────────────────────────────────────────────────────────────────────

export const ACTIONABLE_EVENT_TYPES: ReadonlySet<string> = new Set([
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
  'episode_archived',
  // TD-20.B 2026-05-20 — symmetric safety net with migration 0033's
  // Postgres trigger whitelist. Library generation routes now write
  // 'agent_completed' (not 'asset_created') via logEvent, but keep
  // this entry so a future drift doesn't silently de-route the events.
  'asset_created',
]);

export function isActionableEventType(eventType: string): boolean {
  return ACTIONABLE_EVENT_TYPES.has(eventType);
}

// ── Loop-breaker: suppress notify for the concierge's OWN decisions ───────────
// 2026-06-25 — root fix for the watchdog↔auto-react runaway that drained $100 of
// Anthropic credits in a day. When Polina's auto-react acts via the EXEC-DIR-AI
// service token (auth.ts: user.id = 'exec-dir-ai'), her approvals/dispatches log
// activity_events with actor='exec-dir-ai'. Firing `pa/notify-needed` for those
// re-wakes her to react to her OWN action — a pure echo that feeds the loop. The
// pipeline chain advances MECHANICALLY (computeNextEvents / factory auto-chain),
// NOT via this notify, so suppressing the self-echo is safe. Human-Director
// actions (UUID actor → 'director') and agent lifecycle events (agent_* → 'agent')
// are NEVER suppressed — only the AI principal's own decision/dispatch events.
import { actorKind } from './agent-names';

const SELF_ACTION_EVENT_TYPES: ReadonlySet<string> = new Set([
  'approval_granted',
  'approval_revision',
  'approval_rejected',
  'manual_trigger',
]);

export function isSelfCausedNotify(
  eventType: string,
  actor: string | null | undefined,
): boolean {
  return actorKind(actor) === 'ai-director' && SELF_ACTION_EVENT_TYPES.has(eventType);
}
