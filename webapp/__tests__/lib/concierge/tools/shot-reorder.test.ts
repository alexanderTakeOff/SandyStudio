// TD-86 — reorderShots PA tool tests.
import { describe, it, expect } from 'vitest';

import { reorderShots } from '@/lib/concierge/tools/shot-reorder';
import type { ToolContext } from '@/lib/concierge/tools/types';

const APPROVAL_TURNS = [
  {
    id: 't1',
    thread_id: 'th',
    role: 'director' as const,
    event_type: 'message' as const,
    content: 'давай',
    metadata: {},
    token_count: null,
    created_at: new Date().toISOString(),
  },
];

function makeStoryboardContent(): string {
  const sb = {
    acts: [
      { act: 1, shots: [{ shot_id: 'SS-S15-E01-A1-SC01-SH01' }] },
      {
        act: 3,
        shots: [
          { shot_id: 'SS-S15-E01-A3-SC10-SH21' },
          { shot_id: 'SS-S15-E01-A3-SC11-SH22' },
        ],
      },
    ],
  };
  return ['# Storyboard', '```json', JSON.stringify(sb, null, 2), '```'].join('\n');
}

function makeAnimaticV1() {
  return {
    animatic_v1: {
      shot_list: [
        { shot_id: 'SS-S15-E01-A1-SC01-SH01' },
        { shot_id: 'SS-S15-E01-A3-SC10-SH21' },
        { shot_id: 'SS-S15-E01-A3-SC11-SH22' },
      ],
    },
  };
}

function mockSupabase(opts: {
  storyboard: { id: string; status: string; content: string };
  animatic: { id: string; status: string; metadata: Record<string, unknown> } | null;
  capture: { stbContent?: string; animMeta?: Record<string, unknown> };
}) {
  return {
    from: (_table: string) => ({
      select: () => ({
        eq: (col: string, val: unknown) => {
          if (col === 'file_type' && val === 'VID-animatic') {
            return {
              order: () =>
                Promise.resolve({
                  data: opts.animatic
                    ? [{ ...opts.animatic, filename: 'anim.md', version: 1, updated_at: '' }]
                    : [],
                  error: null,
                }),
            };
          }
          // episode_id branch — both storyboard (.or) and animatic share this prefix
          return {
            or: () => ({
              order: () =>
                Promise.resolve({
                  data: [
                    {
                      ...opts.storyboard,
                      filename: 'stb.md',
                      version: 4,
                      updated_at: '',
                    },
                  ],
                  error: null,
                }),
            }),
            eq: () => ({
              order: () =>
                Promise.resolve({
                  data: opts.animatic
                    ? [{ ...opts.animatic, filename: 'anim.md', version: 1, updated_at: '' }]
                    : [],
                  error: null,
                }),
            }),
          };
        },
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: () => {
          if (typeof patch.content === 'string') opts.capture.stbContent = patch.content;
          if (patch.metadata && typeof patch.metadata === 'object') {
            opts.capture.animMeta = patch.metadata as Record<string, unknown>;
          }
          return Promise.resolve({ error: null });
        },
      }),
    }),
  } as never;
}

const ctx: ToolContext = {
  supabase: null as never,
  threadId: 't1',
  mode: 1 as never,
  episodeId: 'ep-1',
  appOrigin: 'http://localhost:3000',
};

describe('reorderShots (TD-86)', () => {
  it('swaps two shots in both storyboard and animatic', async () => {
    const capture: { stbContent?: string; animMeta?: Record<string, unknown> } = {};
    const sb = mockSupabase({
      storyboard: { id: 'stb-1', status: 'APPROVED', content: makeStoryboardContent() },
      animatic: { id: 'anim-1', status: 'APPROVED', metadata: makeAnimaticV1() },
      capture,
    });
    const r = await reorderShots.execute(
      { shotIdA: 'SH21', shotIdB: 'SH22' },
      { ...ctx, supabase: sb, recentTurns: APPROVAL_TURNS },
    );
    expect(r.ok).toBe(true);

    // Storyboard: SH22 now first in act 3, SH21 second.
    const stbJson = JSON.parse((capture.stbContent ?? '').match(/```json\s*\n([\s\S]+?)\n```/)![1]);
    expect(stbJson.acts[1].shots[0].shot_id).toContain('SH22');
    expect(stbJson.acts[1].shots[1].shot_id).toContain('SH21');
    expect(stbJson.policy_notes?.[0]).toContain('SH21');

    // Animatic: same swap reflected.
    const v1 = (capture.animMeta as { animatic_v1: { shot_list: Array<{ shot_id: string }> } }).animatic_v1;
    expect(v1.shot_list[1].shot_id).toContain('SH22');
    expect(v1.shot_list[2].shot_id).toContain('SH21');
  });

  it('refuses without verbal approval', async () => {
    const sb = mockSupabase({
      storyboard: { id: 'stb-1', status: 'APPROVED', content: makeStoryboardContent() },
      animatic: { id: 'anim-1', status: 'APPROVED', metadata: makeAnimaticV1() },
      capture: {},
    });
    const r = await reorderShots.execute(
      { shotIdA: 'SH21', shotIdB: 'SH22' },
      { ...ctx, supabase: sb, recentTurns: [] },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('verbal_approval_required');
  });

  it('refuses when shot not found', async () => {
    const sb = mockSupabase({
      storyboard: { id: 'stb-1', status: 'APPROVED', content: makeStoryboardContent() },
      animatic: { id: 'anim-1', status: 'APPROVED', metadata: makeAnimaticV1() },
      capture: {},
    });
    const r = await reorderShots.execute(
      { shotIdA: 'SH21', shotIdB: 'SH99' },
      { ...ctx, supabase: sb, recentTurns: APPROVAL_TURNS },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('shot_not_found');
  });
});
