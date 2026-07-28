# E — Канон против цепочки. SS-S15-E33 «Sandy & the Baby-Timer»

Аудит только по данным дампа `e33dump`. Только чтение. Дата: 2026-07-28.

---

## Вердикт

1. **Требования задавать свет и время суток НЕТ НИГДЕ в Библии** — ни в стиль-каноне, ни в живом теле локации, ни в общей идее. И в контракте раскадровки `storyboarder@v2` нет поля под это. «Дневной кадр» — легальный выход системы, а не ошибка исполнителя.
2. **Правка 23 июля исправила только ТЕЛО стиль-канона.** Тело действительно 2.5D/3D и именно оно ушло во все 17 промптов. Но плоские формулировки остались в ~25 других канонах (все 8 предметов спальни + сам Сэнди), и планировщики копируют их в промпт дословно: «Flat opaque fills … No gradients».
3. **Картинка стиль-канона так и осталась плоской.** `image_prompt.current_version = 1`, и этот промпт гласит «2D flat cartoon only. Zero 3D. Zero volumetric lighting.» Текст починили, визуальный якорь — нет.
4. **Кроватка несёт три гэга из девяти и не имеет канона вообще** — ни карточки, ни слага, ни цвета, ни позиции. Её сознательно провели МИМО системы ассетов: план SH04 прямо пишет «crib is handled via prompt description, not a canon prop slug».
5. **LOCKED-канон Сэнди физически обрезан посреди предложения** на 5191 символе. В нём нет ни герметичности, ни цельного плинтуса, ни «скользит, а не шагает» — зато прямым текстом есть ступни и walk cycle. Доктрина физики Сэнди в Библию так и не приземлилась.

---

## Дыры каста

`SPC-episode_cast-v01-APPROVED` объявляет ровно три позиции — `sandy_hourglass`, `baby_timer`, `sandy_bedroom_continuity` — и декларирует: «Anything not listed is scoped OUT of every downstream stage». В кадре при этом 9 дополнительных объектов. Контракт каста — мёртвая буква: слой предметов проходит мимо него целиком.

| предмет/персонаж | где появляется | канон есть? | несёт гэг? | тяжесть |
|---|---|---|---|---|
| **crib / bassinet** (кроватка) | SH01 (тablo), SH04 (укладывание), SH05 (баррикада), SH02/SH06 фоном | **НЕТ.** Нет ассета, нет слага, нет в `objects[]` ни одного плана. Живёт только прозой в промпте | **ДА — 3 гэга**: базовая точка «оба спят», отнёс-уложил-мгновенный реванш, стена из подушек вокруг кроватки | **CRITICAL** |
| `mirror_vanity` (трюмо) | инжектится LAYOUT LOCK'ом во **все 9** планов (2–6 упоминаний каждый) | Канон ЕСТЬ, но он от ЧУЖОГО эпизода | Нет. В раскадровке E33 отсутствует полностью | **HIGH** — канон локации объявляет его «the main story object for the episode» и «focal object of the composition»; модели во всех 9 кадрах велено ставить в центр комнаты крупный предмет, которого в истории нет |
| `sandy_bed`, `yellow_rug`, `small_wooden_desk`, `teal_desk_lamp`, `low_bookshelf`, `round_side_table`, `coral_orange_cushion` | все 9 планов через LAYOUT LOCK | Канон есть (LOCKED-карточки) | `teal_desk_lamp` — да (единственный источник света и герой финала), `round_side_table` — да (держит Сэнди под 45°), `coral_orange_cushion` — да (баррикада) | **MEDIUM** — канон есть, но ни один не внесён в `episode_cast`; т.е. пройти проверку полноты каста они не могли в принципе |
| «oversized cream pillow» (стена из подушек, SH05) | SH05 | Покрыт каноном `object_sandy_bed` («one oversized cream pillow») | да, часть баррикады | **LOW** — дыры нет |

