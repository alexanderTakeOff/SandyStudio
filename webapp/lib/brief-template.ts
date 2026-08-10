// ──────────────────────────────────────────────────────────────────────────────
// lib/brief-template.ts
// Каркас брифа эпизода из полей модалки создания.
//
// До 2026-08-10 здесь жил ещё и генератор на Haiku 4.5: он синхронно вызывался
// в POST /api/episodes и ПЕРЕЗАПИСЫВАЛ содержимое брифа своим сочинением. На
// входе у него был только premise — предыдущих эпизодов серии он не видел,
// поэтому указание Директора «возьми из предыдущей версии Зрачка» превратилось
// в выдуманное психологическое откровение вместо батискафа внутри радужки
// (SS-S20-E06). Убран целиком: маленькие агенты исключены как класс, бриф
// пишет ум по словам Директора.
//
// Здесь остаётся ровно одно: положить слова Директора ДОСЛОВНО в структуру,
// которую дальше дописывает ум.
// ──────────────────────────────────────────────────────────────────────────────

export interface BriefInput {
  episodeCode: string; // например "SS-S01-E05"
  episodeTitle?: string | null;
  premise: string;
  runtimeSeconds?: number | null;
  seriesContext?: { code: string; title: string };
}

export function buildBriefTemplate(input: BriefInput): string {
  const titleLine = input.episodeTitle
    ? `${input.episodeCode} — «${input.episodeTitle}»`
    : input.episodeCode;
  const seriesLine = input.seriesContext
    ? `${input.seriesContext.code} — ${input.seriesContext.title}`
    : '_(серия не указана)_';

  return [
    `# SPC-brief — ${titleLine}`,
    '',
    '## Указание Директора (дословно, из модалки создания эпизода)',
    '',
    input.premise,
    '',
    '## Серия',
    seriesLine,
    '',
    '## Хронометраж',
    input.runtimeSeconds
      ? `${input.runtimeSeconds} секунд`
      : '_(не задан — умолчание формата)_',
    '',
    '---',
    '',
    '_Это каркас. Бриф по этому указанию пишет ум — новой версией ассета._',
  ].join('\n');
}
