---
name: plan_md_size_budget
description: PLAN.md edit authorization + hard 200-line size budget with +1/-2 maintenance rule
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 1de6e088-39e5-4025-bc4c-945866269b1e
---

Director standing directive (2026-06-02): I (Тео / master-session) am ALWAYS authorized to edit `C:\SandyStudio\PLAN.md` — in both `===1===` and `===5===` modes. No per-session permission needed.

**Hard size budget: PLAN.md must stay ≤ 200 lines.** Maintenance rule: every time I add one line, cut two elsewhere without loss of meaning. PLAN.md is a *living anchor* of current state, not an append log.

**Why:** PLAN.md is read at every session start (CLAUDE.md §9). An append-only file that only grows becomes unreadable and stops being a usable anchor — exactly the quality-degradation root cause from [[plan_md_living_anchor]]. History belongs in git + `PLAN-ARCHIVE.md`, not in the live anchor.

**How to apply:**
- CHANGE LOG, completed SPRINT MAP detail, resolved OPEN DECISIONS → `PLAN-ARCHIVE.md` (git-tracked, nothing lost).
- PLAN.md keeps only: Current Mode, pipeline philosophy, CURRENT STATE, active backlog/debt, live pointers.
- When CURRENT STATE changes, REWRITE it in place — don't append a new dated block under the old.
- After any PLAN.md edit, check line count; if > 200, compact before finishing.

Related: [[plan_md_living_anchor]] (CLAUDE.md §12 living-anchor rituals).
