# G — Аудит ВИДЕО-ветки: тот же дефект или нет

Дата: 2026-07-29 · Режим: только чтение · Репозиторий: `C:\SandyStudio\.claude\worktrees\showrunner-pragmatic-c77b43`

---

## Вердикт

**В ВИДЕО ветке того же дефекта НЕТ.** Ни один критик видео-цепочки не умеет возвращать
переписанный промпт, и рантайм видео физически не имеет переменной, которую можно перезаписать:
VGEN получает **указатель на план** (`planAssetId`), а не строку промпта, и перечитывает план из БД
на каждой попытке (`webapp/lib/agents/runner.ts:2139-2158`).

Подтверждено данными E33: SH01 рендерился дважды, промпт обеих попыток **побайтово одинаков**
(2675 символов, совпадающий sha256) — против 6000-8400 → 1400-2000 в ветке картинок.

Точек перезаписи промпта текстом критика во всей кодовой базе — **три, все три в ветке КАРТИНОК**.
В видео — **ноль**.

Побочный вывод, который важнее вердикта: ветка видео **уже реализует правильный аддитивный
паттерн** (план перевыпускается автором с замечаниями критика как HARD CONTRACT). Чинить надо не
видео — надо ветку картинок привести к тому, что видео уже делает.

---

## Полный список мест перезаписи промпта

| файл:строка | что перезаписывается | чем | обрезка есть? |
|---|---|---|---|
| `webapp/lib/agents/runners/episode-references.ts:2572` | `prompt` — план Дизайнера (6000-8400 симв.), полностью | `latestReview.suggested_prompt_v2` — пересказ ревьюера EREF | **ДА, двойная.** LLM инструктирован `≤ 1200 chars` (`eref-check.ts:154,176`) + жёсткий `.slice(0, 2000)` (`eref-check.ts:402`) |
| `webapp/lib/agents/runners/episode-references.ts:2330` | `prompt` — план Дизайнера, полностью | `guardResult.suggested_prompt` — переписка Style Guardian | **ДА, и хуже.** Guardian инструктирован `< 800 chars` (`style-check.ts:115,123`), и при этом **видел только первые 2000 символов** промпта (`style-check.ts:142` `args.prompt.slice(0, 2000)`) — переписывает 6000-символьный план, прочитав его треть |
| `webapp/app/api/assets/[id]/regenerate-image/route.ts:506` | `promptToSend` — промпт, введённый Директором в UI | `result.suggested_prompt` — тот же Style Guardian | **ДА**, те же `< 800 chars` + `slice(0,2000)` на входе |
| `webapp/lib/agents/runner.ts:2158` | *(не перезапись)* `planPrompt = parsedPlan.prompt` | чтение плана из БД | нет. Единственное присваивание в ВИДЕО-пути — это **чтение свежего плана**, не мутация |

Метод поиска (для воспроизводимости): по всему `webapp` (`lib`, `app`, `components`) искались
присваивания вида `^\s*(prompt|promptToSend|finalPrompt|planPrompt|basePrompt)\s*=` вне объявлений,
плюс `suggested_prompt`, `promptV2`, `prompt_v2`, `rewrite`. Совпадений ровно четыре — три выше плюс
чтение из БД. Также проверены все `.slice(0, N)` рядом с промптами и полями критиков.

**Что это значит для правки:** правка в одном месте НЕ накроет проблему. Точек три, и все три
делают одно и то же — заменяют утверждённый план коротким пересказом. Guardian-точки (2330 и 506)
опаснее ревьюерной, потому что порог там 800 символов, а не 1200.

**Смягчающее обстоятельство:** режим Style Guardian по умолчанию `warn`
(`webapp/lib/api/style-guardian-config.ts:18` — `DEFAULT_STYLE_GUARDIAN_MODE = 'warn'`), а перезапись
включается только в `auto_rewrite` (`style-guardian-config.ts:17`). Значит точки 2330 и 506 сейчас,
вероятно, спят — но это настройка в БД (`app_config.style_guardian_mode`), а не гарантия кода.
Проверить фактическое значение в проде стоит отдельно.

---

## Видео-ветка по шагам

### 1. Откуда берётся промпт видео

