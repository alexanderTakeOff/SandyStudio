# H — Состояние вместо действия: почему «ещё не действующий» доезжает до провайдера (E33)

> Аудит ТОЛЬКО ЧТЕНИЕМ. Ничего не правил — ни код, ни инструкции агентов, ни БД.
> Репозиторий: `C:\SandyStudio\.claude\worktrees\showrunner-pragmatic-c77b43`. Дамп артефактов E33 — в `../`.
> Отчёт наложен на РАНТАЙМ: цитируются реальные вердикты критиков E33, а не только статика.

---

## Вердикт (5 строк)

1. **Правило «действие, а не состояние» ЗАПИСАНО — но только для прозы и только наполовину.** Дословно: `.claude/skills/storyboarder-situational-comedy/SKILL.md:62-65` — «**No internal states.** Strip every word that names a feeling. The animator draws what the camera sees». Продублировано как гейт сценария CHK-S07 (`agents/exec/script_reviewer.md:196-210`) и одной строкой в живом промпте раскадровщика `webapp/lib/agents/runners/storyboarder.ts:452`.
2. **Правило действует на ОДНО поле из трёх и обрывается на раскадровке.** Оно покрывает `action_prose`. Оно НЕ покрывает `expected_emotion` и `expected_action`, и оно НЕ передаётся вниз Аниматору — в `agents/exec/animator.md` требования «не состояние» нет вообще, поэтому слот `ACTION:` промпта Seedance пишется без него.
3. **Рядом стоит поле, которое ТРЕБУЕТ состояние — обязательно и под протокол Директора.** `expected_emotion` — MANDATORY (`agents/exec/storyboarder.md:215`), валидатор роняет раскадровку без него (`storyboarder.ts:836-838`), а его примеры в живом промпте — `"smitten"`, `"panicked"`, `"dignified composure"`, **`"oblivious"`** (`storyboarder.ts:395`). «Oblivious» — это дословно «asleep and unsuspecting» из SH02. **Контракт сам учит дефекту.**
4. **Правила «в шоте должно что-то ПРОИСХОДИТЬ» не существует нигде.** Ни один критик — ни V01–V15 (Аниматора), ни R01–R06 (читаемости), ни CHK-W01–W08 (мира), ни VCRIT — не проверяет наличие движения. R06 «no empty-motion beats» имеет ОБРАТНУЮ полярность: он карает движение без смысла, а не смысл без движения.
5. **Никто не связывает длительность с количеством действия.** Все проверки длительности — числовые границы (`1.5 ≤ d ≤ 8.0`, диапазон провайдера, равенство аниматику). **4-секундный шот, чей слот `ACTION:` описывает ноль движения, проходит ВСЕ гейты фабрики** — что и произошло на SH01 и SH02, дословно подтверждено вердиктом критика (см. §4).

**Кто обязан ловить и не ловит:** ловить обязан **EXEC-VPREV (критик Аниматора), проверка V12** — единственная во всей фабрике, которая разбирает содержимое слота `ACTION:`. Она проверяет наличие слов «initiation / termination / consequence», но не проверяет, что termination ОТЛИЧАЕТСЯ от initiation. Дыра ровно в один предикат.

---

## 1. Таблица нарушений — все 9 шотов v03 + оба плана шотов

Источники: `../body-SS-S15-E33-STB-storyboard-v03-APPROVED.md.md` (раскадровка), `../body-SS-S15-E33-SPC-shot_plan-S15-E33-SH01/SH02-v01-DRAFT.md.md` (планы шотов).

**Итого: 57 формулировок**, описывающих состояние / намерение / знание / оценку вместо наблюдаемого действия.

### SH01 — 3 с · establishing (8 нарушений)

| Поле | Цитата | Что нерисуемо | Чем заменить |
|---|---|---|---|
| `expected_emotion` baby_timer | «peacefully asleep» | «Peacefully» — оценка наблюдателя. Провайдер рисует просто закрытые глаза | «веки сомкнуты, рот приоткрыт, одна варежка соскальзывает с края люльки» |
| `expected_emotion` sandy | «exhausted relief» | Облегчение не имеет пикселей | «плечи осели, шланг-рука свесилась с матраса и качнулась» |
| `expected_action` baby_timer | «lying horizontal …, eyes closed, cream interior sand flat and still, mitten arms slack» | Ни одного глагола изменения — это ПОЗА, а не действие | «песок оседает последней струйкой и замирает; варежка сползает на 2 см» |
| `expected_action` sandy | «lying horizontal on the sandy_bed with limbs slack, eyes closed, gold sand settled into two flat still pools» | То же — статичная поза на 3 с | «золото досыпается через перешеек и гаснет; грудь опадает один раз» |
| `action_prose` | «Both sand states: STILL.» | Прямая команда неподвижности | «песок обоих ДОСЫПАЕТСЯ и останавливается в кадре» |
| `action_prose` | «Silence. Peace.» | Тишина и покой — абстракции, у них нет изображения | вырезать; настроение несёт свет и опадающая рука |
| **план шота** `ACTION:` | «both Sandy and Baby-Timer **remain fully stationary and asleep throughout the entire shot** … no sand shifting, no body movement, no twitching» | 4 секунды рендера с явным запретом на любое движение | см. §5 |
| **план шота** `policy_notes` | «Static frame justified: … **The gag contract requires total inertia in frame.**» | Оговорка про СТАТИЧНУЮ КАМЕРУ (`animator.md:191`) использована как индульгенция для неподвижности ПЕРСОНАЖЕЙ | разделить: камера статична ≠ в кадре ничего не движется |

### SH02 — 2 с · setup (12 нарушений) — шот из жалобы Директора

