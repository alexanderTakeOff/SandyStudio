// Озвучить готовый клип: губы под дорожку, атмосфера места, сведение до
// вещательного уровня.
//
// ПОЧЕМУ ПЕРОМ (26.08). Клип Полины вышел НЕМЫМ: видео-провайдер речи не даёт, а
// положить её сверху было нечем — рецепт в маршруте был, инструмента не было.
// Директор: «последние несколько раз подряд у нас проблемы со звуком в финале».
//
// ТРИ СЛОЯ, И КАЖДЫЙ ОПЛАЧЕН БРАКОМ:
//  · липсинк не трогает движение базового клипа (0,99 → 0,98), но ОБРЕЗАЕТ его
//    по длине звука — дорожка готовится под клип, а не под текст;
//  · атмосфера ставится ПО ВИДЕО, и вход для неё — техзадание: увидит говорящий
//    рот — сочинит речь на несуществующем языке, поэтому подаётся полоса кадра
//    БЕЗ лица;
//  · `amix` просаживает уровень даже с `normalize=0`, а дорожка из TTS приходит
//    моно 32 кГц — часть плееров её не играет вовсе. Отсюда `loudnorm`, 48 кГц и
//    стерео в конце цепочки.
//
// Contract: `--help`.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { sb, runEnv } from './_env';
import { defineTool } from './_tool';
import { runFfmpeg, probeDurationSeconds } from '../../lib/providers/ffmpeg-stitch';
import { recordCost } from '../../lib/budget';

const LIPSYNC_MODEL = 'fal-ai/sync-lipsync/v3';
const AMBIENCE_MODEL = 'fal-ai/thinksound';
const LIPSYNC_COST = 0.15;
const AMBIENCE_COST = 0.05;
/** Голос громче фона во столько раз по умолчанию: фон — «не тишина», а не событие. */
const DEFAULT_AMBIENCE_LEVEL = 0.05;

async function upload(path: string, name: string, contentType: string, key: string): Promise<string> {
  const init = await fetch('https://rest.alpha.fal.ai/storage/upload/initiate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Key ${key}` },
    body: JSON.stringify({ file_name: name, content_type: contentType }),
  });
  const text = await init.text();
  if (!init.ok) throw new Error(`сторадж ${init.status}: ${text.slice(0, 200)}`);
  const { upload_url, file_url } = JSON.parse(text) as { upload_url: string; file_url: string };
  const put = await fetch(upload_url, { method: 'PUT', headers: { 'content-type': contentType }, body: readFileSync(path) });
  if (!put.ok) throw new Error(`загрузка ${put.status}`);
  return file_url;
}

function findMediaUrl(node: unknown, pattern: RegExp): string | null {
  if (!node || typeof node !== 'object') return null;
  for (const value of Object.values(node as Record<string, unknown>)) {
    if (typeof value === 'string' && value.startsWith('https://') && pattern.test(value)) return value;
    const nested = findMediaUrl(value, pattern);
    if (nested) return nested;
  }
  return null;
}

async function runJob(model: string, payload: unknown, key: string, pattern: RegExp, out: string): Promise<void> {
  const submit = await fetch(`https://queue.fal.run/${model}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Key ${key}` },
    body: JSON.stringify(payload),
  });
  const body = await submit.text();
  if (!submit.ok) throw new Error(`${model} ${submit.status}: ${body.slice(0, 300)}`);
  const job = JSON.parse(body) as { request_id: string; status_url: string; response_url: string };
  // request_id на диск ДО поллинга: фоновую задачу может убить харнесс, а
  // задание провайдера продолжит считаться — по id результат забирается позже.
  writeFileSync(`${out}.request.json`, JSON.stringify(job, null, 2));
  for (let i = 0; i < 90; i += 1) {
    await new Promise((r) => setTimeout(r, 10000));
    const st = (await (await fetch(job.status_url, { headers: { Authorization: `Key ${key}` } })).json()) as { status?: string };
    if (st.status === 'COMPLETED') break;
    if (st.status === 'FAILED') throw new Error(`${model}: задание упало`);
  }
  const result = await (await fetch(job.response_url, { headers: { Authorization: `Key ${key}` } })).text();
  const url = findMediaUrl(JSON.parse(result), pattern);
  if (!url) throw new Error(`${model} не отдал результат: ${result.slice(0, 200)}`);
  writeFileSync(out, new Uint8Array(await (await fetch(url)).arrayBuffer()));
}