**Про кроватку — как именно её пронесли.** Раскадровка v03, `assumptions[0]`: *«A small rounded-rail crib is present in sandy_bedroom_continuity as an episode-local prop — the location Bible does not list it explicitly but permits it under 'ready for a physical comedy gag' provisioning.»* Раскадровщик САМ обнаружил дыру, САМ себе выдал разрешение, сославшись на фразу «комната готова к физической комедии» — и пошёл дальше. План SH04, `policy_notes`: *«crib is a script-introduced transient prop … it is not in the location's standing canon but is allowed per LAYOUT LOCK carve-out (c)»* и *«objects[] is empty — crib is handled via prompt description, not a canon prop slug»*.

Последствие механическое: у кроватки нет слага → к промпту не подмешивается её референсная картинка → в каждом кадре она рисуется с нуля. Ни одного HEX, ни материала, ни позиции: в SH01 это «rounded-rail bassinet at frame-left», в SH05 — «crib side rails». Это единственный предмет в кадре без цветового контракта, тогда как у всех восьми канонных предметов прописан и HEX, и материал, и место. Дрейф между кадрами гарантирован конструкцией.

---

## Стиль-канон дословно

Файл: `canon-SS-S15-SBL-style_s15_style_canon_2d_v1-v01-LOCKED.png.md`, тело обновлено 2026-07-23.

### Про объём — живое тело канона

> **§1 Direction:** «Clean cartoon silent physical comedy in the spirit of The Pink Panther, **rendered in a 2.5D/3D cartoon style: dimensional volume and soft shading are fine** as long as every frame still reads as a single graphic statement in under one second».

> **§3 Palette:** «Fills read as clean, saturated cartoon colour. **Simple shading and gentle gradients are allowed to give soft volume (as in a 3D cartoon render)**; just avoid busy photoreal texturing that muddies the silhouette.»

> **§6 Texture & Finish:** «Output is a clean cartoon finish — **a 2.5D/3D render in cartoon style is expected and fine**, as long as it stays graphic and reads clearly.»

### Про свет — живое тело канона

> **§4 Lighting (целиком):** «Soft, simple cartoon lighting. Gentle shading, light ambient occlusion, and a simple soft drop shadow are all fine — keep them subtle and graphic, never heavy photoreal or dramatic cinematic lighting. Shadow can be a simple darker shape within palette (e.g. `#D4A032` against `#F5C96A`) or a soft shadow; ground shadow beneath characters is a simple soft oval.»

Это всё. §4 описывает **манеру** света (мягкий, не драматичный) и **не содержит ни одного слова** о времени суток, источнике света, направлении ключа, интерьере/экстерьере, дне/ночи. Поиск по телу: `time of day`, `night`, `day`, `key light`, `lamp`, `practical` — **ноль вхождений**.

### Прямой ответ: тянет ли стиль-канон в плоский 2D?

**Его живой текст — НЕТ. Три сопутствующих артефакта — ДА.**

- **Тело — чистое.** Проверено по факту, а не по чтению: во всех 17 собранных промптах (`prompts/SH*.md`) блок «Series art direction» содержит формулировку `2.5D/3D cartoon style` и **ни одного** вхождения старого `Flat 2D silent physical comedy`. Правка 23 июля до генерации доехала.
- **Имя ассета — тянет.** `style_s15_style_canon_2d_v1`, файл `SS-S15-SBL-style_s15_style_canon_2d_v1-v01-LOCKED.png`. Токен `2d` едет вместе с каждой ссылкой `source_bible_refs` и с именем файла-референса. Это не смертельно, но это постоянный шум в сторону плоского, и человек, читающий индекс канона, видит «2d».
- **Сама картинка — тянет сильнее всего.** `image_prompt.current_version = 1`, единственная версия от 2026-05-20, и её промпт содержит блок «Absolute hard rules»: «**2D flat cartoon only. Zero 3D. Zero CGI render. Zero volumetric lighting. Zero ambient occlusion. No gradients on characters or main shapes.**» плюс «§4 Lighting: Fully flat.» 23 июля переписали текст и **не перегенерировали изображение**. Визуальный якорь всей серии — по-прежнему карточка плоского 2D.
- **Метаданные рассинхронизированы.** `description_history.current_version = 1`, и содержимое этой версии — **полный старый текст** «Canonical 2D Style Sample Card / Flat 2D silent physical comedy / §4 Lighting: Fully flat. Zero ambient occlusion». Тело правили напрямую, в историю новую версию не добавили. Любой потребитель, читающий `description_history` вместо тела, получит плоский 2D.

