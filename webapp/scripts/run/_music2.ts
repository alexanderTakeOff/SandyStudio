import { sb } from './_env';
async function main() {
  const { data } = await sb.from('assets').select('file_type,filename,drive_file_id,staging_path,status')
    .or('filename.ilike.%lollipop%,description.ilike.%lollipop%,file_type.ilike.%lollipop%');
  console.log('lollipop matches:', data?.length ?? 0);
  for (const a of data ?? []) console.log(JSON.stringify(a));
  const { data: e33 } = await sb.from('assets').select('id,filename,drive_file_id,staging_path,metadata')
    .ilike('filename', 'SS-S15-E33-AUD-music-main%');
  console.log('E33 music rows:', e33?.length ?? 0);
  for (const a of e33 ?? []) console.log(a.filename, '| drive:', a.drive_file_id, '| staging:', a.staging_path);
}
main();
