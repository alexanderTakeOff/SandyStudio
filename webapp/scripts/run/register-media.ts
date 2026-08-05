// Заводит изделие эпизода в студию: кадр-референс, клип или финальный кат.
// Copies the file into the media cache under its canonical name and writes the
// `assets` row, after which the episode is visible in the interface and its
// timings can be fixed by eye. Contract: `--help`.
//
// WHY THE TYPES MATTER (2026-08-05, разбор кода студии): интерфейс собирает
// стадию НЕ по содержимому файла, а по префиксу `file_type` —
// `lib/api/pipeline-stages.ts:230 STAGE_FROM_ASSET`. Не совпал префикс — ассета
// для конвейера не существует. Первая версия этого инструмента завела
// `IMG-shot_sh01` и `VID-cut`; студия не увидела ни кадров, ни ката, а клипы
// показались только потому, что `VID-shot_…` случайно совпало с `VID-shot`.
//
// И одного типа мало: лента (`EpisodeTimelineSection`) связывает ячейку с
// кадром через `metadata.shot_reference.shot_id` у картинки и `metadata.shot_id`
// у клипа. Без них ячейка останется пустой при правильном типе.
import { execFileSync } from 'node:child_process';
import { extname, resolve } from 'node:path';
import { defineTool } from './_tool';
import { persistAsset, episodeCode } from './_asset';

/** `SS-S15-E36` + `sh01` → `S15-E36-SH01` — канонический id кадра by-position. */
function shotId(code: string, shot: string): string {
  return `${code.replace(/^SS-/, '')}-${shot.toUpperCase()}`;
}

/** Длительность клипа в секундах — лента считает по ней ширину ячейки. */
function durationOf(file: string): number | undefined {
  try {
    const out = execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', resolve(process.cwd(), file)],
      { encoding: 'utf8' },
    );
    const n = Number(out.trim());
    return Number.isFinite(n) && n > 0 ? n : undefined;
  } catch {
    return undefined;
  }
}

export default defineTool(
  {
    name: 'register-media',
    summary: 'Заводит кадр, клип или кат эпизода в студию — с типом и метаданными, которые читает лента.',
    args: {
      file: { about: 'исходный файл — PNG для кадра, MP4 для клипа и ката' },
      kind: { about: 'что заводим', values: ['frame', 'clip', 'cut', 'music'] },
      shot: { about: 'номер кадра, `sh01`; для `cut` и `music` не нужен', default: '' },
      version: { about: 'версия в имени и в строке', default: 'v01' },
      status: { about: 'статус ассета; лента показывает APPROVED и LOCKED', default: 'APPROVED' },
      desc: { about: 'описание — что это и откуда', default: '' },
    },
    env: { RUN_EPISODE_ID: { about: 'эпизод, которому принадлежит изделие' } },
    reads: ['episodes', 'assets'],
    writes: ['assets'],
  },
  async ({ arg, env }) => {
    const kind = arg('kind');
    const shot = arg('shot').toLowerCase();
    const perShot = kind === 'frame' || kind === 'clip';
    if (perShot && !shot) throw new Error(`--kind ${kind} требует --shot (например sh01)`);

    const episodeId = env('RUN_EPISODE_ID');
    const code = await episodeCode(episodeId);
    const stem = code.replace(/^SS-/, '').toLowerCase(); // s15-e36
    const sid = perShot ? shotId(code, shot) : null;

    // Префиксы — единственное, что связывает изделие со стадией конвейера.
    const spec = {
      frame: { type: `IMG-episode_ref_${stem.replace(/-/g, '_')}_${shot}`, kindTag: 'IMG', slug: `shot_${shot}`, agent: 'EXEC-EREF' },
      clip: { type: `VID-shot-${stem}-${shot}`, kindTag: 'VID', slug: `shot_${shot}`, agent: 'EXEC-VGEN' },
      cut: { type: 'VID-final_cut', kindTag: 'VID', slug: 'final_cut', agent: 'EXEC-STITCH' },
      music: { type: 'AUD-music-main', kindTag: 'AUD', slug: 'music_main', agent: 'EXEC-MGEN' },
    }[kind];

    const metadata: Record<string, unknown> = {
      origin: 'direct-run register-media',
      source_file: arg('file'),
    };
    if (kind === 'frame') metadata.shot_reference = { shot_id: sid };
    if (kind === 'clip') {
      metadata.shot_id = sid;
      const seconds = durationOf(arg('file'));
      if (seconds) metadata.duration_seconds = seconds;
    }

    const res = await persistAsset({
      filename: `${code}-${spec.kindTag}-${spec.slug}-${arg('version')}-${arg('status')}${extname(arg('file'))}`,
      fileType: spec.type,
      srcPath: arg('file'),
      episodeId,
      status: arg('status'),
      description: arg('desc') || `${kind} ${sid ?? code} · прямой вызов`,
      agentId: spec.agent,
      metadata,
    });

    console.log(res.created ? 'СОЗДАНА' : 'ОБНОВЛЕНА', `${res.id} · ${spec.type}${sid ? ` · ${sid}` : ''}`);
  },
);
