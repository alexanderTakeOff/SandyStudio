# E18 — Ref-Animatic Removal: Analysis & Removal Blueprint

> Собрано 2026-07-09 (сессия Тео, ветка `teo/e18-smoke`) тремя read-only Explore-агентами.
> **Статус: ПРИПАРКОВАНО.** Возвращаемся СВЕЖЕЙ сессией ПОСЛЕ дискретных фиксов (D1/D2/D3b/D14/D15).
> Директива Директора: реф-аниматик — задача с большим радиусом поражения, делать её
> отдельно и с чистой головой. Этот док написан так, чтобы свежий агент исполнил «с холода».
>
> Пары: `docs/analysis/E18-fix-plan.md` (§БАКЕТ 3 — D6/D7), `E18-run-defects.md` (D6, D7).

---

## 0. TL;DR — что это на самом деле

**Отдельного класса «реф-аниматик» в коде НЕТ.** Есть **один** asset `file_type =
'VID-animatic'`, чей `metadata.animatic_v1` хранит `AnimaticContract` (EDL — список
шотов, длительности, тримы, аудио, exclusion). Один и тот же React-компонент
`AnimaticPlayer` рисует обе ипостаси:

| Ипостась | Где | Что различает |
|---|---|---|
| **«реф-аниматик»** (удаляем) | drawer (`AssetPreview`) + **церемония аппрува** sequential-режима | `shot_list` собран из approved `IMG-episode_ref` still-кадров; прошла review→approve церемония |
| **«видео-аниматик / таймлайн»** (ОСТАЁТСЯ) | таймлайн эпизода (`EpisodeTimelineSection`) | тот же контракт, играет реальные `VID-shot` mp4; служит EDL финал-ката |

**Вывод, меняющий рамку задачи:** мы удаляем НЕ класс, а **церемонию sequential-режима
+ standalone drawer-поверхность**. Контракт `animatic_v1` и asset `VID-animatic` —
**несущие, остаются**. Parallel-режим (на нём шёл E18) церемонию УЖЕ не имеет — он
готовый рабочий образец нужного нам teardown.

---

## 1. Что «висит» на аниматике (несущий контракт — НЕ удалять)

`animatic_v1` — единственный источник правды для финального монтажа:

- **EXEC-STITCH читает его напрямую как EDL** — `webapp/lib/agents/runner.ts:2485-2629`
  (грузит APPROVED `VID-animatic` на `:2494`, `director_overrides` `:2565`, exclusion
  `:2568`, `computeEffectivePlayback`→`inpoint/outpoint` `:2606-2625`). Без него кидает
  `'EXEC-STITCH: no APPROVED VID-animatic with animatic@v1 found'` (`:2491`).
- **Duration-lock Animator-критика** — `webapp/lib/agents/runners/animator-critic.ts:389-412`
  (`lockedAnimaticDuration` фильтрует `.eq('file_type','VID-animatic')`); применение
  оверрайдов к длине рендера — `runner.ts:1860-1893`.
- **Concierge shot-reorder tool** — `webapp/lib/concierge/tools/shot-reorder.ts:176-251`
  атомарно свопает `shot_list` в storyboard И аниматике; hard-fail `no_animatic` без него.
- **Контракт-математика** (переиспользуется UI + route + stitch) —
  `webapp/lib/api/animatic-shotlist.ts`: `effectiveDurationSeconds` (`:200`),
  `computeEffectivePlayback` (`:281`), `computeTotalDuration` (`:312`),
  `clipLengthsFromVidShotRows` (`:336`), `isDeletedShot`/`DELETED_SHOT_MAX_SECONDS=0.5`,
  `excludedShotIdsFromEpisodeMeta`.
- **Материализатор EDL** — `webapp/lib/api/ensure-animatic.ts::ensureEpisodeAnimaticEDL()`
  (`:40-153`): строит структурно-идентичный `animatic_v1` из approved storyboard +
  approved EREF и пишет его **сразу APPROVED, без церемонии**. Это механизм, которым
  parallel-режим держит EDL живым. **На нём же будет держаться D6-фикс.**

> ⚠️ Правило: удаляем церемонию/гейт/drawer — контракт и материализатор сохраняем.

---

## 2. Церемония «реф-аниматика» = суть sequential-режима

