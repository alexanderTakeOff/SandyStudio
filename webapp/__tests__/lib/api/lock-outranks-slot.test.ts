// Сторож хард-лимита: ЗАМОК ДИРЕКТОРА ВЫШЕ ИНВАРИАНТА СЛОТА.
//
// Очередь Полины п.1 (12.08): у канона серии слот занимает статус LOCKED, поэтому
// постановка новой плиты в APPROVED вытесняла залоченную в INVALIDATED — молча,
// обычной строкой в общем выводе. Так ушла плита d2b6bc15. Инструмент снимал
// замок, который по конституции снимает только Директор.
//
// Тест держит два свойства: без флага — отказ, с флагом — вытеснение состоялось
// (и вызывающий может напечатать его отдельным решением).

import { describe, it, expect } from 'vitest';
import { demoteSiblingApproved, type SlotDescriptor } from '@/lib/api/single-approved';

type Row = { id: string; status: string; file_type: string; filename?: string; metadata?: unknown };

/** Двойник: выборка кандидатов слота + update по каждому. */
function mockSupabase(rows: Row[]) {
  const updates: Array<{ id: string; status: string }> = [];
  const selectBuilder = {
    select: () => selectBuilder,
    eq: () => selectBuilder,
    like: () => selectBuilder,
    neq: () => selectBuilder,
    then: (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null }),
  };
  const updateBuilder = (patch: { status?: string }) => {
    let targetId = '';
    const b = {
      eq: (col: string, value: string) => {
        if (col === 'id') targetId = value;
        return b;
      },
      then: (resolve: (v: unknown) => unknown) => {
        updates.push({ id: targetId, status: patch.status ?? '' });
        return resolve({ error: null });
      },
    };
    return b;
  };
  const client = {
    from: () => ({
      select: selectBuilder.select,
      eq: selectBuilder.eq,
      like: selectBuilder.like,
      neq: selectBuilder.neq,
      then: selectBuilder.then,
      update: (patch: { status?: string }) => updateBuilder(patch),
    }),
  } as never;
  return { client, updates };
}

const SLOT: SlotDescriptor = {
  occupyingStatus: 'LOCKED',
  scopeColumn: 'series_id',
  scopeValue: 'series-1',
  fileTypeLike: 'SBL-character_x',
  matches: () => true,
};

const LOCKED_ROW: Row = {
  id: 'plate-locked',
  status: 'LOCKED',
  file_type: 'SBL-character_x',
  filename: 'SS-S20-SBL-character_x-v02-LOCKED.png',
};

describe('замок Директора выше инварианта слота', () => {
  it('без флага отказывает и НЕ трогает залоченную строку', async () => {
    const { client, updates } = mockSupabase([LOCKED_ROW]);
    await expect(
      demoteSiblingApproved(client, { slot: SLOT, currentId: 'plate-new' }),
    ).rejects.toThrow(/LOCKED/);
    expect(updates).toHaveLength(0);
  });

  it('называет строку в отказе, чтобы Директор понял, что именно снимает', async () => {
    const { client } = mockSupabase([LOCKED_ROW]);
    await expect(
      demoteSiblingApproved(client, { slot: SLOT, currentId: 'plate-new' }),
    ).rejects.toThrow(/SS-S20-SBL-character_x-v02-LOCKED\.png/);
  });

  it('с явным allowUnlock вытесняет — снятие замка это решение, а не побочный эффект', async () => {
    const { client, updates } = mockSupabase([LOCKED_ROW]);
    const demoted = await demoteSiblingApproved(client, {
      slot: SLOT,
      currentId: 'plate-new',
      allowUnlock: true,
    });
    expect(demoted).toEqual([{ id: 'plate-locked', status: 'LOCKED' }]);
    expect(updates).toEqual([{ id: 'plate-locked', status: 'INVALIDATED' }]);
  });

  it('не-залоченного соседа вытесняет как раньше, без всякого флага', async () => {
    const approvedSlot: SlotDescriptor = { ...SLOT, occupyingStatus: 'APPROVED', scopeColumn: 'episode_id' };
    const { client, updates } = mockSupabase([
      { id: 'shot-old', status: 'APPROVED', file_type: 'SBL-character_x' },
    ]);
    const demoted = await demoteSiblingApproved(client, { slot: approvedSlot, currentId: 'shot-new' });
    expect(demoted).toHaveLength(1);
    expect(updates).toEqual([{ id: 'shot-old', status: 'INVALIDATED' }]);
  });
});
