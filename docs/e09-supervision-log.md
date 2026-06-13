# E09 run — supervision log (Тео)

> Goal (Director 2026-06-13): следить за прогоном Полины по E09, каждые ~10 мин
> читать переписку + сверять с реальным состоянием пайплайна, выводы → git.
> После прогона — анализ, синтез, обучение персонала.
> Thread наблюдения: concierge `0d5de76a` (сейчас episode_id=null, mode=1 — НЕ
> пришпилен к E09; работа по E09 идёт через focus). E09 id `4b4a00f3…`.

---

## Cycle 1 — 2026-06-13 ~08:05 (Dubai +4 / ~04:05 UTC по таймстампам ниже UTC)

**Состояние E09:** status BRIEF_APPROVED · mode 2 · $0.34/$100. SCR-script v2 +
REV-script_qa v2 в REVIEW (Story Editor PASS по v02). STA-work_plan v1 DRAFT
(план Полины).

**Канон S15 — лифт заведён (всё DRAFT):**
- `SBL-location_elevator_corridor_call_wall`
- `SBL-location_elevator_cab_button_wall`
- `SBL-location_elevator_cab_door_wall`
- `SBL-location_elevator_cab_side_wall_a`
- `SBL-location_elevator_cab_side_wall_b`
- `SBL-object_elevator_call_button`, `SBL-object_elevator_button_cluster`
- `SBL-style_s15_style_canon_2d_v2_sandy` (новый style-entry)

**Выводы:**
1. ✅ Канон-дыра (которую я флагнул) закрывается правильно — генерим канон
   эпизода, а не фолбэчим на спальню. 4 стены кабины + corridor совпадают с
   геометрией брифа (4 вида + 180°).
2. ✅ Полина дисциплинирована: читает каждый ассет, даёт observations+recs, НЕ
   авто-аппрувит канон («series Library asset, не episode gate; Director
   проверяет/локает»). Поймала реальный рассинхрон текст-канон vs картинка на
   corridor-стене (текст «wall/panel», картинка «bare buttons, no wall») →
   советует править текст. Хороший verify-real-results.
3. 🚩 РИСК (открыт): slug-mismatch скрипт↔канон. Скрипт v02 ссылается на
   `elevator_corridor`/`elevator_cab`; канон-slug'и — `…_call_wall`,
   `…_cab_button_wall` и т.д. Точного совпадения нет → WCHK/EREF (location ∈
   canon) не найдут. + модельный сдвиг: скрипт = 1 локация-кабина с 4 видами,
   канон = 4 отдельные локации-стены. Нужна сшивка per-scene. Это та же
   canon-existence проблема в новой форме — генерация канона ≠ решение, если
   slug'и не матчатся точно в обе стороны. (→ усиливает TD canon-preflight.)
4. 🟡 Тред Полины `0d5de76a` не пришпилен к E09 (episode_id=null). Работает
   через focus, но при параллельных эпизодах это хрупко.

**Watch next:** аппрувятся/локаются ли локации; перепривязывается ли скрипт на
реальные slug'и; не стрельнёт ли Storyboard на нестыкующихся slug'ах.

---

## Cycle 2 — 2026-06-13 ~08:12 UTC

**Состояние E09: без движения** — те же SCR-script v2 + REV-script_qa v2 (REVIEW),
STA-work_plan v1 DRAFT, $0.34/$100. Эпизодный конвейер ЗАПАРКОВАН на script-v2
review (правильно — ждёт канон). Story Editor review v2 не аппрувлен.

**Активность с цикла 1 — вся в каноне/Bible:**
- Стиль-канон Сэнди прокручен v1→v2→v3 (`style_s15_style_canon_2d_v2_sandy`,
  `…_v3_sandy`, DRAFT). Текст: «Sandy-only hourglass, no proxy/squirrel, 5–6px
  outline, flat opaque fills, no gradients». = ужесточение идентичности (вечная
  борьба с дрейфом в «белку»/proxy).
- 🚩 **Лифтовые ЛОКАЦИИ снесены и переделываются LIVE.** Cycle1=5 location-ассетов
  → cycle2 проба=1 → прямой запрос по всем сериям=**0** (остались только 2
  объекта-кнопки `elevator_call_button`, `elevator_button_cluster`). Удаление
  происходило между моими чтениями (~1 мин). Это похоже на ОСОЗНАННЫЙ re-do
  (Director иттерирует и стиль, и сет), не баг — но если случайно, флагнуть.

