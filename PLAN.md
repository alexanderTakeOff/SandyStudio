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
ОТКРЫТО (Директор 2026-07-19, «сейчас не правь»): Factory → Adaptation Overview, слайс
  «Trends · 5 episodes (oldest → newest)» — все серии рисуются плоской линией / нулём.
  ЗАЦЕПКА: на том же экране вверху красным «Failed to load factory data.» — то есть, вероятно,
  сломан не рендер графика, а загрузка данных, и полоски честно показывают пустоту. Проверять
  надо СНАЧАЛА запрос (что за эндпоинт, что вернул, почему упал), и только потом чарт. Легенда
  при этом показывает ненулевые max (leadership 6.05, L2 3.54, L1 3.6, $/shot 4.99) — значит
  какие-то данные всё же доехали, и расхождение «max есть, а линии нулевые» само по себе улика.

ПРАВИЛО ВЬЮЕРА (Директор 2026-07-19, канон для ВСЕХ полос вариантов): клик по миниатюре =
  ВЫБОР КАДРА ДЛЯ ПРОСМОТРА (ободок едет за кликом) — в этом суть вьюера. Утверждение = ОТДЕЛЬНАЯ
  КНОПКА + подпись состояния/статуса. Клик никогда ничего не утверждает и не пишет на сервер.
  Следствие: EREF-полоса (AttemptsStrip), где клик сейчас делает select_attempt (серверная запись
  selected_version), должна перестать это делать — выбор варианта становится локальным состоянием
  просмотра, а «сделать текущим» уезжает в явную кнопку.

Date:   2026-07-19 (потолок на авторинг планов + настоящий HALT Директору — Тео, КОД, ===5===).
  Директор увидел стек из 16 версий плана одного шота и спросил: есть ли грань, на которой пайплайн
  зовёт человека, или планы крутятся без ограничений. Возразил, что потолок перегенераций уже есть.
  ВОЗРАЖЕНИЕ БЫЛО СПРАВЕДЛИВЫМ: лимитов семь, все рабочие. Но ни один не считает версии SPC-shot_plan.
  `SHOT_REGEN_CAP`=6 считает только EXEC-EREF/EREF-DESIGNER/VGEN — автор плана EXEC-VANIM не входит в
  SHOT_REGEN_AGENT_IDS. `PLAN_REGEN_CAP`=3 привязан к planAssetId, которого в payload VANIM нет.
  `PROMPT_REVISION_CAP`=2 коэрсит только REVISE — а критик дал PASS 108 раз против 9 REVISE.
  Ирония: комментарий в chain-flags.ts:110-118 описывает РОВНО этот класс аварии (E10 SH23, 58 версий,
  «HALT стоял на v3/v11/v17, но цикл продолжался») — механизм строили под это, E30 проскочил мимо.
  КОРЕНЬ — НЕ отсутствующий счётчик, а расхождение в определении «готово». Критик по контракту
  оставляет прошедший план в REVIEW («PASS → leave in REVIEW for the Director»), а фан-аут VGEN
  спрашивал «есть ли APPROVED план?» — план в REVIEW для него невидим → снова exec-vanim/plan →
  saveAgentOutput безусловно минтит max(version)+1 → критик снова PASS → повтор. Отсюда подпись
  «много версий, почти сплошь PASS».
  СДЕЛАНО: (1) decideFanoutEmit разведён на ДВА сигнала — hasLivePlan решает «авторить ли»,
  approvedPlanAssetId решает «генерировать ли»; появился третий исход `null` = ждём Директора. Важно:
  нельзя было просто расширить карту планов — шот ушёл бы в генерацию с неутверждённым планом, это
  ровно ошибка `planAssetId has status=REVISION`, валившая SH05/SH06. (2) Новый `PLAN_VERSION_CAP`=5,
  отдельный от SHOT_REGEN_CAP (там пул 6 общий с рендерами), считает ВЕРСИИ АССЕТА (переживает сброс
  очереди), чоукпоинт в factory по новому списку PLAN_AUTHOR_AGENT_IDS. (3) Оба потолка теперь зовут
  `raiseBlockerOnce` — раньше regen_cap_halt писал строку в activity_events и делал ранний return,
  то есть упёршийся в потолок шот замолкал, а Директор об этом не узнавал. Это и есть запрошенная
  «грань на halt Директору». (4) UNKNOWN-вердикт коэрсится наравне с REVISE — он уходит в тот же
  REVISION, но не капался, то есть единственный вердикт «критик не ответил» мог крутиться вечно.
  (5) Сведены два разных «critic cap»: реконсайлер брал planRegenCap()=3, критик promptRevisionCap()=2.
  Verify: tsc clean, 1415/1415 (+7), replay-pilot 30/30, стек пересобран (app/inngest 200, synced).
  БАЗОВЫЙ ЗАМЕР для проверки эффекта (12:21): SH27=17 SH18=16 SH33=15 SH44=9 SH13=9, всего 122
  shot_plan. Ожидание: числа перестают расти. Директору проверить через ~15 мин тиков реконсайлера.
  РИСК: шоты, которые двигались только за счёт цикла, теперь честно встанут в REVIEW и будут ждать
  Директора — стоит посмотреть, не залипло ли что-то без внимания.
  Бюджет E30: потрачено $122.42 из $150 (осталось $27.58). Вчерашние SH43/SH44: видео SH43 переснято,
  SH44 Директор ОСТАВИЛ как есть (кровать+кристалл+Efirium — «сон? не сон? продолжение следует»).

