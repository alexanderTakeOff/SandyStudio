// @not-a-tool: одноразовый скрипт Ф4.5 — headless-эквивалент PUT /api/providers/concierge.
// Живая приёмка ведётся Директором headless (нет браузерной сессии для requireDirector),
// поэтому override пишется напрямую в app_config тем же upsert'ом, что и роут. Удалить
// после Ф4.5, если UI-переключатель не нужен как постоянный путь для headless-прогонов.
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) {
  for (const raw of readFileSync(envPath, 'utf-8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    process.env[line.slice(0, eq).trim()] = val;
  }
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const provider = process.argv[2];
  const model = process.argv[3];
  if (!provider || !model) {
    console.error('использование: npx tsx scripts/set-concierge-provider.ts <provider> <model>');
    process.exit(1);
  }
  const { error } = await sb.from('app_config').upsert(
    {
      scope: 'providers',
      key: 'concierge_provider',
      value: { provider, model },
      source: 'ui_edit', // CHECK app_config_source_check допускает только 'repo'/'ui_edit' — headless-эквивалент UI
      synced_at: new Date().toISOString(),
    } as never,
    { onConflict: 'scope,key' },
  );
  if (error) throw new Error(error.message);
  console.log(`✓ Полина → ${provider}:${model}`);
}

main().catch((e: unknown) => {
  console.error('ERROR', e instanceof Error ? e.message : e);
  process.exit(1);
});
