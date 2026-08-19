// УШИ единого разума: расшифровать голосовое Директора в текст.
//
// Пара к `show-asset` («глаза»). Дыра, которую он закрывает, была найдена живьём
// 19.08: Директор кинул в инбокс `.ogg` из телеграма без подписи и велел оформить
// его штатным инструментом. Read бинарь не читает, аудио-модальности у ума нет, а
// в `lib/providers` не было ни одного speech-to-text — и вход от Директора
// упирался в стоп на каждом голосовом. §9 доктрины велит объявлять отсутствующую
// способность честно; этот файл её просто добавляет.
//
// Инструмент СКВОЗНОЙ и намеренно НЕ привязан к станции: голосовое — это ВХОД
// Директора, а не изделие. Он ничего не заводит в студию: чем стать услышанному —
// идеей, брифом, плитой канона, — решает ум, прочитав текст. Расшифровка,
// оформляющая себя сама, завела бы в базу выдуманный смысл.
//
// Гейт денег (`assertEpisodeReadyToSpend`) здесь НЕ применяется сознательно, в
// отличие от `gen-frame`/`gen-video`: минута речи стоит $0,006 — дешевле любого
// кадра на два порядка, — а запереть слух за потолком бюджета значит запереть
// общение с Директором ровно тогда, когда потолок близко и говорить надо больше
// всего. Трата при этом пишется в `budget_log` как любая другая: мимо леджера
// денег нет (§16), гейт и запись — разные вещи.
// Контракт: `--help`.
import { existsSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { sb, runEnv } from './_env';
import { defineTool } from './_tool';
import { fetchWithTimeout, FETCH_TIMEOUTS } from '../../lib/providers/fetch-with-timeout';
import { probeDurationSeconds } from '../../lib/providers/ffmpeg-stitch';

/** Ставка OpenAI за минуту аудио. Обе модели тарифицируются одинаково. */
const USD_PER_MINUTE = 0.006;

/** Расширение → MIME: multipart без него получает `application/octet-stream` и отказ. */
const MIME: Record<string, string> = {
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.mp4': 'audio/mp4',
  '.wav': 'audio/wav',
  '.webm': 'audio/webm',
  '.flac': 'audio/flac',
};

export default defineTool(
  {
    name: 'hear',
    summary: 'Слышит аудио: расшифровывает голосовое в текст и пишет цену в `budget_log`.',
    args: {
      file: { about: 'путь к аудиофайлу — абсолютный или от корня `webapp/`' },
      language: {
        about: 'язык записи, ISO-639-1 (`ru`, `en`). Пусто — модель определяет сама, но по-русски ошибается чаще',
        default: 'ru',
      },
      model: {
        // §11.9 CLAUDE.md велит брать провайдера из настроек студии, а не из env.
        // Настройки «слух» в `app_config` пока НЕТ — заводить её в UI решает
        // Директор. Пока её нет, выбор живёт здесь и называется вслух, а не
        // прячется в переменную окружения: это ровно то, что правило запрещает.
        about: 'модель расшифровки; настройки студии для слуха пока нет — выбор здесь',
        default: 'gpt-4o-transcribe',
        values: ['gpt-4o-transcribe', 'gpt-4o-mini-transcribe', 'whisper-1'],
      },
      hint: {
        about: 'подсказка модели: имена и термины студии, которые она иначе перевирает (`Сэнди, раскадровка, реф`)',
        default: '',
      },
      out: { about: 'куда положить расшифровку текстом; пусто — только печать', default: '' },
    },
    env: {
      OPENAI_API_KEY: { about: 'ключ OpenAI; без него инструмент не стартует' },
    },
    writes: ['budget_log'],
    // Сквозной: вход Директора приходит на любой станции.
    stations: [],
  },
  async ({ arg, env }) => {
    const file = resolve(process.cwd(), arg('file'));
    if (!existsSync(file)) throw new Error(`файла нет: ${file}`);

    const ext = (file.match(/\.[a-z0-9]+$/i)?.[0] ?? '').toLowerCase();
    const mime = MIME[ext];
    if (!mime) {
      throw new Error(`не знаю формат ${ext || '(без расширения)'} — умею: ${Object.keys(MIME).join(' · ')}`);
    }

    const bytes = readFileSync(file);
    const sizeMb = statSync(file).size / 1024 / 1024;
    // Потолок OpenAI на загрузку — 25 МБ. Отказ ДО траты трафика и времени.
    if (sizeMb > 25) throw new Error(`файл ${sizeMb.toFixed(1)} МБ — потолок OpenAI 25 МБ; нарежь или пережми`);

    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(bytes)], { type: mime }), basename(file));
    form.append('model', arg('model'));
    form.append('response_format', 'json');
    if (arg('language')) form.append('language', arg('language'));
    if (arg('hint')) form.append('prompt', arg('hint'));

    const t0 = Date.now();
    const res = await fetchWithTimeout(
      'https://api.openai.com/v1/audio/transcriptions',
      { method: 'POST', headers: { Authorization: `Bearer ${env('OPENAI_API_KEY')}` }, body: form },
      FETCH_TIMEOUTS.LLM_TEXT_MS,
    );
    const ms = Date.now() - t0;

    // Отказ провайдера показывается ДОСЛОВНО (§14): «что-то пошло не так» здесь
    // означает ещё один заход вслепую.
    if (!res.ok) {
      throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 600)}`);
    }

    const body = (await res.json()) as { text?: string };
    const text = body.text?.trim();
    if (!text) throw new Error(`ответ без текста: ${JSON.stringify(body).slice(0, 400)}`);

    // Длительность — для цены. ffprobe может отсутствовать; тогда цена считается
    // по размеру (opus телеграма ≈ 2 КБ/с) и об оценке говорится вслух, а не
    // выдаётся за факт.
    let seconds = await probeDurationSeconds(file).catch(() => null);
    const measured = seconds != null;
    if (seconds == null) seconds = (sizeMb * 1024) / 2;
    const cost = (seconds / 60) * USD_PER_MINUTE;

    const episodeId = runEnv('RUN_EPISODE_ID');
    if (episodeId) {
      const { error } = await sb.from('budget_log').insert({
        job_id: null,
        episode_id: episodeId,
        agent_id: 'DIRECT-RUN',
        api_provider: 'openai',
        model_or_tier: arg('model'),
        operation: `hear:${basename(file)}`,
        cost_usd: cost,
        duration_ms: ms,
      });
      if (error) console.error(`ЛЕДЖЕР НЕ ПРИНЯЛ (деньги потрачены, не записаны): ${error.message}`);
    } else {
      console.error('ЛЕДЖЕР МИМО: нет RUN_EPISODE_ID — трата $' + cost.toFixed(4) + ' не записана');
    }

    const out = arg('out');
    if (out) {
      const abs = resolve(process.cwd(), out);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, text, 'utf-8');
      console.log('расшифровка:', abs);
    }

    console.log(
      `${basename(file)} · ${seconds.toFixed(0)} с${measured ? '' : ' (оценка)'} · ${arg('model')} · $${cost.toFixed(4)} · ${ms} мс`,
    );
    console.log('--- услышано ---');
    console.log(text);
  },
);