**Выводы:**
1. Прогон в фазе CANON-HARDENING, не episode-pipeline. Эпизод корректно ждёт.
2. Slug-mismatch риск цикла 1 СУПЕРСНЯТ: старые location-slug'и удалены, новые
   TBD. Реальная сшивка скрипт↔канон станет нужна, когда локации устаканятся.
3. Полина дисциплину держит: канон не авто-аппрувит, сверяет текст↔картинку,
   «Director inspects/locks». Стабильно хорошо.
4. Канон сейчас — движущаяся мишень; снэпшот-чтения ловят меняющуюся картину.
   Эпизодная цепочка заблокирована до устаканивания канона.

**Watch next:** когда локации пере-созданы и LOCKED — критический шаг сшивки:
per-scene location-slug скрипта → финальные канон-slug'и + решение «кабина = 1
локация с 4 видами ИЛИ 4 отдельные стены-локации». Это гейт перед Storyboard.

---

## Finding (Director-flagged 2026-06-13 ~08:14 UTC) — work plan не ведётся как живой трекер

Director: «Полина должна вести план, отмечать/удалять выполненное (лучше удалять,
чтоб не разрастался), не терять, проверять что реально запустилось; а она
собирается → не получается → молчит».

**Факт:** план ЕСТЬ и хороший — `SS-S15-E09-STA-work_plan-v01` (standing decisions
+ canon split + pipeline hold). НО write-once: created 07:42, updated 07:58,
дальше не тронут, пока стиль ушёл v2→v3 и локации снесены/пересозданы. План
рассинхронён с реальностью.

**Silent-fail скан (60 ходов):** tool-сбоев нет (11 calls / 12 results / 0 fails).
Значит «молчит о провале» — это не падающие инструменты, а **незамкнутый план**:
пункты делаются ad-hoc, завершение/провал не сверяются с планом → пропуск
проходит тихо.

**Корень (точный):** `system-prompt-builder.ts` блок `[WORK_PLAN]` инструктирует
план как ПАССИВНУЮ память решений Директора («обновляй когда Director меняет
решение; не переспрашивай»), НЕ как активный трекер исполнения. Отсутствуют 3
правила: (1) отметил своё сделанным → УДАЛИ из плана (держи короткий); (2) каждый
ход сверь план↔реальность — появился ли артефакт запланированного шага
(created_at позже попытки); (3) запланированный шаг не сработал → СТОП + доклад,
не «молча дальше». Это work-plan-версия F5/silent-failure доктрины (8a-8c).

**Fix:** ужесточить блок `[WORK_PLAN]` + concierge.md этими 3 правилами. PROJECT-
контент → нужен ===5===; по sequencing Директора — в пост-прогонное обучение
персонала. Опционально СЕЙЧАС: nudge Полине обновить план (mark done + prune +
reconcile + доложить несработавшее) — живой тест способности.

---

## Cycle 3 — 2026-06-13 ~08:20 UTC

**Канон УСТАКАНИВАЕТСЯ — локации локаются.** Director залочил 4 чистые
ортографические лифт-стены (LOCKED): `elevator_corridor_door_wall`,
`elevator_cab_plain_wall`, `elevator_cab_door_wall_clean`,
`elevator_cab_side_wall_clean`. Исполнение canon-split (чистые стены, кнопки —
отдельные Object-ассеты). EXEC-BIBLE-AUTHOR генерит по дизайн-constraints
Директора (flat, dead-on orthographic, no props baked, no gradients).

**Полина — образцовая сдержанность:** «WAIT for Director», «не approving from
autonomous trigger», читает каждый ассет, советует LOCK-или-regen. 0 авто-мутаций
канона.

**E09 эпизод:** без движения (script v2 / REV v2 REVIEW, $0.34) — корректно ждёт
канон.

**Выводы:**
1. ✅ Canon-hardening почти завершён по локациям (4 LOCKED). Подтверждает: фаза
   была дизайн/канон, не episode-pipeline.
