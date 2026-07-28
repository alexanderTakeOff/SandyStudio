# F — Где рождается дефект «плоско и днём» (E33)

> Аудит только чтением. Ничего не правил. Репозиторий: `C:\SandyStudio\.claude\worktrees\showrunner-pragmatic-c77b43`.
> Даты/строки — на момент 2026-07-28.
> **Отчёт наложен на РАНТАЙМ** (дамп артефактов E33 в `../`), а не только на статику. Это меняет вердикт.

---

## Вердикт (5 строк)

1. **Гипотеза «раскадровка не обязана указывать время суток → дизайнер не получил → провайдер додумал день» — ЧАСТИЧНО ОПРОВЕРГНУТА.** Дырка в схеме реальна (`time_of_day` = **0 вхождений во всём `webapp/`**), но на E33 она **не сработала**: дизайнер вывел ночь из `action_prose` сам, и в промпте, ушедшем провайдеру, стояло `lighting: … night warmth; low ambient bedroom lighting (nighttime)` (`prompts/SH05-v1.md`, блок `[Location]`).
2. **Настоящее место рождения — КАНОН-ПЛАСТИНЫ (референсные картинки), а не текст.** Стилевой якорь `SBL-style_s15_style_canon_2d_v1` имеет `image_prompt.current_version: 1` — картинка отрисована **2026-05-20** по промпту «**2D flat cartoon only. Zero 3D. Zero volumetric lighting. Zero ambient occlusion**». Текст канона поправили 2026-07-23 на 2.5D/3D — **картинку не перегенерили**.
3. **Локационная пластина — тот же дефект по второй оси.** Текущая (v3, `2026-05-20T09:29`) пластина `SBL-location_sandy_bedroom_continuity` отрисована по промпту «**flat 2D cartoon style … warm cream walls**» — то есть плоская И светлая.
4. `openai-edits-multi` взвешивает **приложенную картинку** сильнее текста. План говорит «ночь, комната в тени», две приложенные пластины показывают «плоская светлая кремовая комната» — картинки побеждают. Именно поэтому правка текста канона Оркестратором **не могла** помочь.
5. **Ни один критик в цепочке не проверяет свет/время суток/объём на ВЫХОДНОЙ картинке.** EXEC-EPREV (V01–V09), EXEC-CREAD (R01–R06), EXEC-VCRIT — все прошли PASS на E33 при заведомо дневном плоском кадре.

---

## Карта ответственности

| Параметр | Кто ОБЯЗАН задать | Где это записано | Реально задаётся? |
|---|---|---|---|
| **Время суток (сцена)** | Сценарист **EXEC-SW** | `specs/schemas/script.md:42` — `time_of_day: string # REQUIRED — MORNING\|DAY\|…\|NIGHT`; `agents/exec/storyboarder.md:203` «time_of_day: # from script scene exactly» | **НЕТ.** Живой контракт `scenes_v1` поля не содержит: `specs/contracts/screenwriter@v1.yaml:47-56`, `webapp/lib/agents/runners/screenwriter.ts:248-262` |
| **Время суток (шот)** | Раскадровщик **EXEC-SB** (копирует из сцены) | `specs/schemas/shot.md:54` — `time_of_day: string # REQUIRED`; `agents/exec/storyboarder.md:91, :203` | **НЕТ.** `storyboarder@v2` живой шейп поля не просит: `webapp/lib/agents/runners/storyboarder.ts:383-414`; `specs/contracts/storyboarder@v1.yaml:51-58` |
| **Формулировка освещения шота** | Раскадровщик **EXEC-SB**, выводит из World Bible | `specs/schemas/shot.md:55-56` + Rule 5 (`:129`); `agents/exec/storyboarder.md:91, :204, :279` | **НЕТ.** Единственный след — свободный текст `continuity_notes` («…pose, prop state, lighting», `storyboarder.ts:414`), и он **не доезжает** до дизайнера |
| **Базовое освещение локации** | World Builder / Bible **ART-WB** | `agents/artistic/world_builder.md:59` `lighting_default:`; `webapp/lib/agents/runners/bible-author.ts:109` «Palette & lighting — dominant colours, light sources, **time of day if fixed**» | **Частично.** Текст канона есть, но **пластина локации отрисована по «flat 2D … warm cream walls»** (v3, 2026-05-20) |
| **Объёмность (flat / volumetric)** | Стилист **EXEC-STY** в Style Bible | `agents/exec/style_creator.md:111` `shading_approach:`; `bible-author.ts:133` «**Lighting** — flat / volumetric / dramatic» | **Текст — ДА (2.5D/3D с 07-23). Картинка — НЕТ**, стилевой якорь застыл на flat-2D, `current_version: 1` |
| **Дизайнер референсов EXEC-EREF** | **НЕ имеет права задавать** — только читать | `CLAUDE.md §11` правило 8 (PARAMETER COMPLETENESS AT GATE); `agents/exec/episode_reference_designer.md:319` «lighting: Bible-defined baseline + **shot.time_of_day override**» | **Вынужденно додумывает.** Поле `shot.time_of_day` не приходит никогда, HALT не срабатывает (см. ниже) |

