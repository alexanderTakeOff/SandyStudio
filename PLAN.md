# SandyStudio — PLAN.md
## Master Production Tracker | v0.3 | DRAFT

> Single source of truth for current phase, blockers, next steps, ownership.
> **Living anchor, NOT an append log. Hard cap ≤ 200 lines** — add one line, cut two.
> Updated in the same session as code change (CLAUDE.md §12 Ritual 1).
> History → `docs/PLAN-history.md` (+ `git log -- PLAN.md`). Read after CLAUDE.md every session start.

---

## 🧭 NORTH-STAR (re-anchor here every turn — see rules/common/partnership.md "Compass")

- **Goal (Star):** AI movie factory — **фабрика = АКТИВ, Сэнди (*Silent Sandy*) = ДОКАЗАТЕЛЬСТВО.** Стоимость фабрики = `дёшево × хорошо × быстро`, доказуемо ЦИФРАМИ. Director-gated at every step.
- **Phase:** **Голова построена, ПЕТЛЯ РАЗОМКНУТА.** Машина производит автономно (E18 end-to-end). Сенсор ЦЕНЫ замерен (E15 **$90/мин**, ~50% срезаемого жира). Сенсор КАЧЕСТВА построен, но ТЁМНЫЙ (всё unlisted, **0 публичных данных**). Next = **Первый Доказательный Эпизод** (намеренно-хороший · vertical-safe · публичный · цена vs $90-базы) → зажигает ОБА сенсора + замыкает петлю.
- **Active intents (drift-check against these):** (1) **Первый Доказательный Эпизод** = первый под vertical-safe правилом + первый публичный → retention/CTR (качество) + цена vs $90 (дёшево); (2) срезать **$90→~$45** (Полина $27/30% + ~20 лишних рендеров, D17); (3) vertical-safe сториборд-правило **SHIPPED** (доктрина + активация + P2-мышцы нарезки; batch-драйвер ждёт эпизод); (4) hold PLAN.md + Compass; verify via jobs/counts, НЕ shell.
> Stable block — change only when goal/phase/intents genuinely shift, not per session.

---

## CURRENT STATE