| Поле | Цитата | Что нерисуемо | Чем заменить |
|---|---|---|---|
| `expected_emotion` baby_timer | «**gleeful focus**» | Сосредоточенность — внутреннее. Провайдер рисует нейтральное лицо | «уши-колокольчики качнулись вперёд и звякнули; язык высунут» |
| `expected_emotion` sandy | «**asleep and unsuspecting**» | «Unsuspecting» = отсутствие знания. **Ноль пикселей.** Дословная жалоба Директора | «веки сомкнуты; линия рта дёргается и снова разглаживается» |
| `expected_action` baby_timer | «bell-ears tilted forward **with intent**, huge eyes **locked on the target**» | «With intent» и «target» — намерение и цель, а не движение | «уши качнулись вперёд одним рывком; голова опустилась к нижнему шару» |
| `expected_action` sandy | «lying horizontal on his side …, gold sand pooled flat and still» | Поза на 2 с | «песок вздрагивает от удара кулачков и оседает» |
| `action_prose` | «**the toddler has not begun to move yet**» | Дословно то, на что жалуется Директор: «ещё не начал действовать» = приказ стоять | удалить; контакт кулачков и ЕСТЬ действие |
| `action_prose` | «Sand states: BOTH STILL.» | Приказ неподвижности | «песок Сэнди проседает на ширину ладони и замирает» |
| `action_prose` | «the button **that will be pressed**» | Будущее время — не изображается | «кулачки впечатываются в шар» (настоящее, свершившееся) |
| `action_prose` | «The mitten-fists on the gold bulb **is the whole story of the shot**» | Оценка драматургии, инструкция для читателя, не для камеры | вырезать — это заметка режиссёра, а не описание кадра |
| **план шота** `ACTION:` | «Baby-Timer holds the planted-fist pose **with absolute stillness**» | Прямой приказ замереть | см. §5 |
| **план шота** `ACTION:` | «the entire tableau is **a frozen comic anticipation beat — two characters locked in perfect stillness**» | «Предвкушение» нерисуемо; «frozen» и «perfect stillness» — приказ | см. §5 |
| **план шота** `ACTION:` | «Sandy **remains motionless** …, **no reaction yet**» | Отрицательное состояние — провайдер исполняет буквально | «линия рта дёргается, глаза не открываются» |
| **план шота** `CONTINUITY:` / `NEGATIVE:` | «NO sand movement, NO open eyes» / «no sand flowing» | Негатив-лист прямо запрещает единственный оставшийся источник движения | оставить «no eyes open», снять запрет на песок |

### SH03 — 3 с · gag (3 нарушения) — самый здоровый шот эпизода

| Поле | Цитата | Что нерисуемо | Чем заменить |
|---|---|---|---|
| `expected_emotion` baby_timer | «transported delight» | Восторг «унесённый» — литература | «рот раскрыт в широкий полумесяц, уши подпрыгивают» (уже есть в `expected_action` — значит поле дублирует) |
| `expected_action` baby_timer | «both mitten-fists still on Sandy's lower bulb **after completing the push**» | Действие произошло ДО начала шота; в самом шоте персонаж держит позу | «кулачки дожимают и отскакивают от шара» |
| `action_prose` | «cream sand inside its own body **still flat and unaffected**» | Второй персонаж заморожен на 3 с | «кремовый песок подпрыгивает от толчка и оседает» |

> SH03 — эталон по Сэнди: «tips vertical», «LURCHES then commits», «eyes snap open» — всё глаголы изменения. Дефект здесь только на втором персонаже.

### SH04 — 3 с · gag (4 нарушения)

| Поле | Цитата | Что нерисуемо | Чем заменить |
|---|---|---|---|
| `expected_emotion` sandy | «weary futility snapping back to shock» | «Тщетность» не изображается | «плечи опущены → глаза распахиваются в круги» |
| `expected_emotion` baby_timer | «**confident repeat-scientist glee**» | «Учёный-повторщик» — интерпретация, не изображение | «хлопает варежками и подпрыгивает» (уже в `expected_action`) |
| `action_prose` | «lifts Baby-Timer **with weary tenderness**» | Наречия внутреннего состояния; Seedance их переинтерпретирует (`seedance-prompting/SKILL.md:44` — «verbs only») | «поднимает малыша на вытянутых шлангах, руки провисают» |
| `action_prose` | «Baby-Timer **STILL throughout its own body**» | Второй персонаж заморожен весь шот | «кремовый песок мотает из шара в шар при переноске» |

### SH05 — 3 с · gag (6 нарушений)

| Поле | Цитата | Что нерисуемо | Чем заменить |
|---|---|---|---|
| `expected_emotion` sandy | «grim exhausted **ingenuity**» | Изобретательность — свойство ума | «сдувает пыль с варежек, кивает один раз» |
| `expected_emotion` baby_timer | «cheerful **conquest**» | Завоевание — оценка исхода | «скалится, язык вываливается» |
| `expected_action` sandy | «**having just stacked** cushions …, dusting his mitts with **a satisfied nod**» | Действие в прошедшем совершенном — оно вне шота; «satisfied» — состояние | «ставит последнюю подушку, отряхивает варежки, кивает» |
| `action_prose` | «Baby-Timer **surveys** the cushion wall for a beat **with head-tilt curiosity**» | «Осматривает» и «любопытство» — когниция | «наклоняет голову вправо, потом влево» |
| `action_prose` | «the toddler's body **barely registers the fall**» | «Registers» — восприятие, не изображение | «песок не шелохнулся при падении» |
| `action_prose` | «still upright, huge grin, …, **ready to continue**» | Готовность — намерение на будущее | «отряхивается и делает шаг к кровати» |

### SH06 — 4 с · gag (7 нарушений) — второй по тяжести

