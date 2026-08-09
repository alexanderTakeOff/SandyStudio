// @not-a-tool: одноразовая проверка промптов кадров E05 — удалить после разбора.
import { sb } from './run/_env';

const EP = '8f053f75-e204-4f9f-b6c4-d3fbe9ade163';

/** Ключевые слова, которых Директор требовал в промптах. */
const MARKERS: Array<[string, RegExp]> = [
  ['ТЬМА', /black abyss|only light|darkness|pitch black|тьма|темнот/i],
  ['ПРОЖЕКТОРЫ', /projector|floodlight|spotlight|прожектор/i],
  ['ОТКАТ', /pulls? back|dolly out|zoom out|отъезжает|откат/i],
  ['МОРГАНИЕ', /blink|eyelid|веко|моргани/i],
  ['ОГНИ', /navigation light|red light|green light|огн/i],
];

function scan(label: string, text: string): void {
  const found = MARKERS.filter(([, re]) => re.test(text)).map(([n]) => n);
  const missing = MARKERS.filter(([, re]) => !re.test(text)).map(([n]) => n);
  console.log(`   ${label}: есть [${found.join(', ') || '—'}]  НЕТ [${missing.join(', ') || '—'}]`);
}

async function main() {
  const { data: rows } = await sb
    .from('assets')
    .select('id,filename,file_type,status,version,metadata,created_at,updated_at')
    .eq('episode_id', EP)
    .or('file_type.like.IMG%,file_type.like.VID%')
    .order('filename', { ascending: true });

  for (const a of rows ?? []) {
    const meta = (a.metadata ?? {}) as Record<string, unknown>;
    console.log(`\n${a.filename}  [${a.status} v${a.version}]  file_type=${a.file_type}`);
    console.log(`   создан ${String(a.created_at).slice(0, 19)}  обновлён ${String(a.updated_at ?? '—').slice(0, 19)}`);
    console.log(`   metadata: ${Object.keys(meta).join(', ') || '—'}`);

    const ip = meta.image_prompt as { prompt?: string; current_version?: unknown; history?: unknown[] } | undefined;
    const recipe = meta.recipe as { prompt?: string } | undefined;
    const promptText =
      (typeof ip?.prompt === 'string' && ip.prompt) ||
      (typeof recipe?.prompt === 'string' && recipe.prompt) ||
      '';
    if (ip) console.log(`   image_prompt.current_version=${String(ip.current_version ?? '—')} history=${Array.isArray(ip.history) ? ip.history.length : '—'}`);
    if (!promptText) {
      console.log('   ПРОМПТА В МЕТАДАННЫХ НЕТ');
      continue;
    }
    console.log(`   длина промпта ${promptText.length}`);
    scan('маркеры', promptText);
    console.log('   --- промпт ---');
    console.log(promptText.slice(0, 1200).split('\n').map((l) => `   | ${l}`).join('\n'));
  }
}
main().catch((e) => console.error('ERR:', e));
