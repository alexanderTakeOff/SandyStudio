import { sb } from './_env';
async function main() {
  const { data } = await sb.from('assets')
    .select('id,file_type,filename,status,episode_id,series_id,drive_file_id,staging_path')
    .like('file_type', '%AUD%').order('created_at', { ascending: false }).limit(40);
  for (const a of data ?? []) console.log(`${a.file_type} | ${a.filename} | ${a.status}`);
}
main();
