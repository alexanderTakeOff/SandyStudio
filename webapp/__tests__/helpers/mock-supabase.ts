// ──────────────────────────────────────────────────────────────────────────────
// __tests__/helpers/mock-supabase.ts
// Minimal in-memory Supabase client for unit tests.
//
// Supports just the methods used by lib/budget.ts and lib/agents/gate.ts:
//   - from(table).select(cols).eq(col, val).single()
//   - from(table).insert(row)
//   - from(table).update(patch).eq(col, val)
//   - from(table).select('*', { count: 'exact', head: true }).eq(...).like(...)
//
// Idempotency: simulates the partial-unique index on budget_log(job_id) by
// rejecting inserts where job_id already exists with PG_UNIQUE_VIOLATION.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/supabase/types.gen';

const PG_UNIQUE_VIOLATION = '23505';

interface InMemoryTables {
  episodes: Array<Record<string, unknown>>;
  assets: Array<Record<string, unknown>>;
  jobs: Array<Record<string, unknown>>;
  budget_log: Array<Record<string, unknown>>;
  activity_events: Array<Record<string, unknown>>;
  dispatch_intent: Array<Record<string, unknown>>;
  gate_decision_log: Array<Record<string, unknown>>;
}

export interface MockSupabase {
  client: SupabaseClient<Database>;
  tables: InMemoryTables;
}