---

## 1. Схема раскадровки — поле есть на бумаге, нет в рантайме

**Бумажные схемы требуют поле:**
- `specs/schemas/script.md:42` — `time_of_day: string # REQUIRED — MORNING | DAY | AFTERNOON | EVENING | NIGHT` внутри `scenes[]`.
- `specs/schemas/shot.md:54` — `time_of_day: string # REQUIRED`.
- `specs/schemas/shot.md:55-56` — `lighting_condition: string # REQUIRED — from World Bible lighting rules`.
- `specs/schemas/shot.md:129` (Rule 5) — «`lighting_condition` must derive from the World Bible's lighting rules for that location».

**Живые контракты поле потеряли — на ОБОИХ уровнях:**
- Сценарий: `specs/contracts/screenwriter@v1.yaml:47-56` — `scenes[]` = `scene_id, act, characters, location, action, beats, duration_seconds`. Ни `time_of_day`, ни `lighting`.
- Тот же шейп в живом промпте: `webapp/lib/agents/runners/screenwriter.ts:248-262`.
- Раскадровка: `specs/contracts/storyboarder@v1.yaml:51-58` — `shot_id, camera_angle, location, action, characters_present, duration_seconds, key_beat, continuity_notes`. Поля нет.
- Живой промпт `storyboarder@v2`: `webapp/lib/agents/runners/storyboarder.ts:383-414`. Поля нет. Единственное упоминание света — внутри свободного текста: `storyboarder.ts:414` — `"continuity_notes": "<what must match the prior shot — pose, prop state, lighting>"`.

**Парсер отбросил бы поле, даже если бы модель его выдала:**
- `webapp/lib/api/vgen-shot-helpers.ts:60-97` — `interface StoryboardShotV2`: нет `time_of_day`, нет `lighting_condition`.
- `webapp/lib/api/vgen-shot-helpers.ts:134-175` — `shotToV2()` собирает объект по белому списку ключей. Ключа `time_of_day` в списке нет → поле молча теряется.

**Пруф по всей кодовой базе:**
```
$ grep -rna "time_of_day" webapp/ --include=*.ts --include=*.tsx | grep -v node_modules | wc -l
0
```
**Пруф по фактическим артефактам E33** (`e33dump/`): `grep -rli "time_of_day" .` → **0 файлов**. Ключи шота в `body-SS-S15-E33-STB-storyboard-v03-APPROVED.md.md`: `shot_id, shot_role, camera_angle, location{slug,sub_area}, characters[...], expected_gag, expected_action, expected_emotion, props_in_frame, action_prose, duration_seconds, key_beat, continuity_notes, vertical_safe`. Времени суток нет. Слов `night`/`lighting` в раскадровке **0**; есть только `lamp` (7×) и `dark` (3×) внутри прозы.