Date:   2026-07-19 (SH43/44 промпты + баг выбора варианта + спам в чате Полины — Тео, КОД, ===5===).
  ПРОМПТЫ SH43/SH44 переписаны вручную и приняты Директором («картинки отлично, герой смотрит на
  кристалл»). Причина, почему пустой фон не выходил: LAYOUT LOCK у SH44 делал РОВНО ОБРАТНОЕ SH42 —
  пинил Efirium SURFACE («crystal spire silhouettes in the background — FIXED»), а кровать проходила
  как «transient prop». Никакая правка в CONTINUITY это перебить не могла. Оба переписаны по скелету
  SH42 (якорь = ТОЛЬКО стиль, экспортных плит/шпилей/неба нет), SH44 с одним намеренным исключением —
  единственный маленький кристалл на одеяле, он и есть гэг «сон? не сон?». $0.106 (2 × $0.053).
  БАГ НУМЕРАЦИИ ВЕРСИЙ (regenerate-image): `nextVersion` считался от `current_version`, а не от
  максимума истории. У SH44 current стоял на 1 при уже существующей v2 → новая картинка получила
  ВТОРОЙ номер v2, а все читатели берут `history.find(h => h.version === current_version)` → первое
  совпадение → показывалась СТАРАЯ картинка. 200 OK, ошибок ноль. Починен роут (max(current, ...history)
  + 1) и данные SH44 (v2→v3). Директор при этом смотрел в видео, а не в картинки — часть паники была
  ложной, но баг настоящий.
  ВЫБОР ВАРИАНТА НЕ ДВИГАЛ ЗЕЛЁНУЮ РАМКУ + СПАМ В ЧАТЕ. Замер показал: клики СОХРАНЯЮТСЯ
  (selected_version пишется), но на SH42 Директор нажал 9 раз за 12 минут — потому что рамка не
  двигалась. Корень: рамка выводится из пропа `asset`, который меняется только когда долетит рефетч
  родителя (`/api/episodes/{id}` = `select('*')` по всем ассетам, секунды на удалённой БД), а
  `promoteAttempt` не ждал `onChange()` и не имел оптимистичного состояния. Починено: оптимистичный
  `selected_version` двигает рамку мгновенно, `onChange()` теперь возвращает промис и ожидается.
  СПАМ «AGENT — completed»: select_attempt слал `agent_completed`, который стоит в whitelist ТРИГГЕРА
  Postgres (0043) — каждый клик писал system-turn в живой тред Полины. Это НЕ пробуждение Полины
  (`agent_completed` убран из ACTIONABLE ещё 2026-07-08) — это отдельный, недебаунсенный путь инъекции.
  Переведён на `asset_updated` + `actor: user.id` — ровно как shot-exclusion, который специально
  использует тип, отсутствующий в ОБОИХ whitelist. Плюс починен форматтер: при несовпадении шаблона
  он подставлял литерал «agent» и ВЫБРАСЫВАЛ реальный заголовок — теперь показывает текст как есть.
  КОРНЕВАЯ ПРИЧИНА СЕРИИ ПОЛОМОК (вопрос Директора «почему каждый раз, так на Марс не улетим»):
  «какой вариант текущий» хранится в ТРЁХ местах с ДВУМЯ независимыми счётчиками —
  `image_prompt.current_version`+`history[]`, `shot_reference.generation_history[].version`,
  `shot_reference.selected_version`. Ветки пишут разные подмножества (`restore_version` — только
  image_prompt; `select_attempt` — только shot_reference), счётчики считаются раздельно (route:220 vs
  route:729), а `primaryAttemptVersion` замазывает расхождение цепочкой приоритетов. Совпадают —
  работает; разъезжаются — finalVersion указывает на несуществующую плитку и рамки нет НИГДЕ. Сюда же
  дубликаты строк ассетов (sh05 ×3, sh06 ×2). ПРЕДЛОЖЕНО Директору как отдельная задача: свести к
  одному владельцу (единый счётчик + один writer), иначе каждая новая поверхность будет ломаться заново.
  Verify: tsc clean, 1408/1408 tests, стек пересобран (app/inngest 200, functions synced).
  НЕ ПРОВЕРЕНО: клик по варианту в браузере (рамка + отсутствие спама) — за Директором.

