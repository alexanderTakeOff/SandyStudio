// ──────────────────────────────────────────────────────────────────────────────
// lib/api/inbox-clear.ts
// Shared, dependency-free rules for "Clear inbox" so the server sweep
// (app/api/director/inbox/clear/route.ts) and the button's on-screen count
// (app/(studio)/inbox/page.tsx) can never disagree about what is clearable.
//
// Background (2026-07-25): the Director Inbox has two sources (see
// app/api/director/inbox/route.ts). Asset rows self-clear — they show only
// while `status='REVIEW'`, so any decision drops them. Event rows show while
// `resolved_at IS NULL`, and the only pre-existing writer of `resolved_at` was
// the canon-extension sweep — so plain notifications accumulated forever with
// no TTL and crowded fresh work out of the 50-row page.
// ──────────────────────────────────────────────────────────────────────────────

/** Inbox filter pills, mirrored from the GET route's query schema. */
export type InboxClearFilter = 'all' | 'visual' | 'non_visual' | 'blockers';

/**
 * Event types the Inbox surfaces that carry no payload of their own — pure
 * notifications, safe to bulk-dismiss.
 */
export const CLEARABLE_EVENT_TYPES = [
  'decision_requested',
  'input_requested',
  'budget_threshold_reached',
  'blocker_raised',
  'rule_proposal',
] as const;

/** The subset that lands in the Inbox's `blocked` group. */
export const BLOCKER_EVENT_TYPES = [
  'budget_threshold_reached',
  'blocker_raised',
] as const;

/**
 * Event types the Inbox surfaces that are NOT clearable: the proposals live
 * inside `metadata.proposals`, and `resolved_at` is what marks them
 * dispositioned — dismissing the event would strand a pending canon decision.
 */
export const NON_CLEARABLE_EVENT_TYPES = ['canon_extension_proposed'] as const;

/**
 * Event types to sweep for a given filter pill. Returns an empty list for
 * `visual`: every event row renders with `is_visual: false` (only IMG/VID
 * *assets* are visual), so that pill has nothing clearable behind it and must
 * not silently drain the whole feed.
 */
export function eventTypesForFilter(filter: InboxClearFilter): readonly string[] {
  if (filter === 'visual') return [];
  if (filter === 'blockers') return BLOCKER_EVENT_TYPES;
  return CLEARABLE_EVENT_TYPES;
}

/**
 * Whether a rendered Inbox row would be removed by "Clear inbox". Assets
 * (`asset:<uuid>` ids) are the Director's approval gates — clearing one would
 * mean approving or rejecting it, which flips status and fires the agent DAG.
 */
export function isClearableInboxItem(item: {
  id: string;
  metadata?: { event_type?: string } | null;
}): boolean {
  if (!item.id.startsWith('event:')) return false;
  const type = item.metadata?.event_type;
  if (!type) return true; // event row with unknown type — still a notification
  return (CLEARABLE_EVENT_TYPES as readonly string[]).includes(type);
}
