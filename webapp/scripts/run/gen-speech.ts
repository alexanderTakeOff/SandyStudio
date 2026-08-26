// Речь голосом клона: такты со своими параметрами, паузы дугой, склейка.
//
// ПОЧЕМУ ПЕРОМ, А НЕ РЕЦЕПТОМ (26.08). Станция речи была разведана боем и
// описана в маршруте готовыми вызовами — но исполняла её только та сессия, что
// рецепт писала. Полина довела эпизод до видео и встала: положить звук было
// НЕЧЕМ, и клип вышел немым. Записанный вызов повторяет автор; всем остальным
// нужен инструмент.
//
// ДУГА СОБИРАЕТСЯ КУСКАМИ: одна фраза = один вызов TTS с одними параметрами,
// поэтому ровный голос — не свойство клона, а отсутствие дуги. Такты
// разделяются `|`, каждый может нести свои скорость и громкость.
//
// Contract: `--help`.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { sb, runEnv } from './_env';
import { defineTool } from './_tool';
import { runFfmpeg, probeDurationSeconds } from '../../lib/providers/ffmpeg-stitch';
import { recordCost } from '../../lib/budget';
import { parseBeats, type SpeechBeat } from '../../lib/api/speech-beats';

const MODEL = 'fal-ai/minimax/speech-2.8-hd';
/** Цена такта по факту прогонов 25–26.08. */
const COST_PER_BEAT = 0.008;
/** Пауза между тактами по умолчанию — часть дуги, а не пустота. */
const DEFAULT_GAP_SEC = 0.5;

function findAudioUrl(node: unknown): string | null {
  if (!node || typeof node !== 'object') return null;
  for (const value of Object.values(node as Record<string, unknown>)) {
    if (typeof value === 'string' && value.startsWith('https://') && /\.(mp3|wav)/.test(value)) return value;
    const nested = findAudioUrl(value);
    if (nested) return nested;
  }
  return null;
}

async function synthBeat(beat: SpeechBeat, voiceId: string, emotion: string, key: string, out: string): Promise<void> {
  const submit = await fetch(`https://queue.fal.run/${MODEL}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Key ${key}` },
    body: JSON.stringify({
      text: beat.text,
      voice_setting: { voice_id: voiceId, speed: beat.speed, vol: beat.vol, emotion },
      language_boost: 'Russian',
      output_format: 'url',
    }),
  });
  const body = await submit.text();
  if (!submit.ok) throw new Error(`TTS ${submit.status}: ${body.slice(0, 300)}`);
  const job = JSON.parse(body) as { status_url: string; response_url: string };
  for (let i = 0; i < 60; i += 1) {
    await new Promise((r) => setTimeout(r, 4000));
    const st = (await (await fetch(job.status_url, { headers: { Authorization: `Key ${key}` } })).json()) as { status?: string };
    if (st.status === 'COMPLETED') break;
    if (st.status === 'FAILED') throw new Error(`TTS упал на такте «${beat.text.slice(0, 40)}»`);
  }
  const result = await (await fetch(job.response_url, { headers: { Authorization: `Key ${key}` } })).text();
  const url = findAudioUrl(JSON.parse(result));
  if (!url) throw new Error(`TTS не отдал ссылку: ${result.slice(0, 200)}`);
  writeFileSync(out, new Uint8Array(await (await fetch(url)).arrayBuffer()));
}

