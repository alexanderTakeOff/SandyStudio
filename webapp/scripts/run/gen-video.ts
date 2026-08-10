// Direct-call shot renderer for the clean run: pads the reference frame to a true
// 9:16 with its own wall colour, then submits image-to-video to Seedance.
//
// WHY THE PAD (seedance-prompting rule 6): the render aspect and the reference
// aspect MUST match. Our frames come out 1024×1536 (2:3) because `clampSize()`
// pins the three legacy gpt-image-1 sizes (D39), while delivery is 9:16. Feeding
// a 2:3 still into a 9:16 render makes Seedance crop and recompose — content loss
// plus identity drift. Padding costs $0 and happens in ffmpeg: the top of every
// frame in this episode is bare wall, so extending it is invisible.
//
// Contract: `--help`.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { sb } from './_env';
import { defineTool } from './_tool';
import { shotFromFilename, traceInStudio, assertEpisodeReadyToSpend } from './_asset';
import { generateVideoFalSeedance } from '../../lib/providers/fal-seedance';
import { extractShotsFromStoryboard } from '../../lib/api/animatic-shotlist';

/** Sample one pixel well inside the wall area and return it as ffmpeg 0xRRGGBB. */
function wallColour(src: string): string {
  const raw = execFileSync(
    'ffmpeg',
    ['-v', 'error', '-i', src, '-vf', 'crop=1:1:8:8', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
    { maxBuffer: 1024 },
  );
  return `0x${raw.subarray(0, 3).toString('hex')}`;
}

/** Pad a 1024×1536 frame up to 1024×1820 (9:16) by extending the bare wall on top. */
function padTo916(src: string, dst: string): void {
  const colour = wallColour(src);
  execFileSync('ffmpeg', [
    '-v', 'error', '-y', '-i', src,
    '-vf', `pad=1024:1820:0:284:color=${colour}`,
    dst,
  ]);
}

export default defineTool(
  {
    name: 'gen-video',
    summary: 'Один клип из кадра: пад до 9:16 своим цветом стены, затем image-to-video на Seedance.',
    args: {
      frame: { about: 'исходный кадр PNG; падится до 9:16 рядом с собой' },
      'prompt-file': { about: 'файл с видео-промптом кадра' },
      out: { about: 'куда положить MP4; директории создаются' },
      shot: {
        about:
          'номер кадра, `sh01` — по нему клип СРАЗУ заводится в студию. Пусто — выводится ' +
          'из имени файла кадра или клипа',
        default: '',
      },
      duration: {
        // D99 (Директор, 09.08): дефолт 10с был отсебятиной — на линейной цене
        // Seedance кадр в 5с стоил вдвое. Пусто — длительность берётся ИЗ
        // РАСКАДРОВКИ (+0.5с на обрезку с каждой стороны, кламп по минимуму
        // провайдера 4с). «Больше выразительности» закладывается в раскадровку,
        // а не в длину видео.
        about: 'длительность клипа в секундах; пусто — из раскадровки (+0.5с+0.5с, min 4)',
        default: '',
      },
      tier: { about: 'тир Seedance', default: 'standard', values: ['standard', 'fast'] },
      seed: { about: 'сид для повторяемости; пусто — провайдер выбирает сам', default: '' },
    },
    // Episode comes from the environment, never hardcoded: a stale id bills the
    // wrong episode silently (2026-08-04 stocktake).
    env: { RUN_EPISODE_ID: { about: 'эпизод, на который списывается трата; без него инструмент не стартует' } },
    reads: ['assets', 'episodes'],
    writes: ['budget_log', 'assets'],
    stations: ['visual_generator'],
  },
  async ({ arg, env }) => {
    // D90: гейт денег ПЕРВЫМ действием — отказ обязан стоить ноль.
    await assertEpisodeReadyToSpend(env('RUN_EPISODE_ID'));

    const out = arg('out');
    const tier = arg('tier');
    const seedRaw = arg('seed');
    const seed = seedRaw ? Number(seedRaw) : undefined;

    // D99: длительность = кадр раскадровки + 0.5с спереди + 0.5с сзади, кламп
    // по минимуму провайдера (4с; максимум 15 держит сам fal-seedance). Явный
    // `--duration` побеждает. Раскадровка читается тем же парсером, что лента.
    const shotForDuration =
      arg('shot') || shotFromFilename(arg('out')) || shotFromFilename(arg('frame'));
    let duration = arg('duration') ? Number(arg('duration')) : NaN;
    if (!Number.isFinite(duration)) {
      if (!shotForDuration) {
        throw new Error(
          'длительность не задана и номер кадра не выводится — передай --duration или --shot',
        );
      }
      const { data: stbRows } = await sb
        .from('assets')
        .select('content,filename')
        .eq('episode_id', env('RUN_EPISODE_ID'))
        .like('file_type', 'STB%')
        .in('status', ['APPROVED', 'LOCKED'])
        .order('version', { ascending: false })
        .limit(1);
      const stb = stbRows?.[0];
      if (!stb?.content) {
        throw new Error(
          'D99: в эпизоде нет APPROVED/LOCKED раскадровки — длительность взять неоткуда; передай --duration явно',
        );
      }
      const shots = extractShotsFromStoryboard(stb.content);
      const token = shotForDuration.toUpperCase();
      const match = shots.find((s) => s.shot_id.toUpperCase().endsWith(token));
      if (!match?.duration_seconds) {
        throw new Error(
          `D99: кадр ${shotForDuration} не найден в раскадровке ${stb.filename} (или без длительности) — передай --duration явно`,
        );
      }
      duration = Math.max(4, Math.round(match.duration_seconds + 1));
      console.log(
        `duration=${duration}s (раскадровка: ${match.duration_seconds}s + 0.5+0.5, ${stb.filename})`,
      );
    }

    const srcAbs = resolve(process.cwd(), arg('frame'));
    if (!existsSync(srcAbs)) throw new Error(`frame not found: ${srcAbs}`);
    const paddedAbs = srcAbs.replace(/\.png$/, '.916.png');
    padTo916(srcAbs, paddedAbs);
    console.log(`padded → ${paddedAbs}`);

    const prompt = readFileSync(resolve(process.cwd(), arg('prompt-file')), 'utf8').trim();

    const t0 = Date.now();
    const res = await generateVideoFalSeedance({
      prompt,
      durationSeconds: duration,
      aspectRatio: '9:16',
      resolution: '720p',
      quality: tier,
      referenceImageBase64: readFileSync(paddedAbs).toString('base64'),
      referenceImageMime: 'image/png',
      seed,
    });
    const ms = Date.now() - t0;

    if (!res.mp4_b64) {
      console.error('NO VIDEO in a successful response:', JSON.stringify(res).slice(0, 400));
      process.exit(1);
    }

    const abs = resolve(process.cwd(), out);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, Buffer.from(res.mp4_b64, 'base64'));

    const { error: ledgerErr } = await sb.from('budget_log').insert({
      job_id: null,
      episode_id: env('RUN_EPISODE_ID'),
      agent_id: 'DIRECT-RUN',
      api_provider: 'fal',
      model_or_tier: `${res.model_id}/${tier}/720p/9:16`,
      operation: `clip:${out.split(/[\\/]/).pop()}`,
      cost_usd: res.cost_usd,
      duration_ms: ms,
    });
    if (ledgerErr) {
      console.error(`LEDGER FAILED (money spent, not recorded): ${ledgerErr.message}`);
      process.exit(2);
    }

    console.log(`OK ${abs}`);
    console.log(
      `cost $${res.cost_usd.toFixed(2)} · ${(ms / 1000).toFixed(0)}s · ${res.width}x${res.height} · ${res.duration_seconds}s · ledger ok`,
    );

    // След в студии — часть того же движения. Номер кадра берётся из имени
    // клипа, а если оно безымянное — из имени исходного кадра.
    const shot = arg('shot') || shotFromFilename(out) || shotFromFilename(arg('frame'));
    if (shot) {
      await traceInStudio({
        episodeId: env('RUN_EPISODE_ID'),
        kind: 'clip',
        file: out,
        shot,
        // Длительность стоит РЯДОМ с ценой (Директор, 10.08): Seedance берёт
        // посекундно, поэтому «$1.69» без секунд не говорит, дорого это или нет,
        // а «6.0с» сразу даёт цену секунды и объясняет разницу между клипами.
        description: `клип ${shot} · ${res.duration_seconds}с · ${res.model_id}/${tier} · $${res.cost_usd.toFixed(2)}`,
        origin: 'gen-video',
        // R22/D101: промпт и параметры клипа — часть изделия; регистратор кладёт
        // их плоскими полями по эталону exec-vgen.
        recipe: {
          prompt,
          provider: 'seedance-fal-img2vid',
          model: res.model_id,
          tier,
          resolution: '720p',
          aspect_ratio: '9:16',
          seed,
          cost_usd: res.cost_usd,
        },
      });
    } else {
      console.error(
        `СЛЕД НЕ ОСТАВЛЕН: номер кадра не задан и не выводится ни из «${out}», ни из «${arg('frame')}». ` +
          'Передай --shot sh01.',
      );
    }
  },
);
