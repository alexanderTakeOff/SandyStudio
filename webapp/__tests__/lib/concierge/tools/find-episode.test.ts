// 2026-05-25 fix — findEpisode previously extracted only 'E01' from
// 'SS-S15-E01' and queried episode_code='E01', missing all rows since DB
// stores full codes 'SS-S15-E01'. These tests cover the new regex extraction
// + ilike fallback behaviour.

import { describe, expect, test } from 'vitest';
import { findEpisode } from '@/lib/concierge/tools/episode-create';
import type { ToolContext, ToolResult } from '@/lib/concierge/tools/types';

interface QueryRecord {
  eq?: { field: string; value: string };
  ilike?: { field: string; pattern: string };
}

function makeSupabaseMock(
  rows: Array<{ id: string; episode_code: string; title_working: string }>,
) {
  const records: QueryRecord[] = [];
  const builder = {
    select: () => builder,
    order: () => builder,
    limit: () => builder,
    eq: (field: string, value: string) => {
      records.push({ eq: { field, value } });
      return builder;
    },
    ilike: (field: string, pattern: string) => {
      records.push({ ilike: { field, pattern } });
      return builder;
    },
    then: (onResolve: (v: { data: typeof rows; error: null }) => unknown) => {
      const filtered = rows.filter((r) => {
        for (const rec of records) {
          if (rec.eq && rec.eq.field === 'episode_code') {
            if (r.episode_code !== rec.eq.value) return false;
          }
          if (rec.ilike) {
            const pat = rec.ilike.pattern.replace(/%/g, '');
            const field = rec.ilike.field as keyof typeof r;
            const val = String(r[field] ?? '');
            if (!val.toLowerCase().includes(pat.toLowerCase())) return false;
          }
        }
        return true;
      });
      return Promise.resolve(onResolve({ data: filtered, error: null }));
    },
  };
  return {
    from: () => builder,
    __records: records,
  };
}

const ROWS = [
  {
    id: 'ep-s15-e01-uuid',
    episode_code: 'SS-S15-E01',
    title_working: 'Heavy Friend',
  },
  {
    id: 'ep-s14-e21-uuid',
    episode_code: 'SS-S14-E21',
    title_working: 'The Gym',
  },
  {
    id: 'ep-s14-e01-uuid',
    episode_code: 'SS-S14-E01',
    title_working: 'Perfume Vial',
  },
];

function makeCtx(supabase: unknown): ToolContext {
  return {
    supabase: supabase as never,
    appOrigin: 'http://localhost:3000',
    cookieHeader: null,
    recentTurns: [],
  } as unknown as ToolContext;
}

function extractMatches(
  res: ToolResult,
): Array<{ id: string; episode_code: string; title_working: string }> {
  expect(res.ok).toBe(true);
  if (!res.ok) throw new Error('unreachable — expected ok=true above');
  const data = res.data as { matches: Array<{ id: string; episode_code: string; title_working: string }> };
  return data.matches;
}

describe('findEpisode — full episode_code matching (2026-05-25 fix)', () => {
  test('exact match on full code SS-S15-E01', async () => {
    const sb = makeSupabaseMock(ROWS);
    const ctx = makeCtx(sb);
    const res = (await findEpisode.execute(
      findEpisode.parse(JSON.stringify({ query: 'SS-S15-E01' })),
      ctx,
    )) as ToolResult;
    const matches = extractMatches(res);
    expect(matches.length).toBe(1);
    expect(matches[0]!.episode_code).toBe('SS-S15-E01');
  });

  test('exact match on PILOT episode code', async () => {
    const sb = makeSupabaseMock([
      ...ROWS,
      { id: 'ep-pilot', episode_code: 'SS-PILOT-E01', title_working: 'Pilot' },
    ]);
    const ctx = makeCtx(sb);
    const res = (await findEpisode.execute(
      findEpisode.parse(JSON.stringify({ query: 'SS-PILOT-E01' })),
      ctx,
    )) as ToolResult;
    const matches = extractMatches(res);
    expect(matches.length).toBe(1);
    expect(matches[0]!.episode_code).toBe('SS-PILOT-E01');
  });

  test('series-only code SS-S14 matches all S14 episodes', async () => {
    const sb = makeSupabaseMock(ROWS);
    const ctx = makeCtx(sb);
    const res = (await findEpisode.execute(
      findEpisode.parse(JSON.stringify({ query: 'SS-S14' })),
      ctx,
    )) as ToolResult;
    const matches = extractMatches(res);
    expect(matches.length).toBe(2);
  });

  test('free-text title query falls back to ilike on title_working', async () => {
    const sb = makeSupabaseMock(ROWS);
    const ctx = makeCtx(sb);
    const res = (await findEpisode.execute(
      findEpisode.parse(JSON.stringify({ query: 'Heavy' })),
      ctx,
    )) as ToolResult;
    const matches = extractMatches(res);
    expect(matches.length).toBe(1);
    expect(matches[0]!.title_working).toBe('Heavy Friend');
  });

  test('no match returns empty array gracefully', async () => {
    const sb = makeSupabaseMock(ROWS);
    const ctx = makeCtx(sb);
    const res = (await findEpisode.execute(
      findEpisode.parse(JSON.stringify({ query: 'SS-S99-E99' })),
      ctx,
    )) as ToolResult;
    const matches = extractMatches(res);
    expect(matches.length).toBe(0);
  });
});