---

## Следы flat-2D

Правка 23 июля прошла по стиль-канону, по хард-негативам локации-спальни и по `character_stapler` (там теперь честно написано «soft cel-shaded (gentle shading is fine — this is not flat 2D)»). Остальное не тронули. Ниже — то, что реально попадает в промпты E33.

| канон | цитата | попадает в E33? |
|---|---|---|
| `character_sandy_hourglass` §2 | «fully transparent flat glass, rendered as a clean closed outline **with no interior volume shading**» | **ДА, все 9 кадров** |
| `character_sandy_hourglass` §8 | «**Fills: Flat opaque only.** … one line, **no gradient**» · «preserving the transparent read **without any gradient or multiply layer**» | **ДА, все 9** |
| `object_sandy_bed` | «All fills flat and opaque. **Zero gradients. Zero texture noise.**» | ДА |
| `object_yellow_rug` | «All fills flat and opaque. **No gradients. No highlights.**» | ДА |
| `object_teal_desk_lamp` | «All fills are flat and opaque. **No gradients.**» | ДА |
| `object_small_wooden_desk` | «All fills are flat and opaque… reads as form **without requiring gradients**» | ДА |
| `object_round_side_table` | «**No gradients.** … **No ambient occlusion**, no texture grain» | ДА |
| `object_coral_orange_cushion` | «All fills are fully flat and opaque. **Zero gradients.**» | ДА |
| `object_low_bookshelf` | «All fills flat and opaque. **No gradients.**» | ДА |
| `object_mirror_vanity` | «**No gradients.** Mirror face uses a flat two-zone split» | ДА |
| `location_empty_background` | «zero gradient, zero texture, zero shadow plane, **flat 2D**» | нет (не в E33) |
| `location_efirium` | «в традиции **flat 2D** geometry» · «**No gradients.**» | нет |
| `location_car_wash_interior`, `location_elevator_cab_door_wall_clean`, `location_padel_court`, `character_golden_chronometer`, `character_inspector_stopwatch`, `character_vending_machine`, `object_car_wash_car`, `object_elevator_*`, `object_gym_equipment`, `object_leash`, `object_padel_*`, `object_smartphone`, `object_suitcase`, `object_treat_bag` | те же «flat and opaque / no gradients / no ambient occlusion» | нет, но серия ими живёт |

**Это не теория — так и вышло в промпт.** В `prompts/SH03-v1.md` (и в SH02, SH04, SH07) собранный текст содержит буквально: «Flat opaque fills: Sandy Gold #F5C96A, … **No gradients**» и «Soft oval ground shadow under Sandy. **No gradients**». Планировщик взял формулировку не из стиль-канона (там её больше нет), а из канонов персонажа и предметов. Счётчик по промптам: SH03-v1 — 10 таких строк, SH04-v1 и SH07-v1/v2 — по 8, SH07-v3 — 6, SH02-v1 — 3.

Итог: **стиль-канон говорит «мягкий объём и лёгкие градиенты — норма», а канон Сэнди и все восемь предметов спальни в том же промпте говорят «плоско, без градиентов». Модель получает оба приказа в одном тексте.**

---

## Канон локации ↔ планы

Живое тело `location_sandy_bedroom_continuity` фиксирует 8 объектов и floor-plan. Важно: **в живом теле нет ни секции освещения, ни списка камер**. И то и другое существует только в `description_history` v1 — то есть в мёртвой исторической записи, а не в действующем каноне.

Что потеряно при переписывании карточки:
- **§3 Palette & Lighting** — «Light source is a single window on the back wall… **Time of day is unspecified and must never change between cuts.**» Заметьте: даже старая версия времени суток не назначала, она его явно объявляла неопределённым.
- **§7 Visual Canon — Four Locked Camera Angles** (CAM-A `wide_full`, CAM-B `door_pov`, CAM-C `corner_high`, CAM-D `close_bed`) с правилом «All four angles must show the same window position, same door position, and the same floor pattern». Планы E33 выбирают ракурсы свободно, ни один не ссылается на CAM-A..D.

### Расхождения по объектам

