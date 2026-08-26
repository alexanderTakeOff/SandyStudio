// Экзаменатор готового клипа: меряет то, что глаз проверить НЕ МОЖЕТ, и судит по
// порогам листа приёмки. Заведён 26.08, когда выяснилось, что все линейки прогона
// были одноразовыми скриптами — мерил только автор и только руками, а Директору
// уходил доклад «движение есть», опровергнутый первым же замером.
//
// ПОЧЕМУ ЧИСЛОМ. Между двумя стоп-кадрами глаз видит различие и достраивает
// движение, которого нет: 25.08 так родился ложный доклад о ходе фона. Слова
// «ходит», «покачивается», «слышно» в приёмке обязаны иметь рядом замер.
//
// Contract: `--help`.
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { defineTool } from './_tool';
import { probeDurationSeconds, runFfprobe, runFfmpeg } from '../../lib/providers/ffmpeg-stitch';
import { sampleVideoFrames } from '../../lib/sample-frames';

/** Кадров на замер движения. Меньше восьми — шум кодека забивает сигнал. */
const MOTION_FRAMES = 12;
/**
 * Частота выборки для морганий: моргание длится 0,1–0,2 с и между кадрами
 * проваливается. Ширина кадра для этой выборки — 640 px: на 240 px полоса глаз
 * вырождается в десяток пикселей и детектор считает шум, а не веки (эталон
 * «моргает мало» давал 35 в минуту вместо 7).
 */
const BLINK_FPS = 12;
/** Ниже этой амплитуды фона отношение торс/фон — шум, а не признак. */
const MIN_BACKGROUND_AMPLITUDE = 15;
/**
 * Разброс яркости внутри строки, ниже которого строка считается ЗАЛИВКОЙ.
 * Откалибровано по эталонам: при допуске 12 детектор принимал за служебную
 * полосу пасмурное НЕБО (68 px на живом эталоне). У заливки разброса нет вовсе,
 * у неба есть градиент и шум кодека.
 */
const UNIFORM_TOLERANCE = 4;
/** Полоса тоньше этого — артефакт кодека по кромке, а не долив аспекта. */
const MIN_BAND_PX = 3;
/**
 * Выше этого движения лица детектор морганий перестаёт их отделять: он ловит
 * всплески в полосе глаз, а при повороте головы или смазе всплеск даёт САМА
 * голова. На эталоне-карусели насчитал 59 морганий в минуту — вердикт по такой
 * линейке был бы выдумкой, поэтому выше порога она печатается без вердикта.
 */
const BLINK_FACE_MOTION_LIMIT = 20;
/** Пики ближе этого — закрытие и открытие ОДНОГО моргания, а не два события. */
const BLINK_PAIR_GAP = 4;

