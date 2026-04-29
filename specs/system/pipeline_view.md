# SandyStudio — Episode Pipeline View
## specs/system/pipeline_view.md | v0.1 | DRAFT

> **Status:** Phase 5a UX architecture spec. Implementation: Phase 5c.

---

## 0. Purpose

The Pipeline View is the per-episode mission-control screen. It answers:

- What stage is this episode at?
- Which agents are running, finished, blocked, failed?
- What did each agent do, and what did it hand to the next agent?
- Where do I (the Director) need to step in?

It is the visual answer to the Director's questions Q2 + Q3 + Q5 from
2026-04-29: a single screen where the entire production state of one
episode is legible at a glance, with the depth of an agent-chat available
when needed.

The pattern is a **DAG + Activity Feed hybrid**: a left-side production
graph (Temporal UI / Airflow / dbt) and a right-side agent-report stream
(GitHub PR conversation / Sentry issue activity / Cursor agent log).

---

## 1. Routing

Reachable at `/episodes/[id]` (replacing the current placeholder).
Dashboard Zone 2 timelines link here. The Sidebar `Episodes` nav lands on
the most recently active episode.

---

## 2. Layout

```
┌─────────────────────────────────────────────────────────────┐
│ ◀ Series · SS-S01-E01 "The Red Carpet"                       │
│ Status: GENERATION_IN_PROGRESS · Mode 1 MANUAL · $4.20/$25   │
├─────────────┬───────────────────────────────────────────────┤
│ PIPELINE    │ AGENT REPORT FEED                              │
│ (40%)       │ (60%)                                          │
│             │                                                │
│ Brief       │ ⚙ EXEC-VGEN · just now                         │
│  ●          │   Generated shot_04 (1024×1024). Cost $0.34.   │
│  │          │   Style: per bible. Runtime 4m12s.             │
│  ▼          │   → EXEC-EDIT (queued)                         │
│ Story       │   [▶ preview]   [📄 prompt]                    │
│  ●          │                                                │
│  │          │ ───────────────────────────                    │
│  ▼          │ ✓ EXEC-SREV · 2m ago                           │
│ Script      │   Script v01 PASS. 3 minor notes:              │
│  ●          │   • lengthy stage direction in act 2           │
│  │          │   • timing 02.18 vs storyboard 02.20           │
│  ▼          │   • redundant "Sandy nods"                     │
│ Storyboard  │   → EXEC-SB (started)                          │
│  ●          │   [📄 review notes]                             │
│  │          │                                                │
│  ▼          │ ───────────────────────────                    │
│ World Check │ ✓ EXEC-SW · 5m ago                             │
│  ●          │   Wrote 3-act script. 240 lines. 60s runtime.  │
│  │          │   → EXEC-SREV                                  │
│  ▼          │   [📄 view script]                              │
│ Animatic    │                                                │
│  ●          │ ───────────────────────────                    │
│  │          │ ⚠ Director · 8m ago                            │
│  ▼          │   Approved brief                               │
│ Generation  │   → EXEC-SW                                    │
│  ◐ 6/12     │                                                │
│  │          │ ───────────────────────────                    │
│  ▼          │ Filter: [All] [Errors] [Mine] [Per agent…]     │
│ Publish     │ Click DAG node ← filter feed by that agent     │
│  ○          │                                                │
└─────────────┴───────────────────────────────────────────────┘
```

Header strip is sticky and contains:
- Back link to series (`◀ Series · …`)
- Episode code + working title
- Status badge using `asset_status_chip` taxonomy
- Governance Mode chip (clickable per `uiux.md §8.4` — opens governance
  switcher scoped to this episode)
- Budget mini-meter (spent/ceiling)
- Right-side overflow menu: `Edit brief`, `Move to LOCKED`, `Export bundle`

---

## 3. Pipeline DAG (Left Pane)

### 3.1 Stage list

