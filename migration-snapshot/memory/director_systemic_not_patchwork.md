---
name: director_systemic_not_patchwork
description: "Director wants systemic architecture, not a repair-list of patches; state is the invariant, driver is a choice"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: eef01911-d8a4-42a2-ba90-6c1ce98f5d8a
---

Director (2026-07-03, E14 arch discussion) rejected an architecture proposal because its end was
**«сумбур и заплатничество» — латание заплаток.** «Вместо чёткой структуры вижу просто ремонт того,
где не работает. Подход неправильный.»

**Why:** a list of point-fixes ("fix stitch, fix music, fix stale-anchor") reads as patchwork and
hides the real systemic cause. Director thinks in clean invariants, not repair backlogs. He also
caught an inconsistency: I said "let logic/agent handle it" then bolted "hard logic for stitch" —
either I misunderstood or the proposal wasn't systemic.

**How to apply:**
- When proposing architecture, find the ONE underlying phenomenon and express it as an invariant;
  show how the individual symptoms fall out of it. Don't hand Director a fix-list.
- The systemic frame we converged on: **the problem is not «who presses the button» — it's clear
  understanding of STATE. State = the invariant; driver (code or strong agent) = a choice.** Both
  read the same state; the fixes are «complete the state machine + pull human/agent out of the
  mechanical loop», not N separate patches. See [[autonomous_factory_architecture_doctrine]].
- Director engages deeply and iteratively on architecture («поговори, покритикуй, потом попробуем»)
  — give real critique/pushback (partnership), don't sycophantically agree. He steelmans, probes
  consistency, and reasons about cost as «fits my budget or not» (not abstract cheap/expensive).
- Anti-additivity applies: prefer «обобщить существующий примитив» (e.g. stale-anchor freshness →
  whole graph) over adding patches. [[anti_additivity_principle]]