Date:   2026-07-18 (автосейв таймингов + вынос ffmpeg из пути сохранения — Тео, КОД, ===5===).
  Директор: «кнопка сохранить тайминг работает десятки секунд, часто забываю или она не срабатывает —
  убрать её вообще». Диагностика нашла ТРИ независимые причины, все починены.
  (1) МЕДЛЕННО: клиент слал `audio_tracks` безусловно, а роут `/animatic-timing` на любой fade/trim гонял
  полный ffmpeg-перекод mp3 192k — правка длительности ОДНОГО кадра переэнкодила весь музыкальный трек.
  Теперь ffmpeg под явным флагом `process_audio`, который ставит ТОЛЬКО кнопка музыки; автосейв таймингов
  вообще не шлёт `audio_tracks` → запрос metadata-only.
  (2) ПРАВКИ ИСЧЕЗАЛИ (корень «она не срабатывает»): `AnimaticPlayer` пересеивал локальные overrides из
  contract и сбрасывал dirty=false на КАЖДУЮ смену идентити contract. После c4d35d4b (Realtime вместо
  поллинга) `mutate()` летит на каждый activity_event — при живых джобах свежая правка стиралась через
  секунду, кнопка гасла в «Saved», не сохранив ничего. Теперь несохранённые ключи выигрывают у серверной
  копии (touchedShotIdsRef), dirty не сбрасывается.
  (3) МУЗЫКА ОБРАБАТЫВАЛАСЬ ДВАЖДЫ (живой баг финальных катов, не только скорость): роут запекал fade/trim
  в файл И подменял `track.url`, а STITCH грузит байты из `url` и НАКЛАДЫВАЕТ ТО ЖЕ САМОЕ снова через
  buildMusicAudioFilter — `atrim=start=N` на подрезанном файле срезал ещё N секунд. Разведено: `url` =
  всегда сырой исходник (STITCH, единственный владелец шейпинга), новый `preview_url` = обработанный
  дериватив только для `<audio>` в плеере. `resolveMusicSourceUrl` / `resolveMusicPreviewUrl` + тесты;
  runner читает `original_url ?? url`, что чинит уже испорченные ассеты без пересохранения.
  UI: кнопка «Save timing» УДАЛЕНА → автосейв с дебаунсом 3 с (Директор q1) + чип «Черновик /
  Сохранение… / Сохранено HH:MM»; кнопка появляется только при ошибке («Повторить»). Музыка осталась
  ПО КНОПКЕ («Применить музыку») — правится редко, там ожидание нормально. Не потерять: форс-флеш на
  visibilitychange/beforeunload/unmount (keepalive), сохранения сериализованы, editSeq ловит правку,
  прилетевшую во время запроса. Не затереть: раздельные timingDirty/audioDirty.
  Отдельно поймал баг В СВОЁМ ЖЕ коде до прогона: `handleMaterializeAnimatic` в EpisodeTimelineSection —
  обычная функция, новая идентичность каждый рендер → оба эффекта пересоздавались, флеш слал бы PATCH на
  каждый рендер, а таймер дебаунса сбрасывался бы вечно под Realtime и не срабатывал НИКОГДА. Починено
  ref-индирекцией (saveTimingNow стабильна) + дебаунс на editSeq-state, а не на объекте overrides.
  ПОРЯДОК ВАРИАНТОВ (тот же заход, Директор: «не двигать а помечать»): было ПЯТЬ несовместимых схем на
  11 точках. Approved-first жил ровно в одном месте (EpisodeAssetDrawer siblingCandidates) и стал МЁРТВЫМ
  кодом, когда e4b77342 убрал EREF CandidatesStrip — отсюда «я думал мы починили». Полоса, которую
  Директор реально видит (AttemptsStrip), не сортировалась вообще: при keep-best отгруженная попытка это
  обычно v02 из 3, поэтому «текущий» тайл стоял в СЕРЕДИНЕ и у каждого шота в разном месте. Новое правило
  в `lib/api/asset-ordering.ts`: порядок — чистая функция версии, статус и выбор НЕ участвуют; текущий
  помечается на месте, никогда не переставляется. Один компаратор `compareAssetVersionsNewestFirst`
  (+created_at тайбрейк — две кормящие API отдают created_at в ПРОТИВОПОЛОЖНОМ порядке, из-за чего
  равноверсионные строки рендерились по-разному на двух поверхностях) заменил 9 самописных сортировок:
  AssetPreview ×3, EpisodeAssetDrawer ×2 (включая удаление мёртвого approved-first), AnimaticPlayer ×2,
  EpisodeTimelineSection ×4. Внутри-ассетные попытки (generation_history) остаются хронологическими —
  это лог, а не список версий; ложную «консистентность» между разными типами списков не наводил.
  Побочно починен ВРУЩИЙ бейдж: `AnimaticPlayer` брал `vidShotsByShotId[0]` (version desc), а рендерит
  ячейку резолвер, который выбирает по СТАТУСУ сначала — при v01 APPROVED + v03 DRAFT бейдж писал
  «v03 DRAFT» поверх играющего APPROVED v01. Теперь читает разрешённую ячейку.
  Verify: tsc clean, 1408/1408 tests (+11), replay-pilot 30/30. Lint по тронутым файлам чист.
  ЖИВАЯ ПРОВЕРКА (стек пересобран, app/inngest/8288 = 200, functions synced):
  — Двойная обработка музыки ПОДТВЕРЖДЕНА на E30 вживую, не теоретически: у AUD-music `url` указывал на
    `...-APPROVED-processed.mp3`, сырой файл лежал в `original_url`, `fade_out_seconds: 2.5` — то есть
    STITCH грузил уже отфейженный файл и накладывал фейд второй раз. Фикс `original_url ?? url` снимает.
  — Латентность сохранения: ~2.0-2.4 с, НЕ ~200 мс как я оценил в плане. Оценка была неверной. ffmpeg
    действительно ушёл (десятки секунд → 2 с), но пол задаёт сеть: тривиальный select к облачному
    Supabase уже ~740 мс, clipLengths-запрос ~900 мс (44 строки, 133 КБ), а роут делает ~6 round-trip.
    Пробовал распараллелить resolveMode+clipLengths — выигрыш неизмерим, откатил (не держать усложнение
    с висящим промисом ради нуля). Для фонового дебаунс-автосейва 2 с приемлемо, Директора не блокирует.
  OFF-BY-ONE НА ИСКЛЮЧЁННЫХ ШОТАХ — НАЙДЕН ДИРЕКТОРОМ, и это НАСТОЯЩАЯ причина «прозрачность не
  возвращается» (моя версия про Realtime-затирание была НЕВЕРНОЙ). Симптом: клик по ячейке 28
  (excluded) — кебаб открывается у 28, а подсвечена и редактируется 29. Корень: `computeIndex`
  (AnimaticPlayer:828) по построению пропускает исключённые (`if (entry.excluded) continue`), а
  исключённая ячейка ДЕЛИТ `playStart` со следующей играбельной. Клик → `seekTo(playStart)` → плейхед
  резолвится в 29 → `currentShot` = 29 → кнопки −/+ правили длительность 29, пока 28 оставался
  схлопнутым и тусклым. То есть исключённый шот было ФИЗИЧЕСКИ НЕЛЬЗЯ отредактировать — а именно его и
  надо поднять, чтобы снять исключение. Замкнутый круг. Фикс: (1) редактор привязан к ВЫБРАННОЙ ячейке
  `editIdx = openCellIdx ?? currentIndex` (editShot/editTailDuration/editNetDuration), плейхед остаётся
  только для превью/каптиона; (2) клик по исключённой ячейке больше НЕ сеет плейхед (играть там нечего,
  а seek уводил весь контекст на соседа); (3) «выбрано» и «играет» разведены визуально — у выбранной
  ячейки свой outline, лейбл панели переключается «Editing selected/current shot».
  НЕ ПРОВЕРЕНО: клиентская половина (дебаунс 3 с, чип статуса, кнопка музыки, порядок тайлов, сам
  off-by-one фикс) — нужен браузерный прогон Директора.
  ЗОМБИ: 3 джоба (EXEC-STITCH + 2 EXEC-VGEN) висели RUNNING 105-107 минут без движения с 16:43-16:45 —
  рендер занимает минуты, это застрявшие. Перезапуск стека ничего живого не убил. Не чистил
  (`scripts/clear-zombie-jobs.ts` есть) — решение Директора.
  ОТКРЫТО: (а) промпт SH44 — рот добавлен, но ACTION «mouth open» конфликтует с CONTINUITY «HAPPY SMILE»,
  «empty_background» в CONTINUITY противоречит кровати в SUBJECT + «Cream background» в STYLE +
  bedroom-описанию в LIGHTING (фон почти наверняка не поменялся), и CAMERA «little pan» против NEGATIVE
  «no camera pan»; (б) SH05/SH06 циклически валят VGEN — planAsset в REVISION, 8 фейлов 16:29-16:44.
Mode:   ===5=== EDIT (Director-authorized).

