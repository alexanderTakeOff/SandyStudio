// Предложение темы в банк серии (Ф6 миграции — замена чат-тула proposeTheme).
// Тонкая обёртка над РОУТОМ /api/series/[id]/themes: он держит слаг-гард,
// провенанс и рождение в draft — дублировать было бы второй реализацией.
// Contract: `--help`.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineTool } from './_tool';

export default defineTool(
  {
    name: 'theme-propose',
    summary: 'Кладёт ОДНУ тему (гэг-движок) в банк серии как draft; кураторский вердикт — за Директором в UI.',
    args: {
      slug: { about: 'слаг темы, snake_case' },
      desc: { about: 'однострочник для индекса — что за движок, одной фразой' },
      'content-file': { about: 'файл с полным описанием темы (markdown); `inline:<текст>` тоже принят' },
    },
    env: { RUN_SERIES_ID: { about: 'сериал, в чей банк кладём' } },
    reads: ['series'],
    writes: ['assets'],
    stations: ['brief'],
  },
  async ({ arg, env }) => {
    const raw = arg('content-file');
    const content = raw.startsWith('inline:')
      ? raw.slice('inline:'.length)
      : readFileSync(resolve(process.cwd(), raw), 'utf8');

    const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
    const token = process.env.EXEC_DIR_AI_TOKEN;
    const res = await fetch(`${base}/api/series/${env('RUN_SERIES_ID')}/themes`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ slug: arg('slug'), description: arg('desc'), content }),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new Error(`тема отклонена (${res.status}): ${JSON.stringify(body).slice(0, 300)}`);
    console.log(`тема ${arg('slug')} легла в банк draft'ом — кураторский вердикт за Директором`);
  },
);