Автор промпта — Аниматор (`EXEC-VANIM`), `webapp/lib/agents/runners/animator.ts:1011`. Он пишет
план-ассет `SPC-shot_plan-<shot>`, внутри которого fenced ```json блок с полем `prompt`
(контракт `webapp/lib/api/shot-plan-contract.ts:120`).

Промпт собирается ОДИН раз из полного контекста: раскадровка + Библия + delivery targets + anchor
chain (`animator.ts:926-1008`). Ни один критик его после этого не трогает.

### 2. Что происходит при рендере

`webapp/lib/agents/runner.ts:2038-2158` — плановая ветка EXEC-VGEN:

```
webapp/lib/agents/runner.ts:2139
        const parsedPlan = parseShotPlanContract(content);
webapp/lib/agents/runner.ts:2158
        planPrompt = parsedPlan.prompt;
```

`content` берётся из строки БД, загруженной по `planAssetId` **в этом же вызове**
(`runner.ts:2059-2063`). Никакой переменной, пережившей предыдущую итерацию, здесь нет — цикла
retry в видео-рантайме вообще не существует.

Более того, при несовпадении статуса плана рантайм не подставляет старое значение, а **переразрешает
актуальный APPROVED план шота из БД** (`runner.ts:2093-2131`, «stale plan id healed») — то есть
логика намеренно тянется к свежайшему плану, а не к закешированному.

Жёсткие отказы вместо тихого падения: `runner.ts:2140-2149` бросает исключение, если план не
парсится или `prompt` пуст, — «Refusing silent storyboard fallback».

### 3. Что происходит при повторной генерации

Ретрай — это НЕ внутренний цикл, а новое событие Inngest с тем же `planAssetId`:

```
webapp/lib/concierge/tools/vgen-execute.ts:138-145
        payload: {
          shotId: args.shotId,
          planAssetId: args.planAssetId,
        }
```

Полезная нагрузка — два идентификатора. Строки промпта в ней нет вообще. Следовательно, механически
невозможно, чтобы вторая попытка получила укороченный промпт.

### 4. Критик видео

Их три, и **ни один не возвращает переписанный промпт**:

- **EXEC-VPREV** (критик плана) — `webapp/lib/agents/runners/animator-critic.ts`. Отдаёт
  `verdict / failed_checks[{check,diagnosis}] / passed_checks / warnings / acceptance_criteria`
  (`animator-critic.ts:611-615`). Поля `suggested_prompt*` в контракте нет — проверено грепом по
  всему `webapp`, совпадений в видео-файлах ноль.
- **EXEC-CREAD** (читаемость, фаза `vanim`) — тот же shape: чек-лист, не текст промпта.
- **EXEC-VCRIT** (визуальный критик по кадрам) — `webapp/lib/agents/runners/visual-shot-critic.ts`.
  Строго **advisory**: «never changes asset status and never blocks» (`visual-shot-critic.ts:9-10`),
  пишет только `activity_event` с `findings[]` (`visual-shot-critic.ts:255-274`).

Что рантайм делает с вердиктом REVISE: **перевыпускает план целиком через автора**, приложив
замечания критика как жёсткий контракт:

```
webapp/lib/agents/reconcile-execute.ts:296-305
          bullets = ... await collectShotCriticNotes(supabase, episodeId, action.shotId);
        const revisionNote = mergeRevisionNote(null, bullets);
        events.push({ name: '...exec-vanim/plan', data: { episodeId, shotId, revisionNote } });
```

И Аниматор вкладывает `revisionNote` **дополнительной секцией**, не трогая остальной контекст:

```
webapp/lib/agents/runners/animator.ts:972-980
    revisionNote
      ? [ '## Revision request from Critic / Director — HARD ACCEPTANCE CRITERIA', '',
          revisionNote, '',
          'Treat each item above as a HARD CONTRACT. Re-derive — do not "minimally tweak"...' ]
