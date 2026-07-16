// Purpose-built mock supabase for computeNextEvents branch tests.
// Extracted 2026-06-12 from next-events-readability.test.ts (was inline) so
// the single-dispatch suite shares one mock instead of a second copy.
//
// Models just the query shapes computeNextEvents uses: count queries
// (countApproved / hasJob), order/limit/maybeSingle of
// findLatestApprovedAssetId, `or(...)` eq/like alternatives (animatic plan
// lookup), and `update(...).eq(...)` (critic-PASS plan promotion — recorded
// into `updates` so tests can assert the promotion happened).

export interface MockRow {
  id?: string;
  episode_id?: string;
  agent_id?: string;
  status?: string;
  file_type?: string;
  version?: number;
  started_at?: string;
  content?: string;
  metadata?: unknown;
}

export interface RecordedUpdate {
  table: string;
  patch: Record<string, unknown>;
  filters: Array<{ col: string; val: unknown }>;
}

export function mockSupabase(seed: {
  jobs?: MockRow[];
  assets?: MockRow[];
  /** `episodes` rows — read via `.select('metadata').eq('id',ep).maybeSingle()`
   *  for excluded_shot_ids and (2026-07-16) delivery_targets. Seed this when the
   *  branch under test reads episode metadata; without it the table used to fall
   *  through to `assets` and silently answer with an unrelated asset's metadata. */
  episodes?: MockRow[];
}): {
  client: never;
  updates: RecordedUpdate[];
  inserts: Array<{ table: string; row: Record<string, unknown> }>;
} {
  const jobs = seed.jobs ?? [];
  const assets = seed.assets ?? [];
  const episodes = seed.episodes ?? [];
  const updates: RecordedUpdate[] = [];
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];

  function table(name: string) {
    const rows = name === 'jobs' ? jobs : name === 'episodes' ? episodes : assets;
    let isCount = false;
    let ordered: MockRow[] | null = null;
    let pendingUpdate: Record<string, unknown> | null = null;
    const eqFilters: Array<{ col: string; val: unknown }> = [];
    const filters: Array<(r: MockRow) => boolean> = [];
    const apply = () => {
      let r = rows as MockRow[];
      for (const f of filters) r = r.filter(f);
      return r;
    };
    const likeMatcher = (pattern: string) => {
      const t = pattern.endsWith('%') ? pattern.slice(0, -1) : pattern;
      return (v: unknown) => String(v ?? '').startsWith(t);
    };
    const builder = {
      select: (_c: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.count === 'exact' || opts?.head) isCount = true;
        return builder;
      },
      update: (patch: Record<string, unknown>) => {
        pendingUpdate = patch;
        return builder;
      },
      // Records inserts (used by logEvent → activity_events) so tests can assert
      // side-effects. Chainable so `.insert(...).select('id').maybeSingle()`
      // resolves to a null row — enough for the fire-and-forget audit calls.
      insert: (row: unknown) => {
        inserts.push({ table: name, row: (row ?? {}) as Record<string, unknown> });
        return builder;
      },
      eq: (col: string, val: unknown) => {
        eqFilters.push({ col, val });
        filters.push((r) => (r as Record<string, unknown>)[col] === val);
        return builder;
      },
      in: (col: string, vals: ReadonlyArray<unknown>) => {
        const set = new Set(vals);
        filters.push((r) => set.has((r as Record<string, unknown>)[col]));
        return builder;
      },
      like: (col: string, pattern: string) => {
        const m = likeMatcher(pattern);
        filters.push((r) => m((r as Record<string, unknown>)[col]));
        return builder;
      },
      // PostgREST `or` syntax subset: `col.eq.value,col.like.pat%`
      or: (expr: string) => {
        const alternatives = expr.split(',').map((clause) => {
          const [col, op, ...rest] = clause.split('.');
          const value = rest.join('.');
          if (op === 'like') {
            const m = likeMatcher(value);
            return (r: MockRow) => m((r as Record<string, unknown>)[col]);
          }
          return (r: MockRow) => String((r as Record<string, unknown>)[col] ?? '') === value;
        });
        filters.push((r) => alternatives.some((a) => a(r)));
        return builder;
      },
      gte: () => builder,
      order: (col: string, opts?: { ascending?: boolean }) => {
        const asc = opts?.ascending ?? true;
        ordered = [...apply()].sort((a, b) => {
          const av = Number((a as Record<string, unknown>)[col] ?? 0);
          const bv = Number((b as Record<string, unknown>)[col] ?? 0);
          return asc ? av - bv : bv - av;
        });
        return builder;
      },
      limit: () => builder,
      maybeSingle: async () => ({ data: (ordered ?? apply())[0] ?? null, error: null }),
      single: async () => ({ data: (ordered ?? apply())[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown) => {
        if (pendingUpdate) {
          updates.push({ table: name, patch: pendingUpdate, filters: eqFilters });
          // Apply in place so follow-up reads in the same test see the change.
          for (const row of apply()) Object.assign(row, pendingUpdate);
          return resolve({ data: null, error: null });
        }
        const filtered = apply();
        if (isCount) return resolve({ data: null, count: filtered.length, error: null });
        return resolve({ data: filtered, error: null });
      },
    };
    return builder;
  }
  return { client: { from: (n: string) => table(n) } as never, updates, inserts };
}
