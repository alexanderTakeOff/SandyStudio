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

describe('screenwriter buildUserMessage — SHORTS delivery + runtime target', () => {
  test('shorts at a short runtime → vertical block + single-punch + explicit seconds', () => {
    const msg = buildUserMessage({ ...BASE, shortsIsTarget: true, runtimeTargetSeconds: 30 });
    expect(msg).toContain('SHORTS DELIVERY IS ACTIVE');
    expect(msg).toContain('~30 seconds');
    expect(msg).toContain('ONE self-contained gag arc'); // ≤40 single-punch variant
    expect(msg).toContain('runtime_target_seconds` to exactly 30');
    // No more hard-coded 15–40 band.
    expect(msg).not.toContain('MUST be between 15 and 40');
    expect(msg).toContain('<brief>');
  });

  test('Director-set 60 on a shorts episode wins — chain variant, not single-punch band', () => {
    const msg = buildUserMessage({ ...BASE, shortsIsTarget: true, runtimeTargetSeconds: 60 });
    expect(msg).toContain('SHORTS DELIVERY IS ACTIVE');
    expect(msg).toContain('~60 seconds');
    expect(msg).toContain('chain several escalating gags');
    expect(msg).toContain('runtime_target_seconds` to exactly 60');
  });

  test('long-form (landscape) → no shorts block, explicit Target runtime block', () => {
    const msg = buildUserMessage({ ...BASE, shortsIsTarget: false, runtimeTargetSeconds: 60 });
    expect(msg).not.toContain('SHORTS DELIVERY IS ACTIVE');
    expect(msg).toContain('## Target runtime');
    expect(msg).toContain('~60 seconds');
    expect(msg).toContain('<brief>');
  });

  test('defaults to long-form 60 when both flags unset', () => {
    const msg = buildUserMessage({ ...BASE });
    expect(msg).not.toContain('SHORTS DELIVERY IS ACTIVE');
    expect(msg).toContain('~60 seconds');
  });
});
