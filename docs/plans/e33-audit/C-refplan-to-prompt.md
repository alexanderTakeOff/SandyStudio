# C — Аудит звена «ПЛАН РЕФЕРЕНСА → СОБРАННЫЙ ПРОМПТ → ПРОВАЙДЕР»

**Эпизод:** SS-S15-E33 · 9 шотов · gpt-image-2 (`openai-edits-multi`) · 17 IMG-ассетов, 63 платных генерации
**Дата данных:** 2026-07-28, 16:37–19:12 UTC · **Режим:** SH01 v1 — Mode 1, всё остальное — Mode 3
**Источники:** `prompts/SH*-v*.md` (поле `image_prompt.history[]`), `body-…SPC-ref_plan-*` (планы), `05-jobs.json`, `03-media-metadata.json`, канон `canon-*`, код `webapp/lib/agents/runners/{episode-references,eref-check}.ts`

---

## Вердикт

1. **План доезжает до провайдера ДОСЛОВНО ровно один раз — на первой попытке.** `history[0]` побайтово равен `plan.prompt` во всех 17 ассетах. Дальше строка `prompt = latestReview.suggested_prompt_v2` (`episode-references.ts:2570`) **выбрасывает весь план целиком** и заменяет его ≤2000-символьным пересказом критика. Из 9 итоговых картинок эпизода **6 отрисованы с пересказа критика, а не с плана**.
2. **Плоскость рождается в ТРЁХ местах одновременно, и ни одно из них — не план.** (а) LOCKED-картинка стиля `s15_style_canon_2d_v1` отрисована 20.05.2026 по старому промпту «Flat 2D … Zero 3D … Zero volumetric lighting» и **после исправления канона 23.07 НЕ перегенерена** (`image_prompt.current_version: 1`); (б) в `negative[]` четырёх планов стоит буквально `no 3D CGI render`, и он приклеивается к КАЖДОЙ попытке, включая дословную первую; (в) критик, видя слаг `..._2d_v1` и плоскую референс-картинку, в каждом пересказе пишет «flat 2D cartoon».
3. **Дневной свет рождается в LOCKED-картинке локации.** Канон `sandy_bedroom_continuity`: «Light source is a single window on the back wall, represented as a flat Sky Blue rectangle projected onto the floor — **fixed in every episode**», рендер «neutral natural lighting». Эта дневная картинка идёт **первым** референсом, и текст LAYOUT LOCK сам приказывает: «Treat it as the canonical layout».
4. **Ручная переписка на «ночь» опоздала и накрыла не всех.** Планы SH03, SH04, SH06, SH07-v03, SH08 отредактированы в 19:01:30–19:02:10. Перезапущены после правки только SH06, SH07, SH08 (19:02:18–19:02:25). **SH03 и SH04 остались с дневным светом в утверждённых картинках навсегда** — их планы теперь врут про содержимое ассета.
5. **Планка качества не была взята НИ РАЗУ за весь эпизод.** `KEEP_ATTEMPT_SCORE_THRESHOLD = 85`; лучший результат за 63 генерации — 77 (SH08-v2 v5). Все 9 референсов уехали через `keep-best` при `REGENERATE_EXHAUSTED`, а гейт `on_model` был выключен во всех 17 ассетах (`"reason":"gate off (loose)"`).

---

## 1. Таблица «свет по шотам»

«Версия» = попытка, **пиксели которой реально уехали в ассет** (`selected_version` — ручной выбор Директора; где его нет — `pickBestAttempt`: меньше CRITICAL → выше composite → раньше).

