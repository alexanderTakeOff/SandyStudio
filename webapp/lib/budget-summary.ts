// ──────────────────────────────────────────────────────────────────────────────
// lib/budget-summary.ts
// Studio-wide money aggregation for the Budget tab (/api/budget → /budget).
//
// PURE — no I/O. The route fetches rows (paged, see lib/api/paged-select.ts) and
// hands them here. That keeps the money math unit-testable without a DB, which is
// how the 2026-07-25 restore was verified.
//
// ── Accounting model (two ledgers that legitimately disagree) ────────────────
// 1. `budget_log` — the ITEMIZED ledger. One row per paid call: agent, provider,
//    model, operation, cost. Includes Polina (EXEC-CONC), Director rerolls, Bible
//    spend. Rows with `episode_id IS NULL` are studio/series-level spend (Bible
//    images, Bible enrich, global concierge) — real money that belongs to no
//    episode.
// 2. `episodes.budget_spent` — the RESERVATION ledger. Maintained by the atomic
//    ceiling RPC (migration 0037) so concurrent shots cannot overspend. It
//    deliberately EXCLUDES concierge spend (Polina must not eat the production
//    ceiling), and it carries estimate/actual reconciliation noise.
//
// Therefore: the authoritative per-episode total is the ITEMIZED sum whenever the
// episode has budget_log rows; `budget_spent` is shown apart as `reserved`, and
// the gap is reported as `drift` instead of being silently picked. Only when an
// episode has NO itemized rows at all do we fall back to `reserved` and flag the
// episode `reservationOnly` — that is the honest "we know a number but cannot
// break it down" state, not a $0 claim. Same rule as /api/factory, so the two
// pages can never quote different totals for the same episode.
//
// ── What must never be silently dropped (Director 2026-07-25) ───────────────
//   - Polina's chat (EXEC-CONC rows) → folded out as its own `concierge` bucket:
//     counted in the total, visible as a distinct line, never lumped into a
//     provider bucket.
//   - Episode-less spend → the `unattributed` block, reported at studio level.
//   - $0 rows (mock music, free-tier providers) → counted in `gaps.zeroCost`, so
//     a mocked provider reads as a KNOWN GAP rather than "this was free".
//   - Overruns → `remaining` is NOT clamped at 0. A negative number is the point.
// ──────────────────────────────────────────────────────────────────────────────

import { isModelPriced } from './agents/providers/anthropic-text';
import { foldCost, type CostFold } from './agents/scorecard/factory-metrics';

/** Agent id whose rows are Polina's orchestration spend, not production spend. */
export const CONCIERGE_BUCKET = 'concierge';
const CONCIERGE_AGENT_ID = 'EXEC-CONC';

/** Episode statuses that count as shipped for the burn-rate trailing average. */
export const PUBLISHED_STATES = new Set([
  'PUBLISHED',
  'ANALYTICS_COLLECTING',
  'COMPLETE',
]);

const ARCHIVED_STATUS = 'ARCHIVED';

/** How many shipped episodes the trailing burn-rate average looks back over. */
export const BURN_RATE_WINDOW = 5;

export interface BudgetEpisodeInput {
  id: string;
  episode_code: string;
  status: string;
  budget_ceiling: number | null;
  budget_spent: number | null;
  created_at?: string | null;
}

export interface BudgetLogInput {
  episode_id: string | null;
  agent_id: string | null;
  api_provider: string | null;
  model_or_tier?: string | null;
  operation: string | null;
  cost_usd: number | null;
  /** Present on LLM rows only — distinguishes token-billed calls from media calls. */
  tokens_used?: number | null;
  created_at?: string | null;
}

export interface BudgetEpisodeSummary {
  episode_id: string;
  episode_code: string;
  status: string;
  archived: boolean;
  created_at: string | null;
  /** Authoritative total: itemized when available, else the reservation fallback. */
  total: number;
  ceiling: number | null;
  /** episodes.budget_spent — reservation ledger (excludes Polina by design). */
  reserved: number;
  /** Σ budget_log for this episode. */
  itemized: number;
  /** No itemized rows → `total` came from `reserved` and cannot be broken down. */
  reservationOnly: boolean;
  /** itemized − reserved. Expected non-zero (Polina); a large gap wants a look. */
  drift: number;
  /** Number of itemized calls. */
  calls: number;
  /** Polina's slice of `itemized`. */
  conciergeUsd: number;
  /** Itemized calls that cost exactly $0 — mock/free providers. */
  zeroCostCalls: number;
  /** By provider, with Polina folded out into the `concierge` bucket. */
  breakdown: Record<string, number>;
  byProvider: CostFold[];
  byAgent: CostFold[];
  byOperation: CostFold[];
}

export interface BudgetUnattributed {
  /** Σ cost of rows with episode_id IS NULL (Bible / series / global spend). */
  total: number;
  calls: number;
  byProvider: CostFold[];
  byAgent: CostFold[];
  byOperation: CostFold[];
}

