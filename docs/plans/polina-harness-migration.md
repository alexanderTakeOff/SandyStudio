# Полина в харнесе Claude Code — план миграции

## Контекст

Прогон «ПАРАДИГМА» показал: кастомный «единый ум» (`/api/mind/chat` + `lib/mind/*` + `persistAsset`) — недописанная копия Claude Code. Каждая способность (глаза D-показ, деньги D81, скиллы D77, память D83, гейты D90/D100) переизобреталась по одной, хуже и с дефектом; слой записи несовместим с конвейером (D88, D91–D94, D101–D103 — один корень); функция убранных критиков не передана никому (кадр с 1 прожектором при каноне «twin floodlight» дошёл до Директора).

**Ратифицировано Директором («Бинго», 09.08):** Полина = роль (промпт + скиллы + права) в headless-сессии Claude Code, сидящей в отдельном клоне репо. Webapp = окно и пульт Директора. Гейты = хуки. Инструменты = `scripts/run/*` CLI. Строится ОДНА новая деталь — мост; умирают пять слоёв копии. Критерии приёмки: (1) по эпизоду в UI не определить, каким путём он сделан; (2) работа каждого убранного критика реально исполняется умом до предъявления.

## Топология и запуск (приёмка Директора)

Всё крутится на этой же машине (NAVIA VISION ONE), ничего облачного не добавляется:

| Что | Где | Как запускается |
|---|---|---|
| **Webapp — пульт Директора** | `http://localhost:3001` (nx-дерево, на время миграции; после merge — `:3000` master) | как сегодня: `start-stack-nx.cmd` / ярлык на десктопе |
| **Inngest** (fan-out пулы) | `:8388` (nx) / `:8288` (master) | тем же start-stack |
| **Мост** (`mind-bridge.ts`) | фоновый процесс рядом с webapp | **добавляется в start-stack.ps1** — поднимается и гаснет вместе со стеком, отдельных действий Директора НЕТ |
| **Клон Полины** | `C:\SandyStudio-polina` | ничего не «запущено» постоянно: мост спавнит `claude -p` процесс НА ХОД и тот умирает |
| **Сессии Полины** | транскрипты на диске (`~/.claude/projects/...`) | живут сами, resume по карте эпизод→session_id в БД |

**Приёмка выглядит так:** Директор двойным кликом поднимает стек (как сегодня), открывает webapp, заводит эпизод кнопкой, пишет Полине в панель / жмёт кнопки — всё. Никаких терминалов, никаких ручных запусков сессий. Если мост упал — стек показывает это в health, рестарт = рестарт стека.

## Фазировка

```
Ф0  Смоук харнеса + клон + роль-файл      ─┐ параллельно
Ф1  Персист run/* (R1–R23)                ─┘
Ф2  МОСТ (сессия ↔ concierge_turns)        после Ф0
Ф3  Хуки-гейты в клоне                     до первого платного хода Ф2
Ф4  Кнопки → события → пробуждение         после Ф2
Ф5  Панель-окно                            после Ф2 (∥ Ф4)
Ф6  Снос копии                             после живой проверки E05
Ф7  Чистое измерение E06                   финал
```

## Ф0 — Смоук харнеса, клон, роль

**Смоук (1 час, до любого строительства)** — живая проверка фактов, где документация неоднозначна:
`claude -p --output-format json` из скрипта: session_id в ответе → `--resume` (id ФОРКАЕТСЯ каждый ход — перечитывать из `result`); подхват `.claude/skills` и CLAUDE.md в print mode; Stop-хук с `decision:block` в headless; PreToolUse deny; **Agent tool (субагенты) в headless — включая `model: sonnet/haiku` для дешёвых самопроверок**; `total_cost_usd` в result. **Отдельно: подписочная аутентификация (OAuth) для headless против API-ключа — вопрос экономики, живой тест.** По итогам смоука уточнить детали Ф2/Ф3.

**Клон:** `C:\SandyStudio-polina` (та же ветка кода, рабочая ветка Полины — `polina/<тема>`).

