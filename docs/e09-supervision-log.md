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