> **Вывод по п.1:** структурная дыра подтверждена. Требование существует только в бумажных схемах (`script.md`, `shot.md`), которые **ничего не исполняют** — рантайм их не читает. Это классический «мёртвый контракт».

---

## 2. Инструкция сториборд-художника — требует, но её не спрашивают

`agents/exec/storyboarder.md` требует свет прямым текстом:

- `:91` — «Lighting rules per location and time_of_day → populate `lighting_condition:`»
- `:203` — «`time_of_day:` # from script scene exactly»
- `:204` — «`lighting_condition:` # derived from World Bible lighting rules for this location + time_of_day»
- `:279` (Step 5, внутренний QA) — «| Lighting conditions match World Bible rules | World Bible | Derive correctly from location + time |»

**Но `storyboarder.md` — это system prompt, а JSON-шейп задаётся user-сообщением** (`storyboarder.ts:372-449`), и в шейпе поля нет. Модель отдаёт то, что просят в шейпе. Инструкция требует поле, контракт его не принимает — расхождение между двумя половинами одного промпта. Ровно тот же разрыв, что в п.1.

---

## 3. Сборка промпта дизайнера референсов — по шагам

**Что дизайнер видит про шот** (`webapp/lib/agents/runners/episode-reference-designer.ts:546-555`, блок `<shot>`):
```
shot_id, shot_role, camera_angle, duration_seconds,
action_prose, expected_gag, expected_emotion, characters_present
```
**Чего в блоке НЕТ:** `time_of_day`, `lighting_condition`, `continuity_notes` (в котором по контракту живёт свет), и даже **`location`** — ни слуга, ни sub_area.

**Откуда локация всё-таки приходит:**
- `locationSlug` фигурирует ТОЛЬКО в секции пространственного якоря (`:610-614`) — как имя для поиска предыдущего APPROVED-рефа, не как описание места.
- Полное описание локации приходит одним свободным текстом из канона: `webapp/lib/agents/bible-loader.ts:212-227` (`formatBibleForPrompt` → `### Locations` → `l.description` + `l.content`). Структурного поля «свет» там нет — что автор канона написал прозой, то и приедет.

**Откуда должен браться свет по инструкции дизайнера** (system prompt грузится с диска: `episode-reference-designer.ts:271-290`, читает `agents/exec/episode_reference_designer.md`):
- `agents/exec/episode_reference_designer.md:319` — `[Location … - lighting: Bible-defined baseline + shot.time_of_day override]`
- То же продублировано в скилле: `.claude/skills/eref-designer/SKILL.md:154` — «lighting: Bible baseline + **shot.time_of_day** override».

> **Ключевой разрыв:** живой системный промпт и активный скилл ссылаются на `shot.time_of_day`, которого в user-сообщении нет и быть не может.

**Что происходит, когда времени суток нет нигде — HALT НЕ срабатывает:**
`agents/exec/episode_reference_designer.md:155-162` (Step 0 — Pre-flight) перечисляет обязательные входы: STB APPROVED, Bible LOCKED, персонажи, локация, delivery_targets, скилл, прошлые EREF. `:162` — «If any mandatory input missing → emit `canon_extension_proposed` activity_event, **STOP**». **Времени суток в этом списке нет**, поэтому STOP не наступает. Дизайнер молча продолжает и **додумывает** свет из `action_prose` + описания локации — то есть делает ровно то, что запрещено `CLAUDE.md §11` правилом 8 («execution agents are pure functions… may not inject, assume, or default any creative parameter»).