2. 🚩 Slug'и снова сменились (`*_clean`/`*_plain_wall`) и LOCKED, но ≠ скриптовым
   `elevator_corridor`/`elevator_cab`. Сшивка скрипт↔канон = ГЕЙТ перед Storyboard,
   всё ещё открыт.
3. 🧩 Director вручную исполняет роль Art Director / Production Designer
   (решения: нужна локация, view-split, prop-vs-background, look-constraints) +
   breakdown. Это отсутствующая ступень пайплайна (между Story Editor PASS и
   Storyboard). РЕШЕНО (q8a/q9a): воплотить как рантайм ART-AD, спроектировать в
   пост-прогонном синтезе. См. memory backlog_td_canon_existence_preflight
   (роль-уровень) + backlog_td_artdir_breakdown_role.

**Watch next:** сшивка скрипт-slug↔LOCKED-канон; аппрув Story Editor review →
старт Storyboard; не стрельнёт ли EREF без сшивки.

---

## Finding — SCR-script v02 vs edited brief (Director-asked 2026-06-13 ~08:30 UTC)

Director спросил: «бьётся ли v02 с подходом из отредактированного брифа?»

**Крафт — ДА, отлично.** Writer усвоил бриф: закон «нет пустого бита» держится
жёстко (каждое нажатие → конкретная неправильная реакция), физика песка как
двигатель (палец тянется/щёлкает, песок с талии ×2, колба плющится, лодыжка
тянется), лестница эскалации (палец→мизинец→застрял→ладонь→2 руки→локоть→all-six),
финал-панч твой (двери-губы, выплюнул, «just in time», улыбка), немой, без новых
персонажей, ~52с (в допуске 55±), без bedroom.

**Канон — НЕ сшит (это гейт):**
1. Slug-mismatch: скрипт `elevator_corridor`/`elevator_cab` ≠ LOCKED
   `*_door_wall`/`*_plain_wall`/`*_clean`. Assumptions скрипта прямо: «ещё не в
   каноническом реестре» → **Writer не знает, что канон залочен**. Story Editor
   снова PASS по тексту, не по существованию → та же canon-дыра.
2. Модель кабины расходится: скрипт = 1 локация `elevator_cab` с «панелью на
   стене»; канон = 4 ЧИСТЫЕ стены + кнопки ОТДЕЛЬНЫМ объектом (button_cluster).
   Скрипт не отражает композицию «чистая стена + объект» и не маппит стену на сцену.
3. Косметика: SC01 битый beat «Sandy vbegayet… nazhamaet» — кривая транслитерация
   русского брифа в лейбле (след хрупкости языкового слоя, запаркован).

**Вывод:** это буквально работа отсутствующей ART-AD/breakdown ступени (q8a/q9a) —
сшить скрипт↔LOCKED-канон + разложить кабину на стены+объекты. Writer и канон
растут параллельно, никто не сшивает. Гейт перед Storyboard: до сшивки EREF не
найдёт локацию или нарисует мимо залоченных стен. Рекомендация: перед approve
Story Editor → Storyboard сделать сшивку руками (per-scene канон-slug стены +
пометка панель = чистая стена + button_cluster).

---

## Cycle 4 — 2026-06-13 ~08:40 UTC

**Канон лифта ПОЛНОСТЬЮ ЗАЛОЧЕН:** 4 стены LOCKED (`elevator_corridor_door_wall`,
`elevator_cab_plain_wall`, `elevator_cab_door_wall_clean`,
`elevator_cab_side_wall_clean`) + 2 объекта LOCKED (`elevator_call_button`,
`elevator_button_cluster`, 08:37). Canon-hardening лифта завершён.

**E09 эпизод:** без движения — script v2 / REV v2 REVIEW, $0.34. Готов двигаться,
Story Editor review v2 не аппрувлен. Полина дисциплину держит.

**Мы у ГЕЙТА сшивки.** Канон финальный, но скрипт по-прежнему ссылается на
`elevator_corridor`/`elevator_cab` ∉ canon. Approve→Storyboard сейчас = раскадровка
на несшитых slug'ах.