```
Date:   2026-07-13 (СТРАТЕГ-сессия «Гуру» — знания, не код. Цель заострена: **Фабрика=актив, Сэнди=доказательство**, стоимость=дёшево×хорошо×быстро. Диагноз: голова построена, **ПЕТЛЯ РАЗОМКНУТА** — 0 публичных данных (всё unlisted). NEXT = **Первый Доказательный Эпизод**. RECONCILER **OFF** (MECHANICS_AUTO_ADVANCE=false); прод на master `9547fd4` (:3000, health OK); advisor P3/слайсер НЕ задеплоены. q9 OPEN: тема эпизода — банк-маркеры протухли (E13/E15 сняты, E17-E25=Airport-арка).)
Mode:   ===5=== EDIT (Director-authorized).

2026-07-13 (Vertical-safe правило + P2-мышцы — Тео, КОД). Директор: 9 текущих шортсов слабы не из-за
  нарезки, а из-за тупого center-кропа всего landscape-эпизода. Фикс UPSTREAM на сториборде. **SHIPPED
  (master, ждёт коммита):** доктрина — секция «Vertical-safe framing» в `storyboarder-situational-comedy`
  + self-check; флаги `vertical_safe`/`landscape_only` в `agents/exec/storyboarder.md` + `specs/schemas/
  shot.md`; self-gated delivery-условный чек в `readability-comedy-slapstick` (CREAD). Код — активация в
  `storyboarder.ts` (читает `episode.metadata.delivery_targets` → `hasVerticalDeliveryTarget`, новый хелпер
  в `provider-capabilities.ts`; условный JSON-шаблон + hard-rule; правило спит на landscape-эпизодах); флаг
  проведён через оба вайтлиста (`vgen-shot-helpers` + `animatic-shotlist`). **P2-мышцы:** `shotRangeToSeconds`
  (cumsum, та же ≤0.5s skip-логика) + новый `short-windows.ts` `deriveShortWindows` (группировка
  setup→punchline, drop landscape_only, гейт 15-40с, зеркало `excluded_shot_ids`). tsc·0 / **vitest 1245**
  (+15 юнитов). Резак `ffmpeg-shorts` НЕ тронут (guard избыточен — исключение живёт раз, в derive). Анти-
  аддитивность: 1 новый модуль + 1 хелпер; batch-драйвер (DB→derive→cut) ОТЛОЖЕН до выбора эпизода (собрать
  на реальных данных + смоук, не гадать — runtime>static). NEXT = выбрать Первый Доказательный Эпизод (q9),
  выставить его `delivery_targets ⊇ youtube_shorts`, засторибордить под правилом, derive → 3-5 сэмплов → показать.

2026-07-13 (Guru страт-сессия — Тео, docs-only). Заострили Цель под **Игру B (фабрика=актив, Сэнди=доказательство)**;
  стоимость разложена на 3 оси (цена/качество/скорость). **Cross-check счётчика** (переиспользован `scripts/e15-economics.ts`,
  read-only): `budget_log` реален и полон по видео/картинкам/LLM — ЕДИНСТВЕННАЯ денежная дыра = музыка МОК ($0); `episodes.
  budget_spent` молча прячет Полину (истинный тотал = сумма budget_log). Живая цифра: **E15 = $90/мин**, из них Полина $27 (30%!)
  + ~20 лишних рендеров = **~50% срезаемого жира → $90→~$45 без потери качества**. **Vertical-safe сториборд-правило
  спроектировано** (условное по Brief.delivery_targets · только key-beat/пик · 3-ветки триаж [i center-safe / ii restage-vertical
  свап-оси бесплатно / iii landscape-only] · категория-подсказка из `sandy-gag-library` · CREAD-проверка; резолвит orbit-конфликт
  через «пик, не траектория») — бриф передан кодеру, ждёт импл в `storyboarder-situational-comedy`+`agents/exec/storyboarder.md`.
  Advisor `audience-quality-sensor` (сенсор №2, scout-режим explore>exploit) + P1-мост + P3-дашборд построены. NEXT = Первый
  Доказательный Эпизод (он же ПЕРВЫЙ под vertical-safe правилом) зажигает оба сенсора; пре-рекизиты: влить правило + срез жира.

2026-07-12 (Shorts P3 — Audience Quality Sensor v1 — Тео). Advisor = сенсор №2 (КАЧЕСТВО) в паре к
  budget_log (цена), **режим РАЗВЕДЧИКА** (explore>exploit, доктрина `.claude/skills/audience-quality-sensor`).
  Построено: re-consent (`yt-analytics.readonly`), провайдер `youtube-stats.ts` (Data API stats + Analytics
  avg%/retention, деградирует в 0/null на новых видео), scout-движок `analytics-advisor.ts` (порог молчания +
  гейт экспозиции + роли метрик completion/views/loops+shares + карта дыр; юнит-тест), EXEC-ANAL размокан
  (`runner.ts`, реальный при токене, мок-фолбэк для replay-pilot), дашборд `app/(studio)/audience` +
  `/api/audience` (баннер честности, ранж. карточки-гипотезы, воронка shorts→эпизод, метрики) + nav-пункт.
  Смок: E01 landscape=2 views живьём; analytics-рядов пока нет (видео новые) → advisor корректно в scout.
  tsc·0 / vitest 1230. ⚠️ НЕ задеплоен (дашборд оживёт после rebuild+restart; приложение подхватит новый токен).
  Открыто: per-гэг атрибуция + тегирование категорий ждут P2; impressions/CTR/traffic + автопетля в идеацию — потом.

2026-07-12 (Shorts P1 — воронка/мост — Тео). Директор: short-creator ≠ отдельный агент, а сквозная
  забота по всем стадиям (доктрина `.claude/skills/shorts-longform-distribution/SKILL.md`, owner
  EXEC-PUB+ANAL). Роадмап **P1 мост → P2 гэг-нарезка → P3 аналитика**. **P1 СДЕЛАН**: единственная
  программируемая привязка Shorts→эпизод = URL родителя в описании (у YouTube нет «related video»).
  Общий хелпер `webapp/lib/agents/providers/short-linkage.ts` (`appendParentBacklink`/`readParentVideoId`/
  `persistShortId`) вплетён в route-слайсер + батч; **9 сирот забэкфиллены** (`dist-shorts-backfill-parents.ts`,
  `updateVideoMetadata`, force-ssl OK) — описания + `episodes.metadata.youtube_short_id` (проверено API+БД).
  tsc·0 / vitest 1220. P2 (гэг-окна 15-40с через `short_windows` + cumsum-таймкоды, реюз резака) и
  P3 (размок EXEC-ANAL + петля в идеацию, идеация-в-дашборде с audience-analysis) — [[backlog_shorts_ui_slicer]] отложены.

2026-07-12 (Shorts-фабрика + Safe&Sustainable — Тео). (1) **9 YouTube Shorts** из landscape-финалов:
  новый `webapp/lib/agents/providers/ffmpeg-shorts.ts` (`makeShort`: center-crop 9:16 → 1080×1920 +
  overlay «SANDY the HOURGLASS» 4с; pure-builders юнит-тестятся) + `webapp/scripts/dist-shorts.ts`
  (батч, sample-first, idempotent по `#Shorts`-маркеру, skip уже-вертикальных) → залиты **UNLISTED** на
  канал (Director ревьюит → флипает в public; scope `youtube.upload` без delete). E25 skip (уже short).
  (2) `.claude/safe_and_sustainable.md` — доктрина стабильности (Tier-0 durable Inngest DONE; Tier-1
  self-healing jobs TODO: onFailure-хэндлер, out-of-band reaper, провайдер-таймауты, critic HALT→logEvent).
  Runtime-гигиена: убрал залипший `inngest dev` (мина рядом с durable :8288).
  (3) **UI-слайсер ПОСТРОЕН** (Director «do slicer»): панель «Video → Short» в final-cut превью
  (`AssetPreview.tsx` `ShortsPanel`: start/end trim, overlay toggle, privacy dropdown) + `POST
  /api/assets/[id]/shorts` — реюз `makeShort`+`uploadVideo`, синхронный Node-роут. tsc·0 / vitest 1220.
  ⚠️ НЕ задеплоен — прод на старом билде, нужен rebuild+restart чтобы панель ожила.