**LAYOUT LOCK — откуда:** генерится кодом, а не каноном. Условие — одна ось `locationHasSpatialLayout` (`episode-reference-designer.ts:463-469`):
- SET (есть геометрия) → `:396` «`prompt` MUST include a LAYOUT LOCK preamble citing scene_master as the canonical layout».
- FIELD (`spatial_layout=false`) → `:397` и `:646-653` — LAYOUT LOCK запрещён.
- Сам мастер-плейт: `buildAnchorChainSections` `:362-370`.
LAYOUT LOCK фиксирует **геометрию**, про свет в нём нет ни слова — что и видно в `prompts/SH01-v1.md` и `prompts/SH05-v1.md`.

**РАНТАЙМ-ПРОВЕРКА (это опровергает исходную гипотезу):**
Дизайнер на E33 **справился без поля**. Планы, которые Оркестратор НЕ трогал (`SPC-ref_plan-…-SH05`, created `16:48:52` / updated `16:49:14` — 22 секунды, ручной правки не было; `SH09` — created `16:50:53` / updated `16:51:17`), уже содержат ночь:

- `SH05` → `lighting: soft top-lit interior night warmth; low ambient bedroom lighting (nighttime); single warm overhead source; gentle soft shadows underside of bulbs`
- `SH09` → `lighting: teal_desk_lamp ON — warm teal pool … soft, low, interior`
- `SH01` (created 16:33) → `lighting: night interior, bedroom in shadow EXCEPT for a warm teal-tinged pool cast by the teal_desk_lamp`

И финальный промпт, ушедший в `openai-edits-multi` (`prompts/SH05-v1.md`, `history[0]` at `16:56:08`), содержит и правильный свет, и **правильный стиль**:
```
lighting: soft top-lit interior night warmth; low ambient bedroom lighting (nighttime); …
[Style] … Simple soft shading for volume allowed (2.5D cartoon), never photoreal texture …
```
→ **Текст был правильный. Картинка вышла плоской и дневной. Значит дефект не в тексте.**

---

## 4. Хардкод стиля — где «плоское 2D» стоит мимо канона

### 4a. Главное: КАНОН-ПЛАСТИНЫ (это и есть причина E33)

| Артефакт | Пруф | Опасность |
|---|---|---|
| Стилевой якорь `SBL-style_s15_style_canon_2d_v1` | `e33dump/canon-SS-S15-SBL-style_s15_style_canon_2d_v1-v01-LOCKED.png.md` → `image_prompt.history[0] at 2026-05-20T05:58`, `"current_version":1`, `style_anchor_asset_id` = сам себе. Промпт: «**2D flat cartoon only. Zero 3D. Zero CGI render. Zero volumetric lighting. Zero cinematic depth of field. Zero ambient occlusion.**» | **CRITICAL.** Текст канона поправлен 07-23 на «2.5D/3D … dimensional volume and soft shading», **картинка не перегенерена**. К каждой генерации прикладывается плоская пластина. Это ровно `memory/canon_inplace_image_swap_bump_freshness` |
| Пластина локации `SBL-location_sandy_bedroom_continuity` | тот же дамп, `image_prompt` v3 at `2026-05-20T09:29`: «Sandy bedroom establishing production reference, **flat 2D cartoon style**, … **warm cream walls**». v2 at `09:13`: «**flat 2D cartoon** production design, **warm cream background**, … **no 3D, no CGI, no gradients**» | **CRITICAL.** Одна пластина тянет обе оси сразу: плоскую заливку И дневной кремовый свет. Ни одна текстовая правка канона на неё не влияет |
| Слаг стиля | `type=SBL-style_s15_style_canon_2d_v1` — «**2d**» вшито в имя ассета | MEDIUM. Имя цитируется в каждом промпте (`prompts/SH05-v1.md`: «S15 STYLE CANON v1 (**s15_style_canon_2d_v1**)»), подсказывая модели «2d» |
| Генератор пластины локации | `webapp/lib/agents/runners/bible-author.ts:230` — «Render as a clean establishing reference of the empty location — no characters present, **neutral natural lighting**, …» | **HIGH.** Дневной свет захардкожен в сам генератор канон-пластин. Локация никогда не может быть каноничеки ночной |

### 4b. Хардкод в коде

