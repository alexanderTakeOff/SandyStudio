// Клон голоса из чистого сольного образца → custom_voice_id для gen-speech.
//
// ПОЧЕМУ ПЕРОМ. До сих пор клон снимался вручную во внешнем плейграунде, а его id
// жил в `gen-speech` примером (`Voicebcb67b451787599645`). Для реального человека,
// снятого с чужих материалов, клон нужен С НУЛЯ и в прогоне: образец в файле, id в
// изделии, трата в леджере. Записанный внешний клик повторить нечем — нужен инструмент.
//
// ФЛОУ: образец → fal storage (initiate + PUT) → `fal-ai/minimax/voice-clone`(audio_url)
// → {custom_voice_id}. Id совместим с эндпойнтом речи, которым говорит gen-speech
// (minimax speech-*), поэтому клон и синтез — две станции одного голоса.
//
// ЧТО ОТБИРАЕТ ОБРАЗЕЦ (скилл real-person-canon-open-sources, «Голос»): клон переносит
// МАНЕРУ, эмоция задаётся синтезом и шире образца. Требование к образцу — ЧИСТОТА
// дорожки (без зала, музыки, второго голоса), а не её окраска. Отсюда гард на длину и
// опора на слуховую проверку ДО клона, а не на веру.
//
// Contract: `--help`.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { sb } from './_env';
import { defineTool } from './_tool';
import { recordCost } from '../../lib/budget';
import { probeDurationSeconds } from '../../lib/providers/ffmpeg-stitch';

const CLONE_MODEL = 'fal-ai/minimax/voice-clone';
/** Цена клона по прайсу fal (сверено с доком провайдера 28.08.2026): $1.5 за запрос. */
const CLONE_COST_USD = 1.5;
/** Превью-синтез оплачивается отдельно — $0.3 за 1000 знаков текста превью. */
const PREVIEW_COST_PER_1K = 0.3;
/** Провайдер требует образец не короче 10 секунд; короче — клон выйдет бракованным. */
const MIN_SAMPLE_SEC = 10;

/** Загрузка локального файла в fal storage → публичный URL (паттерн из dub-clip). */
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

function findAudioUrl(node: unknown): string | null {
  if (!node || typeof node !== 'object') return null;
  for (const value of Object.values(node as Record<string, unknown>)) {
    if (typeof value === 'string' && value.startsWith('https://') && /\.(mp3|wav)/.test(value)) return value;
    const nested = findAudioUrl(value);
    if (nested) return nested;
  }
  return null;
}

interface CloneResult {
  voiceId: string;
  previewUrl: string | null;
}

async function runClone(
  audioUrl: string,
  opts: { noiseReduction: boolean; normalize: boolean; previewText: string },
  key: string,
): Promise<CloneResult> {
  const payload: Record<string, unknown> = {
    audio_url: audioUrl,
    noise_reduction: opts.noiseReduction,
    need_volume_normalization: opts.normalize,
  };
  if (opts.previewText) payload.text = opts.previewText;

  const submit = await fetch(`https://queue.fal.run/${CLONE_MODEL}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Key ${key}` },
    body: JSON.stringify(payload),
  });
  const body = await submit.text();
  if (!submit.ok) throw new Error(`клон ${submit.status}: ${body.slice(0, 300)}`);
  const job = JSON.parse(body) as { status_url: string; response_url: string };

  for (let i = 0; i < 60; i += 1) {
    await new Promise((r) => setTimeout(r, 4000));
    const st = (await (await fetch(job.status_url, { headers: { Authorization: `Key ${key}` } })).json()) as { status?: string };
    if (st.status === 'COMPLETED') break;
    if (st.status === 'FAILED') throw new Error('клонирование упало на стороне провайдера');
  }

  const result = await (await fetch(job.response_url, { headers: { Authorization: `Key ${key}` } })).text();
  const parsed = JSON.parse(result) as { custom_voice_id?: string };
  if (!parsed.custom_voice_id) throw new Error(`провайдер не вернул custom_voice_id: ${result.slice(0, 200)}`);
  return { voiceId: parsed.custom_voice_id, previewUrl: findAudioUrl(parsed) };
}