export function makeMockSupabase(seed: Partial<InMemoryTables> = {}): MockSupabase {
  const tables: InMemoryTables = {
    episodes: seed.episodes ? [...seed.episodes] : [],
    assets: seed.assets ? [...seed.assets] : [],
    jobs: seed.jobs ? [...seed.jobs] : [],
    budget_log: seed.budget_log ? [...seed.budget_log] : [],
    activity_events: seed.activity_events ? [...seed.activity_events] : [],
    dispatch_intent: seed.dispatch_intent ? [...seed.dispatch_intent] : [],
    gate_decision_log: seed.gate_decision_log ? [...seed.gate_decision_log] : [],
  };

  // ── Query builder ──────────────────────────────────────────────────────────
  // We model just enough of the chained API for the units under test.
  function buildQuery(table: keyof InMemoryTables) {
    let rows = tables[table];
    let isCount = false;
    let limitN: number | null = null;
    const filters: Array<(r: Record<string, unknown>) => boolean> = [];
    const sorts: Array<{ col: string; asc: boolean }> = [];

    const builder = {
      select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.count === 'exact' || opts?.head) isCount = true;
        return builder;
      },
      insert: (row: Record<string, unknown> | Array<Record<string, unknown>>) => {
        const records = Array.isArray(row) ? row : [row];
        // Idempotency check for budget_log on job_id.
        if (table === 'budget_log') {
          for (const r of records) {
            const exists = tables.budget_log.find((existing) => existing.job_id === r.job_id);
            if (exists && r.job_id) {
              return Promise.resolve({
                data: null,
                error: { code: PG_UNIQUE_VIOLATION, message: 'duplicate key' },
              });
            }
          }
        }
        for (const r of records) {
          tables[table].push({
            id: r.id ?? `${table}-${tables[table].length + 1}`,
            ...r,
          });
        }
        const inserted = tables[table].slice(-records.length);
        return {
          select: (_c: string) => ({
            single: () =>
              Promise.resolve({ data: inserted[0] ?? null, error: null }),
            maybeSingle: () =>
              Promise.resolve({ data: inserted[0] ?? null, error: null }),
          }),
          // bare insert (no chained select) — return success
          then: (resolve: (v: unknown) => unknown) =>
            resolve({ data: inserted, error: null }),
        };
      },
      update: (patch: Record<string, unknown>) => {
        // PostgREST accumulates .eq() filters and applies the patch on await, so
        // the sub-builder is chainable (multiple .eq) AND thenable.
        const updateFilters: Array<(r: Record<string, unknown>) => boolean> = [];
        const apply = () => {
          for (const r of tables[table]) {
            if (updateFilters.every((f) => f(r))) Object.assign(r, patch);
          }
          return { data: null, error: null };
        };
        const subBuilder = {
          eq: (col: string, val: unknown) => {
            updateFilters.push((r) => r[col] === val);
            return subBuilder;
          },
          neq: (col: string, val: unknown) => {
            updateFilters.push((r) => r[col] !== val);
            return subBuilder;
          },
          in: (col: string, vals: ReadonlyArray<unknown>) => {
            const set = new Set(vals);
            updateFilters.push((r) => set.has(r[col]));
            return subBuilder;
          },
          then: (resolve: (v: unknown) => unknown) => resolve(apply()),
        };
        return subBuilder;
      },
      eq: (col: string, val: unknown) => {
        filters.push((r) => r[col] === val);
        rows = applyFilters();
        return builder;
      },
      neq: (col: string, val: unknown) => {
        filters.push((r) => r[col] !== val);
        rows = applyFilters();
        return builder;
      },
      in: (col: string, vals: ReadonlyArray<unknown>) => {
        const set = new Set(vals);
        filters.push((r) => set.has(r[col]));
        rows = applyFilters();
        return builder;
      },
      like: (col: string, pattern: string) => {
        // Convert SQL LIKE pattern to JS regex (only handles trailing % for now).
        const trimmed = pattern.endsWith('%') ? pattern.slice(0, -1) : pattern;
        filters.push((r) => String(r[col] ?? '').startsWith(trimmed));
        rows = applyFilters();
        return builder;
      },
      // F2 (2026-06-12): loadAgentInputs now orders upstream assets
      // version-desc (newest-wins). Multi-column: first order() is primary,
      // later calls are tie-breakers — matches PostgREST semantics.
      order: (col: string, opts?: { ascending?: boolean }) => {
        sorts.push({ col, asc: opts?.ascending ?? true });
        return builder;
      },
      limit: (n: number) => {
        limitN = n;
        return builder;
      },
      single: () => {
        const filtered = applyFilters();
        if (filtered.length === 0) {
          return Promise.resolve({
            data: null,
            error: { code: 'PGRST116', message: 'No rows' },
          });
        }
        return Promise.resolve({ data: filtered[0], error: null });
      },
      // Like single() but 0 rows → { data: null, error: null } (no PGRST116).
      maybeSingle: () => {
        const filtered = applyFilters();
        return Promise.resolve({ data: filtered[0] ?? null, error: null });
      },
      // For count-only queries
      then: (resolve: (v: unknown) => unknown) => {
        const filtered = applyFilters();
        if (isCount) {
          return resolve({
            data: null,
            count: filtered.length,
            error: null,
          });
        }
        return resolve({ data: filtered, error: null });
      },
    };

    function applyFilters() {
      let r = tables[table];
      for (const f of filters) r = r.filter(f);
      if (sorts.length > 0) {
        // Numeric when both sides parse as numbers; lexicographic otherwise
        // (ISO timestamps order correctly as strings).
        const cmp = (x: unknown, y: unknown): number => {
          const nx = Number(x ?? 0);
          const ny = Number(y ?? 0);
          if (!Number.isNaN(nx) && !Number.isNaN(ny)) return nx - ny;
          return String(x ?? '').localeCompare(String(y ?? ''));
        };
        r = [...r].sort((a, b) => {
          for (const s of sorts) {
            const d = cmp(a[s.col], b[s.col]);
            if (d !== 0) return s.asc ? d : -d;
          }
          return 0;
        });
      }
      if (limitN !== null) r = r.slice(0, limitN);
      return r;
    }

    return builder;
  }

  // ── RPC ──────────────────────────────────────────────────────────────────
  // Mirrors the `increment_budget_spent` Postgres function (migration 0037):
  // atomic ceiling-guarded increment of episodes.budget_spent. Returns a single
  // table row { spent, ceiling, allowed }; PostgREST surfaces it as an array.
  function rpc(fnName: string, args: Record<string, unknown>) {
    if (fnName === 'increment_budget_spent') {
      const episodeId = args.p_episode;
      const cost = typeof args.p_cost === 'number' ? args.p_cost : Number(args.p_cost ?? 0);
      const episode = tables.episodes.find((e) => e.id === episodeId);
      if (!episode) {
        // Episode not found → no increment, not allowed.
        return Promise.resolve({
          data: [{ spent: 0, ceiling: null, allowed: false }],
          error: null,
        });
      }
      const currentSpent =
        typeof episode.budget_spent === 'number'
          ? episode.budget_spent
          : Number(episode.budget_spent ?? 0);
      const ceiling =
        episode.budget_ceiling === null || episode.budget_ceiling === undefined
          ? null
          : typeof episode.budget_ceiling === 'number'
            ? episode.budget_ceiling
            : Number(episode.budget_ceiling);
      const newSpent = currentSpent + cost;
      const allowed = ceiling === null || newSpent <= ceiling;
      if (allowed) {
        episode.budget_spent = newSpent;
        return Promise.resolve({
          data: [{ spent: newSpent, ceiling, allowed: true }],
          error: null,
        });
      }
      // Would exceed ceiling → leave budget_spent unchanged.
      return Promise.resolve({
        data: [{ spent: currentSpent, ceiling, allowed: false }],
        error: null,
      });
    }
    // Mirrors `claim_dispatch_intent` (migration 0039): atomic per-shot dispatch
    // claim keyed on (episode_id, shot_id, agent_id). A claimed/running row blocks
    // a duplicate; a done/failed row is re-claimable.
    if (fnName === 'claim_dispatch_intent') {
      const episodeId = args.p_episode;
      const shotId = typeof args.p_shot === 'string' ? args.p_shot : '';
      const agentId = args.p_agent;
      const hash = typeof args.p_hash === 'string' ? args.p_hash : '';
      const runId = typeof args.p_run === 'string' ? args.p_run : null;
      const existing = tables.dispatch_intent.find(
        (r) => r.episode_id === episodeId && r.shot_id === shotId && r.agent_id === agentId,
      );
      const isTerminal = (s: unknown) => s === 'done' || s === 'failed';
      if (!existing) {
        tables.dispatch_intent.push({
          episode_id: episodeId,
          shot_id: shotId,
          agent_id: agentId,
          input_hash: hash,
          status: 'claimed',
          inngest_run_id: runId,
          blocked_count: 0,
        });
        return Promise.resolve({
          data: [{ claimed: true, blocking_run_id: null, blocking_status: null }],
          error: null,
        });
      }
      if (isTerminal(existing.status)) {
        existing.status = 'claimed';
        existing.input_hash = hash;
        existing.inngest_run_id = runId;
        existing.blocked_count = 0;
        return Promise.resolve({
          data: [{ claimed: true, blocking_run_id: null, blocking_status: null }],
          error: null,
        });
      }
      // In flight → block the duplicate, record the waste.
      existing.blocked_count = (Number(existing.blocked_count) || 0) + 1;
      return Promise.resolve({
        data: [
          {
            claimed: false,
            blocking_run_id: existing.inngest_run_id ?? null,
            blocking_status: existing.status ?? null,
          },
        ],
        error: null,
      });
    }
    // Unknown RPC → benign default.
    return Promise.resolve({ data: null, error: null });
  }

  const client = {
    from: (table: string) => buildQuery(table as keyof InMemoryTables),
    rpc,
  } as unknown as SupabaseClient<Database>;

  return { client, tables };
}
