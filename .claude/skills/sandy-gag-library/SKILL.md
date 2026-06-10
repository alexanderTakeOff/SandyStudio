---
name: sandy-gag-library
description: Grammar of the Sandy comedy universe. Defines 10 gag taxonomy categories (BODY/OBJECT/ENVIRONMENT/CHAIN/STATUS/FALSE_SUCCESS/SAND/TRANSPARENT_BODY/TIMING/SOCIAL), composable gag atoms, physical rules for sand + transparent body, escalation patterns, forbidden gags, density rules per act, and режиссёрские приёмы (anticipation + delayed reveal). Consumed by EXEC-HW / EXEC-SW (script generation), EXEC-SB (storyboard beat allocation), and future EXEC-GAGAD (gag continuity supervisor). 80% Sandy-physics-specific, 20% generic cartoon comedy.
status: ACTIVE
owner: EXEC-HW (Head Writer) · EXEC-SW (Writer) · EXEC-GAGAD (planned, Day 11+ sprint)
applies_when:
  agent: [EXEC-HW, EXEC-SW, EXEC-SREV, EXEC-SB, EXEC-GAGAD]
  series_id: [SS-S14, SS-S15]
hard: false
maturity: v0.1-2026-05-19
created: 2026-05-19
authors:
  - Director (Kirill) — original «gag ≠ deformation of character» insight
  - OpenAI ChatGPT — 10-category taxonomy + gag atoms scaffolding
  - Тео — Sandy-specific reorganization + theme-first override + GAGAD architecture
---

# Sandy Gag Library — Grammar of the Universe

> **Это центральный документ юмора SandyStudio.** Сценаристы не пишут сюжет — они пишут sequence of escalating gags. Storyboarder не раскадровывает диалог — он размечает physical escalation. Animator не «рисует красиво» — он ставит payoff. Без gag library каждый агент интерпретирует comedy по-своему → результат механический и плоский.

## 1. Gag Philosophy (immutable)

Каждый gag должен удовлетворять **все** четыре условия:

1. **Action first** — гэг существует как физическое действие, не как фраза или внутренний монолог
2. **Readable in silence** — зритель без звука всё равно понимает что произошло (Sandy безмолвный — это hard rule серии)
3. **Setup → expectation → disruption → payoff** — четырёхтактная структура; без любого такта gag деградирует до случайного хаоса
4. **One clear visual idea** — один центральный визуальный жест, не свалка действий