**Возможности Полины = возможности Тео (решение Директора).** Никакого запрета на код:
- **Пишет код** в своём клоне: новые инструменты `run/*`, интеграция нового провайдера (Suno и т.п.), правки — на СВОЕЙ ветке. `Write`/`Edit`/`git commit`/`git push polina/*` разрешены.
- **Субагенты доступны** (Agent tool работает в headless): самопроверка/сверка — субагентом на дешёвой модели (`model: sonnet`/`haiku`), не Opus'ом; это и экономика, и чистый контекст для скептика.
- **Скиллы и заметки:** может создавать/править скиллы и записки в своём клоне; в общий канон они попадают через её PR.
- **Гейты вместо запретов** (хард-лимиты Директора, PreToolUse): merge в master и деплой (rebuild прод-стека) — только Директор/Тео; `publish` — только Директор; LOCK — только Директор; траты — гейт D90; `Read(.env*)` запрещён (ключи подаёт мост через env; новый ключ провайдера добавляет Директор).
- Её код попадает в прод тем же путём, что мой: ветка → PR → ревью → merge → rebuild. Приёмщик — Директор или Тео.

**Роль-файл:** новый `webapp/scripts/gen-role-polina.ts` генерирует `webapp/roles/polina.md` из реестров — переиспользует `buildRouteBlock`/`STATION_NOTES`/`GATE_AFTER`/`loadDoctrine` из `lib/mind/prompt.ts` (код переезжает в генератор, роут-обвязка умирает). Динамика (деньги/статусы) — НЕ в роль, а в UserPromptSubmit-хук (Ф3). Подача: `--append-system-prompt` при каждом ходе. **В роль добавляется станция самосверки** (решение Директора): кадр не предъявляется без сверки с плитами канона (прожекторы, огни по бортам, ракурс vs turnaround, свет, каст кадра; чек-лист — скилл `visual-shot-verdict`).

**Сторож:** снапшот-тест роли против `ROW_DEFINITIONS` (паттерн гейта docs/TOOLS.md).

## Ф1 — Персист run/* до эталона конвейера

Центр: `webapp/scripts/run/_asset.ts`. Документы (SBL/STB/SPC) — слот/UPDATE как есть; медиа (IMG/VID) — **всегда INSERT**:

1. **R1/R2:** `version = max(version)+1` по `file_type` (паттерн `episode-references.ts:2200,2620`); имя `-vNN-` из реальной версии. **Требование Директора: КАЖДАЯ правка через ревью = отдельная версия** — распространяется и на документы (SCR/STB/SPC): правка по нотам ревью создаёт новую строку версии (паттерн `nextVersionFor`, `lib/api/series-bible.ts:378`), а не переписывает слот; UPDATE остаётся только для статус-переходов той же версии.
2. **R4/R5:** байты через `persistBinary` (`lib/persist-binary.ts:199`) вместо `copyFileSync` → `drive_file_id`/`browserUrl` → превью и cache-bust (`resolvePreviewSrc`) начинают работать.
3. **R8:** frame: `metadata.shot_reference = {contract: SHOT_REFERENCE_CONTRACT, shot_id, generation_history[], review:null}`; самопроверка `isShotReferenceV2`.
4. **Демоушен:** перед APPROVED — `resolveSlotDescriptor` + `demoteSiblingApproved` (`lib/api/single-approved.ts`), иначе duplicate key по `assets_one_approved_per_shot`.
5. **R13:** дефолтный статус медиа — `REVIEW`, не APPROVED.
6. **R10/R22 (D101/D102):** убрать `metadata.recipe`; frame → `image_prompt{current_version, history[]}` + `generation_history[0]` по контракту EREF; clip → `metadata.prompt` плоско + provider/tier/seed/duration (эталон `exec-vgen.ts:586`).
7. **D99:** `gen-video` длительность = из раскадровки +0.5с+0.5с, кламп min 4; явный `--duration` побеждает (`wasGiven`).
8. **Самопроверка «увидит ли лента»:** после persist прогнать строку через чистые `resolveTimelineCells` + `resolvePreviewSrc`; не видно → громкий отказ.

**Проверка:** unit на версии/contract/демоушен/REVIEW; живьём: перегенерация кадра E05 даёт v02 РЯДОМ с v01, превью свежее, дровер открывается.

## Ф2 — Мост (единственная новая деталь)

`webapp/scripts/mind-bridge.ts` — долгоживущий процесс (в start-stack), НЕ Next-роут.