Date:   2026-07-17 (on-model гейт ПОСТРОЕН — Тео, КОД, ===5===). Реализован валидированный план целиком.
  (1) Детектор-раннер `lib/agents/runners/on-model-detector.ts` — отдельный focused vision-вызов (НЕ общий
  EREF-критик, который off-model не видит): две бинарные оси силуэт/прозрачность против Bible-канона персонажа,
  series-agnostic, модель через app_config scope `on_model` (дефолт claude-opus-4-8 — ловит там, где terra
  плавает), skip-fallback → PASS (аутэйдж НИКОГДА не бракует). (2) Чистое решение `lib/api/on-model.ts`
  `decideOnModel(raw, strictness, isTransformation)`: loose=всегда PASS, medium=FAIL по силуэту (молочное тело
  терпим), strict=силуэт ИЛИ прозрачность; исключение трансформации гасит ТОЛЬКО силуэт (прозрачность под strict
  всё равно FAIL). Вердикт ВМОРАЖИВАЕТСЯ в `shot_reference.on_model` на этапе генерации. (3) Гейт в реконсайлере:
  НЕ флипаем STAGE_HAS_CRITIC (FAIL не должен идти в REVISE-луп), а новый экшен `bounce` в creative-ветке —
  FAIL держит REVIEW + `reconcile/bounce` + raiseBlockerOnce к Директору; PASS/missing → fail-open в старый
  creative-гейт (loose и legacy байт-в-байт как раньше). `collectOnModelSignals` вливает вердикт IMG-метаданных
  в тот же verdicts-map. (4) Структурное поле `transformation: boolean` в схеме шота + сториборд эмитит +
  ParsedShot несёт; глоссарий обновлён. (5) pickBestAttempt CRIT-first — уже был (a87d4a83). (6) Ползунок
  `on_model_strictness` (loose дефолт) в настройках эпизода как pipeline_mode. Rollout — «включить сразу»:
  энфорсит сам ползунок, глобального kill-switch нет; E30 остаётся loose пока Директор не поднимет.
  Verify: tsc clean, 1381/1381 tests (+26), replay-pilot 30/30. ЗАКОММИЧЕНО: d9f46405 (фича) + 68f29051
  (валидац. харнесс `scripts/validate-onmodel-e30.ts`), оба на master.
  **Живая валидация (п.6) ПРОГНАНА** ($1.85, 29 кадров, opus-4-8): fail-open доказан вживую (SH09 transient
  JSON-сбой → PASS, не ложный баунс). MEDIUM = {14,15,16,26} — чистый, ловит блобы+погружён+растянутый, 0
  ложных → **E30 выставлен на medium (метаданные, merge)**. STRICT сначала перебирал (11 баунсов) — корень:
  канон-реф ДНЕВНОЙ, а E30 ночь/фиолетовый ambient, стекло легитимно темнеет. **РЕКАЛИБРОВАНА transparency-ось
  (bb67913b): судить МАТЕРИАЛ (свет проходит / внутр. глубина), терпеть свет; FAIL только плоскую непрозрачную
  закраску.** Директор просмотрел 6 strict-флагов: 5 (SH03/07/11/17/18) — ложные (ночь), теперь PASS ✓; **SH28
  — ИСТИННЫЙ дефект (Директор: «действительно плоско, перегенерил бы»)** — strict держит его верно. Итог: strict
  ДОВЕРЕННЫЙ (снял ложные, удержал реальный); силуэт не трогали (блобы ловятся); SH25 (силуэт в прыжке-балансе)
  — норма, пропускается. Также +retry-once на JSON-флак (~2-3/29 вызовов давали прозу без фенсы → fail-open мог
  пропустить реальный off-model). **Ночной прогон (Директор: q1 подними / q2 redo / ребилди / +10 / гаси):**
  E30 → **strict** (mode 3, armed). Прод-билд чист. Ещё 10 кадров ($0.61): весь старый калибровочный
  transparency-набор {01,04,06,08,12} теперь **PASS** — ночь-рекалибровка подтверждена; retry дал SH09 чистый
  вердикт → FAIL по СИЛУЭТУ (extreme close-up, часы не в кадре — как SH25, вопрос ECU-кропа Директору). SH06
  дважды сфлакал → fail-open (редко). **SH28 regen ЗАБЛОКИРОВАН guard'ом PLAN_ANCHOR_STALE**: план SH28
  (e0c0b129) ссылается на устаревший spatial-якорь 9e3c0c1f, новее APPROVED 479c1ca8 в той же локации —
  image-only regen отказан by design. Правильный путь = переавторить план (regenerateRefPlan, НЕ простой REST —
  concierge/Designer-флоу, меняет continuity-якорь) → апрув → regen. НЕ делал авто ночью (continuity-решение +
  апрув-гейт Директора). Стек поднимал (health 200, functions synced), regen дал 400 STALE, **сервера погашены**.
  ОТКРЫТО Директору на утро: (а) переавторить план SH28 и перегенерить (2 команды); (б) вердикт по ECU-силуэту
  SH09; (в) strict в проде E30 — принять?
Mode:   ===5=== EDIT (Director-authorized).

Date:   2026-07-17 (E30 калибровка ref-image + ПЛАН on-model гейта — Тео, КОД, ===5===). Прогнали 30 рефов
  E30 (SH01-29) для настройки авто-апрува. Шипнуто 5 фиксов: кнопка Generate (не слала required `reason` →
  400; это и есть DEF-02), WCHK бюджет 6k→12k, превью-рефреш при выборе варианта, перенос AttemptsStrip к
  картинке, запрет двусмысленности бриф→сценарий→сториборд (SH05 «plate» → буквальная тарелка), сосед-контекст
  дизайнеру (был ноль в ref-режиме). SH17/18 красный кристалл → проза «Sky Blue» in-place → v02 голубой.
  **БОЛЬШАЯ НАХОДКА (q2):** авто-апрув БЕЗУСЛОВНЫЙ. Художник ставит REVIEW, реконсайлер (Фаза 2b) молча
  поднимает до APPROVED без события в журнале; `reconcile.ts:32 STAGE_HAS_CRITIC.ref_image=FALSE` — вердикт
  визкритика не подключён НИ К ЧЕМУ. Все 29 IMG APPROVED вкл. SH15 (CRIT3 блоб). Планка (85, floated 70/CRIT1)
  рулит только выбором попытки, НЕ апрувом. **Критик не видит off-model:** один блоб дал consistency 22 (SH15)
  и 100 (SH16); ни composite, ни CRIT, ни identity-балл junk не отделяют. **ВАЛИДИРОВАН детектор:** 5 слепых
  агентов со строгой рубрикой (двойная колба + прозрачное стекло) — оба блоба FAIL одинаково, поймали и SH25
  (критик дал 72). Делит два класса: потеря силуэта vs потеря прозрачности → деления ползунка.
  **ПЛАН (авторизован, строю):** (1) детектор-раннер (vision, рубрика из Bible-канона, series-agnostic);
  (2) гейт в реконсайлере вместо ref_image:false + событие в журнал; (3) ползунок строгости в настройках
  эпизода (loose/medium/strict); (4) transformation-aware исключение (глупь-кадры «Gloop-Sandy» не бракуем по
  силуэту); (5) pickBestAttempt CRIT-first (баг SH13); (6) валидация на 30 кадрах. Детали: memory
  session_2026-07-17_e30-calibration-onmodel-gate. Verify: tsc clean, 1355/1355, replay 30/30.
