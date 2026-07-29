# Аудит звена БРИФ → СЦЕНАРИЙ → РАСКАДРОВКА · SS-S15-E33 «Sandy & the Baby-Timer»

Дата аудита: 2026-07-28. Только чтение. Источники: выгрузка `e33dump/` + контракты/схемы репозитория.

---

## 1. Вердикт по времени суток

**Время суток в эпизоде ОДНО и НЕ МЕНЯЕТСЯ — ночь. Массовая правка «везде ночь» была направлена ВЕРНО. Но применена не на том слое, и не она причина плоского дневного результата.**

1. Слово **«ночь» встречается в ВСЕЙ цепочке ровно ОДИН раз** — в брифе: «**One room at night**: a low bed for Sandy, a small crib, a soft pool of warm light, everything else in shadow» (бриф, стр. 17). В сценарии слова `night` **нет ни разу**. В раскадровке v03 — **ни разу**. Проверено `grep` по всем трём файлам: единственное вхождение — брифовское; все `dark` в сценарии/STB — это «**dark** rubber-hose limbs», описание конечностей, не свет.
2. Ни бриф, ни сценарий, ни раскадровка **не содержат ни одного признака дня** — ни окна с дневным светом, ни утра, ни «просыпается по будильнику». Замысел монотонный: одна ночь, одна лампа. Правка «везде ночь» ничего не ломала.
3. Атмосфера дожила до STB **только как проза в 2 шотах из 9**: SH01 «one warm pool of teal-desk-lamp light, **the rest of the bedroom in shadow**» и SH09 «warm teal-desk-lamp light **pooled over both characters**». Остальные **7 шотов не говорят о свете вообще ничего**.
4. **Формат раскадровки не имеет поля времени суток и света.** Живой контракт (`storyboarder@v2`, форма JSON в `webapp/lib/agents/runners/storyboarder.ts:384-414`) содержит `shot_id, camera_angle, location{slug,sub_area}, characters, expected_gag, props_in_frame, action_prose, duration_seconds, key_beat, vertical_safe, continuity_notes` — **и всё**. Слово `lighting` встречается там ровно один раз, как подсказка внутри свободного текста: `"continuity_notes": "<what must match the prior shot — pose, prop state, lighting>"`. При этом `specs/schemas/shot.md:54-55` объявляет `time_of_day: string # REQUIRED — MORNING | DAY | ... | NIGHT` и `lighting_condition: string # REQUIRED`. **Спека требует, контракт не реализует.**
5. **Плоскость и «день» приходят не из текста, а из ЛОКАЦИОННОГО РЕФЕРЕНСА.** Действующее LOCKED-описание `sandy_bedroom_continuity` вообще **не содержит секции про свет и время суток**; референсная картинка локации сгенерирована с прямой инструкцией «**neutral natural lighting**» (v1) и жёстким негативом «**no cinematic lighting**» (v3), а стилевой канон S15, который вклеивается в каждый шот-промпт, добавляет «**no heavy photoreal texture or dramatic cinematic lighting**». Ночь не может пробиться сквозь этот стек, сколько бы «NIGHT INTERIOR» ни дописывали в ref_plan.
6. Следствие отсутствия поля: каждый ref_plan сочинял свет заново и получился **разнобой** — SH01/SH03/SH04/SH06/SH07v03 «NIGHT INTERIOR», SH02 «intimate night-light quality», SH05 «night-light warmth», а **SH07 v01/v02 — «Top-lit, soft cartoon ambient light, cream ceiling bounce», SH08 — «soft, graphic», SH09 — только «lamp ON»**, без ночи. Это и есть та дыра, которую оркестратор заклеивал вручную по 5 планам.

---

## 2. Таблица «шот → время суток → свет» (STB v03, 9 шотов)

