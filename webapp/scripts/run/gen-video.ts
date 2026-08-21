// Direct-call shot renderer for the clean run: pads the reference frame to the
// episode's render aspect with its own edge colour, then submits image-to-video
// to Seedance.
//
// WHY THE PAD (seedance-prompting rule 6): the render aspect and the reference
// aspect MUST match. Our frames come out of `clampSize()` in one of the three
// legacy gpt-image-1 sizes (D39) — 1024×1536 or 1536×1024 — and neither is 9:16
// or 16:9. Feeding a mismatched still into the render makes Seedance crop and
// recompose — content loss plus identity drift. Padding costs $0 and happens in
// ffmpeg.
//
// WHY IT IS COMPUTED AND NOT CONSTANT (E08, 21.08): the pad used to be three
// hardcoded numbers for one vertical episode, so every landscape episode died at
// ffmpeg with «padded dimensions cannot be smaller than input dimensions» — the
// aspect was already read from episode settings for the provider call, but the
// frame prep still assumed 9:16. The law is «the reference aspect must MATCH the
// render aspect», not «the reference must be 9:16»; the target is now derived
// from the frame's real size and the resolved aspect.
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
import { readEpisodeVideoConfig } from '../../lib/agents/runner';
import { resolveVideoParams } from '../../lib/api/resolve-generation-params';

/** Sample one pixel just inside the frame edge and return it as ffmpeg 0xRRGGBB. */
function edgeColour(src: string): string {
  const raw = execFileSync(
    'ffmpeg',
    ['-v', 'error', '-i', src, '-vf', 'crop=1:1:8:8', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
    { maxBuffer: 1024 },
  );
  return `0x${raw.subarray(0, 3).toString('hex')}`;
}

/** Real pixel size of an image. Guessing it is how the hardcoded pad happened. */
function frameSize(src: string): { w: number; h: number } {
  const out = execFileSync(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height',
     '-of', 'csv=p=0:s=x', src],
    { maxBuffer: 1024 },
  ).toString().trim();
  const [w, h] = out.split('x').map(Number);
  if (!w || !h) throw new Error(`ffprobe не прочитал размер кадра ${src}: "${out}"`);
  return { w, h };
}

const even = (n: number): number => (n % 2 === 0 ? n : n + 1);

/**
 * Дотянуть кадр до аспекта рендера, доливая недостающее его же краевым цветом.
 * Добор идёт по ОДНОЙ оси — по той, которой не хватает:
 *   · кадр уже целевого — растёт ширина, симметрично с двух сторон;
 *   · кадр шире целевого — растёт высота, СВЕРХУ: низ кадра может нести пол или
 *     опору, верх в наших сценах пустой. Так же вело себя прежнее зашитое
 *     `pad=1024:1820:0:284`, и на вертикальном кадре 1024×1536 результат тот же
 *     до пикселя — правка не меняет уже снятые эпизоды.
 */
function padToAspect(src: string, dst: string, aspect: string): void {
  const [aw, ah] = aspect.split(':').map(Number);
  if (!aw || !ah) throw new Error(`не разобрал аспект рендера: "${aspect}"`);
  const { w, h } = frameSize(src);
  const target = aw / ah;

  let W = w;
  let H = h;
  let x = 0;
  let y = 0;
  if (w / h < target) {
    W = even(Math.round(h * target));
    x = Math.floor((W - w) / 2);
  } else if (w / h > target) {
    H = even(Math.round(w / target));
    y = H - h;
  }

  execFileSync('ffmpeg', [
    '-v', 'error', '-y', '-i', src,
    '-vf', `pad=${W}:${H}:${x}:${y}:color=${edgeColour(src)}`,
    dst,
  ]);
  console.log(`pad ${w}×${h} → ${W}×${H} (${aspect}), смещение ${x},${y}`);
}

export default defineTool(
  {
    name: 'gen-video',
    summary:
      'Один клип из кадра: пад до аспекта эпизода своим краевым цветом, затем ' +
      'image-to-video на Seedance.',
    args: {
      frame: {
        about: 'исходный кадр PNG; рядом с собой падится до аспекта рендера из настроек эпизода',
      },
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
  async ({ arg, env, wasGiven }) => {
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

    // Настройки эпизода УПРАВЛЯЮТ инструментом (Директор, 10.08: «поменял настройки —
    // Полина работала по умолчанию»). Здесь аспект и разрешение были зашиты строками
    // '9:16' и '720p', поэтому `episodes.metadata.generation_config.video` не управлял
    // прямым путём вообще — сколько его ни меняй в UI. Читаем ТЕМИ ЖЕ функциями, что
    // агентский конвейер (`readEpisodeVideoConfig` + `resolveVideoParams`), а не своей
    // копией: иначе два пути разойдутся в трактовке одной настройки. Порядок честный —
    // явный аргумент побеждает настройку, настройка побеждает умолчание.
    const { data: epRow } = await sb
      .from('episodes')
      .select('metadata')
      .eq('id', env('RUN_EPISODE_ID'))
      .maybeSingle();
    const episodeVideoConfig = readEpisodeVideoConfig(epRow);
    const resolved = resolveVideoParams({
      episodeConfig: episodeVideoConfig,
      shotOverride: { quality_tier: wasGiven('tier') ? tier : null },
    });
    const effectiveAspect = resolved.aspectRatio;
    // Разрешение может не быть задано ни настройкой, ни серией — тогда держим прежнее
    // умолчание инструмента, а не роняем вызов.
    const effectiveResolution = resolved.resolution ?? '720p';
    const effectiveTier = wasGiven('tier') ? tier : resolved.qualityTier;
    console.log(
      `аспект=${effectiveAspect} · разрешение=${effectiveResolution} · тир=${effectiveTier}` +
        ` (${episodeVideoConfig ? 'настройки эпизода' : 'умолчание инструмента'};` +
        ` тир: ${wasGiven('tier') ? 'аргумент' : 'из настроек/умолчания'})`,
    );

    const srcAbs = resolve(process.cwd(), arg('frame'));
    if (!existsSync(srcAbs)) throw new Error(`frame not found: ${srcAbs}`);
    const paddedAbs = srcAbs.replace(/\.png$/, '.padded.png');
    padToAspect(srcAbs, paddedAbs, effectiveAspect);
    console.log(`padded → ${paddedAbs}`);

    const prompt = readFileSync(resolve(process.cwd(), arg('prompt-file')), 'utf8').trim();

    const t0 = Date.now();
    const res = await generateVideoFalSeedance({
      prompt,
      durationSeconds: duration,
      aspectRatio: effectiveAspect,
      resolution: effectiveResolution,
      quality: effectiveTier,
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
      model_or_tier: `${res.model_id}/${effectiveTier}/${effectiveResolution}/${effectiveAspect}`,
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
        description: `клип ${shot} · ${res.duration_seconds}с · ${res.model_id}/${effectiveTier} · $${res.cost_usd.toFixed(2)}`,
        origin: 'gen-video',
        // R22/D101: промпт и параметры клипа — часть изделия; регистратор кладёт
        // их плоскими полями по эталону exec-vgen.
        recipe: {
          prompt,
          provider: 'seedance-fal-img2vid',
          model: res.model_id,
          tier: effectiveTier,
          resolution: effectiveResolution,
          aspect_ratio: effectiveAspect,
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