| Поле | Цитата | Что нерисуемо | Чем заменить |
|---|---|---|---|
| `expected_emotion` sandy | «**purgatorial exhaustion — neither asleep nor awake**» | Чистилище и «ни то ни сё» — философия, не картинка | «веки на половине, зрачки не в фокусе, рот отвис» |
| `expected_emotion` baby_timer | «curious satisfied **scientist**» | Профессия как эмоция | «сидит на корточках, голова набок» |
| `expected_action` sandy | «body **held motionless** at the impossible angle» | Прямой приказ: 4 секунды неподвижности | «тело сползает по ножке стола на сантиметр и снова застревает» |
| `expected_action` baby_timer | «huge eyes **studying** the 45-degree Sandy **with fascinated observation**» | «Изучает», «наблюдение» — когниция; персонаж стоит 4 с | «обходит Сэнди на полшага, тычет варежкой в стекло» |
| `action_prose` | «with **the air of a scientist observing a curious specimen**» | Полностью интерпретационная фраза | вырезать |
| `action_prose` | «**a face of profound purgatory**» | Нерисуемо | «веки на половине, рот отвис» |
| `action_prose` | «Baby-Timer … its cream sand STILL» | Заморозка второго персонажа | «кремовый песок качается в такт его шагам» |

> Единственное движение в 4-секундном шоте — тонкая нить песка. Всё остальное явным текстом обездвижено.

### SH07 — 4 с · gag (4 нарушения)

| Поле | Цитата | Что нерисуемо | Чем заменить |
|---|---|---|---|
| `expected_emotion` sandy | «**catastrophic insomnia — awake for one thousand years**» | Тысяча лет бессонницы — метафора | «зрачки закручены в спирали, рот разинут» |
| `expected_emotion` baby_timer | «silent ecstatic delight» | Внутреннее | «рот раскрыт, уши звенят при каждом обороте» |
| `action_prose` | «cream sand **somehow still calm** inside its own body» | «Somehow» — авторская ремарка; «calm» — состояние | «кремовый песок бьётся о стенки в такт вращению» |
| `action_prose` | «expression of **someone awake for one thousand years**» | Нерисуемо | «спирали в зрачках, веки не смыкаются» |

### SH08 — 3 с · reaction (8 нарушений) — **самый тяжёлый шот**

| Поле | Цитата | Что нерисуемо | Чем заменить |
|---|---|---|---|
| `expected_emotion` sandy | «**the long pause of a decision being made**» | Решение невидимо. Это описание СЮЖЕТА, а не кадра | «взгляд опускается к малышу, рука поднимается и замирает на полпути» |
| `expected_emotion` baby_timer | «cheerful **readiness for round six**» | Готовность к будущему раунду | «варежки подняты, подпрыгивает на месте» |
| `expected_action` sandy | «standing perfectly still …, **unreadable**, drained calm — **motionless for the full held beat**» | «Unreadable» самоуничтожающе: буквально велит провайдеру не выражать ничего. Плюс приказ неподвижности на все 3 с | «медленно опускает голову; одна рука начинает подниматься» |
| `expected_action` baby_timer | «huge eyes gazing up … with **total expectant joy**» | Ожидание | «тянет варежки вверх, качается с пятки на носок» |
| `action_prose` | «**And Sandy holds. He does not move. Does not react.**» | Три подряд приказа не двигаться | «песок продолжает сыпаться — единственное движение в кадре, и оно должно быть ВИДНО» |
| `action_prose` | «**The full pause is the shot.**» | Инструкция «шот = пауза» | «пауза = замедление, а не остановка» |
| `action_prose` | «This is the beat **the whole episode has been building toward** — the pivot point» | Драматургическая заметка внутри описания кадра | вырезать |
| `action_prose` | «gazing up in **total joyful anticipation** — ready for round six» | Предвкушение | «подпрыгивает, варежки тянутся вверх» |

### SH09 — 5 с · punchline (5 нарушений)

| Поле | Цитата | Что нерисуемо | Чем заменить |
|---|---|---|---|
| `expected_emotion` sandy | «tender defeated peace — **parenthood**» | Родительство как эмоция кадра | «уголки рта поднимаются, веки медленно опускаются» |
| `expected_emotion` baby_timer | «**surrendering into sleep**» | Сдача — оценка | «веки опадают в два приёма, язык втягивается» |
| `action_prose` | «**That is parenthood.**» | Тема эпизода в описании кадра | вырезать |
| `action_prose` | «**Neither is off duty.**» | Абстракция | «песок обоих продолжает идти» |
| `continuity_notes` | «both characters end UPRIGHT — **per the parenthood punch**» | Обоснование замысла, не визуальная сверка | «оба стоят вертикально, ни один не горизонтален» |

### Свод

| Шот | Длит. | Нарушений | Явно обездвижен? |
|---|---|---|---|
| SH01 | 3 с | 8 | **ДА — полностью** |
| SH02 | 2 с | 12 | **ДА — полностью** |
| SH03 | 3 с | 3 | нет (второй персонаж — да) |
| SH04 | 3 с | 4 | нет (второй персонаж — да) |
| SH05 | 3 с | 6 | нет (Сэнди — да) |
| SH06 | 4 с | 7 | **ДА — оба, кроме нити песка** |
| SH07 | 4 с | 4 | нет (второй персонаж — да) |
| SH08 | 3 с | 8 | **ДА — полностью** |
| SH09 | 5 с | 5 | нет |
| **Итого** | **30 с** | **57** | **12 с из 30 (40%) с явной командой «не двигаться»** |

**Отдельная закономерность:** во всех 9 шотах второй персонаж (`role_in_shot: "co-star"`) заморожен формулой «cream sand STILL» / «still flat and calm». То есть дефект системный по оси «ко-стар» — в кадре всегда движется максимум один персонаж.

---

## 2. Где правило записано — и почему не срабатывает

### Правило ЕСТЬ, дословно