| Файл:строка | Цитата | Опасность |
|---|---|---|
| `webapp/lib/api/vgen-shot-helpers.ts:579-580` | `const POSITIVE_STYLE = 'Vibrant colours, smooth comedic timing, expressive **2D animation**, clean line art.'` | **HIGH.** Дописывается в КОНЕЦ каждого видео-промпта (`:764` `segments.push(\`Style: ${POSITIVE_STYLE}\`)`) поверх канона |
| `webapp/lib/api/vgen-shot-helpers.ts:744` | `const setting = '**2D animated comedy short.**';` — и это **первый** сегмент промпта (`:747`) | **HIGH.** Первая фраза, которую читает видео-модель, объявляет 2D |
| `webapp/lib/agents/runners/on-model-detector.ts:142-145` | `style_ok — … FALSE on a clear medium break (photoreal / **3D** / wrong art style).` | **CRITICAL (инверсия).** On-model-гейт обязан ЗАВАЛИТЬ корректный по канону 2.5D/3D кадр. Критик воюет с каноном |
| `webapp/lib/agents/runner.ts:664` | `'Stylised **2D animation**, muted palette, cinematic 16:9 framing.'` (`buildAnimaticPrompt`) | MEDIUM. Фолбэк-аниматик мимо канона |
| `webapp/lib/agents/runner.ts:674` | `'Vibrant **2D animation**, dynamic action, comedic timing, …'` (`buildShotPrompt`) | MEDIUM. Фолбэк-шот мимо канона |

### 4c. Хардкод в инструкциях и скиллах

| Файл:строка | Цитата | Опасность |
|---|---|---|
| `agents/exec/episode_reference_designer.md:324-325` | `[Style — verbatim from Bible style_canon (e.g. "S14 STYLE CANON v1.1: outline-only pencil edge, **flat vector fills**, no hatching, …")]` | **HIGH.** Это ЖИВОЙ system prompt (`episode-reference-designer.ts:276-283`). Пример «flat vector fills» стоит рядом со словом «verbatim» — модель якорится на пример |
| `.claude/skills/eref-designer/SKILL.md:163` | `"S14 STYLE CANON v1.1: outline-only pencil edge, **flat vector fills**, no hatching, warm cinematic palette"` | HIGH. Скилл лениво грузится дизайнером (Step 0 п.6) |
| `.claude/skills/eref-designer/SKILL.md:302` | то же в примере Плана | HIGH |
| `.claude/skills/animator/SKILL.md:210` | `Bible style canon: S14 STYLE CANON v1.1 (outline-only pencil edge, **flat vector fills**, no hatching)` | MEDIUM |
| `.claude/skills/seedance-prompting/SKILL.md:90` | `**flat vector fills**, no hatching). Warm cinematic lighting.` | MEDIUM |
| `specs/glossary.md:144` | `art direction (e.g. "**Flat 2D cartoon**, bold black outlines, soft gradients")` | LOW (документация) |
| `specs/schemas/prompt.md:163, :172, :186` | `flat colour with soft shading` | LOW (документация) |

**Контрпример — что уже поправлено (доказывает, что правка возможна и что EREF просто забыли):**
`agents/exec/animator.md:237` — «cartoon Pink Panther silent-comedy style (**2.5D/3D cartoon render, soft volume and gentle shading are fine**), near-black warm outline #1A1008 …». Аниматора обновили под канон 07-23. **Дизайнера референсов, on-model-детектор и четыре скилла — нет.**

**Рантайм-подтверждение регресса:** `prompts/SH05-v1.md`, `history[1] at 2026-07-28T16:57:55` (ретрай через 2 минуты после корректного `history[0]`) начинается с
> «S15 STYLE CANON v1 — clean **flat 2D cartoon** … **NO painterly shading, NO cinematic lighting, NO 3D gloss**. … **NIGHTTIME**: soft warm overhead ambient only, **no dramatic shadows**.»

