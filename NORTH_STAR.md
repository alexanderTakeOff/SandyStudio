# SandyStudio — NORTH_STAR.md
## The Star | v0 DRAFT — Director to red-pen

> The Star. WHAT we are building and the SHAPE of the machine. Stable — changes
> only when the ambition or the architecture genuinely shifts, not per session.
> Read every session, right after CLAUDE.md. The Compass (rules/common/partnership.md)
> re-anchors here. **Master-only**, like PLAN.md.
> Near-term journey → `PLANET.md`. Day-to-day operations/backlog → `PLAN.md`.

---

## 1. The vision (where the Star is)

**An AI movie factory.** A Director-gated, multi-agent pipeline that turns a one-line
idea into a finished, published animated episode with as few human keystrokes as
possible. The human sets creative direction and approves the gates; the machine does
the production between gates — reliably, cheaply, and autonomously.

- **First product:** *Silent Sandy* — a wordless 2D cartoon-comedy series (Pink-Panther
  lineage). Protagonist Sandy is an hourglass whose time literally drains; no dialogue,
  no language barrier, weekly episodes.
- **Why wordless / why a series:** removes the localization wall (global from day one)
  and proves the factory on a repeatable format before widening.
- **The ambition beyond Sandy:** the same machine should generalize — more series, more
  genres, eventually longer films — without rebuilding the pipeline each time. Sandy is
  the proving ground, not the ceiling.
- **The end-state we are steering to:** the Director runs a 10–20 episode season where
  each episode flows brief → published with the Director only approving creative gates,
  not babysitting mechanics; cost per episode is known and bounded; quality is high
  enough to ship publicly.

> v0 ASSUMPTION to confirm: ambition = "a factory for many animated series/films, Sandy
> first" (not "just finish Sandy"). Redirect if the real horizon is narrower/wider.

---

## 2. The architecture (the shape of the machine)

Four planes. This is the TARGET shape — most of it exists today; gaps are tracked in
`PLANET.md`/`PLAN.md`, not here.

### A. The creative pipeline (the production DAG)
One idea walks down a fixed assembly line, each station an agent, each handoff a
Director-approvable artifact:

```
Brief → Script (SW) → Script-review (SREV) → Storyboard (SB) → Readability (CREAD)
      → World-check (WCHK) → Reference Designer (EREF-DESIGNER) → Critic (EPREV)
      → Reference render (EREF) → Music (MGEN) → Animatic (EDIT)
      → Animator (VANIM) → Critic (VPREV) → Video render (VGEN) → Final Cut (STITCH)
      → Distribution: Copy (COPY) · Thumbnail (THUMB-DESIGNER→THUMB) · Publish (PUB) · Analytics (ANAL)
```
Each shot has a stable identity `S{season}-E{episode}-SH{n}`. Producer agents author a
plan; Critic agents gate it; the Director (or EXEC-DIR-AI by delegation) approves.

### B. The control plane (how it actually runs)
- **Webapp** (Next.js) — the studio cockpit: pipeline view, approval queue, asset drawers.
- **Inngest** — event-driven execution: every agent step is an event + function.
- **Supabase** — system of record: assets, statuses, budget ledger, governance state.
- **Drive** — heavy media (raw + approved video/images/audio), 3-tier storage.
- **Prod Assistant "Polина" (EXEC-CONC)** — conversational orchestrator the Director
  talks to; dispatches tools, gates on verbal approval, learns.

### C. The governance (who is allowed to do what)
- **4 governance modes** (Manual 1 → Hybrid 2 → Delegated 3 → Autotest 4) setting how
  much the machine may approve on its own. (Apprentice 2.5 was a transitional bridge,
  not a separate mode.) Exact ladder → CLAUDE.md §6 / the architecture analysis.
- **Hard limits, Director-only in every mode:** Publish · LOCKED · Budget · Mode changes.
- **Nothing ships without a named file; every file has an explicit status.** Happy path
  DRAFT→REVIEW→APPROVED→LOCKED, but the Director can set status directly, and an APPROVED
  asset can return to DRAFT/REVISION or be INVALIDATED (single-approved gate).
  *(Exact lifecycle — incl. invalidation — under discussion.)*

### D. The foundations (what keeps it from rotting)
- **Bible canon** (LOCKED world/character/style) — the single source every render anchors to.
- **Contracts & gates** — schema contracts per agent I/O; gate-hardening invariants
  (single-approved, provider contracts, critic revision caps, readiness preflight).
- **Skills** — process skills (how) vs tool skills (per provider/version), kept abstract.
- **Cost control** — pre-spend budget ceiling + per-day circuit breaker; model routing by task.

---

## 3. The operating doctrine (how Director + Тео work)

- **Partnership over execution** (rules/common/partnership.md). The Director's message is
  a hypothesis, not an order; Тео re-anchors to this Star every turn, flags drift, pushes back.
- **Anti-additivity** — reuse / subtract before adding; the fewer new things, the fewer bugs.
- **Process & people first** — ask "which ROLE should catch this?" before patching code.
- **Тео = orchestrator + partner**, not a yes-man. Stopping drift is the job.

---

## 4. The autonomy + cost architecture (being synthesized — keep anchored here)

The factory-without-a-human AT reasonable cost is converging on ONE design — a **tiered
cascade**. These analyses keep getting lost between sessions; pinned here so they don't:

- `memory/ai_ep_conception_gaps.md` — 12 gaps from running the EP role by hand (E11 + the
  "don't build a 2nd LLM; head = orchestrator through one door; Polина = hands" decision).
- `memory/polina_cost_audit_CORRECTED_2026-06-26.md` — corrected cost model: Opus is
  affordable BECAUSE auto-react ≈ 0; **passivity = harness, not model**.
- `memory/backlog_next_run_polina_gemini_free.md` — the shipped cost harness (kill-switch,
  count-fence, agent_started trim) + the cascade target.
- Plan: `~/.claude/plans/snazzy-tickling-quail.md` — cascade factory→free→gpt→human (Phase 2 pending).

**The direction (synthesis):** finish the cascade so each event is handled by the CHEAPEST
sufficient tier and expensive intelligence fires rarely —
1. **Factory chain** (deterministic code, $0) = the DEFAULT mover on critic-PASS (today only Mode 4).
2. **Cheap junior/nudger layer** reads each result + verdict + event → decides *advance / surface
   to Director / escalate*. A cheap event-FILTER, not a second brain (anti-additivity).
3. **Expensive head** (Opus) fires only on emergency (HALT / conflict / repeated-fail / hard creative call).
4. **Human** holds hard limits + creative sign-off.
Plus anti-waste gates: dup-gen detector, regen "decide-later" as a first-class state, waste
observability, input trimming. **The E13 smoke is the discovery vehicle** for exactly where the
human still nudges and where tokens are wasted — those points are the spec for layers 2 + the gates.

---

*SandyStudio NORTH_STAR.md | v0 DRAFT — built with the Director. Keep it short.*
