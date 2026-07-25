// Unit tests for genreForEpisode — Phase 1 genre single-source fix.
// Validates that the code→UUID resolution is used (not direct .eq('id', code))
// so the GAGAD chain and skill selector work for series like SS-S15.

import { describe, it, expect } from 'vitest';
import { genreForEpisode } from '@/lib/api/series-bible';

// Mock Supabase builder that handles all three query shapes used by
// seriesIdForEpisode + genreForEpisode:
//
//   1. from('episodes').select(...).eq('id', episodeId)
//      → array result (no maybeSingle) — row has series_id + episode_code
//
//   2. from('series').select('id').eq('code', code)
//      → array result (no maybeSingle) — code→UUID lookup
//
//   3. from('series').select('genre').eq('id', uuid).maybeSingle()
//      → single result — genre lookup
//
// The builder tracks which `select()` columns were requested on the `series`
// table to distinguish cases 2 and 3.

function makeSupabase(config: {
  episodesRow?: { series_id: string | null; episode_code?: string | null } | null;
  seriesIdForCode?: string | null;
  genreForId?: string | null;
  throwOnSeries?: boolean;
}) {
  return {
    from(table: string) {
      if (table === 'episodes') {
        return {
          select: () => ({
            eq: () =>
              Promise.resolve({
                data:
                  config.episodesRow !== undefined ? [config.episodesRow] : [],
                error: null,
              }),
          }),
        };
      }

      if (table === 'series') {
        if (config.throwOnSeries) throw new Error('simulated DB error');

        let selectedCols = '';
        const seriesBuilder = {
          select(cols: string) {
            selectedCols = cols;
            return seriesBuilder;
          },
          eq(_col: string, _val: unknown) {
            // Distinguish code→UUID lookup (select 'id') from genre lookup
            if (selectedCols === 'id') {
              // seriesIdForEpisode: .from('series').select('id').eq('code', code)
              // returns plain array
              return Promise.resolve({
                data: config.seriesIdForCode
                  ? [{ id: config.seriesIdForCode }]
                  : [],
                error: null,
              });
            }
            // genreForEpisode: .from('series').select('genre').eq('id', uuid)
            // then .maybeSingle()
            return {
              maybeSingle: () =>
                Promise.resolve({
                  data:
                    config.genreForId !== undefined
                      ? { genre: config.genreForId }
                      : null,
                  error: null,
                }),
            };
          },
        };
        return seriesBuilder;
      }

      // Fallback for any other table
      return {
        select: () => ({
          eq: () => Promise.resolve({ data: [], error: null }),
        }),
      };
    },
  } as never;
}

describe('genreForEpisode', () => {
  it('a legacy code-string series_id yields null (fallback deleted post-0038)', async () => {
    // Historically episodes.series_id could store the series CODE; migration
    // 0038 normalised the FK to uuid and multi-channel Phase 0 deleted the
    // code→UUID fallback. A non-uuid value now resolves to no series → null.
    const sb = makeSupabase({
      episodesRow: { series_id: 'SS-S15', episode_code: 'SS-S15-E03' },
      seriesIdForCode: 'uuid-series-1',
      genreForId: 'comedy',
    });
    const result = await genreForEpisode(sb, 'ep-uuid-1');
    expect(result).toBeNull();
  });

  it('happy path: series_id is already a valid UUID', async () => {
    // UUID stored directly — no code lookup needed
    const sb = makeSupabase({
      episodesRow: {
        series_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        episode_code: null,
      },
      genreForId: 'drama',
    });
    const result = await genreForEpisode(sb, 'ep-uuid-2');
    expect(result).toBe('drama');
  });

  it('returns null when series row not found', async () => {
    const sb = makeSupabase({
      episodesRow: { series_id: 'SS-S15', episode_code: 'SS-S15-E99' },
      seriesIdForCode: null, // series not found by code
    });
    const result = await genreForEpisode(sb, 'ep-uuid-3');
    expect(result).toBeNull();
  });

  it('returns null when supabase throws on series query', async () => {
    const sb = makeSupabase({
      episodesRow: { series_id: 'SS-S15', episode_code: 'SS-S15-E99' },
      throwOnSeries: true,
    });
    const result = await genreForEpisode(sb, 'ep-uuid-4');
    expect(result).toBeNull();
  });
});
