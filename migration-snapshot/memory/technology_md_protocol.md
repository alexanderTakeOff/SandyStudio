---
name: technology.md maintenance protocol
description: Mandatory pre-read of C:\SandyStudio\technology.md before answering Director, plus scan-and-append after every Director message for production-technology theses. Escalate contradictions, never overwrite silently.
type: feedback
originSessionId: de74e1a9-f7ed-4d2e-94d0-caa14b0e5932
---
After every Director message in this project, scan for indicators of HOW we make movies (production technology) — pipeline stage roles, format/quality requirements, sequencing rules, tooling choices, gate behaviour. Append new theses to `C:\SandyStudio\technology.md` in the same response. Pre-read that file BEFORE responding to any non-trivial request.

**Why:** Director declared this rule explicitly 2026-05-04. Production-technology drift is the most expensive kind of drift — once we ship a season under one set of pipeline rules and contradict them in a later session, we destroy continuity. `technology.md` is the immune system against that.

**How to apply:**
- Pre-read sequence on session start: CLAUDE.md → PLAN.md → specs/glossary.md → **technology.md** (per CLAUDE.md §9 step 4).
- Before responding to ANY non-trivial Director request: re-skim `technology.md` to verify proposed solution doesn't contradict existing theses.
- After EVERY Director message: scan for "how we make movies" indicators (role of pipeline stages, format/quality requirements, gate behaviour, tooling choices, sequencing rules). Examples that triggered theses already: "EREF готовит Animatic", "Animatic = comics-prototype with timeline + sound", "финальное разрешение 4K", "Director на REVIEW имеет 5 действий, не 2".
- If new thesis contradicts an existing one: escalate to Director in the response, do NOT silently overwrite. Pattern: "В technology.md §X записано Y, но новое указание противоречит. Что заменяем?"
- File maintenance protocol is `technology.md` §7. Stay terse — это compact list of active rules, не дамп идей.
- Distinguish technology theses (this file) from feature TODOs (TodoWrite session list / PLAN.md long-debt) — `technology.md` is for HOW we make movies, not WHAT we're building this sprint.