| объект | канон локации (позиция) | планы `objects[]` | расхождение |
|---|---|---|---|
| `sandy_bed` | вдоль **левой** стены, изголовье к задней | SH01 объявляет; в LAYOUT LOCK SH01 стоит «**at right side of frame, along the right wall**» | **Позиция перевёрнута.** Кроватка ушла влево, кровать — вправо. Канон говорит «bed along the left wall» |
| `yellow_rug` | центр пола, прямоугольный | SH01, SH07 | ок |
| `small_wooden_desk` | правая стена | SH01 | ок |
| `teal_desk_lamp` | на столе | SH01 | **SH09: в раскадровке `props_in_frame: ["teal_desk_lamp"]`, в плане `objects[]` пуст.** Лампа — единственный источник света эпизода и герой финального кадра — выпала из объявленного списка; в `policy_notes` это списано как «set-dressing locked via spatial anchor» |
| `low_bookshelf` | задняя стена | только SH01 | в 8 из 9 планов не объявлен, хотя в LAYOUT LOCK описан |
| `round_side_table` | у изножья кровати / край ковра | SH01, SH05, SH06 | ок, SH06 использует его как опору для позы 45° — правильно |
| `coral_orange_cushion` | на кровати | SH01, SH05 | в SH05 подушки переехали на бортики кроватки; план это честно помечает как «script-motivated transient move» |
| `mirror_vanity` (трюмо) | **«middle zone of the room… It is the focal story object»** | SH01 объявляет в `objects[]`; в LAYOUT LOCK инжектится во **все 9** | **Придумано не этим эпизодом.** Канон локации содержит постановочную задачу чужого эпизода («characters can plausibly push it», «must read as heavy but movable»). В E33 трюмо не участвует ни в одном гэге |
| **crib** | **отсутствует** | **ни в одном `objects[]`** | **придумано планами и раскадровкой** |

### Забыли объявить

`objects[]` пуст в SH02, SH03, SH04, SH08, SH09 — пять планов из девяти. Он зеркалит `props_in_frame` раскадровки, а тот в свою очередь неполон: у SH01 в `props_in_frame` пять предметов из восьми, что стоят в кадре по LAYOUT LOCK. Итог: **объявленный список предметов и реально нарисованный список расходятся в 6 кадрах из 9**, и кроватки нет ни в одном из них.

---

## Канон Сэнди ↔ цепочка

### Что канон говорит дословно

**Колба и песок** (§2): «Sandy's body is a classic double-bulb hourglass, **fully transparent flat glass**, rendered as a clean closed outline **with no interior volume shading**. … Bright Sandy Gold (`#F5C96A`) sand fills both chambers — upper chamber always partially empty, lower always partially full… The sand line shifts with gravity during physical gags (tilting, flipping, spinning), providing a built-in physical comedy instrument.»

**Конечности** (§2): «Limbs are classic rubber-hose style: dark-grey (`#2A2A2A`), slightly tapered, **no elbow or knee joints**, fully flexible and stretchable. Hands are small, simple rounded rubber-hose mitts with no separated fingers… **Feet are small, simple rounded rubber-hose feet, modest in size.** Overall body height reads as 4.5 heads tall.»

**Движение** (§5): «Default posture: leaning slightly forward, **weight on the balls of his feet**… **Walk cycle is a bouncy, fast-stepping trot** with the lower bulb wobbling gently on each step. … Rubber-hose physics apply at all times: limbs can extend to three times normal length, spiral, and snap back within a single second.»

### Чего в каноне НЕТ — и это главное

Поиск по всему телу канона Сэнди: `seal`, `hermetic`, `plinth`, `slide`, `glide`, `external`, `crack`, `leak`, `spill` — **ноль вхождений** (кроме слова `feet`/`walk`, см. выше).

- **Герметичности нет.** Ни слова о том, что колба запаяна и песок не покидает тело.
- **Цельного плинтуса нет.** Основание не описано вообще.
- **«Скользит, а не шагает» — нет, и канон говорит ПРЯМО ПРОТИВОПОЛОЖНОЕ**: ступни есть, walk cycle есть, вес на подушечках стоп.
- **«Причины всегда внешние» — нет.** Такого правила в каноне не существует.
- **Текст обрывается посреди предложения.** Индекс: `len=5191`; тело кончается на «**Shadow:** A single flat **Warm Ochre `#D4A032`** shape beneath the lower bulb» — без точки, без §9 и далее. `description_history` пуст (0 записей), восстановить нечем. Если правила герметичности/основания когда-то были в §9–§10 — их в живом каноне больше нет.

