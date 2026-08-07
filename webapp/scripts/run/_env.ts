// @not-a-tool: общий каркас — читает .env.local и отдаёт клиент базы; сам не запускается
// Shared env + client bootstrap for the clean-run direct-call scripts.
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) {
  for (const raw of readFileSync(envPath, 'utf-8').split('\n')) {
    const line = raw.trim(); if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('='); if (eq <= 0) continue;
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    process.env[line.slice(0, eq).trim()] = val;
  }
}

export const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
/**
 * СЕРИЯ — ПАРАМЕТР, не константа (D60, Ф1 новой парадигмы 2026-08-07).
 *
 * Здесь стоял `S15 = '4535…'`, и его импортировали девять инструментов из двенадцати:
 * поиск канон-плит, создание эпизода, само ИМЯ файла в `register-canon`, публикация.
 * На другом сериале `peek-canon` честно отвечал «no canon asset SBL-… in S15» — то есть
 * станция прямых вызовов физически не переносилась на второй сериал. Это прямое нарушение
 * Звезды: «фабрика обязана переноситься на новые жанры без перестройки».
 *
 * Умолчания нет намеренно — ровно по тому же основанию, по которому его нет у
 * `RUN_EPISODE_ID`: захардкоженный id молча делает работу не над тем объектом.
 */
export function seriesId(): string {
  const v = process.env.RUN_SERIES_ID;
  if (!v) {
    throw new Error(
      'не задана RUN_SERIES_ID — сериал, над которым идёт работа. ' +
        'Умолчания нет намеренно: молчаливый чужой сериал дороже громкого отказа.',
    );
  }
  return v;
}

/** Код серии (`SS-S20`) из её строки. Нужен там, где имя ассета собирается по конвенции. */
export async function seriesCode(): Promise<string> {
  const id = seriesId();
  const { data, error } = await sb.from('series').select('code').eq('id', id).single();
  if (error || !data?.code) throw new Error(`серия ${id} не найдена: ${error?.message ?? 'нет строки'}`);
  return data.code;
}
