# План реализации — Автономная фабрика (артефакт-граф + дирижёр + гейты)

> Build-блюпринт для реализации архитектуры, согласованной Director + Тео 2026-07-03 (см.
> `RUN-REPORT-E14.md` §3–4 и память `autonomous_factory_architecture_doctrine`). Реализовывать
> на свежую голову, фазами-PR. **Каждая фаза: за флагом, ручной путь не ломаем, verify-трио
> (tsc · vitest · replay-pilot).** Анти-аддитивно: **обобщаем существующие примитивы, не форкаем.**

## Инвариант (что строим)
Фабрика = **машина состояния над графом версионированных артефактов**. Детерминированный код
(«мышцы») гонит механику по **матрице состояния**; **дирижёр** (сильный LLM) читает матрицу и
принимает мало высокоуровневых решений; **гейты** (человек/делегат) — reserved + хард-лимиты.
Вмешательство на любом шаге инвалидирует **только downstream-конус**, остальное переиспользуется.

## Ключевые точки существующего кода (переиспользуем)
| Что | Где | Роль в плане |
|---|---|---|
| DAG-каскад | `webapp/lib/agents/next-events.ts` (`computeNextEvents`) | база авто-продвижения; стич-гейт `~1288` |
| Freshness-примитив | `parseContinuityAnchors` / `assessAnchorFreshness` (regenerate-image-from-plan путь) | **семя обобщённого freshness** |
| Музыка-bake | `bakeApprovedMusic` (`lib/agents/runners/animatic-slideshow.ts:258`) | sequential-only; подключить в parallel |
| Parallel-EDL | `ensureEpisodeAnimaticEDL` (`lib/api/ensure-animatic.ts`) | не печёт музыку (F8) |
| Критик-вердикты | `assets` `REV-*` `metadata.verdict` (PASS/REVISE) + `failed_checks` | вход Tier-0 auto-advance |
| Excluded SSOT | `episodes.metadata.excluded_shot_ids` | часть матрицы (live vs excluded) |
| Watchdog | `webapp/inngest/functions/pa-batch-stall-watchdog.ts` | сурфейс + ре-триггер дирижёра |
| Concierge tools | `lib/concierge/tools/*` (approveAsset, triggerAgent, regenerate*, list*) | дать дирижёру matrix-read + reconcile |
| Логи | `activity_events`, `gate_decision_log`, `budget_log` | сурфейс ошибок |

---

