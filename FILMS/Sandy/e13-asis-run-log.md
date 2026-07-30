# E13 «Vending Machine» — слепок процесса «как есть» → закалка Mode 3

> Живой журнал прогона. Каждый шаг: время · актор · событие · трение · правка/TD.
> Актор = Тео (оркестратор+механик) · Director (аппрувер) · Полина (руки) · пайплайн (авто).
> Цель: карта трений + внесённые правки для выхода на чёткий Mode 3. План: `~/.claude/plans/clever-wondering-sundae.md`.
> Форма: fix-first → Mode 2.5 → Тео толкает Полину, Director аппрувит 9 гейтов.

---

## Readiness (до старта)

| Проверка | Статус |
|---|---|
| Флаги пайплайна (`DESIGNER_CHAIN`/`ANIMATOR_CHAIN`/`READABILITY_GATE`=true, `C1_STOP_BEFORE_EREF`=false) | ✅ уже выставлены в `.env.local` |
| Токены (`EXEC_DIR_AI`/`PA_INTERNAL`/`TEAM_CHAT`) | ✅ present |
| Полина провайдер | `anthropic` (Opus) · auto-react armed (claude_message обходит kill-switch) |
| `SHOT_REGEN_CAP` | ⚠️ =12 (не 6); `PLAN_REGEN_CAP` дефолт 3 |
| `episodes.governance_mode` тип | `number` — 2.5 хранится, если колонка numeric; иначе '2' (оба строгие, фикс работает) — уточнить при создании |

---

## Журнал шагов

### #1 — Step 0: разблокировать авторизованные nudge (flagship-правка к Mode 3)
- **Время:** 2026-07-01 ~19:37 (Dubai)
- **Актор:** Тео
- **Событие:** реализована хирургическая правка асимметрии `authorized_principal`.
  - `webapp/lib/concierge/tools/types.ts` — поле `authorizedOperational` в `ToolContext`.
  - `webapp/lib/concierge/approval-check.ts` — чистая функция `decideAutoReactMutation` + `CREATIVE_APPROVAL_TOOL_NAMES` (дом рядом с `gateMutation`, DRY).
  - `webapp/app/api/concierge/chat-internal/route.ts` — `authorizedOperational` = `!bold && directMessage.authorized`; прокинут в authHeader (bearer), схемы (`AUTHORIZED_OP_TOOL_SCHEMAS` = bold minus approveAsset), инструкцию модели и gate (заменён inline-блок на `decideAutoReactMutation`).
  - `webapp/__tests__/lib/concierge/auto-react-mutation.test.ts` — 28 тестов контракта.
- **Трение (диагностировано разведкой, не вживую):** в строгих режимах (1/2/2.5) любой nudge Полины давал `auto_react_mutating_blocked` — Mode-3 блокер из бэклога. Approval-слой доверял `authorized_principal`, harness-gate игнорировал.
- **Правка/инвариант:** авторизованный nudge → **операционные** мутации проходят даже в строгом режиме; **творческие аппрувы (`approveAsset`) остаются за Director** (исключены из схемы + заблокированы в gate); хард-лимиты — Director-only в любом режиме (без изменений).
- **Verify:** tsc·0 / vitest **1068** (+28) / replay-pilot **30/30**. Live-доказательство (nudge createEpisode мутирует, nudge approveAsset отказан) — на старте прогона.
- **Net-delta:** консолидация (inline-gate → одна чистая функция); +1 helper, +1 поле, +1 тест-файл; переиспользованы существующие `directMessage.authorized`, `BOLD_MODES`, `isHardLimitTool`. Чистый выигрыш по читаемости.

---

## Открытые пре-реквизиты (нужен Director)

- ✅ **Гейт 1 (theme):** Director промоутил `the_vending_machine` → approved (2026-07-01).
- ✅ **Go (q2):** Director дал «go» на прогон (2026-07-01).

---

### #2 — Аудит канона гейта 4 (SS-S15 «Sandy Chronicles S15»)
- **Время:** 2026-07-01 ~19:45 (Dubai) · **Актор:** Тео (read-only DB) · **Источник:** `_e13-canon-check.mjs`
- **Найдено:** 27 LOCKED `SBL-*` в SS-S15.
  - Персонажи LOCKED: `sandy_hourglass`, `anvil`, `metelka` → EREF «≥1 character» ✅
  - Стиль LOCKED: `style_s15_style_canon_2d_v1` → EREF «≥1 style» ✅
  - Локации LOCKED: elevator cab (варианты), `elevator_corridor_door_wall`, `empty_background`, `sandy_bedroom`
