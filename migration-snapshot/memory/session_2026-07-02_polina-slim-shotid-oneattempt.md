---
name: session_2026-07-02_polina-slim-shotid-oneattempt
description: "Session 2026-07-02 PM — Polina prompt de-accretion + E13 shot-id unblock + false pickup_timeout fix + #5 one-attempt critics. Open: reference-drawer bug cluster (q1a)."
metadata: 
  node_type: memory
  type: project
  originSessionId: 2bf21679-e377-4301-b1e4-7da4f5b89c20
---

# Session 2026-07-02 PM — 4 ships + open reference-drawer cluster

Branch `claude/e13-nudge-badge-casting-fixes`. Full resume detail in
`~/.claude/session-data/2026-07-02-pm-polina-slim-shotid-oneattempt-session.tmp`.

**Landed (tsc0/vitest1089/replay30 each):**
- `bab7a7f` de-accrete Polina prompt (scar-museum → positive one-liners, −14.4k chars, one prompt).
- `b8eb6b8` E13 shot-id unblock — root cause was STALE TOOL-SCHEMA EXAMPLES teaching the old compound
  format (not legacy data); `resolveShotId` now extracts canonical from any compound + Polina
  "missing-precondition=a step not a question" rule. WORKED live.
- `30b0143` liveness-aware pickup ack — kills false `pickup_timeout` (jobs row = run-start not enqueue;
  10s < batch queue wait; alive→advisory, dead→real alarm).
- `e0c5e3f` #5 one-attempt — CREAD (taste) fully advisory; canon critics (EPREV/VPREV/WCHK) still block.

**Key diagnoses:** Polina cost = tier×prompt×volume (free=$0); when Director drives, HE is the brain →
routing job doesn't need a frontier model; the real API $ is IMAGE+VIDEO providers ($83/$118), NOT
Anthropic; EXEC-CONC $17.8 is phantom (cost.ts misprices non-Anthropic). auto-react/route.ts is DEAD CODE.

**OPEN (next session, ===5===, q1a decided):** reference-drawer bug cluster on SH15 (auto-APPROVED ref):
(1) select_attempt APPENDS a duplicate gen_history entry → fix to select-in-place; (2) Reject no-op on
APPROVED (FSM: APPROVED↛REJECTED) → **q1a: route Reject-on-APPROVED to REVISION**; (3) Approve→"already
approved" → status-aware footer. Bundle with [[backlog_kebab_video_reference_zones]] (same surface).
Related: [[shot_identity_refactor_decision]], [[backlog_next_run_polina_gemini_free]], [[critic_revision_cap_doctrine]].