The DAG is **vertical**, top to bottom, one node per pipeline stage. Stages
are derived from the agent registry and the episode's status enum:

```
1. Brief                  (SPC-brief)
2. Story Brief            (SPC-story_brief)
3. Script                 (SCR)              ← EXEC-SW + EXEC-SREV
4. Storyboard             (STB)              ← EXEC-SB
5. World Check            (REV-world_check)  ← EXEC-WCHK
6. Animatic               (VID-animatic)     ← EXEC-EDIT
7. Generation             (IMG, VID, AUD)    ← EXEC-VGEN, EXEC-MGEN
8. Distribution Prep      (SPC-copy, IMG-thumb) ← EXEC-COPY, EXEC-THUMB
9. Publish                                   ← EXEC-PUB
10. Analytics                                ← EXEC-ANAL
```

Stage 7 (Generation) is a fan-out container — one parent node with a child
counter `◐ 6/12` showing 6 of 12 shots approved. Click expands the children
inline.

### 3.2 Node states (canonical)

These five states map to colour tokens in `config/uiux.yaml.pipeline_node_states`:

| Glyph | State | Meaning | Token |
|-------|-------|---------|-------|
| `○` | `idle` | Stage not started | `pipeline_node_idle` |
| `◐` | `running` | One or more jobs in flight | `pipeline_node_running` |
| `●` | `approved` | Stage output APPROVED | `pipeline_node_approved` |
| `◇` | `blocked` | Awaiting Director or external dependency | `pipeline_node_blocked` |
| `✗` | `failed` | Stage failed; needs revision or retry | `pipeline_node_failed` |

Connectors between nodes follow the colour of the **upstream** node, so
the Director can scan the column visually and see exactly where the flow
stops.

### 3.3 Node interaction

| Action | Behaviour |
|--------|-----------|
| Click node | Filter the right pane to show only events from this stage's agents. Pipeline node renders with active border. |
| Shift+click | Add to filter (multi-select stages). |
| Cmd/Ctrl+click | Open the most recent asset of this stage in a preview drawer without leaving the page. |
| Hover | Tooltip with: `<agents>`, `<latest job duration>`, `<latest cost>`, `<latest status>`. |
| Expand `◐` fan-out | Click the counter (`6/12`) to inline-expand children. Each child = one shot/track/SFX. |

### 3.4 Connectors and milestones

Three connector types:

```
│   normal flow (sequential)
│
═   gate connector (Director or governance approval required to pass)
│
║   fan-out connector (parent has multiple children)
```

Gate connectors carry a small chip showing who must approve:
`[ Director ]` or `[ Mode 2: EXEC-DIR-AI ]`.

The Animatic node (stage 6) is always a hard gate per
`webapp.md` Phase 4 design — Generation cannot start until Animatic is
APPROVED.

---

## 4. Agent Report Feed (Right Pane)

### 4.1 Card schema (`agent_report_card`)

Stored as agent output in `assets.agent_summary` (text, generated by the
agent itself) plus metadata pulled from related rows. Rendered as cards in
chronological order, newest first.

```
┌─────────────────────────────────────────────────────────┐
│ <emoji> <agent_code> · <relative_time>                   │
│   <one-line headline>                                    │
│   <2–3 bullet body if relevant>                          │
│   → <next_agent>  (status chip)                          │
│   [ artifact link ]   [ secondary link ]                 │
└─────────────────────────────────────────────────────────┘
```

| Field | Source |
|-------|--------|
| emoji | `agents.registry.emoji` |
| agent_code | `EXEC-VGEN`, `BOARD-MKT`, `Director`, etc. Director events use a `⚠` glyph. |
| relative_time | Auto-updates. |
| headline | First sentence of `assets.agent_summary` or a default ("Generated shot_04"). |
| body bullets | Optional. Up to 3 lines. From the agent's structured summary. Skipped if the agent only produced metadata. |
| next_agent | From `agents.registry.next_agent` mapping; absent for terminal agents. |
| status chip | Job status: `queued`, `running`, `done`, `failed`. |
| artifact link | Opens preview drawer (asset preview, review markdown, log file). |
| secondary link | Optional. Cost breakdown, prompt used, related event. |

