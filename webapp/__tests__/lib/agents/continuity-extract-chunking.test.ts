// F6 (2026-06-12) — chunked extraction. E07: a 38-shot storyboard hit the 8k
// output cap in ONE call → EXTRACTION_FAILED, episode lost the ledger.
// Pins: chunk split, sequential calls with GLOBAL shot ordinals, canonical
// entity-id vocabulary carried into later chunks, merged result.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/providers/anthropic-text', () => {
  class AnthropicTextError extends Error {}
  return {
    AnthropicTextError,
    generateAnthropicText: vi.fn(),
  };
});

import { generateAnthropicText } from '@/lib/providers/anthropic-text';
import {
  runContinuityExtract,
  chunkShots,
  buildUserMessage,
  EXTRACT_CHUNK_SIZE,
} from '@/lib/agents/runners/continuity-extract';
import type { StoryboardShotV2 } from '@/lib/api/vgen-shot-helpers';

const mockedGenerate = vi.mocked(generateAnthropicText);

function makeShots(n: number): StoryboardShotV2[] {
  return Array.from({ length: n }, (_, i) => ({
    shot_id: `SS-S15-E07-A1-SC01-SH${String(i + 1).padStart(2, '0')}`,
    action_prose: `Sandy nudges object_${i + 1}.`,
  })) as unknown as StoryboardShotV2[];
}

function chunkResponse(
  shots: ReadonlyArray<{ shot_id: string }>,
  offset: number,
  entity: string,
) {
  return {
    body: {
      deltas: shots.map((s, i) => ({
        shot_id: s.shot_id,
        shot_index: offset + i,
        entities_introduced: i === 0 ? [entity] : [],
        actions: [
          {
            entity,
            verb: 'nudge',
            agent: 'sandy_hourglass',
            presented_as_first: false,
            state_before: null,
            state_after: 'nudged',
            cause: null,
          },
        ],
      })),
    },
    costUsd: 0.01,
    model: 'claude-haiku-4-5',
    markdown: '',
  };
}

beforeEach(() => {
  mockedGenerate.mockReset();
});

describe('chunkShots', () => {
  it('splits 38 shots into 12+12+12+2 preserving order', () => {
    const chunks = chunkShots(makeShots(38));
    expect(chunks.map((c) => c.length)).toEqual([12, 12, 12, 2]);
    expect(chunks[0][0].shot_id).toContain('SH01');
    expect(chunks[3][1].shot_id).toContain('SH38');
  });

  it('17 shots (≤ 2 chunks) keeps the legacy single-episode scale workable', () => {
    expect(chunkShots(makeShots(12)).length).toBe(1);
    expect(chunkShots(makeShots(17)).length).toBe(2);
  });
});

describe('buildUserMessage — global ordinals + vocabulary block', () => {
  it('numbers shots from the offset and lists known ids', () => {
    const msg = buildUserMessage(makeShots(2), 24, ['lamp_cord', 'desk_main']);
    expect(msg).toContain('24. [SS-S15-E07-A1-SC01-SH01]');
    expect(msg).toContain('25. [SS-S15-E07-A1-SC01-SH02]');
    expect(msg).toContain('lamp_cord, desk_main');
    expect(msg).toContain('Known canonical entity ids');
  });

  it('omits the vocabulary block for the first chunk', () => {
    expect(buildUserMessage(makeShots(1), 0, [])).not.toContain(
      'Known canonical entity ids',
    );
  });
});

describe('runContinuityExtract — chunked merge', () => {
  it('30 shots → 3 sequential calls, merged deltas, vocabulary carried forward', async () => {
    const shots = makeShots(30);
    const calls: string[] = [];
    mockedGenerate.mockImplementation(async (args: { userMessage: string }) => {
      calls.push(args.userMessage);
      const idx = calls.length - 1;
      const offset = idx * EXTRACT_CHUNK_SIZE;
      const size = Math.min(EXTRACT_CHUNK_SIZE, 30 - offset);
      return chunkResponse(
        shots.slice(offset, offset + size),
        offset,
        `entity_chunk_${idx}`,
      ) as never;
    });

    const res = await runContinuityExtract(shots);

    expect(mockedGenerate).toHaveBeenCalledTimes(3);
    expect(res.deltas).toHaveLength(30);
    // Global ordinals survive the merge.
    expect(res.deltas[29].shot_index).toBe(29);
    // Cost is summed across chunks.
    expect(res.costUsd).toBeCloseTo(0.03);
    // Chunk 2 and 3 received the ids minted by earlier chunks.
    expect(calls[1]).toContain('entity_chunk_0');
    expect(calls[2]).toContain('entity_chunk_0');
    expect(calls[2]).toContain('entity_chunk_1');
    // Chunk 1 had no vocabulary block.
    expect(calls[0]).not.toContain('Known canonical entity ids');
  });

  it('single small chunk behaves exactly as before (one call, no vocab block)', async () => {
    const shots = makeShots(5);
    mockedGenerate.mockResolvedValueOnce(chunkResponse(shots, 0, 'anvil') as never);
    const res = await runContinuityExtract(shots);
    expect(mockedGenerate).toHaveBeenCalledTimes(1);
    expect(res.deltas).toHaveLength(5);
    expect(res.droppedEntries).toBe(0);
  });
});
