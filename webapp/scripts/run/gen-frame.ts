// Direct-call frame generator for the clean run (path C: thin layer over the
// existing storage — provider + media cache + ledger reused, agent layer NOT
// called). One frame per invocation, prompt read from a file so long prompts
// survive the shell.
//
// Prints the produced file and the cost, and writes the cost to `budget_log`
// so the run's money instrument stays honest. Contract: `--help`.
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { sb, seriesId } from './_env';
import { defineTool } from './_tool';
import { shotFromFilename, traceInStudio, assertEpisodeReadyToSpend } from './_asset';
import { openAIEditsMultiProvider } from '../../lib/providers/openai-edits-multi';
import { readAssetMediaAsBase64 } from '../../lib/media-cache';
// D74: те же читатели настроек эпизода, что у агентского конвейера — своя копия
// разъехалась бы в трактовке одних и тех же полей.
import { readEpisodeImageConfig } from '../../lib/agents/runner';
import { resolveImageParams } from '../../lib/api/resolve-generation-params';
import type { MultiImageRef, MultiImageRefKind } from '../../lib/providers/image-gen-multi';

/** gpt-image-2 medium/high pricing per image at 1024x1536 (OpenAI list). */
const COST_USD: Record<string, number> = { low: 0.016, medium: 0.063, high: 0.25 };

