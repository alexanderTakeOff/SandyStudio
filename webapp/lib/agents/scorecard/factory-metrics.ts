// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/scorecard/factory-metrics.ts
// Pure helpers for the Factory Overview read-time aggregation (/api/factory).
//
// Two things the raw scorecard gets wrong / doesn't split, corrected here:
//   1. Actor 3-way split. A human Director AND Polina (Prod Assistant) both
//      dispatch through requireDirector() as the SAME Director UUID, so
//      actorKind() reads 'director' for both and the scorecard's "Director
//      touches" silently folds in Polina. Polina's mutating tools prefix the
//      event `description` with "[Prod Assistant]" (lib/concierge/tools/dispatch.ts) —
//      the one marker present on BOTH manual_trigger and every approval_* event.
//   2. Pre/post-cast bucketing. The casting-lock boundary is the moment the
//      SPC-episode_cast asset is APPROVED; work before it is pre-cast (brief /
//      script / casting), after it is a creative "leak" that the factory wants at 0.
//
// Pure — no I/O. The route feeds it rows it already fetched.
// ──────────────────────────────────────────────────────────────────────────────

import { actorKind } from '@/lib/api/agent-names';

/** The activity-event types that count as an intelligent "touch". */
export const TOUCH_EVENT_TYPES = [
  'manual_trigger',
  'approval_granted',
  'approval_revision',
  'approval_rejected',
] as const;

export type TouchActor = 'director' | 'polina' | 'ai_ep';

const PROD_ASSISTANT_MARKER = '[Prod Assistant]';

/**
 * Classify who really made a touch:
 *   - ai_ep    → actor is the autonomous AI-EP (exec-dir-ai).
 *   - polina   → Director-UUID actor BUT the description carries the Prod Assistant marker.
 *   - director → Director-UUID actor without the marker (a genuine human command).
 * Returns null for pipeline/system actors (not an intelligent touch).
 */
export function touchClass(
  actor: string | null | undefined,
  description: string | null | undefined,
): TouchActor | null {
  const kind = actorKind(actor);
  if (kind === 'ai-director') return 'ai_ep';
  if (kind !== 'director') return null; // agent / system — code-fired, not a touch
  return (description ?? '').startsWith(PROD_ASSISTANT_MARKER) ? 'polina' : 'director';
}

/** True when an event happened strictly AFTER casting was locked (post-cast).
 *  When there is no lock yet (castLockAt null) nothing is post-cast — casting is
 *  not done, so all work is still pre-cast. Boundary itself (== lock, the casting
 *  approval) counts as pre-cast: it is the last pre-cast act. */
export function isPostCast(
  createdAt: string,
  castLockAt: string | null,
): boolean {
  if (!castLockAt) return false;
  return createdAt > castLockAt;
}

export interface TouchBuckets {
  director: number;
  polina: number;
  aiEp: number;
  total: number;
}

const emptyBuckets = (): TouchBuckets => ({ director: 0, polina: 0, aiEp: 0, total: 0 });

/** Add one classified touch into a bucket set. */
function add(b: TouchBuckets, who: TouchActor): void {
  if (who === 'director') b.director += 1;
  else if (who === 'polina') b.polina += 1;
  else b.aiEp += 1;
  b.total += 1;
}

export interface TouchEvent {
  event_type: string;
  actor: string | null;
  description: string | null;
  created_at: string;
}

export interface TouchSplit {
  all: TouchBuckets;
  pre: TouchBuckets; // pre-cast
  post: TouchBuckets; // post-cast (the creative leak)
}

/**
 * Aggregate an episode's touch events into all / pre-cast / post-cast buckets,
 * each split 3 ways (Director / Polina / AI-EP). System/agent actors are ignored.
 */
export function splitTouches(
  events: TouchEvent[],
  castLockAt: string | null,
): TouchSplit {
  const all = emptyBuckets();
  const pre = emptyBuckets();
  const post = emptyBuckets();
  for (const e of events) {
    const who = touchClass(e.actor, e.description);
    if (!who) continue;
    add(all, who);
    if (isPostCast(e.created_at, castLockAt)) add(post, who);
    else add(pre, who);
  }
  return { all, pre, post };
}

/** Casting-lock timestamp = earliest approval_granted of the SPC-episode_cast
 *  asset. Pass the episode's touch/approval events; returns null if casting
 *  was never approved (not locked yet). */
export function castLockFromEvents(
  events: Array<{ event_type: string; created_at: string; metadata: unknown }>,
): string | null {
  let earliest: string | null = null;
  for (const e of events) {
    if (e.event_type !== 'approval_granted') continue;
    const ft = (e.metadata as { file_type?: unknown } | null)?.file_type;
    if (ft !== 'SPC-episode_cast') continue;
    if (earliest === null || e.created_at < earliest) earliest = e.created_at;
  }
  return earliest;
}

export interface CostFold {
  key: string;
  costUsd: number;
  calls: number;
}

/** Fold budget_log rows by a chosen key (agent_id or operation), sorted desc. */
export function foldCost(
  rows: Array<{ cost_usd: number | null }>,
  keyOf: (r: never) => string,
): CostFold[] {
  const agg = new Map<string, CostFold>();
  for (const r of rows) {
    const key = keyOf(r as never) || 'unknown';
    const cur = agg.get(key) ?? { key, costUsd: 0, calls: 0 };
    cur.costUsd += Number(r.cost_usd ?? 0);
    cur.calls += 1;
    agg.set(key, cur);
  }
  return [...agg.values()].sort((a, b) => b.costUsd - a.costUsd);
}