**И общая идея санкционирует разгерметизацию явно.** `general_idea_main` §10 «ФИЗИКА ТЕЛА СЭНДИ»: «Но при сильных ударах или перегрузках: — трескается, — скалывается, — покрывается паутиной трещин, — **теряет кусочки корпуса**, — **начинает протекать**, — звенит, — или **временно раскалывается**.» То есть Библия прямо разрешает то, что доктрина считает запрещённым.

### Нарушения в раскадровке v03 и 9 планах

**По ЖИВОМУ канону — нарушений нет.**

- Разгерметизации нет ни в одном кадре: песок везде внутри, переходы состояний STILL → LURCH → STREAM → TRICKLE → WHIPPING описаны как движение внутри колбы. План SH08 прямо требует «outline stays closed, no cracks, no spills».
- Ступни у Сэнди по канону есть — SH04 «speed-tiptoes back to his bed», SH02/SH04 ходьба, SH09 «bends, scoops, straightens» каноничны.
- Резиновые конечности соблюдены: SH07 «dark rubber-hose limbs extend outward at full cartoon length» — ровно §5 «limbs can extend to three times normal length».
- Причины действительно внешние во всех девяти кадрах: каждый переворот, наклон 45° и раскрутку инициирует Baby-Timer, не Сэнди. SH09 — единственное собственное действие Сэнди, и это выбор, а не физика.

**По ДОКТРИНЕ (памятка «SEALED bulb + цельный плинтус, скользит а не шагает, причины внешние») — нарушения были бы в SH02, SH04, SH09** (ходьба, «speed-tiptoes», «weight on the balls of his feet» в промптах). Но виноват тут не исполнитель: **он выполнил ровно то, что написано в LOCKED-каноне.** Доктрина в Библию не приземлена, и канон ей противоречит текстом.

---

## Дыра «освещение»

### Прямой ответ: кто ОБЯЗАН задавать время суток?

**Никто. В системе нет роли, обязанной это делать, и нет поля, куда это записать.**

Проверено по всем трём уровням:

| источник | есть требование задать время суток / источник света? |
|---|---|
| **Стиль-канон** `style_s15_style_canon_2d_v1` §4 Lighting | **НЕТ.** Описывает только манеру («soft, simple cartoon lighting»). Слов `time of day`, `night`, `day`, `key light`, `lamp` — ноль |
| **Канон локации** `sandy_bedroom_continuity`, живое тело | **НЕТ.** Секции освещения в живом теле вообще нет |
| **Канон локации**, `description_history` v1 (мёртвая) | Была одна фраза — и она снимает требование: «**Time of day is unspecified** and must never change between cuts» |
| **Общая идея** `general_idea_main` (16 разделов) | **НЕТ.** Ни одного упоминания света. §13 «Визуальный стиль» — «простота, читаемость, силуэты, жирные контуры»; §15 «Мир и локации» — «фоны не должны отвлекать» |
| **Контракт раскадровки** `storyboarder@v2` | **НЕТ ПОЛЯ.** Поля шота: `shot_id`, `camera_angle`, `shot_role`, `location{slug,sub_area}`, `characters[]`, `expected_gag`, `props_in_frame[]`, `action_prose`, `duration_seconds`, `key_beat`, `vertical_safe`, `continuity_notes`. Ни `lighting`, ни `time_of_day` |
| **Критик** `world_check` | **НЕТ ПРОВЕРКИ.** Ставит `lighting_canon: N/A` — «no lighting detail in shot» — то есть фиксирует отсутствие и классифицирует его как «неприменимо», а не как дефект |

### Как это сработало в E33 — точная механика

Свет в E33 задан **не системой, а прозой раскадровщика, и только в 2 кадрах из 9**:
- **SH01** — `sub_area: "…warm lamplight pool"`, проза: «one warm pool of teal-desk-lamp light, **the rest of the bedroom in shadow**»;
- **SH09** — проза: «warm teal-desk-lamp light pooled over both characters».
- **SH02–SH08 — в раскадровке про свет НЕТ НИ СЛОВА.**

