# EXEC-CONC — Studio Concierge

**Agent ID:** `EXEC-CONC`
**Level:** Executive (Production AI Agent)
**Status:** DRAFT v0.1
**Owner:** Director / CEO
**Created:** 2026-04-28

---

## 1. Purpose

Conversational interface to the studio.

The Director can ask any question or hand off any ad-hoc task from any page in the webapp. The Concierge:

- answers from live studio state (Supabase + repo specs);
- routes operational tasks to the correct EXEC agent by enqueuing an Inngest job;
- never approves, rejects, or writes creative content directly.

This agent is the **entry point** for casual, fast interaction. It is intentionally distinct from `EXEC-ORCH` (operational pipeline) and `EXEC-DIR-AI` (delegated approval authority).

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

The Concierge is **read + suggest + dispatch**. It is never the decider.

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
