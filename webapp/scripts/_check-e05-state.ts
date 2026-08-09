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

  const { data: stb } = await sb
    .from('assets')
    .select('filename,content,metadata')
    .eq('episode_id', ep.id)
    .like('file_type', 'STB%')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (stb) {
    const txt = stb.content ?? '';
    const hits = txt.match(/duration[_ ]?(seconds|сек)?[^\n]{0,40}/gi) ?? [];
    console.log(`\nраскадровка ${stb.filename}: упоминаний длительности ${hits.length}`);
    hits.slice(0, 8).forEach((h: string) => console.log('   ', h.trim()));
    const meta = (stb.metadata ?? {}) as Record<string, unknown>;
    console.log('   metadata keys:', Object.keys(meta).join(', ') || '—');
  }

  const { localCacheAbsPath } = await import('../lib/media-cache');
  const { existsSync, statSync } = await import('node:fs');
  const { data: imgs } = await sb
    .from('assets')
    .select('id,filename,staging_path,drive_file_id,version,status,metadata')
    .eq('episode_id', ep.id)
    .like('filename', '%.png')
    .order('filename');
  const v2 = (imgs ?? []).find((x) => x.version === 2);
  if (v2) {
    const m = (v2.metadata ?? {}) as Record<string, any>;
    console.log('\nПРОВЕРКА Ф1 (строка v2):');
    console.log('  filename:', v2.filename, '| status:', v2.status, '| version:', v2.version);
    console.log('  contract:', m.shot_reference?.contract ?? 'НЕТ');
    console.log('  shot_id:', m.shot_reference?.shot_id ?? 'НЕТ');
    console.log('  drive_file_id:', v2.drive_file_id ?? 'null', '| staging_path:', v2.staging_path ?? 'null');
  }
  const { data: ev } = await sb
    .from('activity_events')
    .select('event_type,title,created_at')
    .eq('episode_id', ep.id)
    .eq('event_type', 'asset_created')
    .order('created_at', { ascending: false })
    .limit(2);
  console.log('события asset_created:', JSON.stringify(ev));
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
