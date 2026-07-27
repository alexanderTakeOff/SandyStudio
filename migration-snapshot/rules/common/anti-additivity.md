# Anti-Additivity — Reuse & Subtract First

> **Personal directive from the Director. Applies to every project, every session.**
> Established: 2026-06-04 (SandyStudio session — Gate-Hardening Phase 2 planning).
> Director: «долой аддитивность — всегда изучай возможность добиться результата хотя бы на 80%, но не ДОБАВЛЕНИЕМ кода, опций, функций, а УБАВЛЕНИЕМ» · «если уже существует то, что закрывает около 80% задачи — ПЕРЕИСПОЛЬЗУЙ, не плоди новые сущности».

## The two reflexes

This rule carries two sibling reflexes that fire in order before any build:

1. **REUSE** — if something already exists that covers ~80% of the task, use it.
   Don't grow a second thing that does the same job.
2. **SUBTRACT** — if you must change the system, reach the result by REMOVING
   (code, options, duplication, special cases) before reaching for addition.

Both serve one law: **the fewer new things we write, the fewer bugs we ship.**

## Reuse before you build

Before writing anything new, search for what already does the job:

- **Is there an existing function / module / path / config that covers ~80%?**
  Reuse or extend it in place. Do NOT spawn a parallel implementation «that's
  cleaner» — two things doing one job is exactly the duplication that rots.
- **Search first, build second.** Grep the codebase for the capability, check the
  shared libs, check the package registry for a battle-tested dependency, before
  hand-rolling. (See [development-workflow.md](development-workflow.md) §0.)
- **Extending one caller beats forking a second path.** If reuse needs a small
  tweak to the existing surface, make that tweak — don't copy-paste-and-diverge.
- A new entity is justified only when nothing existing reaches ~80% and the gap
  matters. Name what you looked at and why it fell short.

«Reuse» and «subtract» converge: reusing the existing surface IS the subtractive
move, because it avoids adding a second one.

## The subtraction principle

**The fewer things we change and write, the fewer bugs we ship.** When a change
IS needed, the FIRST question is not «what do I add?» but **«what can I REMOVE to
get there?»**.

Aim to reach **at least 80%** of the desired result by **subtraction** — deleting
code, collapsing duplication, removing an option, killing a branch, eliminating a
special case — *before* you reach for addition (new file, new function, new flag,
new abstraction, new dependency).

Addition is the last resort, not the first instinct. Every new line is a new
surface for bugs, a new thing to maintain, a new thing the next agent must read.
Subtraction makes the system smaller, clearer, and safer at the same time.

## Why it exists

Codebases rot by accretion. Each fix bolts one more option, one more handler,
one more fallback onto the pile — until the same logic exists in five places and
a change in one silently breaks the other four (the SandyStudio video-pipeline
cascade: ~20 defects from one lesson un-applied across five duplicated layers).
The cure for accretion is not more accretion. It is consolidation and deletion.

This principle is the operational expression of KISS/DRY/YAGNI
([coding-style.md](coding-style.md)) and the skill-creation abstraction principle
([skill-creation.md](skill-creation.md)) — but stated as a *default reflex*, not
just a review-time checklist.

## The two gates (before work / after work)

### BEFORE you start building — the Subtraction Pass

For any non-trivial change, run this mental pass FIRST and out loud:

1. **What already exists that does 80% of this?** Reuse it. Don't re-implement.
2. **Can I delete duplication instead of adding a guard?** If the same logic
   lives in N places, the fix is usually to collapse to 1, not to patch N.
3. **Can I remove an option / branch / special case** rather than add one?
   A special case eliminated is a class of bugs eliminated.
4. **Is the new file/function/flag truly load-bearing**, or am I reaching for it
   because it's the obvious move? Name the subtractive alternative explicitly and
   say why it does or doesn't reach 80%.
5. **If I must add, what do I delete in the same change** to keep net complexity
   flat or negative? Prefer changes whose net line-delta is ≤ 0.

State the subtractive option you considered, even when you decide to add. «I
looked at removing X; it only gets 60%, so I'm adding Y» is acceptable. Silently
defaulting to addition is not.

### AFTER you finish — the Net-Delta Audit

Before declaring a task done:

- **Did this change ADD or REMOVE net?** State the rough net line/option/file
  delta. A negative or flat delta is the goal for most fixes.
- **Did I introduce a new entity** (file, function, flag, abstraction, dependency)
  that a subtractive path could have avoided? If so, was that trade-off justified
  and stated?
- **Did I leave duplication standing** that this change could have collapsed?
- If the honest answer is «I added when I could have subtracted» — **go back and
  subtract** before shipping, or explicitly flag the debt.

## What «subtract» looks like in practice

| Instead of adding… | Subtract by… |
|---|---|
| a new option to handle a case | removing the case (make it impossible by construction) |
| a guard/fallback in N call sites | collapsing the N sites to one shared path |
| a parallel hand-rolled handler | deleting it and routing through the existing canonical path |
| a config flag for two behaviours | picking one behaviour and deleting the other |
| a new abstraction «for flexibility» | inlining and waiting until the third real caller (YAGNI) |
| a compatibility shim | migrating callers and deleting the old surface |

## When addition IS justified

Subtraction is the default, not a dogma. Addition is right when:

- There is genuinely no existing surface to reuse or collapse (a real new capability).
- The subtractive path demonstrably gets well under ~80% and the gap matters.
- Removal would break a load-bearing contract the Director relies on.
- The addition is itself a *deletion enabler* (e.g. one small shared helper that
  lets you delete a large duplicated block — net-negative overall).

In all these cases: **name the subtractive alternative you rejected and why.**
The reflex must be visible even when the answer is «add».

## Cross-references

- [coding-style.md](coding-style.md) — KISS/DRY/YAGNI, «many small files», immutability.
- [skill-creation.md](skill-creation.md) — abstraction over concretion; don't leak content downward.
- [partnership.md](partnership.md) — counter-proposing a subtractive path over a literal additive instruction is part of the job, not insubordination.

## Operational notes

- Cross-project — every project, every session.
- Does NOT override security / copyright / safety rules.
- Enforced actively by two hooks in `~/.claude/settings.json`
  (`UserPromptSubmit` recall before work, `Stop` net-delta audit after work) so
  the reflex fires automatically, not just when this file happens to be in context.
