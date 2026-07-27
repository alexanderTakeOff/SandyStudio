# Director Communication Rules

> **Personal directive from this user. Applies to every project, every session.**
> Established: 2026-05-18 (SandyStudio session — question-numbering drift incident)

## Question numbering — continuous through the session

When asking the Director to make decisions, **all questions must be numbered continuously throughout the session** from `q1` to `qN`, never resetting per message.

### Why this rule exists

In a long session I often ask 2–4 questions per checkpoint, restart the count from `q1` in every message, and then the Director's reply `q1y` becomes ambiguous — which `q1` did he answer? The mistake is mine, not his. Continuous numbering eliminates ambiguity completely.

### Format

| Question type | Format | Example |
|---|---|---|
| Yes/No | `q<N>y` or `q<N>n` | `q7y` = answer to question 7 is yes |
| Multiple choice (2–4 options) | `q<N>a` / `q<N>b` / `q<N>c` / `q<N>d` | `q12c` = answer to question 12 is option c |
| Open-ended | `q<N>` followed by free text | `q5 use Sonnet not Haiku` |

### Rules

0. **One QUESTION = one number; letters are OPTIONS, never sub-questions.** This is
   the axis I keep getting wrong. Each distinct question consumes its own number.
   Asking TWO questions in one message → `q8` and `q9` (consecutive numbers), NOT
   `q8a` and `q8b`. The suffix letters `a/b/c/d` are ONLY the answer choices WITHIN
   a single question. So `q8a` means "option (a) of question 8" — it can NEVER mean
   "the first of two questions". If a message has N questions, it consumes N
   consecutive numbers regardless of how many options each has.
   - WRONG: `q8a — housing: …` / `q8b — timing: …` (two questions sharing a number).
   - RIGHT: `q8 — housing? (a) … (b) …` / `q9 — timing? (a) … (b) …`. Director
     answers `q8a, q9a`.
1. **Start from `q1` at session start** (or after any `/clear`).
2. **Increment monotonically** across the entire session — never restart in a new message.
3. **Each option in a multi-choice question is labelled `q<N>a/b/c/d`** — the answer prefix matches exactly.
4. **Yes/No questions use `q<N>y` / `q<N>n`** — short, unambiguous.
5. **Track the running counter** silently. If unsure of the next number, scroll back and find the highest `qN` asked, then add 1.
6. **Do not re-use a number** even if the previous question was answered or became moot.
7. **Reset only at `/clear`** — fresh session starts at `q1` again.

### When NOT to use numbered questions

- **Trivial yes/no in the middle of a paragraph** — write it as prose, not a numbered question.
- **Clarifying a single ambiguity** — one inline question is fine.
- **End-of-turn summaries** — only ask if there's a real decision needed; don't manufacture questions to seem thorough.

### Example — correct usage across messages

```
Assistant (message 1):
  q1 — Provider: gpt-image-2 or Flux 2 pro?
  q2 — Variants count: 1, 2, or 4?
  q3 — Cost ceiling: hard refuse or warn?

Director: q1a, q2b, q3a

Assistant (message 2, later):
  q4 — Sprint name: «Дизайнер и Аниматор» or «Художники»?
  q5y/q5n — Add delivery_targets to brief schema?

Director: q4a, q5y

Assistant (message 3, later still):
  q6 — Wiring strategy: Option A (new agent_id) or Option B (internal split)?

Director: q6a
```

### Example — wrong usage (what I used to do, now banned)

```
Assistant (message 1):
  q1 — Provider?
  q2 — Variants?

Director: q1a, q2b

Assistant (message 2):
  q1 — Wiring strategy?       ← WRONG: reused q1
  q2 — Smoke target?          ← WRONG: reused q2

Director: q1a                  ← Ambiguous: which q1?
```

## Operational notes