2026-07-11 (D6 throughput+tail-hang — Тео, master `9547fd4` ЗАДЕПЛОЕН). Дифаб E27: (1) `factory.ts` preflight грузил
  episode-wide ассеты+Bible+genre и ВЫБРАСЫВАЛ (validateAgentInputs делает свои точечные запросы) → убран, тяжёлая БД-
  работа теперь ОДИН раз/прогон (~половина оркестрации на шот в фанауте). (2) `anthropic-text.ts` = `new Anthropic()` без
  timeout → наследовал SDK-дефолт 10m = хвост-хэнг критика до finishTimeout. Добавлен per-call timeout+maxRetries,
  масштабированный от maxTokens (`anthropicTimeoutMs`: 4k критик рвётся ~3m, 16k Writer НЕ подрезается, всё <10m belt).
  Кэп 3→5 уже был (`4a36498`). Отложено: «схлопнуть дешёвые шаги» (аддитивно ради малого). tsc·0/vitest·1210/replay·30.

2026-07-11 (Episode Start Notice — Тео). Директор q1b: большой гэг-банк (100-гэг Car-Wash) некуда класть, кроме брифа,
  а бриф читается в ~20 местах. FIX (master `e2142ea`): новый универсальный сосуд **`SPC-start_notice`** («Стартовая записка
  эпизода») — Полина пишет туда любой пред-авторский материал (гэг-резервуар/заметки/референсы) тулом `writeStartNotice`
  (APPROVED, вербально-гейтед); Писатель читает как **ADVISORY**-резервуар (НЕ beat-контракт; Key beats брифа = единственный
  MUST-hit). Едет на существующем `upstream_assets` (0 миграций, 0 изменений loader) — бриф ХУДЕЕТ. tsc·0/vitest·1198/replay·30.

2026-07-10 (Distribution — Тео). Стадия **EXEC-PUB была МОК → сделана НАСТОЯЩЕЙ** (master `fb50d4a`). Плумбинг
  (`c4eac71`): `youtube.ts` + два токена (Drive `ao@` / Sandy-бренд `YOUTUBE_REFRESH_TOKEN`; бренд-аккаунт без Drive
  → раздельно; `youtube.upload` хватает для publish+thumbnail). EXEC-PUB грузит APPROVED VID-final_cut+SPC-metadata+
  IMG-thumbnail → заливает финал с метаданными EXEC-COPY + кастомный тумбнейл → пишет `youtube_video_id` в
  episodes.metadata; идемпотентен (живой id→skip, удалён→перезалив на ретригере). Проверено на E25: канон-финал
  unlisted `mIew_0BCc5Y` (title/15-тегов/тумбнейл); 2-й прогон skip. Реестр `docs/distribution/video-episode-map.md`.
  tsc·0/replay·30/vitest·1189. ДОБИТО (EVE): все 10 видео → `unlisted` + метаданные + кастом-тумбнейлы + в плейлисте
  серии; устойчивый общий парсер SPC-metadata (`359adef`, `publish-metadata.ts`); EXEC-PUB авто-добавляет в плейлист
  (`7d20b84`, `series.metadata.youtube_playlist_id`); `force-ssl` скоуп для правки залитых (`98f2323`); E09 без ассетов
  дожат вручную (метаданные+AI-тумбнейл gemini). madeForKids=false (семейный). origin=`7d20b84` (запушено). ⚠️ ДЕПЛОЙ
  ОТЛОЖЕН: прод на `ef57b79` — парсер+плейлист заработают в фабрике после rebuild+restart (свернуть в реконсайлер-деплой).
  ОТКРЫТО: E07 заголовок блокирует A/B-тест Studio; рерайт EXEC-COPY-текстов короче/яснее под семейный формат. Handoff+
  [[reconciler_audit_2026-07-10]] — следующая сессия = развилка по реконсайлеру (смок только MECHANICS_AUTO_ADVANCE=OFF).

