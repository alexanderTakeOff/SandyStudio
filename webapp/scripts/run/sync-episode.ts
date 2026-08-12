// Досборка паспорта эпизода: то, что делает набор файлов ЭПИЗОДОМ в глазах студии.
//
// Прямой вызов производит кадры и клипы, но не производит двух вещей, без которых
// интерфейс не показывает ленту и врёт про деньги:
//
//   1. РАСКАДРОВКА. `EpisodeTimelineSection.tsx:257` строит ленту либо из
//      `VID-animatic`, либо из `STB-*` в статусе APPROVED, у которой в `content`
//      лежит JSON-блок `acts[].shots[]`. Прямые прогоны раскадровку как документ
//      не создавали — были только промпты, поэтому ленты не было ни у одного из
//      трёх эпизодов. Здесь она СОБИРАЕТСЯ ИЗ ФАКТА: список кадров и их
//      длительности берутся из уже заведённых клипов, а не выдумываются.
//   2. `episodes.budget_spent`. Леджеров два: итемизированный `budget_log`
//      (пишут инструменты) и резервационный `budget_spent` (читает шапка
//      эпизода). Прямой вызов заполнял только первый — отсюда «$0.00 / $50.00»
//      над эпизодом, который стоил тридцать долларов.
//
// Contract: `--help`.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineTool } from './_tool';
import { sb } from './_env';
import { persistAsset, episodeCode } from './_asset';

interface ShotRow {
  shot_id: string;
  duration_seconds: number;
  action: string;
}