export interface BudgetGaps {
  /** Itemized calls recorded at exactly $0 — mock or free-tier providers. */
  zeroCostCalls: number;
  /** $0 calls folded by provider, so a mocked provider is named. */
  zeroCostByProvider: CostFold[];
  /** Episodes with a reserved number but no itemized rows (cannot break down). */
  reservationOnlyEpisodes: string[];
  /** Σ |drift| across episodes — how far the two ledgers disagree overall. */
  totalDriftAbs: number;
  /**
   * Token-billed models whose price is NOT in the rate table, so their recorded
   * cost is the Sonnet fallback rather than a real figure. Folded by model with
   * the dollars currently attributed to them, so the Director can see how much of
   * the total rests on a guess.
   */
  unpricedModels: CostFold[];
}

export interface BudgetSummaryPayload {
  /** Σ ceilings over ACTIVE (non-archived) episodes. */
  totalAllocated: number;
  /** Σ ceilings including archived — for reference. */
  allocatedIncludingArchived: number;
  /** Every dollar we know about: all itemized rows + reservation fallbacks. */
  totalSpent: number;
  /** Spend attributed to episodes (excludes the unattributed block). */
  spentOnEpisodes: number;
  /** Spend on ACTIVE episodes only — the number `remaining` is measured against. */
  spentOnActiveEpisodes: number;
  /** totalAllocated − spentOnActiveEpisodes. NOT clamped: negative = overrun. */
  remaining: number;
  /** Trailing mean total over the last shipped episodes (itemized-consistent). */
  burnRate: number;
  /** Episodes of runway left at the current burn. null when burn is unknown. */
  projectedRunway: number | null;
  /** Studio-wide Polina spend. */
  conciergeTotal: number;
  /** Studio-wide reservation ledger sum, for the drift comparison. */
  reservedTotal: number;
  /** Studio-wide itemized ledger sum (episode-bound + episode-less). */
  itemizedTotal: number;
  unattributed: BudgetUnattributed;
  gaps: BudgetGaps;
  byEpisode: BudgetEpisodeSummary[];
  /** Row counts so the page can prove nothing was truncated. */
  counts: { episodes: number; logRows: number };
}

const round = (n: number, d = 4): number => +n.toFixed(d);
const sumCost = (rows: BudgetLogInput[]): number =>
  rows.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);

/**
 * Provider bucket for a row. Polina's rows are folded out under `concierge`
 * (Director 2026-06-27: her orchestration cost must be VISIBLE as its own line
 * and counted in the total, without consuming the production ceiling) instead of
 * disappearing into whichever LLM vendor happened to serve her.
 */
function providerBucket(row: BudgetLogInput): string {
  if (row.agent_id === CONCIERGE_AGENT_ID) return CONCIERGE_BUCKET;
  return row.api_provider ?? 'unknown';
}

/**
 * Chronological order for the burn-rate window. `created_at` when present,
 * `episode_code` as the tiebreaker — the old route used raw DB order, which made
 * "the last 5 published episodes" an arbitrary set that changed between requests.
 */
function chronologically(
  a: BudgetEpisodeSummary,
  b: BudgetEpisodeSummary,
): number {
  if (a.created_at && b.created_at && a.created_at !== b.created_at) {
    return a.created_at < b.created_at ? -1 : 1;
  }
  return a.episode_code.localeCompare(b.episode_code);
}

/**
 * Fold the raw ledgers into the studio money picture.
 *
 * @param episodes ALL episode rows (paged — never a truncated first page)
 * @param logs     ALL budget_log rows (paged — never a truncated first page)
 */