| Где | Строка | Текст |
|---|---|---|
| Скилл раскадровщика (ACTIVE) | `.claude/skills/storyboarder-situational-comedy/SKILL.md:62-65` | «**No internal states.** Strip every word that names a feeling. The animator draws what the camera sees. Replace "he feels intimidated" with the physical consequence» |
| Тот же скилл | `:275-276` | «No internal states — only visible action.» |
| Тот же скилл | `:50-51` | «Pure description ("she stands by the window, ready") … is the anti-pattern: the action goes nowhere» |
| Гейт сценария | `agents/exec/script_reviewer.md:196-210` (CHK-S07) | «Does it contain internal states, emotions, or non-visual descriptions? (e.g. "He feels anxious" → not storyboardable) … FAIL: any action field contains non-visual content» |
| Схема сценария | `specs/schemas/script.md:92` | «Visual writability \| Every action can be storyboarded (no internal states)» |
| Канон персонажа | `specs/schemas/character_profile.md:74` | «Every field here must be observable on screen — no internal states.» |
| **Живой промпт раскадровщика** | `webapp/lib/agents/runners/storyboarder.ts:452` | «Each shot's `action_prose` must describe what the camera SEES — **concrete physical action, not internal feelings**.» |
| Deprecated | `.claude/skills/storyboarder-prose-gag-per-shot/SKILL.md:49-50`, `comedy-shot-must-carry-gag/SKILL.md:63-64, :81-88` | «A shot is broken if removing every adjective leaves no event. The verb chain IS the comedy.» |

### Четыре причины, почему оно не долетает

**(а) Область действия — одно поле из трёх.** `storyboarder.ts:452` говорит только про `action_prose`. Рядом, в том же промпте, `expected_emotion` (`:395`) и `expected_action` (`:396`) не упомянуты. Раскадровщик честно исполнил правило в прозе SH03 («tips vertical», «LURCHES», «eyes snap open») — и тут же написал `expected_emotion: "asleep and unsuspecting"` в соседнем поле, потому что на него правило не распространяется.

**(б) Правило обрывается на раскадровке и не наследуется Аниматором.** В `agents/exec/animator.md` (26 КБ инструкции про слот `ACTION:`, §«ACTION BEAT STRUCTURE», `:195-208`) нет ни слова «not internal states» / «observable». Аниматор получает `expected_emotion` как вход (`animator.md:44` — список полей StoryboardShotV2) и переносит состояние в промпт. Требование `animator.md:206` — «ACTION слот MUST render the storyboard's `expected_gag` + `action_prose` **FAITHFULLY**» — при пустом замысле обязывает верно воспроизвести… неподвижность.

**(в) Правило живёт в скилле, который подключается ВЕРОЯТНОСТНО.** Раскадровщик грузит скиллы двухшаговой активацией: Haiku выбирает из манифеста, какие плейбуки включить (`storyboarder.ts:618-691`, `SKILL_SELECTION_THRESHOLD = 2` на `:52`). То есть `storyboarder-situational-comedy` — с самой сильной формулировкой правила — **может быть не активирован в конкретном прогоне**. Единственное упоминание этого скилла в живом коде — комментарий `storyboarder.ts:543`. Проверить по дампу E33 не удалось: заметки об активации плейбуков (`Active playbooks loaded: …`, `storyboarder.ts:688`) в выгрузку не попали — в `06-activity-events.txt` по EXEC-SB есть только `agent_started` / `agent_completed`. **Чтобы закрыть вопрос — нужна строка `Active playbooks loaded` из job-notes прогона EXEC-SB 2026-07-28T16:22:42.**

**(г) Правило нигде не enforced.** Валидатор раскадровки (`storyboarder.ts:812-851`) проверяет только наличие и тип полей — `typeof s.action_prose !== 'string'`, `c.expected_emotion.trim().length === 0`. Содержимое не смотрит никто.

### Где правило ДОЛЖНО жить

| Уровень | Файл | Почему именно там |
|---|---|---|
| **Авторская инструкция** | `webapp/lib/agents/runners/storyboarder.ts:452` — **расширить существующую строку** на `expected_emotion` + `expected_action` | Это ЕДИНСТВЕННОЕ место, которое гарантированно попадает в промпт раскадровщика в каждом прогоне (в отличие от скилла, который выбирает Haiku). Правило должно жить там же, где живёт поле, которое оно ограничивает |
| **Пример-эталон** | `storyboarder.ts:395` — **заменить `"oblivious"`** в списке примеров | Пример сильнее инструкции. Пока контракт показывает «oblivious» как образец, любая словесная оговорка проигрывает |
| **Наследование вниз** | `agents/exec/animator.md` §«ACTION BEAT STRUCTURE» (`:195-208`) | Аниматор — последний, кто трогает текст перед провайдером. Сейчас правила у него нет вообще |
| **Ловец** | `agents/exec/animator_critic.md:123-135` — проверка **V12** | Единственная проверка во всей фабрике, которая разбирает содержимое слота `ACTION:`. Ей не хватает одного предиката |

---

## 3. Поля-провокаторы в контракте

### `expected_emotion` — обязательное поле, требующее состояние

`webapp/lib/agents/runners/storyboarder.ts:395` (текст, уходящий в промпт):

```
"expected_emotion": "<one short noun phrase — e.g. \"smitten\", \"panicked\",
                     \"dignified composure\", \"oblivious\". The mood the AI
                     image reviewer will check against.>"
```

Три отягчающих обстоятельства:

1. **«one short noun phrase»** — грамматика поля запрещает глагол. Существительное не может обозначать действие. Поле по конструкции может быть заполнено только состоянием.
2. **Четыре примера из четырёх — чистые состояния.** `"smitten"`, `"panicked"`, `"dignified composure"`, **`"oblivious"`**. Последний — дословный прообраз «asleep and unsuspecting» из SH02. Дефект не просочился — он **процитирован из контракта**.
3. **Поле обязательное, валидатор роняет раскадровку без него** — `storyboarder.ts:836-838`:
   ```
   if (typeof c.expected_emotion !== 'string' || c.expected_emotion.trim().length === 0) {
     validationErrors.push(`${id}: character "${c.bible_slug}" missing expected_emotion`);
   ```
   Автор ОБЯЗАН написать состояние — иначе артефакт не примут.