export default defineTool(
  {
    name: 'sync-episode',
    summary: 'Собирает раскадровку из заведённых клипов и сводит `budget_spent` с итемизированным леджером.',
    args: {
      version: { about: 'версия раскадровки', default: 'v01' },
      title: { about: 'название эпизода в шапке раскадровки', default: '' },
      'script-file': {
        about:
          'файл замысла/листа ожиданий — заводится как `SCR` APPROVED. Без него встаёт ВСЯ ' +
          'дистрибуция: Publicist требует сценарий, Key Art требует его же плюс метаданные, ' +
          'Distribution — метаданные и обложку',
        default: '',
      },
    },
    env: { RUN_EPISODE_ID: { about: 'эпизод, паспорт которого дособираем' } },
    reads: ['assets', 'budget_log', 'episodes'],
    writes: ['assets', 'episodes'],
    // Сшивает след эпизода задним числом — не станция, а починка следа.
    stations: [],
  },
  async ({ arg, env }) => {
    const episodeId = env('RUN_EPISODE_ID');
    const code = await episodeCode(episodeId);

    // ── 1. Раскадровка из факта ────────────────────────────────────────────
    const { data: clips, error: clipErr } = await sb
      .from('assets')
      .select('file_type,metadata,description')
      .eq('episode_id', episodeId)
      .like('file_type', 'VID-shot%')
      .order('file_type');
    if (clipErr) throw new Error(`clips read failed: ${clipErr.message}`);

    const shots: ShotRow[] = [];
    for (const c of clips ?? []) {
      const meta = (c.metadata ?? {}) as { shot_id?: unknown; duration_seconds?: unknown };
      if (typeof meta.shot_id !== 'string') continue;
      shots.push({
        shot_id: meta.shot_id,
        duration_seconds: typeof meta.duration_seconds === 'number' ? meta.duration_seconds : 5,
        action: c.description ?? '',
      });
    }
    if (shots.length === 0) {
      throw new Error('клипов с `metadata.shot_id` нет — сначала заведите их через register-media');
    }
    shots.sort((a, b) => a.shot_id.localeCompare(b.shot_id));

    const body = [
      `# Раскадровка ${code}${arg('title') ? ` — ${arg('title')}` : ''}`,
      '',
      'Собрана ИЗ ФАКТА прогона: кадры и длительности взяты из готовых клипов,',
      'а не написаны заранее. Прямой вызов производит изделие раньше документа —',
      'документ восстанавливает то, что реально снято.',
      '',
      '```json',
      JSON.stringify({ contract: 'storyboarder@v2', acts: [{ act: 1, shots }] }, null, 2),
      '```',
      '',
    ].join('\n');

    const stb = await persistAsset({
      filename: `${code}-STB-shotlist-${arg('version')}-APPROVED.md`,
      fileType: 'STB-shotlist',
      episodeId,
      status: 'APPROVED',
      description: `раскадровка из факта · ${shots.length} кадров · собрана sync-episode`,
      content: body,
      agentId: 'EXEC-SB',
    });
    console.log(stb.created ? 'РАСКАДРОВКА СОЗДАНА' : 'РАСКАДРОВКА ОБНОВЛЕНА', `${shots.length} кадров`);
    for (const s of shots) console.log(`   ${s.shot_id} · ${s.duration_seconds.toFixed(2)}s`);

    // ── 1-бис. Сценарий — вход ВСЕЙ дистрибуции ───────────────────────────
    // `EXEC-COPY` требует `SCR` APPROVED (`gate.ts:229`), `EXEC-THUMB-DESIGNER`
    // — его же плюс метаданные, `EXEC-PUB` — метаданные и обложку. Первого
    // звена у прямого прогона нет: сценарий как документ он не производит, были
    // только промпты кадров. Одна недостача роняет весь блок по домино.
    // Гейт (`gate.ts:229`) спрашивает только `SCR`, а сам исполнитель
    // (`runners/copywriter.ts:205`) требует ЕЩЁ и `SPC-brief` с непустым
    // `content` — иначе падает уже после старта. Гейт и раннер разошлись;
    // поэтому заводим оба документа сразу.
    const scriptFile = arg('script-file');
    if (scriptFile) {
      const text = readFileSync(resolve(process.cwd(), scriptFile), 'utf8');
      const lines = text.split('\n').length;

      for (const doc of [
        { type: 'SPC-brief', slug: 'brief', agent: 'Director', label: 'БРИФ' },
        { type: 'SCR-script', slug: 'script', agent: 'EXEC-SW', label: 'СЦЕНАРИЙ' },
      ]) {
        const res = await persistAsset({
          filename: `${code}-${doc.type.split('-')[0]}-${doc.slug}-${arg('version')}-APPROVED.md`,
          fileType: doc.type,
          episodeId,
          status: 'APPROVED',
          description: `замысел эпизода · источник ${scriptFile} · ${lines} строк`,
          content: text,
          agentId: doc.agent,
        });
        console.log(`${doc.label} ${res.created ? 'СОЗДАН' : 'ОБНОВЛЁН'} · ${lines} строк`);
      }
    }

    // ── 2. Аниматик — носитель ТАЙМИНГОВ ──────────────────────────────────
    // Без него правка длительностей в ленте НЕ СОХРАНЯЕТСЯ: скелет, собранный
    // из раскадровки, помечен в коде как READ-ONLY, а эндпоинт
    // `PATCH /api/assets/[id]/animatic-timing` принимает только ассет с типом
    // `VID-animatic` и контрактом `animatic_v1` — на всём остальном он бросает
    // ValidationError. Директор правил тайминги и терял их молча.
    // Он же — недостающий вход гейта `EXEC-STITCH` (`lib/agents/gate.ts:222`).
    const { data: refs } = await sb
      .from('assets')
      .select('id,metadata')
      .eq('episode_id', episodeId)
      .like('file_type', 'IMG-episode_ref%')
      .eq('status', 'APPROVED');

    const refByShot = new Map<string, string>();
    for (const r of refs ?? []) {
      const sid = (r.metadata as { shot_reference?: { shot_id?: unknown } } | null)?.shot_reference?.shot_id;
      if (typeof sid === 'string') refByShot.set(sid, r.id);
    }

    const { data: music } = await sb
      .from('assets')
      .select('filename,drive_path')
      .eq('episode_id', episodeId)
      .like('file_type', 'AUD-music%')
      .eq('status', 'APPROVED')
      .maybeSingle();

    const shotList = shots.map((s) => {
      const assetId = refByShot.get(s.shot_id) ?? null;
      return {
        shot_id: s.shot_id,
        asset_id: assetId,
        image_url: assetId ? `/api/media/${assetId}` : null,
        duration_seconds: s.duration_seconds,
        caption: s.action.slice(0, 80),
      };
    });

    // АДРЕС БЕРЁТСЯ ИЗ ЗАПИСИ, А НЕ СОЧИНЯЕТСЯ ИЗ ИМЕНИ. `filename` — это
    // каноническое ИМЯ ассета, а не имя файла на диске: путь загрузки музыки
    // (`lib/api/ingest-music.ts:119`) кладёт байты с хеш-суффиксом и держит
    // адрес в `drive_path`, оставляя `filename` каноническим. Собранный из
    // `filename` URL указывал в пустоту — «[stitch] media-cache miss for
    // SS-S15-E36-AUD-music_main-v01-APPROVED.mp3» при живом файле рядом.
    const musicUrl = music ? music.drive_path ?? `/api/media/${encodeURIComponent(music.filename)}` : null;
    const contract = {
      contract: 'animatic@v1',
      shot_list: shotList,
      audio_tracks: music
        ? [{ layer: 'music', url: musicUrl, filename: music.filename, volume: 1 }]
        : [],
      music_url: musicUrl,
      music_filename: music?.filename ?? null,
      total_duration: shotList.reduce((sum, s) => sum + s.duration_seconds, 0),
      created_at: new Date().toISOString(),
    };

    // РУЧНУЮ РАБОТУ НЕ ПЕРЕЗАПИСЫВАЕМ. Аниматик — носитель Директорских правок
    // (`director_overrides`) и загруженной им музыки. 2026-08-05 этот код собрал
    // свой контракт поверх существующего и снёс и то и другое: девять правленых
    // длительностей и загруженный трек. Идемпотентность допустима для того, что
    // породила машина; во что писал человек — только дополняется.
    const { data: existingAnimatic } = await sb
      .from('assets')
      .select('id,filename,metadata')
      .eq('episode_id', episodeId)
      .like('file_type', 'VID-animatic%')
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingAnimatic) {
      const meta = (existingAnimatic.metadata ?? {}) as Record<string, unknown>;
      const v1 = meta.animatic_v1 as Record<string, unknown> | undefined;
      const overrides = v1?.director_overrides as Record<string, unknown> | undefined;
      const tracks = v1?.audio_tracks as unknown[] | undefined;
      console.log(
        'АНИМАТИК УЖЕ ЕСТЬ — не трогаю:',
        `${existingAnimatic.filename} · правок Директора ${Object.keys(overrides ?? {}).length} · дорожек ${tracks?.length ?? 0}`,
      );
    } else {
      const animatic = await persistAsset({
        filename: `${code}-VID-animatic-${arg('version')}-APPROVED.mp4`,
        fileType: 'VID-animatic',
        episodeId,
        status: 'APPROVED',
        description: `аниматик из факта · ${shotList.length} кадров · ${contract.total_duration.toFixed(1)} с · носитель таймингов`,
        agentId: 'EXEC-EDIT',
        metadata: { animatic_v1: contract },
      });
      console.log(
        'АНИМАТИК СОЗДАН',
        `${animatic.id} · ${shotList.length} кадров · ${contract.total_duration.toFixed(1)} с · музыка ${music ? 'есть' : 'НЕТ'}`,
      );
    }

    // ── 2-бис. ИЗМЕРЕНИЕ плотности (решение Директора 27) ──────────────────
    // Число живёт как ПРИБОР, а не как условие пропуска: гейт по группам набить
    // нельзя, гейт по числу набивается ре-скинами за минуту. Печатается факт и
    // сравнение с планом; не блокируется ничего.
    const measuredRuntime = shots.reduce((s, x) => s + x.duration_seconds, 0);
    const longShots = shots.filter((s) => s.duration_seconds > 10);
    console.log(
      `ПЛОТНОСТЬ (измерение, не гейт): ${shots.length} кадров · ${measuredRuntime.toFixed(1)} с · ` +
        `средний кадр ${(measuredRuntime / shots.length).toFixed(1)} с · ` +
        `${((shots.length / measuredRuntime) * 60).toFixed(1)} кадров/мин` +
        (longShots.length > 0 ? ` · ⚠ длиннее 10 с: ${longShots.length}` : ''),
    );
    const expectedShots = Math.max(3, Math.round(measuredRuntime / 3));
    if (shots.length < expectedShots) {
      console.log(
        `   при ${measuredRuntime.toFixed(0)} с плотная комедия ждёт ~${expectedShots} кадров — ` +
          `здесь ${shots.length}. Не отказ: это наблюдение для приёмки.`,
      );
    }

    // ── 3. Деньги ──────────────────────────────────────────────────────────
    const { data: ledger, error: ledgerErr } = await sb
      .from('budget_log')
      .select('cost_usd')
      .eq('episode_id', episodeId);
    if (ledgerErr) throw new Error(`budget_log read failed: ${ledgerErr.message}`);

    const spent = (ledger ?? []).reduce((sum, r) => sum + Number(r.cost_usd), 0);
    const { error: epErr } = await sb
      .from('episodes')
      .update({ budget_spent: spent })
      .eq('id', episodeId);
    if (epErr) throw new Error(`episode update failed: ${epErr.message}`);

    console.log(`ДЕНЬГИ сведены: $${spent.toFixed(2)} по ${(ledger ?? []).length} строкам леджера`);
  },
);
