/**
 * Разбор реплики на ТАКТЫ для синтеза речи.
 *
 * Дуга собирается кусками: одна фраза = один вызов TTS с одними параметрами,
 * поэтому ровный голос — не свойство клона, а отсутствие дуги (опыт O13, 25.08).
 * Такты делятся `|`; `@` после текста задаёт скорость и громкость такта:
 * `текст@0.92` или `текст@0.92:1.05`.
 *
 * Живёт в `lib`, а не в инструменте: чистую функцию надо уметь проверить, не
 * запуская каркас CLI.
 */
export interface SpeechBeat {
  readonly text: string;
  readonly speed: number;
  readonly vol: number;
}

export function parseBeats(line: string, defaultSpeed: number): SpeechBeat[] {
  return line
    .split('|')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const at = chunk.lastIndexOf('@');
      if (at < 0) return { text: chunk, speed: defaultSpeed, vol: 1 };
      const [rawSpeed, rawVol] = chunk.slice(at + 1).trim().split(':');
      const speed = Number(rawSpeed);
      // Мусор после `@` не должен ронять ТЕКСТ: реплика важнее параметра.
      if (!Number.isFinite(speed)) return { text: chunk, speed: defaultSpeed, vol: 1 };
      const vol = rawVol === undefined ? 1 : Number(rawVol);
      return { text: chunk.slice(0, at).trim(), speed, vol: Number.isFinite(vol) ? vol : 1 };
    });
}