- **Дыра (для per-slug casting preflight, `series-bible.ts` validateCanonExists):**
  1. `SBL-object_vending_machine` — отсутствует (гэг-движок, обязателен)
  2. локация-коридор с автоматом — отдельной нет (кандидат на переиспользование `empty_background`)
- **Творческое ограничение:** world-bible запрещает текст/вывески/экраны → автомат надо переосмыслить аналоговым, без надписей (рычаг/ручка, символы-пиктограммы).
- **Заметка:** `_e13-canon-check.mjs` оставлен для повторной проверки LOCKED после авторинга; удалить после.

### #3 — Решения Director по канону/эпизоду (2026-07-01)
- **Ban (технологии/вывески):** DB-скан SS-S15 `general_idea`+`style` → **запрета НЕТ** (жил только в файле SS-S01). Современный автомат уже разрешён → правок канона не требуется (субтрактивно).
- **Локация:** переиспользуем LOCKED `SBL-location_empty_background` — новую не авторим (q4/Director).
- **Автомат = ПЕРСОНАЖ** (`SBL-character_vending_machine`), не object: современный, минимум деталей, яркий; референс = turnaround-лист (front/left/right/back + 3D). Требует канон-текст + референс-картинку + Director LOCK.
- **Финал (идея Director):** обессиленная Сэнди → беззаботная Наковальня мимоходом толкает автомат → содержимое сыпется на Сэнди (external-cause/false-success). Длина 1 мин, гэгов много → считать группами-механизмами (6–10), не плоским числом.

### #4 — Режимная реальность + первый живой nudge (2026-07-01 ~20:20)
- **Полина ответила Директору:** governance mode = **3** (глобальный дефолт `app_config`), model `claude-opus-4-8`, эпизода в фокусе нет.
- **Директор:** в UI нет тумблера на 2.5.
- **Корень (F5):** `episodes.governance_mode smallint NOT NULL CHECK (BETWEEN 1 AND 4)` (миграция 0002) → **Mode 2.5 физически не хранится**, значения только 1/2/3/4. «2.5 APPRENTICE» из CLAUDE.md §6 не представим на уровне эпизода.
- **Решение:** E13 гоним в **Mode 2** (хранимый строгий; по принуждению = «2.5»: не bold, ждёт аппрувов, не авто-продвигается; bold только 3/4). Выставлю на эпизоде при создании (UI не нужен). Твои 9 гейтов держатся, Step-0 nudge работает.
- **Первый живой nudge (setBibleContent+enrichBible на автомат):** отправлен в thread `dfdecacd…` (turn `d865aac5…`), HTTP 200, authorized_principal + операционное «одобряю». Полина в Mode 3 → отрабатывает. Канон автомата авторит САМА Полина по утверждённому концепту (возврат к «всё через Полину» после дрейфа, где Тео сам писал канон).

### 🔎 Находки процесса (кандидаты к Mode-3 редизайну)
- **F5 — Mode 2.5 не существует как хранимое значение** (`governance_mode` smallint CHECK 1..4). Документы описывают APPRENTICE, кода нет. Нет UI-тумблера → потому что нечего выставлять. Для строгого прогона использовать Mode 2.

### #5 — Первый nudge стал источником 3 находок (2026-07-01 ~16:24-16:30 UTC)
Полина на nudge вызвала `findEpisode`, затем выдала текст «Записываю Bible Entry…», но **`setBibleContent` не вызвала** — ассет не создан. Директор допросил её; она само-диагностировала. Разбор:
- **F7 — claude_message обрезается до 600 симв.** `system-prompt-builder.ts:576` `truncate(t.content, 600)`. Мой nudge ~1600 → концепт (шёл после шагов 1-2) обрезан ровно на «enrichBible … s15_style_canon_…», дословно как жаловалась Полина. **ПОЧИНЕНО:** 600→4000 (правка live, hot-reload). Полный текст хранится целиком — обрезка была только при рендере, значит прошлый nudge теперь отрендерится полностью.
- **F8 — Полина не принимает токен-«одобряю» AI-EP на канон-запись, деференс к Директору.** Корень: блок `[TEAM_CHAT_FROM_CLAUDE]` (стр. 586-587) описывает Тео как «peer-level collaborator», без делегированной AI-EP-власти при `authorized_principal`. Система даёт право (q3 2026-06-12), промпт — нет. **Governance-решение за Директором** (канон-LOCK в любом случае остаётся человеку). Обход сейчас: Директор даёт прямое «да» Полине.
- **F9 — ложный прогресс вместо эскалации.** Сказала «Записываю» (как будто делает), хотя не имела ни концепта, ни (по своей логике) полномочий — вместо мгновенного «я заблокирована: нет X, нужно Y». Анти-паттерн «отчитался, но не проверил/не сделал». Кандидат: proactive-escalation в промпт.