| Шот | Время суток задано? | Свет описан? | Дословно (всё, что есть о времени/свете) |
|---|---|---|---|
| SH01 | **НЕТ** | **ДА** | «Wide establishing frame holds crib and Sandy's platform bed together in **one warm pool of teal-desk-lamp light, the rest of the bedroom in shadow**.» `props_in_frame` содержит `teal_desk_lamp` |
| SH02 | НЕТ | НЕТ | — (ни слова о свете; `props_in_frame: ["sandy_bed"]`) |
| SH03 | НЕТ | НЕТ | — |
| SH04 | НЕТ | НЕТ | — |
| SH05 | НЕТ | НЕТ | — |
| SH06 | НЕТ | НЕТ | только оптика: «Medium frame, **camera slightly low**» — про свет ничего |
| SH07 | НЕТ | НЕТ | — |
| SH08 | НЕТ | НЕТ | — |
| SH09 | **НЕТ** | **ДА** | «Medium frame, **warm teal-desk-lamp light pooled over both characters** at centre of room» + «**The teal_desk_lamp glows soft over both.**» |

**Итог: 0 из 9 — время суток; 2 из 9 — свет; 7 из 9 — молчание.**
Плюс регресс v02→v03: в v02 в `assumptions` была строка «The teal desk lamp is the sole warm light source **across every shot** (brief atmosphere note)». **В v03 эта строка удалена** — последняя формулировка «свет один на весь эпизод» исчезла из артефакта.

---

## 3. Расхождения

