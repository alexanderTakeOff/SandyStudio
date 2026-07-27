---
name: backlog_next_run_polina_gemini_free
description: "Polина concierge model — ACTIVE 2026-06-25: gemini-free + auto-react HARNESS shipped after $100→429 loop burn. Plan: raise model once E12 validates. Prior: Opus trial, gpt-5.4-mini, gemini stress-test."
metadata:
  node_type: memory
  type: project
  originSessionId: dac17679-229b-4b22-9353-451b864af467
---

### ACTIVE 2026-06-25 — gemini-free + the auto-react HARNESS (supersedes Opus trial below)
**Why the switch:** gpt-5.5 hit OpenAI `429 exceeded quota`. Forensics (budget_log):
the autonomous **auto-react LOOP** burned **2.4M tokens / 79 gpt calls in ~2h, 100%
`auto_react`, $0 Director chat** — the conversation was never the cost. Root: per-event
expensive wake + a $-only, provider-mispriced fence that never tripped.

**Shipped (master `0095c54` + header `9f623ac`) — the harness, not a barrier:**
- **Master kill-switch** `CONCIERGE_AUTO_REACT_ENABLED` (default true) — false fully
  disarms the autonomous loop; Director chat is NEVER gated. Visible in the header.
- **Provider-INDEPENDENT fence** — `isConciergeBudgetTripped` trips on call-COUNT
  (`CONCIERGE_AUTO_REACT_MAX_CALLS`) OR $; count limb protects gemini/openai/anthropic
  identically (the old Sonnet-mispriced $-limb never fired for gpt). Honest `reason`.
- **Honest header** — `GET /api/concierge/chat` returns live `{provider,model,label,autoReact}`;
  panel shows real model (`GEMINI · GEMINI-2.5-FLASH`) + `auto on/off` pill (no stale
  EXEC-CONC/Mode label).
- **Real leak fixed** — `agent_started` REMOVED from the wake-set in
  `lib/api/event-actionable.ts` (~40% of wakes, zero benefit: chain advances mechanically,
  `agent_completed`/`agent_failed` carry the signal). Still ambient context → Polина stays
  aware unpaid. (Explore-agent's "26 direct-insert routes" theory was WRONG — notify lives
  in `logEvent`, not a PG trigger; did NOT churn those files.)
- **Current env:** `CONCIERGE_PROVIDER=gemini` (gemini-2.5-flash, $0). Director bumped
  `CONCIERGE_AUTO_REACT_MAX_CALLS` 40→**200** to let E12 finish autonomously (free → cap is
  just a runaway backstop). **Revert to 40 after E12.**
- **Live signal:** 16 `agent_started` → **0 wakes**; ~3–4 auto-react/hr vs 35/hr on OpenAI.

**Plan / next:** watch E12 on free today; **if stable, RAISE Polина's model** back to a
paid tier — now SAFE because the count-fence caps volume regardless of price + agent_started
trim cut wakes + kill-switch. Architecture target (plan `~/.claude/plans/snazzy-tickling-quail.md`):
cascade **factory→free→gpt→human**; Phase 1 (fence+flag+trim) DONE, Phase 2 (free as default
worker, gpt bounded escalation, hard gates straight to human) PENDING. gemini free-tier
ceiling: 1M context (our 30k fits), but **250 RPD / 10 RPM / 250k TPM** — volume control is
mandatory even free.

### ACTIVE 2026-06-24 — TRIAL: Opus 4.8 for Polина (SUPERSEDED 2026-06-25 by gemini-free above)
Director: gpt-5.5 ok, last-used `gpt-5.4-mini` «killed all my nerves» → try **Opus 4.8**
for Polина (judge cost vs saved time/nerves). **Wired** (commits `dfc3737` + `cc3c01b`):
- New concierge provider `anthropic` in `webapp/lib/concierge/llm.ts` — routes Polина
  through **Anthropic's OpenAI-compat endpoint** `https://api.anthropic.com/v1/` with the
  SAME OpenAI SDK + tool-loop (no native-SDK rewrite). `ANTHROPIC_API_KEY` already in env.
- **Activate:** `CONCIERGE_PROVIDER=anthropic` (+ optional `CONCIERGE_ANTHROPIC_MODEL`,
  default `claude-opus-4-8`) in `webapp/.env.local`. SET this session. Tokens use
  `max_tokens` like gemini; `isGpt5` false → temperature path.
- **GOTCHA (live-smoked):** Opus 4.x **rejects `temperature`** («deprecated for this model»
  → 400). `conciergeSupportsTemperature()` returns false for anthropic and all 3 routes
  (chat/chat-internal/auto-react) gate the temperature send on it. Without that → 400 on
  every Polина turn. Function-calling through the compat layer works (smoke: clean tool_call).
- To revert: unset `CONCIERGE_PROVIDER` (→ OpenAI `OPENAI_MODEL`) or set `=gemini`.

**Director decision 2026-06-21 (after E11 ref run) — two tracks, «не в крайности».**

### Track A — DEFAULT next run: `gpt-5.4-mini` (the middle)
Put **Polина (EXEC-CONC / concierge) on `gpt-5.4-mini`** as the working default.
Director reviewed the model page (developers.openai.com/api/docs/models/gpt-5.4-mini):
- Full **tool/function-calling + structured outputs** — exactly what gemini-free
  broke (dropped tool args, went passive). Built for subagents/agentic workflows.
- 400k context, 128k output, reasoning.
- **~70% cheaper than full gpt-5.4/5.5**: $0.75 in / $4.50 out / $0.075 cached per
  1M. Polина's chat turns are light → near-free yet reliable.
- Avoids BOTH extremes: gemini-free fragility AND gpt-5.5 cost.
- **Apply:** set `OPENAI_MODEL=gpt-5.4-mini` in `webapp/.env.local` (next dev
  hot-reloads env; no restart). Keep concierge on OpenAI (do NOT set
  `CONCIERGE_PROVIDER=gemini` for the default run).
- **Billing note:** same OpenAI account/limit — but the budget hog is IMAGE gen
  (gpt-image-2), not concierge text. The hard limit must be raised for images
  regardless; mini just makes concierge spend negligible.

### Track B — SEPARATE, on purpose: gemini-free as a harness stress-test
Keep gemini-free as a DELIBERATE probe, NOT the default. Principle (Director):
«на умных моделях любой вытянет» — a capable model MASKS harness weaknesses; a
WEAK/free model REVEALS them. Run `CONCIERGE_PROVIDER=gemini`
(`CONCIERGE_GEMINI_MODEL=gemini-2.5-flash`) only when the goal is specifically to
stress-test process/prompt/pipeline robustness. Known weak-model failure modes to
hunt: passive (won't approve after PASS — Тео had to auto-approve all of this
session), dropped tool args, phantom diagnoses. Each is a harness gap to fix so
even a weak model can drive.

**Designer/creators tier is SEPARATE** (`TEXT_LLM_DEBUG_TIER`): this session proved
free-gemini Designer copies template scaffolding into prompts (the canon-fix saga).
Keep Designer on Claude unless deliberately stress-testing it too.

Related: [[nudge_polina_dont_act_for_her]], [[backlog_td_polina_nudge_readonly_execution_gap]], [[concierge_uses_openai]].