Это идеальный слепок обеих болезней: стиль откатился к flat-2D, а «ночь» объявлена и тут же обезврежена запретом на любые тени. Ночь без теней = дневная картинка.

---

## 5. Кто по замыслу архитектуры обязан задавать свет

По `CLAUDE.md §11` правило 8 (PARAMETER COMPLETENESS AT GATE) исполнительный агент — чистая функция; недостающий параметр = отказ вышестоящего гейта, а не «додумай». Таблица ответственности из §11 прямо относит:
- «Narrative structure → Brief / ART-HW direction»,
- «World / locations → World Bible (ART-WB)»,
- «Style, tone, pacing → Style Bible (EXEC-STY)».

Отсюда цепочка владения (каждое звено с пруфом в разделе «Карта ответственности» выше):

1. **Время суток сцены — EXEC-SW (сценарист).** `specs/schemas/script.md:42` кладёт `time_of_day` в `scenes[]` как REQUIRED.
2. **Время суток шота — EXEC-SB (раскадровщик), копией из сцены.** `agents/exec/storyboarder.md:203` — «from script scene **exactly**» (не «выведи», а «скопируй»).
3. **Формулировка освещения шота — EXEC-SB**, выводом из World Bible. `specs/schemas/shot.md:129` (Rule 5), `agents/exec/storyboarder.md:204`.
4. **Базовое освещение локации — ART-WB / Bible.** `agents/artistic/world_builder.md:59` `lighting_default:`; `bible-author.ts:109`.
5. **Объёмность (flat vs volumetric) — EXEC-STY в Style Bible.** `agents/exec/style_creator.md:111` `shading_approach:`; `bible-author.ts:133` «Lighting — flat / volumetric / dramatic».
6. **EXEC-EREF (дизайнер референсов) — НЕ владелец ни одного из них.** Его инструкция сама это признаёт (`:319` «Bible-defined baseline + shot.time_of_day **override**» — то есть он потребитель двух чужих значений).

**Итог:** свет — параметр **сценариста (время) + стилиста (объём) + World Bible (базовый свет локации)**. Дизайнер референсов не имел права его сочинять; то, что он это сделал и не упал в HALT, — вторая половина процессного дефекта.

---

## 6. Дыра в критиках

| Критик | Что реально проверяет | Свет / время / объём? |
|---|---|---|
| **EXEC-WCHK** (`continuity-check.ts`) | Канон персонажей и локаций; при флаге `canonChecks` — `lighting_canon` (`:313-316`, `:339`) | **Гейт есть, но его нечем кормить.** `:315-316`: «"N/A" **when the shot or the location says nothing about lighting**». Шот молчит всегда (п.1) → всегда N/A → всегда молчаливый проход. `agents/exec/world_checker.md:150-160` описывает CHK-W02 как настоящую проверку `shot.lighting_condition` vs правил Bible — эта проверка **никогда не исполнялась** |
| **EXEC-EPREV** (Reference Critic) | V01–V09: провайдер в allowlist, размер vs delivery_target, число вариантов, непустой промпт, негативы, режим continuity, якоря, shot_id, policy_notes (`agents/exec/episode_reference_critic.md:17-83`) | **НЕТ.** Чисто механические проверки. На E33 — `PASS` (`06-activity-events.txt`, 16:49:12 SH05) |
| **EXEC-CREAD** (Readability Critic) | R01–R06: читаемость намерения, логика гэг-движка, видимое следствие, континьюити объектов, конкретность payoff, отсутствие пустого движения (`agents/exec/creative_readability_critic.md:31-51`) | **НЕТ.** На E33 — `PASS` (16:49:59 SH05) |
| **EXEC-VCRIT** (Visual Critic, картинка) | `webapp/lib/agents/runners/visual-shot-critic.ts` + `.claude/skills/visual-shot-verdict/SKILL.md` | **НЕТ.** `grep -i "light\|night\|day\|volume\|depth\|flat\|shading"` по обоим файлам → **0 совпадений** |
| **On-model detector** | `location_ok`, `style_ok`, `silhouette_ok`, `transparency_ok`, `objects_ok` | **ЯВНО ОСВОБОЖДАЕТ свет от проверки** и **инвертирует стиль**: `on-model-detector.ts:133-134` «Compare PLACE, not lighting: **the same setting at night is still on-model**»; `:124-125` «Scene lighting legitimately darkens/tints a body (night, coloured ambient) — that is **CORRECT, not a defect**»; `:144` «FALSE on a clear medium break (photoreal / **3D** / wrong art style)» |

