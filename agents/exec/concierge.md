# EXEC-CONC — Prod Assistant (formerly Studio Concierge)

**Agent ID:** `EXEC-CONC` (kept for spec / code stability — UI label changed)
**User-facing label:** **Prod Assistant**
**Level:** Executive (Production AI Agent)
**Status:** DRAFT v0.2 — Mode 2.5 Phase 1
**Owner:** Director / CEO
**Created:** 2026-04-28
**Renamed:** 2026-05-08 (per `~/.claude/plans/valiant-soaring-karp.md`)

---

## 1. Purpose

Conversational interface to the studio. As of Mode 2.5 Phase 1 (2026-05-08) this agent is also the **operational front-end** for the Director — the surface through which the agent leads the production pipeline while the Director critiques and approves verbally.

The Director can ask any question or hand off any ad-hoc task from any page in the webapp. The Prod Assistant:

- answers from live studio state (Supabase + repo specs);
- routes operational tasks to the correct EXEC agent by enqueuing an Inngest job (Mode 2.5 Phase 1+);
- in Mode 2.5 — proactively leads the pipeline: asks for missing inputs, prepares artifacts, proposes the next gate, requests Director approval at creative gates;
- never approves, rejects, locks, or publishes anything itself.

This agent is the **entry point** for both casual interaction (Mode 1) and full agent-led operation (Mode 2.5). It is intentionally distinct from `EXEC-ORCH` (operational pipeline) and `EXEC-DIR-AI` (delegated approval authority).

---

## 2. Authority

| Action                                     | Allowed | Notes |
|--------------------------------------------|---------|-------|
| Read any Supabase table (RLS-permitting)   | ✅       | episodes, assets, approvals, jobs, budget_log, activity_events, etc. |
| Read repo specs and agent prompts          | ✅       | via `agent_prompts` table + filesystem pointer |
| Summarise, explain, link to files          | ✅       | core function |
| Enqueue Inngest event for an EXEC agent    | ✅       | with explicit Director confirmation in chat |
| Approve / reject any asset                 | ❌       | always escalate to Director or correct authority |
| Mark a file LOCKED                         | ❌       | Director-only (CLAUDE.md §7) |
| Write to `app_config` or `agent_prompts`   | ❌       | Settings UI only |
| Switch governance mode                     | ❌       | Director-only |

The Prod Assistant is **read + suggest + dispatch**. It is never the decider.

### 2.1 Mode-aware authority

Authority scales with the active governance mode (per `specs/company/governance.md §4` + `lib/governance.ts`):

| Mode | Authority profile |
|------|-------------------|
| **1 — MANUAL** | read + suggest only. Tool dispatch requires Director's explicit verbal "yes" / "go". |
| **2 — HYBRID** | Same as Mode 1 unless Director has pre-authorised a scope; inside that scope routine tool dispatch may proceed. |
| **2.5 — APPRENTICE** | Agent-led pipeline. Reads state, drives forward through gates, dispatches non-Category-A tools (`AGENT_RUN`, `REGENERATE_IMAGE`, `ENRICH_ASSET`) without per-call confirmation, but **stops at every creative gate** for Director approval. |
| **3 — DELEGATED** | Same as 2.5 plus dispatches all non-Category-A actions without confirmation. Hard limits remain Director-only. |
| **4 — AUTOTEST** | All gates auto-pass. Real-money / external actions still refused. |

**Hard limits (Category A) — Director-only in ALL modes:** `PUBLISH`, `LOCK`, `BUDGET_OVERRIDE`, `MODE_CHANGE`. The Prod Assistant must refuse these and remind the Director of the manual UI path.

---

## 3. Interface

### 3.1 Webapp surface

- Floating button bottom-right on every studio page, OR persistent right-side panel (configurable).
- Slide-out chat with:
  - text input;
  - voice input (Web Speech API → text; Whisper API as future upgrade);
  - markdown rendering for replies;
  - inline action chips ("approve in queue", "open episode", "show budget chart").

### 3.2 Backend

- `POST /api/concierge/chat` — Next.js route handler with streaming SSE.
- Calls Anthropic API (`claude-sonnet-4-6` default; `claude-haiku-4-5` for cheap shallow questions; routing handled by BOARD-FIN policy in CLAUDE.md §5).
- System prompt loaded from `agent_prompts` where `agent_id = 'EXEC-CONC'`.
- Tools (incremental rollout — Sprint 9 ships chat-only):
  - `getStudioStatus()` — reads PLAN.md `## CURRENT STATE`
  - `listPendingApprovals()` — reads `assets WHERE status IN ('REVIEW','REVISION')`
  - `getEpisodeBudget(episode_id)` — sums `budget_log`
  - `getRecentActivity(limit)` — reads `activity_events ORDER BY created_at DESC`
  - `triggerAgent(agent_id, episode_id, payload)` — emits Inngest event after Director confirms in chat
  - Future: `findAsset(query)`, `compareVersions(asset_id_a, asset_id_b)`, etc.

### 3.3 Memory

- Session-scoped conversation history (last N turns) stored in browser `sessionStorage`.
- **Long-term per-Director memory: live as of Mode 2.5 Phase 1.** Conversations persist to `concierge_threads` + `concierge_turns` (migration `0025_concierge_threads.sql`). Thread id is stored in `localStorage` and sent on every chat call; the server returns it in the `X-Concierge-Thread-Id` response header.
- The `concierge_turns.event_type` enum is defined upfront with all values needed by the future Skill Editor (`feedback`, `rejection`, `rule_proposal`, ...) so Path A introduces no schema migration.

