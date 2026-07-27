---
name: session_2026-07-20_layer0-star-planet
description: "Session that restored the ECC layer, audited context cost, killed flaky registry tests, and built Layer 0 — the ratified Star + current Planet, wired into the session-start ritual so they can't die again."
metadata: 
  node_type: memory
  type: project
  originSessionId: d9f9ab23-c24e-4e41-87a8-955d92277735
  modified: 2026-07-20T05:24:54.873Z
---

**Session 2026-07-20 (continues 2026-07-19 ECC restore).** Four things landed.

## 1. ECC layer restored (see [[ecc-global-layer-missing-on-laptop]])
`~/.claude/` was lost in the laptop move; restored from desktop. Then AUDITED via
`agent-sort`: 92 items moved to `~/.claude/*-library/` (reversible `Move-Item`), start
budget 16 800 → 12 556 tok. Key correction: session-data/memory BODIES cost 0 passive
tokens — only descriptions load. Video/animation/promotion skills kept DAILY per Director.

## 2. Flaky tests fixed — commit `2a55c1b7`
Director feared tests "shrank from 1000+ to a hundred." False: 1415 cases in 129 FILES —
he was reading vitest's file-count line, not the case line. Real bug found: 4 PA-tool test
files loaded the 287 KB tool-barrel via `await import()` INSIDE the 5s testTimeout → failed
under worker contention → read as intermittent regression. Hoisted to static import
(subtractive, no timeout inflation). Verify: tsc clean, 1415/1415, replay 30/30.

## 3. Layer 0 built & wired — commit `99ea6d11` (THE session's core)
Diagnosis: the strategy layer had died. `NORTH_STAR.md` + `PLANET.md` were written
2026-06-27 in ONE commit and never touched — because §9 read `CLAUDE.md → PLAN.md →
glossary` and never opened them. Star migrated into PLAN.md's header, copies diverged
(PLANET said E13, reality E30), PLAN.md swelled to 657 lines. **Discipline decayed in 22
days; the fix is mechanism.**

- **`NORTH_STAR.md` v1 RATIFIED** (~65 lines / one screen — I earlier claimed ≤50, that was
  wrong; a faulty `Measure-Object -Line` read 48 and I dismissed the audit's correct 65),
  master-only, edit only shown-whole): one goal
  = autonomous film factory, human = creative at series/episode concept + training employees
  for genres; 9 planets (Autonomy, Reliability, Quality, Creativity, Cost, Distribution,
  Measurement/feedback-sensor, Self-learning, far: Scalability). Multi-genre CONFIRMED.
- **`PLANET.md`** — current planet = **Autonomy**. Why first: reliability/quality are
  UNMEASURABLE while hand-fixing masks true behavior. Criterion = the NATURE of a Director
  touch, NOT the count: ~10-12 planned creative gates OK (brief, script-read, casting/new
  heroes, 2 video pilots, final→publish, …); metric = **ZERO unplanned bug-fixing touches**.
  Terrain now = VIDEO (E30 refs autonomous, video is a mess; Director hypothesis: video-gen
  should ≈ ref-gen minus regen-cap — PARKED, not chased). Old "First Proof Episode/public"
  = NEXT planet, named as the drift it was.
- **`CLAUDE.md §9`** now reads NORTH_STAR → PLANET → PLAN → glossary. **§12 Ritual 2** PROSE
  extended to PLANET — but see §5: the initial commit changed only prose, not the hook code.

**Three-layer model (Director's framing):** Layer 0 = mechanism that decides what to build +
holds the line ← was broken, being rebuilt. Layer 1 = the factory. Layer 2 = the product
(Sandy). Anti-drift doctrine: name the planet BEFORE work; park shiny tangents; force one
conscious choice to leave the line; the partner makes drift visible, judgment decides worth.

## 4. Open / next
- **RESTART is the test:** fresh session must re-anchor from files (Star→Planet→PLAN) with
  zero reliance on this conversation. If it can't, Layer 0 failed.
- **Cosmetic, deferred (not survival):** (a) remove the duplicate NORTH-STAR block from
  PLAN.md header — the divergence source; (b) trim PLAN.md 657 → ≤200, history →
  `docs/PLAN-history.md`; (c) split MEMORY.md — backlog out, index stays.
- **On the Autonomy planet, parked:** why video-gen ≠ ref-gen (the "mess"). First crater
  when we return to Layer 1.
- Nothing pushed to origin. Hooks (COMPASS/anti-additivity) + Codex plugin activate ON RESTART.

## 5. Fresh-eyes audit + honest corrections (same session)

Ran an independent fresh-eyes auditor on the Layer-0 work. Verdict **FLAWED** — and it was
substantially right. I verified every claim (held the auditor to the same skepticism):

- **F2 (real, mine):** commit `99ea6d11` bragged "mechanism not discipline," but the actual
  staleness hook `plan-md-staleness-check.cjs` read ONLY PLAN.md — I'd changed Ritual 2 PROSE,
  not the hook CODE. So the exact thing that drifted (PLANET) stayed unguarded. **FIXED this
  turn:** hook parameterized to check PLAN.md + PLANET.md (header `выбрана YYYY-MM-DD` regex),
  BOM-tolerant, per-file silent-pass. Verified: stale PLANET → WARN+exit1 (with/without BOM),
  fresh → exit0, PLAN path intact. This is what makes "mechanism" true; "can't die again" was
  an overclaim — real enforcement now = the F2 hook + §9 prose + a DORMANT COMPASS reminder
  string (lives in user `~/.claude/settings.json`, doesn't read the Star, wakes on restart).
- **F1 (auditor half-wrong):** it said the COMPASS hook is fabricated — actually it EXISTS in
  user settings (auditor only checked project `.claude/`). But its substance stands: reminder
  string, not enforcement.
- **F3 (auditor right, I was wrong):** NORTH_STAR is ~65 lines, not ≤50. My `Measure-Object`
  read 48 and I wrongly dismissed the finding. Claim corrected; file kept as ratified.
- **F5 (real):** PLANET's "Mode 3" label contradicted its own gate list. Resolved via the
  Director's mode ruling below.

**Director mode ruling 2026-07-20:** live modes = **1/2/3**; **Mode 2.5/APPRENTICE** and
**Mode 4/AUTOTEST** DEPRECATED (Mode 4 runtime already retired Phase 1); **Mode 9** = absolute
autonomy (Director only themes/publication/finance; critics handle brief/casting/script;
needs the **Responsibility Distribution Matrix**) = horizon, NOT in code/DB. Recon confirmed
2.5 is LIVE in code (`webapp/lib/concierge/types.ts:33` ConciergeMode union + 2 switch arms in
`system-prompt-builder.ts` + DB CHECK constraints `0002:32`, `0025:31`) — so removal is a
code+DB **migration, parked** (do ONCE with the Mode 9 / Matrix redesign, not twice). Do-now
was **anchor-honesty only:** NORTH_STAR mode line → 1/2/3 + Mode 9 horizon; PLANET drops the
false mode label; `CLAUDE.md §6` gets a ruling banner + rows 2.5/4 marked DEPRECATED + a
Mode 9 horizon row. No code/DB touched.

**Meta-lesson:** the anti-drift mechanism caught ME overclaiming in the very commit that
bragged about mechanism — AND the auditor itself needed verifying (wrong on F1/F3). Verify
both directions. [[reconciler_audit_2026-07-10]]