Пайплайн-режим: `webapp/lib/api/pipeline-mode.ts` — `PipelineMode='sequential'|'parallel'`,
хранится в `episodes.metadata.pipeline_mode`, **дефолт `'sequential'`** (`:17-30`).
Комментарий (`:5-9`): parallel = «video НЕ гейтится на pre-approved animatic».

**Церемония (только sequential):**
1. **Авто-fire создания** — `webapp/lib/agents/next-events.ts:1024-1069`: при APPROVED
   `IMG-episode_ref` (EREF v1) + `AUD-music` фаерит `sandystudio/exec-edit/create-animatic`.
   (EREF v2 per-shot НЕ авто-фаерит — нужен явный advance-route ниже.)
2. **Ручной «Advance to Animatic»** — `webapp/app/api/episodes/[id]/eref/advance/route.ts:59-128`
   (валидирует 1-shot-1-approved, фаерит create-animatic). Кнопка — `EREFPilotPillbar.tsx:339-345`.
3. **FSM-гейт** — `webapp/supabase/migrations/0001_enums.sql:21-24` (`ANIMATIC_IN_PROGRESS/
   REVIEW/REVISION/APPROVED`; L9 «ANIMATIC_APPROVED is the generation gate — nothing
   generates until set»); переходы — `webapp/lib/api/status-transitions.ts:85-89`
   (`STORYBOARD_APPROVED→ANIMATIC_*→GENERATION_IN_PROGRESS`, «hard gate per Phase 4»).
4. **Аппрув-поверхность** — footer Approve/Reject в `AnimaticPlayer.tsx:1971-1999`
   (виден пока `animaticStatus ∈ {undefined,REVIEW,DRAFT}`); generic
   `webapp/app/api/assets/[id]/approve/route.ts:336-371` флипает эпизод в `ANIMATIC_APPROVED`.
5. **Гейт VGEN на аниматик** — `webapp/lib/agents/gate.ts:189-194`
   (`EXEC-VGEN` требует APPROVED `VID-animatic`).
6. **Мастер-fanout на аппрув** — `next-events.ts:1080-1252` (`ft==='VID-animatic'`):
   запускает VGEN pilot pass / per-shot Animator-планы, `pickPilotVgenShots`.

**Parallel уже всё это снимает (образец teardown):**
- Гейт-оверрайд — `gate.ts:492-518` (Step 0a): в parallel фильтрует `VID-animatic` из
  требований EXEC-VGEN.
- Роутер-edge — `next-events.ts:1000-1022`: в parallel APPROVED `IMG-episode_ref` фаерит
  `exec-vanim/plan` напрямую, «WITHOUT waiting for a whole-episode animatic». Комментарий
  `:1005`: «Sequential mode is untouched (refs wait for the animatic gate)».
- STITCH-completeness — `next-events.ts:1322-1406`: на APPROVED `VID-shot` зовёт
  `ensureEpisodeAnimaticEDL` (`:1337`), потом фаерит stitch когда все не-excluded шоты
  имеют APPROVED `VID-shot` (`:1375`); music-precondition `:1384-1402`.

---

## 3. D6 — корень и фикс

**Симптом (Директор):** в универсальном (video-)аниматике РАНЬШЕ был блок правки
длительности кадров — ИСЧЕЗ.

**Корень:** duration-editor — это **общий блок внутри `AnimaticPlayer`**
(`setDuration` `:844-858`, `setTrimStart` `:863-889`, `handleSaveTiming` `:896-937` →
`PATCH /api/assets/[id]/animatic-timing`). Он **уже на таймлайне** — но скрыт флагом
**`!synthetic`** (`AnimaticPlayer.tsx:1831,1849,1976`). `synthetic=true` когда реального
`VID-animatic` нет и таймлайн рисует **скелет из storyboard** (`EpisodeTimelineSection.tsx:242-280`).
PATCH-route отвергает всё кроме `VID-animatic`+`animatic_v1` (`animatic-timing/route.ts:171-180`),
т.к. синтетическому контракту нет backing-asset для записи.

В **parallel** EDL материализуется поздно — только на stitch-гейте
(`next-events.ts:1337`, на APPROVED `VID-shot`). Значит во время видео-стадии таймлайн
синтетический → **редактор длительности скрыт**. Вот и «исчез».

**Фикс (НЕ «переселение» — редактор уже там):** материализовать `VID-animatic` EDL
**рано**, чтобы `!synthetic` включился и редактор жил всю видео-стадию. Два способа:
- **(i) ранняя материализация** через `ensureEpisodeAnimaticEDL` на более раннем триггере
  (напр. `STORYBOARD_APPROVED` или первый approved EREF). Проще, переиспользует хелпер.
  Длительности сидятся из storyboard → редактор полезен сразу.
