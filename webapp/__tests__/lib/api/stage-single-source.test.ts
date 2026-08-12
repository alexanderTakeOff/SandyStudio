// Стадия — ОДИН источник (архитектура новой парадигмы, строка 4-5).
//
// Источников стадии сегодня формально два: ассет по префиксу `file_type` и задание по
// `agent_id`. Второй временный — он уходит в Ф6 вместе с `jobs`. Пока оба живы, они обязаны
// НЕ РАСХОДИТЬСЯ, иначе повторяется ровно та болезнь, что уже стоила круга на гейтах:
// два списка требований к одной стадии, и второй тихо врёт.
//
// Проверяется два утверждения, и оба падают громко:
//   1. Карта агентов не изобретает стадий, которых не знает карта ассетов.
//   2. Витрина говорит правду БЕЗ заданий — то есть путь единого разума, который строк
//      `jobs` не создаёт вовсе, красится так же, как путь конвейера.

import { describe, it, expect } from 'vitest';
import {
  STAGE_FROM_AGENT,
  buildPipelineSnapshot,
  type PipelineStageId,
} from '@/lib/api/pipeline-stages';

/** Ассет прямого вызова: ни `agent_id` конвейера, ни строки `jobs` за ним нет. */
function assetOf(file_type: string, status = 'APPROVED') {
  return {
    id: `a-${file_type}`,
    filename: `SS-S20-E02-${file_type}-v01-${status}.md`,
    file_type,
    status,
    agent_id: null,
    created_at: '2026-08-07T00:00:00.000Z',
  };
}

describe('стадия выводится из ассета, задания только дополняют', () => {
  it('карта агентов не изобретает стадий, которых не знает витрина', () => {
    const rows = new Set<PipelineStageId>(
      buildPipelineSnapshot('DRAFT', []).map((r) => r.id),
    );
    const invented = [...new Set(Object.values(STAGE_FROM_AGENT))].filter((s) => !rows.has(s));
    expect(invented).toEqual([]);
  });

  it('изделие единого разума красит стадию БЕЗ единой строки jobs', () => {
    const snapshot = buildPipelineSnapshot('DRAFT', [
      assetOf('SPC-brief'),
      assetOf('SCR-script'),
      assetOf('STB-storyboard'),
      assetOf('VID-final_cut'),
    ]);
    const state = (id: PipelineStageId) => snapshot.find((r) => r.id === id)?.state;

    expect(state('brief')).toBe('approved');
    expect(state('screenwriter')).toBe('approved');
    expect(state('storyboarder')).toBe('approved');
    expect(state('final_cut')).toBe('approved');
    // Стадия, для которой изделия нет, остаётся idle — а не «running» по чужому заданию.
    expect(state('publisher')).toBe('idle');
  });

  it('покадровый счётчик считает ЯЧЕЙКИ, а не задания', () => {
    const shots = ['sh01', 'sh02', 'sh03'];
    const snapshot = buildPipelineSnapshot(
      'DRAFT',
      shots.slice(0, 2).map((s) => assetOf(`VID-shot-s20-e02-${s}`)),
      [],
      null,
      shots.length,
    );
    const vgen = snapshot.find((r) => r.id === 'visual_generator');
    expect(vgen?.progress).toEqual({ done: 2, total: 3 });
    expect(vgen?.state).toBe('running');
  });
});