Дополнительные принципы:
- **No verbal dependency** — никакого текста на экране, никаких звуковых caption'ов
- **Escalation preferred** — каждый следующий gag в эпизоде должен быть **физически больше** предыдущего, либо **эмоционально острее**
- **Chain reactions encouraged** — связанные последствия > изолированные удары
- **Theme-first** — gag chain служит теме эпизода, не наоборот (Director's rule, 2026-05-19)

## 2. Gag Taxonomy — 10 категорий

Каждый gag относится к одной из 10 категорий. Storyboard'ы должны иметь **минимум 4 разных** категории за эпизод 55 секунд (variety rule).

### 2.1 BODY_GAGS — деформация самого Sandy

Sandy физически меняет форму. Это базовая категория, которую серия уже хорошо освоила.

**Атомы:** stretched, compressed, inflated, deflated, twisted, inverted, segmented, fractured.

**Примеры:**
- талия перекрутилась под нагрузкой
- рука застряла, тело продолжило движение → растянулся
- надулся от sneezing build-up
- песок сместился в одну ногу → перевес
- застрял в трубе, тело сложилось гармошкой

**Когда использовать:** reaction-shot, immediate consequence of OBJECT/ENVIRONMENT gag. **НИКОГДА** как одиночный gag без триггера — body deformation without cause = visual noise.

### 2.2 OBJECT_GAGS — мир атакует героя

Объекты вокруг Sandy ведут себя агрессивно, непредсказуемо, как анимированные противники. **Это самая недозаполненная категория в S14**.

**Атомы:** snapped, flung, suction, jammed, ricochet, attracted, repelled.

**Примеры:**
- автоматическая дверь захлопывается посередине прохода
- эскалатор затягивает руку
- пылесос вытягивает песок
- вентилятор сдувает как парус
- магнит притягивает металлические части
- лифт уезжает оставляя ноги снаружи
- скотч приклеивает к потолку
- швабра размазывает по полу
- автомат с напитками выплёвывает банки в лицо
- ремень безопасности перетягивает пополам

**Когда использовать:** середина эпизода, когда Sandy «всё держит под контролем» — объекты ломают этот контроль.

### 2.3 ENVIRONMENT_GAGS — мир ломает планы

Среда (не отдельный объект, а **состояние пространства**) предаёт Sandy.

**Атомы:** slippery, narrow, rotating, sloping, windy, wet, icy, vibrating.

**Примеры:**
- мокрый пол, банан, лёд
- слишком узкий проход для растянутого тела
- вращающаяся дверь не отпускает
- строительные леса, конвейер, лента
- ветер сдувает песок дорожкой
- дождь превращает песок в цемент
- турникет автоматически захлопывается

**Когда использовать:** establishing beat — определяет физический «характер» сцены.

### 2.4 CHAIN_REACTION_GAGS — каскадные последствия

Маленький fail → цепная реакция катастрофы. **Лучшая категория для silent comedy** (Tex Avery, Tom & Jerry, Rube Goldberg).

**Структура:** 3-7 звеньев, каждое звено **физически следует** из предыдущего, последнее — самое крупное.

**Пример chain'а:**
```
Sandy зацепил нитку →
нитка потянула штору →
штора опрокинула лампу →
лампа прожгла шарик →
шарик улетел →
чайка испугалась →
чайка выронила рыбу →
рыба упала Sandy в прозрачное пузо
```

**Когда использовать:** середина или финал эпизода. **НИКОГДА** в самом начале — нужен setup чтобы зритель понимал что цепляется за что.

### 2.5 STATUS_GAGS — герой пытается выглядеть круто

Sandy хочет произвести впечатление → реальность бьёт его наотмашь.

**Атомы:** posed, posed-collapse, mid-strut, mid-bow.

**Примеры:**
- хотел эффектно приземлиться → промахнулся на 30 см
- хотел галантно открыть дверь даме → дверь хлопнула в лицо
- хотел гордо пройти мимо → песок дорожкой выдал что протекает
- хотел поправить причёску → стекло треснуло

**Когда использовать:** идеальная финальная beat когда нужна payoff с эмоциональным комментарием.

### 2.6 FALSE_SUCCESS_GAGS — иллюзия победы

Кажется что Sandy выкрутился... и потом **БАМ**.

**Структура:** успех (3-5 секунд holdup) → микро-намёк (1 sec) → катастрофа (instant).

**Примеры:**
- идеально удержал баланс → расслабился → одна песчинка перевесила → рухнул
- успешно пронёс яйцо → улыбнулся → споткнулся → яйцо в потолок
- собрал башню → отошёл полюбоваться → дверь сквозняком толкнула башню

**Когда использовать:** mid-episode reversal или финальный pay-off. **Особенно силен после серии reset'ов** — зритель готов поверить что в этот раз получится.

### 2.7 SAND_GAGS — уникальная суперсила Sandy

Sandy — **песочное тело**. Это его USP. Эта категория должна быть **в КАЖДОМ эпизоде минимум 1 раз**.

**Sand Physics Rules** (см. §4):
- песок пересыпается медленнее ожидаемого (timing humor)
- песок шумит и выдаёт Sandy когда тот прячется
- песок работает как вода (течёт, заполняет, проливается)
- песок работает как цемент когда намок
- песок случайно образует фигуры (лицо, символ)
- песок засыпает глаза врага → spontaneous blindness
- песок забивает механизм → ломает прибор
- песок попадает в вентилятор → распределяется по комнате как краска

**Категорийная сила:** SAND_GAGS пересекаются со всеми остальными — sand можно использовать как OBJECT, ENVIRONMENT, BODY deformation. Sand — это **универсальный механизм** Sandy-вселенной.

### 2.8 TRANSPARENT_BODY_GAGS — стеклянное тело как окно

Тело Sandy **прозрачное**. Зритель **видит проблему внутри**. Категория почти не раскрыта в S14 — gold mine.

**Примеры:**
- внутри катается предмет (ключ, монета, попавший внутрь жук)
- внутри плавает рыбка (которую Sandy случайно проглотил)
- внутри пузырь воздуха путешествует
- песок внутри образует временное лицо/символ (visual pun)
- весь песок ссыпался в одну ногу — тело перекошено
- внутри видно панику (бьющийся в стекло объект)
- внутри застряли часы → время идёт «изнутри» Sandy

**Когда использовать:** интимные beats (close-up, slow moment) когда зритель должен **прочесть внутреннее состояние** без диалога.

### 2.9 TIMING_GAGS — комедия on-the-beat

Классика silent comedy. **На долю секунды поздно/рано**.

**Примеры:**
- дверь закрылась за 1 секунду до того как Sandy прошёл
- поезд уехал за beat до того как Sandy добежал
- стул убрали в момент когда Sandy сел
- свет погас в момент когда Sandy нашёл выход
- зонтик раскрылся слишком поздно — Sandy уже промок
- лифт закрылся когда Sandy просунул руку

**Когда использовать:** transitions между сценами, или как punchline после большого setup'а.

### 2.10 SOCIAL_CHAOS_GAGS — публичный позор

Sandy опозорился **на публике**. Усиливает любой fail кратно.

**Атомы:** watched, photographed, mistaken-for, applauded-by-accident.

**Примеры:**
- все смотрят
- очередь смеётся
- кто-то снимает на телефон
- случайно оказался на сцене
- все приняли за артиста / преступника / директора
- толпа аплодирует не зная что произошло

**Когда использовать:** эпизоды с тематикой «выгляди прилично» — комбинирует со STATUS_GAGS.

## 3. Gag Atoms — композируемые примитивы

Атомы — это **минимальные глаголы юмора**. AI-агенты (EXEC-SW, EXEC-GAGAD) сэмплируют их и комбинируют.

### Body atoms
slipped · stuck · stretched · compressed · inflated · deflated · folded · twisted · inverted · spilled · split

### Object atoms
flung · snapped · jammed · suction · attracted · repelled · ricochet · clamped · entangled · crushed

### Environment atoms
slippery · narrow · rotating · sloping · windy · wet · icy · vibrating · collapsing · expanding

### Reaction atoms
frozen · double-take · pose-collapse · slow-realize · panic-flail · resigned-sigh · pride-then-fall

### Sand-specific atoms
sand-leak · sand-shift · sand-clog · sand-trail · sand-pile · sand-figure · sand-blind · sand-cement

### Transparent-body atoms
inner-object · inner-pressure · inner-shape · inner-panic · inner-trapped

**Композиция:** один gag = 2-4 атома в цепи.
Пример: `[slipped] → [body: stretched] → [sand: sand-leak] → [reaction: pose-collapse]`

## 4. Physical Rules — sand + transparent body

### 4.1 Sand Rules

1. **Shifts weight** — песок пересыпается между конечностями под силой тяжести. Когда Sandy наклоняется, песок течёт в нижнюю часть → перевес → потеря баланса с задержкой 0.5-1 sec.

2. **Leaks downhill** — если в теле есть отверстие/трещина — песок вытекает дорожкой. След виден на полу.

3. **Clogs narrow spaces** — песок при проходе через узкое горло (sand-clog) накапливается → давление → внезапный выброс.

4. **Sprays under pressure** — внешнее давление (объятие, удар, корсет) → песок выходит фонтаном через ближайшее отверстие.

5. **Reacts to shaking** — встряхивание перемешивает песок внутри → видимая турбулентность (для transparent body).

6. **Delayed imbalance** — все сдвиги песка имеют задержку реакции 0.5-1.5 sec. Это **главный таймер** sand-comedy.

7. **Wet sand → cement** — намокший песок становится тяжёлым и негибким → Sandy медленнее, костью становится.

8. **Vibration → fine dust** — высокочастотная вибрация (двигатель, динамик) → песок превращается в пыль → Sandy сжимается.

### 4.2 Transparent Body Rules

1. **Inside is readable** — зритель видит **всё** что внутри. Не пытайся прятать визуальную информацию.

2. **Objects visible at all times** — если что-то проглотил/попало внутрь — это **остаётся видно** до момента когда выйдет. Persistence rule.

3. **No realistic anatomy** — внутри нет органов, костей, крови. Только песок + воздушные пузыри + временно попавшие объекты.

4. **Body cracks are dramatic** — трещина в стекле — это **большой beat**. Не размахивайся ими — одна трещина = весь акт.

5. **Light passes through** — Sandy подсвечивается изнутри-наружу: свечой, фонарём, fire, неоном. Используется для атмосферных moments.

## 5. Escalation Patterns

### Pattern A — Inconvenience Escalation
```
small inconvenience (0:00-0:10)
  → overreaction (0:10-0:25)
    → catastrophe (0:25-0:50)
      → ironic resolution (0:50-0:55)
```
Самый частый паттерн для 55-сек эпизода.

### Pattern B — False Success
```
goal stated (0:00-0:05)
  → series of obstacles overcome (0:05-0:35)
    → triumph (0:35-0:45)
      → tiny imbalance triggers collapse (0:45-0:50)
        → final shot of damage (0:50-0:55)
```

### Pattern C — Pride Inversion
```
status declaration (0:00-0:10)
  → attempt to maintain status (0:10-0:30)
    → status compromised but Sandy hides it (0:30-0:45)
      → exposure beat (0:45-0:55)
```

### Pattern D — Chain Reaction
```
trivial action (0:00-0:05)
  → first ripple (0:05-0:15)
    → second escalating ripple (0:15-0:30)
      → catastrophic ripple far from Sandy (0:30-0:45)
        → Sandy realizes he caused it (0:45-0:55)
```
Самый сложный для исполнения, но самый запоминающийся.

### Pattern E — Cumulative Sand Loss
```
small sand leak (0:00-0:10)
  → Sandy doesn't notice (0:10-0:30)
    → cumulative trail visible to audience (0:30-0:40)
      → Sandy compressed/disfigured (0:40-0:50)
        → catastrophic structural fail (0:50-0:55)
```
Уникальный паттерн Sandy. Используется как minimum 1 раз за сезон.

## 6. Режиссёрские приёмы (directorial primitives)

Это **не категории**, это **способы подачи**. Каждый gag должен использовать минимум один.

### 6.1 ANTICIPATION
Зритель **видит ловушку** до того как Sandy её увидит. Sandy движется к ней. Тension build-up.

**Mechanics:** камера показывает trap в close-up, потом переходит на Sandy в долгом плане, потом снова trap в close-up, потом collision.

### 6.2 DELAYED REVEAL
Действие закончилось. Beat. **Только потом** видно последствие.

**Mechanics:** камера держит widе план 1-2 секунды после действия. Зритель ждёт. Появляется новое (банан с потолка падает на голову, второй персонаж входит и видит хаос, и т.д.).

### 6.3 OFF-SCREEN DESTRUCTION
Слышим катастрофу за кадром (звук, тряска). Sandy реагирует. Камера не показывает что произошло. Зритель додумывает.

### 6.4 SCALE CONTRAST
Огромное последствие от микроскопического действия. Sandy чихнул → дом обрушился. Контраст усиливает comedy.

### 6.5 SLOW MOTION ON DOOM
Момент перед катастрофой растягивается во времени. Sandy осознаёт. Зритель тоже. Потом — normal speed payoff.

## 7. Hero-Antagonist Dynamics

Silent comedy **всегда** парная: Tom ↔ Jerry, Pink Panther ↔ Inspector, Coyote ↔ Roadrunner. **Sandy должен иметь рекуррентных антагонистов** — не одного главного, а **rotating cast** в зависимости от темы эпизода.

### Possible recurring antagonists

| Antagonist | Conflict Type | Best Episodes |
|---|---|---|
| **Inspector Stopwatch** | Authority figure measuring Sandy's behavior — comedy of impossible standards | Office, queue, airport |
| **Perfume Vial** | Smell triggers sneezing → catastrophic sand-fountain | Date, museum, library |
| **Pigeon Flock** | Birds attracted to Sandy's sand — opportunistic | Park, plaza, terrace |
| **Auto-Door** | Mechanical adversary — никогда не открывается вовремя | Office building, mall |
| **Wet Floor Sign** | Environment as villain — везде где Sandy идёт | Restaurant, hotel lobby |

**Rule:** в каждом эпизоде должен быть **либо named antagonist, либо antagonistic pattern**. «Sandy против всего мира абстрактно» — слабый эпизод.

## 8. Combo Gags — комбинирование осей

Самые сильные гэги — комбо нескольких осей сразу.

Пример: **Inspector Stopwatch + escalator + sneeze + transparent body**:
1. Sandy в очереди (SOCIAL_CHAOS setup)
2. Inspector Stopwatch измеряет время (Status pressure)
3. Sandy сдерживает чихание (Sand build-up)
4. Эскалатор начинает движение (Environment trigger)
5. Sandy не сдержался → sand-fountain через нос
6. Transparent body показывает что Sandy сдулся на 30%
7. Inspector Stopwatch замеряет: «12 секунд просрочки»

Combo = **6 категорий, 1 гэг**. Это уровень Pixar.

## 9. Forbidden Gags

**Никогда** не используй эти паттерны.

1. **Gag without consequence** — Sandy получил удар → следующий кадр он в порядке. Никакого damage persistence → comedy не имеет веса. Tom & Jerry правило: **Tom remains broken across the episode**.

2. **Cruelty without payoff** — Sandy унижают без структурного pay-off. Жестокость должна **разрешаться** (либо Sandy выкручивается, либо antagonist получает по заслугам, либо ironic comeuppance).

3. **Dialogue-based jokes** — мы безмолвный сериал. Никаких caption'ов, надписей с шутками, говорящих персонажей.

4. **Mean humiliation** — гэг где Sandy **просто опозорен** без структурной цели. Status-gags разрешены, но они должны **служить теме**.

5. **Overly complex setup** — gag требующий 30 секунд экспозиции для понимания. Setup ≤ 10 сек, иначе не работает.

6. **Slow intellectual irony** — silent comedy не philosophizes. Если зритель должен **подумать** чтобы понять gag — это не для нашего сериала.

7. **Random chaos without readable causality** — события связаны причинно. Random ≠ funny. Tex Avery rule.

8. **Gag that requires backstory** — нужно помнить что было 20 секунд назад → силент комедия не выживает.

9. **Adult-only / sexual** — наша аудитория mixed (kids + adult). Любой gag должен работать для 8-летнего.

10. **Self-referential / 4th wall break** — Sandy НЕ смотрит в камеру. НЕ комментирует ситуацию (никакими жестами «зрителю»). Универсальный закон серии.

## 10. Density Rules (per act)

Density должна **варьироваться** по структуре эпизода, не быть универсальной.

### 55-second episode structure

| Act | Time | Gag Density | Purpose |
|---|---|---|---|
| **Setup** | 0:00-0:10 | low (1 micro-gag) | Establish theme + Sandy's want + first hint of antagonism |
| **Build** | 0:10-0:30 | medium (3-4 gags) | Escalation, introduction of antagonist, first failure |
| **Climax** | 0:30-0:50 | high (5-7 gags chained) | Catastrophic chain, fullest physical destruction |
| **Resolution** | 0:50-0:55 | one final beat | Ironic stillness — Sandy frozen in pose with new state |

**Никогда** не делай equal density по эпизоду — это **усыпляет внимание**.

## 11. Theme Anchoring (Director's rule, 2026-05-19)

Каждый эпизод должен иметь **one-line theme** в формате:
```
Sandy wants/needs <X>.
```

Примеры:
- Sandy wants to nap.
- Sandy wants to look impressive on a date.
- Sandy needs to deliver a fragile package.
- Sandy wants to be invisible in a crowd.
- Sandy needs to win a competition.

Gag chain **служит теме**: каждый gag в эпизоде **препятствует Sandy достичь X**. Final pay-off — **ironic resolution темы** (Sandy достиг X в самой неподходящей форме, или отказался от X, или потерял что-то большее по пути).

**Без темы каждый gag — изолированный пирог в лицо.** С темой каждый gag — углубление конфликта.

## 12. Sample Gag Chain — full episode

Тема: **Sandy wants to take a quiet nap in the park.**

```
0:00-0:10  SETUP
- Sandy ложится на лавку (BODY: resting)
- надевает повязку на глаза (status: ready to sleep)
- pigeon приземляется на грудь (OBJECT_GAG, soft hint of antagonist)

0:10-0:30  BUILD
- pigeon начинает клевать песок (SAND_GAG + OBJECT_GAG)
- Sandy шарит, прогоняет (BODY: reaction)
- появляется второй pigeon (escalation)
- открывает глаза → 5 pigeon'ов вокруг (SCALE CONTRAST)
- Sandy встаёт, переходит на другую лавку (timing)
- pigeon'ы переместились (CHAIN REACTION setup)

0:30-0:50  CLIMAX
- Sandy в раздражении machet рукой (BODY: stretched)
- задел статую (ENVIRONMENT_GAG)
- статуя качается (CHAIN REACTION first link)
- падает (second link)
- разбивает фонтан (third link)
- вода выливается (fourth link)
- вода превращает Sandy в цемент (SAND RULES: wet→cement)
- pigeon'ы садятся на затвердевшего Sandy (SOCIAL_CHAOS: humiliation by birds)

0:50-0:55  RESOLUTION
- Sandy ironic resolution: окаменевший Sandy на «лавке» из самого себя, pigeon'ы спят на нём, ОН наконец спит (FALSE SUCCESS or true theme delivery — depending on tone)
```

**Theme delivered:** Sandy got his nap. Just not the one he wanted.

## 13. SPC-gag_plan structure (для будущего EXEC-GAGAD)

EXEC-GAGAD (planned Day 11+ sprint) будет читать APPROVED script + этот skill → создавать `SPC-gag_plan-<episode>.md` с machine-readable структурой:

```json
{
  "episode_id": "SS-S15-E01",
  "theme": "Sandy wants to take a quiet nap in the park.",
  "antagonist": "pigeon-flock + statue",
  "escalation_pattern": "Pattern D — Chain Reaction",
  "shots": [
    {
      "shot_id": "SS-S15-E01-A1-SC01-SH01",
      "act": "setup",
      "gag_category": "BODY_GAGS",
      "atoms": ["resting"],
      "role_in_chain": "establish-place",
      "visual_keys": ["park bench", "Sandy lying", "blindfold"],
      "timing_beat": "1.5s rest"
    },
    {
      "shot_id": "SS-S15-E01-A1-SC01-SH04",
      "act": "climax",
      "gag_category": "CHAIN_REACTION_GAGS",
      "atoms": ["jammed", "snapped", "spilled"],
      "role_in_chain": "first-link-of-chain",
      "visual_keys": ["statue tilt", "Sandy guilty look"],
      "timing_beat": "0.8s action + 0.5s hold",
      "directorial_primitive": "ANTICIPATION"
    }
  ]
}
```

Каждый downstream агент (Designer, Animator) видит свой `shot_id` и понимает **зачем он в цепочке гэгов**.

## 14. Agent integration

| Agent | How it uses this skill |
|---|---|
| **EXEC-HW** (Head Writer, Council) | Reads §1, §11 — определяет theme + antagonist для эпизода |
| **EXEC-SW** (Writer) | Reads §2 (taxonomy), §5 (escalation), §10 (density), §11 (theme). Пишет script в формате который EXEC-GAGAD сможет разобрать на breakdown |
| **EXEC-SREV** (Story Editor) | Reads §9 (forbidden) — отбраковывает script если есть запрещённые паттерны |
| **EXEC-SB** (Storyboarder) | Reads §6 (directorial primitives), §10 (density) — размечает кадры по beat'ам |
| **EXEC-GAGAD** (planned) | Reads ALL — создаёт breakdown, валидирует cross-layer delivery |
| **EXEC-EREF-DESIGNER** | Reads breakdown (когда GAGAD появится) — каждый ref подсвечивает gag visual_keys |
| **EXEC-VANIM** | Reads breakdown — animation Plan ставит правильную physical эскалацию |

## 15. Cross-references

- `agents/exec/head_writer.md` (Council) — owner of theme + antagonist
- `agents/exec/screenwriter.md` — applies §2 taxonomy + §5 escalation
- `agents/exec/storyboarder.md` — applies §6 directorial primitives
- `.claude/skills/storyboarder-prose-gag-per-shot/SKILL.md` — adjacent skill (per-shot rule)
- `.claude/skills/comedy-shot-must-carry-gag/SKILL.md` — adjacent skill (universal carry rule)
- `.claude/skills/animator/SKILL.md` — VGEN Plan author, consumes breakdown when GAGAD ships
- Future: `agents/exec/gag_assistant_director.md` (EXEC-GAGAD spec, planned)
- Future: `specs/contracts/gag_plan@v1.yaml` (formal SPC-gag_plan contract)

## 16. Open questions for v0.2

To be answered after E22 + E15-E01 smoke retros:

- Какая **минимальная density** работает для kids audience vs adult? (sample size 1 эпизод недостаточен)
- Нужны ли **sub-categories** внутри SAND_GAGS? (dust vs flow vs cement — три разные физики)
- Можно ли формализовать **gag readability score** (0-10) для EXEC-GAGAD'а?
- Какие **antagonist'ы** работают для разных тем? (table расширить после 5+ эпизодов)
- Frequency rule для combo gags — каждый эпизод или раз в 3 эпизода?

## 17. Object-causality formula (E02 canon)

Эмпирически валидированная формула из SS-S15-E02 «The Tidy Tornado» —
подтверждённый позитивный контроль против E03 v01 (который потерял читаемость).
Шесть стадий обязательны в указанном порядке; каждая — отдельный visible beat.

1. **Tiny mess** — Sandy замечает ОДНО конкретное маленькое нарушение порядка
   (один объект, одна поверхность). Не «беспорядок вообще» — конкретный предмет.

2. **Overconfident shortcut** — он применяет слишком быстрый / слишком грубый
   метод уборки. Метод выражается **goal-глаголом**: wipe, sweep, stack, stuff,
   polish, scoop. Зритель ЧИТАЕТ намерение через глагол-действие.

3. **False success beat** — Sandy считает, что справился. Гордый кивок,
   довольная поза, секунда самодовольства. **Это ОБЯЗАТЕЛЬНЫЙ отдельный beat**,
   НЕ совмещённый с backfire — зрителю нужен момент, чтобы поверить в победу.

4. **Object-specific backfire** — ТОТ ЖЕ объект (или перемещённый мусор)
   наносит ответный удар физически причинным способом. Последствие конкретное
   и видимое на экране — не абстрактный «хаос».

5. **Accumulation** — каждый backfire оставляет **persistent state**, который
   наследует следующий gag. Что опрокинулось — стоит опрокинутым. Что упало —
   лежит на полу. Нарушение continuity = нарушение comedy logic.

6. **Micro-victory delusion** — финальный payoff: Sandy находит ОДНУ крошечную
   «победу» среди катастрофы и отмечает её, не замечая масштаба разрушения.
   Ironic resolution темы через ложное самоощущение.

### Verb grammar (anti-E03 rule)

Комедийный beat читается через **goal-verb**, побеждаемый объектом:

| ✅ goal-verbs (читаемо) | ❌ kinetic chain-verbs (нечитаемо) |
|---|---|
| sweep, stack, wipe, scoop, polish | spin, windmill, catapult, ricochet, cascade, pinwheel, slide |

**Beat, содержащий только kinetic chain-verbs и ни одного goal-verb, — НЕ gag.
Это filler.** Зритель видит движение, но не читает намерение → юмор пропадает.

Диагностика: спроси «что Sandy пытается сделать с уборкой в этом beat?»
Если ответ невозможен без backstory → beat нечитаем → переписать с goal-verb.

**Референс E02:** sweep/stuff/stack/polish → читаемо.
**Антирефeренс E03 v01:** spin/windmill/catapult/slide/pinwheel → нечитаемо.

---

**v0.1 closed 2026-05-19 by Тео.** Next revision after first 3 episodes with this skill applied.
