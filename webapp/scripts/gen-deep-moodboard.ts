// ──────────────────────────────────────────────────────────────────────────────
// scripts/gen-deep-moodboard.ts
// Пять кадров мудборда серии «ГЛУБИНА» (SS-S20) через ШТАТНЫЙ слой студии:
// `generateImageOpenAI` (lib/agents/providers/openai-image) + `recordCost`
// (lib/budget) — чтобы расход попал в budget_log, а не мимо учёта.
//
// Директор 2026-07-29: «бери наши штатные генераторы из сэндистудио».
//
// Запуск (cwd = webapp):
//   npx tsx --env-file=.env.local scripts/gen-deep-moodboard.ts
//   npx tsx --env-file=.env.local scripts/gen-deep-moodboard.ts --only 2-reveal
//
// Кадры кладутся в public/staging/deep-moodboard/. Эпизода у серии ещё нет,
// поэтому episodeId = null — строка расхода пишется без привязки к эпизоду.
// ──────────────────────────────────────────────────────────────────────────────

import { promises as fs } from 'node:fs';
import fs2 from 'node:fs';
import path from 'node:path';
import { generateImageOpenAI } from '../lib/agents/providers/openai-image';
import { recordCost } from '../lib/budget';

/** Канон стиля серии — тот же текст, что в FILMS/Deep/canon_minimum.md §1. */
const STYLE = [
  'Stylized cinematic CG render, not photorealistic and not cartoon.',
  'Near-total darkness: about 90% of the frame is pure deep black, never grey.',
  'Exposure is set for the light cone; everything outside it falls to absolute black.',
  'Volumetric beam with visible marine snow particles drifting inside it.',
  'Palette limited to three: near-black with a blue bias, cold teal-green light from',
  'technology, warm amber light from fire. No fourth colour.',
  'High contrast, silhouette readability over surface detail.',
  'Deep ocean. No water surface, no sunlight, no neon, no cartoon faces,',
  'no lettering or captions burned into the image. Wide cinematic 16:9 framing.',
].join(' ');

interface Frame { id: string; beat: string; prompt: string }

const FRAMES: Frame[] = [
  {
    id: '1-fragment',
    beat: 'Такт 1 — фрагмент',
    prompt:
      'A lamp beam picks out one steep face of a huge pale stone-like structure looming out of the black. ' +
      'Its surface is scored with deep cracks, long parallel ribs and several dark round entrance holes — ' +
      'it reads exactly like the masonry of a sunken pyramid. Scale is deliberately unreadable: nothing in ' +
      'frame tells you how big it is. The teal beam enters from the lower left, from off-screen.',
  },
  {
    id: '2-reveal',
    beat: 'Такт 3 — разворот',
    prompt:
      'Wide shot pulling far back in the black water. What looked like a sunken pyramid is revealed to be a ' +
      'single colossal tooth, and behind it a receding row of identical teeth curves away into darkness — ' +
      'the inside rim of an enormous jaw. A second light source glows from high above and behind, silhouetting ' +
      'the teeth: it is COLD white-blue, hard and steady, clearly not ours. A tiny submersible with a thin warm ' +
      'teal beam is dwarfed near the lower edge.',
  },
  {
    id: '3-porthole',
    beat: 'Рамка кадра — иллюминатор',
    prompt:
      'View from inside a deep-sea submersible looking out through a thick circular porthole. The heavy dark ' +
      'metal rim eats the edges of the frame. Faint warm amber cabin instrument lights reflect on the curved ' +
      'glass as soft diagonal streaks. Beyond the glass: the teal beam pushing into black water full of drifting ' +
      'marine snow, and the barest suggestion of something very large just outside the light.',
  },
  {
    id: '4-other-light',
    beat: 'Закон 2 — чужой свет',
    prompt:
      'Total blackness with a single distant, perfectly steady, COLD white-blue point of light far away — it ' +
      'reads like a station beacon or another vessel, like rescue. In the near foreground, the ragged edge of ' +
      'our own teal beam with its drifting particles, dimmer and warmer by comparison. Vast empty black water ' +
      'between the two lights. Ominous stillness.',
  },
  {
    id: '5-engraving',
    beat: 'Слово в кадре — гравировка',
    prompt:
      'Extreme close-up of weathered carved marks cut into a dark stone-like surface, raked by a low grazing ' +
      'teal beam so the incisions throw hard shadows. The carving is eroded and ancient, partly filled with silt ' +
      'and pale growth. Abstract worn glyph-like incisions, unreadable. Everything around the lit patch is black.',
  },
];

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : null;
}

async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.error('OPENAI_API_KEY отсутствует — добавь в webapp/.env.local');
    process.exit(1);
  }

  const only = arg('only');
  // Канон-режим: тот же штатный путь (адаптер + recordCost), но промпт из файла.
  // Заведён, чтобы не плодить второй скрипт под генерацию канон-ассетов.
  const promptFile = arg('prompt-file');
  const customId = arg('id') ?? 'canon-frame';
  const size = (arg('size') ?? '1536x1024') as '1536x1024' | '1024x1024' | '1024x1536';
  const outDir = path.join(process.cwd(), 'public', 'staging', 'deep-moodboard');
  await fs.mkdir(outDir, { recursive: true });

  // Клиент — как в остальных .mts-скриптах (см. hog-memory-append.mts):
  // прямой service-role, потому что `lib/supabase/server` тянет next/headers.
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  ) as never;
  const list: Frame[] = promptFile
    ? [{ id: customId, beat: 'канон', prompt: fs2.readFileSync(promptFile, 'utf8') }]
    : only
      ? FRAMES.filter((f) => f.id === only)
      : FRAMES;
  let total = 0;

  for (const f of list) {
    process.stdout.write(`→ ${f.id.padEnd(14)} ${f.beat} ... `);
    const startedAt = Date.now();

    const result = await generateImageOpenAI({
      prompt: `${f.prompt}\n\n${STYLE}`,
      size,
      quality: 'high',
    });
    const durationMs = Date.now() - startedAt;

    const file = path.join(outDir, `${f.id}.png`);
    await fs.writeFile(file, Buffer.from(result.b64_data, 'base64'));

    // Расход в штатный леджер. Эпизода нет → episodeId null, потолок не
    // применяется (enforceCeiling false): деньги уже потрачены к моменту записи.
    await recordCost(supabase, {
      jobId: null,
      episodeId: null,
      agentId: 'EXEC-EREF',
      costUsd: result.cost_usd,
      apiProvider: 'openai',
      modelOrTier: result.provider,
      operation: 'moodboard_frame',
      durationMs,
      enforceCeiling: false,
    });

    total += result.cost_usd;
    console.log(`ок  ${(result.size_bytes / 1024 / 1024).toFixed(1)} МБ  $${result.cost_usd.toFixed(3)}  ${(durationMs / 1000).toFixed(0)}с`);
  }

  console.log(`\nитого $${total.toFixed(2)} · записано в budget_log как EXEC-EREF / moodboard_frame`);
  console.log(`кадры: ${outDir}`);
}

main().catch((err) => {
  console.error('[gen-deep-moodboard] упал:', err);
  process.exit(1);
});
