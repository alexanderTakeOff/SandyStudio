// Сторож правила «кнопка исполняет свежий и машиночитаемый план».
//
// Инцидент E07/SH05 (12.08): панель послала EXEC-EREF на план v01, тогда как
// живой была v02 с правками Директора. Агент упал на разборе JSON — и это была
// удача: распарсив, он отрендерил бы отменённое за деньги, и подмену никто бы не
// заметил. Проверка свежести существовала, но ТОЛЬКО в одном из двух роутов,
// ведущих к одному исполнителю. Тест держит оба свойства общей функции.

import { describe, it, expect } from 'vitest';
import { assertPlanIsFreshAndExecutable } from '@/lib/api/plan-regen-guard';
import { ConflictError } from '@/lib/api/errors';

type PlanRow = {
  id: string;
  version?: number;
  status?: string;
  file_type?: string;
  metadata?: unknown;
  content?: string;
};

/** Двойник: один запрос списка планов эпизода + один точечный по id. */
function mockSupabase(plans: PlanRow[]) {
  const listBuilder = {
    select: () => listBuilder,
    eq: () => listBuilder,
    like: () => listBuilder,
    then: (resolve: (v: unknown) => unknown) => resolve({ data: plans, error: null }),
  };
  let byIdTarget = '';
  const oneBuilder = {
    select: () => oneBuilder,
    eq: (_col: string, value: string) => {
      byIdTarget = value;
      return oneBuilder;
    },
    maybeSingle: async () => ({ data: plans.find((p) => p.id === byIdTarget) ?? null, error: null }),
  };
  let call = 0;
  return {
    from: () => {
      call += 1;
      // Первый заход — список планов шота, второй — точечное чтение содержимого.
      return call === 1 ? listBuilder : oneBuilder;
    },
  } as never;
}

const JSON_PLAN = 'Разбор плана.\n\n```json\n{"prompt":"..."}\n```\n';
const PROSE_PLAN = 'План рефа SH05.\n\nПромпт:\n\n```\nplankton, dim, oranged text\n```\n';

const BASE = { episodeId: 'ep-1', shotId: 'SH05' };

describe('кнопка исполняет только СВЕЖИЙ план', () => {
  it('отказывает, когда у шота есть версия новее переданной', async () => {
    const sb = mockSupabase([
      { id: 'plan-v01', version: 1, status: 'APPROVED', file_type: 'SPC-ref_plan-SH05', content: JSON_PLAN },
      { id: 'plan-v02', version: 2, status: 'APPROVED', file_type: 'SPC-ref_plan-SH05', content: JSON_PLAN },
    ]);
    await expect(
      assertPlanIsFreshAndExecutable({ supabase: sb, ...BASE, planAssetId: 'plan-v01' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('пропускает самую свежую версию', async () => {
    const sb = mockSupabase([
      { id: 'plan-v01', version: 1, status: 'APPROVED', file_type: 'SPC-ref_plan-SH05', content: JSON_PLAN },
      { id: 'plan-v02', version: 2, status: 'APPROVED', file_type: 'SPC-ref_plan-SH05', content: JSON_PLAN },
    ]);
    await expect(
      assertPlanIsFreshAndExecutable({ supabase: sb, ...BASE, planAssetId: 'plan-v02' }),
    ).resolves.toBeUndefined();
  });

  it('не считает INVALIDATED-версию более свежей', async () => {
    const sb = mockSupabase([
      { id: 'plan-v02', version: 2, status: 'APPROVED', file_type: 'SPC-ref_plan-SH05', content: JSON_PLAN },
      { id: 'plan-v03', version: 3, status: 'INVALIDATED', file_type: 'SPC-ref_plan-SH05', content: JSON_PLAN },
    ]);
    await expect(
      assertPlanIsFreshAndExecutable({ supabase: sb, ...BASE, planAssetId: 'plan-v02' }),
    ).resolves.toBeUndefined();
  });
});

describe('кнопка не запускает конвейерного исполнителя на плане, написанном умом', () => {
  it('отказывает внятно, когда в плане нет JSON-контракта', async () => {
    const sb = mockSupabase([
      { id: 'plan-v02', version: 2, status: 'APPROVED', file_type: 'SPC-ref_plan-SH05', content: PROSE_PLAN },
    ]);
    await expect(
      assertPlanIsFreshAndExecutable({ supabase: sb, ...BASE, planAssetId: 'plan-v02' }),
    ).rejects.toThrow(/ДОКУМЕНТ для ума/);
  });
});
