// Shorts-awareness (2026-07-15): when the episode's delivery_targets include a
// 9:16 vertical surface the Writer switches to a single-punch short structure.
// The gate flag is threaded via buildUserMessage({ shortsIsTarget }); this test
// exercises the pure prompt builder (no LLM), mirroring the start-notice test.
import { describe, expect, test } from 'vitest';
import { buildUserMessage } from '@/lib/agents/runners/screenwriter';
import type { SeriesBibleCanon } from '@/lib/agents/bible-loader';

const EMPTY_BIBLE: SeriesBibleCanon = {
  series_id: null,
  general_idea: null,
  characters: [],
  locations: [],
  styles: [],
  total_entries: 0,
};

const BASE = {
  episodeCode: 'SS-S15-E29',
  episodeTitle: 'Светский раут',
  briefContent: '# Brief\n## Key beats\n- beat one\n- beat two',
  bible: EMPTY_BIBLE,
};

describe('screenwriter buildUserMessage — SHORTS delivery', () => {
  test('injects the single-punch short block + runtime rule when shortsIsTarget', () => {
    const msg = buildUserMessage({ ...BASE, shortsIsTarget: true });
    expect(msg).toContain('SHORTS DELIVERY IS ACTIVE');
    expect(msg).toContain('single');
    expect(msg).toContain('15–40'); // target runtime window
    // The hard-rule variant is present too.
    expect(msg).toContain('`runtime_target_seconds` MUST be between 15 and 40');
    // Brief still the spine.
    expect(msg).toContain('<brief>');
  });

  test('omits the shorts block entirely for a long-form (landscape) episode', () => {
    const msg = buildUserMessage({ ...BASE, shortsIsTarget: false });
    expect(msg).not.toContain('SHORTS DELIVERY IS ACTIVE');
    expect(msg).not.toContain('MUST be between 15 and 40');
    expect(msg).toContain('<brief>'); // backward-compatible
  });

  test('defaults to long-form when the flag is unset', () => {
    const msg = buildUserMessage({ ...BASE });
    expect(msg).not.toContain('SHORTS DELIVERY IS ACTIVE');
  });
});