| Шот | Верс. | Что в промпте про свет (цитата) | Итог |
|---|---|---|---|
| SH01 | v3 (ручной выбор Директора) | «Wide three-quarter-overhead establishing shot of sandy_bedroom_continuity **at night**… teal articulated gooseneck desk lamp on desk — **SOLE light source**, emits warm teal-tinged pool… window back wall (night sky, stars)» | **ночь** |
| SH02 | v1 (план дословно) | «Lighting: warm teal-tinted ambient from the teal_desk_lamp in background — soft, low, intimate **night-light quality**. No overhead light… **Night.**» · «One back-wall window (**dark, night**)» | **ночь** |
| SH03 | v1 (план дословно, ручной выбор) | «lighting: **top-lit soft cartoon key light from above**; specular dot highlights on both glass bodies; warm ambient from bedroom palette; no dramatic shadows» | **не сказано / день** |
| SH04 | v2 (пересказ критика) | вся строка про свет: «Sandy's bedroom interior, medium-wide slightly elevated angle, cream walls, warm beige plank floor. Back wall: window, low_bookshelf.» — **времени суток нет вообще**; в плане, с которого стартовали: «lighting: soft simple cartoon top-light, warm ambient…, **consistent with single back-wall window providing ambient fill**» | **день (окно = источник)** |
| SH05 | v1 (план дословно, ручной выбор) | «lighting: soft top-lit interior **night** warmth; low ambient bedroom lighting (**nighttime**); **single warm overhead source**…» | ночь ⚠ **сама себе противоречит** (в каноне свет только от teal_desk_lamp, «no overhead light») |
| SH06 | v3 (пересказ критика) | «sandy_bedroom_continuity **night interior**: cream walls **darkened for night**… teal_desk_lamp atop desk casting warm-teal pool. **Dark window.**» | **ночь** |
| SH07 | v3 (пересказ критика; ревьюер был пропущен) | «**Window dark night fill.** Soft warm **night interior**, single teal-lamp pool, cream walls #FFF8EC» | **ночь** |
| SH08 | v5 (пересказ критика) | «Sandy bedroom, **night interior**: cream walls (#FFF8EC), warm-neutral wide-plank floor, **back-wall window dark**, teal desk lamp… casting one soft warm-teal pool» | **ночь** (но критик на этом же кадре: «Lighting is **daytime/neutral-warm**… room is bright overall») |
| SH09 | v2 (пересказ критика) | «Sandy_bedroom_continuity **at night**: cream walls softly teal-tinted by the teal_desk_lamp… **Teal lamp is sole light source**» | **ночь** |

**Что это значит.** Ночь есть в тексте у 7 шотов из 9. Провалились SH03 и SH04 — ровно те два, чьи планы переписали на ночь в 19:01, но **не перезапустили**. Их картинки APPROVED и дневные, а планы в БД теперь описывают ночь, которой в пикселях нет.

**Дефект самой ручной правки.** Ночной текст был **вставлен перед старым**, а старый не удалён — получились склейки-химеры:
- SH03: «…the back-wall window reads dark **soft cartoon key light from above**; specular dot highlights…» (ночь и верхний ключевой свет в одной строке)
- SH06 / SH07-v03: «…the back-wall window reads dark **cartoon ambient per Bible baseline**» / «reads dark **cartoon fill**»
- Ни в одном из 11 планов нет негатива «no daylight / no window light / no daytime» — при том что LAYOUT LOCK описывает окно, а канон локации объявляет окно **единственным** источником света.

---

## 2. Таблица «плоскость / объём»

Термины в промпте, реально ушедшем провайдеру.

| Шот | Найденные термины | Цитата | Источник термина |
|---|---|---|---|
| все 17, `history[0]` | `2.5D/3D`, `dimensional volume`, `soft shading` | «…rendered in a **2.5D/3D cartoon style** — dimensional volume and soft shading are fine as long as every frame reads as a single graphic statement» | **план** ← корректный текст канона стиля (тело `description`, правка 23.07). Здесь всё правильно. |
| SH01 v2/v3 | `2D`, `flat` ×4-5 | «S15 STYLE CANON v1 — **clean 2D cartoon flat fills**, soft cartoon shading only, NO photorealism…» | **критик** (`eref-check.ts` → `suggested_prompt_v2`) |
| SH01-v2 v2 | `2D flat`, `cel-shaded`, `NO 3D render` | «**2D flat cartoon cel-shaded illustration**, Pink Panther DePatie-Freleng style… minimal soft volume shading only — NO painterly gradients, **NO 3D render**, NO cinematic lighting» | **критик** |
| SH02 v2/v3 | `2D`, `flat` ×6 | «**S15 STYLE CANON v1.1 clean 2D cartoon.**…» | **критик** |
| SH02, SH04 (все попытки) | `no 3D CGI` | негатив плана, приклеенный провайдером в конце промпта: «Avoid depicting: … **no photorealism or 3D CGI**.» | **план, поле `negative[]`** — прямо бьёт по «2.5D/3D» из `[Style]` того же плана |
| SH03 v2/v3 | `flat 2D`, `flat opaque fills` | «**Clean flat 2D cartoon style**, near-black outline #1A1008 uniform 3-4px closed strokes, NO gradients, NO caustics…» | **критик** |
| SH04 v2/v3 | `flat`, `no 3D` | «…flat saturated fills, simple soft shading, no gradients, **no 3D**.» | **критик** |
| SH05 v2 | `flat 2D`, `NO 3D gloss` | «S15 STYLE CANON v1 — **clean flat 2D cartoon**… simple 2-tone soft shadow only, NO painterly shading, NO cinematic lighting, **NO 3D gloss**.» | **критик** |
| SH06 v2..v5 (все версии ассета) | `2D flat cartoon` ×4 | «**2D flat cartoon**, s15_style_canon_2d_v1 style…» · v5: «minimal cel-shading only — **NO volumetric 3D shading**» | **критик** |
| SH07-v2 v3 | `2.5D`, `flat cel` | «Style: clean **2.5D cartoon, flat cel fills**…» — единственный пересказ, где критик удержал 2.5D | **критик** |
| SH07-v3 v2/v4/v5 | `2D flat`, `NO 3D render`, `NO CGI` | «**clean 2D flat-fill cartoon**, confident near-black outline 3-4px, NO gradients, **NO 3D render, NO CGI**.» | **критик** + негатив плана «no photorealism, no 3D render, no CGI» |
| SH07-v4 v2 | `flat 2D`, `NO 3D render` | «S15 STYLE CANON v1 **STRICTLY ENFORCED: flat 2D cartoon**… NO photorealism, **NO 3D render**, NO heavy gradients, NO cinematic lighting.» | **критик** |
| SH08-v3 v4 | `2D cel`, `NO 3D render look` | «STYLE s15_style_canon_2d_v1: **clean 2D cel cartoon**, flat saturated fills… **NO 3D render look**, NO cinematic lighting drama.» | **критик** |
| SH09 v2/v3 | `flat 2D`, `NO 3D render`, `NO volumetric` | «S15 STYLE CANON v1 — **flat 2D cartoon**… flat opaque fills + minimal soft **2D shading** only, **NO painterly/3D render, NO cinematic volumetric lighting**, NO photorealism.» | **критик** |
| **канон-картинка стиля** (реф-слот 4, во всех 63 генерациях) | `Flat 2D`, `Zero 3D`, `Zero volumetric lighting` | метаданные `s15_style_canon_2d_v1`, `image_prompt.history[0].prompt` (20.05.2026): «## Absolute hard rules — **2D flat cartoon only. Zero 3D. Zero CGI render.** Zero clay/rendered toy look. **Zero volumetric lighting.**… ### 4. Lighting — **Fully flat.**» | **канон (картинка)** — не перегенерена после правки текста 23.07 |
| **канон-картинка локации** (реф-слот 1) | `no 3D`, `no cinematic lighting` | «**No photorealism, no 3D, no CGI, no gradients, no cinematic lighting**, no texture noise.» | **канон (картинка)** |

**Кто выигрывает.** У провайдера один текст «2.5D/3D» против: старой плоской картинки стиля, старой плоской+дневной картинки локации, слага `_2d_v1`, негатива «no 3D CGI» и (с попытки 2) пересказа критика, где «2.5D/3D» вообще нет. Пять голосов против одного. Все 9 итоговых критик-ревью, тем не менее, ругают картинку за **избыток** 3D — то есть критик судит по старому плоскому канону и гонит в ту же сторону.

---

## 3. Таблица потерь «план → промпт»

| # | Шот | Потерянное / искажённое | Цитата плана | Что в промпте | Тяжесть |
|---|---|---|---|---|---|
| 1 | все, попытки 2+ | **Весь план целиком** — LAYOUT LOCK, `[Scene context]`, `[Acting]`, `[Subject]` с physical_anchors, `[Camera]`, `[Style]`, `[Beat]`. 6000–8500 симв. → ≤2000 | `[LAYOUT LOCK — hard contract] … [Style] S15 STYLE CANON v1 … 2.5D/3D cartoon style with dimensional volume…` | «S15 STYLE CANON v1: clean 2D cartoon, flat saturated fills…» (1859 симв.) | **CRITICAL** |
| 2 | SH01, SH04, SH06, SH07, SH08, SH09 | Итоговые пиксели эпизода отрисованы с пересказа критика; план — только в невыбранной попытке v1 | — | — | **CRITICAL** |
| 3 | SH03 | Ночь, переписанная вручную в 19:01, никогда не доехала (нет перезапуска) | «lighting: **NIGHT INTERIOR** — the bedroom sits in shadow except one warm teal-tinged pool… **no daylight**» | «lighting: top-lit soft cartoon key light from above» | **CRITICAL** |
| 4 | SH04 | То же + окно как источник света | «**NIGHT INTERIOR**… the back-wall window reads dark» | «…consistent with **single back-wall window providing ambient fill**» → в пересказе критика (v2, ушёл в ассет) времени суток нет вообще | **CRITICAL** |
| 5 | SH02, SH04, SH07-v2/v3/v4 | Негатив плана **противоречит** `[Style]` того же плана | `[Style]`: «2.5D/3D cartoon render acceptable» | `negative`: «no photorealism, **no 3D render, no CGI**» → «Avoid depicting: … no 3D render, no CGI.» | **HIGH** |
| 6 | SH03, SH06, SH07-v3 | Ручная правка склеила ночь со старым дневным текстом, не удалив старый | «…window reads dark» | «…window reads dark **soft cartoon key light from above**» / «…reads dark **cartoon ambient per Bible baseline**» | **HIGH** |
| 7 | SH05 | В плане «ночь», но источник света описан как верхний общий — против канона «teal_desk_lamp — sole light source» | «night warmth; low ambient (nighttime); **single warm overhead source**» | ушло дословно | **HIGH** |
| 8 | SH03, SH04 | `shot_reference.review` в метаданных описывает ПОСЛЕДНЮЮ попытку, а уехали пиксели ДРУГОЙ (v1 / v2). Директор в дровере читает отзыв не о той картинке | — | — | **HIGH** |
| 9 | SH07 (v4), SH01 (v2) | Финальный ревью = `approvePassReview` (все оценки 100, issues пусто, `gag=null`) — это фолбэк «критик пропущен → PASS». Кадр принят не потому что хорош, а потому что проверка не сработала | — | — | **HIGH** |
| 10 | все 17 | `on_model` гейт выключен: `{"model":"skipped","reason":"gate off (loose)","verdict":"PASS","style_ok":null,"transparency_ok":null}` — единственный детектор, который ловит плоскость/прозрачность, не работал | — | — | **HIGH** |
| 11 | все | В `image_prompt.history[]` пишется только `prompt` — без хвоста «Avoid depicting: …». Дословной строки, ушедшей в API, в БД нет ни для одной генерации | — | — | MEDIUM |
| 12 | все, попытки 2+ | Негатив-лист **уцелел** (`negative: planOverrides?.negative` передаётся на каждой попытке, `episode-references.ts:2401`) — но при этом теперь применяется к чужому телу промпта | — | — | LOW (положительное наблюдение) |

---

## 4. Референсы и якоря

Порядок фиксирован кодом (`buildMultiImageRefs`): **location → identity(персонажи) → object → style → continuity**.

| Шот | Реф-картинок | Какие (в порядке отправки) | «Якорь» в метаданных | Замечание |
|---|---|---|---|---|
| SH01 | 4 | location `sandy_bedroom_continuity` → baby_timer → sandy_hourglass → style | `93617d78` = **baby_timer** | Якорь указывает не туда: `anchor_image_asset_id` = первый *персонаж*, а не пространственный якорь. `plan.continuity_anchors: []` |
| SH02 | 4 | location → baby_timer → sandy_hourglass → style | `93617d78` = baby_timer | То же. `continuity_anchors: []` |
| SH03 | **6** | location → sandy → baby_timer → style → **scene_continuity `3fa2c8e1`** → **temporal_continuity `3fa2c8e1`** | `bc2d6f74` = sandy | **Одна и та же картинка приложена дважды** — план сам это признал: «Both continuity_anchors share the same asset_id … executor should confirm distinct asset resolution at render time». Не подтвердил — уехало дублем |
| SH04 | 5 | location → sandy → baby_timer → style → scene_continuity `3fa2c8e1` | `bc2d6f74` = sandy | «no temporal_previous_shot anchor emitted — SH03 has no APPROVED IMG-episode_ref yet» |
| SH05 | 5 | то же | `bc2d6f74` | «Temporal anchor omitted: SH04 has no APPROVED IMG-episode_ref yet» |
| SH06 (v1/v2/v3) | 5 | то же | `bc2d6f74` | «**Temporal anchor omitted**: S15-E33-SH05 has no APPROVED IMG-episode_ref yet» |
| SH07 (v1..v4) | 5 | то же | `bc2d6f74` | «No temporal anchor emitted — SH06 has no APPROVED IMG-episode_ref yet at plan-authoring time» |
| SH08 (v1..v3) | 5 | то же | `bc2d6f74` | «No temporal anchor emitted — SH07 has no APPROVED IMG…»; плюс «Anchor chain flag not evaluated — `anchor_chain_enabled` not supplied; plan authored under legacy single-frame mode» |
| SH09 | 5 (v1 — тоже 5) | то же | `bc2d6f74` | Аналогично |

**Выводы по референсам.**
- **Временнáя цепочка не собралась ни разу.** Все 9 планов писали друг о друге «предыдущий шот ещё не APPROVED» — потому что планировались пачкой в 16:46–16:50, ДО того как хоть один кадр был утверждён. Единственный «пространственный» якорь на весь эпизод — `3fa2c8e1` = **картинка SH02**.
- **Якорь эпизода — дефектный кадр.** У SH02 в ревью: CRITICAL «Sandy rendered with a dark/black rubber waist ring & dark body instead of clear flat-glass transparent body» и MAJOR «the room is too dark overall, obscuring the yellow rug lattice detail». Этот кадр с 16:43 транслируется как «канонический слепок комнаты» во все шоты SH03–SH09. Тёмный Сэнди и потерянная прозрачность после SH03 — не независимые дефекты, а наследство.
- **Поле `anchor_image_asset_id` дезинформирует.** Код: `job.bibleRefs.find(r => r.kind === 'character' && r.image_b64)?.asset.id` (`episode-references.ts:2797`) — это просто первый персонаж. Ни `continuity_anchors`, ни реф-слот №1 (локация, который LAYOUT LOCK объявляет «the first attached anchor image … the canonical layout») в метаданных не отражены. `source_bible_refs` тоже НЕ содержит continuity-рефов — их видно только в `generation_history[].references_used`.
- **Первый и главный референс — дневная плоская комната.** LOCKED `sandy_bedroom_continuity`, `image_prompt.current_version: 3`, последний рендер **20.05.2026** (`director_edit`), описание: «Light source is a single window on the back wall … flat Sky Blue rectangle projected onto the floor — fixed in every episode», рендер-инструкция «neutral natural lighting». Именно её текст LAYOUT LOCK велит считать каноном.

---

## 5. Что промпт добавил от себя (сверх плана)

На первой попытке — **ничего**: `history[0] === plan.prompt` побайтово. Единственная добавка кода — хвост провайдера:
`${prompt}\n\nAvoid depicting: ${negativeTerms.join('; ')}.` (`openai-edits-multi.ts:99-107`, gpt-image-edits не имеет параметра `negative_prompt`), причём код принудительно доклеивает `BASELINE_NEGATIVES = ['no text','no logos']` (`episode-references.ts:2951`).

Всё остальное «своё» — это блоки, написанные **самим EXEC-EREF-DESIGNER внутри плана** (LAYOUT LOCK, `[Style]`, `[Beat]`) и **критиком** на ретраях. Style Guardian (`runStyleCheck`, `guardianMode === 'auto_rewrite'`) в этом эпизоде не сработал ни разу — иначе `history[0]` разошёлся бы с планом.

---

## 6. Повторные попытки — SH06 / SH07 / SH08

| Ассет | Попыток | composite / CRITICAL по попыткам | Что менял критик | Помогло? |
|---|---|---|---|---|
| SH06-v1 | 3 | 55/2 · 65/2 · 56/2 | 45°-наклон, нить песка, «purgatory» глаза | нет — те же 2 CRITICAL на всех трёх |
| SH06-v2 | 5 | 58/2 · 63/2 · 62/2 · 59/2 · 62/2 | **те же три пункта в 4-й раз подряд**: «Sandy is NOT at 45° … wedged against the round_side_table», «No single thin trickle-thread … through waist-neck pinch», «eyes … not half-open dazed purgatory» | нет — CRITICAL=2 на всех пяти; ассет INVALIDATED |
| SH06-v3 | 5 | 65/2 · 59/3 · 68/1 · 63/2 · 62/2 | те же три, **девятый и десятый повтор** за эпизод | частично: v3 сбил CRITICAL до 1 (68) — его и оставили; но обе следующие попытки откатились назад |
| SH07-v1 | 3 | 65/2 · 66/2 · 69/0 | хват baby_timer, спиральные зрачки | v3 дал 0 CRITICAL, но ассет всё равно INVALIDATED (Директор переписал план на `frame_role: peak`) |
| SH07-v2 | 3 | 69/2 · 64/2 · 69/2 | центробежные конечности, вихрь песка | нет |
| SH07-v3 | 5 | 68/1 · 71/2 · 74/1 · 72/1 · 69/1 | **пять раз одно и то же**: «limbs do NOT form a full X-silhouette», «sand … not a fully chaotic centrifugal whipping blur», «Baby-Timer gripping with one hand» | нет; на v5 деградация — «Sandy appears **inverted/upside-down**» |
| SH07-v4 | 3 | 65/1 · 75/0 · **ревью пропущено** | v2: «STRICTLY ENFORCED: flat 2D…»; v3: возврат к `[LAYOUT LOCK]` + ночь | v3 принят по фолбэку `approvePassReview` — критик не отработал, оценки 100/100/100 синтетические |
| SH08-v1 | 3 | 66/1 · 71/0 · 74/0 | выражение «neutral suspension», струя песка, два колокольчика | улучшение есть, но ассет INVALIDATED ради ночной перезаливки |
| SH08-v2 | 5 | 70/1 · 71/0 · 71/1 · 69/1 · **77/0** | **четыре раза подряд**: «eyes … not the required blank stunned neutrality», «bell-ears … single dome instead of two», «sand nearly empty» | v5 = 77 — лучший результат эпизода, но ассет всё равно INVALIDATED |
| SH08-v3 | 5 | 69/1 · 66/1 · 65/0 · 69/1 · **75/0** | те же четыре пункта в **девятый раз**; ночь появилась только с v1 (план уже был переписан) | v5 принят; в его же ревью: «**Lighting is daytime/neutral-warm** … Plan specifies NIGHT INTERIOR» |

**Что видно в сумме.**
- **Одно и то же чинится по 4–10 раз.** «Два хромовых колокольчика вместо одного купола» — 12 упоминаний по всему эпизоду. «45° и нить песка» у SH06 — 10 подряд. Ни петля ретраев, ни перезапуск ассета не имеют памяти: каждый новый `v0N` стартует с чистого плана и повторяет ту же дугу.
- **Ретрай в среднем не улучшает.** Дельта composite от первой к последней попытке: SH01 61→60, SH02 62→62, SH03 67→70, SH05 67→56, SH06-v2 58→62, SH06-v3 65→62, SH07-v3 68→69. Механизм `keep-best` фактически спасает результат от собственных ретраев — что и есть косвенное признание, что ретраи вредят.
- **Все три «двойных» ассета (SH06/07/08 v1→v2→v3/v4) прошли по 11–13 платных генераций на шот.** Итог: 63 генерации × $0.08 = **$5.04**, при плановой смете **$0.06 на шот / $0.54 на эпизод** — перерасход ×9, не считая vision-вызовов критика.

---

## 7. Политика vs факт (`provenance.plan_policy_notes` ↔ реальность)

| Заявлено | Факт | Оценка |
|---|---|---|
| `plan_variants_count: 2` во всех 11 планах; «Pilot mode — two candidates allow Director to select preferred composition **before fanout**» | **Фан-аут двух вариантов не происходил.** В `generation_history` всюду последовательные `version: 1..N` с `triggered_by: pipeline / auto_regen`, по одной картинке. Директор выбирал `selected_version` среди *ретраев*, а не среди вариантов | **HIGH** — заявленная пилот-стратегия не реализована |
| SH01/SH02 `plan_continuity_mode: "openai-image"` + «fresh generation from Bible canon **only**» | Провайдер `openai-edits-multi`, приложено **4 референс-картинки** | HIGH — режим в плане не соответствует вызову |
| «first approved output will become the de-facto spatial anchor for SH02+» (SH01) | Якорем стал **SH02**, а не SH01 | MEDIUM |
| «Temporal anchor omitted: SH0N-1 has no APPROVED IMG-episode_ref yet» (SH04, SH05, SH06, SH07, SH08) | Верно на момент написания плана (16:46–16:50), но планы **не пересчитывались** при перезапусках в 18:29 и 19:02, когда утверждённые предыдущие кадры уже были. Временная цепочка потеряна навсегда | **HIGH** |
| SH03: «executor should confirm distinct asset resolution at render time» | Не подтвердил — `3fa2c8e1` ушёл дважды как `scene_continuity` и `temporal_continuity` | MEDIUM |
| SH08: «Anchor chain flag not evaluated — `anchor_chain_enabled` not supplied; plan authored under **legacy single-frame mode**» | Так и осталось; anchor-pair не строился | MEDIUM |
| SH07-v03: «frame_role updated from 'start' to 'peak' per Critic hard contract» | В `shot_reference.frame_role` итогового ассета SH07-v4 стоит **`"start"`**, хотя JSON плана говорит `"peak"` | MEDIUM — рассинхрон плана и метаданных ассета |
| SH01: «Baby-Timer Bible entry does not include a structured physical_anchors table… Flagging for ART-CAST» | Флаг не отработан; «один колокольчик вместо двух» — самый частый дефект эпизода (12 раз) | MEDIUM |

---

## Диагноз

**Плоскость.** Родилась **не в плане и не в тексте канона** — оба говорят «2.5D/3D cartoon, dimensional volume, soft shading». Она приходит из трёх конкретных мест:

1. **`canon-SS-S15-SBL-style_s15_style_canon_2d_v1-v01-LOCKED.png`, `image_prompt.current_version: 1`, отрисована 2026-05-20T05:58 по промпту «2D flat cartoon only. Zero 3D. Zero CGI render. Zero volumetric lighting».** Текст канона исправили 23.07 — **картинку не перегенерили**. Она уходит референс-слотом №4 во все 63 генерации. Это главный источник.
2. **`negative[]` планов SH02, SH04, SH07-v02, SH07-v03/v04**: строка `no 3D CGI render` / `no 3D render, no CGI`, которую `openai-edits-multi.ts:107` дословно приклеивает к концу КАЖДОГО промпта, включая дословно-плановую первую попытку.
3. **`eref-check.ts` → `suggested_prompt_v2` ≤1200 симв. (обрезка `.slice(0,2000)`) + `episode-references.ts:2570` `prompt = latestReview.suggested_prompt_v2`.** Критик, глядя на плоскую эталонную картинку и слаг `_2d_v1`, в 15 из 17 пересказов пишет «flat 2D cartoon» и выбрасывает формулировку «2.5D/3D … dimensional volume» насовсем. С попытки 2 план в промпте отсутствует полностью.

**Дневной свет.** Родился **в LOCKED-картинке локации**: `canon-SS-S15-SBL-location_sandy_bedroom_continuity-v01-LOCKED.png`, последний рендер 2026-05-20T09:29, канон — «Light source is a single window on the back wall … flat Sky Blue rectangle projected onto the floor — **fixed in every episode**», рендер-директива «neutral natural lighting». Эта дневная комната идёт **референс-слотом №1**, и текст LAYOUT LOCK внутри плана сам приказывает модели: «The first attached anchor image is the LOCKED LOCATION master … **Treat it as the canonical layout**». Вторичные усилители: (а) `[Location].lighting` в исходных планах SH03, SH04, SH06, SH07 писался как «top-lit soft cartoon key light» (Designer наследовал дневной канон локации), (б) ручная правка на ночь пришла в 19:01 — после того как SH03 и SH04 были уже APPROVED, и перезапуска для них не было, (в) ни в одном негативе нет «no daylight / no window light».

**Одной фразой:** и плоскость, и дневной свет приходят не из текста, а из **двух LOCKED-картинок канона (стиль + локация), отрисованных в мае по старому «flat 2D / дневное окно» канону и не перегенерённых после исправления текста 23 июля**, — а механизм ретраев (`prompt = suggested_prompt_v2`) добивает дело, стирая корректный «2.5D/3D» текст плана начиная со второй попытки.

---

## CRITICAL / HIGH

**CRITICAL**
1. `episode-references.ts:2570` — ретрай заменяет 6000–8500-символьный утверждённый план на ≤2000-символьный пересказ критика; LAYOUT LOCK, `[Camera]`, `[Style]`, physical_anchors теряются целиком. 6 из 9 итоговых кадров эпизода отрисованы без плана.
2. LOCKED-картинка стиля `s15_style_canon_2d_v1` (`303959c1`) отрисована по промпту «2D flat cartoon only. Zero 3D. Zero volumetric lighting» и не перегенерирована после исправления канона 23.07 — плоский эталон уходит во все генерации.
3. LOCKED-картинка локации `sandy_bedroom_continuity` (`5df0a4a5`) — дневная («single window … flat Sky Blue rectangle on floor — fixed in every episode») и идёт слотом №1 как «canonical layout», против ночного текста.
4. SH03 и SH04: планы переписаны на ночь в 19:01, перезапуска не было — APPROVED-картинки дневные, планы в БД описывают несуществующую ночь.

**HIGH**
5. `negative[]` планов SH02/SH04/SH07-v02/v03/v04 содержит «no 3D render, no CGI» — прямое противоречие `[Style]` того же плана; уходит провайдеру на каждой попытке.
6. `on_model` гейт выключен во всех 17 ассетах (`"gate off (loose)"`) — единственный детектор плоскости/прозрачности не работал.
7. Порог `KEEP_ATTEMPT_SCORE_THRESHOLD = 85` не взят ни разу за 63 генерации (максимум 77); все 9 референсов приняты через `keep-best` при `REGENERATE_EXHAUSTED`.
8. SH07-v4 и SH01-v2 приняты по фолбэку `approvePassReview` (синтетические 100/100/100, `gag: null`) — критик был пропущен, а не удовлетворён.
9. Временнáя цепочка якорей отсутствует у всех 9 шотов; единственный пространственный якорь эпизода — SH02, кадр с CRITICAL «Sandy … dark body instead of clear flat-glass transparent» и «room is too dark overall». Дефект транслируется в SH03–SH09.
10. `anchor_image_asset_id` = первый персонаж, не якорь; `source_bible_refs` не содержит continuity-рефов — метаданные вводят в заблуждение при разборе.
11. Ручная правка на «ночь» выполнена вставкой без удаления старого текста → в SH03/SH06/SH07-v03 промпт содержит одновременно «reads dark» и «soft cartoon key light from above» / «cartoon ambient per Bible baseline».
12. `shot_reference.review` описывает последнюю попытку, а в ассет уехали пиксели другой (SH03 → v1, SH04 → v2) — Директор в дровере читает отзыв не о той картинке.
13. Заявленный `plan_variants_count: 2` («Pilot mode … Director selects composition before fanout») не исполнен ни в одном шоте — двухвариантного фан-аута не было.
14. Один и тот же дефект чинится по 4–10 ретраев подряд без памяти между попытками и между версиями ассета; перерасход $5.04 против плановых $0.54 (×9).