- **(ii) materialize-on-first-edit** (ленивая, «Phase 3» TODO уже в коде —
  `EpisodeTimelineSection.tsx:276`, `AnimaticPlayer.tsx:150-158`): при первой правке
  длительности на синтетическом контракте создать EDL тогда. Элегантнее, но больше кода.

Рекомендация: **(i)** — субтрактивнее, один существующий хелпер.

---

## 4. D7 — ИСПРАВЛЕННОЕ понимание

**Прежняя (неверная) формулировка** в defect-логе: «кнопки/кебаб анимируются в Mode 3 —
баг рождён реф-аниматиком, уйдёт с ним». 

**Директор уточнил 2026-07-09:** проблема в том, что **цветовая индикация статусов +
glow процессов у кнопок сейчас ПРОПАДАЕТ** (это баг), и удаление реф-аниматика должно
**починить эту пропажу** — то есть уходит ПОЛОМКА индикации, а не сама индикация.

**Что нашли в коде:** сам glow ячеек таймлайн-полосы — интенциональный индикатор «идёт
работа по шоту»: `webapp/lib/api/pipeline-stages.ts::liveStagePalette()` (`:520-526`,
node-safe, unit-тестируем) + CSS-токены `webapp/app/globals.css:46-49,129,189`
(«q4a — per-shot live work stages on the timeline strip»). Рендерит `AnimaticPlayer`/
`EpisodeTimelineSection`. Он **живёт в таймлайн-полосе, которая ОСТАЁТСЯ** как
видео-аниматик.

**Следствие для плана:** удаление церемонии само по себе индикацию НЕ трогает.
Нужно понять, ГДЕ индикация «пропадает» (вероятно на синтетическом контракте /
до материализации EDL — та же `!synthetic`-развилка, что и D6) и починить там же.
**D7 сцеплен с D6** через флаг `synthetic`: ранняя материализация EDL, вероятно,
чинит и пропажу индикации. Проверить на возврате.

---

## 5. Полный якорный инвентарь (что править/проверить при удалении)