2026-07-10 (E25 continue — Тео). Директор: панель редактирования длительности шотов появляется только ПОСЛЕ
  апрува пустого аниматика. Причина: E18 сделал timeline-first (skeleton виден сразу после storyboard), но
  редактор длительности + Save-timing остались за гейтом реального VID-animatic ассета (длительности пишутся в
  metadata.animatic_v1.director_overrides, и STITCH/VGEN читают их оттуда же) → Директор апрувил пустой аниматик
  чтобы разблокировать. FIX (master `a14b7d8`) = обещанная «Phase 3»: редактор показан в синтетике, ПЕРВЫЙ Save
  материализует аниматик-сосуд из skeleton одобренного storyboard (POST /animatic/materialize, APPROVED —
  vessel не гейт; идемпотентно), затем PATCH тайминга. Длительности остаются где STITCH/VGEN уже читают (без
  перепроводки). Реюз extractShotsFromStoryboard+newAnimaticContract+bakeApprovedMusic. tsc·0/vitest·1182/build·0.
  + music upload (master `31a8459`): ТОТ ЖЕ корень — «Upload music» в таймлайне постил в /upload-music с пустым
  assetId в синтетике → «Music upload failed». Та же materialize-first проводка (handleMusicUpload). Оба на проде :3000.
  TD-остаток: аппрув обгоняет критика той же версии (EREF/world_check v02 REVISE) — не чинил.
  + start-video латч (master `107870a`, ЗАКОММИЧЕН но НЕ задеплоен — ждём догенерации Полининых видео): «Старт видео»
  фанаутил только ребро ref→plan (беспланные шоты), пропуская шоты с готовым планом → в sequential-прогоне (планы
  строятся заранее) кнопка немая, видео шло только через Полину (E25: 10/20 шотов пропущены). Fix = selectRenderFanoutShots
  (ребро plan→video): шоты с APPROVED-планом без видео рендерятся напрямую (exec-vgen/single-shot, atomic dedup). tsc·0/
  vitest·1189. ⚠️ ДЕПЛОЙ ОТЛОЖЕН: прод-сервер на `31a8459` (старый билд), пересобрать+рестарт ПОСЛЕ финиша E25-рендеров.
  + Key Art фиксы (master `dceed66`, НЕ задеплоены): (1) тумбнейлы дрейфовали от канона Сэнди — рендерер кормил LOCKED-каноны,
  но в buildEditPrompt не было identity-lock фразы → текст перевешивал рефы; добавлен EREF-подобный lock. (2) toggle «Key Art
  concepts» не работал на странице эпизода — PreviewDrawer не передавал onPickAsset (в таймлайне передан); провязан. Все 3
  фикса (start-video + 2 Key Art) деплоятся ОДНИМ рестартом после финиша рендеров E25 (осталось ~3 видео).
  DEPLOYED: E25 финалка готова → пересборка master `dceed66` + рестарт, все 3 фикса на проде :3000.
  RECONCILER ARMED (Директор q: «включай ON, прогоним next смок при реконсайлере»): MECHANICS_AUTO_ADVANCE=true в .env.local
  (:138) + рестарт. Безопасность подтверждена кодом: реконсайлер шлётся ТОЛЬКО из factory.ts на завершении агента активного
  эпизода (мёртвые E12-E18 инертны); пилоты авто-резервируются `resolveReservedShots(eref_pilot_shot_ids)` — НИКОГДА не
  авто-аппрув; publish/LOCKED — hard-limits во всех режимах. Idle чист (0 открытых тредов). ⚠️ Открытая критика Директора
  (не чинил, backlog): реконсайлер на ГЛОБАЛЬНОМ ENV-флаге вместо governance mode — Mode 3 (DELEGATED) семантически = то,
  что делает реконсайлер; правильный дизайн — гейтить на `governance_mode∈{3,4}`+arm-at-creation, убрать ENV-флаг. NEXT: чистый
  эпизод, убедиться что 'pilots' в reserved gates перед прогоном. Caps проверены реально работают (SH02 video-critic HALT);
  превышения = ручные ре-триггеры (32 Директор + 32 Полина, байпас by design). Полина капается ТОЛЬКО деньгами ($30/эп).

