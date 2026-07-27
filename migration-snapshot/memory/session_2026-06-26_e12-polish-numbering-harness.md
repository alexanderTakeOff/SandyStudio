---
name: session_2026-06-26_e12-polish-numbering-harness
description: "Session 2026-06-26: E12 numbering cleanup + 8 videos + refs 13/14/24/25 fixes + harness. Lessons: don't blind-approve newest; regen-cap blocks service principal; gpt-image-2 anatomy pollution. Polina audit CORRECTED (see [[polina_cost_audit_CORRECTED_2026-06-26]])."
metadata: 
  node_type: memory
  type: project
  originSessionId: 008bf038-ebaf-4712-8844-059c227d23b0
---

# Session 2026-06-26 — E12 polish, numbering cleanup, Polina audit correction

## What landed
- **E12 numbering cleaned episode-wide.** Approved `STB-storyboard v1` is the clean canon (26 unique
  shots SH01-26, one scene each). Invalidated **34 stale ref_plan** stragglers (bare-id + wrong-scene
  SC06-SH13 phantoms, etc.) + **4 SH10 wrong-scene shot_plans**. Root of Polina's "не стартует" /
  silent no-ops was these duplicates, not the worker. SH05/18/19 shot_plans under stale scene
  (SC11/SC03) left as-is (no canonical sibling → re-tag is a separate careful step, VGEN-layer).
- **8 videos made** (Тео drove, bypassing Polina): SH4,16,20,21,22,23,24,26 — approve ref-plan →
  artist → approve shot-plan → VGEN. Clean, zero stale-id errors.
- **Refs 13/14** unblocked (were regen-CAPPED) → metelka refs. **SH25/SH24** re-posed with phone
  fixes. SH14 metelka v01 restored after my error (below).
- Director made the **E12 FINAL CUT — "super".** 🎬
- Code: harness already on master (`0095c54`); timeline poll speedup `8722b04` (30s→8s). Master clean
  for the neighbor's shot-numbering refactor.

## Lessons (important — Director-flagged)
1. **NEVER blind-approve "newest" version.** When Director says "X ок", he means the EXISTING
   canonical (the `metelka` canon frame), NOT the newest REVIEW. I approved newest for SH14 → the
   single-approved logic INVALIDATED the correct metelka v01 → I pushed the WRONG v03 to video. Always
   identify the canonical frame (metelka marker + date), show it, let Director approve manually when
   he's being careful. He un-invalidated both v01s himself "чтобы не ошибиться".
2. **regen-cap (default 6) exempts ONLY the human `director` principal.** Тео's `exec-dir-ai` service
   dispatches SILENTLY halt once a shot has 6 EREF attempts (no agent_started, the "silent no-op"
   that puzzled us all session). SH13/SH14 hit 6/6. Fix: bumped `SHOT_REGEN_CAP=12` in .env.local
   (**REVERT to 6 after E12**). Bumping needs a dev restart.
3. **Inngest worker does NOT survive a combined `nohup dev & nohup inngest &`** on Windows (only dev
   survives → `inngest.send()` "fetch failed" 500). Launch inngest in its OWN background command.
4. **gpt-image-2 preamble-attention-pollution** (live again): over-directing ONE element (hard
   repeated "phone screen NOT toward viewer") starved Sandy's anatomy → "руки-ноги отдельно". Fix:
   phone instruction ADVISORY + explicit anatomy counter-directive (hourglass torso + 2 rubber-hose
   arms + 2 legs, all connected). See [[preamble_attention_pollution_gpt_image_2]].
5. **EREF artist hangs ~10 min on the OpenAI image provider** (openai-edits-multi) when throttled —
   starts (agent_started) but no completion, no error. Provider throttle, not our bug.
6. **Polina cost audit was WRONG — corrected in [[polina_cost_audit_CORRECTED_2026-06-26]]** (Director
   asked to save it separately). TL;DR: real auto-react ≈ **0/episode** after fixes (not 465); Opus is
   affordable BECAUSE she barely auto-reacts; passivity = harness (missing factory-drive +
   junior-reader + AI-EP-emergency), not the model.

## Env state (revert after E12)
gemini-free (`CONCIERGE_PROVIDER=gemini`) · `SHOT_REGEN_CAP=12` (revert→6) ·
`CONCIERGE_AUTO_REACT_MAX_CALLS=200` (revert→40). Servers: 3000 dev + 8288 inngest up.

## Next (post-/clear, Director-assigned)
- **Big task: continue Polina — ALL unfinished phases — with the corrected knowledge** = build the
  cascade (factory-auto-advance default + junior-reader model + AI-EP-emergency). Plan:
  `~/.claude/plans/snazzy-tickling-quail.md`. See [[polina_cost_audit_CORRECTED_2026-06-26]].
- Neighbor session (parallel): shot-numbering big refactor → simple `SS-S15-E12-SH##` (drop scene/act
  at storyboard layer — Director directive). See [[shot_identity_refactor_decision]].
- Loose ends: SH05/18/19 shot_plan re-tag; revert env knobs; SH24 video (REVIEW) awaiting approval.
