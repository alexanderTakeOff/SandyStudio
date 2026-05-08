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
- No long-term per-Director memory in v1. Future: `concierge_threads` table.

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

## 6. Sprint 9 scope

Chat-skeleton only:
- ✅ Streaming chat with Claude API
- ✅ System prompt with read-only context (PLAN.md summary, current mode, today's date)
- ✅ Voice input via Web Speech API (free, native)
- ❌ Tool-calling (deferred to Sprint 10)
- ❌ Action dispatch to Inngest (deferred to Sprint 10)
- ❌ Long-term memory

---

## 7. ECC skill mapping

| Capability      | ECC skill / tool         | Notes |
|-----------------|--------------------------|-------|
| Conversation    | (direct Anthropic API)   | no skill — bare Sonnet 4.6 / Haiku 4.5 |
| Cost routing    | `cost-aware-llm-pipeline` | applied via BOARD-FIN policy |
| Voice           | Web Speech API → text    | browser native; Whisper if quality demands |

---

## 8. Naming convention impact

Concierge does not produce file outputs in v1. No `SS-...-CONC-*` files are emitted.

When the Concierge dispatches a job that produces a file, the producing EXEC agent owns the naming and writes the file under its own ID.

---

*EXEC-CONC concierge.md | v0.1 | DRAFT*
