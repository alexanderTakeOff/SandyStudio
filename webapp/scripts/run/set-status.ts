// СТАТУС изделия — поле строки, а не надпись в теле (B12).
//
// 07.08 Полина, которой велели вывести три негодные плиты канона из оборота, предложила
// написать `STATUS: INVALIDATED` шапкой в ТЕКСТ: инструмента на статус у неё нет вовсе.
// Это подделка — студия, лента и гейты читают поле `assets.status`, и снаружи получилась бы
// плита, которая говорит «я недействительна», оставаясь действительной. Отсутствующий
// инструмент, а не ошибка исполнителя.
//
// Инвариант «один утверждённый на слот» соблюдается тем же кодом, что и в маршруте аппрува
// (`demoteSiblingApproved`): при повышении до APPROVED прежний утверждённый уходит в
// INVALIDATED с пометкой, ЧЕМ он вытеснен. Не `REJECTED` — он не бракован, он проиграл.
//
// LOCK здесь НЕ ставится: это хард-лимит Директора наравне с публикацией, бюджетом и сменой
// режима. Инструмент, умеющий LOCK, стирает границу, ради которой она заведена.
// Контракт: `--help`.
import { defineTool } from './_tool';
import { sb } from './_env';
import { demoteSiblingApproved, resolveSlotDescriptor } from '../../lib/api/single-approved';

const SETTABLE = ['DRAFT', 'REVIEW', 'REVISION', 'APPROVED', 'INVALIDATED', 'NEEDS_HUMAN_TWEAK'] as const;

/** Имя файла несёт статус по конвенции — но не всякий: CHECK знает только пять. */
const IN_FILENAME = new Set(['DRAFT', 'REVIEW', 'REVISION', 'APPROVED', 'LOCKED']);

export default defineTool(
  {
    name: 'set-status',
    summary: 'Меняет статус изделия и держит инвариант «один утверждённый на слот». LOCK не ставит — он за Директором.',
    args: {
      id: { about: 'uuid строки ассета' },
      status: { about: 'новый статус', values: [...SETTABLE] },
      reason: { about: 'почему; попадает в метаданные и читается потом', default: '' },
    },
    reads: ['assets'],
    writes: ['assets'],
  },
  async ({ arg }) => {
    const id = arg('id');
    const status = arg('status');

    const { data: asset, error } = await sb
      .from('assets')
      .select('id,filename,file_type,status,episode_id,series_id,metadata')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`чтение ассета: ${error.message}`);
    if (!asset) throw new Error(`ассета ${id} нет`);
    if (asset.status === 'LOCKED') {
      throw new Error(`${asset.filename} — LOCKED. Замок снимает только Директор; создай новую версию.`);
    }

    // Повышение до утверждённого вытесняет прежнего в том же слоте — тем же кодом, что и
    // маршрут аппрува, чтобы инвариант имел ОДИН источник, а не два расходящихся.
    if (status === 'APPROVED') {
      const slot = resolveSlotDescriptor(asset as never);
      if (slot) {
        const demoted = await demoteSiblingApproved(sb as never, { slot, currentId: id });
        for (const d of demoted) console.log(`вытеснен: ${d.id} (${d.status} → INVALIDATED)`);
      }
    }

    // Имя файла несёт статус только для тех пяти, что знает CHECK `assets_filename_format`.
    // INVALIDATED живёт исключительно в поле — это выяснилось отказом вставки 07.08.
    const filename = IN_FILENAME.has(status)
      ? asset.filename.replace(/-(DRAFT|REVIEW|REVISION|APPROVED|LOCKED)(\.[a-z0-9]+)$/i, `-${status}$2`)
      : asset.filename;

    const meta = { ...(asset.metadata as Record<string, unknown> | null ?? {}) };
    if (arg('reason')) {
      meta.status_history = [
        ...((meta.status_history as unknown[]) ?? []),
        { from: asset.status, to: status, reason: arg('reason'), by: 'DIRECT-RUN' },
      ];
    }

    const { error: upErr } = await sb
      .from('assets')
      .update({ status, filename, metadata: meta })
      .eq('id', id);
    if (upErr) throw new Error(`смена статуса: ${upErr.message}`);

    console.log(`${asset.filename} · ${asset.status} → ${status}`);
    if (filename !== asset.filename) console.log(`имя приведено к статусу: ${filename}`);
  },
);
