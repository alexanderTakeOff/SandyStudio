// Read a canon plate: its verbatim text and, if it has one, its image.
// Needed every run — the leading mind checks what the frame generator will
// actually attach, instead of trusting a paraphrase. Contract: `--help`.
//
// D49: the stub this replaces wrote the image to a hardcoded `e35` path, so a
// later episode either wrote into the wrong run's folder or failed on a missing
// directory. The destination is an argument now.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { sb, seriesId } from './_env';
import { defineTool } from './_tool';
import { readAssetMediaAsBase64 } from '../../lib/media-cache';

export default defineTool(
  {
    name: 'peek-canon',
    summary: 'Показывает плиту канона по слагу: текст дословно и картинку, если она есть.',
    args: {
      slug: { about: 'слаг канона без префикса `SBL-`' },
      out: { about: 'куда сохранить картинку плиты; пусто — только текст', default: '' },
      chars: { about: 'сколько символов текста печатать', default: '1800' },
    },
    env: {
      RUN_SERIES_ID: { about: 'сериал, над которым идёт работа; умолчания нет — чужой сериал молча делает не ту работу' },
    },
    reads: ['assets'],
  },
  async ({ arg }) => {
    const slug = arg('slug');
    const { data: asset } = await sb
      .from('assets')
      .select('id,filename,drive_file_id,staging_path,content,description,status')
      .eq('series_id', seriesId())
      .eq('file_type', `SBL-${slug}`)
      .maybeSingle();
    if (!asset) throw new Error(`no canon asset SBL-${slug} в серии ${seriesId()}`);

    console.log('filename:', asset.filename, '| status:', asset.status);
    console.log('--- content ---');
    console.log((asset.content ?? asset.description ?? '').slice(0, Number(arg('chars'))));

    const out = arg('out');
    if (!out) return;

    const b64 = await readAssetMediaAsBase64({
      filename: asset.filename,
      driveFileId: asset.drive_file_id,
      stagingPath: asset.staging_path,
    });
    if (!b64) throw new Error('canon asset has no image on disk/Drive');
    const abs = resolve(process.cwd(), out);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, Buffer.from(b64, 'base64'));
    console.log('image saved:', abs);
  },
);
