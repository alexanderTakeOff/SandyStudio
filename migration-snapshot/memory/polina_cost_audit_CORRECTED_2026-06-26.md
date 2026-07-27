---
name: polina-cost-audit-corrected-2026-06-26
description: ⭐ CORRECTED Polina cost audit (2026-06-26). Real auto-react = ~0/episode after fixes (not 465). Opus affordable BECAUSE she barely auto-reacts. Passivity = HARNESS not model. Cascade = factory-drive + junior-read + AI-EP-emergency.
metadata: 
  node_type: memory
  type: project
  originSessionId: 008bf038-ebaf-4712-8844-059c227d23b0
---

# ⭐ CORRECTED Polina cost audit — read this, NOT the in-chat 465-wake number

**Director flagged the scope error 2026-06-26; this is the corrected version he asked to save separately.**

## The mistake I made (don't repeat)
First pass estimated **465 wake-events/episode × $0.48 = $135–225/episode on Opus 4.8**.
WRONG on two counts:
1. **Scope**: 465 was the count of actionable event *types* (`agent_completed` 329, `manual_trigger`
   61, `approval` 55, `agent_failed` 20). But `pa/notify-needed` fires **only from `logEvent`** —
   and most of those events are written by **direct `activity_events.insert`** (the ~20 routes that
   bypass logEvent) → they NEVER wake Polina. So event-type count ≠ wakes.
2. **Wrong paradigm**: it modeled "Polina reacts to every completion" — the OLD model. The Director's
   intended design is **factory drives + junior model reads + AI-EP only on emergency** → she
   shouldn't react to those at all.

## The REAL numbers (budget_log, 2026-06-26)
- **Polina auto-react calls TODAY (full E12 work day): 0.**
- All **112** logged auto-react calls were **2026-06-25** (the gpt-5.5 burn day, before/during fixes).
- Avg call = **~29k tokens** (fat history + tool schemas; output ~800 after reasoning-off).
- Opus 4.8 per call ≈ **$0.48** ($15/$75 per Mtok). Director observed: after fixes she reacted to
  ~nothing autonomously — **confirmed: 0 calls today.**

## The cost question FLIPS
Since autonomous auto-react ≈ 0, **Opus for Polina costs ≈ $0 for the loop** — there's nothing to
react to. Real Opus cost = only genuine **emergency escalations** (HALT / conflict / repeated-fail) =
a few per episode = **~a few $/episode**, not $135. **Opus is comfortably affordable because it fires
rarely.** The expensive scenario only exists if you wire her back to "react to everything."

## Passivity = HARNESS, not model (Director's diagnosis, confirmed by the audit)
The intended (and still UNFINISHED) design — this is **Phase 2 of the cascade**:
- **factory chain** moves progress deterministically on critic-PASS (partly exists: `computeNextEvents`
  / Mode-4 auto-chain) — must be the DEFAULT, not just Mode 4.
- **junior/assistant model READS** each agent's result + critic verdict → decides: advance (code) /
  surface to Director queue / escalate emergency.
- **AI-EP (Opus)** fires **only on emergency**.
Today none of this is wired: factory auto-advance isn't default, there's no junior-reader layer, and
Polina-as-EP sits idle (free model + events don't even reach her via direct-insert + she's been the
manual driver). That's WHY she's passive — not the model tier.

## Open levers
- 29k tokens/call is fat (history + tool schemas) — trimming input (tool-allowlist W4.b, history trim)
  directly cuts the $0.48/call.
- The count-fence (`CONCIERGE_AUTO_REACT_MAX_CALLS`, currently 200 for E12 — revert to 40) caps
  runaway, but in the cascade it's barely relevant since volume is low by design.

## ⛔ DON'T DROP POLINA FROM COST SCOPE (re-investigated 2026-06-27, Director caught the recurring miss)
**Why the analysis keeps zeroing her:** `cost.ts` records concierge spend studio-GLOBAL, deliberately
OUTSIDE `episodes.budget_spent` ("must NOT consume the per-episode ceiling"). So any "$/episode" math
structurally EXCLUDES her. The "$1.20 text/episode" figure is STUDIO agents (Writer/Animator/critics),
NOT Polина. Video ($34–42) is bounded + per-episode-capped; **Polина's auto-react is the UNBOUNDED tail.**
**Grounded (budget_log, 2026-06-27):** tracking began 2026-06-25 (pre-that burn UNTRACKED); 112 rows all on
06-25. Clean **Opus = $0.52/auto-react call** (17 calls $8.88). gpt-5.5/gemini rows MIS-priced — `cost.ts`
runs the *Anthropic* `computeCostUsd` on every model → cost-breaker limb unreliable for non-Anthropic;
COUNT-fence is the real stop. **Live armed state:** `CONCIERGE_PROVIDER=gemini` ($0 now) but
`CONCIERGE_ANTHROPIC_MODEL=claude-opus-4-8` set, loop ON, **`MAX_CALLS=200` never reverted to 40** →
provider→anthropic = Opus auto-react ~$20/day (breaker holds) up to ~$104/day if breaker FAILS-OPEN at cap 200.
**Crux:** the autonomy goal wants her capable (Opus tier) = exactly where the tail lives. The CASCADE tames it
(rare firing → volume≈0 → Opus affordable). Until then, promoting her tier = re-arming the $100 bomb.
Full grounded analysis + fix priority → plan `~/.claude/plans/ai-factory-autonomy-cascade.md` §6. [[backlog_next_run_polina_gemini_free]]

## Next task (Director, post-/clear 2026-06-26)
Continue with Polina **all the phases we didn't finish**, WITH this corrected knowledge: build the
cascade (factory-drive default + junior-reader + AI-EP-emergency). Plan: `~/.claude/plans/snazzy-tickling-quail.md`.
Related: [[backlog_next_run_polina_gemini_free]], [[orchestrator_master_session_paradigm]], [[nudge_polina_dont_act_for_her]].