**Рекомендованный маппинг сцена → канон-стена + объекты (для сшивки):**
- A1-SC01 call button → `elevator_corridor_door_wall` + obj `elevator_call_button`
- A1-SC02 doors → `elevator_corridor_door_wall`
- A1-SC03, A2-SC04/05/07, A3-SC09 панель → `elevator_cab_plain_wall` + obj `elevator_button_cluster`
- A2-SC06 doors interrupt → `elevator_cab_door_wall_clean`
- A2-SC08 near-miss ride (indicator) → `elevator_cab_door_wall_clean`
- A3-SC10 destination doors → `elevator_corridor_door_wall`

**🚩 НОВАЯ дыра канона:** скрипт активно использует `indicator display above doors`
(SC05/08/09) — его НЕТ в залоченном наборе объектов (есть только call_button +
button_cluster). Нужно решение: запечь индикатор в `cab_door_wall_clean` канон ИЛИ
завести объектом `elevator_floor_indicator`. Иначе индикаторные гэги (4→4.5) негде
рендерить консистентно.

**Watch next:** сделают ли сшивку перед approve; решат ли indicator-дыру; стартует
ли Storyboard.

---

## Cycle 5 — 2026-06-13 ~08:50 UTC

**Без изменений с цикла 4.** Полина молчит с 08:37 (последнее — LOCK объектов-
кнопок). E09 на script-v2 / REV-v2 REVIEW, $0.34. Канон залочен (4 стены + 2
объекта). Сшивка скрипт↔канон НЕ сделана, indicator-дыра НЕ закрыта, Story Editor
review v2 НЕ аппрувлен, Storyboard НЕ стартовал.