Дальше девять планировщиков разошлись, потому что вход у семерых был пустой:

| план | что написано про свет | ночь? |
|---|---|---|
| SH01 v01 | «night interior, bedroom in shadow EXCEPT for a warm teal-tinged pool… no other active light sources» | ✅ |
| SH02 v01 | «soft, low, intimate night-light quality. No overhead light… One back-wall window (dark, night)» | ✅ |
| SH03 v01 | «NIGHT INTERIOR… no overhead light, no daylight, the back-wall window reads dark» | ✅ |
| SH04 v01 | то же, но **текст продублирован дважды в одной строке** — склейка шаблона | ✅ (грязно) |
| SH05 v01 | «soft top-lit interior night warmth… **single warm overhead source**» | ⚠️ ночь есть, но «overhead source» **противоречит** «no overhead light» из SH03/SH04/SH08 и «lamp is the ONLY practical light source» из SH09 |
| SH06 v01 | «NIGHT INTERIOR… the back-wall window reads dark **Sandy's glass body catches**…» — предложение оборвано и склеено со следующим | ✅ (битая строка) |
| **SH07 v01** | «**Top-lit, soft cartoon ambient light, cream ceiling bounce. Gentle warm-neutral fill**» | ❌ **ночи нет вообще** |
| **SH07 v02** | «**soft top-lit cartoon lighting**, cream walls #FFF8EC» | ❌ **ночи нет вообще** |
| SH07 v03 | «soft NIGHT INTERIOR… no daylight» — восстановлено | ✅ |
| SH08 v01 | «NIGHT INTERIOR… no overhead light, no daylight» | ✅ |
| SH09 v01 | «no window light (night); the lamp is the ONLY practical light source» | ✅ |

**Вывод по дыре.** Дефект «дневные кадры» родился ровно там, где вы предполагали — **в отсутствии обязательного поля**. Ночь в E33 держится на копировании текста между планами, а не на контракте. У SH07 — единственного кадра, где раскадровка не упомянула ни лампу, ни тень, и который стоит дальше всех от SH01, — планировщик подставил дефолт своей модели («top-lit cartoon lighting, ceiling bounce») и получил дневной свет. Два раза подряд, v01 и v02, прежде чем это исправили в v03. Никакой гейт этого не поймал: критик на SH07 поставил `lighting_canon: N/A`.

**Кто должен быть обязан.** Дырка одна, а закрыть её можно на двух уровнях, и они не взаимозаменяемы:
- **Канон локации** обязан объявить допустимые световые состояния (`day` / `night_lamp` / …) как перечисление — сейчас он не объявляет ни одного;
- **Раскадровка** обязана в каждом шоте выбрать одно из них обязательным полем — сейчас поля нет, и выбор утекает в свободную прозу, где он теряется.

---

## Что пропустил world_check

Проверка отработала дважды: v01 → REVISE, v02 → PASS. Ни одна из найденных выше дыр ею не поймана. Это дефект критика, не исполнителя.

**1. Кроватку не увидел ни разу.** v01 проверял `props_in_frame`, а кроватки там не было никогда — она жила в `sub_area` и `action_prose`. Проверка ограничена одним полем и слепа к прозе. Между тем в самой раскадровке, в `assumptions[0]`, признание написано открытым текстом: «the location Bible does not list it explicitly». Критик читал этот же документ.

**2. Проверка предметов в v01 дала 100% ложных срабатываний.** Она пометила «not confirmed in the locked Bible inventory» шесть предметов: `sandy_bed`, `coral_orange_cushion`, `teal_desk_lamp`, `small_wooden_desk`, `round_side_table`, `yellow_rug`. **Все шесть — LOCKED-ассеты серии, и все шесть поимённо перечислены в самой карточке локации** в блоке «Locked object references to preserve». Шесть шумных промахов, ноль попаданий. Инвентарь предметов критик просто не читает.

**3. В v02 проверку предметов удалили целиком.** В v01 у каждого шота была строка `props_in_frame:`; в v02 её нет ни у одного — остались только `location_canon` / `characters_canon` / `lighting_canon` / `appearance_canon`. Шумную проверку не починили, а выключили — и вместе с ней исчез единственный механизм, который теоретически мог поймать кроватку. Вердикт после этого перевернулся в PASS.