```

То же на ручном пути: REQUEST_REVISION на плане шота → `app/api/assets/[id]/approve/route.ts:504-518`
собирает замечания критиков, мержит с запиской Директора и шлёт Аниматору. Промпт при этом не
трогается — он рождается заново из полного контекста.

### 5. Style Guardian к видео не подключён

Все вызовы `runStyleCheck` — только в ветке картинок:
`webapp/lib/agents/runners/episode-references.ts:2306`,
`webapp/app/api/assets/[id]/regenerate-image/route.ts:481`,
`webapp/app/api/style-check/route.ts:41` (отдельная диагностическая ручка).
В видео-рантайме его нет, значит и «переписки на 800 символов» там взяться неоткуда.

---

## Данные E33 — что видно фактически

До видео дошли два шота: SH01 и SH02.

| ассет | file_type | статус | v | длина `metadata.prompt` | sha256 промпта |
|---|---|---|---|---|---|
| `SS-S15-E33-VID-shot-s15-e33-sh01-v01-REVISION.mp4` | `VID-shot-s15-e33-sh01` | REVISION | 1 | **2675** | `65507804f54548f5…` |
| `SS-S15-E33-VID-shot-s15-e33-sh01-v02-DRAFT.mp4` | `VID-shot-s15-e33-sh01` | REVIEW | 2 | **2675** | `65507804f54548f5…` |
| `SS-S15-E33-VID-shot-s15-e33-sh02-v01-DRAFT.mp4` | `VID-shot-s15-e33-sh02` | REVIEW | 1 | **2619** | `e726e9b1923de964…` |

Источник: `03-media-metadata.json`. **Промпты первой и второй попытки SH01 идентичны побайтово.**
Массивов `generation_history` / `retry_history` / `attempts` у видео-ассетов нет вовсе — попытки
живут отдельными строками ассетов.

Совпадение с планом:

| план | размер файла | размер json-блока | длина `prompt` | sha256 |
|---|---|---|---|---|
| `…SPC-shot_plan-S15-E33-SH01-v01-DRAFT.md` | 10 133 | 5 475 | **2 675** | `65507804f54548f5…` |
| `…SPC-shot_plan-S15-E33-SH02-v01-DRAFT.md` | 9 844 | 5 552 | **2 619** | `e726e9b1923de964…` |

Хэш промпта в плане **совпадает с хэшем промпта в обоих видео** — план дошёл до провайдера целиком и
без потерь, дважды. Планы остались в `v01`, то есть между попытками не перевыпускались.

Задания (`05-jobs.json`), три вызова EXEC-VGEN:

| job | shot | `input_snapshot` |
|---|---|---|
| 27 | SH01 попытка 1 | `shotId, episodeId, planAssetId=77c1ab72…, duration_seconds=4` |
| 64 | SH01 попытка 2 | `shotId, episodeId, planAssetId=77c1ab72…, regenerate=true` |
| 25 | SH02 попытка 1 | `shotId, episodeId, planAssetId=4cb7d9af…, duration_seconds=4` |

**Ни в одном `input_snapshot` нет поля `prompt`.** Обе попытки SH01 указывают на один и тот же
неизменённый план.

Критики E33 (`REV-shot_plan-…SH01-v01`, `REV-readability-vanim-…sh01-v02`) — вердикты PASS, набор
ключей `verdict / plan_asset_id / shot_id / failed_checks / passed_checks / warnings /
acceptance_criteria / estimated_cost_usd`. Полей `suggested_prompt`, `suggested_prompt_v2`,
`prompt_v2`, `rewritten_prompt` нет ни в одном.

По `06-activity-events.txt` (202 события): 31 видео-событие, регекс на
`suggested_prompt|prompt_v2|rewritten_prompt|rewrite|revised_prompt` даёт **0 совпадений**.
Ретрай SH01 подписан «EXEC-VGEN (plan-driven)».

### Наблюдение, выходящее за рамки задания

Записка Директора при REQUEST_REVISION на SH01 была `"Please regenerate with adjusted settings"`, и
она **никуда не поехала**: повторный вызов ушёл с тем же `planAssetId` и без `revisionNote`. Плюс
`seed_strategy.mode="random"`. То есть вторая попытка отличалась от первой **только сидом** — это
пере-бросок кубика, а не исправление. Дефект другого рода, чем в картинках (там правка ломала план,
здесь правка вообще не доезжает), но он тоже реальный и стоил денег ($0.968 за попытку).

Ветка REQUEST_REVISION на `VID-shot-*` в `app/api/assets/[id]/approve/route.ts:487-488` покрывает
только `SPC-shot_plan*` и `REV-shot_plan*` — сам отрендеренный `VID-shot` в неё не попадает
(комментарий на `route.ts:486`: «VID-shot regen stays on /regenerate-video»). А
`app/api/assets/[id]/regenerate-video/route.ts:219-223` строит промпт из
`body.prompt ?? buildShotPromptV2(storyboardShot, …)` — **утверждённый план там не читается вообще**,
то есть ручной ре-рендер видео из UI откатывается на легаси-шаблон раскадровки. Это «план теряется»
той же семьи, что и аудируемый дефект, хотя механизм другой. Стоит завести отдельно.

---

## Существующий паттерн склейки — есть, переиспользовать

Правильная аддитивная склейка **уже написана и работает**, причём именно в видео-ветке:

```
webapp/lib/api/critic-notes.ts:171-183
export function mergeRevisionNote(
  directorNote: string | null | undefined,
  criticBullets: string[],
): string | null {
  const parts: string[] = [];
  const note = typeof directorNote === 'string' ? directorNote.trim() : '';
  if (note) parts.push(note);
  if (criticBullets.length > 0) {
    parts.push('Critic acceptance criteria (hard contract — satisfy each):');
    for (const b of criticBullets) parts.push(`- ${b}`);
  }
  return parts.length > 0 ? parts.join('\n') : null;
}
```

Сопутствующие сборщики замечаний, тоже готовые:
`collectRefCriticNotes` (`critic-notes.ts:78`) для ветки картинок и
`collectShotCriticNotes` (`critic-notes.ts:127`) для видео. Оба вытаскивают
`acceptance_criteria` + `failed_checks` (`critic-notes.ts:41-63`) и уже умеют плоско разворачивать
как строки, так и объекты `{check, diagnosis}`.

Действующие потребители: `reconcile-execute.ts:296-301` (автоматический реконсилер) и
`app/api/assets/[id]/approve/route.ts:455-460` и `:504-509` (ручные REQUEST_REVISION).

Смысл функции ровно тот, что нам нужен: **база остаётся целой, замечания критика приклеиваются
снизу как жёсткий контракт**. Ничего нового писать не надо — надо позвать её из ветки картинок.

Симметричный «инъекционный» паттерн на стороне автора тоже уже есть в обеих ветках:
`animator.ts:972-980` и `episode-reference-designer.ts:628-635` — секция
«HARD ACCEPTANCE CRITERIA» добавляется к сообщению, а не заменяет его.

---

## Минимальная правка

Общая для обеих веток правка невозможна и не нужна: в видео чинить нечего. Правка — **только в трёх
точках ветки картинок**, и она по-настоящему вычитающая: удаляем канал «критик переписывает промпт»
целиком и переиспользуем уже существующий `mergeRevisionNote`.

### Шаг 1 — ретрай ревьюера (главная точка, объясняет наблюдение Директора)

| файл:строка | действие |
|---|---|
| `webapp/lib/agents/runners/episode-references.ts:2570-2572` | **УДАЛИТЬ** `prompt = latestReview.suggested_prompt_v2;` вместе с комментарием «Reviewer's rewrite replaces the prompt body» |
| `webapp/lib/agents/runners/episode-references.ts:2562` | условие `latestReview.suggested_prompt_v2` **заменить** на наличие `latestReview.issues.length > 0` |
| там же, вместо удалённой строки | `prompt = mergeRevisionNote(basePrompt, issueBullets) ?? basePrompt;` где `basePrompt` — неизменный `planOverrides.prompt` (зафиксировать в `const` рядом с `episode-references.ts:2298`), а `issueBullets` — `latestReview.issues.map(i => \`${i.area}/${i.severity}: ${i.description} → ${i.fix_hint}\`)` |
| `webapp/lib/api/critic-notes.ts` | **ничего не менять** — импортировать `mergeRevisionNote` |

Ключевое: `basePrompt` берётся из плана и НИКОГДА не переприсваивается. Каждая попытка = план +
накопленные замечания. Промпт растёт, а не схлопывается — то самое поведение, которое видео уже
имеет и которое даёт стабильное качество между попытками.

### Шаг 2 — убрать сам канал переписывания (вычитание)

Поле `suggested_prompt_v2` после шага 1 остаётся без потребителя. Удалить его целиком:

| файл:строка | действие |
|---|---|
| `webapp/lib/agents/runners/eref-check.ts:400-403` | **УДАЛИТЬ** парсинг поля вместе с `.slice(0, 2000)` — обрезка исчезает вместе с полем |
| `webapp/lib/agents/runners/eref-check.ts:144,148,154,176` | **УДАЛИТЬ** упоминания `suggested_prompt_v2` из системного промпта и схемы; вердикт `REGENERATE` начинает опираться на `issues[].fix_hint` (≤200 симв.), которые уже есть в контракте (`eref-check.ts:173`) |
| `webapp/lib/agents/runners/eref-check.ts:118`, `webapp/lib/api/shot-reference.ts:186` | **УДАЛИТЬ** поле из типа `EREFReview` |
| `webapp/lib/agents/runners/episode-references.ts:2499` | **УДАЛИТЬ** `suggested_prompt_v2: null` из fallback-объекта |

Выигрыш: одна LLM-выдача становится короче и дешевле, исчезает «второй источник истины» на промпт,
исчезает единственная в проекте жёсткая обрезка промпта.

### Шаг 3 — Style Guardian (две оставшиеся точки)

Рекомендую **удалить режим `auto_rewrite`**, а не чинить его. Обоснование: Guardian принимает
решение, прочитав первую треть промпта (`style-check.ts:142`), а возвращает замену на 800 символов
(`style-check.ts:115`) — это структурно негодный канал, «починка» означала бы снятие обеих обрезок и
превращение Guardian во второго автора промпта. Дефолт уже `warn`
(`style-guardian-config.ts:18`), то есть режим сейчас, скорее всего, не используется.

| файл:строка | действие |
|---|---|
| `webapp/lib/agents/runners/episode-references.ts:2323-2332` | **УДАЛИТЬ** ветку `auto_rewrite` (присваивание `prompt` + флаг `styleRewrittenPre`) |
| `webapp/app/api/assets/[id]/regenerate-image/route.ts:505-508` | **УДАЛИТЬ** ветку `auto_rewrite` (присваивание `promptToSend` + флаг `styleRewritten`) |
| `webapp/lib/api/style-guardian-config.ts:8,17,20` | **УДАЛИТЬ** `auto_rewrite` из union `StyleGuardianMode` и из `VALID_MODES` |
| `webapp/lib/agents/runners/style-check.ts:115,123,226,254` + `:45` | **УДАЛИТЬ** поле `suggested_prompt` из схемы, парсера и типа |
| `webapp/components/assets/StyleGuardianBadge.tsx:23` | **УДАЛИТЬ** поле из пропсов |

Guardian сохраняет режимы `warn` (пишет вердикт) и `strict` (блокирует FAIL) — обе полезные функции
остаются, теряется только способность молча подменить план.

**Если Директор захочет сохранить `auto_rewrite`** — минимальная альтернатива — в обеих точках
заменить присваивание на тот же `mergeRevisionNote(prompt, guardResult.issues.map(...))`, то есть
Guardian дописывает замечания, а не подменяет промпт. Это на ~10 строк больше и оставляет
режим-конфигурацию, которую всё равно почти никто не включает.

### Баланс изменений

| | добавляем | удаляем |
|---|---|---|
| файлы | 0 новых | 0 |
| функции | 0 новых (переиспользуется `mergeRevisionNote`) | 0 |
| поля контрактов | 0 | 2 (`suggested_prompt_v2`, `suggested_prompt`) |
| режимы | 0 | 1 (`auto_rewrite`) |
| обрезки промпта | 0 | 2 (`eref-check.ts:402`, косвенно `style-check.ts:142`) |
| строки, оценка | ~+12 | ~−55 |

Чистая дельта отрицательная. Обе рефлексии анти-аддитивности сработали: сначала переиспользование
(`mergeRevisionNote` уже покрывает 100% задачи), потом вычитание (канал «критик переписывает промпт»
удаляется целиком, а не обкладывается защитами).

### Что проверить после правки

1. `npx tsc --noEmit` — удаление полей контрактов затронет типы в тестах
   (`webapp/__tests__/lib/api/shot-reference-keepbest.test.ts:42` содержит `suggested_prompt_v2: null`).
2. Юнит-тест на новый инвариант: **длина промпта попытки N+1 ≥ длины попытки N** для ветки картинок.
   Это тот самый детектор, которого не было и из-за отсутствия которого дефект жил.
3. Живая проверка на одном шоте: в `generation_history` длины промптов должны идти
   неубывающей последовательностью, а не 6000 → 1400.

### Отдельно, не смешивать с этой правкой

`app/api/assets/[id]/regenerate-video/route.ts:219-223` игнорирует утверждённый `SPC-shot_plan` и
строит промпт из легаси-шаблона раскадровки. И REQUEST_REVISION на `VID-shot-*` не доносит записку
Директора до Аниматора (`approve/route.ts:487-488` не покрывает этот тип). Оба — «план теряется», но
механизм другой; чинить отдельной задачей, иначе правка расползётся.