**Вывод:** прогон ВСТАЛ ровно у предсказанного гейта (slug-сшивка). Никто его не
двигает — ни Полина (молчит/idle), ни автоцепь (correctly не пускает на несшитых
slug'ах). Это двойное подтверждение находок: (1) отсутствует ART-AD/breakdown
ступень, которая должна сшить скрипт↔канон и поймать indicator-дыру; (2) Полина
не проактивна на разблокировке, т.к. её work-plan пассивен (не трекает «сделать
сшивку») и это не её предписанная работа. Гейт ждёт ручного решения Директора.

**Watch next:** кто сделает сшивку (Director/я/Полина по нуджу); закрытие
indicator-дыры; approve → Storyboard.

---

## ACTION — ART-AD stitch performed by Тео (Director-authorized 2026-06-13 ~08:49 UTC)

Director: «поработай отсутствующей ART-AD/breakdown-ступенью — сшей и замени в базе
прямо (UI-редактирования скрипта нет, в отличие от брифа)».

Выполнено (in-place edit of SCR-script v02 content, id a7a12e2c):
- Per-scene location slugs реконсилированы к LOCKED канону (JSON 10/10 + markdown
  Location-строки 10/10). Verify: ВСЕ 10 сцен ∈ LOCKED canon ✓.
  Маппинг: corridor сцены → elevator_corridor_door_wall; cab панель (SC03/04/05/07/09)
  → elevator_cab_plain_wall (+obj elevator_button_cluster); cab двери (SC06/08) →
  elevator_cab_door_wall_clean. cab_side_wall_clean в резерве.
- assumptions: убрана ложная «not yet in canonical registry»; добавлены ART-AD
  stitch note + CANON GAP по indicator.
- Story Editor review v2 остаётся валиден (менялись только slug'и, не креатив).
- Остаток: 3 prose/QA-токена `elevator_cab/corridor` (нарратив «threshold», self-QA
  summary) — не операционные, оставлены намеренно.

**ОТКРЫТО, блокирует EREF — нужно решение Директора:** indicator display
(SC05/08/09, гэг 4→4.5) не заведён в канон. Бэйкнуть в `elevator_cab_door_wall_clean`
ИЛИ завести объект `elevator_floor_indicator`. До решения — EREF индикаторных
сцен неполон.

**Готово к approve** (Director через Полину или сам) → Story Editor review →
Storyboard. Эта ручная сшивка = ровно та работа ART-AD/breakdown ступени (TD).

---

## Cycle 6 + ACTIONS — 2026-06-13 ~09:00 UTC

**Asset-loss проверка (Director-запрос) — НАЙДЕНА и ЗАКРЫТА дыра:**
`loadSeriesBibleCanon` (канон для Writer/Storyboarder/EREF-Designer) грузил `SBL-%`,
но раскладывал только в characters/locations/styles — `SBL-object_*` ВЫБРАСЫВАЛСЯ.
→ Сториборщик и EREF-Designer НИКОГДА не видели объекты (call_button, button_cluster,
будущий floor_indicator). Только WCHK (отдельный loader) видел их для геометрии.
Итог: canon-split «чистая стена + объект» рендерился бы голыми стенами.
**Fix (commit dfa4e36, q11a):** loader грузит objects + промпт-секция «Objects/Props»
с инструкцией compose-by-slug. tsc·0/829/30. Сервер пересобран+перезапущен (health 200).

**E09:** без движения — script v2 / REV v2 REVIEW, $0.34. Полина idle с 08:37.
Канон: 4 стены + 2 объекта LOCKED. Скрипт сшит (все 10 сцен ∈ canon, commit в БД).

**Готовность E09 к Storyboard — осталось 2 шага (оба за Директором):**
1. indicator-объект `elevator_floor_indicator` — создать+залочить (q10b, Director толкнёт Полину).
2. approve script (Story Editor review v2) → Storyboard.

**Вывод (повтор):** все три находки — object-loss, indicator-дыра, незамеченность —
это отсутствие ART-AD/breakdown ступени + пассивность Полины. Loader-фикс убрал
системную потерю объектов; остальное (роль, work-plan, canon-preflight) — пост-прогон.

---

## RESUME ANCHOR @ /compact — 2026-06-13 ~09:10 UTC

**Goal активна:** следить за прогоном E09 (каждые ~10 мин читать тред Полины +
сверять пайплайн, выводы в этот файл; после прогона — анализ/синтез/обучение).
Helper: `cd C:\SandyStudio\webapp; npx tsx tmp-pa-watch.ts`. E09 id `4b4a00f3…`,
тред Полины `0d5de76a`.

**Состояние сейчас:**
- E09 на script-v2 REVIEW, mode 2, $0.34/$100. Канон: 4 стены + 2 объекта LOCKED.
- Скрипт СШИТ с каноном (Тео, все 10 сцен ∈ canon, в БД).
- Loader-фикс (объекты доходят до агентов) — commit dfa4e36, сервер перезапущен.
- Формат Полины (абзацы + emoji на action-строках) — вшит.

**🔴 E09 ждёт 2 шага Директора → Storyboard:**
1. создать+залочить объект `elevator_floor_indicator` (q10b, через Полину);
2. аппрув скрипта (Story Editor review v2).

**Незапушено в git:** коммиты supervision + фиксы (последний dfa4e36 + лог-коммиты)
— проверить `git log origin/master..master`, запушить по запросу Директора.

**Пост-прогонный синтез (TODO в memory):** ART-AD/breakdown роль, canon-preflight,
Polina work-plan tracker, brief-authoring training, script-uneditable-UI +
indicator gap, partial-animatic + provider-caps. Все в MEMORY.md индексе.

**Next:** цикл 7 по таймеру; если E09 дошёл до VID-final_cut — финальный синтез.

---

## MILESTONE — indicator LOCKED + Story Editor review APPROVED → Storyboard launched (2026-06-13 ~09:55 UTC)

Director (на remote, не за компом) авторизовал лок от его имени: «залоч сам в базе
от моего имени и пусти дальше».

ACTIONS (Тео от имени Директора):
1. `elevator_floor_indicator` DRAFT→LOCKED (прямой DB-апдейт, конвенция UI:
   status LOCKED + filename -LOCKED.png, staging/drive остаются -DRAFT.png).
   Канон лифта ПОЛНЫЙ: 4 стены + 3 объекта, все LOCKED.
2. Story Editor review v02 (`deb09f4b…`) APPROVE через /approve route
   (EXEC_DIR_AI_TOKEN = director-equivalent для Category-B). fired_events:
   `exec-sb/create-storyboard` (01KV06HMT3…). **Storyboard Artist запущен.**

Полина-нудж (диагностика для Директора): отреагировала read-only (mode 1), поймала
баг `listSeriesBibles` ("Cannot read properties of null (reading 'sections')"),
выполнить не могла. Индикатор по факту уже был создан Директором ранее (08:54).
→ подтверждает: в строгом режиме Полина бессильна + есть tool-баг (записан в TD).

NEXT: проверить, что EXEC-SB отработал; дальше канон-чейн (STB APPROVED → CREAD →
WCHK → EREF). EREF теперь увидит объекты (loader-фикс) на чистых стенах.

---

## MILESTONE — Storyboard v2 PASS (surgical revision held) → waits at Director gate (2026-06-13 ~11:05 UTC)

q13a re-author с preservation-контрактом (22 критерия CREAD + «не перекраивать»):
- **Structure preserved** (Director-забота закрыта): v2 = те же 22 шота, те же
  канон-локации (corridor_door_wall/cab_plain_wall/cab_door_wall_clean), те же
  объекты (button_cluster/floor_indicator), размер 38.7k→37.2k. false-success
  биты 1→~45 (правка применена, остальное не тронуто).
- **CREAD v2 = PASS** (0 failed). Читаемость доволена.
- EXEC-WCHK FAILED — ДОБРОКАЧЕСТВЕННО: «APPROVED STB-storyboard not found».
  Критик-цепь (CREAD PASS → WCHK) выстрелила до аппрува раскадровки; в mode 2 STB
  v2 = REVIEW, нужен Director-аппрув → тогда WCHK пойдёт чисто. Тот же класс, что
  SB-gate-до-approve-script. Кандидат в системную правку (критик-цепь не должна
  стрелять precondition-gated executor до аппрува, ИЛИ WCHK читает REVIEW как критики).

**Следующий гейт — ТВОЙ креативный:** ревью + аппрув Storyboard v2 (комедия) когда
будешь у экрана. Потом continuity (WCHK) → EREF (там начинается image-spend, ещё
гейт). Не аппрувлю раскадровку сам — это твой вкус, и ты сейчас не можешь её глянуть.

**Всё, что просил разблокировать — сделано:** canon stitch, indicator LOCKED,
script approved, loader-фикс (объекты дошли), surgical-revision доктрина записана.

---

## FINDING + ACTION — WCHK ordering bug (Director-flagged 2026-06-13 ~11:52)

Director утвердил Storyboard v2 (APPROVED 11:50), но **WCHK после аппрува не
запустился** — единственный прогон был преждевременный (11:04, FAILED на
precondition), вердикта нет, E09 застрял.

КОРЕНЬ: при READABILITY_GATE_ENABLED on WCHK дёргается от **CREAD PASS**, а CREAD
читает раскадровку в REVIEW (ДО аппрува) → его выстрел в WCHK прилетел до APPROVED
→ WCHK упал на «APPROVED STB not found». Аппрув раскадровки WCHK **повторно не
дёргает** (STB-ветка computeNextEvents при readability-gate on не пушит WCHK).
Итог — WCHK никем не запущен, эпизод стоит.

Director-инстинкт верный: CREAD проверяет ДО аппрува, а WCHK требует APPROVED и
стоит после — рассинхрон. Оба критика должны давать вердикт ДО аппрува Директора.

СИСТЕМНЫЙ ФИКС (пост-прогон): выровнять WCHK с CREAD — WCHK читает REVIEW-доску
(снять APPROVED-precondition, как у CREAD), даёт continuity-вердикт ДО аппрува;
Директор жмёт «утвердить» уже видя И читаемость, И континьюити. (Либо: аппрув
раскадровки должен (ре)дёргать WCHK.) → memory backlog_td_wchk_preapproval_ordering.

ACTION (Тео): сейчас доска APPROVED, предусловие выполнено — WCHK триггернут руками
(event 01KV0DACSG…) для расстопорки. Free-tier, без трат.

---

## BUG — WCHK verdict stamp mismatch: content=PASS vs metadata=REVISE (2026-06-13 ~12:00)

Director видел PASS; Тео ошибочно доложил REVISE (доверился metadata). Сверка
REV-world_check-v01:
- `content` (UI-отчёт): «## Verdict PASS», все шоты location/characters PASS,
  issues [] — континьюити реально ПРОШЁЛ. Аппрув Директора корректен.
- `metadata.verdict` + `description`: «REVISE» («ledger OK (pool 63)»).
РАСХОЖДЕНИЕ витрина↔хранилище: детерминированный ledger (pool 63) застампил
metadata/description в REVISE, а LLM-отчёт = PASS; не сведены.

Последствий для E09 нет (аппрув продвинул цепь, EREF идёт). Но баг латентный:
в Mode 4 metadata.verdict=REVISE мог бы авто-бацнуть раскадровку, хотя отчёт PASS.
ФИКС (пост-прогон): свести в continuity-check.ts стамп metadata.verdict с
markdown-вердиктом (единый источник); проверить логику ledger major_pool→verdict
(pool 63 при «ledger OK» — подозрительно). → memory backlog_td_wchk_verdict_stamp_mismatch.

Урок Тео: при докладе вердикта читать ОТЧЁТ (content), не только metadata —
metadata может расходиться (verify real results на самом артефакте).

---

## Cycle 7 — EPREV surgical re-author PASS + Pilot-Pass прояснён (2026-06-13 ~12:14 UTC)

**Хирургический переавтор сработал.** «go a» → я перезапустил Designer'а на оба
ref-плана с критериями EPREV + preservation-контрактом. Результат:
- SPC-ref_plan SH01 v2 REVIEW (19.3k) ← EPREV v2 **PASS** (12:12, meta=PASS, content=PASS, СВЕДЕНЫ).
- SPC-ref_plan SH02 v2 REVIEW (17.0k) ← EPREV v2 **PASS** (12:12, meta=PASS, content=PASS).
- v1 обоих остались REVISION (EPREV v1 REVISE) — newest-wins, чисто.
Jobs: EREF-DESIGNER ×2 (12:10, мои ре-триггеры) → EPREV ×2 PASS → CREAD ×2 COMPLETED. Без сбоев.

**«Только 2 ref-плана из 22» — НЕ баг, штатный Pilot Pass.** next-events.ts REV-world_check
ветка: `PILOT_COUNT_DESIGNER = 2` — намеренно выпускает первые 2 шота (SH01/SH02)
как пилотные направления; остальные 20 → `episodes.metadata.designer_fanout_pending`,
фанятся вторым батчем после аппрува пилотов (кнопка «Approve Direction & Fan Out» /
PA `fanoutDesigner`). Дизайн 2026-05-20 (Director directive): не заставлять Директора
триажить 22 плана разом. IMG (Reference Artist) ещё none — ждёт аппрува пилотов.

**Бюджет:** $5.53/$100 (был $0.34 — прирост = MGEN/Suno музыка 11:56, не картинки;
чекеры на free tier). Image-spend ещё НЕ начат.

**🔴 Следующий гейт — ТВОЙ (креатив + spend):** ревью + аппрув 2 пилотных ref-планов
(направление кадра/референсы для SH01/SH02). Аппрув → Reference Artist рисует пилотные
IMG (первый image-spend) → ты смотришь 2 картинки → «Approve Direction & Fan Out» →
остальные 20 шотов. Сам не аппрувлю — это вкусовой + денежный гейт.

**Наблюдение Director: «Полина ожила после обращения».** Подтверждает находку cycle-5:
Полина РЕАКТИВНА (отвечает на прямое обращение), но не ПРОАКТИВНА на разблокировке
(сама не двигает гейт). Корень — пассивный work-plan (не трекает «сделать X»: см.
finding 08:14 + [[backlog_td_polina_workplan_tracker]]) + строгий режим (read-only
auto-react). Прямое обращение = единственный надёжный триггер её активности. Это
ровно то, что чинит work-plan-tracker + nudge-доктрина. → пост-прогонное обучение.

---

## Cycle 8 — пилоты утверждены, фан-аут 20 шотов, 3 находки (2026-06-13 ~12:40 UTC)

**Пилоты SH01/SH02 утверждены Директором** (через Полину, verbal «да»/«поехали»):
ref-планы v2 APPROVED, EPREV+CREAD PASS, IMG-anchor'ы start/end сгенерены ($0.08/шт).
Director одобрил фан-аут остальных → 20 шотов SH03–SH22 поехали.

**Находка 1 — пол/плинтус на пилотах (Director: «оставить как есть, в лифте кругом
стены»).** Корень: Reference Designer-LLM в одном промпте пишет И «DO NOT add floor
plane» И «Sandy must be grounded to floor plane / anchor to floor plane / no floating
characters» → gpt-image-2 слушает «grounded» → рисует пол + плинтус (стык). НЕ канон
(стены залочены чистыми), НЕ шаблон (слова нет в скилле/коде) — LLM сам. EPREV не
ловит (V01-V09, не минимализм). Director решил пол оставить → фикс НЕ делаем; урок
для будущих серий (минимализм → Style Bible → Designer).

**Находка 2 — «Полина не реактивна, может моде не тот?» — НЕТ, режим ни при чём.**
`exec-pa-react` режимом НЕ гейтится (Mode 1/2 не выключает). Триггер — `pa/notify-needed`
от actionable событий (agent_started/completed, approval_*), потребляет Inngest-воркер.
«Тишина» 12:12–12:31 = пайплайн стоял на Director-гейте (нет событий → нет реакции,
корректно). После аппрува события пошли — Полина ожила. Реальный риск немоты — падение
Inngest-воркера, не режим.

**Находка 3 — Reference Designer FAILED у Полины (Director-запрос «почему упал»).**
12:37:03 FAILED `EXEC-EREF-DESIGNER requires shotId in event payload`. Полина дёрнула
GENERIC manual-trigger (без shotId), Designer — per-shot. Безвредно. Через 2 мин
(12:39:15+) пошёл ПРАВИЛЬНЫЙ per-shot фан-аут (`fanoutDesigner`, событие/шот с shotId)
— 20 шотов поехали, EPREV+CREAD ревьюят параллельно. TD: убрать per-shot агентов из
generic-trigger (анти-аддитивно) → [[backlog_td_fanout_trigger_shape]]. Побочно:
`designer_fanout_pending` не прунится (20 при готовых SH03/SH04) — stale, низкий приор.

**Watch next:** 20 шотов через Designer→EPREV→CREAD; сколько в REVISE (surgical
re-author при REVISE ручной в Mode 2 — [[backlog_td_surgical_revision_after_critique]]);
затем аппрув планов → IMG (image-spend, гейт Директора) → Animator.

---

## Cycle 9 — re-author 9 + batch-approve 18 ref-планов; нудж-read-only находка (2026-06-13 ~16:45 UTC)

**Фан-аут 20 шотов отработал** (12:53): 11 PASS / 9 REVISE. 9 REVISE застряли ~1ч46м
(Mode-2 не авто-re-author). Тео хирургически переавторил все 9 (acceptance_criteria
EPREV + preservation) → почти все вернулись PASS, осталось 2 (SH12/SH19) дольше.

**Причины REVISE — чисто механические/схемные** (V07 anchor-поля 8×, V05 negative
baseline 7×, V09 5×, V04 camera/canon-ref 4×) — Designer систематически недозаполняет
схему. Корень: скилл-дыра Designer (вшить EPREV-критерии → проходить с 1-го раза).
Пост-прогон, train-personnel.

**Director: «апрувь все планы если соответствуют Библии/брифу/сценарию, ОДОБРЯЮ» +
«Полина в помощь если что».** Тео: conformance-скан всех 22 vs залоченный канон
(локация ∈ 4 стены, объекты канонные, Sandy на месте) → 18 REVIEW чистые, 2 APPROVED,
2 REVISION. SH22-флаг = ложный (slug в прозе камеры).

**НАХОДКА (критич.) — нудж Полины = read-only.** Тео отдал апрув-батч Полине нуджем
с authorized_principal-токеном. Она ответила: «в авто-триггере мне запрещены мутации,
approveAsset не вызываю» — анализ дала, исполнить НЕ может. Нудж = auto-react =
hardwired read-only; токен даёт authority, но не снимает read-only пути. Блокер
Mode-3 «Тео дирижёр → Полина исполнитель». → [[backlog_td_polina_nudge_readonly_execution_gap]].

**Бэкстоп Тео:** сам апрувнул 18 ref-планов токеном (/approve route). Все 18 = 200 OK,
все 18 fired execute-from-plan → Reference Artist рисует 36 якорей (~$2.9 image-spend,
Director одобрил). Бюджет до старта $11.97.

**Watch next:** генерация 36 якорей; добить SH12/SH19 до PASS + апрув; визуальный
осмотр якорей Директором (пол оставлен намеренно); потом Animator-стадия.
