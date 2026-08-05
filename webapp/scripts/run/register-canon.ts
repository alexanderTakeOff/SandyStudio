// Register a generated frame as a series-canon asset. Copies the PNG into the
// media cache under its canonical filename and writes the `assets` row, so every
// later frame can attach it by slug. Contract: `--help`.
//
// Idempotent: called again with the same `--slug` it UPDATES the existing plate
// instead of creating a twin. That is also how a plate whose preview is broken
// gets repaired — `--slug` alone rewrites `drive_path` without touching the text.
import { defineTool } from './_tool';
import { S15 } from './_env';
import { persistAsset } from './_asset';

export default defineTool(
  {
    name: 'register-canon',
    summary: 'Закрепляет кадр каноном серии: PNG в медиа-кэш, строка `assets` под слагом. Повтор обновляет, не дублирует.',
    args: {
      slug: { about: 'слаг канона без префикса; кадры цепляют его как `<slug>:<kind>`' },
      file: { about: 'исходный PNG; пусто — строка чинится без замены байтов', default: '' },
      desc: { about: 'описание плиты; читается приёмщиком дословно. Пусто — существующее не трогается', default: '' },
      status: { about: 'статус ассета', default: 'APPROVED' },
      version: { about: 'версия в имени файла', default: 'v01' },
    },
    reads: ['assets'],
    writes: ['assets'],
  },
  async ({ arg }) => {
    const slug = arg('slug');
    const file = arg('file');

    const res = await persistAsset({
      // Имя собирается только когда есть чем его наполнить: при починке старой
      // записи оно берётся из строки, иначе кэш разъедется с базой.
      filename: file ? `SS-S15-SBL-${slug}-${arg('version')}-${arg('status')}.png` : undefined,
      fileType: `SBL-${slug}`,
      srcPath: file || undefined,
      seriesId: S15,
      status: file ? arg('status') : undefined,
      description: arg('desc') || undefined,
      metadata: file ? { origin: 'clean-run direct call', source_frame: file } : undefined,
    });

    console.log(res.created ? 'СОЗДАНА' : 'ОБНОВЛЕНА', `${res.id} · ${res.filename}`);
    if (res.cachedAt) console.log('cached at:', res.cachedAt);
  },
);
