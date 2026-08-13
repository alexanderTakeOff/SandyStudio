// Сторож ЗАКОНА ДОСТАВКИ: файл, который едет на канал, обязан нести индекс
// `moov` впереди медиаданных (`+faststart`).
//
// Чем оплачен этот тест. Закон жил в четырёх сборщиках копиями. Инструмент
// прямого прогона (`scripts/run/stitch.ts`) собрал свой список флагов вывода и
// потерял `+faststart` — при том, что список склейки и список звука он честно
// брал из общего модуля. С 01.08 по 13.08 каты выходили с `moov` в конце файла;
// YouTube их принимал, помечал `nonStreamableMov`, и Shorts-полка не раздала НИ
// ОДИН: пять роликов по 0–11 просмотров против 700–1500 у собранных агентским
// сборщиком. Одиннадцать дней дефект был невидим, потому что никто не спрашивал
// готовый файл, годен ли он.
//
// Старые тесты `+faststart` проверяли — но только у двух сборщиков из четырёх.
// Сторож, который покрывает не все пути, ловит ровно те, где ошибки и не было.
// Поэтому здесь проверяется ИСХОДНИК каждого производителя: свой `-movflags`
// означает, что закон снова разошёлся с общим.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DELIVERY_MUX_ARGS,
  readTopLevelAtoms,
  assertStreamableDelivery,
  buildFfmpegArgs,
} from '../../lib/providers/ffmpeg-stitch';
import { buildShortArgs } from '../../lib/providers/ffmpeg-shorts';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

/** Каждый файл, который производит видео НА ДОСТАВКУ. Список растёт вместе со студией. */
const PRODUCERS = [
  'lib/providers/ffmpeg-stitch.ts',
  'lib/providers/ffmpeg-shorts.ts',
  'scripts/run/stitch.ts',
];

describe('закон доставки живёт в одном месте', () => {
  it('содержит +faststart — единственный флаг, от которого зависит раздача в ленте', () => {
    const i = DELIVERY_MUX_ARGS.indexOf('-movflags');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(DELIVERY_MUX_ARGS[i + 1]).toBe('+faststart');
  });

  it('ни один сборщик не держит свою копию флагов вывода', () => {
    for (const rel of PRODUCERS) {
      const source = readFileSync(resolve(process.cwd(), rel), 'utf-8');
      // Строки-аргументы в коде: `'-movflags'`. Единственное разрешённое место —
      // сама константа в ffmpeg-stitch.ts.
      const ownFlag = source.match(/['"]-movflags['"]/g) ?? [];
      const allowed = rel.endsWith('ffmpeg-stitch.ts') ? 1 : 0;
      expect(
        ownFlag.length,
        `${rel} собирает свой -movflags вместо DELIVERY_MUX_ARGS — закон снова раздвоился`,
      ).toBe(allowed);
      if (allowed === 0) {
        expect(source, `${rel} не берёт DELIVERY_MUX_ARGS`).toContain('DELIVERY_MUX_ARGS');
      }
    }
  });

  it('каждый сборщик зовёт приёмку выходного файла', () => {
    for (const rel of PRODUCERS) {
      const source = readFileSync(resolve(process.cwd(), rel), 'utf-8');
      expect(
        source,
        `${rel} не проверяет готовый файл — негодный кат уедет на канал молча`,
      ).toContain('assertStreamableDelivery');
    }
  });

  it('оба чистых билдера аргументов доносят закон до argv', () => {
    const stitch = buildFfmpegArgs({ listPath: 'l.txt', outPath: 'o.mp4', musicPath: null });
    const short = buildShortArgs('in.mp4', 'out.mp4');
    for (const args of [stitch, short]) {
      const i = args.indexOf('-movflags');
      expect(args[i + 1]).toBe('+faststart');
    }
  });
});

/** Собрать минимальный ISO-BMFF с заданным порядком верхнеуровневых атомов. */
function fakeMp4(atomOrder: readonly string[]): Buffer {
  const boxes = atomOrder.map((type) => {
    const payload = Buffer.alloc(8); // непустое тело, чтобы обход шёл по длинам
    const box = Buffer.alloc(8 + payload.length);
    box.writeUInt32BE(box.length, 0);
    box.write(type, 4, 'latin1');
    payload.copy(box, 8);
    return box;
  });
  return Buffer.concat(boxes);
}

describe('приёмка выходного файла', () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'delivery-law-'));

  it('читает порядок верхнеуровневых атомов', async () => {
    const file = resolve(dir, 'good.mp4');
    writeFileSync(file, fakeMp4(['ftyp', 'moov', 'free', 'mdat']));
    expect(await readTopLevelAtoms(file)).toEqual(['ftyp', 'moov', 'free', 'mdat']);
  });

  it('пропускает файл с moov впереди — такой лента раздаёт', async () => {
    const file = resolve(dir, 'streamable.mp4');
    writeFileSync(file, fakeMp4(['ftyp', 'moov', 'free', 'mdat']));
    await expect(assertStreamableDelivery(file)).resolves.toBeUndefined();
  });

  it('ГРОМКО отказывает при moov в конце — ровно форма пяти мёртвых роликов', async () => {
    const file = resolve(dir, 'broken.mp4');
    writeFileSync(file, fakeMp4(['ftyp', 'free', 'mdat', 'moov']));
    await expect(assertStreamableDelivery(file)).rejects.toThrow(/nonStreamableMov/);
  });
});
