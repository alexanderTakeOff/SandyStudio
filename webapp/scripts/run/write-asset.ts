// ПЕРО единого разума: написать документ эпизода самому, а не заказать его роли.
//
// До 07.08 ум умел записывать только бриф, канон Библии и темы. Сценарий, раскадровка,
// планы кадра и шота, метаданные, план обложки рождались ИСКЛЮЧИТЕЛЬНО запуском маленького
// агента — то есть разум умел заказывать, но не умел писать. Это и есть главная дыра из
// разбора 07.08: по модели Директора сценарий — развёрнутый бриф и по сути КАНОН, а автор
// его — сценарист; ум, который не пишет сценарий сам, не разум, а диспетчер.
//
// Имя собирается по конвенции CLAUDE.md §3 из кода эпизода, типа, версии и статуса — руками
// его не набирают, потому что руками его набирают с ошибкой. Версия НЕ затирается: повтор с
// той же версией обновляет строку (идемпотентность `persistAsset`), новая версия заводит
// соседа и оставляет историю пересъёмок читаемой.
//
// Черновик — это АССЕТ, а не сообщение (B13): `--status DRAFT` кладёт версию в слот, не
// вытесняя утверждённую, и её можно открыть, показать и обсудить по ссылке.
// Контракт: `--help`.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineTool } from './_tool';
import { persistAsset, episodeCode } from './_asset';

/** Статусы, в которых документ ещё правится. LOCKED ставится только Директором и не здесь. */
const EDITABLE = ['DRAFT', 'REVIEW', 'REVISION', 'APPROVED'] as const;

export default defineTool(
  {
    name: 'write-asset',
    summary: 'Пишет документ эпизода из файла: сценарий, раскадровку, план, метаданные — под каноническим именем.',
    args: {
      type: {
        about:
          'тип по конвенции: `SCR-script`, `STB-storyboard`, `SPC-ref_plan-<shot>`, ' +
          '`SPC-shot_plan-<shot>`, `SPC-metadata`, `SPC-thumb_plan`, `SPC-brief`. ' +
          // Контракт пишется ТУДА, КУДА СМОТРИТ АВТОР (13.08, очередь Полины п.17):
          // раньше он существовал только в голове читателя-парсера, и документ,
          // написанный русскими заголовками, разбирался в пустоту молча.
          'ДЛЯ `SPC-metadata` тело обязано нести ровно три секции с АНГЛИЙСКИМИ ' +
          'заголовками — `## Title`, `## Description`, `## Tags` (теги через запятую ' +
          'или строками). Русские заголовки разбор НЕ находит: гейт публикации ' +
          'откажет, назвав недостающие секции. Всё, что видит зритель, пишется на ' +
          'языке канала (`publish_defaults.default_language`, по умолчанию английский)',
      },
      file: { about: 'файл с телом документа; читается дословно, пересказ не делается' },
      status: { about: 'статус строки; LOCKED здесь не ставится — он за Директором', default: 'DRAFT', values: [...EDITABLE] },
      version: { about: 'версия в имени файла; новая версия заводит соседа, не затирает историю', default: 'v01' },
      desc: { about: 'короткое описание для карточки; пусто — существующее не трогается', default: '' },
    },
    env: {
      RUN_EPISODE_ID: { about: 'эпизод, которому принадлежит документ' },
    },
    reads: ['assets', 'episodes'],
    writes: ['assets'],
    // Перо ума: им пишутся ВСЕ документные станции — сценарий, раскадровка, планы
    // рефа и шота, метаданные, план обложки. Бриф и каст здесь же, но они ВХОД
    // Директора: инструмент кладёт его решение, а не сочиняет за него.
    stations: [
      'brief',
      'casting',
      'screenwriter',
      'storyboarder',
      'reference_designer',
      'shot_designer',
      'copywriter',
      'thumbnail_designer',
    ],
  },
  async ({ arg, env }) => {
    const episodeId = env('RUN_EPISODE_ID');
    const type = arg('type');
    const body = readFileSync(resolve(process.cwd(), arg('file')), 'utf8');
    if (!body.trim()) throw new Error(`${arg('file')} пуст — писать нечего`);

    const code = await episodeCode(episodeId);
    const ext = type.startsWith('IMG-') || type.startsWith('VID-') || type.startsWith('AUD-') ? '' : '.md';
    if (!ext) {
      throw new Error(
        `${type} — это МЕДИА, а не документ. Кадры и клипы заводит gen-frame / gen-video / register-media, ` +
          'они кладут ещё и байты; здесь получилась бы строка без файла.',
      );
    }

    const res = await persistAsset({
      filename: `${code}-${type}-${arg('version')}-${arg('status')}${ext}`,
      fileType: type,
      episodeId,
      status: arg('status'),
      content: body,
      description: arg('desc') || undefined,
      agentId: 'DIRECT-RUN',
      metadata: { origin: 'write-asset', authored_by: 'mind' },
    });

    console.log(res.created ? 'СОЗДАН' : 'ОБНОВЛЁН', `${res.id} · ${res.filename} · ${body.length} символов`);
  },
);