2026-07-09 NIGHT (Тео автономно, Директор на тренировке — «фабрика важнее прогона E25, приведи в порядок под
  новый смок»). E25 как эпизод НЕ добиваем. master сведён воедино и зелёный (`6bacf8b`): (1) Polina updateWorkPlan(empty)
  → graceful no-op вместо throw→6-раунд→эскалация; промпт «пиши план ТОЛЬКО при реальном изменении», mental-сверка
  статусов каждый ход остаётся (ловит вставший конвейер). (2) D5/D6/D7 world_check-гейт черри-пикнут поверх E18
  (авто-мерж чистый — E18 трогал видео/animatic-регион, не гейтинг storyboard→критики→EREF): стадия стартует только
  когда ВСЕ предпосылки одобрены, иначе waiting-событие вместо падения на `?? asset.id`. Verify: tsc·0 / vitest·1182 /
  replay-pilot·30-30. Прод-сервер пересобран на master (next build+start :3000, inngest synced). Ветка
  claude/e19-test-run-7000f9 СУПЕРСЕДНУТА (весь её уникальный код на master) — можно удалить. NEXT: новый смок с чистого
  эпизода на master — теперь с D17-курированием Полины (fence 40) + E18-латч + D5/D6/D7-гейты.

2026-07-09 (E18 PR-B SHIPPED → ветка teo/e18-smoke `ad93d6a`, ЗАПУШЕНА, PR pending). D17 firehose закрыт чистым
  вычитанием: Gate B `event-actionable.ts` → 8 MUST-WAKE; Gate A whitelist синхронизирован в 3 местах (SQL-триггер
  МИГРАЦИЯ 0042 ПРИМЕНЕНА в прод + ambient-events + backfill) — drop agent_started/approval_granted/manual_trigger;
  fail-dedup (actor,asset_id); фенс 500→40. D18: интерактив Полины → recordConciergeCost(source:'chat'). Эффект:
  438→~30 инъекций, 378→~20 платных, $18.82→~$1.30 (14×). Реф-аниматик (D6/D7) ПРИПАРКОВАН → blueprint
  docs/analysis/E18-ref-animatic-removal-analysis.md (режем церемонию sequential, не класс; развилка масштаба открыта).
  Verify: tsc·0/vitest·1152/replay·30. NEXT: PR-A дискретные (D1/D2 casting · D3b MGEN · D14/D15 music) свежей сессией.

2026-07-08 PM (E18 «Sandy in the Airport-2» — ПЕРВЫЙ ЧЕСТНЫЙ смоук автономии, 14 шотов, 2.5ч, опубликован).
  ВЫВОД: пайплайн работает end-to-end (14/14 картинки+видео APPROVED, final cut, PUB) — проблема НЕ надёжность,
  а АВТОНОМИЯ+СТОИМОСТЬ. Аппрувы вёл Директор (68 vs 6 Полина). Стоимость = МОЗГ: Полина $18.82/378 auto-react
  вызовов ($1.34/кадр, 23 wake/кадр) — не масштабируется (32 шота пробьют $30-cap). D17 firehose: клики Директора
  вернулись ~114 платными (director-own suppression сломана). D18: интерактив Полины НЕ логируется/не капится.
  18 дефектов (D8/D10/D11 оказались ЛОЖНЫМИ — кривые shell-выборки Тео). NEXT: PR-A дискретное (D14 music-path
  первым) → PR-B деньги (D17 curation готова + D18) → PR-C АППРУВ/СТЕЙТ-МАТРИЦА (спека сперва) → чистый ре-смоук.
  Артефакты: docs/analysis/E18-fix-plan.md + E18-run-defects.md (ветка teo/e18-smoke `d8618bc`).

