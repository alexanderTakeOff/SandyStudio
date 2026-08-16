// Заводит изделие эпизода в студию вручную: кадр, клип, финальный кат или музыку.
// Тонкая обёртка над `registerEpisodeMedia` — ту же функцию зовут сами генераторы
// сразу после записи файла, поэтому для НОВОГО материала этот инструмент не
// нужен. Он остаётся для того, что уже лежит на диске, и для починки следа.
// Contract: `--help`.
//
// WHY (2026-08-05): E35, E36 и E37 произвели 195 кадров и 87 клипов, из которых
// студия не увидела ни одного — строку `assets` заводил ровно один инструмент из
// семи. Стадия определяется ПРЕФИКСОМ `file_type`, а лента связывает ячейку
// через `shot_id`; ошибись в любом — изделие для конвейера не существует.
import { defineTool } from './_tool';
import { registerEpisodeMedia, type MediaKind } from './_asset';

export default defineTool(
  {
    name: 'register-media',
    summary: 'Заводит кадр, клип, кат или музыку эпизода в студию — с типом и метаданными, которые читает лента.',
    args: {
      file: { about: 'исходный файл — PNG для кадра и обложки, MP4 для клипа и ката, аудио для музыки' },
      kind: { about: 'что заводим', values: ['frame', 'clip', 'cut', 'music', 'thumb'] },
      shot: { about: 'номер кадра, `sh01`; для `cut`, `music` и `thumb` не нужен', default: '' },
      // Ф1: версия ВЫЧИСЛЯЕТСЯ (max+1 по file_type) — заданная руками версия
      // затирала историю (D88). Статус рождения — REVIEW: изделие предъявляется.
      status: { about: 'статус ассета', default: 'REVIEW', values: ['DRAFT', 'REVIEW', 'APPROVED'] },
      desc: { about: 'описание — что это и откуда', default: '' },
    },
    env: { RUN_EPISODE_ID: { about: 'эпизод, которому принадлежит изделие' } },
    reads: ['episodes', 'assets'],
    writes: ['assets'],
    // Ручной след для готового изделия — кадр, клип, кат, музыка. Генераторы
    // оставляют его сами; этот нужен, когда файл произведён иначе (в т.ч. музыка,
    // залитая Директором).
    stations: ['episode_references', 'visual_generator', 'final_cut', 'music_generator', 'thumbnail_creator'],
  },
  async ({ arg, env }) => {
    const res = await registerEpisodeMedia({
      episodeId: env('RUN_EPISODE_ID'),
      kind: arg('kind') as MediaKind,
      file: arg('file'),
      shot: arg('shot'),
      status: arg('status'),
      description: arg('desc') || undefined,
      origin: 'direct-run register-media',
    });

    console.log('СОЗДАНА', `${res.id} · ${res.filename}`);
  },
);
