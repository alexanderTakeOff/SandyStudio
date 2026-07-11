// writeStartNotice (2026-07-11, Director q1b) — create-or-overwrite the episode's
// Episode Start Notice (SPC-start_notice), the advisory reservoir the Writer draws
// from so a large gag bank never bloats the often-read brief.
import { describe, expect, test } from 'vitest';
import { writeStartNotice } from '@/lib/concierge/tools/episode-create';
import type { ToolContext } from '@/lib/concierge/tools/types';

const EP = '22222222-2222-4222-8222-222222222222';

interface SbHandlers {
  existingNotice: { id: string; version: number; status: string } | null;
  episodeCode?: string | null;
}

/** Minimal chainable Supabase stub covering the writeStartNotice query paths. */
function makeSb(h: SbHandlers): ToolContext['supabase'] {
  const resolveTerminal = (table: string, op: string) => {
    if (table === 'assets' && op === 'select') return { data: h.existingNotice, error: null };
    if (table === 'assets' && op === 'insert') return { data: { id: 'new-notice-id' }, error: null };
    if (table === 'assets' && op === 'update') return { error: null };
    if (table === 'episodes' && op === 'select')
      return { data: { id: EP, episode_code: h.episodeCode ?? 'SS-S15-E26' }, error: null };
    return { data: null, error: null };
  };
  const from = (table: string) => {
    const state = { table, op: 'select' as string };
    const builder: Record<string, unknown> = {
      select: () => builder,
      insert: () => {
        state.op = 'insert';
        return builder;
      },
      update: () => {
        state.op = 'update';
        return builder;
      },
      eq: () => builder,
      order: () => builder,
      limit: () => builder,
      maybeSingle: () => Promise.resolve(resolveTerminal(state.table, state.op)),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve(resolveTerminal(state.table, state.op)).then(res, rej),
    };
    return builder;
  };
  return { from } as unknown as ToolContext['supabase'];
}

function ctx(overrides: Partial<ToolContext> & { supabase: ToolContext['supabase'] }): ToolContext {
  return {
    threadId: 't1',
    mode: '4', // bold → gateMutation auto-passes for this non-hard-limit tool
    episodeId: EP,
    appOrigin: 'http://test',
    recentTurns: [],
    ...overrides,
  } as ToolContext;
}

describe('writeStartNotice.parse', () => {
  test('rejects content shorter than 20 chars', () => {
    expect(() => writeStartNotice.parse(JSON.stringify({ content: 'too short' }))).toThrow();
  });
  test('accepts valid content and optional episodeId', () => {
    const parsed = writeStartNotice.parse(
      JSON.stringify({ episodeId: EP, content: 'a'.repeat(50) }),
    );
    expect(parsed.episodeId).toBe(EP);
    expect(parsed.content.length).toBe(50);
  });
});

describe('writeStartNotice.execute', () => {
  const CONTENT = '# Gag bank\n' + Array.from({ length: 5 }, (_, i) => `${i + 1}. gag`).join('\n');

  test('creates a fresh APPROVED notice when none exists', async () => {
    const res = await writeStartNotice.execute(
      { content: CONTENT },
      ctx({ supabase: makeSb({ existingNotice: null }) }),
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect((res.data as { created?: boolean }).created).toBe(true);
      expect((res.data as { assetId?: string }).assetId).toBe('new-notice-id');
    }
  });

  test('overwrites in place when a notice already exists', async () => {
    const res = await writeStartNotice.execute(
      { content: CONTENT },
      ctx({
        supabase: makeSb({ existingNotice: { id: 'existing-id', version: 1, status: 'APPROVED' } }),
      }),
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect((res.data as { created?: boolean }).created).toBe(false);
      expect((res.data as { assetId?: string }).assetId).toBe('existing-id');
    }
  });

  test('fails cleanly when no episode is in focus', async () => {
    const res = await writeStartNotice.execute(
      { content: CONTENT },
      ctx({ supabase: makeSb({ existingNotice: null }), episodeId: null }),
    );
    expect(res.ok).toBe(false);
  });

  test('blocks in a strict mode without verbal approval', async () => {
    const res = await writeStartNotice.execute(
      { content: CONTENT },
      ctx({ supabase: makeSb({ existingNotice: null }), mode: '1', recentTurns: [] }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('verbal_approval_required');
  });
});