export function aggregateBudget(
  episodes: BudgetEpisodeInput[],
  logs: BudgetLogInput[],
): BudgetSummaryPayload {
  // Bucket log rows by episode in one pass; NULL episode_id → unattributed.
  const logsByEpisode = new Map<string, BudgetLogInput[]>();
  const unattributedRows: BudgetLogInput[] = [];
  for (const row of logs) {
    if (!row.episode_id) {
      unattributedRows.push(row);
      continue;
    }
    const bucket = logsByEpisode.get(row.episode_id);
    if (bucket) bucket.push(row);
    else logsByEpisode.set(row.episode_id, [row]);
  }

  const byEpisode: BudgetEpisodeSummary[] = episodes.map((ep) => {
    const rows = logsByEpisode.get(ep.id) ?? [];
    const itemized = sumCost(rows);
    const reserved = Number(ep.budget_spent ?? 0);
    const reservationOnly = rows.length === 0;
    const total = reservationOnly ? reserved : itemized;

    const breakdown: Record<string, number> = {};
    for (const r of rows) {
      const bucket = providerBucket(r);
      breakdown[bucket] = round((breakdown[bucket] ?? 0) + Number(r.cost_usd ?? 0));
    }

    return {
      episode_id: ep.id,
      episode_code: ep.episode_code,
      status: ep.status,
      archived: ep.status === ARCHIVED_STATUS,
      created_at: ep.created_at ?? null,
      total: round(total),
      ceiling: ep.budget_ceiling,
      reserved: round(reserved),
      itemized: round(itemized),
      reservationOnly,
      drift: round(itemized - reserved),
      calls: rows.length,
      conciergeUsd: round(
        sumCost(rows.filter((r) => r.agent_id === CONCIERGE_AGENT_ID)),
      ),
      zeroCostCalls: rows.filter((r) => Number(r.cost_usd ?? 0) === 0).length,
      breakdown,
      byProvider: foldCost(rows, (r: BudgetLogInput) => providerBucket(r)),
      byAgent: foldCost(rows, (r: BudgetLogInput) => r.agent_id ?? 'unknown'),
      byOperation: foldCost(rows, (r: BudgetLogInput) => r.operation ?? 'unknown'),
    };
  });

  byEpisode.sort(chronologically);

  const active = byEpisode.filter((e) => !e.archived);

  const totalAllocated = active.reduce((s, e) => s + (e.ceiling ?? 0), 0);
  const allocatedIncludingArchived = byEpisode.reduce(
    (s, e) => s + (e.ceiling ?? 0),
    0,
  );

  // Every dollar we know about. Episodes with itemized rows contribute their
  // itemized sum; episodes with none contribute their reservation (so their money
  // is not lost); episode-less rows contribute via `unattributed`.
  const spentOnEpisodes = byEpisode.reduce((s, e) => s + e.total, 0);
  const spentOnActiveEpisodes = active.reduce((s, e) => s + e.total, 0);
  const unattributedTotal = sumCost(unattributedRows);
  const totalSpent = spentOnEpisodes + unattributedTotal;

  // Burn rate over the trailing shipped episodes, in real chronological order and
  // on the SAME (itemized-first) totals the rest of the page quotes. The old route
  // averaged `budget_spent` — the reservation ledger — so the headline burn silently
  // excluded Polina while the headline spend included her.
  const shipped = byEpisode.filter((e) => PUBLISHED_STATES.has(e.status));
  const window = shipped.slice(-BURN_RATE_WINDOW);
  const burnRate =
    window.length > 0
      ? window.reduce((s, e) => s + e.total, 0) / window.length
      : 0;
  const projectedRunway =
    burnRate > 0 ? Math.floor((totalAllocated - spentOnActiveEpisodes) / burnRate) : null;

  const zeroCostRows = logs.filter((r) => Number(r.cost_usd ?? 0) === 0);

  return {
    totalAllocated: round(totalAllocated, 2),
    allocatedIncludingArchived: round(allocatedIncludingArchived, 2),
    totalSpent: round(totalSpent),
    spentOnEpisodes: round(spentOnEpisodes),
    spentOnActiveEpisodes: round(spentOnActiveEpisodes),
    // Deliberately unclamped — an overrun must read as a negative number, not $0.
    remaining: round(totalAllocated - spentOnActiveEpisodes),
    burnRate: round(burnRate),
    projectedRunway,
    conciergeTotal: round(
      sumCost(logs.filter((r) => r.agent_id === CONCIERGE_AGENT_ID)),
    ),
    reservedTotal: round(byEpisode.reduce((s, e) => s + e.reserved, 0)),
    itemizedTotal: round(sumCost(logs)),
    unattributed: {
      total: round(unattributedTotal),
      calls: unattributedRows.length,
      byProvider: foldCost(unattributedRows, (r: BudgetLogInput) => providerBucket(r)),
      byAgent: foldCost(unattributedRows, (r: BudgetLogInput) => r.agent_id ?? 'unknown'),
      byOperation: foldCost(unattributedRows, (r: BudgetLogInput) => r.operation ?? 'unknown'),
    },
    gaps: {
      zeroCostCalls: zeroCostRows.length,
      zeroCostByProvider: foldCost(
        zeroCostRows,
        (r: BudgetLogInput) => r.api_provider ?? 'unknown',
      ),
      reservationOnlyEpisodes: byEpisode
        .filter((e) => e.reservationOnly && e.reserved > 0)
        .map((e) => e.episode_code),
      totalDriftAbs: round(
        byEpisode
          .filter((e) => !e.reservationOnly)
          .reduce((s, e) => s + Math.abs(e.drift), 0),
      ),
      // Only token-billed rows can be mispriced by the rate table; a per-image or
      // per-second media price is quoted by the provider itself, so a media model
      // missing from the LLM rate table is not a pricing gap.
      unpricedModels: foldCost(
        logs.filter(
          (r) =>
            (r.tokens_used ?? 0) > 0 &&
            Number(r.cost_usd ?? 0) > 0 &&
            !isModelPriced(r.model_or_tier),
        ),
        (r: BudgetLogInput) => r.model_or_tier ?? 'unknown',
      ),
    },
    byEpisode,
    counts: { episodes: episodes.length, logRows: logs.length },
  };
}
