// Кастинг эпизода прямым вызовом (Ф6 миграции — замена чат-тула castEpisode).
//
// Урок 09.08: инструмент несёт не только действие, но и КОНТРАКТ изделия —
// когда castEpisode срезали кил-листом, форма каста исчезла и ум честно
// импровизировал markdown-таблицей, которую машина не видит. Этот CLI держит
// контракт тем же кодом, что роут: POST /api/episodes/[id]/cast рождает
// SPC-episode_cast в REVIEW с machine-readable metadata.cast.
// Contract: `--help`.
import { defineTool } from './_tool';

export default defineTool(
  {
    name: 'cast-episode',
    summary: 'Оформляет каст эпизода из слагов канона: SPC-episode_cast в REVIEW, ратификация за Директором.',
    args: {
      slugs: { about: 'слаги плит канона через запятую (например location_x,character_y)' },
      notes: { about: 'краткое обоснование состава — Директор читает его на гейте', default: '' },
    },
    env: {
      RUN_EPISODE_ID: { about: 'эпизод, которому оформляется каст' },
    },
    reads: ['assets', 'episodes'],
    writes: ['assets', 'activity_events'],
    stations: ['casting'],
  },
  async ({ arg, env }) => {
    const slugs = arg('slugs')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (slugs.length === 0) throw new Error('нужен хотя бы один слаг канона');

    // Через РОУТ, не копией его логики: роут держит preflight (LOCKED-канон,
    // существование слагов) и рождает decision_requested — дублировать это
    // здесь значило бы завести вторую расходящуюся реализацию.
    const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
    const token = process.env.EXEC_DIR_AI_TOKEN;
    const res = await fetch(`${base}/api/episodes/${env('RUN_EPISODE_ID')}/cast`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ cast: slugs, notes: arg('notes') || undefined }),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new Error(`каст отклонён (${res.status}): ${JSON.stringify(body).slice(0, 400)}`);
    }
    const data = (body.data ?? body) as Record<string, unknown>;
    console.log(`каст оформлен: asset ${String(data.assetId ?? data.asset_id ?? '?')} · REVIEW`);
    console.log(`состав: ${slugs.join(' · ')}`);
    console.log('ратификация за Директором (approve) — Writer стартует после неё');
  },
);
