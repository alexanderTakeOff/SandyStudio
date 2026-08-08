// Register a generated frame as a series-canon asset. Copies the PNG into the
// media cache under its canonical filename and writes the `assets` row, so every
// later frame can attach it by slug. Contract: `--help`.
//
// Idempotent: called again with the same `--slug` it UPDATES the existing plate
// instead of creating a twin. That is also how a plate whose preview is broken
// gets repaired — `--slug` alone rewrites `drive_path` without touching the text.
import { defineTool } from './_tool';
import { seriesId, seriesCode } from './_env';
import { persistAsset } from './_asset';

export default defineTool(
  {
    name: 'register-canon',
    summary: 'Закрепляет кадр каноном серии: PNG в медиа-кэш, строка `assets` под слагом. Повтор обновляет, не дублирует.',
    args: {
      slug: {
        // D72: слаг НЕСЁТ категорию сам — `SBL-${slug}` плоский, категории как
        // отдельного поля нет. `object_eyelid_shutter`, а не `eyelid_shutter` —
        // короткая форма молча завела ВТОРУЮ плиту канона рядом с первой, и обе
        // остались жить (одна пустой мёртвой строкой, другая — под именем, под
        // которым её никто в студии не ищет).
        about:
          'слаг канона БЕЗ префикса `SBL-`, но С категорией внутри самого слага: ' +
          '`object_eyelid_shutter`, `character_iris_labyrinth`, `location_empty_background` — ' +
          'НЕ голое имя `eyelid_shutter`. Кадры цепляют его как `<slug>:<kind>`',
      },
      file: { about: 'исходный PNG; пусто — строка чинится без замены байтов', default: '' },
      desc: { about: 'описание плиты; читается приёмщиком дословно. Пусто — существующее не трогается', default: '' },
      status: { about: 'статус ассета', default: 'APPROVED' },
      version: { about: 'версия в имени файла', default: 'v01' },
    },
    env: {
      RUN_SERIES_ID: { about: 'сериал, над которым идёт работа; умолчания нет — чужой сериал молча делает не ту работу' },
    },
    reads: ['assets', 'episodes', 'series'],
    writes: ['assets'],
    stations: ['series_canon'],
  },
  async ({ arg }) => {
    const slug = arg('slug');
    const file = arg('file');

    const res = await persistAsset({
      // Имя собирается только когда есть чем его наполнить: при починке старой
      // записи оно берётся из строки, иначе кэш разъедется с базой.
      filename: file ? `${await seriesCode()}-SBL-${slug}-${arg('version')}-${arg('status')}.png` : undefined,
      fileType: `SBL-${slug}`,
      srcPath: file || undefined,
      seriesId: seriesId(),
      status: file ? arg('status') : undefined,
      description: arg('desc') || undefined,
      metadata: file ? { origin: 'clean-run direct call', source_frame: file } : undefined,
    });

    console.log(res.created ? 'СОЗДАНА' : 'ОБНОВЛЕНА', `${res.id} · ${res.filename}`);
    if (res.cachedAt) console.log('cached at:', res.cachedAt);
  },
);