export default defineTool(
  {
    name: 'voice-clone',
    summary: 'Клон голоса из чистого сольного образца → custom_voice_id для gen-speech. Клон переносит манеру; эмоция — параметр синтеза.',
    args: {
      sample: { about: 'образец речи — mp3/wav, чистая сольная дорожка без зала/музыки/второго голоса, не короче 10 c' },
      out: { about: 'куда записать след клона (.json: voice_id, источник, превью) — абсолютный путь или от корня `webapp/`' },
      'noise-reduction': { about: 'шумоподавление на стороне провайдера', default: 'yes', values: ['yes', 'no'] },
      normalize: { about: 'нормализация громкости клона', default: 'yes', values: ['yes', 'no'] },
      'preview-text': {
        about: 'текст короткого превью, чтобы УСЛЫШАТЬ клон до эпизода; пусто — превью не синтезируется. Оплачивается отдельно ($0.3/1000 знаков)',
        default: '',
      },
    },
    env: {
      FAL_KEY: { about: 'ключ провайдера клонирования' },
      RUN_EPISODE_ID: { about: 'эпизод, на который списывается трата' },
    },
    reads: ['episodes'],
    writes: ['budget_log'],
    stations: [],
  },
  async ({ arg, env }) => {
    const episodeId = env('RUN_EPISODE_ID');
    const key = env('FAL_KEY');

    const sample = resolve(process.cwd(), arg('sample'));
    if (!existsSync(sample)) throw new Error(`образец не найден: ${sample}`);
    const duration = await probeDurationSeconds(sample);
    if (duration !== null && duration < MIN_SAMPLE_SEC) {
      throw new Error(`образец ${duration.toFixed(1)} c — короче ${MIN_SAMPLE_SEC} c, клон выйдет бракованным`);
    }

    const contentType = extname(sample).toLowerCase() === '.wav' ? 'audio/wav' : 'audio/mpeg';
    const audioUrl = await upload(sample, `voice-sample${extname(sample) || '.mp3'}`, contentType, key);

    const previewText = arg('preview-text').trim();
    const { voiceId, previewUrl } = await runClone(
      audioUrl,
      { noiseReduction: arg('noise-reduction') === 'yes', normalize: arg('normalize') === 'yes', previewText },
      key,
    );

    const cost = CLONE_COST_USD + (previewText.length / 1000) * PREVIEW_COST_PER_1K;
    await recordCost(sb as never, {
      jobId: null,
      episodeId,
      agentId: 'DIRECT-RUN' as never,
      apiProvider: 'fal_ai',
      modelOrTier: CLONE_MODEL,
      operation: 'voice_clone',
      costUsd: cost,
    });

    const outPath = resolve(process.cwd(), arg('out'));
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(
      outPath,
      JSON.stringify(
        {
          voice_id: voiceId,
          source_sample: arg('sample'),
          model: CLONE_MODEL,
          noise_reduction: arg('noise-reduction') === 'yes',
          normalize: arg('normalize') === 'yes',
          preview_url: previewUrl,
        },
        null,
        2,
      ),
    );

    // Превью — вещь, которую слушают: кладём рядом mp3, а не только ссылку.
    if (previewUrl) {
      const previewPath = `${outPath.replace(/\.json$/, '')}.preview.mp3`;
      writeFileSync(previewPath, new Uint8Array(await (await fetch(previewUrl)).arrayBuffer()));
      console.log(`превью: ${previewPath}`);
    }

    console.log(`OK voice_id=${voiceId} · $${cost.toFixed(3)} · ${outPath} · ledger ok`);
    console.log('дальше: этот voice_id подаётся в gen-speech --voice');
  },
);
