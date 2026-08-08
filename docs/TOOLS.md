# Реестр инструментария

> **Файл СГЕНЕРИРОВАН.** Правится не он, а декларация `defineTool` в самом инструменте.
> Пересобрать: `npx tsx scripts/tools-registry.ts --write` (из `webapp/`).
> Сверка идёт в тестах: разошёлся с кодом — прогон падает.
>
> Это ответ на D59: маршрут говорил ЧТО делать и КОГДА, а КАК вызывать жило только в коде,
> и ведущий ум тратил на исходники ~40 минут из 108.

| инструмент | что делает |
|---|---|
| [`blind-brief`](#blind-brief) | Собирает пакет для СЛЕПОЙ приёмки: контактные листы + лист ожиданий целиком + канон дословно из базы. |
| [`check-video`](#check-video) | Читает у площадки состояние залитого видео: заголовок, приватность, статус обработки. |
| [`ensure-episode`](#ensure-episode) | Заводит строку эпизода или находит существующую. Печатает id для `RUN_EPISODE_ID`. |
| [`gen-frame`](#gen-frame) | Один кадр за вызов: промпт из файла, канон-референсы по слагам, цена в `budget_log`. |
| [`gen-video`](#gen-video) | Один клип из кадра: пад до 9:16 своим цветом стены, затем image-to-video на Seedance. |
| [`publish`](#publish) | Заливает готовый кат на канал серии, упаковку берёт из паспорта канала, id видео пишет в эпизод. |
| [`register-canon`](#register-canon) | Закрепляет кадр каноном серии: PNG в медиа-кэш, строка `assets` под слагом. Повтор обновляет, не дублирует. |
| [`register-media`](#register-media) | Заводит кадр, клип, кат или музыку эпизода в студию — с типом и метаданными, которые читает лента. |
| [`set-status`](#set-status) | Меняет статус изделия и держит инвариант «один утверждённый на слот». LOCK не ставит — он за Директором. |
| [`show-asset`](#show-asset) | Показывает изделие глазами: текст дословно и картинку — или полосу кадров, если это видео. |
| [`spend`](#spend) | Траты текущего прогона: построчно и сводкой по видам работ. Читается вместо счёта в уме. |
| [`stitch`](#stitch) | Собирает кат: клипы по порядку, один энкод на всех, короткий чёрный хвост. $0. |
| [`sync-episode`](#sync-episode) | Собирает раскадровку из заведённых клипов и сводит `budget_spent` с итемизированным леджером. |
| [`write-asset`](#write-asset) | Пишет документ эпизода из файла: сценарий, раскадровку, план, метаданные — под каноническим именем. |

---

### blind-brief

Собирает пакет для СЛЕПОЙ приёмки: контактные листы + лист ожиданий целиком + канон дословно из базы.

```
npx tsx scripts/run/blind-brief.ts --spec <spec> --shots <shots> --out <out>
```

| аргумент | обязателен | по умолчанию | допустимо | что это |
|---|---|---|---|---|
| `--spec` | да | — | — | лист ожиданий «приму, если»; копируется целиком, пересказ запрещён |
| `--shots` | да | — | — | папка с контактными листами приёмки (png/jpg) |
| `--out` | да | — | — | куда положить готовый брифинг приёмщику |

**env:**
- `RUN_SERIES_ID` — сериал, над которым идёт работа; умолчания нет — чужой сериал молча делает не ту работу

**читает:** `assets`


---

### check-video

Читает у площадки состояние залитого видео: заголовок, приватность, статус обработки.

```
npx tsx scripts/run/check-video.ts --id <id>
```

| аргумент | обязателен | по умолчанию | допустимо | что это |
|---|---|---|---|---|
| `--id` | да | — | — | id видео на YouTube (`res.id` из `publish`, хвост ссылки) |

**env:**
- `RUN_SERIES_ID` — сериал, над которым идёт работа; умолчания нет — чужой сериал молча делает не ту работу
- `GOOGLE_CLIENT_ID` — клиент OAuth для обмена refresh-токена
- `GOOGLE_CLIENT_SECRET` — секрет OAuth

**читает:** `series`, `channels`


---

### ensure-episode

Заводит строку эпизода или находит существующую. Печатает id для `RUN_EPISODE_ID`.

```
npx tsx scripts/run/ensure-episode.ts --code <code> [--title <title>] [--theme <theme>] [--ceiling <ceiling>] [--run <run>]
```

| аргумент | обязателен | по умолчанию | допустимо | что это |
|---|---|---|---|---|
| `--code` | да | — | — | код эпизода, `SS-S15-E37` |
| `--title` | — | `` | — | рабочее название; обязательно при создании |
| `--theme` | — | `` | — | слаг темы; обязателен при создании, ложится в паспорт |
| `--ceiling` | — | `50` | — | потолок бюджета эпизода в долларах |
| `--run` | — | `forward-run` | — | метка прогона в паспорте |

**env:**
- `RUN_SERIES_ID` — сериал, над которым идёт работа; умолчания нет — чужой сериал молча делает не ту работу

**читает:** `episodes`

**пишет:** `episodes`


---

### gen-frame

Один кадр за вызов: промпт из файла, канон-референсы по слагам, цена в `budget_log`.

```
npx tsx scripts/run/gen-frame.ts --prompt-file <prompt-file> --refs <refs> --out <out> [--shot <shot>] [--size <size>] [--quality <quality>] [--status <status>]
```

| аргумент | обязателен | по умолчанию | допустимо | что это |
|---|---|---|---|---|
| `--prompt-file` | да | — | — | файл с промптом кадра; путь от корня `webapp/` |
| `--refs` | да | — | — | канон-референсы через запятую, `<slug>:<kind>`; порядок вызова не важен — инструмент сам сортирует по контракту TD-53 (location → identity → style → object → continuity) |
| `--out` | да | — | — | куда положить PNG; директории создаются |
| `--shot` | — | `` | — | номер кадра, `sh01` — по нему изделие СРАЗУ заводится в студию. Пусто — выводится из имени файла; не вывелся — след не оставлен, и об этом сказано громко |
| `--size` | — | `1024x1536` | `1024x1536` · `1024x1024` · `1536x1024` | размер кадра |
| `--quality` | — | `high` | `low` · `medium` · `high` | тир качества; low держит канон и стоит $0,018 |
| `--status` | — | `APPROVED` | `DRAFT` · `REVIEW` · `APPROVED` | статус строки изделия в студии |

**env:**
- `RUN_EPISODE_ID` — эпизод, на который списывается трата; без него инструмент не стартует
- `RUN_SERIES_ID` — сериал, над которым идёт работа; умолчания нет — чужой сериал молча делает не ту работу

**читает:** `assets`, `episodes`

**пишет:** `budget_log`, `assets`


---

### gen-video

Один клип из кадра: пад до 9:16 своим цветом стены, затем image-to-video на Seedance.

```
npx tsx scripts/run/gen-video.ts --frame <frame> --prompt-file <prompt-file> --out <out> [--shot <shot>] [--duration <duration>] [--tier <tier>] [--seed <seed>]
```

| аргумент | обязателен | по умолчанию | допустимо | что это |
|---|---|---|---|---|
| `--frame` | да | — | — | исходный кадр PNG; падится до 9:16 рядом с собой |
| `--prompt-file` | да | — | — | файл с видео-промптом кадра |
| `--out` | да | — | — | куда положить MP4; директории создаются |
| `--shot` | — | `` | — | номер кадра, `sh01` — по нему клип СРАЗУ заводится в студию. Пусто — выводится из имени файла кадра или клипа |
| `--duration` | — | `10` | — | длительность клипа в секундах |
| `--tier` | — | `standard` | `standard` · `fast` | тир Seedance |
| `--seed` | — | `` | — | сид для повторяемости; пусто — провайдер выбирает сам |

**env:**
- `RUN_EPISODE_ID` — эпизод, на который списывается трата; без него инструмент не стартует

**читает:** `assets`, `episodes`

**пишет:** `budget_log`, `assets`


---

### publish

Заливает готовый кат на канал серии, упаковку берёт из паспорта канала, id видео пишет в эпизод.

```
npx tsx scripts/run/publish.ts --file <file> --title <title> --desc-file <desc-file> [--privacy <privacy>]
```

| аргумент | обязателен | по умолчанию | допустимо | что это |
|---|---|---|---|---|
| `--file` | да | — | — | готовый кат MP4 |
| `--title` | да | — | — | заголовок публикации |
| `--desc-file` | да | — | — | файл с описанием |
| `--privacy` | — | `public` | `public` · `unlisted` · `private` | видимость на площадке |

**env:**
- `RUN_EPISODE_ID` — эпизод, на который записывается публикация
- `RUN_SERIES_ID` — сериал, над которым идёт работа; умолчания нет — чужой сериал молча делает не ту работу

**читает:** `series`, `channels`, `episodes`

**пишет:** `episodes`


---

### register-canon

Закрепляет кадр каноном серии: PNG в медиа-кэш, строка `assets` под слагом. Повтор обновляет, не дублирует.

```
npx tsx scripts/run/register-canon.ts --slug <slug> [--file <file>] [--desc <desc>] [--status <status>] [--version <version>]
```

| аргумент | обязателен | по умолчанию | допустимо | что это |
|---|---|---|---|---|
| `--slug` | да | — | — | слаг канона БЕЗ префикса `SBL-`, но С категорией внутри самого слага: `object_eyelid_shutter`, `character_iris_labyrinth`, `location_empty_background` — НЕ голое имя `eyelid_shutter`. Кадры цепляют его как `<slug>:<kind>` |
| `--file` | — | `` | — | исходный PNG; пусто — строка чинится без замены байтов |
| `--desc` | — | `` | — | описание плиты; читается приёмщиком дословно. Пусто — существующее не трогается |
| `--status` | — | `APPROVED` | — | статус ассета |
| `--version` | — | `v01` | — | версия в имени файла |

**env:**
- `RUN_SERIES_ID` — сериал, над которым идёт работа; умолчания нет — чужой сериал молча делает не ту работу

**читает:** `assets`, `episodes`, `series`

**пишет:** `assets`


---

### register-media

Заводит кадр, клип, кат или музыку эпизода в студию — с типом и метаданными, которые читает лента.

```
npx tsx scripts/run/register-media.ts --file <file> --kind <kind> [--shot <shot>] [--version <version>] [--status <status>] [--desc <desc>]
```

| аргумент | обязателен | по умолчанию | допустимо | что это |
|---|---|---|---|---|
| `--file` | да | — | — | исходный файл — PNG для кадра, MP4 для клипа и ката, аудио для музыки |
| `--kind` | да | — | `frame` · `clip` · `cut` · `music` | что заводим |
| `--shot` | — | `` | — | номер кадра, `sh01`; для `cut` и `music` не нужен |
| `--version` | — | `v01` | — | версия в имени и в строке |
| `--status` | — | `APPROVED` | — | статус ассета; лента показывает APPROVED и LOCKED |
| `--desc` | — | `` | — | описание — что это и откуда |

**env:**
- `RUN_EPISODE_ID` — эпизод, которому принадлежит изделие

**читает:** `episodes`, `assets`

**пишет:** `assets`


---

### set-status

Меняет статус изделия и держит инвариант «один утверждённый на слот». LOCK не ставит — он за Директором.

```
npx tsx scripts/run/set-status.ts --id <id> --status <status> [--reason <reason>]
```

| аргумент | обязателен | по умолчанию | допустимо | что это |
|---|---|---|---|---|
| `--id` | да | — | — | uuid строки ассета |
| `--status` | да | — | `DRAFT` · `REVIEW` · `REVISION` · `APPROVED` · `INVALIDATED` · `NEEDS_HUMAN_TWEAK` | новый статус |
| `--reason` | — | `` | — | почему; попадает в метаданные и читается потом |

**читает:** `assets`

**пишет:** `assets`


---

### show-asset

Показывает изделие глазами: текст дословно и картинку — или полосу кадров, если это видео.

```
npx tsx scripts/run/show-asset.ts [--slug <slug>] [--type <type>] [--id <id>] [--out <out>] [--frames <frames>] [--chars <chars>]
```

| аргумент | обязателен | по умолчанию | допустимо | что это |
|---|---|---|---|---|
| `--slug` | — | `` | — | плита канона серии, слаг без префикса `SBL-` |
| `--type` | — | `` | — | ТОЧНОЕ значение `file_type` в базе (не голый код из CLAUDE.md §3 — там таблица типов, а не имён столбца): `SCR-script`, `STB-storyboard`, `SPC-brief`, `SPC-ref_plan-<shot>`, `SPC-shot_plan-<shot>`, `IMG-episode_ref_<код серии+эпизода без дефисов>_<shot>` (пример: `IMG-episode_ref_s20_e03_sh02` для SS-S20-E03, шот sh02), `VID-final_cut`. Берётся самое свежее. Отказ «не найдено» — не значит «не существует»: возможно, тип назван неточно; проверь listSeriesBibles/getEpisode или спроси точный `file_type`. |
| `--id` | — | `` | — | точный uuid строки ассета |
| `--out` | — | `` | — | куда положить картинку; для видео — папку под полосу кадров. Пусто — только текст |
| `--frames` | — | `3` | — | сколько кадров вынуть из видео |
| `--chars` | — | `1800` | — | сколько символов текста печатать |

**env:**
- `RUN_SERIES_ID` — сериал; нужен для поиска по --slug

**читает:** `assets`


---

### spend

Траты текущего прогона: построчно и сводкой по видам работ. Читается вместо счёта в уме.

```
npx tsx scripts/run/spend.ts [--detail <detail>]
```

| аргумент | обязателен | по умолчанию | допустимо | что это |
|---|---|---|---|---|
| `--detail` | — | `yes` | `yes` · `no` | печатать ли каждую строку, а не только сводку |

**env:**
- `RUN_EPISODE_ID` — эпизод, по которому считаются траты

**читает:** `budget_log`


---

### stitch

Собирает кат: клипы по порядку, один энкод на всех, короткий чёрный хвост. $0.

```
npx tsx scripts/run/stitch.ts --dir <dir> --order <order> --out <out> [--tail <tail>] [--version <version>]
```

| аргумент | обязателен | по умолчанию | допустимо | что это |
|---|---|---|---|---|
| `--dir` | да | — | — | папка с клипами; каждый файл — `<имя>.mp4` |
| `--order` | да | — | — | порядок клипов через запятую, без расширения: `sh01,sh02,...` |
| `--out` | да | — | — | куда положить кат |
| `--tail` | — | `1.0` | — | длина чёрного хвоста в секундах |
| `--version` | — | `v01` | — | версия ката в студии |

**env:**
- `RUN_EPISODE_ID` — эпизод, которому принадлежит кат

**читает:** `assets`, `episodes`

**пишет:** `assets`


---

### sync-episode

Собирает раскадровку из заведённых клипов и сводит `budget_spent` с итемизированным леджером.

```
npx tsx scripts/run/sync-episode.ts [--version <version>] [--title <title>] [--script-file <script-file>]
```

| аргумент | обязателен | по умолчанию | допустимо | что это |
|---|---|---|---|---|
| `--version` | — | `v01` | — | версия раскадровки |
| `--title` | — | `` | — | название эпизода в шапке раскадровки |
| `--script-file` | — | `` | — | файл замысла/листа ожиданий — заводится как `SCR` APPROVED. Без него встаёт ВСЯ дистрибуция: Publicist требует сценарий, Key Art требует его же плюс метаданные, Distribution — метаданные и обложку |

**env:**
- `RUN_EPISODE_ID` — эпизод, паспорт которого дособираем

**читает:** `assets`, `budget_log`, `episodes`

**пишет:** `assets`, `episodes`


---

### write-asset

Пишет документ эпизода из файла: сценарий, раскадровку, план, метаданные — под каноническим именем.

```
npx tsx scripts/run/write-asset.ts --type <type> --file <file> [--status <status>] [--version <version>] [--desc <desc>]
```

| аргумент | обязателен | по умолчанию | допустимо | что это |
|---|---|---|---|---|
| `--type` | да | — | — | тип по конвенции: `SCR-script`, `STB-storyboard`, `SPC-ref_plan-<shot>`, `SPC-shot_plan-<shot>`, `SPC-metadata`, `SPC-thumb_plan`, `SPC-brief` |
| `--file` | да | — | — | файл с телом документа; читается дословно, пересказ не делается |
| `--status` | — | `DRAFT` | `DRAFT` · `REVIEW` · `REVISION` · `APPROVED` | статус строки; LOCKED здесь не ставится — он за Директором |
| `--version` | — | `v01` | — | версия в имени файла; новая версия заводит соседа, не затирает историю |
| `--desc` | — | `` | — | короткое описание для карточки; пусто — существующее не трогается |

**env:**
- `RUN_EPISODE_ID` — эпизод, которому принадлежит документ

**читает:** `assets`, `episodes`

**пишет:** `assets`


## Тулы ума (chat) — выжившие из старого диспетчера

> Живут в `lib/concierge/tools/*` до Ф6; при сносе переезжают и портируются на
> `defineTool`-самоописание. `reads`/`writes` у них не декларированы — гейт
> честности таблиц на этот раздел НЕ распространяется. Кил-лист (30 умерших) и
> основания отбора — `lib/mind/chat-tools.ts`.

| тул | ✎/👁 |
|---|---|
| [`getStudioStatus`](#getstudiostatus) | 👁 |
| [`getEpisode`](#getepisode) | 👁 |
| [`getRecentActivityEvents`](#getrecentactivityevents) | 👁 |
| [`findEpisode`](#findepisode) | 👁 |
| [`listSeries`](#listseries) | 👁 |
| [`listSeriesBibles`](#listseriesbibles) | 👁 |
| [`enrichBible`](#enrichbible) | ✎ |
| [`setBibleContent`](#setbiblecontent) | ✎ |
| [`createSeries`](#createseries) | ✎ |
| [`listSkills`](#listskills) | 👁 |
| [`getSkill`](#getskill) | 👁 |
| [`proposeSkill`](#proposeskill) | ✎ |
| [`updateSkill`](#updateskill) | ✎ |
| [`approveSkill`](#approveskill) | ✎ |
| [`listThemes`](#listthemes) | 👁 |
| [`proposeTheme`](#proposetheme) | ✎ |
| [`getWorkPlan`](#getworkplan) | 👁 |
| [`updateWorkPlan`](#updateworkplan) | 👁 |
| [`runVisualCritic`](#runvisualcritic) | 👁 |

---

### getStudioStatus

Get a summary of the studio's current state: recent episodes with their pipeline status and governance mode, count of items awaiting Director approval, last few activity events. Use this when the Director asks 'what is happening' or to orient yourself at the start of a conversation.

| аргумент | обязателен | допустимо | что это |
|---|---|---|---|
| `episodeLimit` | — | — | Cap on returned episode count (default 6, max 20). |

**меняет состояние:** нет

---

### getEpisode

Get full state for one episode: pipeline stages with their current state (idle / running / approved / blocked / failed), counts of approved / review / total assets per stage, and the active governance mode. If episodeId is omitted, uses the active episode from the conversation context.

| аргумент | обязателен | допустимо | что это |
|---|---|---|---|
| `episodeId` | — | — | UUID of the episode. Omit to use the active conversation episode. |

**меняет состояние:** нет

---

### getRecentActivityEvents

Read recent activity events (agent completions, asset updates, approvals, errors). Use at the START of each turn when an episode is in focus, so you can surface progress without waiting for the Director to ask. Director directive 2026-05-12: 'события которые произошло должно быть известно всем участникам' — PA must proactively notice draft readiness, agent failures, etc. Returns up to `limit` events (default 25) within the last `sinceMinutes` (default 30, max 1440).

| аргумент | обязателен | допустимо | что это |
|---|---|---|---|
| `episodeId` | — | — | Filter to one episode UUID. |
| `sinceMinutes` | — | — | Lookback window in minutes (default 30, max 1440). |
| `limit` | — | — | Max events returned (default 25, max 100). |

**меняет состояние:** нет

---

### findEpisode

Free-text lookup for an episode UUID by code (SS-S14-E01), working title, or any substring. Returns matching episodes with their UUID, code, title, status, and governance_mode. Use when the Director refers to an episode by its human-readable code and you need the UUID to call other tools.

| аргумент | обязателен | допустимо | что это |
|---|---|---|---|
| `query` | да | — | Episode code (SS-S14-E01 / E01), working title, or any substring. |

**меняет состояние:** нет

---

### listSeries

List SandyStudio series with their id, code (SS-S14, SS-PILOT, …), title, genre, audience. Use to discover series before creating a new episode or enriching its Bible.

| аргумент | обязателен | допустимо | что это |
|---|---|---|---|
| `status` | — | `DRAFT` · `ACTIVE` · `ARCHIVED` |  |
| `limit` | — | — |  |

**меняет состояние:** нет

---

### listSeriesBibles

Get the Series Bible sections (general_idea, characters, locations, objects, styles, audio) for a series. Returns metadata only — each asset's id, filename, slug, status, version, file_type, content_chars, AND `toc` (its heading outline). Use `toc` to see WHERE things live before reading — e.g. general_idea's toc shows a 'Seed Bank' section that holds the episode themes. To read the actual markdown of one asset, call `getAsset(id)` afterwards. NEVER expects the full body in this list — content is stripped to keep PA context window safe (a single LOCKED Bible can exceed 400 KB and choke OpenAI).

| аргумент | обязателен | допустимо | что это |
|---|---|---|---|
| `seriesId` | да | — | Series UUID. |

**меняет состояние:** нет

---

### enrichBible

Trigger EXEC-BIBLE-AUTHOR on a Bible asset. Without `notes` the writer composes the entry from scratch (DRAFT only). With `notes` it REVISES the entry that already exists: the current article stays the base and the notes are applied on top — use this whenever the Director asks to change, fix or correct canon text rather than replace it. Verbal approval required.

| аргумент | обязателен | допустимо | что это |
|---|---|---|---|
| `assetId` | да | — | Bible asset UUID (SBL-*). |
| `notes` | — | — | The Director's corrections, verbatim. Pass them whenever an article already exists and only needs changing — the writer keeps everything else as it stands. Omit to compose a new article from scratch. |

**меняет состояние:** да

---

### setBibleContent

Write Director-supplied verbatim text as a NEW DRAFT version of a Bible section. Use this when the Director dictates / pastes specific canon text and wants it persisted exactly as-is (not paraphrased by an agent). This is NOT a channel for canon prose written by you or by another agent — that is EXEC-BIBLE-AUTHOR's job, reached via enrichBible. You are an administrator, not an author. Creates a fresh version — old versions stay as history. Slug defaults to 'main' if omitted; pass a specific slug only when distinguishing sub-entries (e.g. character='sandy' vs 'pink_panther'). Never ask the Director about slug — call listSeriesBibles first to see existing slugs, or default to 'main'. Verbal approval required.

| аргумент | обязателен | допустимо | что это |
|---|---|---|---|
| `seriesId` | да | — | Series UUID. |
| `section` | да | `general_idea` · `character` · `location` · `object` · `style` · `audio` · `scene_master` |  |
| `slug` | — | — | Section item slug (e.g. 'sandy', 'cafe'). Required for non-general_idea sections. |
| `content` | да | — | The verbatim canon text the Director wants saved. |
| `description` | — | — | Optional short one-liner describing this Bible entry. |

**меняет состояние:** да

---

### createSeries

Create a brand-new series (SS-S15, SS-S16, etc) in DRAFT status. Seeds the default Approval Authority Matrix automatically. Use when the Director wants to start a fresh series from scratch (new comedy, new genre experiment). Requires verbal approval. After creation, use setBibleContent to author the general_idea/main Bible section, then createEpisode to start the first episode.

| аргумент | обязателен | допустимо | что это |
|---|---|---|---|
| `code` | да | — | Series code matching ^SS-(S\d{2}|PILOT)$, e.g. "SS-S15" or "SS-PILOT". |
| `title` | да | — |  |
| `audience` | — | `adult` · `kids` · `mixed` · `other` |  |
| `genre` | — | `comedy` · `drama` · `doc` · `sci_fi` · `other` |  |
| `logline` | — | — |  |
| `episode_budget_ceiling` | — | — |  |

**меняет состояние:** да

---

### listSkills

List Director-canon skills installed at .claude/skills/. Optional filters: status (ACTIVE | DRAFT | DEPRECATED), agent (EXEC-SB, EXEC-SW, …), genre (comedy, …). Use this BEFORE proposing a new skill — Director may have already canonized the rule, or there may be a DRAFT awaiting his approval. Returns slug + frontmatter (no body) per skill.

| аргумент | обязателен | допустимо | что это |
|---|---|---|---|
| `status` | — | `ACTIVE` · `DRAFT` · `DEPRECATED` |  |
| `agent` | — | — | Filter to skills whose applies_when.agent includes this agent id. |
| `genre` | — | — | Filter to skills whose applies_when.genre includes this genre. |

**меняет состояние:** нет

---

### getSkill

Read the full SKILL.md (frontmatter + body) for one slug. Use before proposing an updateSkill — you must know the current body to write a diff-aware revision. Slugs match the directory name under .claude/skills/.

| аргумент | обязателен | допустимо | что это |
|---|---|---|---|
| `slug` | да | — | Skill directory slug (kebab-case). |

**меняет состояние:** нет

---

### proposeSkill

Persist a NEW skill at .claude/skills/<slug>/SKILL.md with status=DRAFT. Verbal approval required (Director must say 'да' / 'одобряю' / similar in the active thread before this call). Use when Director articulates a forever-rule you want to canonize. Slug MUST be kebab-case (e.g. 'no-water-bottle-cliche'). The body should explain WHEN the rule applies and give 1-2 worked examples. applies_when scopes the skill: omit a field to apply broadly, supply array of strings to constrain (e.g. agent=[EXEC-SB], genre=[comedy]). hard=true makes the skill a HARD acceptance criterion in agent prompts; hard=false makes it guidance only. Refuses to overwrite an existing slug — use updateSkill for revisions.

| аргумент | обязателен | допустимо | что это |
|---|---|---|---|
| `slug` | да | — | Directory slug, kebab-case. |
| `name` | да | — |  |
| `description` | да | — |  |
| `body` | да | — |  |
| `hard` | да | — |  |
| `owner` | — | — |  |
| `applies_when` | — | — | Scope. Omit a field to apply broadly. Each value is an array of strings (or a single string). |

**меняет состояние:** да

---

### updateSkill

Revise an existing skill in place. Any subset of fields can be supplied: body, description, hard, applies_when, status. Frontmatter `name` and `created` are immutable; use proposeSkill for renames. Verbal approval required. Use this when Director refines wording, broadens / narrows scope, or flips an ACTIVE rule to DEPRECATED. The selector cache is cleared so the next agent run picks up the new content immediately.

| аргумент | обязателен | допустимо | что это |
|---|---|---|---|
| `slug` | да | — | Existing skill slug. |
| `body` | — | — |  |
| `description` | — | — |  |
| `hard` | — | — |  |
| `status` | — | `ACTIVE` · `DRAFT` · `DEPRECATED` |  |
| `applies_when` | — | — |  |

**меняет состояние:** да

---

### approveSkill

Flip a DRAFT skill to ACTIVE so agent runs start injecting it. Verbal approval required. Use after Director explicitly approves a DRAFT (e.g. 'одобряю <slug>', 'go skill X'). Errors if the skill is already ACTIVE, DEPRECATED, or missing.

| аргумент | обязателен | допустимо | что это |
|---|---|---|---|
| `slug` | да | — |  |

**меняет состояние:** да

---

### listThemes

Read-only. List the episode themes (reusable visual gag engines) already in the series Themes bank — each with slug, one-liner description, and status (approved / draft / used / invalidated — `used` means the theme already ran in an episode, listed in used_in_episodes). Call freely to answer «какие темы есть?» and BEFORE proposing a new theme, to avoid duplicating an existing gag engine. Resolves the series from the open episode when seriesId is omitted.

| аргумент | обязателен | допустимо | что это |
|---|---|---|---|
| `seriesId` | — | — | Series UUID. Omit to use the open episode's series. |
| `episodeId` | — | — | Episode UUID — only used to derive the series when seriesId is omitted. |

**меняет состояние:** нет

---

### proposeTheme

Persist a NEW episode theme (reusable visual gag engine) as a DRAFT in the series Themes surface. Verbal approval required (Director must say 'да' / 'одобряю' / similar in the active thread before this call). Use after Director approves a theme you proposed, or when he says «добавь в themes». `description` is the ONE-LINER shown in the index (what the gag engine is, in a sentence); `content` is the full theme markdown (mechanism, escalation, why it fits the series). The theme lands in the Draft group — Director re-statuses approved/invalidated in the UI. Refuses to overwrite an existing theme slug.

| аргумент | обязателен | допустимо | что это |
|---|---|---|---|
| `description` | да | — | One-liner for the index — what the gag engine is. |
| `content` | да | — | Full theme markdown (mechanism, escalation, series fit). |
| `slug` | — | — | Optional explicit slug; derived from the one-liner when omitted. |
| `seriesId` | — | — | Series UUID. Omit to use the open episode's series. |
| `episodeId` | — | — | Episode UUID — only used to derive the series when seriesId is omitted. |

**меняет состояние:** да

---

### getWorkPlan

Read your durable work-plan & decision ledger for an episode (the STA-work_plan STATE asset). It records the Director's standing approvals and the current todo list, and survives the whole session. The same content is auto-loaded into your [WORK_PLAN] system-prompt block every turn — call this tool only when you need the full body explicitly or are operating on a non-focused episode. If episodeId is omitted, uses the active conversation episode.

| аргумент | обязателен | допустимо | что это |
|---|---|---|---|
| `episodeId` | — | — | Episode UUID. Omit to use the active conversation episode. |

**меняет состояние:** нет

---

### updateWorkPlan

Overwrite your durable work-plan & decision ledger for an episode with new markdown content (the STA-work_plan STATE asset). Use this to record the Director's standing approvals, the current todo list, and any plan/decision changes so they survive past the conversation window — you read this back every turn via the [WORK_PLAN] block. This is operational state you maintain yourself, NOT a creative gate, so it needs NO verbal approval — just keep it current. Pass the FULL new ledger body (not a diff); it overwrites in place. If episodeId is omitted, uses the active conversation episode.

| аргумент | обязателен | допустимо | что это |
|---|---|---|---|
| `episodeId` | — | — | Episode UUID. Omit to use the active conversation episode. |
| `content` | да | — | The full new ledger markdown body to persist verbatim. |

**меняет состояние:** нет

---

### runVisualCritic

Run the advisory Visual Critic on rendered reference image(s): it LOOKS at the pixels and judges them against the storyboard shot contract + style Bible (equipment/prop completeness per character, activity coherence, physics/geometry, anatomy/on-model, contract fidelity, style/genre), returning PASS / REVISE / FAIL with concrete findings. Pass shotId (e.g. 'S15-E28-SH16') to check ONE shot's ref, or omit it to sweep the whole episode. ADVISORY ONLY — it logs verdicts to the activity feed and never changes asset status. Use it to catch defects a human would spot but the text critics miss (a player with no racket, opponents on the same side of the net, off-model limbs). Omit episodeId to use the active episode.

| аргумент | обязателен | допустимо | что это |
|---|---|---|---|
| `episodeId` | — | — | UUID of the episode. Omit to use the active conversation episode. |
| `shotId` | — | — | Storyboard shot id (e.g. 'S15-E28-SH16') to check ONE ref. Omit to sweep every rendered ref in the episode. |

**меняет состояние:** нет
