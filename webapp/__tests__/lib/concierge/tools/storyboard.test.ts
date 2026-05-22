// Unit tests for listShots PA tool — 2026-05-22 vocabulary-gap fix.
// Verifies schema, supabase query shape, registry integration, error paths.

import { describe, expect, test } from 'vitest';
import { listShots } from '@/lib/concierge/tools/storyboard';
import type { ToolContext } from '@/lib/concierge/tools/types';

const STB_CONTENT_VALID = [
  '# Storyboard',
  '',
  '```json',
  JSON.stringify({
    acts: [
      {
        act: 1,
        shots: [
          {
            shot_id: 'SS-S15-E01-A1-SC01-SH01',
            shot_role: 'establishing',
            duration_seconds: 4,
            action_prose: 'Sandy walks into the bedroom.',
            location: { slug: 'bedroom_main' },
            characters: [{ bible_slug: 'sandy' }],
          },
          {
            shot_id: 'SS-S15-E01-A1-SC01-SH02',
            shot_role: 'reaction',
            action_prose: 'Sandy spots the vanity mirror.',
          },
        ],
      },
      {
        act: 2,
        shots: [
          {
            shot_id: 'SS-S15-E01-A2-SC03-SH09',
            action_prose: 'Anvil enters carrying the rug.',
          },
          {
            shot_id: 'SS-S15-E01-A2-SC03-SH10',
            action_prose: 'They start moving the vanity.',
          },
        ],
      },
    ],
  }),
  '```',
].join('\n');

function makeMockSupabase(opts: {
  stbAsset?: Record<string, unknown> | null;
  error?: { message: string } | null;
}) {
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.order = () => builder;
  builder.limit = () => builder;
  builder.maybeSingle = async () => ({
    data: opts.stbAsset ?? null,
    error: opts.error ?? null,
  });
  return { from: () => builder } as never;
}

const baseCtx: ToolContext = {
  supabase: null as never,
  threadId: 't1',
  mode: 1 as never,
  episodeId: 'ep-1',
  appOrigin: 'http://localhost:3000',
};

describe('listShots — schema and registration', () => {
  test('schema name matches and episodeId is optional', () => {
    expect(listShots.schema.function.name).toBe('listShots');
    expect(listShots.schema.function.parameters.required).toBeUndefined();
  });

  test('is read-only (no verbal-approval gate)', () => {
    expect(listShots.mutating).toBe(false);
  });

  test('description directs Polina NOT to ask Director for shotIds', () => {
    expect(listShots.description.toLowerCase()).toContain('never ask');
    expect(listShots.description.toLowerCase()).toContain('shotid');
  });

  test('is exposed through central tools registry', async () => {
    const { findTool, openaiSchemas } = await import('@/lib/concierge/tools');
    expect(findTool('listShots')).toBeDefined();
    const names = openaiSchemas.map((s) => s.function.name);
    expect(names).toContain('listShots');
  });
});

describe('listShots.execute', () => {
  test('returns shot list when an APPROVED storyboard exists', async () => {
    const sb = makeMockSupabase({
      stbAsset: {
        id: 'stb-1',
        filename: 'SS-S15-E01-STB-storyboard-v04-APPROVED.md',
        status: 'APPROVED',
        version: 4,
        content: STB_CONTENT_VALID,
        created_at: '2026-05-19T00:00:00Z',
      },
    });
    const r = await listShots.execute(
      { episodeId: 'ep-1' },
      { ...baseCtx, supabase: sb },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      const data = r.data as {
        totalShots: number;
        shots: Array<{ shotId: string; act: number }>;
      };
      expect(data.totalShots).toBe(4);
      expect(data.shots.map((s) => s.shotId)).toEqual([
        'SS-S15-E01-A1-SC01-SH01',
        'SS-S15-E01-A1-SC01-SH02',
        'SS-S15-E01-A2-SC03-SH09',
        'SS-S15-E01-A2-SC03-SH10',
      ]);
    }
  });

  test('filters by act when act arg passed', async () => {
    const sb = makeMockSupabase({
      stbAsset: { id: 'stb-1', status: 'APPROVED', content: STB_CONTENT_VALID },
    });
    const r = await listShots.execute(
      { episodeId: 'ep-1', act: 2 },
      { ...baseCtx, supabase: sb },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      const data = r.data as {
        returnedShots: number;
        shots: Array<{ shotId: string }>;
      };
      expect(data.returnedShots).toBe(2);
      expect(data.shots.map((s) => s.shotId)).toEqual([
        'SS-S15-E01-A2-SC03-SH09',
        'SS-S15-E01-A2-SC03-SH10',
      ]);
    }
  });

  test('respects limit arg with truncation flag', async () => {
    const sb = makeMockSupabase({
      stbAsset: { id: 'stb-1', status: 'APPROVED', content: STB_CONTENT_VALID },
    });
    const r = await listShots.execute(
      { episodeId: 'ep-1', limit: 2 },
      { ...baseCtx, supabase: sb },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      const data = r.data as { returnedShots: number; truncated: boolean };
      expect(data.returnedShots).toBe(2);
      expect(data.truncated).toBe(true);
    }
  });

  test('fails cleanly when no APPROVED storyboard exists', async () => {
    const sb = makeMockSupabase({ stbAsset: null });
    const r = await listShots.execute(
      { episodeId: 'ep-1' },
      { ...baseCtx, supabase: sb },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('no_approved_storyboard');
    }
  });

  test('fails cleanly when storyboard content is empty', async () => {
    const sb = makeMockSupabase({
      stbAsset: { id: 'stb-empty', status: 'APPROVED', content: '' },
    });
    const r = await listShots.execute(
      { episodeId: 'ep-1' },
      { ...baseCtx, supabase: sb },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('empty_content');
  });

  test('fails when no episodeId in args or context', async () => {
    const sb = makeMockSupabase({ stbAsset: null });
    const r = await listShots.execute(
      {},
      { ...baseCtx, supabase: sb, episodeId: null },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/episodeId/i);
  });

  test('parse clamps limit and tolerates malformed JSON', () => {
    const parsed = listShots.parse(
      JSON.stringify({ episodeId: 'e1', limit: 99999 }),
    );
    expect(parsed.limit).toBe(1000);
    const parsedLow = listShots.parse(
      JSON.stringify({ episodeId: 'e1', limit: -5 }),
    );
    expect(parsedLow.limit).toBe(1);
    const parsedEmpty = listShots.parse('not json');
    expect(parsedEmpty.episodeId).toBeUndefined();
  });
});