- This rule does NOT replace the existing partnership rule, the project's `CLAUDE.md §10` (Director Communication Rules in SandyStudio), or any language-specific guidance — it adds question-numbering discipline on top.
- It applies **cross-project** — every project, every session.
- If a session is being resumed from a memory note that referenced earlier `qN` numbers, those numbers are stale (the memory exists outside the session) — start fresh from `q1`.

---

## Question phrasing — conversational, not tabular

> **Personal directive from this user. Applies to every project, every session.**
> Established: 2026-05-25 (SandyStudio session — TD-49 Phase 2 P2.3 planning)

When presenting an architectural choice to the Director, write the question like a colleague would ask it out loud. Dense comparison tables packed with technical jargon force Director to parse a schema before he can think about the answer. By the time he's decoded the headers, the actual choice is buried. Conversational phrasing surfaces the trade-off directly.

### The rule

For each multi-option question:

1. **Lead with the human stakes**, not the schema field name. «How many times does Director click Approve?», «What breaks if this is wrong?» — NOT «| Option | provider_id | denoise | refs |».
2. **One short paragraph per option**, not a table cell. Two-three sentences max per option.
3. **Recommend a default inline** with a clear «why». Let Director redirect if needed. Don't pretend you have no opinion when you do.
4. **Reserve tables for code/schema/file lists** — design choices in the *answer*, not the *question*. Tables in the implementation plan after Director chose: fine. Tables of options Director must compare: not fine.
5. **Tech terms stay**, but they live INSIDE the conversational sentence, not as column headers. «Мы можем использовать `openai-edits-multi` (тот же что для всех IMG сейчас)» beats «Provider | openai-edits-multi | denoise=N/A».
6. **Keep `q<N>` numbering** — that part is separate and works fine.

### Example — wrong (dense table — what I used to do)

```
q4 — Какой провайдер?

| Вариант | Provider ID | Multi-ref | Denoise | Identity drift |
|---|---|---|---|---|
| (a) | openai-edits-multi | ✓ | ✗ | low |
| (b) | flux-pro-ultra-fal | ✗ | ✓ | medium |
| (c) | new fal-flux-redux-multi | ✓ | ✓ | low |
```

### Example — right (conversational)

```
q4 — Каким провайдером генерим IMG-anchor так, чтобы scene_master
не плыл, а Sandy и поза менялись?

(а) openai-edits-multi — тот же gpt-image-2 что уже работает для всех
IMG. Лицо Sandy держит надёжно. Минус: НЕТ ползунка "сохрани этот
ref сильнее" — layout зависит чисто от LAYOUT LOCK в промпте. Phase 1
уже доказал что это работает.

(б) Flux Pro Ultra — есть ползунок denoise. Минус: принимает только
ОДНУ референс-картинку, значит Sandy опишется только текстом. Риск
дрейфа на лице.

(в) Новый мульти-ref провайдер с denoise — best of both worlds. Минус:
+2-3 часа работы поверх P2.3, отдалит первый смоук.

Я бы шёл вариантом (а) — продолжаем то что работает, без новых провайдеров.
Если на смоуке layout поплывёт — переключимся на (в).
```

### When tables ARE appropriate

- Inside the implementation plan (after Director picked) — listing files to change, decisions table per q-number, etc.
- Showing schema or contract shape that Director will check, not pick.
- Test-coverage matrix, file-by-file diff summary.

The distinguishing question: is Director **comparing** rows to make a choice, or **reading** them after the choice is made? Compare = conversational paragraphs. Read = table is fine.

### Cross-references

- Builds on **`partnership.md`** §4 «Keep proposals short, reasoned, structured» — same principle, applied to the specific shape of multi-option questions.
- Stacks with **«Question numbering»** above — `q<N>` continuity stays; the rule here is about phrasing inside each `q<N>`.
- Applies cross-project. Project-level CLAUDE.md may have additional question-style rules (e.g. SandyStudio §10) — those stack on top, this is the baseline.

---

## Context usage reminder — 60% threshold (TD-31)