**4. v02 проверял НЕ ТОТ артефакт.** В JSON: `"storyboard_version": 2`, десять шотов, включая `S15-E33-SH10`. Утверждённая раскадровка — **v03, девять шотов, SH10 не существует**. Критик поставил PASS раскадровке, которой нет в проде, и финальную версию не видел вообще.

**5. Отсутствие света зафиксировал и списал.** `lighting_canon: N/A` в 8 из 10 шотов, с формулировкой «no lighting detail in shot» (SH02). Критик буквально заметил, что света нет, и назвал это «неприменимо». По его собственным правилам он прав — требования-то нет; в этом и дефект.

**6. Вернул PASS на заведомо неполных данных.** Собственная приписка в конце v02: «⚠️ **Extraction не удался** — state-ledger пропущен: Expected fenced ```json block… (stop_reason=max_tokens). **Вердикт основан только на canon-membership проверках.**» То есть критик сам объявил, что проверил только принадлежность персонажей и локации к канону — и всё равно выдал PASS вместо HALT.

**7. Стиль не проверял вообще.** Ни одной проверки на плоский 2D против 2.5D. Промпты SH02/SH03/SH04/SH07, где рядом стоят «2.5D/3D cartoon style» и «Flat opaque fills… No gradients», прошли без замечаний.

**8. Физику Сэнди не проверял.** `appearance_canon` везде PASS или N/A, при том что живой канон Сэнди обрезан посреди предложения и не содержит правил герметичности и основания. Обрыв LOCKED-канона — сам по себе повод для HALT, и его никто не заметил.

---

## Сводка по тяжести

**CRITICAL**
1. Кроватка несёт 3 гэга из 9, канона нет, слага нет, цвета/материала/позиции нет; проведена мимо системы ассетов сознательно (`policy_notes` SH04).
2. Требования задавать время суток и источник света нет ни в одном каноне и нет поля в контракте раскадровки → «дневной кадр» легален. Подтверждено на SH07 v01/v02.
3. LOCKED-канон Сэнди обрезан на 5191 символе посреди предложения; `description_history` пуст; правил герметичности, основания и «внешних причин» в живом каноне не существует, а ступни и walk cycle — существуют.

**HIGH**
4. Плоские формулировки остались в каноне Сэнди и во всех 8 предметах спальни и физически доехали до промптов («Flat opaque fills… No gradients» в SH02/03/04/07) — прямое противоречие исправленному стиль-канону в одном и том же тексте.
5. Картинка стиль-канона не перегенерирована: `image_prompt` v1 = «2D flat cartoon only. Zero 3D. Zero volumetric lighting». Визуальный якорь серии плоский.
6. `description_history` стиль-канона и канона локации рассинхронизированы с телом: `current_version = 1` хранит старый flat-2D текст стиля и утраченные секции локации (освещение + CAM-A..D).
7. Канон локации навязывает всем 9 кадрам трюмо как «main story object for the episode» — постановочная задача чужого эпизода, в E33 не участвует.
8. world_check: PASS выдан по раскадровке v2 (10 шотов), тогда как утверждена v03 (9 шотов). Финальный артефакт не проверялся.
9. world_check: проверка предметов дала 6 ложных срабатываний из 6 в v01 и была удалена в v02 вместо починки.

**MEDIUM**
10. `episode_cast` объявляет исключительную область из 3 позиций, но 8 канонных предметов + кроватка проходят мимо неё; контракт «Anything not listed is scoped OUT» не исполняется.
11. `objects[]` пуст в 5 планах из 9; `teal_desk_lamp` выпал из SH09, будучи единственным источником света и героем финала.
12. Позиция кровати: канон — левая стена, LAYOUT LOCK SH01 — правая.
13. SH05 «single warm overhead source» противоречит «no overhead light» в SH03/04/08 и «lamp is the ONLY practical light source» в SH09.
14. Битые/дублированные строки освещения в планах SH04 и SH06 — склейка шаблона.
15. Имя ассета стиль-канона содержит `2d`.
16. Из живого канона локации утрачены четыре зафиксированных ракурса CAM-A..CAM-D; планы выбирают углы свободно.