| Концерн | Якорь |
|---|---|
| Единственный asset-тип + контракт | `VID-animatic` / `animatic_v1` — `animatic-shotlist.ts:17,159`; `factory.ts:119`; CHECK generic `VID-` в `migrations/0011_phase5c_fixes.sql:20-26` (спец-enum'а НЕТ, дропать нечего) |
| REF-builder (то самое «ref») | `animatic-shotlist.ts:448-503` `buildShotListFromApprovedEREF`; anchor-вариант `:522-643` |
| Runner-производитель | `runner.ts:1642-1731` (EXEC-EDIT); `runners/animatic-slideshow.ts:319,480` |
| Sequential авто-fire create | `next-events.ts:1024-1069` |
| EREF-v2 ceremony trigger | `app/api/episodes/[id]/eref/advance/route.ts:59-128`; кнопка `EREFPilotPillbar.tsx:339-345` |
| FSM-гейт | `migrations/0001_enums.sql:21-24`; `status-transitions.ts:61-64,85-89`; `types.gen.ts:1055-1058,1224-1227` |
| Гейты, требующие аниматик | `gate.ts:189-194` (VGEN), `:208-218` (STITCH); оверрайды `:468-490` (anchor), `:492-518` (parallel) |
| Мастер-fanout на аппрув | `next-events.ts:1080-1252` |
| Материализатор EDL (parallel-образец) | `ensure-animatic.ts:40-153`; вызовы `next-events.ts:1318,1337` |
| Single-approved slot | `single-approved.ts:180-193` (`VID-animatic%` auto-supersede) |
| Duration-editor UI | `AnimaticPlayer.tsx:844-937` (edit), `:1849-1965` (блок), `!synthetic` гейты `:1831,1849,1976` |
| Duration PATCH-route | `app/api/assets/[id]/animatic-timing/route.ts:67-81,171-244` |
| Таймлайн synthetic↔real | `EpisodeTimelineSection.tsx:215-231,242-280,782-813` |
| STITCH как EDL-consumer | `runner.ts:2485-2629`; провайдер `providers/ffmpeg-stitch.ts:549-574` (`inpoint/outpoint`) |
| D7 glow | `pipeline-stages.ts:502-526` `liveStagePalette`; `globals.css:46-49,129,189` |
| Прочие API-роуты на `VID-animatic` | `assets/[id]/approve` `:336-371,592`; `upload-music` `:92-99`; `upload-music-direct`; `episodes/[id]/vgen/state` `:79-104`; `vgen/generate-single-shot` `:86-107`; `episodes/[id]/trigger` `:47,107-182`; `skip-music`; `shot-exclusion`; `archive` `:87-97` |
| Concierge-инструменты | `tools/shot-reorder.ts:176-251`; `tools/pipeline.ts:237`; `system-prompt-builder.ts:122,148` |
| Pipeline-row/kebab UI | `StageKebabMenu.tsx:53`; `pipeline-stages.ts:39,216,242,268`; `episodes/[id]/page.tsx:199,390,798`; `VGENPilotPillbar.tsx:113`; `EpisodeSettingsCard.tsx:337-345` |
| Тесты (обновить/снять) | `__tests__/agents/gate-pipeline-mode.test.ts`; `api/pipeline-stages.test.ts`; `api/status-transitions.test.ts`; `lib/api/ensure-animatic.test.ts`; `lib/api/animatic-shotlist-*.test.ts` (×4); `runners/animator-critic-duration-lock.test.ts`; `agents/mock-providers.test.ts:87`; `concierge/tools/shot-reorder.test.ts`; `lib/api/timeline-cell-resolver.test.ts`; `providers/ffmpeg-stitch.test.ts`; `providers/music-processor.test.ts` |

**`reconcile.ts` — ноль ссылок на animatic** (grep чист): удаление его не трогает.

---

## 6. ⭐ ОТКРЫТАЯ РАЗВИЛКА — первое решение на возврат

Директор отложил выбор масштаба (dismiss q3). Зафиксировано как gating-решение:

- **(а) убить sequential-режим целиком, parallel единственный** — рекоменд., чистое
  вычитание (anti-additivity): исчезают церемония, FSM-гейт `ANIMATIC_*`, кнопка
  Advance-to-Animatic, drawer-поверхность, конфиг `pipeline_mode`, ветки-близнецы в
  gate.ts/next-events. Контракт EDL живёт. **Минус:** replay-pilot гоняет sequential
  (`gate.ts` комментарий) — перевести на parallel; подтвердить что sequential нигде не
  нужен (дефолт sequential, но реальные прогоны parallel → похоже легаси/stale-дефолт).
  Самый большой diff, но буквально «убрать класс».
- **(б) минимум** — только D6 (ранняя материализация EDL) + снять standalone drawer;
  sequential не трогать. Малый безопасный diff, но «класс» частично остаётся.
- **(в) оба режима, церемонию вон из обоих** — сводит поведение, но mode-переключатель
  теряет смысл → сползает к (а) с лишним мёртвым кодом.

**Рекомендация Тео: (а).** Но подтвердить у Директора «sequential мёртв?» ПЕРЕД резкой —
это единственное, что делает (а) безопасным.

---

## 7. Порядок исполнения на возврат (эскиз, уточнить после выбора масштаба)

1. Подтвердить развилку §6 + «sequential мёртв».
2. **D6 сначала** (общий и низкорисковый): ранняя материализация EDL через
   `ensureEpisodeAnimaticEDL` → duration-editor виден всю видео-стадию. Проверить,
   чинит ли заодно D7-пропажу индикации (общий флаг `synthetic`).
3. Если масштаб (а): снять церемонию — авто-fire create-animatic, FSM-гейт, кнопку
   Advance, VGEN-гейт на `VID-animatic` (сделать безусловным как в parallel), drawer.
   Свести `pipeline_mode` к parallel; перевести replay-pilot; обновить ~15 тестов.
4. Verify: `tsc` · `vitest` (обновить animatic-тесты) · `replay-pilot` (перевести на
   parallel-путь) · ручной E2E прогон таймлайна (редактор длительности виден рано,
   финал-кат собирается, индикация статусов не пропадает).

---

## Cross-refs
- `docs/analysis/E18-fix-plan.md` §БАКЕТ 3 (D6/D7).
- `docs/analysis/E18-run-defects.md` D6, D7 (+ исправление D7 здесь §4).
- Memory: `backlog_animatic_dedup_ref_vs_video`, `backlog_shot_centric_paradigm`,
  `backlog_per_shot_video_eligibility`, `backlog_td_kebab_plan_critic_lines`.
