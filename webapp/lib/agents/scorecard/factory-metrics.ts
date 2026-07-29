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

/** True when an event falls inside a half-open production window (start, end].
 *  `start` null → the window never opened, nothing is inside it. `end` null → the
 *  window is still open, everything after `start` is inside. The lower boundary
 *  itself is EXCLUDED (it is the last act of the previous phase), the upper one
 *  INCLUDED (the stitch run that closes production is part of production). */
export function inWindow(
  createdAt: string,
  start: string | null,
  end: string | null,
): boolean {
  if (!start) return false;
  return createdAt > start && (end === null || createdAt <= end);
}

/** True when an event happened strictly AFTER the design→production boundary.
 *  Same as an open-ended window: everything from production-start onwards, with
 *  no upper bound (so it also counts distribution work that follows the stitch). */
export function isPostCast(
  createdAt: string,
  castLockAt: string | null,
): boolean {
  return inWindow(createdAt, castLockAt, null);
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
 *  was never approved (not locked yet). Kept for reference; the pre/post split
 *  now anchors on production-start (below), not casting — casting locks EARLY in
 *  the SandyStudio pipeline (before script/storyboard), so it is not the
 *  design→production boundary. */
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

/** Timestamp of an anchor agent's run, trying each anchor in order and taking the
 *  first anchor that ever ran. `pick` chooses which of its runs answers. */
function jobBoundary(
  jobs: Array<{ agent_id: string; created_at: string }>,
  anchors: string[],
  pick: 'earliest' | 'latest',
): string | null {
  for (const anchor of anchors) {
    let best: string | null = null;
    for (const j of jobs) {
      if (j.agent_id !== anchor) continue;
      if (best === null) { best = j.created_at; continue; }
      if (pick === 'earliest' ? j.created_at < best : j.created_at > best) best = j.created_at;
    }
    if (best !== null) return best;
  }
  return null;
}

/** Production-start boundary (Director 2026-07-16: "pre-cast = [0 → start ref
 *  artist]"). = the earliest job of the reference ARTIST (EXEC-EREF, the render
 *  step). Everything before is DESIGN (brief / script / storyboard / critics /
 *  casting / ref-planning); everything at-or-after is PRODUCTION (refs / video /
 *  stitch). Falls back to the animator (EXEC-VGEN) if refs never ran, then null
 *  (production never started → all work is design). */
export function productionStartFromJobs(
  jobs: Array<{ agent_id: string; created_at: string }>,
  anchors: string[] = ['EXEC-EREF', 'EXEC-VGEN'],
): string | null {
  return jobBoundary(jobs, anchors, 'earliest');
}

/** Production-END boundary = the FIRST auto-stitch run (Director 2026-07-29:
 *  "до первого стича — это про СКОРОСТЬ, остальное украшательство"). The meter
 *  answers how fast the factory reaches a whole picture; the re-stitches that
 *  follow a video revision are polish, and they stay counted by the open-ended
 *  whole-episode numbers. Null while the episode has not stitched yet → never
 *  reached a cut, window still open. */
export function productionEndFromJobs(
  jobs: Array<{ agent_id: string; created_at: string }>,
  anchors: string[] = ['EXEC-STITCH'],
): string | null {
  return jobBoundary(jobs, anchors, 'earliest');
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