Инструкция агента (`agents/exec/storyboarder.md:215-225`) пытается спасти поле, требуя «facial expression: eye state + mouth state» и «body attitude» — то есть наблюдаемое. Но она же добавляет третий пункт «**readable intent** — what we instantly read them trying to do», и это прямое приглашение писать намерение. Плюс название поля побеждает описание: поле называется *emotion*, и заполняется эмоцией.

**Плюс явное разделение, которое и создаёт утечку** — `agents/exec/storyboarder.md:209-213`:
```
action:  # one sentence — what the camera sees
         # keep this line factual — the visible ACTING beat goes in the
         # dedicated `expected_emotion` field below, NOT smuggled in here
```
Инструкция **выселяет игру из поля действия в поле эмоции**. После этого поле действия становится описанием обстановки, а вся «жизнь» шота уезжает в noun phrase.

### `mood` — второе обязательное поле состояния (бумажная схема)

`specs/schemas/shot.md:70-71`:
```
mood: string   # REQUIRED — emotional tone of the shot
               # e.g. "tense anticipation", "gleeful chaos", "quiet defeat"
```
«**tense anticipation**» и «**gleeful chaos**» — ровно та лексика, что дала «gleeful focus» и «joyful anticipation» в E33. Схема не просто допускает — она **выдаёт эти формулировки как образец**. (Живой контракт `storyboarder@v2` поле `mood` не просит, но схема остаётся источником словаря.)

### `expected_action` — поле сформулировано ПРАВИЛЬНО, но не ограничено

`storyboarder.ts:396` — «one short **verb phrase** — e.g. "leaning forward toward the vial", "falling backward like a plank", "raising one open hand"». Требование глагола есть, примеры корректные.

Но нет требования, чтобы глагол обозначал **изменение**. «Standing», «lying», «holding», «wedged», «gripping» — грамматически глаголы, семантически позы. На них и уехали SH01, SH02, SH06, SH08. Одна недостающая формулировка: *глагол должен менять состояние кадра между первым и последним кадром*.

### Что провоцирует ниже по цепочке

- `.claude/skills/eref-shot-composition/SKILL.md:48-51` — «every living character … gets a readable **emotion / attitude / animate state**».
- `agents/exec/episode_reference_designer.md:302-303` — «SOURCE: shot.expected_emotion … NEVER leave the character emotionally [flat]».
- `.claude/skills/eref-designer/SKILL.md:148` — «current_mood: `<from shot.expected_emotion>`» — состояние **дословно копируется в промпт картинки**.
- `.claude/skills/animator/SKILL.md:152, :166` — `current_mood` в промпте видео.

То есть `expected_emotion` не остаётся заметкой — он **транслируется в текст промпта и картинки, и видео**.

> **Смягчающее обстоятельство для картинок:** для СТОП-КАДРА требование позы законно — `.claude/skills/eref-shot-composition/SKILL.md:62-66` прямо требует «re-express the action as a single readable **frozen** moment, not motion prose». Это верно для одной картинки. Ошибка в том, что **тот же язык доезжает до видео**, где 4 секунды надо чем-то заполнить.

---

## 4. Дыра в критиках

### Полный роспись — кто что проверяет

| Критик | Артефакт | Проверки | Есть проверка движения? |
|---|---|---|---|
| **EXEC-VPREV** (`agents/exec/animator_critic.md`) | план шота = промпт Seedance | V01–V09, V11–V15 (V10 отсутствует) | **НЕТ** — V12 ближе всех, см. ниже |
| **EXEC-CREAD** (`agents/exec/creative_readability_critic.md`) | раскадровка · ref_plan · shot_plan | R01–R06 | **НЕТ** — R06 обратной полярности |
| **EXEC-EPREV** (`agents/exec/episode_reference_critic.md`) | ref_plan (картинка) | V01–V09 | **НЕТ** (и не должен — это стоп-кадр) |
| **EXEC-WCHK** (`agents/exec/world_checker.md`) | раскадровка | CHK-W01–W08 | **НЕТ** |
| **EXEC-VCRIT** (`.claude/skills/visual-shot-verdict/SKILL.md`) | **пиксели, 10 кадров видео** | 6 проверок | **НЕТ** — и это главная потеря |

### V12 — ловец, которому не хватает одного предиката

`agents/exec/animator_critic.md:125`:
> «ACTION slot (Seedance) or action prose (Veo) MUST describe a full physical beat — initiation state → trajectory/peak → termination state → consequence — not a one-line climax word.»

Условия PASS, `animator_critic.md:129-131`:
> - «ACTION slot has **≥3 sentences**…»
> - «ACTION slot names an `initiation` state … AND a `termination` state … AND a `consequence`»
> - «ACTION slot's described physics matches the storyboard `expected_gag` + `action_prose` **polarity**»

Проверка **структурная и текстовая**: считает предложения и ищет наличие трёх смысловых слотов. Она **не проверяет, что termination ≠ initiation**. Многословное описание неподвижности проходит.

**Это подтверждено рантаймом, дословно.** Вердикт критика на SH01 (`../body-SS-S15-E33-REV-shot_plan-S15-E33-SH01-v01-DRAFT.md.md:10`):

> «The ACTION slot describes **a sustained inertia state** that satisfies the "establishing stillness" beat contract **rather than a physical action chain — appropriate for this shot type**. … **V12 is satisfied by the multi-sentence beat structure** (stationary hold with lamp-pulse as the sole perceptible change).»

Критик **увидел, что действия нет, назвал это своими словами — и поставил PASS**, потому что ни одна из 13 проверок этого не запрещает. Вердикт: `"verdict":"PASS"`, `passed_checks: [V01…V09, V11, V12, V13]`, `failed_checks: []`.