## Фаза 0 — Музыка в parallel-EDL (быстрый win) · маленький PR ✅ SHIPPED 2026-07-04
**Цель:** финалка parallel-эпизода получает уже одобренную AUD-music (закрывает жалобу Директора #1).
**⚠️ Причина оказалась НЕ той, что в F8.** F8 гласил «bake только в sequential; parallel не зовёт».
На деле `ensureEpisodeAnimaticEDL` музыку **уже печёт** (инлайн-дубликат). Настоящий баг — **порядок +
идемпотентность**: EDL материализуется на approve пилотов (`next-events.ts:1279`) ДО одобрения музыки →
печёт `null`; идемпотентный ранний-return потом отдаёт протухший (без музыки) аниматик; EXEC-STITCH
читает музыку только из замороженного контракта (`runner.ts:2620`) → немой cut. «ВЕСТИ ≠ ЧИНИТЬ».
**Что сделано:**
- (нов.) `lib/agents/music.ts` — общий `bakeApprovedMusic` + `contractHasMusic`. Свёл ДВА дубликата в один.
- `ensureEpisodeAnimaticEDL` — на идемпотентном пути **догоняет музыку** в существующий аниматик, если
  APPROVED `AUD-music` появилась ПОЗЖЕ материализации (это и есть фикс причины).
- Прекондиция стича: parallel Director-run без музыки → сурфейс `pipeline/stitch-blocked-no-music`,
  не собирать молча. AUTOTEST/sequential не тронуты (replay-pilot без регрессии).
**Файлы:** `lib/agents/music.ts` (нов.), `lib/api/ensure-animatic.ts`, `lib/agents/runners/animatic-slideshow.ts`, `lib/agents/next-events.ts`.
**Verify:** tsc чисто · vitest 1105/1105 (7 нов. в ensure-animatic.test) · replay-pilot 30/30.
**Осталось (не блокер):** живой ре-стич E14 с музыкой — отложено (Director: «забудь прогон»).

---

## Фаза 1 — Матрица состояния (фундамент) · средний PR
**Цель:** единый читаемый SSOT статуса — «где всё сейчас», для кода/дирижёра/UI.
**Дизайн:**
- Тип `EpisodeStateMatrix`: `{ shots: [{ shot_id, excluded, stages: { ref_plan|ref_image|shot_plan|video: { status, version, asset_id, fresh: bool, blocked_reason?: string } } }], music: {...}, final_cut: {...}, gates: {...} }`.
- `getEpisodeStateMatrix(episodeId)` — **одна каноническая проекция** над `assets`:
  латест-версия на (shot × stage) (формализовать ad-hoc логику из прогона: сорт по version desc,
  учёт excluded, INVALIDATED).
- **Обобщённый freshness:** каждый артефакт в `metadata.input_versions` пишет версии/id апстримов,
  из которых собран. `fresh = текущие апстрим-версии == записанные`. Обобщить `assessAnchorFreshness`
  на любой узел. `downstreamCone(shotId, stage)` → множество узлов-потомков для инвалидации.
- API `GET /api/episodes/[id]/state-matrix` + человекочитаемый рендер (markdown-таблица) — тот же,
  что увидит дирижёр и Director-UI.
**Файлы:** (нов.) `lib/agents/state-matrix.ts`, `app/api/episodes/[id]/state-matrix/route.ts`, типы.
**Тесты:** матрица отражает известные состояния; freshness ловит stale; downstream-cone верен.
**Done:** матрица == реальное состояние E-эпизода; на ней можно принимать решения без DB-раскопок.

---

## Фаза 2 — Код-механика над матрицей (Tier-0 auto-advance + self-heal) · крупный PR, ядро
**Цель:** убрать ~90% ручных approve; фабрика течёт от утверждённого плана до стича сама.
**Дизайн:**
- **Контракт «утверждённого плана»:** `episodes.metadata.production_plan = { shots, providers,
  budget_ceiling, reserved_gates: [...] }`. `reserved_gates` дефолт = brief · script · canon ·
  pilots · publish/LOCK/budget/mode. Всё прочее = MECHANICAL.
- **Reconciler** `reconcileEpisode(episodeId)` — идемпотентная функция над матрицей (безопасно
  звать на любое событие):
  - для каждого MECHANICAL-гейта в REVIEW с критиком PASS, шот в плане, в хард-лимитах → **авто-approve**
    (переиспользовать внутреннюю approve-логику `approveAsset`, вызвать из кода, не человеком) → каскад `computeNextEvents`;
  - **стич:** все live-шоты (excluded учтены) APPROVED **И** музыка есть → fire assemble-episode
    (переоценка на ЛЮБОЕ изменение, включая exclude — заменяет узкий триггер `next-events.ts:1288`);
  - **provider-fail:** auto-retry N (config) свежим запросом → затем шот `PARKED` в матрице + surface;
  - **critic-cap:** N-й REVISE одного shot-плана → `HALT` + surface (не бесконечный regen).
- Флаг `MECHANICS_AUTO_ADVANCE` (default off; on для autonomous-эпизодов).
**Файлы:** (нов.) `lib/agents/reconcile.ts`; правки критик-раннеров/обработчиков событий (звать reconcile);
retry-политика в `lib/agents/providers/fal-seedance.ts`; config reserved_gates; стич-гейт в `next-events.ts` (делегировать reconciler'у).
**Тесты:** reconciler авто-аппрувит MECHANICAL PASS, НЕ трогает reserved; стич фаерится на exclude;
parked-шот не блокирует остальных; retry→park; critic-cap→HALT.
**Done:** autonomous-эпизод от утверждённого плана доходит до стича **без ручных approve** (только reserved-гейты стоят).

---

## Фаза 3 — Сурфейс ошибок человеческим языком · средний PR
**Цель:** park/fail/HALT видно человеку и дирижёру ясным текстом.
**Дизайн:**
- park/fail/HALT → `activity_events` с plain-language message + `blocked_reason` в ячейке матрицы
  («SH16: провайдер-таймаут ×3 → park или retry?»).
- Watchdog батч-сурфейсит запаркованные шоты Директору (🔔) когда остальное готово.
**Файлы:** `pa-batch-stall-watchdog.ts`, эмиттеры событий, рендер матрицы (`blocked_reason`).
**Тесты:** parked-шот → читаемое событие; батч-нудж Директору.
**Done:** Директор/дирижёр видят «что застряло и почему» без чтения логов.

---

## Фаза 4 — Полина→сильная модель как дирижёр · крупный PR (последний)
**Цель:** дирижёр (сильный LLM) ведёт эпизод сам, механику делегирует коду.
**Дизайн:**
- Дать дирижёру tool `getEpisodeStateMatrix` (читает матрицу) + `reconcileEpisode`/точечные tools.
- **Петля дирижёра:** на stall/notify читает матрицу → решает высокоуровневый ход (обычно
  «reconcile» или разрулить сурфейснутое исключение: retry/park/escalate/regen) → делегирует коду.
- **Модель:** роль дирижёра на сильной модели (Opus) — отдельно от дешёвого чат-интерфейса Полины,
  ИЛИ бустить модель Полины на autonomous-эпизодах. (Стоимость: мало решений × компактная матрица ≈ ~$10/серия.)
- Watchdog ре-триггерит дирижёра на стойле до quiescent/гейта.
**Файлы:** concierge tools (+matrix-read, +reconcile), conductor-prompt/skill, watchdog-обобщение, model-routing дирижёра.
**Тесты:** end-to-end mock-эпизод: дирижёр+reconciler доводят до стича с **нулём ручных нуджей** (кроме reserved-гейтов).
**Done:** «Полина, прогони до стича» на стабильной фабрике → готовый cut без Тео-драйвера.

---

## Порядок и почему
0→1→2→3→4. Фаза 0 — быстрый win + де-риск. Фаза 1 (матрица) — фундамент, всё остальное её читает.
Фаза 2 — снимает ручной труд (главный рычаг). Фаза 3 — делает автономию наблюдаемой. Фаза 4 —
сажает дирижёра, когда 1–3 готовы (иначе ему нечего читать/делегировать).

## Definition of Done (полная автономия)
Директор утверждает `production_plan` + хард-лимиты → «прогони E-NN до стича» → фабрика доводит
theme→stitch сама; Тео-инженер не нужен (фабрика стабильна); Директор касается только reserved-гейтов
и видит батч запаркованных исключений; стоимость мозга ≈ $10/серия.

## Риски / заметки
- Держать ручной путь рабочим за флагами до Фазы 4 (откат в любой момент).
- `input_versions` требует, чтобы генераторы ПИСАЛИ версии апстримов — добавить в раннеры при Фазе 1.
- Reconciler ДОЛЖЕН быть идемпотентным (звать на любое событие без гонок) — критично.
- Не форкать: reconciler переиспользует approve-логику + `computeNextEvents`, не второй DAG.
- Свежая сессия перед кодом: перечитать `next-events.ts` (каскад целиком), approve-путь (`approveAsset`
  внутренности), критик-раннеры (где пишется verdict) — точки интеграции.