### 4.2 Director events

When the Director acts (approve, revise, reject, decide, lift, hold), an
event is rendered as a Director card to keep the conversation honest:

```
⚠ Director · 8m ago
   Approved SS-S01-E01-SCR-script-v01
   Note: "tight, ship it"
   → EXEC-SREV
```

Director cards use a contrasting border colour (token
`accent_warning_subtle`) so they pop in the feed without screaming.

### 4.3 Errors and retries

Failed agent runs render with a `failed` status chip and an inline
`[ Retry ]` button (Director-only, triggers `/api/episodes/[id]/trigger`).

```
⚙ EXEC-VGEN · 12m ago · [ failed ]
   Generation failed: provider returned 503 after 3 retries.
   [ retry ]  [ open log ]  [ change provider… ]
```

`[ change provider… ]` is a stub link to provider settings — the actual
re-routing flow is Phase 8.

### 4.4 Filter bar

Above the feed:

```
Filter: [All] [Errors] [Mine] [Per agent ▾]
```

- **All** (default).
- **Errors** = `failed` jobs only.
- **Mine** = events tied to a Director action OR currently waiting on
  Director (i.e. items also in the Inbox).
- **Per agent ▾** = dropdown of all agent codes that have produced events.
- Clicking a DAG node also drives this filter (DAG node selection ≡ feed
  filter — a single state).

### 4.5 Pagination

Feed loads the latest 50 events. Scroll to bottom triggers `[ Load older ]`
button. Phase 5c MVP uses cursor pagination on `activity_events.created_at`.

### 4.6 Empty state

If the episode has no events yet (just created):

```
   Pipeline is idle.
   Approve the brief in your Inbox to start production.
   [ Open Inbox → ]
```

---

## 5. Cross-Pane Synchronisation

The two panes are linked via a single `selectedStageIds` state:

- DAG node click → toggle stage in selection → feed re-filters.
- Feed card hover → DAG node briefly highlights with `pulse` token.
- Empty selection = "All".

The selection is **not** persisted in URL by default. Adding `?stage=script`
filters and persists for sharing.

---

## 6. Episode Header Status Strip

The status strip directly below the breadcrumb summarises the whole episode:

```
Status: GENERATION_IN_PROGRESS · Mode 1 MANUAL · $4.20/$25  [ ⋯ ]
        (status_chip)            (mode_chip)   (budget_meter)
```

- `status_chip` reads from `episode_status` enum, mapped via
  `asset_status_chip` taxonomy.
- `mode_chip` is the per-episode governance mode (per
  `episodes.governance_mode`). Clicking opens the governance switcher
  scoped to this episode (see `uiux.md §8.4`).
- `budget_meter` shows `<spent>/<ceiling>`. Click opens a budget sub-panel.
- `[ ⋯ ]` overflow: `Edit brief`, `Move to LOCKED`, `Export bundle (zip)`,
  `Re-trigger any agent…`.

---

## 7. "Re-trigger any agent" Affordance

Per Phase 5b plan, `POST /api/episodes/[id]/trigger` is the manual override
endpoint. The UI surfaces it from two places:

1. Episode header overflow menu (`Re-trigger any agent…`).
2. Inline `[ retry ]` on each failed agent card.

The override dialog requires `reason` text. Modal:

```
┌──────────────────────────────────────────┐
│ Re-trigger an agent                       │
│                                           │
│ Agent     [▼ EXEC-SW   (Screenwriter)]    │
│ Reason    [______________________________]│
│           required, visible in audit log  │
│                                           │
│ ⓘ This will create a new job and may      │
│   produce duplicate assets.               │
│                                           │
│              [ Cancel ]  [ Trigger ]      │
└──────────────────────────────────────────┘
```