### V11 — оговорка про камеру, использованная как индульгенция для персонажей

`agents/exec/animator_critic.md:112, :120` и `agents/exec/animator.md:191`:
> «**Static frame exceptions** — only when the gag composition demands stillness … MUST populate `policy_notes` with `"Static frame justified: <rationale>"`. Without this rationale entry, Critic V11 verdict REVISE.»

Оговорка написана **про камеру** (`opening_camera_motion.kind === null`). Аниматор применил её к **персонажам** — `../body-SS-S15-E33-SPC-shot_plan-S15-E33-SH01-v01-DRAFT.md.md:130`:
> «Static frame justified: … **The gag contract requires total inertia in frame.**»

Формально требование исполнено (строка `/static frame justified/i` присутствует), V11 — PASS. Ось «камера не движется» и ось «в кадре ничего не движется» **не различены ни в инструкции, ни в проверке**.

### R06 — проверка есть, полярность обратная

`agents/exec/creative_readability_critic.md:50-51`:
> «### R06 — No empty-motion beats. A beat whose **movement** advances neither the intent (R01) nor a consequence (R03) is **filler**. **Movement for its own sake** … fails R06.»

R06 карает **движение без смысла**. Обратной проверки — **смысл без движения** — не существует. Критик читаемости на v03 (`../body-SS-S15-E33-REV-readability-v03-DRAFT.md.md`) прямо поставил R06 **PASS** и обосновал:
> «**R06** — No empty-motion beats. … including **SH08 (the pause)** … **SH08's held stillness is the pivot** that makes SH09's reframe land; **it is not filler**.»

То есть проверка, названная «no empty-motion», **отдельно одобрила самый неподвижный шот эпизода**.

### R01 — активное давление В СТОРОНУ намерения

`.claude/skills/readability-comedy-slapstick/SKILL.md:63-65`:
> «**A beat that contains ONLY kinetic chain-verbs and no goal-verb is NOT a gag — it is filler.** The viewer sees motion but cannot read intent»

Движок читаемости **требует читаемого НАМЕРЕНИЯ** и штрафует чистое движение. На E33 он завалил R01 именно за это (`REV-readability-v03`):
> «SH05 and SH07 are anchored to **kinetic-chain verbs only** … **with no goal-verb** expressing a nameable task-intent»

Итог: у автора раскадровки два встречных требования — «не пиши состояние» (скилл раскадровщика, вероятностно подключаемый) и «обязательно вырази намерение» (движок критика, подключаемый всегда, `active_playbooks: ["readability-comedy-slapstick"]` в метаданных всех рецензий E33). **Побеждает то, которое ловит критик.**

### EXEC-VCRIT — единственный, кто видит пиксели, и он не смотрит на изменение

Рубрика `.claude/skills/visual-shot-verdict/SKILL.md:41-78` — 6 проверок: `equipment_completeness`, `activity_coherence`, `physics_geometry`, `anatomy_on_model`, `contract_fidelity`, `style_genre`. Все — покадровые.

Критик получает **10 кадров видео** (`webapp/lib/agents/runners/visual-shot-critic.ts:225` — `sampleVideoFrames(v.path, { frames: 10, width: 512 })`), но промпт (`webapp/lib/agents/visual-verdict.ts:136`) говорит лишь «Judge the attached video frames (in order) against the contract». **Нет инструкции сравнить кадр N с кадром N+1.** Десять идентичных кадров пройдут все шесть проверок.

Вдобавок он **advisory и выключен по умолчанию**: `visual-shot-critic.ts:10-11` («ADVISORY: it never changes asset status and never blocks»), `:39-41` (`VISUAL_CRITIC_ENABLED` defaults `'false'`).

### Статус enforcement — почему даже найденное не остановит конвейер

`webapp/inngest/functions/exec-cread.ts:102-112`:
> «CREAD is the TASTE critic — it is now **ADVISORY** on the per-shot phases too… A REVISE **no longer re-fires** the producer (Designer / Animator)… **Auto-chain by verdict: NONE.**»

На E33 это видно в событиях: критик читаемости выдал **REVISE + HALT** на раскадровку v03 в `16:26:27`, а в `16:29:38` пришёл `approval_granted APPROVE` на ту же v03 — правки по R01/R02 не вносились.

---

## 5. Длительность vs движение — гейта нет

Все проверки длительности числовые, ни одна не смотрит на содержание:

| Проверка | Где | Что делает |
|---|---|---|
| CHK-W05 | `agents/exec/world_checker.md:201-212`; код `webapp/lib/agents/runners/continuity-check.ts:397-418` | только `1.5 ≤ d ≤ 8.0` и сумма по акту ±20% |
| V07 | `agents/exec/animator_critic.md:91-100` | `duration_seconds` в диапазоне рендера провайдера |
| V14 | `agents/exec/animator_critic.md:164-167`; код `webapp/lib/agents/runners/animator-critic.ts:430-479` | равенство длительности плана аниматику |
| anchor-sanity | `webapp/lib/agents/runners/animator-critic.ts:332-336` | `duration ≥ closing_static_hold + 0.25s` — **единственное место, где вообще резервируется время под движение, и это плоские 0.25 с независимо от длины шота** |

Таблица «Action complexity → Render duration» существует (`.claude/skills/animator/SKILL.md:81-86`), но это **авторская подсказка, а не проверка**, и `agents/exec/animator.md:31` прямо запрещает ею пользоваться:
> «**You MAY NOT stretch beyond the clamped cut** — not for "comedic readability", **not for action complexity**, not for any reason.»

**Итог: 4-секундный шот, чей слот `ACTION:` описывает ноль движения, проходит все гейты.** Никто не соединяет секунды с действием. На E33 это дало SH01 (4 с рендера) + SH02 (4 с рендера) с прямым текстовым запретом на движение внутри.

---

## 6. Образец правильной формулировки — SH02

