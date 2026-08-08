// ГЛАЗА единого разума: показать ИЗДЕЛИЕ, а не запись о нём.
//
// Доктрина §6: «скептик смотрит на ВЕЩЬ, а не на её ОПИСАНИЕ; если проверяющий не открывает
// артефакт, он не проверяющий». §17: «сделано» не произносится без предъявленного изделия.
// До 07.08 посмотреть можно было только плиту канона (`peek-canon`) — на кадр, клип или кат
// глаз не было ни у кого, кроме отдельного визуального критика, то есть смотрели ЧУЖИМИ
// глазами и читали вердикт словами.
//
// Инструмент обобщает `peek-canon`, а не добавляется рядом с ним: одна дверь к любому
// изделию. Три способа назвать вещь, потому что ровно так её и знают на разных шагах:
//   --slug   плита канона серии (`SBL-<slug>`)
//   --type   изделие эпизода по префиксу (`VID-final_cut`,
//            `IMG-episode_ref_<код серии+эпизода без дефисов>_<shot>` — например,
//            `IMG-episode_ref_s20_e03_sh02` для SS-S20-E03, шот sh02) — свежайшее
//   --id     точная строка, когда id уже на руках
//
// Видео показывается ПОЛОСОЙ кадров, а не одним стопом: начало · середина · ИСХОД. Исход и
// есть то, что написано в листе приёмки, и по одному стоп-кадру он не проверяется.
// Контракт: `--help`.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, extname, join } from 'node:path';
import { sb, seriesId, runEnv } from './_env';
import { defineTool } from './_tool';
import { readAssetMediaAsBase64, localCacheAbsPath } from '../../lib/media-cache';
import { sampleVideoFrames } from '../../lib/sample-frames';

const FIELDS = 'id,filename,file_type,status,version,drive_file_id,staging_path,content,description,created_at';

export default defineTool(
  {
    name: 'show-asset',
    summary: 'Показывает изделие глазами: текст дословно и картинку — или полосу кадров, если это видео.',
    args: {
      slug: { about: 'плита канона серии, слаг без префикса `SBL-`', default: '' },
      type: {
        // Живая приёмка Ф4.5 поймала: ум угадал `--type SCR` (голый код из
        // таблицы CLAUDE.md §3), получил честный отказ «не найдено» — и ТИХО
        // прочитал его как «сценария не существует», хотя строка была на
        // месте. `file_type` в базе — НЕ голый код, а код+описание. Явные
        // примеры не дают догадке шанса разойтись с конвенцией.
        //
        // D73 (Зрачок-2, 08.08): даже с примерами ум дважды промахнулся мимо
        // IMG-кадра — старый пример `IMG-episode_ref…` был обрезан
        // многоточием вместо полного шаблона, и оба раза выбранное имя было
        // правдоподобным, но неточным (`IMG-shot_sh02`, не то, что реально в
        // базе). Полный шаблон вместо сокращения — тот же приём, доведённый
        // до конца.
        about:
          'ТОЧНОЕ значение `file_type` в базе (не голый код из CLAUDE.md §3 — там таблица ' +
          'типов, а не имён столбца): `SCR-script`, `STB-storyboard`, `SPC-brief`, ' +
          '`SPC-ref_plan-<shot>`, `SPC-shot_plan-<shot>`, ' +
          '`IMG-episode_ref_<код серии+эпизода без дефисов>_<shot>` (пример: ' +
          '`IMG-episode_ref_s20_e03_sh02` для SS-S20-E03, шот sh02), `VID-final_cut`. ' +
          'Берётся самое свежее. Отказ «не найдено» — не значит «не существует»: возможно, тип ' +
          'назван неточно; проверь listSeriesBibles/getEpisode или спроси точный `file_type`.',
        default: '',
      },
      id: { about: 'точный uuid строки ассета', default: '' },
      out: { about: 'куда положить картинку; для видео — папку под полосу кадров. Пусто — только текст', default: '' },
      frames: { about: 'сколько кадров вынуть из видео', default: '3' },
      chars: { about: 'сколько символов текста печатать', default: '1800' },
    },
    env: {
      RUN_SERIES_ID: { about: 'сериал; нужен для поиска по --slug' },
    },
    reads: ['assets'],
  },
  async ({ arg }) => {
    const slug = arg('slug');
    const type = arg('type');
    const id = arg('id');
    const given = [slug, type, id].filter(Boolean).length;
    if (given !== 1) {
      throw new Error('назови изделие РОВНО одним способом: --slug, --type или --id');
    }

    const query = sb.from('assets').select(FIELDS);
    if (id) query.eq('id', id);
    else if (slug) query.eq('series_id', seriesId()).eq('file_type', `SBL-${slug}`);
    else query.eq('episode_id', runEnv('RUN_EPISODE_ID') ?? '').eq('file_type', type);

    const { data, error } = await query.order('created_at', { ascending: false }).limit(1);
    if (error) throw new Error(`поиск изделия: ${error.message}`);
    const asset = data?.[0];
    if (!asset) {
      // Отказ адресный: сказать, ЧТО искали и ГДЕ, иначе следующий шаг — чтение кода.
      const where = id ? `id=${id}` : slug ? `SBL-${slug} в серии ${seriesId()}` : `${type} в эпизоде ${runEnv('RUN_EPISODE_ID')}`;
      throw new Error(`изделие не найдено: ${where}`);
    }

    console.log(`${asset.filename} · ${asset.status} · ${asset.file_type} · ${asset.created_at?.slice(0, 16)}`);
    const text = asset.content ?? asset.description ?? '';
    if (text) {
      console.log('--- текст ---');
      console.log(text.slice(0, Number(arg('chars'))));
      if (text.length > Number(arg('chars'))) console.log(`… ещё ${text.length - Number(arg('chars'))} символов`);
    }

    const out = arg('out');
    if (!out) return;

    const isVideo = /\.(mp4|mov|webm)$/i.test(asset.filename);
    if (isVideo) {
      // Кадры берём с файла в кэше: перекладывать десятки мегабайт через base64 незачем.
      const src = localCacheAbsPath(asset.filename);
      const shots = await sampleVideoFrames(src, { frames: Number(arg('frames')) });
      if (shots.length === 0) throw new Error(`из ${asset.filename} не вынулось ни кадра — файл в кэше?`);
      const dir = resolve(process.cwd(), out);
      mkdirSync(dir, { recursive: true });
      shots.forEach((b64, i) => {
        const p = join(dir, `${String(i + 1).padStart(2, '0')}.png`);
        writeFileSync(p, Buffer.from(b64, 'base64'));
        console.log('кадр:', p);
      });
      return;
    }

    const b64 = await readAssetMediaAsBase64({
      filename: asset.filename,
      driveFileId: asset.drive_file_id,
      stagingPath: asset.staging_path,
    });
    if (!b64) throw new Error(`у ${asset.filename} нет байтов ни в кэше, ни на Drive`);
    const abs = resolve(process.cwd(), out.endsWith(extname(asset.filename)) ? out : `${out}${extname(asset.filename)}`);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, Buffer.from(b64, 'base64'));
    console.log('картинка:', abs);
  },
);
