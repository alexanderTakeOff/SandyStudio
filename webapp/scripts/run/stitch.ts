// Direct-call assembly for the clean run: concatenates the shot clips in order,
// normalises them to one encode, and appends a short black tail.
//
// Tool work, not generation (doctrine §16): cuts, timings and the black tail are
// transformations of already-accepted material, so they cost $0 and are exact.
// Contract: `--help`.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { defineTool } from './_tool';
import { traceInStudio, shotFromFilename } from './_asset';
import { sb } from './_env';
import { buildStitchEdl } from '../../lib/api/stitch-edl';
import {
  buildConcatList,
  buildMusicAudioFilter,
  assertStreamableDelivery,
  DELIVERY_MUX_ARGS,
  type ConcatShotEntry,
} from '../../lib/providers/ffmpeg-stitch';
import { cachedFileIfPresent } from '../../lib/media-cache';
import type { AudioTrack } from '../../lib/api/animatic-shotlist';

function ff(args: string[]): void {
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
}

/** Ключ кадра из чего угодно: `S20-E06-SH07` → `sh07`, `07.mp4` → `sh07`, `sh7` → `sh07`.
 *  Прямой путь называет нарезку просто номерами, монтажный лист — полными id кадров;
 *  без общей нормализации обрезки молча не находятся (поймано живым прогоном 11.08). */
function shotKey(s: string): string | null {
  const viaHelper = shotFromFilename(s);
  if (viaHelper) return `sh${viaHelper.replace(/^sh/i, '').padStart(2, '0')}`;
  const m = /(\d{1,3})(?!.*\d)/.exec(s);
  return m ? `sh${m[1].padStart(2, '0')}` : null;
}

/**
 * Файл музыки НА ДИСКЕ. Трек в монтажном листе адресуется браузерным URL
 * (`/api/media/<file>`) — сборщику нужен путь; по HTTP инструмент не ходит, всё
 * уже лежит в медиа-кэше, куда его положила загрузка.
 * Читаем `original_url ?? url` — таков закон читателя `AudioTrack`.
 */
async function musicFileOnDisk(track: AudioTrack): Promise<string | null> {
  const src = (track.original_url ?? track.url ?? '').trim();
  if (!src) return null;
  if (existsSync(src)) return src;
  const viaCache = await cachedFileIfPresent(decodeURIComponent(src.split('/').pop() ?? ''));
  return viaCache;
}

function durationOf(file: string): number {
  const out = execFileSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file,
  ], { encoding: 'utf8' });
  return Number(out.trim());
}

