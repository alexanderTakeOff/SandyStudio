// Открыть тред Prod Assistant без браузера.
//
// D13: `POST /api/concierge/new-thread` закрыт middleware'ом на человеческую сессию —
// headless получает 307 на /login. Скрипт зеркалит РОВНО то, что делает роут, теми же
// помощниками (`createThread` + `resolveEffectiveConciergeMode`), а не выдумывает свою
// вставку: тред наследует привязку к эпизоду и режим, выведенный из эпизода.
//
//   npx tsx scripts/open-pa-thread.ts --episode <uuid>
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

async function main() {
  const { createSupabaseServiceRoleClient } = await import('../lib/supabase/server');
  const { createThread, endThread, getThread } = await import('../lib/concierge/threads');
  const { resolveEffectiveConciergeMode } = await import('../lib/concierge/resolve-mode');

  const args = process.argv.slice(2);
  const at = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
  const episodeId = at('--episode') ?? null;
  const closeId = at('--close');

  const sb = createSupabaseServiceRoleClient();
  if (closeId) {
    const existing = await getThread(sb, closeId);
    if (existing && existing.ended_at === null) await endThread(sb, closeId);
  }
  const activeMode = await resolveEffectiveConciergeMode(sb, episodeId);
  const thread = await createThread(sb, { episodeId, activeMode });
  console.log(`✓ thread ${thread.id}  episode=${episodeId ?? '—'}  mode=${activeMode}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