### #6 — ИНЦИДЕНТ: Mode-3 каскад E13 + drift бейджа (2026-07-01 ~16:56-17:12 UTC)
E13 создался в глобальном дефолте **Mode 3** (не Mode 2 из плана). Директор аппрувнул бриф → в bold-режиме Полина **авто-аппрувнула и пролетела каскадом БЕЗ кастинга и БЕЗ его гейтов**: brief→Writer→SCR(auto-APPROVED)→Critic PASS(auto)→Publicist+Storyboard. Каст (`SPC-episode_cast`) отсутствует; канон автомата ещё не залочен → скрипт по не-канону.
- **Стоп:** Тео выставил E13 `governance_mode=2` (DB) → каскад встал. После этого Полина на Readability HALT **корректно затормозила** и вызвала `markAwaitingDirector` (Mode-2 gated-поведение работает).
- **F10 — эпизоды наследуют Mode 3 → преждевременный авто-каскад.** createEpisode не пинит строгий режим; глобальный дефалт = 3. Фикс: глобальный дефолт → Mode 2 на прогон (q9) И/ИЛИ пинить режим при создании до аппрувов.
- **F11 (ПОДТВЕРЖДЁН Директором) — UI-бейдж показывал Mode 2, пока эпизод реально бежал Mode 3.** Бейдж ≠ фактический режим эпизода → Директор думал, что в gated, а пайплайн летел delegated. Классический «три хранилища» дрейф. Корень всей злости. Фикс обязателен (бейдж должен читать эффективный режим эпизода в фокусе).
- **q11 (Директор: «настрой»)** — донастроить пробуждение Полины (Phase 2): будить на значимых переходах (REVIEW/APPROVED/HALT), дебаунс, read-before-ping, кросс-тред осведомлённость. Переиспользуем `exec-pa-react`, не плодим агента.
- **E13 решение (q8):** не срочно (Mode 2, замерло). Рекомендация — переделать канон→каст→writer; storyboard оставить референсом.

### #7 — Фиксы закоммичены + новые находки (2026-07-01 ~21:30 UTC)
**Коммит `95410ad`** (ветка `claude/e13-nudge-badge-casting-fixes`, 9 файлов). tsc·0 / vitest 1068 / replay 30.
- ✅ **F7** обрезка 600→4000.
- ✅ **Step 0** authorized nudge (decideAutoReactMutation + 28 тестов).
- ✅ **F11** бейдж/чип режима читают+пишут эффективный режим ЭПИЗОДА (не глобал); GET `/api/system/governance-mode`; метка `· ep`/`· gl` + «Applies to» в модалке. Двойной баг (бейдж читал глобал + чип писал глобал) устранён.
- ✅ **Casting approve UI** (косяк Директора): BUG1 — `AssetPreview` теперь монтирует Approve для `SPC-episode_cast`; BUG2 — `StageKebabMenu` `casting: ['SPC-episode_cast']` (approve-all был no-op).

**ОТЛОЖЕНО (следующий блок, свежий контекст):**
- **FIX 3 — гейт storyboard-после-каста.** `gate.ts` `AGENT_GATES['EXEC-SB']` добавить `{fileTypePrefix:'SPC-episode_cast', minCount:1}` + **исключение для AUTOTEST (mode 4)** по образцу `EXEC-EDIT` anchor-override (`gate.ts:450-473`), иначе ломает replay-pilot. Перепрогнать replay после.
- **F13 (косяк Директора) — бюджет-гейт.** Бюджет эпизода не утверждён Директором, а работы идут. Правило: после брифа работы только после утверждения БЮДЖЕТА (+ настроек эпизода). Добавить pipeline-подсказку. Найти где бюджет утверждается + встроить как pre-req.
- **q11 донастройка пробуждения Полины** (q12-набор одобрен: REVIEW/APPROVED/agent_failed/HALT/decision_requested): (1) кросс-тред awareness блок в `system-prompt-builder`; (2) сузить `ACTIONABLE_EVENT_TYPES` (`event-actionable.ts:22`) + metadata-предикат на статус-переходы.
- **q8** — переделка E13 канон→каст→writer (после того как каст-approve и гейты готовы).
- **Незавершённое авторинг автомата:** Полина ждала прямое «да» Директора (текст для копипаста выдан); канон `SBL-character_vending_machine` ещё не создан/не залочен.