export default defineTool(
  {
    name: 'stitch',
    summary: 'Собирает кат: клипы по порядку, один энкод на всех, короткий чёрный хвост. $0.',
    args: {
      // Пусто — источник берётся из МОНТАЖНОГО ЛИСТА аниматика: исходные клипы,
      // порядок и обрезки Директора. Ручные `--dir/--order` остаются аварийным
      // режимом для случая, когда листа нет или он не годится.
      dir: { about: 'папка с готовой нарезкой (аварийный ручной режим); пусто — клипы из аниматика', default: '' },
      order: { about: 'порядок файлов в --dir через запятую; пусто — порядок из аниматика', default: '' },
      out: { about: 'куда положить кат' },
      tail: { about: 'длина чёрного хвоста в секундах', default: '1.0' },
      version: { about: 'версия ката в студии', default: 'v01' },
    },
    // Сборка ничего не тратит, но её результат — изделие, и он обязан оставить
    // след. До 2026-08-06 `stitch` не знал про базу вовсе, поэтому финальный кат
    // трёх эпизодов существовал только файлом.
    env: { RUN_EPISODE_ID: { about: 'эпизод, которому принадлежит кат' } },
    reads: ['assets', 'episodes'],
    writes: ['assets'],
    stations: ['final_cut'],
  },
  async ({ arg, env }) => {
    const dirArg = arg('dir');
    const order = arg('order').split(',').map((s) => s.trim()).filter(Boolean);
    const out = resolve(process.cwd(), arg('out'));
    const tail = Number(arg('tail'));
    const manualMode = Boolean(dirArg) && order.length > 0;

    // ОБРЕЗКИ ДИРЕКТОРА ИЗ АНИМАТИКА (11.08). Инструмент клеил файлы ЦЕЛИКОМ и в
    // базу за монтажным листом не ходил вовсе — поэтому правки, сделанные в
    // аниматике (длительность кадра, обрезка головы, удаление кадра), в кат не
    // попадали. Расхождение копится и вылезает на последних кадрах: 10.08 седьмой
    // кадр E06 разошёлся на несколько десятых.
    //
    // Монтажный лист строит общая функция — ТА ЖЕ, что у агентского сборщика
    // (`lib/api/stitch-edl.ts`), иначе два пути снова разойдутся в арифметике.
    // Файлы при этом берём локальные (`--dir`): у прямого пути своя нарезка,
    // сопоставляем её с листом по номеру кадра.
    // Формат монтажного листа — общий с агентским сборщиком (`ConcatShotEntry`):
    // `buildConcatList` сам переводит «начало + длительность» в inpoint/outpoint.
    const parts: ConcatShotEntry[] = [];
    let orderForTrace: string[] = [];
    let musicTrack: AudioTrack | null = null;
    let plannedSeconds = 0;

    if (manualMode) {
      // АВАРИЙНЫЙ РЕЖИМ. Файлы в --dir — чужая нарезка: она УЖЕ обрезана, и класть
      // на неё обрезки из аниматика нельзя (проверено 11.08: кадр 07 попросил 11с
      // там, где в файле 9.5 — двойная обрезка). Поэтому здесь клеим целиком и
      // говорим об этом вслух.
      console.warn('⚠ ручной режим (--dir/--order): обрезки Директора НЕ применяются — файлы клеятся целиком');
      console.warn('⚠ ручной режим: МУЗЫКА НЕ подмешивается — она живёт в монтажном листе, которого здесь нет');
      const dir = resolve(process.cwd(), dirArg);
      for (const name of order) {
        const p = join(dir, `${name}.mp4`);
        if (!existsSync(p)) throw new Error(`missing clip: ${p}`);
        parts.push({ path: p });
        console.log(`${name}: ${durationOf(p).toFixed(1)}s`);
      }
      orderForTrace = order;
    } else {
      // ШТАТНЫЙ РЕЖИМ: источник — монтажный лист аниматика. Исходные клипы, порядок
      // Директора и его обрезки; удалённые кадры не попадают в кат по построению.
      const edl = await buildStitchEdl(sb as never, env('RUN_EPISODE_ID'));
      if (edl.missing.length > 0) {
        throw new Error(`нет APPROVED-клипа для кадров: ${edl.missing.join(', ')}`);
      }
      musicTrack = edl.musicTrack;
      console.log(
        `монтажный лист аниматика: ${edl.orderedShots.length} кадров` +
          (edl.excludedShots.length ? ` · исключены Директором: ${edl.excludedShots.join(', ')}` : ''),
      );
      for (const s of edl.orderedShots) {
        const src = s.stagingPath ?? s.url;
        if (!src) throw new Error(`у кадра ${s.shotId} нет файла ни на диске, ни по ссылке`);
        if (s.stagingPath && !existsSync(s.stagingPath)) {
          throw new Error(`кадр ${s.shotId}: файл не найден на диске — ${s.stagingPath}`);
        }
        const raw = existsSync(src) ? durationOf(src) : NaN;
        parts.push({
          path: src,
          inpointSeconds: s.inpointSeconds > 0 ? s.inpointSeconds : undefined,
          durationSeconds: s.durationSeconds,
        });
        plannedSeconds += s.durationSeconds;
        console.log(
          `${s.shotId}: ${Number.isFinite(raw) ? raw.toFixed(1) + 's' : 'исходник'} → ${s.durationSeconds.toFixed(1)}s` +
            (s.inpointSeconds > 0 ? ` (голова ${s.inpointSeconds.toFixed(1)}s)` : ''),
        );
      }
      orderForTrace = edl.orderedShots.map((s) => s.shotId);
    }

    const work = join(dirname(out), '_work');
    mkdirSync(work, { recursive: true });

    // Black tail, built to match the clips' geometry and frame rate exactly.
    const tailPath = join(work, 'tail.mp4');
    ff([
      '-f', 'lavfi', '-i', `color=c=black:s=720x1280:r=24:d=${tail}`,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', tailPath,
    ]);
    parts.push({ path: tailPath });

    // Список пишет ОБЩИЙ билдер (`ffmpeg-stitch.ts`) — тот же, что у агентского
    // сборщика: он ставит inpoint/outpoint в каноничном порядке и экранирует
    // кавычки в путях, чего наша ручная сборка не делала.
    const listPath = join(work, 'list.txt');
    writeFileSync(listPath, buildConcatList(parts));

    // МУЗЫКА (11.08). Инструмент кодировал кат с `-an` — без звука вовсе, и
    // трек накладывали руками длинной командой ffmpeg. Именно она 10.08 повесила
    // единственный шелл сессии на незакрытой кавычке и стоила хода. Монтажный
    // лист музыку уже отдаёт; фейды Директор ставит ползунками в плеере, мы их
    // читаем — форму фильтра строит общая `buildMusicAudioFilter`.
    let musicPath: string | null = null;
    if (musicTrack && !musicTrack.muted) {
      musicPath = await musicFileOnDisk(musicTrack);
      if (!musicPath) {
        throw new Error(
          `музыка есть в монтажном листе (${musicTrack.filename}), но файла нет ни на диске, ` +
            `ни в медиа-кэше: ${musicTrack.original_url ?? musicTrack.url}`,
        );
      }
      console.log(`музыка: ${musicTrack.filename}`);
    } else if (musicTrack?.muted) {
      console.log('музыка: дорожка выключена Директором (muted) — кат собирается без звука');
    }

    const audioFilter = musicPath
      ? buildMusicAudioFilter(musicTrack!, plannedSeconds + tail)
      : null;

    mkdirSync(dirname(out), { recursive: true });
    // Re-encode rather than stream-copy: the clips come back from the provider with
    // their own headers, and a copy-concat of mismatched streams produces a file that
    // plays for some players and not others — a silent defect on delivery.
    const args: string[] = ['-f', 'concat', '-safe', '0', '-i', listPath];
    // Короткий трек зацикливается, иначе `-shortest` обрежет КАТ по длине музыки.
    if (musicPath) args.push('-stream_loop', '-1', '-i', musicPath);
    args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-r', '24');
    if (musicPath) {
      args.push('-map', '0:v', '-map', '1:a');
      if (audioFilter) args.push('-filter:a', audioFilter);
      args.push('-c:a', 'aac', '-b:a', '192k', '-shortest');
    } else {
      args.push('-an');
    }
    // ЗАКОН ДОСТАВКИ БЕРЁТСЯ ИЗ ОДНОГО МЕСТА (13.08). Здесь стоял свой список
    // флагов, и в нём не было `+faststart`: с 01.08 по 13.08 каты выходили с
    // индексом `moov` в конце файла, YouTube помечал их `nonStreamableMov`, и
    // Shorts-полка не раздала НИ ОДИН — пять роликов по 0–11 просмотров против
    // 700–1500 у собранных агентским сборщиком. Список склейки и звука этот
    // инструмент уже брал из общего модуля; список вывода — нет.
    args.push(...DELIVERY_MUX_ARGS);
    args.push(out);
    ff(args);

    // Приёмка: негодный к раздаче кат не должен считаться собранным.
    await assertStreamableDelivery(out);

    rmSync(work, { recursive: true, force: true });
    console.log(`OK ${out}`);
    const total = durationOf(out);
    console.log(`total ${total.toFixed(1)}s`);

    // ПОРЯДОК СБОРКИ ЗАПИСЫВАЕТСЯ. Он не сохранялся нигде, и через сутки
    // восстановить, какая версия каждого кадра вошла в кат, можно было только
    // догадкой по именам файлов (2026-08-05).
    // Ф1: версия строки вычисляется регистратором (max+1) — `--version` остаётся
    // только меткой в описании.
    await traceInStudio({
      episodeId: env('RUN_EPISODE_ID'),
      kind: 'cut',
      file: arg('out'),
      description: `кат ${arg('version')} · ${total.toFixed(1)} с · порядок: ${orderForTrace.join(', ')}`,
      origin: 'stitch',
    });
  },
);