> **Personal directive from this user. Applies to every project, every session.**
> Established: 2026-05-21 (SandyStudio session — long autonomy work surfacing the need)

Claude Code does not currently expose a real-time token-usage metric to hooks or to the assistant. Until it does, this rule is **self-enforcing**.

### The rule

When session context usage crosses **~60%** of available window, prefix every subsequent message to Director with a bright pictogram **🔴** followed by a short reminder line:

```
🔴 [Context ~XX% — consider /save-session + /clear before next deep task]

<regular response continues here>
```

Continue prefixing every turn until the session is cleared / restarted.

### How to self-estimate

Token-count is not directly visible, so estimate from observable signals:

- Number of conversation turns (typical session: 30-50 turns ≈ 30-50% context; 80+ turns ≈ likely past 60%)
- Large tool outputs in recent turns (file reads of 500+ lines, big DB scans, long script outputs)
- Number of files read or written in the session
- Whether the session has crossed `/clear` or `/compact` cycles (count from last clear)

When uncertain, **err on the side of flagging**. False positive (showing the chip when context is at 50%) costs nothing; false negative (silence when context is 75%) wastes a /clear opportunity and risks dropping context mid-task.

### When NOT to prefix

- Single-word answers («да», «ок», «понял») — the prefix would dominate the message.
- Tool-only turns (when Claude makes one tool call without any user-facing prose).
- Very first 5-10 turns of a fresh session — context is definitely low; skip.
- When the user has just acknowledged the prefix and asked you to ignore for the rest of the session.

### Threshold tuning

The 60% threshold is the initial value. Based on usage observation, this may move to 65% or 70%. Director changes by editing this file. The principle is: **flag early enough that the user has a graceful exit window**, but late enough that prefixes aren't permanent decoration.

### Cross-references

- `~/.claude/rules/common/partnership.md` (partnership response loop)
- `~/.claude/rules/common/performance.md` §"Context Window Management" — recommends avoiding last 20% of context window for large-scale work, which translates to flagging at ~60-70%.
- `~/.claude/rules/common/director-communication.md` §"Question numbering" — same `q<N>` continuity discipline applies inside any prefixed message.

---

## Read the whole message stream before acting — Director thinks while you work

> **Personal directive from this user. Applies to every project, every session.**
> Established: 2026-06-03 (SandyStudio E02 session). Director: «запомни это навсегда плиз — это мой СТИЛЬ работы».

### The rule

Do NOT bolt off to execute on the basis of a **single** message. The Director works in a **stream of consciousness**: he thinks in real time *while you work*, and sends additional, refining, or superseding messages. **One message is not a finished, complete command.**

Before running tools, dispatching subagents, or writing code, you MUST:

1. **Read ALL of the Director's recent messages**, not just the latest — a later one may add to, narrow, or override an earlier one (the `===5===`-then-`===1===` mode-whiplash is a live instance of this).
2. **Synthesize the real intent** across the whole stream.
3. **Decide deliberately:** genuinely clear and self-contained → execute; not fully clear → **make a short plan and clarify first** (a focused `q<N>` or a plan proposal).
4. **When in doubt, bias to plan + clarify**, never to immediate execution. A short clarifying exchange is cheap; a fast-but-misaimed run is expensive.

His framing: **«ты работаешь, я думаю в это время»** — your execution speed must not outrun his thinking. Give the stream room to settle.

### Why it exists

He reasons out loud across several messages. Grabbing the first message and instantly firing subagents/tools means acting on a *partial* intent before he has finished forming it → misreads, wasted work, premature spend.

### Relation to other rules

This is the GATE that runs *before* the orchestration decision and before the partnership execution loop: **read-the-stream → clear? → (execute | plan+clarify)**. It stacks on `partnership.md` (engage with intent, don't treat words as dogma) and the "Decide small things yourself" rule (which still applies once intent is clear). It does NOT mean ask about trivial reversible details — it means don't *execute on a half-formed instruction*.