| # | Звено | Что именно | Цитата-источник | Цитата-приёмник | Тяжесть |
|---|---|---|---|---|---|
| 1 | формат STB | В контракте раскадровки нет полей времени суток и света, хотя схема шота их требует | `specs/schemas/shot.md:54` «time_of_day: string # **REQUIRED** — MORNING \| DAY \| ... \| NIGHT»; `:55` «lighting_condition: string # **REQUIRED**» | `storyboarder.ts:414` «"continuity_notes": "<what must match the prior shot — pose, prop state, lighting>"» — единственное упоминание света во всей форме | **CRITICAL** |
| 2 | сценарий→STB | 4-й флип (наклон в 45°) **не показан** — причина ушла за кадр между SH05 и SH06 | Сценарий SC04: «Baby Timer **grabs Sandy's side** rather than his base and **tips at an angle**. Sandy ends up propped at a steep 45°». Бриф: «**The transition between the two IS the joke.** Every flip must show the sand reacting» + «All causes are **external**: the baby acts on Sandy» | STB SH06 `action_prose` начинается с готового факта: «Sandy **is propped** at a steep 45-degree diagonal»; `continuity_notes`: «as a direct consequence of the tilt caused by Baby-Timer **between shots**» | **CRITICAL** |
| 3 | сценарий→STB | Из v03 **полностью исчез** твёрдый канон-гардрейл «стекло герметично / контур не рвётся» (в v02 он был) | Бриф: «Sandy's glass stays whole in every beat: **no cracks, no spills, no sand outside the body, outline never broken**» | STB v02 SH08: «outline stays closed, no cracks, no spills — **CANON HARD RULE**». В v03 слов `crack / sealed / spill / outline` — **0 вхождений** | **CRITICAL** |
| 4 | бриф→сценарий | Потеряно единственное указание времени суток | Бриф: «**One room at night**: a low bed for Sandy, a small crib, a soft pool of warm light, everything else in shadow» | Сценарий SC01 *Location:* «warm pool of lamplight, everything else in shadow» — слово `night` **отсутствует** во всём сценарии | **HIGH** |
| 5 | сценарий→STB | SH01 превращён в **статичный стоп-кадр**: действие «укладывает малыша → на цыпочках → ложится сам» вырезано | Сценарий SC01: «Sandy stands at a small crib. **He lowers Baby Timer gently**, horizontal... Sandy **watches**, then **tiptoes backward**... He **reaches the bed and lowers himself**» | STB SH01: «Baby-Timer **lies** horizontal inside the crib rails... Sandy **lies** horizontal on his side... Both sand states: STILL. Silence. Peace.» — ни одного глагола действия. (В v02 действие ещё было.) | **HIGH** |
| 6 | сценарий→STB | В цикле «баррикада» Сэнди **ни разу не ложится** → эскалация теряет смысл отказа во сне | Сценарий SC04: «He steps back, dusts his rubber-hose hands together with satisfaction, and **lies down**» | STB SH05: «Sandy **stands at frame-edge**, having just finished building the wall, dusts his rubber-hose mitts together with a satisfied nod, gold sand still **STREAMING**» — он стоит и уже «включён» | **HIGH** |
| 7 | бриф→канон→сценарий | Конфликт «бриф vs LOCKED-канон» по локомоции малыша не эскалирован, а «примирён» ревьюером; докатился до STB v01 | Бриф: «It does not walk so much as **toddle-roll, using its rounded lower bulb**». LOCKED `baby_timer`: «Locomotion is a **frantic side-to-side waddle**... drops to all fours and crawls» — переката нет | Сценарий SC02: «Baby Timer has **rolled its rounded lower bulb over the crib rail**»; SC04: «**bowling** neatly through the lowest gap». Script-QA: «the brief authorises this move» — то есть выбрал победителя вместо HALT | **HIGH** |
| 8 | сценарий→STB | Предписание Script-QA завести слуг и карточку кроватки ДО раскадровки — проигнорировано | Script-QA: «**Before storyboard opens**: assign a canonical prop slug (e.g. `baby_crib`) and create a minimal locked object card... Without a prop slug, the storyboard and reference stages **will invent their own crib design**» | STB v03 `assumptions`: «A small rounded-rail crib is present... as an **episode-local prop** — the location Bible does not list it explicitly». В `props_in_frame` кроватки нет **ни в одном** из 9 шотов | **HIGH** |
| 9 | сценарий→STB | Пик (спин) урезан с 7 с до 4 с | Сценарий SC05 `duration_seconds: 7` | STB SH07 `duration_seconds: 4` | MED |
| 10 | бриф→STB | Ритм не ускоряется: длительности циклов 5 → 3 → 7 → 4 с (третий цикл — самый длинный) | Бриф: «progressively **shorter cycles** as the flips speed up, a chaotic peak on the spin» | STB v03: SH02+SH03=5 с, SH04=3 с, SH05+SH06=7 с, SH07=4 с | MED |
| 11 | сценарий→STB | В SH04 в 3 секунды упаковано 4 действия (донести → уложить → добежать → лечь → быть перевёрнутым) | Сценарий SC03 — те же действия за 4 с | STB SH04 `duration_seconds: 3`; `continuity_notes`: «the sequence of carry→tuck→lie→get-flipped is **compressed into one shot**» | MED |
| 12 | бриф→STB | Смысл гэга баррикады смещён: «просто перекатился» → «залез, покачался и УПАЛ» | Бриф: «The baby **simply rolls over it**» (соль — лёгкость, стена не была стеной) | STB SH05: «grips the top edge with both mitten-fists, **hauls itself up**... teeters at the crest... and **TOPPLES forward** down the outside face in a wide-legged tumble» | MED |
| 13 | внутри STB v03 | Песок малыша объявлен «STILL» во всех шотах, включая падение (SH05) и вращение (SH07) — рушится общая песочная грамматика; автор сам это заметил словом «somehow» | Бриф: «The sand line is the primary comedy instrument — **every beat must show its state**» | STB SH07: «Baby-Timer's bell-ears clang with each rotation... cream sand **somehow still calm** inside its own body». (В v02 было наоборот: «cream sand **sloshes gently** with the walk cycle») | MED |
| 14 | бриф→канон | Цвет песка малыша: бриф противоречит LOCKED-канону; бриф так и не поправлен | Бриф: «Sand is a **lighter, brighter gold** than Sandy's» | LOCKED `baby_timer`: «warm **cream** interior sand». STB v03 выбрал канон и задокументировал — правильно, но бриф остался с ложным утверждением | MED |
| 15 | бриф→сценарий | Сценарий APPROVED со «синим песком», хотя дефект найден | Script-QA (MINOR): «'pale-blue sand' contradicts both the bible and the brief and will cause an **incorrect render**» | Сценарий SC06 остался: «Baby Timer's **pale-blue sand** lurches left, right, left» — статус APPROVED, правка не внесена | MED |
| 16 | сценарий→STB | Выход из 45°-наклона тоже за кадром | Сценарий SC05: «Sandy **extricates himself** from the 45° lean with a full-body wobble and stands upright» (в v01 это был отдельный SH09) | STB SH07 `continuity_notes`: «Sandy has extricated himself from the 45° lean **between shots**» | MED |
| 17 | сценарий→STB | Ремарка сценария «лампа притухает» (маркер «режим сна») нигде не воспроизведена | Сценарий SC01: «**The teal desk lamp dims.**» (и assumption: «visual shorthand for sleep mode») | STB v03 — нет; притухание лампы отсутствует. (В v01/v02 было: «The teal desk lamp **dims a touch**») | LOW |
| 18 | STB v01 (устранено) | Арифметика: заявлено 30 с, по факту 33 с | STB v01 summary: «12 shots, **30 seconds total**» | STB v01 JSON: `"total_duration_s": 33`; сумма шотов = 33. Исправлено в v02/v03 (обе = ровно 30) | LOW |
| 19 | библия→бриф | Библия сериала §10 разрешает Сэнди трескаться и протекать; бриф жёстче | Библия S15 §10: «трескается, скалывается... **начинает протекать**» | Бриф: «Sandy's glass body is **sealed**. Sand never escapes» | LOW (бриф строже — легитимное ужесточение, но канон не синхронизирован) |