- **Канал = БД.** Вход: Realtime-подписка на INSERT в `concierge_turns` (`role='director'` + пробуждающие `role='system'`), поллинг-фолбэк. Выход: ходы Полины → `concierge_turns` (упрощённый `persistTurn`). Панель уже слушает turns Realtime'ом.
- **Спавн на ход:** `claude -p --output-format stream-json --append-system-prompt <roles/polina.md> [--resume <sid>]`, cwd = клон, текст через **stdin** (лимит argv Windows). stream-json события → строки `tool_call`/`tool_result` в turns (живость в панели без HTTP-стрима).
- **Карта сессий:** `episodes.metadata.mind_session = {session_id, busy{pid,turn_id}, updated_at}` — ноль миграций; session_id перечитывается из `result` КАЖДЫЙ ход (форк при resume).
- **Деньги:** `result.total_cost_usd` → строка в `budget_log` (замена `recordConciergeCost`; D95 закрывается — цифра от движка).
- **Отмена:** control-строка от панели → `taskkill /PID /T /F` + честная строка «ход прерван» (D69 сохраняется).
- **Конкуренция:** один ход на эпизод (замок busy в БД, чистка мёртвых pid на старте); сообщения Директора во время хода буферизуются в следующий ход.
- **`scripts/mind-say.ts`** (наследник mind-post): INSERT director-строки + ожидание assistant-строки — headless-канал Тео.

**Проверка:** `mind-say --episode E05` → director/tool/assistant строки в БД, cost_usd в metadata, session_id обновился, второй ход помнит первый.

## Ф3 — Хуки-гейты в клоне

Логика — в одном CLI `scripts/run/gate-check.ts` (переиспользует `assertEpisodeReadyToSpend`, `sb`); хуки тонкие:

- **PreToolUse (Bash):** `publish` → deny всегда (хард-лимит — кнопка Директора в webapp); `gen-frame|gen-video|stitch` → gate-check spend (бюджет/потолок/настройки из БД); LOCKED-ассеты → deny.
- **Stop (рапорт-гейт, D100):** транскрипт хода: рапорт-маркеры («сделано/записала/сгенерир») без вызова `write-asset|register-*|gen-*|set-status` → block «покажи id строки». Плюс гейт самосверки: был `gen-frame` без Read кадра + вердикта → block.
- **UserPromptSubmit:** `gate-check context` → статус эпизода, spent/ceiling из `budget_log`, счёт REVIEW — свежая динамика каждый ход (замена dynamic-части prompt.ts).

**Проверка:** снять `budget_approved` → отказ до запуска инструмента; голый рапорт → block.

## Ф4 — Кнопки → сигнал уму (D91/D92/D93)

Субтрактивно — через существующую трубу activity_events → PG-триггер 0049 → concierge_turns → Realtime:

1. `approve/route.ts:60,116,126`: три прямых insert → `logEvent`.
2. Миграция 0056: в whitelist триггера 0049 добавить `approval_granted`, `pipeline_started`, `episode_settings_changed`.
3. Пробуждение: мост будит сессию по `WAKE_EVENT_TYPES` (правится в `lib/api/event-actionable.ts` — одно место); эхо-защита по actor остаётся. `exec-pa-react.ts` (слал в мёртвый роут — D93) умирает.
4. D91: переходы `episodes.status` — обязанность Полины по карте маршрута (`sync-episode`/`set-status`), фиксируется в роли.

## Ф5 — Панель-окно

`ConciergePanel.tsx` (1741 строк → ~300): рендер turns (Realtime уже есть) + input + стоп. Умирают: стейт-память разговора, протокол `{t:...}`, CHAT_ENDPOINT, фантомный `t:'cancelled'`. Send = новый крошечный insert-роут `/api/mind/turn` (auth Директора). Fan-out — кнопки webapp + одна команда от Полины, пул ведёт Inngest (`exec-eref-execute:4`) — D96/D98.

## Ф6 — Снос копии (по шагам, каждый после зелёной проверки)

