---
name: critic-revision-cap-doctrine
description: "Critics return for revision max 2-3 attempts, then auto-escalate to Director via HALT verdict. Director's decision is law, no further Critic blocking."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: f0a3593b-9989-42e0-b220-580d55abe0ba
---

# Critic revision cap — process control doctrine

**Director directive 2026-05-27:** «у нас задача вот этих всех критиков была в том чтобы не блокировать навсегда а в том чтобы возвращать на доработку и если не получается с одной-двух максимум трёх попыток доработать то отправлять на рецензию директору то есть решение директора должно быть законом»

## Rule

Every Critic agent (EXEC-EPREV / EXEC-VPREV / EXEC-GAGAD / future critics) MUST:

1. **REVISE on legitimate failures** — bounce upstream Plan back for re-author
2. **Track revision count** in upstream Plan's `metadata.{critic}_revision_count`
3. **Cap at N=2 (configurable per critic)** — on the 3rd would-be REVISE, emit verdict `HALT` instead
4. **HALT semantics:**
   - Plan **stays in REVIEW** (NOT REVISION) — so Director can approve as-is
   - `revision_requested` activity event with `severity: warning` surfaces Director attention
   - Director sees full revision history (every Critic acceptance_criteria, every Animator response)
   - Director's approve/reject = final, no further auto-REVISE loop

**Why:** Without a cap, Critics can REVISE forever on edge cases where reasonable people disagree. Director's job is to be the tie-breaker. System should auto-escalate, not silently churn money + frustration.

## Why this rule exists

**Why:** Director's intent for Critics was always «return for fixes, escalate after N tries», but I implemented only GAGAD's HALT logic. EXEC-VPREV + EXEC-EPREV ship without cap. SH19 burned through 9 Plan versions in one day (v01..v09) — money + time wasted on what should have been Director-arbitrated after attempt 3.

**How to apply:** When designing any new Critic agent OR touching existing Critic runners (runner.ts EXEC-VPREV / EXEC-EPREV cases) — implement the GAGAD pattern: revision counter in upstream metadata, cap, HALT verdict, activity_event. The pattern is at `runner.ts:1119-1187` for GAGAD; mirror exactly. Tests must include «3rd revision → HALT, not REVISE».

## Related doctrines

- [[train-personnel-doctrine]] — data + capability expansion needs skill teaching, same rule applies to Critics learning new acceptance criteria
- TD-74 `directorOverrides` — preventive override (waiver upfront)
- TD-83 — implementation backlog for this doctrine

## Anti-pattern

❌ A Critic that REVISE'ed 5+ times on the same Plan with shifting acceptance criteria. Symptom: Animator is writing v06, v07, v08 with progressively narrower changes; cost per iteration ~$0.05 + 30-60s wall time.

✅ A Critic that REVISE'ed 2 times then HALT'ed. Director sees the third try with «Critic capped — your call». Decides in 30 seconds.