**Чистые участки — без расхождений:** количество групп эскалации (бриф 6 → сценарий 6 сцен → STB все 6 закрыты); панч (surrender-reversal воспроизведён дословно, включая финальный образ «оба стоят, оба идут»); хронометраж 30 с (сценарий 4+4+4+5+7+6 = 30; STB v03 3+2+3+3+3+4+4+3+5 = 30); отсутствие диалогов/текста; каст (только `sandy_hourglass`, `baby_timer`, `sandy_bedroom_continuity` — совпадает с episode_cast); «причины всегда внешние» — Сэнди нигде не разрушает себя сам.

---

## 4. Где дефект родился

**#1 (CRITICAL) — время суток и свет не являются полем раскадровки.**
Уровень: **формат артефакта**. Схема `specs/schemas/shot.md` объявляет `time_of_day` и `lighting_condition` REQUIRED, а живой контракт `storyboarder@v2` их не содержит — расхождение спеки и реализации. Усугубляется тем, что критик континьюити имеет ось `lighting_canon`, но его инструкция (`continuity-check.ts:313-316`) велит ставить **N/A**, если шот про свет молчит, — то есть проверка, которую молчание всегда проходит (7 из 9 шотов получили N/A/пропуск). **Чинится процессом**, не данными: добавить `time_of_day` + `lighting` в форму шота, унаследовать значение по умолчанию из брифа на весь эпизод и заставить `lighting_canon` считать отсутствие поля FAIL, а не N/A. Правка 5 шот-планов вручную — лечение симптома на пятом слое.

**#2 (CRITICAL) — 4-й флип за кадром.**
Уровень: **исполнитель (EXEC-SB) при попустительстве критиков**. Бриф прямо объявляет переход единственной шуткой, сценарий показывал захват за бок и наклон — раскадровщик, ужимая 12→9 шотов, выбросил само действие и оставил результат. Критик readability при этом поставил R03/R04 PASS и написал «the 45° wedge is **explained** by Baby-Timer's action between shots» — то есть засчитал закадровое объяснение как показанное следствие. **Чинится процессом**: инвариант «каждая группа эскалации обязана содержать кадр с ПРИЧИНОЙ, а не только с результатом» + запрет критику принимать `continuity_notes` как замену действию в кадре.

**#3 (CRITICAL) — исчез гардрейл герметичности.**
Уровень: **исполнитель**, потеря при перезаписи версии (v02 → v03 «стекло не трескается» просто выпало). Раскадровка — прямой донор текста в промпты, и на пике (спин) генератор теперь не получает запрета на трещины и высыпание песка. **Чинится процессом**: hard-guardrails брифа обязаны переноситься в каждую версию STB как невырезаемый блок (или отдельным полем), а не жить в свободной прозе, где переписывание версии их теряет.

**#4 (HIGH) — потеря слова «ночь» на переходе бриф→сценарий.**
Уровень: **формат артефакта**. У сценария тоже нет поля времени суток — есть только `location: "sandy_bedroom_continuity — crib corner and bed, warm pool of lamplight"`. Атмосфера выжила описательно, термин — нет, и дальше передавать было нечего. **Чинится данными + процессом**: одно эпизодное поле `time_of_day` в брифе, наследуемое по всей цепочке; сегодня оно ниоткуда не наследуется, каждый слой пересочиняет.