In Mode 1 / Mode 4 — Director only. In Mode 2 / Mode 3 — Director or
EXEC-DIR-AI per webapp.md §5.3 (Phase 5b implementation).

---

## 8. Hard Gates Highlight

Three places in the DAG always show as gate connectors regardless of mode:

1. **Animatic gate** — Generation cannot start until Animatic APPROVED.
2. **Publish gate** — Publish cannot run unless Director confirms (per
   `governance.md §4` hard limits).
3. **LOCKED transitions** — moving any asset to LOCKED is Director-only.

Gate connectors use the `pipeline_gate` token and a `═` glyph so they read
visually different from normal flow.

---

## 9. Mobile / Narrow Viewport

The two-pane layout collapses on viewports narrower than 1024 px:

- Above 1024 px → side-by-side panes (40%/60%).
- 768–1024 px → tabs `[ Pipeline | Agents ]` toggle.
- Below 768 px → vertical stack, DAG on top, feed below. Tested target is
  desktop production work; mobile is read-only emergency view.

---

## 10. Realtime

Same polling story as the Inbox: 30-second poll on
`GET /api/episodes/[id]/pipeline`. New events surface as a top pill:

```
2 new agent reports   [ Reload ]
```

No auto-scroll. Director clicks Reload to merge.

Phase 6 may add Supabase realtime channel `pipeline:<episode_id>` for live
push.

---

## 11. API Contract Summary (for Phase 5b)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/episodes/[id]/pipeline` | DAG state snapshot + recent activity feed (paginated). |
| GET | `/api/episodes/[id]/pipeline/feed` | Just the feed (cursor pagination). |
| POST | `/api/episodes/[id]/trigger` | Re-trigger any agent. Body: `{ agentCode, payload?, reason }`. |

The `pipeline` GET shape:

```ts
{
  success: true,
  data: {
    episode: { id, code, status, governance_mode, budget_spent, budget_ceiling, ... },
    stages: Array<{
      id: 'brief'|'story'|'script'|'storyboard'|'world_check'|'animatic'|'generation'|'distribution'|'publish'|'analytics',
      state: 'idle'|'running'|'approved'|'blocked'|'failed',
      agents: string[],   // codes contributing to this stage
      latest_asset_id?: string,
      job_count?: { total: number, done: number, running: number, failed: number },
    }>,
    feed: Array<AgentReportCard>,
    feed_cursor: string | null,
  }
}
```

---

## 12. Pattern References

| Pattern | Reference |
|---------|-----------|
| Vertical stage DAG | Temporal UI workflow view, Airflow DAG view, dbt DAG explorer |
| Stage state colour mapping | GitHub Actions workflow run, CircleCI pipeline view |
| Right-pane activity feed | GitHub PR conversation, Sentry issue activity, Cursor agent log |
| Agent Report card | Linear comment thread, Notion discussion |
| Cross-pane selection sync | Datadog log explorer + flame graph, Sentry breadcrumbs + event |
| Re-trigger modal with reason | GitHub Actions "Re-run jobs" dialog, Vercel "Redeploy" dialog |

---

## 13. Cross-References

- `specs/system/uiux.md` v0.3 — visual host, status chip taxonomy, mode chip lever.
- `specs/system/dashboard_cockpit.md` — Zone 2 lists timelines that link here.
- `specs/system/director_inbox.md` — Director cards in the feed mirror Inbox actions.
- `specs/system/webapp.md` §6.2 — original Episode Detail outline (this spec replaces).
- `specs/company/governance.md` §4 — mode rules surfaced in trigger affordance and gate chips.
- `lib/agents/registry.ts` (existing) — agent metadata source for emojis, codes, next_agent.
- `webapp/supabase/migrations/0008_activity_events.sql` — event table powering the feed.

---

*SandyStudio pipeline_view.md | v0.1 | Status: DRAFT*