interface Region {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** Области заданы ДОЛЯМИ кадра: клипы приходят в разных размерах. */
function regionsFor(w: number, h: number): Record<string, Region> {
  return {
    background: { left: 0, top: 0, width: Math.round(w * 0.25), height: Math.round(h * 0.25) },
    face: { left: Math.round(w * 0.33), top: Math.round(h * 0.15), width: Math.round(w * 0.34), height: Math.round(h * 0.26) },
    torso: { left: Math.round(w * 0.28), top: Math.round(h * 0.55), width: Math.round(w * 0.44), height: Math.round(h * 0.30) },
    eyes: { left: Math.round(w * 0.36), top: Math.round(h * 0.20), width: Math.round(w * 0.28), height: Math.round(h * 0.07) },
  };
}

/** Средняя абсолютная разница яркости — сколько пикселей поменялось между кадрами. */
function meanAbsDiff(a: Uint8Array, b: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

async function greyRegion(png: Buffer, region: Region): Promise<Uint8Array> {
  return new Uint8Array(await sharp(png).extract(region).greyscale().raw().toBuffer());
}

async function frameSize(png: Buffer): Promise<{ w: number; h: number }> {
  const meta = await sharp(png).metadata();
  return { w: meta.width ?? 0, h: meta.height ?? 0 };
}

/** Средняя разница между соседними кадрами по одной области. */
async function motionIn(frames: readonly Buffer[], region: Region): Promise<number> {
  const bufs: Uint8Array[] = [];
  for (const f of frames) bufs.push(await greyRegion(f, region));
  const diffs: number[] = [];
  for (let i = 1; i < bufs.length; i += 1) diffs.push(meanAbsDiff(bufs[i - 1], bufs[i]));
  return diffs.reduce((x, y) => x + y, 0) / Math.max(1, diffs.length);
}

/**
 * Моргания: всплески в полосе глаз выше 2σ. Считается по частой выборке, иначе
 * моргание проваливается между кадрами и клип выглядит немигающим.
 */
async function countBlinks(file: string, durationSec: number): Promise<number> {
  const dir = mkdtempSync(join(tmpdir(), 'ss-blink-'));
  try {
    await runFfmpeg(['-v', 'error', '-y', '-i', file, '-vf', `fps=${BLINK_FPS},scale=640:-1`, join(dir, 'f%04d.png')]);
    const { readdirSync } = await import('node:fs');
    const files = readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
    if (files.length < 4) return 0;
    const first = readFileSync(join(dir, files[0]));
    const { w, h } = await frameSize(first);
    const eyes = regionsFor(w, h).eyes;
    const bufs: Uint8Array[] = [];
    for (const f of files) bufs.push(await greyRegion(readFileSync(join(dir, f)), eyes));
    const diffs: number[] = [];
    for (let i = 1; i < bufs.length; i += 1) diffs.push(meanAbsDiff(bufs[i - 1], bufs[i]));
    const avg = diffs.reduce((x, y) => x + y, 0) / diffs.length;
    const sd = Math.sqrt(diffs.reduce((s, x) => s + (x - avg) ** 2, 0) / diffs.length);
    const threshold = avg + 2 * sd;
    // ОДНО моргание даёт ДВА всплеска — закрытие века и открытие. Считая пики
    // поштучно, счёт удваивается: эталон «моргает мало» давал 17 в минуту при
    // семи настоящих. Пики, отстоящие меньше чем на BLINK_PAIR_GAP кадров,
    // склеиваются в одно событие.
    const peakFrames: number[] = [];
    for (let i = 1; i < diffs.length - 1; i += 1) {
      if (diffs[i] > threshold && diffs[i] >= diffs[i - 1] && diffs[i] >= diffs[i + 1]) peakFrames.push(i);
    }
    let blinks = 0;
    let lastPeak = -BLINK_PAIR_GAP * 2;
    for (const f of peakFrames) {
      if (f - lastPeak > BLINK_PAIR_GAP) blinks += 1;
      lastPeak = f;
    }
    return durationSec > 0 ? (blinks / durationSec) * 60 : 0;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Средний и пиковый уровень. `volumedetect` пишет в stderr — его и возвращает обёртка. */
async function loudness(file: string, downmixToMono: boolean): Promise<{ mean: number; max: number } | null> {
  const filter = downmixToMono ? 'pan=mono|c0=0.5*c0+0.5*c1,volumedetect' : 'volumedetect';
  const out = await runFfmpeg(['-hide_banner', '-nostats', '-i', file, '-af', filter, '-f', 'null', '-']);
  const mean = /mean_volume:\s*(-?[\d.]+) dB/.exec(out);
  const max = /max_volume:\s*(-?[\d.]+) dB/.exec(out);
  if (!mean || !max) return null;
  return { mean: Number(mean[1]), max: Number(max[1]) };
}

/**
 * Служебная полоса — однородные строки у края кадра. Всё, что подмешано в
 * референс ради формата, модель считает частью кадра и воспроизводит: 25.08
 * долив аспекта оставил в готовых клипах серое поле над головой.
 */
async function uniformBandTop(png: Buffer): Promise<number> {
  const { w, h } = await frameSize(png);
  const raw = new Uint8Array(await sharp(png).greyscale().raw().toBuffer());
  for (let y = 0; y < h; y += 1) {
    let min = 255;
    let max = 0;
    for (let x = 0; x < w; x += 1) {
      const v = raw[y * w + x];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (max - min > UNIFORM_TOLERANCE) return y;
  }
  return h;
}

interface Line {
  readonly name: string;
  readonly value: string;
  readonly expect: string;
  readonly verdict: 'ПРИНЯТО' | 'БРАК' | '—';
}

export default defineTool(
  {
    name: 'measure-clip',
    summary: 'Экзаменует готовый клип числом: ход камеры, живость лица, звук, служебные полосы. Судит по порогам листа приёмки.',
    args: {
      file: { about: 'путь к клипу — абсолютный или от корня `webapp/`' },
      type: {
        about: 'тип кадра: `selfie` — камера в руке, фон обязан ходить; `poster` — камера стоит, это норма; `none` — только числа, без вердикта',
        default: 'none',
        values: ['selfie', 'poster', 'none'],
      },
      json: { about: 'печатать машиночитаемый JSON вместо таблицы', default: 'no', values: ['yes', 'no'] },
    },
    reads: [],
    writes: [],
    // Сквозной: судит изделие любой станции, своей не имеет.
    stations: [],
  },
  async ({ arg }) => {
    const file = arg('file');
    const type = arg('type');
    const wantJson = arg('json') === 'yes';

    const duration = await probeDurationSeconds(file);
    if (duration === null) throw new Error(`не прочитал клип: ${file}`);

    const frames = (await sampleVideoFrames(file, { frames: MOTION_FRAMES, width: 512 })).map((b64) =>
      Buffer.from(b64, 'base64'),
    );
    if (frames.length < 4) throw new Error(`из клипа вышло ${frames.length} кадров — слишком мало для замера`);

    const { w, h } = await frameSize(frames[0]);
    const regions = regionsFor(w, h);
    const background = await motionIn(frames, regions.background);
    const face = await motionIn(frames, regions.face);
    const torso = await motionIn(frames, regions.torso);
    const bgOverFace = face > 0 ? background / face : 0;
    const torsoOverBg = background > 0 ? torso / background : 0;

    const blinksPerMinute = await countBlinks(file, duration);
    const band = await uniformBandTop(frames[0]);

    const audioDurationRaw = await runFfprobe([
      '-v', 'error', '-select_streams', 'a:0',
      '-show_entries', 'stream=duration', '-of', 'csv=p=0', file,
    ]);
    const audioDuration = audioDurationRaw ? Number(audioDurationRaw.trim()) : null;
    const stereo = await loudness(file, false);
    const mono = audioDuration !== null ? await loudness(file, true) : null;

    const measured = {
      file,
      type,
      durationSeconds: duration,
      width: w,
      height: h,
      backgroundMotion: background,
      faceMotion: face,
      torsoMotion: torso,
      bgOverFace,
      torsoOverBg,
      blinksPerMinute,
      uniformBandTopPx: band,
      audioDurationSeconds: audioDuration,
      loudnessMeanDb: stereo?.mean ?? null,
      loudnessMaxDb: stereo?.max ?? null,
      monoDownmixMeanDb: mono?.mean ?? null,
    };

    if (wantJson) {
      console.log(JSON.stringify(measured, null, 2));
      return;
    }

    const n = (x: number) => x.toFixed(2);
    const lines: Line[] = [];

    // Ход камеры. Селфи и обращение в камеру судятся ПРОТИВОПОЛОЖНО: у первого
    // неподвижный фон — брак, у второго — норма.
    if (type === 'selfie') {
      lines.push({
        name: 'ход камеры (фон/лицо)',
        value: n(bgOverFace),
        expect: '≥ 0,80',
        verdict: bgOverFace >= 0.8 ? 'ПРИНЯТО' : 'БРАК',
      });
      lines.push({
        name: 'человек идёт (торс/фон)',
        value: background > MIN_BACKGROUND_AMPLITUDE ? n(torsoOverBg) : `${n(torsoOverBg)} (фон слаб — не судится)`,
        expect: '≥ 0,50',
        verdict: background <= MIN_BACKGROUND_AMPLITUDE ? '—' : torsoOverBg >= 0.5 ? 'ПРИНЯТО' : 'БРАК',
      });
    } else if (type === 'poster') {
      lines.push({
        name: 'камера стоит (фон/лицо)',
        value: n(bgOverFace),
        expect: '≤ 0,35',
        verdict: bgOverFace <= 0.35 ? 'ПРИНЯТО' : 'БРАК',
      });
    } else {
      lines.push({ name: 'ход камеры (фон/лицо)', value: n(bgOverFace), expect: 'тип не задан', verdict: '—' });
      lines.push({ name: 'человек идёт (торс/фон)', value: n(torsoOverBg), expect: 'тип не задан', verdict: '—' });
    }

    // Моргания судятся только на спокойном лице: при движении головы детектор
    // ловит саму голову. Порог не выдумывается — линейка молчит.
    const blinkTrustworthy = face <= BLINK_FACE_MOTION_LIMIT;
    lines.push({
      name: 'моргания в минуту',
      value: blinkTrustworthy
        ? blinksPerMinute.toFixed(0)
        : `${blinksPerMinute.toFixed(0)} (лицо движется — не отделяются)`,
      expect: blinkTrustworthy ? '≥ 12' : 'не судится',
      verdict: type === 'none' || !blinkTrustworthy ? '—' : blinksPerMinute >= 12 ? 'ПРИНЯТО' : 'БРАК',
    });

    lines.push({
      name: 'служебная полоса сверху',
      value: `${band} px`,
      expect: `≤ ${MIN_BAND_PX} px`,
      verdict: band <= MIN_BAND_PX ? 'ПРИНЯТО' : 'БРАК',
    });

    if (stereo) {
      lines.push({
        name: 'уровень звука (средний)',
        value: `${stereo.mean} dB`,
        expect: 'от −25 dB',
        verdict: stereo.mean >= -25 ? 'ПРИНЯТО' : 'БРАК',
      });
      if (mono) {
        // Каналы в противофазе схлопываются при моно-даунмиксе телефона: звук
        // «есть» в файле и пропадает у зрителя.
        const drop = stereo.mean - mono.mean;
        lines.push({
          name: 'моно-даунмикс (телефон)',
          value: `${mono.mean} dB (потеря ${drop.toFixed(1)} dB)`,
          expect: 'потеря ≤ 3 dB',
          verdict: drop <= 3 ? 'ПРИНЯТО' : 'БРАК',
        });
      }
    } else {
      // ОТСУТСТВИЕ дорожки — не «нечего судить», а отсутствие ИЗДЕЛИЯ. 26.08
      // инструмент принял немой клип говорящего человека как годный: строка
      // сказала «дорожки нет» и поставила прочерк, итог вышел ПРИНЯТО.
      // Немой кадр законен только там, где тип не задан.
      lines.push({
        name: 'уровень звука',
        value: 'ДОРОЖКИ НЕТ',
        expect: type === 'none' ? '—' : 'звук обязателен',
        verdict: type === 'none' ? '—' : 'БРАК',
      });
    }

    if (audioDuration !== null) {
      const gap = Math.abs(audioDuration - duration);
      lines.push({
        name: 'аудио против видео',
        value: `${audioDuration.toFixed(2)} с против ${duration.toFixed(2)} с`,
        expect: 'разница ≤ 0,15 с',
        verdict: gap <= 0.15 ? 'ПРИНЯТО' : 'БРАК',
      });
    }

    const pad = (s: string, len: number) => s + ' '.repeat(Math.max(0, len - s.length));
    console.log(`${file}  ·  ${duration.toFixed(2)} с  ·  ${w}×${h}  ·  тип: ${type}`);
    console.log('');
    console.log(`${pad('линейка', 26)}${pad('значение', 30)}${pad('порог', 18)}вердикт`);
    for (const l of lines) console.log(`${pad(l.name, 26)}${pad(l.value, 30)}${pad(l.expect, 18)}${l.verdict}`);

    const failed = lines.filter((l) => l.verdict === 'БРАК');
    console.log('');
    if (type === 'none') {
      console.log('ИТОГ: тип кадра не задан — вердикта нет, только числа. Задай --type selfie|poster.');
    } else if (failed.length === 0) {
      console.log('ИТОГ: ПРИНЯТО — все линейки в пороге.');
    } else {
      console.log(`ИТОГ: БРАК по ${failed.length} — ${failed.map((l) => l.name).join(' · ')}`);
    }
  },
);
