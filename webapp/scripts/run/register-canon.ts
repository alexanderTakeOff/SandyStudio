// Register a generated frame as a series-canon asset for the clean run.
// Copies the PNG into the media cache under its canonical filename and inserts
// the `assets` row, so every later frame can attach it by slug.
//
//   npx tsx scripts/run/register-canon.ts \
//     --slug location_office_queue_hall --file ../FILMS/_run/e35/frames/canon-hall-v01.png \
//     --desc "..." [--status APPROVED]
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { sb, S15 } from './_env';
import { localCacheAbsPath } from '../../lib/media-cache';

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`missing --${name}`);
}

async function main() {
  const slug = arg('slug');
  const file = arg('file');
  const desc = arg('desc');
  const status = arg('status', 'APPROVED');
  const version = arg('version', 'v01');

  const filename = `SS-S15-SBL-${slug}-${version}-${status}.png`;
  const src = resolve(process.cwd(), file);
  if (!existsSync(src)) throw new Error(`source not found: ${src}`);

  const dest = localCacheAbsPath(filename);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);

  const { data, error } = await sb
    .from('assets')
    .insert({
      series_id: S15,
      file_type: `SBL-${slug}`,
      filename,
      status,
      description: desc,
      content: desc,
      metadata: { origin: 'clean-run direct call', source_frame: file },
    })
    .select('id,file_type,filename,status')
    .single();
  if (error) throw new Error(`asset insert failed: ${error.message}`);

  console.log('cached at:', dest);
  console.log('asset:', JSON.stringify(data));
}

main().catch((e) => {
  console.error('ERROR', e?.message ?? e);
  process.exit(1);
});