Тот же замысел («Малыш добрался до спящего Сэнди и сейчас его перевернёт»), 2 секунды, без единого внутреннего состояния.

### Было (v03 + план шота)

```
expected_emotion (baby_timer): "gleeful focus"
expected_emotion (sandy):      "asleep and unsuspecting"
expected_action  (baby_timer): "standing beside the horizontal Sandy in wide-legged
                                toddle-squat, both mitten-fist arms planted flat …,
                                bell-ears tilted forward with intent, huge eyes locked
                                on the target"
action_prose: "… Baby-Timer's cream interior sand still sits flat …— the toddler has
               not begun to move yet. Sandy remains horizontal …. Sand states: BOTH
               STILL. The mitten-fists on the gold bulb is the whole story of the shot
               — the button that will be pressed."
ACTION (Seedance): "Baby-Timer holds the planted-fist pose with absolute stillness …
               the entire tableau is a frozen comic anticipation beat — two characters
               locked in perfect stillness …"
```

### Стало

```
expected_emotion (baby_timer): "рот раскрыт, язык свисает набок; уши-колокольчики
                                качнулись вперёд и звякнули один раз"
expected_emotion (sandy):      "веки сомкнуты; линия рта дёрнулась и разгладилась,
                                глаза так и не открылись"
expected_action  (baby_timer): "довершает последний переваливающийся шаг, обе варежки
                                взлетают и впечатываются плашмя в нижний золотой шар,
                                корпус наваливается вперёд, пятки отрываются от пола"
expected_action  (sandy):      "тело качается на матрасе на несколько градусов от
                                удара, золотой песок съезжает на ширину ладони по
                                стенке шара и оседает"

action_prose: "Средний план у кровати. Малыш-Таймер довершает последний перевал
  на широко расставленных культяпках — обе варежки взлетают и впечатываются плашмя
  в нижний золотой шар Сэнди. Корпус наваливается вперёд, пятки отрываются от пола,
  уши-колокольчики качаются вперёд и звякают один раз. От удара тело Сэнди
  прокатывается на матрасе на несколько градусов; внутри стекла золотой песок
  съезжает на ширину ладони по стенке шара и оседает новым косым пластом. Линия рта
  Сэнди дёргается и разглаживается. Веки не открываются. Кремовый песок малыша
  подпрыгивает от собственного удара и успокаивается."

ACTION (Seedance): "Baby-Timer completes its final wide-legged toddle step and swings
  both mitten-fists up, slamming them flat against Sandy's lower gold bulb; the
  toddler's torso pitches forward over the contact point, heels lifting off the floor,
  chrome bell-ears swinging forward and clanging once. The impact rolls Sandy's
  horizontal body a few degrees across the mattress; inside the glass the gold sand
  slumps a hand's width down the bulb wall and resettles into a new slanted bed.
  Sandy's mouth-line twitches once and flattens; the eyes stay shut. Baby-Timer's cream
  sand jolts on impact and settles, the bell-ears still swaying at the end of the beat."
```

### Что именно поменялось — принцип правки

| Состояние | Наблюдаемое действие, которое его несёт |
|---|---|
| «gleeful focus» | уши качаются вперёд и **звякают**; язык вываливается |
| «asleep and **unsuspecting**» | рот **дёргается и разглаживается**, веки **не открываются** — незнание показано через отсутствие РЕАКЦИИ на произошедшее событие, а не через приказ лежать |
| «tilted forward **with intent**» | корпус **наваливается**, пятки **отрываются** |
| «**has not begun to move yet**» | удалено — контакт варежек и **есть** действие |
| «BOTH STILL» | песок **съезжает и оседает**; кремовый **подпрыгивает и успокаивается** |
| «the button **that will be pressed**» | «варежки **впечатываются** в шар» — свершившееся, а не будущее |
| «**absolute stillness / frozen tableau**» | удалено; неподвижность создаётся **завершением** движения в конце beat'а, а не запретом на движение |

**Ключевая мысль правки:** «спит и не подозревает» — это не состояние, а **отсутствие реакции на событие**. Чтобы отсутствие реакции было видно, событие обязано ПРОИЗОЙТИ в кадре. Пока события нет, «не подозревает» нечем показать — и провайдер честно рисует стоящего младенца.

**Второй принцип:** покой в конце шота законен, покой на протяжении всего шота — нет. Beat должен **приходить** в неподвижность (движение → затухание → замирание), а не начинаться в ней. Ровно этого требует уже написанная структура V12 «initiation → trajectory → termination → consequence» — просто никто не проверяет, что initiation отличается от termination.

---

## 7. Минимальная правка (анти-аддитивность: переиспользовать → вычесть → добавить)

### Сначала — что НЕ надо делать

- ❌ **Не заводить новый скилл** «action-not-state». Правило уже написано дословно в `.claude/skills/storyboarder-situational-comedy/SKILL.md:62-65`. Второй экземпляр = ровно та дупликация, от которой гниёт репозиторий.
- ❌ **Не заводить нового критика** «motion-checker». V12 уже разбирает слот `ACTION:` — ей не хватает одного предиката.
- ❌ **Не добавлять поле** `has_motion` / `motion_delta`. Дельта уже выводится из пары `initiation`/`termination`, которую V12 и так требует.

### Переиспользование (первый рефлекс) — 3 правки существующих строк

