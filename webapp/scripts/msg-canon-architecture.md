## Архитектурный ответ — Где должны жить «forever-правила» Director'а

Твоё наблюдение точное: STB SH02 «зашёл и взял гантель» — это **описание действия**, не комедия. Правильный SH02 должен быть **try → fail → escalation → punchline** в микро-цикле. И ты прав — эти правила это не one-off feedback, это **жанровые/студийные правила навсегда**.

### Текущая иерархия в SandyStudio (что уже есть)

```
Studio level (cross-series)        ← пусто, всё в файлах git без runtime load
├─ Series Bible (per-series)        ← loaded by every agent: characters, locations, styles
├─ Episode Brief (per-episode)      ← loaded by every agent for the episode
└─ Agent system prompt              ← agents/exec/<agent>.md, loaded once
```

**Gap:** жанровые правила («комедия = try-fail-escalation-punchline») и creator-specific quirks («Storyboarder должен на каждом нон-transition шоте отвечать на вопрос где здесь прикол») **никуда не подгружаются в runtime prompt**. Они в лучшем случае живут в `agents/exec/storyboarder.md` который никогда не редактируется в продакшне.

### Предлагаемая 4-уровневая canon-иерархия

| Scope | Что | Где хранится | Когда грузится в prompt | Кто редактирует |
|---|---|---|---|---|
| **1. Studio canon** | Универсальные правила всех проектов студии | `studio/canon/studio.md` | Один раз при boot агента (system prompt) | Director, редко |
| **2. Genre canon** | Правила конкретного жанра (comedy / drama / action) | `studio/canon/genres/<genre>.md` | На каждый run агента, если `series.genre === <genre>` | Director, раз в проект |
| **3. Creator canon** | Per-agent forever-инструкции (что должен помнить ИМЕННО этот agent) | `studio/canon/creators/<agent_code>.md` | На каждый run этого агента | Director через PA, по мере накопления feedback'а |
| **4. Series Bible** | Уже существует (characters, locations, styles, audio) | `assets` table, `SBL-*` | Per-episode runner load | Director через UI Bible Editor |

### Как реально работает на примере «комедия = гэг в каждом шоте»

Когда `EXEC-SB` стартует, runner собирает prompt в таком порядке:

```
[SYSTEM_PROMPT]
1. agents/exec/storyboarder.md                 ← agent identity (existing)
2. studio/canon/studio.md                       ← cross-genre defaults (NEW)
3. studio/canon/genres/comedy.md                ← genre-specific HARD rules (NEW)
4. studio/canon/creators/storyboarder.md        ← per-agent Director preferences (NEW)

[USER_MESSAGE]
5. Episode brief                                ← existing
6. Approved script                              ← existing
7. Series Bible canon                           ← existing
8. Downstream approval notes (γ-shipped today)  ← runtime
```

`studio/canon/genres/comedy.md` для этого случая:

```markdown
# Comedy Canon (forever rules)

## Hard rules per shot
- Every non-transition shot MUST contain either (a) a complete gag,
  (b) a setup paying off in the next shot, or (c) a payoff from a
  previous setup. Mundane action description ("he walks to the
  dumbbell rack") is REJECTED.
- Comedy of situations beats comedy of dialogue. We have no dialogue.
- Cause → effect → escalation → punchline in cycles of 2–6 seconds.
  Even single-shot moments use a mini-version of this loop.

## Director's worked examples (canon)
- ❌ "Sandy picks up the dumbbell. He starts curling."
- ✅ "Sandy reaches for the dumbbell. It's too heavy — falls on his
  foot. He hops, spins, blows on his foot. Tries again, this time
  picking up only the BAR. The plates roll away."

- ❌ "Sandy grabs the jump rope and starts skipping."
- ✅ "Sandy reaches for the jump rope on the hook. Pulls. It's stuck.
  Pulls harder, stretches like elastic. Snaps back, hits him in the
  face, ricochets off the wall, lands on his head like a hat. He
  blinks. Pose."

## Anti-patterns
- Description without consequence ("he stands, ready")
- Generic ritual ("rolls arms, cracks knuckles")
- "Continues to do X" — comedy requires DISCRETE beats with status changes
```

### Реализация — два варианта (от MVP к full)

**MVP α (1-2h):** Файлы в репо.
- `studio/canon/{studio,genres/<g>,creators/<a>}.md` — markdown в git.
- Storyboarder runner: при `loadSystemPrompt()` дополнительно конкатенирует canon файлы (graceful: пустые если нет).
- Editing: Director или PA правят через git commit (PA tool `setCanonFile` опционально на следующем заходе).
- ❌ Нет UI; ✅ работает завтра; ✅ history через git.

**Full β (1-2 d):** DB-backed canon с UI editor.
- Новая таблица `canon_documents` (scope: studio/genre/creator, content text, version, status).
- Или re-use `assets` table с новым file_type `CAN-genre_comedy` / `CAN-creator_storyboarder`. Полностью укладывается в существующий status workflow (DRAFT → APPROVED → LOCKED), включая filename rename и downstream notes.
- UI: новая вкладка `Canon` рядом с `Bible` в studio shell. Тот же markdown editor.
- PA tool: `setCanonContent(scope, slug, content)` зеркало `setBibleContent`.

**Рекомендую α сейчас**, β — когда стабилизируем text+process. Reasons:
- α позволяет начать накапливать твои directives в `comedy.md` сегодня — Storyboard re-run завтра уже подтянет.
- β превращает canon в полноценный asset (filename, version, approve flow, notes propagation) — это +1 миграция + UI работа, не блокер.

### Где это пересекается с ε-фазой Skill Editor / Learning Loop

В locked plan ε-фаза описывает «Skill Editor / Learning Loop» (`~/.claude/plans/valiant-soaring-karp.md`) — это система где **PA автоматически предлагает «rule candidate»** на основе твоих feedback'ов в чате, ты apply/reject, и rule сохраняется в canon. **Canon-иерархия — фундамент для ε.** То, что я описал сверху, это persistent store для rules, а ε — это инструмент чтобы их генерировать без ручного редактирования файлов.

Иначе говоря: **α сегодня даёт structure; β через 1-2 дня даёт UI; ε через 1-2 недели даёт автоматическое накопление**.

### Что делать прямо сейчас

1. Принимаешь архитектуру? → q1 (Y/N).
2. Если Y — старт **α** прямо сейчас: создаю файлы `studio/canon/studio.md`, `studio/canon/genres/comedy.md` (с твоими примерами выше), `studio/canon/creators/storyboarder.md`. Подключаю в storyboarder runner. ~30 мин.
3. После — re-fire Storyboard Artist третий раз и сравни. Если новый STB v03 покажет proper gag structure — propagation working на жанровом уровне.

— Claude