export default defineTool(
  {
    name: 'gen-speech',
    summary: 'Речь голосом клона: реплика делится на такты со своими параметрами, склеивается паузами в дугу.',
    args: {
      line: { about: 'реплика. Такты делятся `|`; параметры такта — `текст@скорость` или `текст@скорость:громкость`' },
      voice: { about: 'голос: id клона (`Voicebcb67b451787599645`) ИЛИ пресет провайдера — `Determined_Man`, `Exuberant_Girl`, `Wise_Woman`, `Lively_Girl`, `Calm_Woman`, `Deep_Voice_Man`, `Patient_Man`, `Casual_Guy`, `Abbess`. Пресет не требует образца (O29)' },
      out: { about: 'куда положить mp3 — абсолютный путь или от корня `webapp/`' },
      speed: { about: 'скорость по умолчанию. Выше 0,95 добавляет металл в тембр (вердикт Директора 25.08)', default: '0.93' },
      gap: { about: 'пауза между тактами в секундах; пауза — часть дуги, а не пустота', default: String(DEFAULT_GAP_SEC) },
      'pad-to': { about: 'дотянуть дорожку тишиной до этой длины в секундах — липсинк режет клип по звуку', default: '' },
      // Эмоция шире образца (O12, 24.08) и была зашита в `neutral` — доказанный
      // рычаг стоял выключенным: крикливость не берётся ни скоростью, ни текстом.
      emotion: {
        about: 'окраска речи; шире образца голоса — на мягком голосе `angry` даёт железо в тембре (O12)',
        default: 'neutral',
        values: ['neutral', 'happy', 'sad', 'angry', 'fearful', 'disgusted', 'surprised'],
      },
    },
    env: {
      FAL_KEY: { about: 'ключ провайдера речи' },
      RUN_EPISODE_ID: { about: 'эпизод, на который списывается трата' },
    },
    reads: ['episodes'],
    writes: ['budget_log'],
    stations: [],
  },
  async ({ arg, env }) => {
    const episodeId = env('RUN_EPISODE_ID');
    const key = env('FAL_KEY');
    const beats = parseBeats(arg('line'), Number(arg('speed')));
    if (beats.length === 0) throw new Error('реплика пустая — нечего произносить');

    const outPath = resolve(process.cwd(), arg('out'));
    mkdirSync(dirname(outPath), { recursive: true });
    const work = mkdtempSync(join(tmpdir(), 'ss-speech-'));

    try {
      const parts: string[] = [];
      const gap = Number(arg('gap'));
      if (gap > 0) {
        const silence = join(work, 'gap.mp3');
        await runFfmpeg(['-v', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=32000:cl=mono', '-t', String(gap), '-c:a', 'libmp3lame', '-q:a', '4', silence]);
        for (let i = 0; i < beats.length; i += 1) {
          const file = join(work, `b${i}.mp3`);
          await synthBeat(beats[i], arg('voice'), arg('emotion'), key, file);
          console.log(`такт ${i + 1}/${beats.length}: скорость ${beats[i].speed} · «${beats[i].text.slice(0, 48)}»`);
          if (i > 0) parts.push(silence);
          parts.push(file);
        }
      } else {
        for (let i = 0; i < beats.length; i += 1) {
          const file = join(work, `b${i}.mp3`);
          await synthBeat(beats[i], arg('voice'), arg('emotion'), key, file);
          parts.push(file);
        }
      }

      const list = join(work, 'list.txt');
      writeFileSync(list, parts.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n'));
      const glued = join(work, 'glued.mp3');
      await runFfmpeg(['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c:a', 'libmp3lame', '-q:a', '2', '-ar', '32000', '-ac', '1', glued]);

      const padTo = arg('pad-to').trim();
      if (padTo) {
        // Липсинк ОБРЕЗАЕТ клип по длине звука: 10 секунд видео с речью 6 секунд
        // вернутся шестисекундными, и хвост сценария пропадёт (O24, 26.08).
        await runFfmpeg(['-v', 'error', '-y', '-i', glued, '-af', `apad=whole_dur=${padTo}`, '-c:a', 'libmp3lame', '-q:a', '2', outPath]);
      } else {
        await runFfmpeg(['-v', 'error', '-y', '-i', glued, '-c', 'copy', outPath]);
      }

      const cost = beats.length * COST_PER_BEAT;
      await recordCost(sb as never, {
        jobId: null,
        episodeId,
        agentId: 'DIRECT-RUN' as never,
        apiProvider: 'fal_ai',
        modelOrTier: MODEL,
        operation: 'speech_synthesis',
        costUsd: cost,
      });

      const duration = await probeDurationSeconds(outPath);
      console.log(`OK ${outPath} · ${duration?.toFixed(2) ?? '?'} с · тактов ${beats.length} · $${cost.toFixed(3)} · ledger ok`);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
    if (!existsSync(outPath)) throw new Error(`файл не появился: ${outPath}`);
  },
);
