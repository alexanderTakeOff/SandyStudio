// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/hog-memory-rollup.ts
// Pure aggregation for the HoG memory rollup hierarchy (multi-channel Phase 4b).
//
// The rollup law: daily rows → weekly_rollup → monthly_rollup, and every period
// reads ONLY the previous rollup + the rows appended since it — never the full
// history. That keeps the analytical context bounded forever: half a year from
// now the weekly cron still reads one prior rollup + ≤7 days of rows.
//
// Pure functions (no DB, no clock) — the Inngest crons feed them rows and
// persist the result; unit tests cover the aggregation itself.
// ──────────────────────────────────────────────────────────────────────────────

/** One hog_memory row as the aggregators see it. */
export interface MemoryRow {
  kind: string;
  status: string | null;
  unlock_date: string | null;
  created_at: string;
  payload: Record<string, unknown>;
}

export interface HypothesisState {
  slug: string;
  text: string;
  status: 'PENDING' | 'CONFIRMED' | 'REFUTED';
  unlock_date: string | null;
}

export interface WeeklyRollupPayload {
  window: { start: string; end: string };
  /** Hypotheses still open (latest status PENDING) at week end. */
  open: HypothesisState[];
  /** Slugs newly CONFIRMED this week (each becomes a rule_proposal). */
  confirmed_this_week: HypothesisState[];
  /** Cumulative CONFIRMED slugs (prev + this week). */
  confirmed: string[];
  /** Cumulative REFUTED slugs — the анти-повтор list: never re-propose these. */
  refuted: string[];
  experiments: Array<Record<string, unknown>>;
  decisions: Array<Record<string, unknown>>;
  medians: { completion: number | null; views: number | null; days: number };
  advice: { days: number; latestMode: string | null; latestSampleSize: number | null };
}

export interface MonthlyRollupPayload {
  window: { start: string; end: string };
  weeks: number;
  open: HypothesisState[];
  confirmed: string[];
  refuted: string[];
  medianCompletionByWeek: Array<number | null>;
  medianViewsByWeek: Array<number | null>;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function stringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function openFromPrev(prev: Record<string, unknown> | null): HypothesisState[] {
  if (!prev) return [];
  const raw = prev.open;
  if (!Array.isArray(raw)) return [];
  const out: HypothesisState[] = [];
  for (const h of raw) {
    const o = h && typeof h === 'object' ? (h as Record<string, unknown>) : {};
    const slug = str(o.slug);
    if (!slug) continue;
    out.push({ slug, text: str(o.text) ?? slug, status: 'PENDING', unlock_date: str(o.unlock_date) });
  }
  return out;
}

/**
 * Fold the week's rows on top of the previous weekly rollup.
 * Hypothesis identity = payload.slug; the LATEST row per slug wins (an append
 * with a new status supersedes the older one). Rows without a slug are treated
 * as one-off notes keyed by their created_at (still tracked, can't be updated).
 */
export function aggregateWeekly(
  prev: Record<string, unknown> | null,
  rows: MemoryRow[],
  window: { start: string; end: string },
): WeeklyRollupPayload {
  const prevConfirmed = stringArray(prev?.confirmed);
  const prevRefuted = stringArray(prev?.refuted);

  // Seed hypothesis states with the previous week's open set, then fold this
  // week's hypothesis rows in chronological order (latest status per slug wins).
  const bySlug = new Map<string, HypothesisState>();
  for (const h of openFromPrev(prev)) bySlug.set(h.slug, h);

  const sorted = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const r of sorted) {
    if (r.kind !== 'hypothesis') continue;
    const slug = str(r.payload.slug) ?? `note-${r.created_at}`;
    const status = (r.status ?? 'PENDING') as HypothesisState['status'];
    const existing = bySlug.get(slug);
    bySlug.set(slug, {
      slug,
      text: str(r.payload.text) ?? existing?.text ?? slug,
      status,
      unlock_date: r.unlock_date ?? existing?.unlock_date ?? null,
    });
  }

  const states = [...bySlug.values()];
  const confirmedThisWeek = states.filter(
    (h) => h.status === 'CONFIRMED' && !prevConfirmed.includes(h.slug),
  );
  const refutedNew = states.filter((h) => h.status === 'REFUTED').map((h) => h.slug);

  const adviceRows = sorted.filter((r) => r.kind === 'daily_advice');
  const statsOf = (r: MemoryRow) =>
    r.payload.channelStats && typeof r.payload.channelStats === 'object'
      ? (r.payload.channelStats as Record<string, unknown>)
      : {};
  const completions = adviceRows
    .map((r) => num(statsOf(r).medianCompletion))
    .filter((x): x is number => x !== null);
  const views = adviceRows
    .map((r) => num(statsOf(r).medianViews))
    .filter((x): x is number => x !== null);
  const latestAdvice = adviceRows[adviceRows.length - 1] ?? null;

  return {
    window,
    open: states.filter((h) => h.status === 'PENDING'),
    confirmed_this_week: confirmedThisWeek,
    confirmed: [...new Set([...prevConfirmed, ...states.filter((h) => h.status === 'CONFIRMED').map((h) => h.slug)])],
    refuted: [...new Set([...prevRefuted, ...refutedNew])],
    experiments: sorted.filter((r) => r.kind === 'experiment').map((r) => r.payload),
    decisions: sorted.filter((r) => r.kind === 'decision').map((r) => r.payload),
    medians: { completion: median(completions), views: median(views), days: adviceRows.length },
    advice: {
      days: adviceRows.length,
      latestMode: latestAdvice ? (str(latestAdvice.payload.mode) ?? null) : null,
      latestSampleSize: latestAdvice ? num(latestAdvice.payload.sampleSize) : null,
    },
  };
}

/** Fold the month's WEEKLY rollups (only!) on top of the previous monthly rollup. */
export function aggregateMonthly(
  prev: Record<string, unknown> | null,
  weeklies: MemoryRow[],
  window: { start: string; end: string },
): MonthlyRollupPayload {
  const sorted = [...weeklies]
    .filter((r) => r.kind === 'weekly_rollup')
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const last = sorted[sorted.length - 1] ?? null;
  const lastPayload = last ? last.payload : null;

  const pick = (p: Record<string, unknown> | null, key: 'completion' | 'views'): Array<number | null> =>
    sorted.map((w) => {
      const m = w.payload.medians && typeof w.payload.medians === 'object'
        ? (w.payload.medians as Record<string, unknown>)
        : {};
      return num(m[key]);
    });

  return {
    window,
    weeks: sorted.length,
    open: openFromPrev(lastPayload),
    // The latest weekly rollup already carries the CUMULATIVE lists.
    confirmed: [...new Set([...stringArray(prev?.confirmed), ...stringArray(lastPayload?.confirmed)])],
    refuted: [...new Set([...stringArray(prev?.refuted), ...stringArray(lastPayload?.refuted)])],
    medianCompletionByWeek: pick(lastPayload, 'completion'),
    medianViewsByWeek: pick(lastPayload, 'views'),
  };
}