2026-07-08 (E17 root-cause fix ЗАВЕРШЁН → master `71cafd3`). Системный fetch-timeout: все 27 голых `fetch(`
  в 13 провайдерах переведены на `fetchWithTimeout` (PR #31, 3 коммита: критпуть артист+видео+критик /
  картинки+auth+drive-чокпоинт / fal+veo-чокпоинты). Закрыл класс «зависший fetch держит слот concurrency →
  стадия встаёт» (двухдневный E15/E17-firefight; poll-fetch → POLL_MS<MAX_WAIT чинит Idiom-A defeat).
  Побочно (PR #32, `52eb72b`): починен красный master — коммит `5cfc64d` вшил `import {listThemes}` без
  реализации → tsc TS2305 + 6 красных тестов; дописан read-only `listThemes` (GET themes-роута). Verify:
  tsc·0 / vitest 1149/1149. NEXT: свежий эпизод на укреплённом коде — отдельный worktree + стабильный сервер
  (`inngest start`/`next start`) + reconciler `MECHANICS_AUTO_ADVANCE` с начала эпизода (память E17).

2026-07-03 (E13 live-run fixes → master `aa52384`, FF-merge ветки claude/e13-nudge-badge-casting-fixes,
  21 коммитов). 4 фичи: reference-drawer cluster (select-in-place + reject-on-APPROVED→REVISION, faec572);
  kebab-досье REFERENCE/VIDEO зоны + plan-aware Generate (dd3bfe1); fanout-идемпотентность — per-shot
  ref_plan guard + prune pending, чинит «одобрил 1 пилот → регенит весь эпизод» (cb402ce); excluded-shot
  явный флаг `episodes.metadata.excluded_shot_ids` (SSOT, stage-independent) + kebab-toggle + gen/stitch
  skip + Polina listShots videoSummary (aa52384). Verify: tsc·0/vitest·1092/replay·30. NEXT: E13 live-прогон
  идёт; открыто — ≤0.5 reading в listShots excluded, drawer-approve «ерунда», чистка stale ref_plan DRAFT.

2026-06-30 → themes-as-assets (SPC-theme_{slug}) + chat-гигиена SHIPPED `3269e4a`; §34 Seed Bank → Themes; Polina на Opus (q2). → git/history.

2026-06-27 PM-2 (S1 cost-visibility SHIPPED). AI-factory autonomy+cost refactor planned (adversarial-hardened
  by 3 lenses; plan `~/.claude/plans/calm-percolating-sifakis.md`; direction in NORTH_STAR §4 + PLANET.md).
  S1 landed: cross-provider LLM pricing fix (MODEL_RATES += gpt-5.5/5.4-mini/5.4/gemini — non-Anthropic was
  Sonnet-defaulted → concierge cost-breaker's cost-limb now works on ALL providers, was decorative); Полина
  cost VISIBLE as per-episode `concierge` line (tokens×price, NO production ceiling — Director D1);
  CONCIERGE_AUTO_REACT_MAX_CALLS 200→40. tsc·0/1014/replay30. gate_decision_log table → S3 (lands with its
  writer `decideGate`); cost-rollup anchor/ref split → S2. NEXT: S2 leak-closing (dispatch_intent + FAILED-cap).

2026-06-27 PM (Compass + PLAN master-only + E12 distribution copy). Built **the Compass** (anti-drift
  forcing-function): per-turn re-anchor to North-Star, Director msg = HYPOTHESIS not order, drift-check,
  visible header v2 `Star/Planet/Course` (rules/common/partnership.md). **PLAN.md = master-only** (feature
  branches never touch it; `.gitattributes merge=union` safety; branch-aware plan-md-update-guard) — CLAUDE.md
  §12. **E12 copy fixed at ROOT:** specs/distribution/metadata.md v0.2 (cold-viewer/SEO-first, English) +
  copywriter.md + thumbnail-designer.md (overlay English); live E12 SPC-metadata rewritten (asset df9ac692).
  NEXT: q8a E12 thumbnail overlay МОЁ ВРЕМЯ!→MY TIME!; q4 portable doctrine repo+bootstrap.

2026-06-27 → 2026-06-14 entries (shot-identity S-E-SH merged `4b1f3f4` + HARD HALT-gate; Полина $100/сутки
  root-fix — watchdog↔auto-react loop, reasoning-OFF на Opus, $20/24ч breaker; E11 DONE 1st 4-act ep + 3 фикса;
  FORMAT-authority slice-1, 06-16 UI/observability series, E10 clean-run, identity+casting arch sprint) →
  trimmed to docs/PLAN-history.md + `git log -p -- PLAN.md` + memory memos (shot_identity_refactor_decision,
  session_2026-06-14/-15/-16/-17/-22, ai_ep_conception_gaps).

GATE-HARDENING RFC (docs/RFC-2026-06-04-…): 10 invariants, 3 phases.
  ✅ Phase 1 SHIPPED (7c76a05): single-approved→INVALIDATED+DB indexes (0036), loud Drive-aware
     resolver + media-preflight gate, atomic pre-spend budget ceiling (0037). Prod DB applied.
  ✅ Phase 2 code COMPLETE (b8ef059/108e8ee/cff8007/bb0669c/37a2390): provider contract (img2vid
     throws imageless), critic auto-bounce cap=2→HALT, VGEN/EREF fold+gate+agent_failed.
     NOTE: critic cap=2 is per-plan-version — SH23 runaway proved it doesn't bound a SHOT (new plan per iter).
  🔨 Phase 3 PENDING = OUTPUT-critic (frame-sampler → vision) + camera/quality_tier checks.

OPERATING DOCTRINE (memory: nudge_polina_dont_act_for_her):
  • Тео = Director's proxy. Nudge Polina via team-chat (POST /api/team-chat/post,
    author=Тео, Bearer TEAM_CHAT_TOKEN) in Director's voice; she executes + LEARNS.
  • Discriminator: Polina misused a working tool → TEACH (nudge); SYSTEM broke
    (tool/gate/dispatch/worker) → Тео FIXES CODE. Mode 2.5: only Director's verbal
    «да» authorizes Polina mutations — Director nudges+approves, Тео on-call for bugs.
  • Keep Inngest worker (:8288) + dev (:3000) alive via preview_start, NEVER manual
    bash (double-supervisor = port-8288 war; killing worker = silent stall).

Hardening backlog (before 10-20 ep run) — full list in memory (backlog_* memos): live items = #1 episode.status
  stuck BRIEF_APPROVED, #3 fan-out sendEvent outside step.run, #4 schedule-analytics silent-fail, #5 trigger
  doesn't validate episode.status, critic REVISE→producer auto-close + revision cap. (WCHK auto-read, PA q<N>y
  gate, EREF gallery/anchor drawer, Reference-Artist Drive-bytes — all FIXED.)