6.1 `app/api/mind/chat/route.ts`, `scripts/mind-post.ts` → сторож: mind-say живой.
6.2 `lib/mind/tool-bridge.ts`, `chat-tools.ts`, `harness-flag.ts` → tsc + `--help`-смок run/*.
6.3 `lib/mind/prompt.ts` (build-код уже в генераторе роли) → снапшот-тест роли.
6.4 `lib/concierge/*` LLM-машинерия (`anthropic-native`, `llm`, `system-prompt-builder`, `build-context`, `auto-react-loop`, `ambient-events`, `await-detector`, `resolve-mode`, `approval-check`, мёртвые tools), `inngest/exec-pa-react`, `/api/concierge/chat{,-internal}` → grep-сторож импортов.
6.5 `threads.ts` худеет до `createThread/getThread/persistTurn/loadRecentTurns`.

**Судьба 19 чат-тулов:** 16 умирают (скиллы нативны; ассеты через `show-asset`/`write-asset`; критик — глаза самой Полины + Stop-гейт; операции Директора — кнопки), +3 маленьких CLI: `run/show.ts` (episode/studio/series/bibles/themes), `run/cast-episode.ts` (несёт контракт `parseCastSlugs`), `run/theme-propose.ts`.

## Ф7 — Чистое измерение

E06 через Полину без подсказок: бриф → каст → сценарий → раскадровка → пилот-кадры с самосверкой → гейты. Мера — пройденные станции + ноль расхождений UI (версии, превью, дровер, статусы).

## Ф8 — Второй подписочный harness (OpenAI Codex, 24.08)

`mind-bridge` остаётся один, но имеет два runner-а: `claude -p` и
`codex exec --json`. Оба берут модель из Studio Settings, хранят
разные session id одного треда и не получают API-ключи. Старый
`openai/gpt-5.6-*` выбор мигрируется в `codex/gpt-5.6-*`.

Откат без кода: выбрать «Подписка · Opus». Откат кода: один
revert в NX + revert добавлений `.codex/hooks.json` в клоне Полины.

Пульт меняет эту же строку: `/model` открывает inline-кнопки,
`/model terra` — быстрый шорткат. Отдельного Telegram-конфига нет.

## Риски

- Windows-спавн: `claude.cmd` shim, stdin для текста, `taskkill /T /F` против процессов-сирот.
- Форк session_id при resume — не перечитал → амнезия (сторож в mind-say).
- Длинные ходы: потолок моста (конфиг ~45 мин + `--max-turns`); худший случай снимает fan-out через Inngest.
- Оплата: смоук Ф0 решает API-key vs подписка; до решения — API-ключ (нативный кэш ≈ −86% входных).
- Секреты в клоне: ключи через env моста, deny Read(.env*).

## Верификация сквозная

Каждая фаза: `npx tsc --noEmit` + vitest затронутого + живая проверка на E05; Ф7 — чистый E06. Ритуал §12: PLAN.md на master после фаз.

---

## Результаты смоука Ф0 (09.08, живые прогоны, не документация)

| Факт | Вердикт |
|---|---|
| `session_id` в `--output-format json`, `--resume` держит память | ✅ работает; **id НЕ форкается** (тот же uuid после resume) — мост всё равно перечитывает из result, но страх амнезии снят |
| CLAUDE.md проекта в print mode | ✅ **подхватывается** (маркер вернулся) — справка ошибалась |
| Скиллы `.claude/skills` в print mode | ✅ видны (нашёл smoke-скилл по описанию) |
| Хуки PreToolUse/Stop в headless | ✅ работают, **но только с явным `--settings <path>`** — project-settings из недоверенной папки сами не грузятся. PreToolUse exit 2 → модель видит текст отказа дословно; Stop `decision:block` → модель продолжает и выполняет требование |
| Субагенты в `-p` | ✅ Agent tool работает, `model: haiku` реально использует Haiku (видно в modelUsage) |
| Кэш | ✅ нативный, TTL 1h: первый ход 56K creation → второй ход 85K read, цена $0.36 → **$0.04** |
| **Оплата** | ✅ **все смоук-ходы прошли по ПОДПИСКЕ** (OAuth-аккаунт, `ANTHROPIC_API_KEY` в env отсутствует) — headless на подписке работает живьём. `total_cost_usd` в ответе — оценка для учёта, не счёт. Мост НЕ передаёт `ANTHROPIC_API_KEY` в env процесса (иначе биллинг переключится на API); лимиты подписки — предмет наблюдения на Ф7 |

Следствия для конструкции: мост всегда передаёт `--settings <клон>/.claude/settings.json`
явно; дефолтная модель `-p` — sonnet-5, модель Полины задаётся `--model`; деньги в
`budget_log` пишутся из `total_cost_usd` с пометкой `estimate`.