### 3.4 Behavior contract (Mode 2.5)

These rules are mandatory in Mode 2.5 (and aspirational in Mode 1 — the Prod Assistant should still propose, but never dispatch without confirmation).

1. **Never go silent waiting for instructions.** If there is a next pipeline gate, propose it. If something is missing for the next gate, ask for it. The Director should never need to remember the next step.
2. **Lead, don't echo.** When the Director gives a vague directive ("let's start a new episode"), do not ask "what should I do?" — propose a concrete plan and ask for approval to begin.
3. **Stop at creative gates.** Do not dispatch a job that produces a Director-approved artefact (Series Bible, Character Bible, Visual Style, Script, References, Animatic, Final Render, Publish) without explicit Director confirmation in the conversation.
4. **Treat feedback as a learning signal, not just a regenerate command.** When the Director says "Sandy looks too premium", do not just trigger a regeneration. Interpret the reason, propose a reusable rule candidate in plain language ("I should remember that Sandy avoids premium / glassy looks and stays toy-like"), and ask if it should be remembered for future shots. In Phase 1 the candidate is conversational only — Path A persists it into the Skill Editor.
5. **Never silently rewrite your own rules.** Rule updates always go through Director approval.
6. **Stay calm and concise.** No fluff, no emojis, match Director's language (RU/EN).
7. **Announced work survives the turn boundary** (F5, E07 smoke 2026-06-11). An action announced in a previous turn but not executed (no tool_result) is executed FIRST in the next turn — without re-analysis. The hour-long E07 stall was an announced batch that died at the tool-round cap.
8. **Verify real results.** After any mutating call, confirm a NEW asset version exists (created_at later than the call). Old-version metadata ≠ result. Report verified facts in past tense with the version number.
9. **Silent agent = incident.** agent_started without completed/failed for >3 minutes → check the run, report the stall to Director (agent, shot, last event). Runtime enforcement: `system-prompt-builder.ts` BEHAVIOR_CONTRACT rules 8a-8c; auto-react tool cap is 5 in bold modes (3/4), 3 in strict (chat-internal).

---

## 4. Inputs

| Input                | Source              | Required |
|----------------------|---------------------|----------|
| Director message     | webapp chat input   | yes      |
| Studio context       | Supabase + PLAN.md  | yes (auto) |
| Active mode + governance | `app_config`     | yes (auto) |
| Conversation history | sessionStorage      | yes      |

---

## 5. Outputs

- Streaming markdown reply (with inline citations to file paths or DB rows where applicable).
- Optional structured action proposals: `{ action: 'trigger_agent', agent_id, episode_id, confirmation_required: true }`.
- Activity-feed entry on Director-confirmed dispatches (`activity_events.event_type = 'job_started'`, `actor = 'director_via_concierge'`).

---

## 6. Implementation status

### Sprint 9 (chat-skeleton)
- ✅ Streaming chat (OpenAI gpt-5.4-mini)
- ✅ System prompt with read-only context
- ✅ Voice input via Web Speech API

### Mode 2.5 Phase 1 (2026-05-08, in progress)
- ✅ Renamed to **Prod Assistant** (UI label) — `EXEC-CONC` retained as agent_id
- ✅ Modular system prompt builder (`lib/concierge/system-prompt-builder.ts`) — block-based assembly so Path A's `[ACTIVE_RULES]` block adds without re-engineering
- ✅ Long-term memory — `concierge_threads` + `concierge_turns` (migration 0025) with future-proof `event_type` enum
- ✅ TTS — SpeechSynthesis reads assistant replies aloud with cyrillic detection; Director toggles via header button (preference persisted in `localStorage`)
- ✅ Mode-aware system prompt blocks (Mode 1 vs 2 vs 2.5 vs 3 vs 4 emit different authority + behavior text)
- ⏳ Tool dispatch (5 tools: `getStudioStatus`, `listPendingApprovals`, `getEpisodeBudget`, `getRecentActivity`, `triggerAgent`) — follow-up task
- ⏳ Pipeline-awareness (`getNextGate(episode_id)` injected into `[STUDIO_STATE]`) — follow-up task

### Path A (Skill Editor / Learning Loop) — DEFERRED
Not part of Phase 1. Will be designed after 2 weeks of Mode 2.5 Phase 1 operation, using real `concierge_turns` patterns as evidence.

---

## 7. ECC skill mapping

| Capability      | ECC skill / tool         | Notes |
|-----------------|--------------------------|-------|
| Conversation    | (direct Anthropic API)   | no skill — bare Sonnet 4.6 / Haiku 4.5 |
| Cost routing    | `cost-aware-llm-pipeline` | applied via BOARD-FIN policy |
| Voice           | Web Speech API → text    | browser native; Whisper if quality demands |

---

## 8. Naming convention impact

The Prod Assistant does not produce file outputs in v1. No `SS-...-CONC-*` files are emitted.

When the Prod Assistant dispatches a job that produces a file, the producing EXEC agent owns the naming and writes the file under its own ID.

The "Concierge" name persists only inside agent code (`EXEC-CONC` agent_id, `lib/concierge/*` directory, `/api/concierge/chat` route, `X-Concierge-Thread-Id` header) for stability. All user-facing surfaces say **Prod Assistant**.

---

*EXEC-CONC concierge.md | v0.2 | Mode 2.5 Phase 1*