**#5 (HIGH) — SH01 стал неподвижной картинкой.**
Уровень: **исполнитель**. Директорская директива «слить SH01+SH02 в один кадр» была понята как «показать результат обоих», а не «сыграть оба действия в одном кадре». Подтверждается ниже по цепочке: shot_plan SH01 — «both remain **fully stationary**... the only perceptible motion is the faint warm glow of the teal desk lamp». Три секунды без движения на хуке Shorts противоречат и брифу («earn the silence» — но это про тишину, не про стоп-кадр), и библии сериала §4 («каждые 3–7 секунд — действие/гэг»). **Чинится процессом**: при слиянии шотов требовать сохранения глаголов действия обоих исходных шотов; постусловие «в кадре ≥1 глагол действия, кроме финального холда».

**#6 (HIGH) — Сэнди не ложится в цикле «баррикада».**
Уровень: **исполнитель**. Побочный эффект той же компрессии: чтобы уместить постройку стены и её провал в 3 с, вырезали «и лёг». Но именно «лёг» делает 45° наказанием, а не случайностью. **Чинится процессом**: инвариант цикла эскалации «желание → попытка → отказ» должен проверяться поштучно (сегодня readability-критик проверяет «false-success beat», что близко, но его вердикты по этому эпизоду трижды подряд игнорировались).

**#7 (HIGH) — конфликт бриф↔канон по локомоции не эскалирован.**
Уровень: **процесс ревью**. Script-QA увидел расхождение и **сам выбрал победителя** («the brief authorises this move») вместо HALT + эскалации. Ошибка дожила до STB v01 и была снята только ручной директорской заметкой. **Чинится процессом**: правило «конфликт двух источников истины = HALT, а не примирение» уже сформулировано в правилах авторства скиллов, но в контракте `script_reviewer@v1` не имеет исполнительной силы.

**#8 (HIGH) — кроватка без слуга и без референса.**
Уровень: **процесс (гейт не блокирующий)**. Script-QA выдал корректное предписание «до открытия раскадровки», но вердикт был PASS, поэтому предписание ни на что не влияло. Итог: главный новый предмет эпизода (кроватка) проходит все 9 шотов как свободный текст, и каждый ref_plan рисует её заново («a rounded-rail bassinet / small crib... **transient staging prop**»). **Чинится процессом**: предписание «сделать до следующей стадии» должно физически блокировать следующую стадию, иначе это заметка на полях.

---

## 5. Реквизит раскадровки v03

**Каноничные слуги, объявленные в `props_in_frame` (6):**
- `sandy_bed` — SH01, SH02, SH03, SH04, SH06
- `coral_orange_cushion` — SH01, SH05
- `teal_desk_lamp` — SH01, SH09
- `small_wooden_desk` — SH01
- `yellow_rug` — SH01, SH07, SH08
- `round_side_table` — SH06

**Упомянуто в прозе, но НЕ объявлено в `props_in_frame`:**
- **crib / bassinet** — «a rounded-rail bassinet at frame-left», «the small crib», «crib rails». **Нет канон-слуга, нет референсной картинки, нет карточки.** Единственный полностью новый предмет эпизода — и он вне системы.
- **oversized cream bed pillow** — материал баррикады в SH05 (часть карточки `sandy_bed`: «one oversized cream pillow»), отдельным слугом не заведён.
- **cream mattress** (SH01) — часть `sandy_bed`.

**Костюм/атрибуты `baby_timer` (из LOCKED-карточки персонажа, не реквизит сцены):** chrome bell-ears, mitten-fist hands, soft booties. В прозе v03 присутствуют. **Не упомянуты в v03** (хотя канон их объявляет обязательными): белый тканевый подгузник, коралловая булавка, соска на ленте.

**Каноничные объекты локации, которые есть в LOCKED-референсе комнаты и в LAYOUT LOCK каждого ref_plan, но раскадровкой НЕ названы ни разу:** `mirror_vanity` (трюмо — по карточке локации это «the main story object for the episode» и фокус композиции), `low_bookshelf`, окно, дверь.

**Предметов вне канона серии, кроме кроватки, раскадровка не вводит.**
