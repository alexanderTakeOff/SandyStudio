---
name: anti-additivity-principle
description: "Reuse & subtract first — if something existing covers ~80% REUSE it (don't spawn parallel entities); else reach the result by REMOVING code/options before adding. Director's core working principle, cross-project. Enforced by before/after hooks."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 17f9c632-0573-4837-b140-01d3da0b93eb
---

**Долой аддитивность · переиспользуй имеющееся.** Two sibling reflexes, in order: (1) **REUSE** — if something existing already covers ~80% of the task, use/extend it in place; don't spawn a parallel entity that does the same job. (2) **SUBTRACT** — when a change IS needed, the FIRST question is «what can I REMOVE to get there?», not «what do I add?». Aim to reach ≥80% of the result by **subtraction** — deleting code, collapsing duplication, removing an option/branch/special-case — before reaching for addition (new file, function, flag, abstraction, dependency). Fewer changes = fewer bugs.

**Why:** Codebases rot by accretion; each fix bolts on one more option/handler/fallback until the same logic lives in N places and one change silently breaks the others (the ~20-defect SandyStudio video-pipeline cascade was one lesson un-applied across 5 duplicated layers). The cure for accretion is not more accretion — it's consolidation and deletion. Operational expression of KISS/DRY/YAGNI as a *default reflex*.

**How to apply:**
- BEFORE work — Subtraction Pass: what already does 80%? can I delete duplication instead of adding a guard? can I remove an option instead of adding one? is the new entity truly load-bearing? if I must add, what do I delete in the same change (aim net line-delta ≤ 0)? Always *name the subtractive alternative out loud*, even when deciding to add.
- AFTER work — Net-Delta Audit: did this ADD or REMOVE net? did I add an entity a subtractive path could have avoided? did I leave collapsible duplication standing? If «added when I could have subtracted» → go subtract or flag the debt.
- Addition is justified only when: no existing surface to reuse/collapse, subtractive path demonstrably <80%, removal breaks a load-bearing contract, OR the addition is itself a deletion-enabler (net-negative).

**Where it lives:** canonical rule `~/.claude/rules/common/anti-additivity.md` (auto-loaded every session). Enforced actively by two hooks in `~/.claude/settings.json` — `UserPromptSubmit` (recall before) + `Stop` (audit after). Established 2026-06-04.

Related: [[director_minimal_changes_no_new_entities]] (don't invent entities; minimal changes — the concrete precursor), [[architectural_rethink_over_patches]].
