import { sb, S15 } from './_env';
import { readAssetMediaAsBase64 } from '../../lib/media-cache';
import { writeFileSync } from 'node:fs';
async function main() {
  const slug = process.argv[2];
  const { data: a } = await sb.from('assets')
    .select('id,filename,drive_file_id,staging_path,content,description')
    .eq('series_id', S15).eq('file_type', `SBL-${slug}`).maybeSingle();
  if (!a) { console.log('no asset'); return; }
  console.log('filename:', a.filename);
  console.log('--- content ---');
  console.log((a.content ?? a.description ?? '').slice(0, 1800));
  const b64 = await readAssetMediaAsBase64({ filename: a.filename, driveFileId: a.drive_file_id, stagingPath: a.staging_path });
  if (b64) { writeFileSync(`../FILMS/_run/e35/frames/_canon_${slug}.png`, Buffer.from(b64, 'base64')); console.log('image saved'); }
  else console.log('NO IMAGE');
}
main();