**Чья это зона.** Нужны две разные проверки, и обе — на ВЫХОДНОЙ картинке, а не на плане:
- **Свет/время суток → EXEC-WCHK (CHK-W02).** Гейт уже существует (`continuity-check.ts:313-316`) и заработает сам, как только шот начнёт нести `time_of_day`. Ничего нового строить не надо.
- **Объём/медиум → EXEC-VCRIT + on-model `style_ok`.** Сейчас `style_ok` не просто молчит — он настроен ПРОТИВ канона (`:144` валит 3D). Это не «добавить проверку», это «убрать неверный токен».

---

## 7. Минимальная правка

Анти-аддитивность: сначала переиспользовать, потом вычесть, добавлять — в последнюю очередь.

### Вариант A — ПЕРЕГЕНЕРИТЬ ДВЕ КАНОН-ПЛАСТИНЫ + вычистить flat-2D из текстов (РЕКОМЕНДУЮ)

Закрывает **фактический** дефект E33 на обеих осях. Ноль новых сущностей.

**Что делаем (данные, не код):**
1. Перегенерить `image_prompt` стилевого якоря `SBL-style_s15_style_canon_2d_v1` из **актуального** (2.5D/3D) текста описания и **бампнуть `image_prompt.current_version`** (иначе браузер и рефы держат stale immutable — `memory/canon_inplace_image_swap_bump_freshness`).
2. Перегенерить пластину `SBL-location_sandy_bedroom_continuity`, убрав из её промпта «flat 2D cartoon / no 3D / no gradients» и «warm cream walls / warm cream background».

**Что УДАЛЯЕМ в коде и инструкциях (чистое вычитание, ~10 строк):**
| Файл:строка | Действие |
|---|---|
| `webapp/lib/agents/runners/on-model-detector.ts:144` | удалить токен `3D` из «photoreal / 3D / wrong art style» — критик перестаёт валить собственный канон |
| `webapp/lib/agents/runners/bible-author.ts:230` | удалить `neutral natural lighting` — пусть свет пластины берётся из текста канона локации (`:109` его уже требует) |
| `webapp/lib/api/vgen-shot-helpers.ts:580` | убрать `2D animation` из `POSITIVE_STYLE` (или удалить константу — стиль уже приезжает из Bible) |
| `webapp/lib/api/vgen-shot-helpers.ts:744` | убрать `2D` из `const setting = '2D animated comedy short.'` |
| `webapp/lib/agents/runner.ts:664, :674` | убрать `2D` из двух фолбэк-промптов |
| `agents/exec/episode_reference_designer.md:325` | удалить пример «flat vector fills, no hatching» (оставить «verbatim from Bible style_canon») |
| `.claude/skills/eref-designer/SKILL.md:163, :302`; `.claude/skills/animator/SKILL.md:210`; `.claude/skills/seedance-prompting/SKILL.md:90` | те же примеры — удалить |

**Нетто-дельта: −10 строк кода/инструкций, +0 сущностей.** Ни одного нового поля, ни одного нового гейта.

**Чего НЕ закрывает:** латентную дыру `time_of_day` — дизайнер по-прежнему будет угадывать время суток, просто ему перестанут мешать пластины. На эпизоде, где ночь не читается из `action_prose`, дефект вернётся.

### Вариант B — восстановить ОДНО поле `time_of_day` на уровне сцены