Mode:   ===5=== EDIT (Director-authorized).

2026-07-17 (WCHK: бюджет вывода 6000 → 12000 + число в промпт — Тео, КОД, ===5===). Смоук E30:
  Continuity Critic (EXEC-WCHK) упал «Expected fenced json block ... (stop_reason=max_tokens, output 15385
  chars)». Диагноз: НЕ логика и НЕ канон — `CONT_MAX_TOKENS=6000` (continuity-check.ts:64) исчерпан на
  середине отчёта, ДО обязательной закрывающей json-фенсы → парсер (anthropic-text.ts:386) бросил.
  `stop_reason=max_tokens` — прямая улика: модель упёрлась в потолок, а не выдала кривой JSON. 6000 сайзили
  под membership-only отчёт «13-17 кадров» ДО Motor 1 (4ff52624), который добавил per-shot lighting_canon +
  appearance_canon + prop-canon блок; WCHK к тому же печатает каждый кадр ДВАЖДЫ (markdown-проза + JSON
  per_shot), а русская проза жрёт ~2-3 симв/токен против ~4 у английской — счёт символов занижает трату.
  **Фикс:** (1) 6000 → 12000, как у SREV (ближайший сиблинг: критик над крупным артефактом + структурные
  findings). WCHK был ПОСЛЕДНИМ раннером на до-бампном базлайне (Writer 16k, STB 16k, SREV 12k, EREF 12k,
  Animator 12k — все подняты после ИДЕНТИЧНОГО падения). Критики на free tier (F7) → лишний бюджет стоит $0.
  (2) Промпт теперь называет ЧИСЛО бюджета + курс токенов + порядок трат (JSON → кадры с issues → остальное)
  + как сжимать: «KEEP PROSE TIGHT» без цифры модели неисполнимо — она не считает свои токены.
  Verify: tsc clean, 1350/1350 tests, replay-pilot 30/30.
  OPEN (q2n — Директор отклонил, фиксирую как долг): это ШЕСТОЙ случай ОДНОГО класса (Writer/SREV/Copy/EREF/
  Animator/WCHK), каждый чинён ручным бампом константы ПОСЛЕ смерти живого прогона. Провайдер уже видит
  `stop_reason==='max_tokens'`, но рапортует его как «сломанный JSON» — retry-на-усечение убил бы класс.
  OPEN (не трогал, вне q1): PLAN.md = 470 строк против собственного капа ≤200 (шапка: «add one line, cut
  two») — история просится в docs/PLAN-history.md, но резать записи Директора без спроса не стал.
  **Тот же прогон, находка №2 — кнопка Generate НИКОГДА не работала.** E30 SH01/SH02: ветка «есть APPROVED
  ref_plan» в EpisodeTimelineSection слала `{shotId, planAssetId}` БЕЗ `reason`, а роут требует
  `reason: z.string().min(3)` → 400 на каждый клик. Соседняя ветка (плана нет → author) `reason` шлёт и
  работает — поэтому баг жил с S2 (2026-07-05) незамеченным. Это и есть причина DEF-02 «без Полины Директор
  застревает»: не авточейн, а одно поле. Фикс = 1 строка. Картинки выданы вызовом роута с `reason` под
  `EXEC_DIR_AI_TOKEN` (принципал exec_dir_ai; Director-сессию агент создать не может, браузерное расширение
  к localhost не пущено — клик-путь проверен логикой, не пальцем).
  **Находка №3 — «4 попытки при cap=3» + перегенерация не улучшает (q3y).** Цикл `for (retry=0; retry<=
  maxRetries; retry++)` при cap=3 даёт 4 прохода: поле `reference_regen_cap` = «перегенерации СВЕРХ первой»,
  а подпись в UI (EpisodeSettingsCard:213) врёт — `'Reference attempts'`. Семантика кода самосогласованна
  (дефолт 2 → 3 попытки); расходится ЯРЛЫК. Гейт keep-first (no CRITICAL && composite ≥ 85, Директор
  2026-07-16) не сработал ни разу: SH01 74.25/73.75/73/75, SH02 46.25/61.25/62.5/**41.25** — последняя
  попытка SH02 ХУДШАЯ из всех. Ретраи дрейфуют переписанный промпт и деградируют identity (код это уже знает,
  строка 2317). Цена прогона 8×$0.08=$0.64, польза только от первой попытки. TD: (а) выровнять ярлык/семантику
  cap; (б) вопрос дороже — зачем вообще ретраить, если рост не доказан.
Mode:   ===5=== EDIT (Director-authorized).

2026-07-17 (ХУКИ: хардкод пути машины → path-agnostic — Тео, КОД, ===5===). Директор увидел
  «UserPromptSubmit hook error / loader:1368». Диагноз: `Cannot find module C:\SandyStudio\.claude\hooks\
  training-capture.cjs`. Репо изначально жил в `C:\SandyStudio` (и живёт ТАМ на десктопе), лаптоп — вторая
  машина (`C:\Users\Alexander\sandystudio`); `settings.json` В GIT и общий на две машины, поэтому абсолютный
  путь физически работает только на одной. Коммит 90f2133c сделал path-agnostic ЛАУНЧЕР, до хуков не дошли.
  На лаптопе молча мертвы ВСЕ 10 хуков 5 событий → governance (mode-validator `===1===`, naming, locked-guard,
  plan-guard) НЕ enforced. **Фикс:** (1) `settings.json` → exec-форма `command:"node" + args:["${CLAUDE_PROJECT_DIR}/
  .claude/hooks/x.cjs"]` — плейсхолдер подставляет сам Claude Code ДО шелла (подтв. схемой + докой hooks.md),
  не зависит от bash/PowerShell; относительный путь отвергнут (cwd хука не гарантирован докой). (2) Хардкод
  сидел и ВНУТРИ скриптов — `mode-validator` (`PLAN='C:/SandyStudio/PLAN.md'`), `change-journal`,
  `parallel-session-warn` (cwd), `plan-md-staleness-check`: репо-корень теперь от `__dirname`. КРИТИЧНО: без (2)
  фикс (1) стал бы регрессией — ожив, mode-validator не нашёл бы PLAN.md, откатился на fail-safe `===1===` и
  заблокировал ЛЮБУЮ правку кода вопреки `===5===` (доказано негативным тестом: exit 2 BLOCKED; позитивный на
  реальном репо: exit 0 allow). 10/10 хуков валидны, скрипты на месте, 4/4 стартуют. OPEN: `.codex/hooks*` —
  та же гниль (6 хардкодов), но это конфиг Codex CLI, плейсхолдеры чужого инструмента не гадал → q Директору.
  Хуки этой сессии подхватятся после `/hooks` или рестарта.
  **q1y/q2y добито:** (3) `.codex/*` — 16 хардкодов (не 6: прежний счёт искал только `/`, проглядев `\` в
  hooks.json). Проверка по первоисточнику ОПРОВЕРГЛА веб-сводку: `<repo>/.codex/hooks.json` — РЕАЛЬНАЯ
  поддерживаемая локация, схема (event→matcher→hooks[]) совпадает, хуки вкл. по умолчанию, Windows ок. Но
  `CODEX_PROJECT_DIR` НЕ существует → дока велит резолвить от git-корня: `$(git rev-parse --show-toplevel)`
  (проверено: работает и в bash, и в PowerShell). 10/10 команд переведены; 4 `.cjs` (побайтово идентичные
  claude-копиям, разница лишь CRLF) — на `__dirname`; журнал у codex-копии намеренно оставлен на общий
  `<repo>/.claude/CHANGES.md`. Доказательство: codex mode-validator был exit:2 BLOCKED → стал exit:0 allow.
  (4) `.claude/settings.local.json` ОТКРЕПЛЁН от git + в .gitignore: «локальный» файл был закоммичен, две
  машины дрались за него (отсюда вечный стеш local-claude-settings), внутри — мусор от ТРЁХ машин, включая
  мёртвый профиль `NAVIA VISION ONE`. Содержимое в истории НЕ тронуто: чистка «устаревшего» машинно-относительна
  (`Edit(C:/SandyStudio/.claude/worktrees/**)` мёртв на лаптопе, но ЖИВ на десктопе), поэтому чищена только
  локальная копия лаптопа. Десктоп восстанавливает СВОЮ: `git show 2f94b16e:.claude/settings.local.json >
  .claude/settings.local.json` (иначе pull её удалит). Сводка: хардкод `C:\SandyStudio` жил ТОЛЬКО в хуках и
  stale-permissions — в `.ps1`/`.cmd`/`.ts`/`.yaml` его НЕТ (лаунчер 90f2133c чист).
Mode:   ===5=== EDIT (Director-authorized).

2026-07-17 (ffmpeg-резолвер: хардкод версии → glob — Тео, КОД, ===5===). EXEC-VCRIT (видео-критик) упал
  «ffmpeg could not be launched» на E29/SH01. Диагноз: ffmpeg ИСПРАВЕН (winget 8.1.2), но (1) в коде winget-фоллбэк
  был прибит к `ffmpeg-8.1.1-full_build` / ffprobe к `7.1` — таких папок на диске нет, фоллбэк не фаерил молча;
  (2) `FFMPEG_PATH` Директор дописал в `.env.local` в 22:25, а сервер стартовал 22:24 → живой процесс env не перечитал
  (Next читает .env только на старте) → падал на PATH-кандидат, унаследованный до установки. **Фикс:** `resolveFfmpegPath`
  + новый `resolveFfprobePath` ГЛОБЯТ winget-дерево (user %LOCALAPPDATA% + machine %ProgramFiles% + Links-шим), версия
  берётся новейшая (`sortFfmpegBuildDirsDesc`, numeric-aware: 8.1.10>8.1.2). Версии в коде больше НЕ пиннятся — winget
  апгрейдится молча. Схлопнуты 5 дублей резолва в один (`runFfprobe`/`probeDurationSeconds` в ffmpeg-stitch; siblings
  sample-frames · ffmpeg-shorts · scripts/extract-frames переведены). Доказано: с вырезанным PATH и без FFMPEG_PATH
  glob сам находит ffmpeg+ffprobe 8.1.2 → офисный десктоп (другой USERPROFILE, .env.local НЕ в git) заработает без
  ручной настройки. tsc·0 / vitest **1350** (+5 на сортировку версий). NEXT: на лэптопе рестарт стека, чтобы критик
  подхватил фикс (правка кода = нужен -Build).
Mode:   ===5=== EDIT (Director-authorized).

2026-07-16 (Channel LAUNCH prep — Тео, Head of Growth, ===1===). ПЕТЛЯ НАЧАЛА размыкаться.
  Канал «Sandy the Hourglass» упакован под запуск: баннер (наш gpt-image-2 S15-канон + ffmpeg 2048×1152, залит
  вручную через Studio — API `channelBanners.insert` мёртв 404), About переписан (промис + ссылки Full/Shorts/
  подписка, убран ложный `#3danimation`), плейлист Full Episodes переименован (API `playlists.update`). Из ОДНОГО
  финала Vending нарезаны **4 Short'а ~20с full-bleed 9:16 с follow-crop** (per-beat crop-x, метод подтверждён
  QA-кадрами; letterbox отвергнут — режет ретеншен): D Монетка · A Раунд1 · B Раунд2 · C Победа-лавина. Залиты
  PRIVATE через наш `uploadVideo` API (youtu.be R5YYEoP7nrA / J6rp-gmUKe4 / cZmqxhQIPeo / AHARBzM2CWw). Каденция
  ДОКАЗАНА ресёрчем (не 2-3дня из strategy.md): **1/день D→A→B→C** — ежедневно=рост, но НЕ залп (каннибализация
  traffic-test + мутит retention-сигнал=North Star). NEXT (Директор-gate): schedule Public 1/день; воронка =
  Vending эпизод→Public + ссылки в описания; след. батч Gym/Smartphone. Старые 5с-версии (x3doFsAtwIA/IpS/d8r)
  PRIVATE, стереть. PLAN.md над капом (299>200) — компакция owed.
Mode:   ===5=== EDIT (Director-authorized).

2026-07-16 (СЛОЙ АДАПТАЦИИ — Critic Discriminator + Factory-страница — Тео, КОД, ===5===). Первый живой фаер
  медленной петли (тюнит фабрику с каждого отклонения). **SHIPPED master `1bf39d88`:** (1) деривер
  `critic-discriminator.ts` — 3 оси (черн критика REVISE/версию · producer first-pass reject · regens) в metrics
  JSONB, на существующем `exec-pub/published`; escalate→Inbox `rule_proposal`, auto_safe без касания. Форензика E28:
  «2.45×/шот»=артефакт (3 REVISE/54); сенсор нашёл VPREV-gap V04/V11/V12. RLS-фикс 0044 (episode_scorecard читался
  authenticated=0 строк). (2) Страница `/factory` + v2 под модель Директора: 3-way touches (Дир/Полина/AI-EP),
  **leadership-метрика→0** (агенты=база, L1 Полина, L2 Директор), граница **design→production = старт реф-артиста**
  (не casting), бюджет total=itemized (design+production сходятся, reserved=budget_spent отдельно), SVG-графики.
  (3) R02 self-check в сториборде. (4) `/nav-orch*` глобальные команды. (5) Мульти-машинный лаунчер (path-agnostic +
  ASCII) — прод поднят на ЛЭПТОПЕ. tsc·0 / vitest **1345** / replay **30/30**. OPEN: VPREV-форензика · budget_spent
  недосчитывает Полину (itemized-backfill) · scorecard actor-count fix. Хендофф: session-data/2026-07-16-factory-adaptation-layer.md
Mode:   ===5=== EDIT (Director-authorized).

2026-07-15 (Critic Churn Discriminator + Factory page — Тео, КОД, ===5===. Первый живой фаер СЛОЯ АДАПТАЦИИ.
  Форензика E28 (read-only) опровергла посылку: «CREAD 2.45×/шот» = АРТЕФАКТ метрики — 54 прогона, 3 REVISE (94.5%
  first-pass PASS); «черн» = идемпотентные пере-чеки планов, что Директор регенерил РУКАМИ (approval_revision→
  Designer ре-авторит, доказано activity_events), НЕ баг и НЕ строгий критик. Рантайм-прогон сенсора нашёл БОЛЬШЕ
  ручного: **EXEC-VPREV 13 REVISE (V04/V11/V12) = продюсерский gap на аниматоре**, крупнее storyboard-R02. Построено
  (subtract-first, 0 миграций): деривер `critic-discriminator.ts` (3 оси — черн критика REVISE/версию · producer
  first-pass reject rate · paid regens) в существующий `metrics` JSONB скоркарда; триггер ПЕРЕИСПОЛЬЗОВАН (`exec-pub/
  published`); escalate-зона→Inbox `rule_proposal` (идемпот., только published), auto_safe→metrics без касания
  Директора («не 7-е касание»). PART C: страница `/factory` в сайдбаре (тренды North-Star: касания vs 6 · post-cast
  leak · черн true/naive · reject% · $/шот · autonomy% · per-critic вердикты) + `/api/factory`. Правка R02 (анти-
  аддит.): hard-rule УЖЕ был — дыра в pre-submit self-check → добавил пункт в `storyboarder-situational-comedy` +
  QA-строку в `agents/exec/storyboarder.md` (ловит R02 до критика). tsc·0 / vitest **1251** (+6) / replay **30/30**.
  E28 скоркард популирован. ЗАДЕПЛОЕНО (master `44dffb11` rebuild+стек up, health 200×3). Медленный цикл доказан
  end-to-end: published-фаза E28 → **2 реальных предложения в Inbox** (CREAD R02/R06 + VPREV V04/V11/V12, escalate,
  идемпот. без дублей). Побочно найдена+закрыта дыра: Director-Inbox фильтр не включал `rule_proposal` → эскалация
  писалась в activity_events но не всплывала → добавлен в `.in()` (inbox/route.ts). OPEN=VPREV V04/V11/V12 отдельная
  форензика (продюсер vs критик); safe-auto-applier отложен (нечего применять — критики точны). Стек session-bound —
  durable = десктоп-ярлык.)
Mode:   ===5=== EDIT (Director-authorized).

2026-07-16 (Failure-spine эскалация — Тео, КОД, ===5===). E29 видео-фанаут МОЛЧА простоял сутки:
  3 видео-плана застряли в REVISION (VPREV cap-HALT), VGEN отказался, 6× agent_failed будили read-only Полину,
  Директору — НИКОГДА (`revision_requested`/`agent_failed` не в Inbox-whitelist). **SHIPPED master `0bf780f2`
  (Slices 1/2/4a):** единый сосуд `raiseBlockerOnce`→`blocker_raised`→Director Inbox (дедуп per shot+stage);
  (1) critic cap-HALT (VPREV+EPREV) → Inbox; (2) Inngest `onFailure` (терминал после ретраев) → один blocker +
  per-attempt `auto_react=false` гасит фаершоз 6→1; (4a) reconciler HALT → Inbox. Оба вопроса Директора закрыты.
  tsc·0 / vitest **1302** / replay 30/30. ОСТАЛОСЬ (armed-only, свежей сессией): Slice 3 (reconciler re-fire
  FAILED под recovery-cap) + 4b (reconcile-cron ловит молча зависший шот). Также: E29-фикс gpt-image-2 таймаут
  90с→12мин (`GPT_IMAGE_MS`) на master. Step-0 руками: 3 плана E29 на кэпе ждут Директора (approve-as-is/bump cap).
  План: `~/.claude/plans/wiggly-twirling-bee.md`.
Mode:   ===5=== EDIT (Director-authorized).

2026-07-15 (Phase 2b «Дирижёр» — Тео, КОД, ===5===). ВЗВОД дирижёра. Phase 2a вживила mode-aware мозг
  (`resolveGateDecision`) + заменила ENV-флаг `MECHANICS_AUTO_ADVANCE` на per-episode `isReconcilerArmed`
  (armed ⇔ `metadata.reconciler_armed` + `governance_mode∈{2,3}`), но флаг НИКТО не писал → reconciler инертен.
  **SHIPPED master (merge `teo/conductor-phase2`):** `armForMode(mode)` (единое опр. «автономный режим») пишется
  arm-at-creation (единственный INSERT `episodes/route.ts`) + arm-on-mode-switch (`governance-mode` роут: →2/3
  взводит, →1 разоружает=пауза, метаданные сохранены, Директор q). Deploy-safe: строгое `===true`, старые эпизоды
  без ключа инертны; двойной гейт (флаг+скаляр-колонка) делает metadata-RMW-гонку fail-safe. Чистка 12 устаревших
  `MECHANICS_AUTO_ADVANCE` (вкл. модель-facing строки concierge-тула). Code-review APPROVE (0 CRIT/HIGH; 1 MEDIUM
  RMW→backlog). tsc·0 / vitest **1266** / replay **30/30**. NEXT = staging smoke (throwaway Mode-3 эпизод →
  arm→force-reconcile→наблюдать `gate_decision_log`+`reconcile/auto-approved`) перед первым живым автономным прогоном.
Mode:   ===5=== EDIT (Director-authorized).

2026-07-15 (E29 EREF-фикс — Тео, КОД). Живой E29-смоук встал: пилоты SH01/SH02 упали «No assets inserted» —
  рантайм (prod.log): `openai-edits-multi` (gpt-image-2 синхронный POST) пробил 90с-таймаут ВСЕ 7 попыток/шот.
  E17-защита от зависаний ввела ЛОЖНЫЙ потолок: gpt-image-2 мульти-реф реально до ~10 мин (Директор; память
  `eref_generation_needs_stable_server` ~6мин/кадр). FIX: отдельная `FETCH_TIMEOUTS.GPT_IMAGE_MS=720_000` (12 мин)
  для 3 gpt-image-2 эндпоинтов; быстрый gemini-flash остался на 90с (без регресса hang-guard). tsc·0/vitest 1266/
  replay 30/30. NEXT = deploy после соседа → ре-триггер пилотов E29.
Mode:   ===5=== EDIT (Director-authorized).

2026-07-13 (Brand-бумперы SHIPPED+LOCKED. Прод master `aef0c137` (пересобран, health 200×3). INTRO+OUTRO (S15-канон Sandy+Anvil+Parfum, hills, iris-in/out, вордмарк «Sandy», музыка Flacon Pop Loop запечена) **LOCKED** как `SBL-video_intro/outro` на S15 → EXEC-STITCH теперь собирает брендовый мастер по тумблерам. Инструмент `scripts/gen-intro-action.ts` (kind-aware, gpt-image-2 мульти-реф→Seedance fast 720p→апскейл 1080p, ~$1.85/шт) переиспользуем. UI-фикс: video-превью постеры в Library card/drawer. NEXT (опц.) = двух-мастер смоук на реальном эпизоде (закрывает Stage 4). RECONCILER **OFF**.)
Mode:   ===5=== EDIT (Director-authorized).

2026-07-14 (Phase 1 «Дирижёр и Спинной Мозг» — Тео, КОД). Старт вычитания поверхностей пайплайна к ОДНОМУ
  дирижёру (не аддитивные починки — вычитание, директива Директора). **SHIPPED master `d60efd9c` (+346/−850,
  чистые −504):** удалён Mode 4/AUTOTEST целиком — суб-водители factory.ts, AUTOTEST-форки next-events (branch-2 =
  единственный путь для всех), Mode-4 gate-исключения (cast/music/budget), раннеры/concierge/UI-селекторы; типы
  `GovernanceModeNum`/`ConciergeMode` сужены 1..4→1..3. Режим больше НЕ ветка роутера. replay-pilot на фикстуры
  (budget_approved+APPROVED cast+directorConfirm). Сайдкары спины: `revision_requested` (critic-cap HALT) →
  actionable-whitelists (+миграция 0043, раньше не доходил ни до кого); D6-таймаут портирован в anthropic-brief.
  tsc·0 / vitest **1245/1245** / replay **30/30**. NEXT = Фаза 2 (gate-decision=mode-aware мозг, вживить в
  reconciler, убрать `MECHANICS_AUTO_ADVANCE`, гейт на governance_mode∈{2,3}+arm-at-creation). Полный план:
  `~/.claude/plans/so-one-more-time-delightful-curry.md`.

2026-07-13 (Timeline music-fix — Тео, КОД). «Залил+заапрувил музыку — нет в таймлайне.» Runtime-корень (эп `c06c721f`,
  read-only DB): ДВА бага, оба нужны — (1) `newestApprovedMusic` матчил точным `=== 'AUD-music'`, дропая реальный
  композиторский `AUD-music-main` → `startsWith`+`staging_path`-fallback; (2) инъекция музыки жила лишь в synthetic-ветке,
  а немой авто-APPROVED-аниматик уводил таймлайн в реальную ветку → перенёс fallback в общий `activeContract` (обе ветки,
  не перетирает запечённое). SHIPPED master `b536aa91` + rebuild (health 200×3). tsc·0 / music 7/7 (+2 регресс) / кластер
  92/92. OPEN=глубокий bake-баг (bake newest-ANY-status vs display APPROVED) → memo `backlog_td_music_bake_animatic_selection`.

2026-07-13 (INTRO/OUTRO брендинг-буки — Тео, КОД, $0-фундамент). Директор: intro/outro НЕ на таймлайне; стич
  делает ДВЕ версии по тумблерам intro/outro ON/OFF. **SHIPPED + DEPLOYED (master `bea6665`):** (0) SBL-таксономия +`video`/mp4
  (`series-bible.ts` + 3 UI-мапы + prompt-builder + bible-роут zod/ext); (1) `scripts/compose-brand-clip.ts` —
  $0 запекает Suno-музыку Директора на наш IMG→VID визуал (reuse `ffmpegStitchEpisode`, 1-эл. массив); (2) ядро —
  `resolveStitchSettings` (`animatic-shotlist.ts`, default ON/ON, cold_open STUB) + `buildBrandedInputs`
  (`ffmpeg-stitch.ts`, [intro?,body,outro?], БЕЗ music→`-map 0:a?` держит звук каждого сегмента) + EXEC-STITCH
  выдаёт ДВА мастера через переиспользованный `saveAgentOutput` (чистый `VID-final_cut` + `VID-final_cut-branded`,
  skip_save→оба получают Mode-4 auto-approve; брендовый в try/catch — НИКОГДА не роняет чистый); (3) EXEC-PUB
  long-form предпочитает брендовый, Shorts читают чистый. Reuse-first: 0 новых таблиц/компоновщиков/роутов/
  музыки-провайдеров; новые файлы = compose-скрипт + тест. tsc·0 / **vitest 1261** (+9 юнитов) / **replay-pilot 30/30**
  (букэндов у теста нет → брендовый не строится → DAG неизменен = регресс-гейт). Гоча: native YouTube end-screens
  через API НЕ ставятся → ручной шаг Studio. NEXT = произвести визуалы intro(≤2с)/outro(5-20с) через fal.ai +
  Suno-музыка → залить+LOCK как SBL-video → двух-мастер смоук на реальном эпизоде. Тема-на-кастинге = отдельный follow-up.

2026-07-13 (Vertical-safe правило + P2-мышцы — Тео, КОД). Директор: 9 текущих шортсов слабы не из-за
  нарезки, а из-за тупого center-кропа всего landscape-эпизода. Фикс UPSTREAM на сториборде. **SHIPPED +
  DEPLOYED (master `de12089`, health 200×3):** доктрина — секция «Vertical-safe framing» в `storyboarder-situational-comedy`
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
