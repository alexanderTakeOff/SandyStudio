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
  test('shorts at a short runtime → vertical block + one through-line + explicit seconds', () => {
    const msg = buildUserMessage({ ...BASE, shortsIsTarget: true, runtimeTargetSeconds: 30 });
    expect(msg).toContain('SHORTS DELIVERY IS ACTIVE');
    expect(msg).toContain('~30 seconds');
    // 2026-08-06 — «ONE self-contained gag arc» читалось как «один гэг на ролик»
    // и давало разреженные 35 секунд. Линия одна, гэгов — по числу кадров.
    expect(msg).toContain('ONE through-line');
    expect(msg).toContain('NOT a single gag');
    expect(msg).toContain('runtime_target_seconds` to exactly 30');
    // No more hard-coded 15–40 band.
    expect(msg).not.toContain('MUST be between 15 and 40');
    expect(msg).toContain('<brief>');
  });

  test('hook carries TWO numbers: movement by second 1, setup by second 2', () => {
    // Три файла называли три разных числа (0–1 · 1–2 · 0–3). Они мерили разное;
    // сведено к двум, каждое со своим предметом (решение Директора 25).
    const msg = buildUserMessage({ ...BASE, shortsIsTarget: true, runtimeTargetSeconds: 30 });
    expect(msg).toContain('movement must read by second 1');
    expect(msg).toContain('setup must be understood by second 2');
  });

  test('gag plan line reaches the Writer verbatim when supplied', () => {
    const msg = buildUserMessage({
      ...BASE,
      shortsIsTarget: true,
      runtimeTargetSeconds: 30,
      gagPlanLine: 'GAG DENSITY (hard, from the episode passport): ~10 shots of ~3s',
    });
    expect(msg).toContain('GAG DENSITY (hard, from the episode passport): ~10 shots of ~3s');
  });

  test('Director-set 60 on a shorts episode wins — runtime is authoritative', () => {
    const msg = buildUserMessage({ ...BASE, shortsIsTarget: true, runtimeTargetSeconds: 60 });
    expect(msg).toContain('SHORTS DELIVERY IS ACTIVE');
    expect(msg).toContain('~60 seconds');
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
