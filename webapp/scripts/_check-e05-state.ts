// @not-a-tool: одноразовая проверка расхождения статусов на E05 — удалить после фиксации D91.
import { sb } from './run/_env';

async function main() {
  const { data: rows, error } = await sb
    .from('episodes')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(3);
  if (error) { console.error('ERR:', JSON.stringify(error, null, 2)); return; }
  console.log('columns:', Object.keys((rows ?? [])[0] ?? {}).join(', '));
  console.log('recent episodes:', (rows ?? []).map((r) => `${r.episode_code} | ${r.status}`));
  const ep = (rows ?? [])[0];
  console.log('episode:', JSON.stringify({
    id: ep?.id,
    code: ep?.episode_code,
    status: ep?.status,
    budget_ceiling: ep?.budget_ceiling,
    budget_approved: (ep?.metadata as Record<string, unknown> | null)?.budget_approved,
    has_generation_config: Boolean((ep?.metadata as Record<string, unknown> | null)?.generation_config),
  }, null, 2));

  if (!ep) return;
  const { data: assets } = await sb
    .from('assets')
    .select('id,filename,status,version,created_at')
    .eq('episode_id', ep.id)
    .order('created_at', { ascending: true });
  console.log('assets:');
  for (const a of assets ?? []) {
    console.log(`  ${a.status.padEnd(9)} v${a.version}  ${a.filename}`);
  }

  const { localCacheAbsPath } = await import('../lib/media-cache');
  const { existsSync, statSync } = await import('node:fs');
  const { data: imgs } = await sb
    .from('assets')
    .select('id,filename,staging_path,drive_file_id')
    .eq('episode_id', ep.id)
    .like('filename', '%.png');
  console.log('\nбайты кадров:');
  for (const a of imgs ?? []) {
    const p = localCacheAbsPath(a.filename);
    const ok = existsSync(p);
    console.log(`  ${a.filename}`);
    console.log(`    id=${a.id}`);
    console.log(`    cache=${p}  ${ok ? `ЕСТЬ ${(statSync(p).size / 1024).toFixed(0)}KB` : 'НЕТ'}`);
    console.log(`    staging_path=${a.staging_path ?? '—'}  drive=${a.drive_file_id ?? '—'}`);
  }
}
main();
