---
name: episode-serialization
description: SandyStudio project-local skill for the ART-CONT (Continuity Supervisor) agent. Tracks long-arc narrative consistency across the episode — character arcs, plot threads, world-state changes, callbacks, foreshadowing. Use when reviewing scripts/storyboards for continuity, planning episode order, or detecting canon contradictions.
status: DRAFT
applies_when:
  agent: [EXEC-WCHK, EXEC-SREV]
hard: false
---
# Episode Serialization

> Status: **DRAFT** (placeholder — not loaded at runtime) — full implementation in Sprint 5 (per CLAUDE.md §8).
> Canonical owner agent: `ART-CONT` (`agents/artistic/continuity_supervisor.md`).

## Scope

A 26-episode comedy series in the Pink Panther style demands **canonical long-arc tracking**: characters age (or pointedly do not), recurring jokes have setups and payoffs, world rules don't bend per-episode, and motifs accumulate. This skill is the canon guardian for `ART-CONT`.

It complements (does not replace) the per-episode `EXEC-WCHK` (World Checker) which validates a single shot against the world model. `episode-serialization` operates at the **multi-episode** scope.

## Responsibilities

1. **Character arc tracker**
   - For each character, maintain a state ledger: relationships, knowledge state, accumulated traits, running gags.
   - Detect contradictions: «episode 7 says Pink Panther can't swim; episode 12 has him swimming with no setup».

2. **Plot thread ledger**
   - Open threads (setups without payoffs).
   - Closed threads with timestamps.
   - Foreshadowing/callbacks registry — surface unused setups before season finale.

3. **World-state diffs**
   - Episode N vs episode N-1: what about the world has changed (new locations, retired props, time-of-day continuity).
   - Cross-checks against `bibles/world/*.md` LOCKED versions; deltas trigger ART-WB review.

4. **Recurring-element budget**
   - Catchphrases, visual motifs, signature transitions — tracks frequency to prevent over/underuse.

5. **Regression detection**
   - When a script/storyboard is updated, compares its continuity claims against the historical ledger using `ai-regression-testing` patterns.

## Heavy lifting delegated to

- **`knowledge-ops`** (global skill) — episode-state knowledge base; the canonical ledger lives there.
- **`ai-regression-testing`** (global skill) — drives the diff/regression gate when scripts change.
- **`continuous-learning-v2`** (global skill) — accumulates patterns of detected continuity drift over the season.

## Inputs / Outputs (Sprint 5 contract — preview)

```yaml
SerializationRequest:
  action: REGISTER_EPISODE | VALIDATE_DRAFT | OPEN_THREAD | CLOSE_THREAD | AUDIT_SEASON
  episode_id: string                 # e.g. "SS-S01-E07"
  artifact_path: string | null       # script or storyboard under review
  thread_id: string | null
  payload: object | null             # action-specific

SerializationResponse:
  status: OK | DRIFT_DETECTED | CONTRADICTION | NEEDS_DIRECTOR_REVIEW
  drifts: DriftRecord[]              # populated on DRIFT_DETECTED
  open_threads: string[]
  pending_callbacks: string[]
  rationale: string

DriftRecord:
  scope: CHARACTER | PLOT | WORLD | RECURRING
  reference_episode: string
  current_episode: string
  description: string
  severity: LOW | MEDIUM | HIGH
  recommendation: ACCEPT | REVISE_SCRIPT | ESCALATE_DIRECTOR
```

## When to invoke

- A new script (`SS-S0X-E0X-SCR-*-DRAFT.md`) is created — auto-validation against ledger.
- A script transitions `DRAFT → REVIEW` — full audit gate.
- A character profile or world bible bumps version (`v02-DRAFT`) — retroactive consistency scan.
- Director requests a season-level audit before LOCKED transitions.

## When NOT to invoke

- Single-shot validation (use `EXEC-WCHK` + `gan-evaluator`).
- Style/visual consistency (use `ART-AD` + `brand-voice`).
- Per-character appearance consistency at shot level (use `ART-CAST` + `gan-evaluator`).

---

*SandyStudio skill | episode-serialization | STUB v0.1 | Sprint 5 owner: ART-CONT*