OUTPUT-CRITIC design (docs/output-critic-architecture-design.md): needs_revision (sync-vs-async + per-episode
  regen budget cap). Mode-3 key. Camera same-angle (q16) carried. Episodes: S15-E01 "Heavy Friend", E02 in prod.
```

---

## SPRINT STATUS

Sprints S0–S8 (foundation + spec) COMPLETE 2026-04-23..28 — `docs/PLAN-history.md`.

### Sprint 9 — Web application (live)

| Phase | Description | Status |
|-------|-------------|--------|
| 1–4 | Schema + scaffold + Inngest + agent jobs library | ✅ 2026-04-28 |
| 5a–5d | UX specs + API routes + cockpit + pipeline kebab + editor + preview drawer | ✅ 2026-04-29..30 |
| 6 | Per-episode sub-pages, budget detail, jobs panel | ⏳ partial (episode page + timeline done) |
| 7 | Approval Authority Matrix per-row editing + delegate UI | ⏳ pending |
| 8 | Real providers — gpt-image-2 + Drive + Veo 3/3.1 ✅; Kling/Suno/YouTube deferred | 🟡 partial |
| 9 | PM2 + Tailscale + production hardening | ⏳ pending |
| A.1/A.2 | Animatic overrides + EpisodeTimeline + VGEN auto-COMPLETE + EXEC-STITCH + Audio reorg | ✅ 2026-05-06..10 |
| Mode 2.5 | Prod Assistant + 13 tools + verbal approval + gpt-5.5 + BEHAVIOR_CONTRACT | ✅ 2026-05-08..12 (PR #23) |
| φ / Designer+Animator | Skills-as-capabilities + EREF Designer + Animator + 2 Critics (decision-making agents) | ✅ φ merged `cc43944`; agent arc IN PROGRESS |
| Distribution tail | Key Art Designer (thumbnail) ✅ #27; COPY/PUB + Audience Analyst | 🟡 Topic 2 |

---

## ACTIVE BACKLOG

### Long-debt (small fixes, non-blocking)

| # | Item | Severity |
|---|------|----------|
| 2 | Per-stage trigger button in DAG (not generic Re-trigger modal) — folds into Topic 3 | UX |
| 4 | `markJobFailed` on any throw, not only gate-fail (rows stuck RUNNING after fn.failed) | Reliability |
| 5 | Re-trigger dedup: refuse if same agent has COMPLETED/RUNNING job for that asset | UX |
| 13 | `episodes.status` stuck at BRIEF_APPROVED even after publish | Reliability |
| 14 | `schedule-analytics` cron not firing after EXEC-PUB — verify next_event emit | Reliability |
| 15 | Mode 4 auto-revert to Mode 1 on session end (governance.md §4) | Compliance |
| 16 | EXEC-VGEN base file_type duplicate `shot` token (`VID-shot-shot1`) | Cosmetic |
| 17 | FFmpeg export aspect: requested 16:9, observed 1:1 centered — `ffmpeg-stitch.ts` | Reliability |
| 18 | PA TTS quality "больной робот" — upgrade to ElevenLabs/OpenAI TTS; deferred to 2nd use | UX |
| 19 | Version-aware text editor — save=new REVIEW version, per-version approve/reject, version rail, one window all text artifacts. **Plan APPROVED 2026-06-20** (`~/.claude/plans/workstation-reference-designerdesigner-r-twinkling-hamming.md`); slice-0 of shot-centric refactor (memory `backlog_shot_centric_paradigm`). IN PROGRESS | Reliability/Audit |
| 20 | PA chat sync POST hangs 50-110s, no progress/cancel — L1 done; L2 SSE streaming + cancel deferred | UX/Reliability |
| 21 | Brief↔Bible consistency validator missing — new EXEC-HW-CRITIC or extend SREV (~6-10h) | Reliability |
| 22 | DELETE asset `asset_updated` event not in PA auto-react whitelist (~30 min) | UX |
| 23 | Designer post-pilot auto-fanout: remaining shot ids stashed but not auto-fired on pilot approve | Reliability |
| 39 | PA delivery ack — L1 DONE (trigger+approve paths). L1.5 per-event corr (inngest_event_id col) deferred | ~~Mode 3/4 blocker~~ |
| 24 | Scene-prop canon-drift (кнопка слева→справа): деталь родилась в шоте, канона нет → промоут первого APPROVED-шота в референс сцены; ffmpeg-харвест ЧИСТОГО кадра как аварийный ref-only источник. ДИСКУССИЯ q2, разведка кода q3 OPEN — memory `backlog_scene_prop_canon_anchor` | Continuity |

Fixed in Phase 5c (don't re-add): #1 friendly names · #3 phantom stage · #9 multi-asset chain · #10 stage filter · #11 agent_completed · #12 prefix match.

### Long-term roadmap (LT-05..LT-14, all PLANNED/backlog)
LT-05 Skill Editor learning loop (Mode 2.5 Phase B) · LT-06 buildShotPromptV2 rich Bible inject · LT-07 variants-per-gen UI · LT-08 Veo quota mitigation · LT-09 stage progress arc · LT-10 scalable 60+ shot timeline · LT-11 episode page tabs cleanup · LT-12 foldable activity feed · LT-13 activity time filters · LT-14 Bible locations+styles in VGEN prompt. (LT-01..04 SHIPPED.)

---

## RULES (enforce every session)

**UI/UX** — any visual change → read `specs/system/uiux.md` first; semantic theme tokens only (no raw hex); Approval Queue = highest-priority path; update uiux.md if visual rules change; no Asset Galaxy v2 unless planned.

**SDD** — Spec DRAFT → REVIEW → APPROVED → Implementation → Output REVIEW → APPROVED. No content before its spec is APPROVED.

**Post-pilot (PA-001..006)** — all absorbed: PA-001/2/3 char-ref via EREF + Phase A.1 canon inject; PA-004 defaults reviewed; PA-005 `character_visual_development.md` v0.1 (UI → LT-07); PA-006 `audience_kpi.md` v0.1 (QA deferred).

**Open decisions** — D-001 char consistency: A2-Kling → MVP Veo 3 img2vid (~75%), Kling = Phase 8.5. D-002 assembly: FFmpeg + optional DaVinci. History in `docs/PLAN-history.md`.

---

## CHANGE LOG (recent)

Pre-2026-05-18 → `docs/PLAN-history.md`.

| Date | Change | By |
|------|--------|----|
| 2026-07-03 | **E13 live-run fixes → master `aa52384`** (FF-merge, 21 commits): reference-drawer cluster · kebab REFERENCE/VIDEO zones + plan-aware Generate · fanout idempotency · excluded-shot flag SSOT + Polina listShots. Verify tsc·0/vitest·1092/replay·30. | Тео |
| 2026-06-27 | **Compass v2 + PLAN master-only** (partnership.md, CLAUDE.md §12, `.gitattributes merge=union`, branch-aware guard) · shot-identity S-E-SH merged `4b1f3f4` · E12 distribution copy → cold-viewer/SEO English (metadata.md v0.2 + agents + live asset df9ac692). PLAN compacted 269→<200. | Тео |
| 2026-06-02 | **PR #27 → master `baa1e00`** — Key Art Designer multi-canon thumbnail pipeline + Drive-backed media route. Live art gate PASS on SS-S15-E01 ($0.34, 3 thumbnails, v12 winner). PLAN.md compacted 339→≤200. | Master-session |
| 2026-06-01 | **PR #26 → master `072194e`** — TD-85 resolution discipline in Shot Plan pipeline (runner hard-gates resolution vs provider contract, Critic V13). | Claude Code |

---

*SandyStudio PLAN.md | v0.3 | DRAFT — master-session updates after every state change. Keep ≤ 200 lines.*