Закрывает структурную дыру и **бесплатно включает уже существующий гейт CHK-W02**.

Переиспользуем то, что есть: поле уже объявлено в `specs/schemas/script.md:42` и `shot.md:54` (не изобретаем), объект `location: { slug, sub_area }` уже существует и парсится (кладём туда третий ключ, не заводя новый top-level), гейт `lighting_canon` уже написан (`continuity-check.ts:313-316`) и начнёт срабатывать сам.

| Файл:строка | Правка | Строк |
|---|---|---|
| `webapp/lib/agents/runners/screenwriter.ts:257` | добавить в шейп сцены `"time_of_day": "DAY"\|"NIGHT"\|…` | +1 |
| `specs/contracts/screenwriter@v1.yaml:53` | то же в декларации | +1 |
| `webapp/lib/agents/runners/storyboarder.ts:388` | в существующий объект `location` добавить `"time_of_day": "<verbatim from the scene>"` | +1 |
| `webapp/lib/api/vgen-shot-helpers.ts:161-175` | в существующую ветку разбора `location` добавить `time_of_day` (рядом с `sub_area`) | +3 |
| `webapp/lib/agents/runners/episode-reference-designer.ts:554` | одна строка в блок `<shot>`: `location: ${slug} / ${sub_area} · time_of_day: ${…}` — попутно закрывает то, что локации в блоке вообще нет | +1 |

**Нетто: +7 строк, 0 новых файлов, 0 новых флагов, 0 новых гейтов.** CHK-W02 (`continuity-check.ts:313-316`) перестаёт возвращать N/A и начинает работать без единой правки в себе.

**Чего НЕ закрывает:** ровно ничего из фактического E33 — пластины останутся плоскими и дневными, и картинка снова выйдет дневной, как вышла при уже правильном тексте.

### Вариант C — только текстовая правка канона (то, что уже пробовали дважды)

Отвергнут: **эмпирически опровергнут на E33**. Оркестратор правил текст канона локации, затем вручную переписал 5 планов на «ночь» — планы SH01/SH03/SH05/SH06/SH09 действительно содержат ночь, промпт провайдеру содержит ночь, картинка всё равно дневная. `openai-edits-multi` взвешивает приложенную пластину выше текста. Дальше по этому пути двигаться бессмысленно.

### Рекомендация

**Сделать A сейчас, B — следующим коммитом.** A устраняет причину, которая реально испортила E33 (и делает это чистым вычитанием, нетто −10 строк). B закрывает латентную дыру, чтобы дизайнер перестал додумывать творческий параметр в нарушение `CLAUDE.md §11` правила 8, и включает уже написанный, но никогда не срабатывавший гейт CHK-W02.

Делать B **без** A — потратить правку впустую: текст и так был правильный.

---

## Приложение — что именно опровергнуто

| Тезис исходной гипотезы | Статус | Пруф |
|---|---|---|
| «В раскадровке нет поля времени суток» | **ПОДТВЕРЖДЁН** | `storyboarder.ts:383-414`; `vgen-shot-helpers.ts:60-97,134-175`; `grep time_of_day webapp/` = 0 |
| «Дизайнер референсов его не получает» | **ПОДТВЕРЖДЁН** | `episode-reference-designer.ts:546-555` |
| «Поэтому провайдер додумал день» | **ОПРОВЕРГНУТ** | `prompts/SH05-v1.md` `[Location] lighting: … (nighttime)` + `[Style] … 2.5D cartoon`. Текст был верный на обеих осях |
| «Настоящая правка — на уровне схемы раскадровки» | **ОПРОВЕРГНУТ как приоритет** | Правка схемы не изменила бы E33: план уже был ночной. Приоритетная правка — канон-пластины |
| «Правки Оркестратора лечили симптом» | **ПОДТВЕРЖДЁН** | Обе правки касались ТЕКСТА; побеждает приложенная КАРТИНКА |