export default defineTool(
  {
    name: 'dub-clip',
    summary: 'Кладёт звук на готовый клип: губы под дорожку, атмосфера места по видео, сведение до вещательного уровня.',
    args: {
      clip: { about: 'исходный клип — абсолютный путь или от корня `webapp/`' },
      voice: { about: 'дорожка речи (mp3). Пусто — только атмосфера и сведение', default: '' },
      out: { about: 'куда положить озвученный клип' },
      lipsync: { about: 'двигать губы под дорожку. `no` — просто подложить звук', default: 'yes', values: ['yes', 'no'] },
      ambience: { about: 'сочинить атмосферу места ПО ВИДЕО и подмешать', default: 'yes', values: ['yes', 'no'] },
      'ambience-level': { about: 'громкость фона относительно голоса; 0,05 — «не тишина», 0,15 — двор слышен', default: String(DEFAULT_AMBIENCE_LEVEL) },
      'ambience-hint': { about: 'что должно звучать: источники, а не настроение', default: 'quiet residential courtyard, sparrows, light wind, a car passing far away' },
    },
    env: {
      FAL_KEY: { about: 'ключ провайдера' },
      RUN_EPISODE_ID: { about: 'эпизод, на который списываются траты' },
    },
    reads: ['episodes'],
    writes: ['budget_log'],
    stations: [],
  },
  async ({ arg, env }) => {
    const episodeId = env('RUN_EPISODE_ID');
    const key = env('FAL_KEY');
    const clip = resolve(process.cwd(), arg('clip'));
    if (!existsSync(clip)) throw new Error(`клипа нет: ${clip}`);
    const outPath = resolve(process.cwd(), arg('out'));
    mkdirSync(dirname(outPath), { recursive: true });
    const work = mkdtempSync(join(tmpdir(), 'ss-dub-'));
    let spent = 0;

    try {
      const clipDuration = (await probeDurationSeconds(clip)) ?? 0;
      let video = clip;

      // 1) ГУБЫ. Дорожка обязана быть не короче клипа, иначе липсинк обрежет его
      // по звуку и хвост сценария пропадёт.
      const voice = arg('voice').trim() ? resolve(process.cwd(), arg('voice')) : null;
      if (voice && arg('lipsync') === 'yes') {
        const voiceDuration = (await probeDurationSeconds(voice)) ?? 0;
        let voiceForSync = voice;
        if (voiceDuration + 0.15 < clipDuration) {
          voiceForSync = join(work, 'voice-padded.mp3');
          await runFfmpeg(['-v', 'error', '-y', '-i', voice, '-af', `apad=whole_dur=${(clipDuration + 0.1).toFixed(2)}`, '-c:a', 'libmp3lame', '-q:a', '2', voiceForSync]);
          console.log(`дорожка дотянута тишиной: ${voiceDuration.toFixed(2)} → ${clipDuration.toFixed(2)} с (иначе липсинк обрежет клип)`);
        }
        const synced = join(work, 'synced.mp4');
        await runJob(
          LIPSYNC_MODEL,
          { video_url: await upload(video, 'clip.mp4', 'video/mp4', key), audio_url: await upload(voiceForSync, 'voice.mp3', 'audio/mpeg', key) },
          key,
          /\.(mp4|webm)/,
          synced,
        );
        video = synced;
        spent += LIPSYNC_COST;
        console.log(`губы сведены · $${LIPSYNC_COST.toFixed(2)}`);
      }

      // 2) АТМОСФЕРА. Вход — техзадание: показываем ТОЛЬКО то, что должно
      // звучать. Верхняя полоса кадра, где говорящего рта нет ни в одном моменте.
      let ambience: string | null = null;
      if (arg('ambience') === 'yes') {
        const strip = join(work, 'strip.mp4');
        await runFfmpeg(['-v', 'error', '-y', '-i', clip, '-vf', 'crop=iw:ih*0.22:0:0', '-an', strip]);
        const ambienceClip = join(work, 'ambience.mp4');
        await runJob(AMBIENCE_MODEL, { video_url: await upload(strip, 'strip.mp4', 'video/mp4', key), prompt: arg('ambience-hint') }, key, /\.(mp4|wav|mp3)/, ambienceClip);
        ambience = join(work, 'ambience.mp3');
        await runFfmpeg(['-v', 'error', '-y', '-i', ambienceClip, '-vn', '-c:a', 'libmp3lame', '-q:a', '2', ambience]);
        spent += AMBIENCE_COST;
        console.log(`атмосфера сочинена по видео · $${AMBIENCE_COST.toFixed(2)}`);
      }

      // 3) СВЕДЕНИЕ. Без loudnorm/48k/стерео файл «есть, но на телефоне молчит».
      const level = Number(arg('ambience-level'));
      const args: string[] = ['-v', 'error', '-y', '-i', video];
      if (ambience) args.push('-i', ambience);
      const filter = ambience
        ? `[0:a]aresample=48000[a0];[1:a]aresample=48000,highpass=f=90,volume=${level}[a1];[a0][a1]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,aformat=channel_layouts=stereo[a]`
        : `[0:a]aresample=48000,loudnorm=I=-16:TP=-1.5:LRA=11,aformat=channel_layouts=stereo[a]`;
      args.push('-filter_complex', filter, '-map', '0:v', '-map', '[a]',
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-shortest', '-movflags', '+faststart', outPath);
      await runFfmpeg(args);

      if (spent > 0) {
        await recordCost(sb as never, {
          jobId: null, episodeId, agentId: 'DIRECT-RUN' as never, apiProvider: 'fal_ai',
          modelOrTier: 'sync-lipsync/v3 + thinksound', operation: 'clip_dubbing', costUsd: spent,
        });
      }

      // Приёмка звука — числом. «Слышно» без замера приёмкой не является.
      const check = await runFfmpeg(['-hide_banner', '-nostats', '-i', outPath, '-af', 'volumedetect', '-f', 'null', '-']);
      const mean = /mean_volume:\s*(-?[\d.]+) dB/.exec(check);
      console.log(`OK ${outPath} · уровень ${mean?.[1] ?? '?'} dB · $${spent.toFixed(2)} · ledger ok`);
      if (mean && Number(mean[1]) < -25) {
        console.log('ВНИМАНИЕ: средний ниже −25 dB — на телефоне будет тихо или ничего. Проверь исходную дорожку.');
      }
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  },
);