export default defineTool(
  {
    name: 'gen-frame',
    summary: 'Один кадр за вызов: промпт из файла, канон-референсы по слагам, цена в `budget_log`.',
    args: {
      'prompt-file': { about: 'файл с промптом кадра; путь от корня `webapp/`' },
      refs: {
        about:
          'канон-референсы через запятую, `<slug>:<kind>`; порядок вызова не важен — ' +
          'инструмент сам сортирует по контракту TD-53 (location → identity → style → object → continuity)',
      },
      out: { about: 'куда положить PNG; директории создаются' },
      shot: {
        about:
          'номер кадра, `sh01` — по нему изделие СРАЗУ заводится в студию. Пусто — выводится ' +
          'из имени файла; не вывелся — след не оставлен, и об этом сказано громко',
        default: '',
      },
      size: { about: 'размер кадра', default: '1024x1536', values: ['1024x1536', '1024x1024', '1536x1024'] },
      quality: { about: 'тир качества; low держит канон и стоит $0,018', default: 'high', values: ['low', 'medium', 'high'] },
      status: {
        about: 'статус строки изделия в студии',
        default: 'APPROVED',
        values: ['DRAFT', 'REVIEW', 'APPROVED'],
      },
    },
    // The episode is NOT hardcoded: a stale id spends the new episode's money on
    // the old episode's ledger and the mistake is silent (2026-08-04 stocktake).
    env: {
      RUN_EPISODE_ID: { about: 'эпизод, на который списывается трата; без него инструмент не стартует' },
      RUN_SERIES_ID: { about: 'сериал, над которым идёт работа; умолчания нет — чужой сериал молча делает не ту работу' },
    },
    reads: ['assets', 'episodes'],
    writes: ['budget_log', 'assets'],
    stations: ['episode_references'],
  },
  async ({ arg, env, wasGiven }) => {
    // D90: гейт денег ПЕРВЫМ действием — до чтения промпта, до референсов, до
    // любой работы. Отказ должен стоить ноль.
    await assertEpisodeReadyToSpend(env('RUN_EPISODE_ID'));

    const out = arg('out');
    const size = arg('size');

    // D74 (2026-08-09): настройки эпизода, выставленные Директором в UI, УПРАВЛЯЮТ
    // инструментом. До этой правки `--quality` со статическим умолчанием `high`
    // выглядел одинаково и когда его назвали, и когда взяли по умолчанию, поэтому
    // `episodes.metadata.generation_config.image` не управлял ничем — держала одна
    // устная подсказка уму в чате. Директор: «Директор устанавливает настройки
    // эпизода в UI, а не напоминает».
    //
    // Порядок честный: явный аргумент → настройка эпизода → статический дефолт как
    // последний рубеж. Читаем теми же функциями, что агентский конвейер
    // (`readEpisodeImageConfig` + `resolveImageParams`), а не своей копией — иначе
    // прямой путь и конвейер разъедутся в трактовке одних и тех же настроек.
    let quality = arg('quality');
    let qualitySource = 'аргумент';
    if (!wasGiven('quality')) {
      const { data: epRow } = await sb
        .from('episodes')
        .select('metadata')
        .eq('id', env('RUN_EPISODE_ID'))
        .maybeSingle();
      const epConfig = readEpisodeImageConfig(epRow);
      if (epConfig) {
        const resolved = resolveImageParams({ episodeConfig: epConfig });
        if (resolved.source.quality === 'episode') {
          quality = resolved.quality as typeof quality;
          qualitySource = 'настройки эпизода';
        } else {
          qualitySource = 'умолчание инструмента';
        }
      } else {
        qualitySource = 'умолчание инструмента';
      }
    }
    console.log(`quality=${quality} (${qualitySource})`);

    const prompt = readFileSync(resolve(process.cwd(), arg('prompt-file')), 'utf8').trim();

    // D87 (2026-08-08): чем именно кормили провайдера — часть изделия, а не
    // след в консоли. Директор: «prompt — самое важное, что должно храниться
    // почти вечно, потому что это образцы; к ним всегда можно вернуться,
    // поправить, дополнить — вместо того чтобы генерить что-то новое».
    // До этой правки промпт читался из файла, уходил провайдеру и ИСЧЕЗАЛ:
    // в метаданных кадра лежали только origin/source_file/shot_id, а у вызова
    // через мост сам файл промпта ещё и сносился как временный. Ответить
    // «на чём сгенерирован этот кадр» было физически нечем — ровно этот вопрос
    // Директор и задал про неканоничный батискаф.
    const refsUsed: Array<{ slug: string; kind: string; asset_id: string; filename: string }> = [];

    const references: MultiImageRef[] = [];
    for (const item of arg('refs').split(',').map((s) => s.trim()).filter(Boolean)) {
      const [slug, kindRaw] = item.split(':');
      const kind = (kindRaw ?? 'identity') as MultiImageRefKind;
      // D75 (Зрачок-2, 08.08): плита с историей версий (v01 INVALIDATED + v02
      // DRAFT — обычное дело после правки канона) даёt ДВЕ строки на один
      // file_type. `.maybeSingle()` без сортировки падает на «multiple rows»
      // тем же классом, что и находка insert-гвардом D72 в persistAsset —
      // только здесь это ЧТЕНИЕ рефа, не запись. Свежая версия побеждает —
      // та же конвенция, что у show-asset/register-canon.
      const { data: rows, error } = await sb
        .from('assets')
        .select('id,filename,drive_file_id,staging_path,file_type')
        .eq('series_id', seriesId())
        .eq('file_type', `SBL-${slug}`)
        .order('version', { ascending: false })
        .limit(1);
      if (error) throw new Error(`ref ${slug}: ${error.message}`);
      const asset = rows?.[0];
      if (!asset) throw new Error(`ref ${slug}: no canon asset SBL-${slug} в серии ${seriesId()}`);
      const image_b64 = await readAssetMediaAsBase64({
        filename: asset.filename,
        driveFileId: asset.drive_file_id,
        stagingPath: asset.staging_path,
      });
      if (!image_b64) throw new Error(`ref ${slug}: canon asset has no image on disk/Drive`);
      references.push({ kind, bible_asset_id: asset.id, image_b64 });
      refsUsed.push({ slug, kind, asset_id: asset.id, filename: asset.filename });
      console.log(`ref ok: ${slug} (${kind}) ${Math.round(image_b64.length / 1365)}KB`);
    }

    // Self-imposed budget was 5; the queue-nod shot needs the whole cast in one
    // frame (Director, 2026-08-01), so the cap follows the story, not the habit.
    // Provider hard ceiling is 16.
    if (references.length > 8) {
      throw new Error(`self-imposed budget is 8 refs per frame; got ${references.length}`);
    }

    // REF-ORDER CONTRACT (TD-53, episode-references.ts): the provider treats
    // earlier references as higher priority, so LOCATION must come first (it is
    // the canonical layout), then identities, then style, then continuity. The
    // clean run sent style first and the fifth identity came back off-canon —
    // enforce the order here instead of relying on the caller's spelling.
    const ORDER: Record<string, number> = {
      location: 0, identity: 1, style: 2, object: 3,
      scene_continuity: 4, temporal_continuity: 5,
    };
    references.sort((a, b) => (ORDER[a.kind] ?? 9) - (ORDER[b.kind] ?? 9));
    // D87: тем же ключом сортируем запись — в метаданных должен лежать порядок,
    // который РЕАЛЬНО ушёл провайдеру, а не порядок, в котором их назвал
    // вызывающий. Порядок здесь содержателен: провайдер считает ранние
    // референсы приоритетными (REF-ORDER CONTRACT выше), поэтому образец без
    // него неполон.
    refsUsed.sort((a, b) => (ORDER[a.kind] ?? 9) - (ORDER[b.kind] ?? 9));
    console.log('ref order:', references.map((r) => r.kind).join(' → '));

    console.log(`generating ${out} — ${references.length} refs, ${size}, ${quality}`);
    const t0 = Date.now();
    const res = await openAIEditsMultiProvider.generate({ prompt, references, size, quality });
    const ms = Date.now() - t0;

    // The provider returns `b64_data`/`cost_usd` and THROWS on failure — there is
    // no `status` field. Reading a non-existent field threw away two paid images
    // on 2026-08-01 (D40): the call succeeded, the artifact was discarded. Never
    // gate an artifact on a field you have not read from the type.
    if (!res.b64_data) {
      console.error('NO IMAGE in a successful response:', JSON.stringify(res).slice(0, 400));
      process.exit(1);
    }

    const abs = resolve(process.cwd(), out);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, Buffer.from(res.b64_data, 'base64'));

    const cost = res.cost_usd ?? COST_USD[quality] ?? 0;
    // `job_id` is FK-bound to `jobs` — a direct call has no job row, so it goes in
    // NULL (D41). And the insert error is CHECKED: the first version ignored it
    // and the ledger stayed silently empty while money was being spent.
    const { error: ledgerErr } = await sb.from('budget_log').insert({
      job_id: null,
      episode_id: env('RUN_EPISODE_ID'),
      agent_id: 'DIRECT-RUN',
      api_provider: 'openai',
      model_or_tier: `gpt-image-2/${quality}/${size}`,
      operation: `frame:${out.split(/[\\/]/).pop()}`,
      cost_usd: cost,
      duration_ms: ms,
    });

    if (ledgerErr) {
      console.error(`LEDGER FAILED (money spent, not recorded): ${ledgerErr.message}`);
      process.exit(2);
    }

    console.log(`OK ${abs}`);
    console.log(`cost $${cost.toFixed(3)} · ${(ms / 1000).toFixed(1)}s · ledger ok`);

    // След в студии — часть ТОГО ЖЕ движения. Отдельный шаг «завести в студию»
    // не забывается — он просто никогда не выполняется: три эпизода подряд
    // произвели 195 кадров, которых студия не увидела.
    const shot = arg('shot') || shotFromFilename(out);
    if (shot) {
      await traceInStudio({
        episodeId: env('RUN_EPISODE_ID'),
        kind: 'frame',
        file: out,
        shot,
        status: arg('status'),
        description: `кадр ${shot} · gpt-image-2/${quality} · $${cost.toFixed(3)}`,
        origin: 'gen-frame',
        // D87: полный рецепт — промпт дословно и референсы в том порядке, в
        // котором они ушли провайдеру. Промпт НЕ обрезается: усечённый образец
        // бесполезен ровно тем, ради чего он хранится — его нельзя повторить.
        recipe: {
          prompt,
          provider: 'openai-edits-multi',
          model: 'gpt-image-2',
          quality,
          size,
          references: refsUsed,
          generated_at: new Date().toISOString(),
          cost_usd: cost,
        },
      });
    } else {
      console.error(
        `СЛЕД НЕ ОСТАВЛЕН: номер кадра не задан и не выводится из «${out}». ` +
          'Передай --shot sh01 — иначе изделие для студии не существует.',
      );
    }
  },
);