### #8 — Batch 2 (fixes) закоммичен (2026-07-01 ~22:00 UTC) — commit `409e548`
Ветка `claude/e13-nudge-badge-casting-fixes`. tsc·0 / vitest 1068 / replay 30.
- ✅ **Item 1 (genre) — NO-OP + переоценка.** `series.genre` у SS-S15 **уже `comedy`** (verify поймал ошибку разведки). E13 CREAD-HALT — НЕ unset genre, а **транзиентная деградация резолва** (`runner.ts:274-279` глушит genre→null при любой ошибке → молча вырубает comedy-скиллы). Инфра корректна; риск = тихая деградация; опц. упрочнение — сделать сбой резолва ГРОМКИМ. Подтвердится на след. CREAD-ране.
- ✅ **Item 2 — превью approve обобщён** (`isApprovableText`, поглотил casting-ветку; +metadata/copy/REV/script/storyboard). Version-picker — опц. полиш (не сделан).
- ✅ **Item 3 — FIX 3** storyboard требует APPROVED-каст (`gate.ts EXEC-SB` + AUTOTEST-исключение Step-0b).
- ✅ **Item 4 — F13 бюджет-гейт**: `budget_approved` (metadata, human-only через settings PATCH) + `gate.ts` Step-0c (блок AGENT_RUN, mode-4 исключён, PUBLISH не гейтится) + кнопка в `EpisodeSettingsCard` + баннер на странице эпизода.

**ОТЛОЖЕНО (следующая сессия, точные рецепты):**
- **Item 5 / q11 — пробуждение Полины.** (a) кросс-тред awareness: pull-блок в `system-prompt-builder.ts` по in-focus `episodeId` (плюмбинг episode-status в ctx, ИЛИ safe prompt-nudge «pull status перед ответом» через read-тулы `getRecentActivityEvents`/`getNextGate`). (b) сузить `event-actionable.ts:22` + metadata-предикат на статус-переходы — ДЕЛИКАТНО (риск под-wake). q12-набор одобрен.
- **Item 6 / q8 — переделка E13** канон→каст→writer в Mode 2 (после LOCK канона автомата); отбросить out-of-order script/storyboard.
- **PLAN.md на master** — при мёрже ветки (Ritual 1).
- **Gate unit-тесты** Director-mode блокировки (FIX3/F13) — нужен supabase-мок; replay покрывает mode-4.
- **Push ветки** (коммиты 95410ad, 409e548) — по слову Директора.
- **F1 — Порядок пайплайна vs творческая интуиция.** Director ожидал `writer → assets → casting`; код зашит `brief → casting → script` (casting хард-гейтит канон, релизит Писателя). Для E13 не мешает (сущности известны из темы+финала), но общий вопрос открыт: script-first или более богатый brief? Решение: этот прогон идём casting-first, расхождение залогировано.
- **F2 — Авторинг нового library-персонажа end-to-end.** РАЗРЕШЕНО: Полина ведёт до LOCK, LOCK — только человек-Director.
  - Рецепт: `setBibleContent`(создать DRAFT `SBL-character_vending_machine`) → `enrichBible`(Sonnet-описание + одна 1024×1024 front/¾ gpt-image-2 картинка, `runBibleAuthor`) → **Director LOCK в Library-UI** (`/lock` → `assertHumanDirector`, EXEC-DIR-AI токен отвергается; lock-тулы у Полины нет).
  - **Это задуманный человеческий гейт (LOCK=хард-лимит), не баг.** Финальная точка гейта 4 = твои руки.
  - **Сохранение дизайна:** `enrich` сидит картинку из колонки `description` (`seedDescription`); Sonnet пере-генерит описание из сида. → пишем авторский канон в `description` ДО энрича, дизайн переживает в тексте и картинке.
  - **Turnaround/3D:** система не поддерживает (enrich = одна front/¾; объектные промпты банят multi-view; доктрина `library-style-first` = один якорь). q6 → рекомендация (б) одна плоская 2D картинка; ракурсы даёт EREF на шоте.