| # | Файл:строка | Правка | Тип |
|---|---|---|---|
| **P1** | `webapp/lib/agents/runners/storyboarder.ts:395` | В примерах `expected_emotion` **заменить 4 существительных-состояния** (`"smitten"`, `"panicked"`, `"dignified composure"`, **`"oblivious"`**) на наблюдаемые: `"eyes flying wide, mouth dropping open"`, `"veki half-shut, mouth slack"`, `"ears swinging forward, tongue lolling"`. Пример сильнее инструкции — сейчас контракт **учит** дефекту | замена, 0 новых сущностей |
| **P2** | `webapp/lib/agents/runners/storyboarder.ts:452` | **Расширить область** уже существующего правила: было «Each shot's `action_prose` must describe what the camera SEES — concrete physical action, not internal feelings» → распространить на `expected_emotion` и `expected_action` **той же строкой**. Плюс добавить полстроки про изменение: «`expected_action` must name a change of state between the first and last frame — a held pose is not an action» | расширение существующего, +0 строк |
| **P3** | `agents/exec/animator.md:195-208` (§ACTION BEAT STRUCTURE) | Правило **не наследуется вниз**. Добавить в уже существующий раздел одно предложение: слот `ACTION:` описывает наблюдаемое изменение; состояния / намерения / знания из `expected_emotion` в него не переносятся дословно. Плюс **развести две оси** в §«Static frame exceptions» (`:191`): оговорка про статичную КАМЕРУ не даёт права обездвижить ПЕРСОНАЖЕЙ | +2 предложения в существующие разделы |

### Вычитание (второй рефлекс) — самое сильное действие

| # | Файл:строка | Правка | Эффект |
|---|---|---|---|
| **S1** | `webapp/lib/agents/runners/storyboarder.ts:395` + `agents/exec/storyboarder.md:215-225` | **Убрать из `expected_emotion` требование «one short noun phrase»** и пункт «readable intent — what we instantly read them trying to do». Грамматика существительного делает поле физически неспособным нести действие; «readable intent» — прямое приглашение писать намерение | Убирает **источник дефекта по конструкции**, не заводя ничего нового |
| **S2** | `agents/exec/storyboarder.md:209-213` | **Убрать выселение игры из поля действия**: «keep this line factual — the visible ACTING beat goes in the dedicated `expected_emotion` field below, NOT smuggled in here». Именно эта строка выгоняет актёрскую игру из `action` в noun phrase | Схлопывает искусственное разделение «факт vs игра», из-за которого и появился зазор |
| **S3** | `specs/schemas/shot.md:70-71` | Заменить примеры `mood` (`"tense anticipation"`, `"gleeful chaos"`, `"quiet defeat"`) — это словарь, из которого выросли «gleeful focus» и «joyful anticipation». Поля в живом контракте `storyboarder@v2` нет — можно **удалить блок целиком**, а не чинить | Чистое удаление мёртвого поля-провокатора |

**Радикальный вариант S1-max (оценить с Директором):** `expected_emotion` и `expected_action` **схлопнуть в одно поле** `expected_action`, требующее глагол изменения. Эмоция в немой комедии всё равно читается только через лицо и позу — то есть уже входит в наблюдаемое действие. Это убирает обязательное поле, его валидатор (`storyboarder.ts:836-838`), его трансляцию в промпты картинки и видео (`eref-designer/SKILL.md:148`, `animator/SKILL.md:152`) и всю дупликацию, которую видно в SH03 (`expected_emotion: "transported delight"` при `expected_action`, где уже написано «wide crescent grin, bell-ears bouncing»). **Против:** поле введено директивой Директора 2026-06-20 именно чтобы Дизайнер не рисовал плоское лицо (`storyboarder.md:215`) — снос требует его решения. Отдельный вопрос: для СТОП-КАДРА (EREF) требование позы законно (`eref-shot-composition/SKILL.md:62-66`), так что схлопывание не должно ломать путь картинки.

### Добавление (последний рефлекс) — один предикат

| # | Файл:строка | Правка |
|---|---|---|
| **A1** | `agents/exec/animator_critic.md:129-131` (V12) + код `webapp/lib/agents/runners/animator-critic.ts` | В **уже существующую** проверку V12 добавить **один предикат**: `termination state` должен ОТЛИЧАТЬСЯ от `initiation state`. Плюс детерминированный стоп-лист в слоте `ACTION:`: `remains stationary`, `absolute stillness`, `frozen`, `motionless throughout`, `no body movement`, `perfect stillness`, `total inertia` → REVISE. Новой проверки не заводить — V12 уже читает этот слот и уже требует обе точки, просто не сравнивает их |

Этот предикат один поймал бы **и SH01, и SH02, и SH08** — то есть все 12 секунд явной заморозки из 30.

### Нетто-дельта

| Тип | Изменение |
|---|---|
| Новые файлы | **0** |
| Новые скиллы | **0** |
| Новые критики | **0** |
| Новые поля контракта | **0** |
| Удаляемые требования | **3** (noun-phrase, readable-intent, выселение игры из `action`) + опционально блок `mood` в `shot.md` |
| Изменяемые строки | **4** (`storyboarder.ts:395`, `:452`, `animator.md:195/191`, `animator_critic.md:129`) |
| Новая логика | **1 предикат** внутри существующей V12 |

**Нетто по строкам: отрицательное.** Дефект чинится преимущественно удалением того, что его порождало.

### Порядок

1. **A1 (предикат V12)** — единственное, что даёт немедленный автоматический отлов. Ставить первым.
2. **P1 (примеры)** — одна строка, убирает «oblivious» из обучающего материала контракта.
3. **P2 + P3** — распространение и наследование правила вниз к Аниматору.
4. **S1/S2/S3** — вычитание полей-провокаторов; S1-max выносить Директору отдельно.

### Что проверить в рантайме перед правкой

Не удалось закрыть по дампу: **был ли скилл `storyboarder-situational-comedy` реально активирован** в прогоне EXEC-SB `2026-07-28T16:22:42`. Нужна строка `Active playbooks loaded: …` из job-notes (пишется в `storyboarder.ts:688`). Если скилл НЕ активировался — приоритет P2 (перенос правила в гарантированный промпт) выше всего остального, потому что тогда правило физически не доехало до автора. Если активировался — значит правило доехало и **проиграло** мандату `expected_emotion`, и тогда первично вычитание S1/S2.

---

*Аудит H · только чтение · 2026-07-29*
