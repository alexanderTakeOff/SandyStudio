# SandyStudio — Dashboard Cockpit
## specs/system/dashboard_cockpit.md | v0.1 | DRAFT

> **Status:** Phase 5a UX architecture spec. Implementation: Phase 5c.

---

## 0. Purpose

Replace the current placeholder card grid on `/` (Dashboard) with a
production cockpit answering the Director's five core questions on every
visit:

1. What needs me right now? (Director Inbox preview)
2. What is in flight? (Active Episodes timelines)
3. What just happened? (Live activity feed)
4. Where is the budget? (mini meter)
5. What is blocked? (surfaced in Inbox + activity feed)

The pattern is a **3-zone production overview** — Vercel dashboard +
Linear "My Issues" + Sentry overview, adapted for AI-agent media production.

---

## 1. Routing

`/` (root). The current placeholder Dashboard at this route is replaced.

Empty dashboard handling (no series): see `onboarding.md`. The wizard
runs first; only after exit does the Dashboard cockpit render.

---

## 2. Layout Overview

Three vertical zones. Default proportions sum to 100% of viewport height
minus the StudioShell header (Topbar = 56 px). On a 1080-px viewport, the
zones aim for roughly:

```
┌────────────────────────────────────────────────────────┐
│ TOPBAR (sticky, 56 px)                                  │
├────────────────────────────────────────────────────────┤
│ ZONE 1 — Director Inbox preview                          │ 30%
│                                                          │
├────────────────────────────────────────────────────────┤
│ ZONE 2 — Active Episodes timelines                       │ 40%
│                                                          │
│                                                          │
├────────────────────────────────────────────────────────┤
│ ZONE 3 — Live activity feed                              │ 30%
│                                                          │
└────────────────────────────────────────────────────────┘
```

Each zone is its own component. None scroll independently above the fold.
If a zone overflows, it shows a `[ See more → ]` link at the bottom that
opens the deeper page (`/inbox`, `/episodes`, `/activity` respectively).

### 2.1 Zone proportions configurability

Stored in `config/uiux.yaml.dashboard.zones[].height_share`. Director can
change in Settings → Appearance → Dashboard density (Phase 6 polish).

### 2.2 Compact mode

For viewports < 900 px tall or when Director enables compact mode:

- Zones become tabs `[ Inbox | Episodes | Activity ]`.
- Active tab fills the available space.
- Tab badge shows count of items in that zone.

---

## 3. Zone 1 — Director Inbox Preview

### 3.1 Mockup

```
┌──────────────────────────────────────────────────────────┐
│ Inbox · 5 items need you                  [ Open Inbox → ]│
├──────────────────────────────────────────────────────────┤
│ ① SS-S01-E02-SCR-script-v01  EXEC-SW · 8m                 │
│   [APPROVE]  [REVISE]  [REJECT]                           │
│                                                           │
│ ② SS-S01-E01-IMG-shot_04-v01  EXEC-VGEN · 4m  ⚠ visual   │
│   [APPROVE]  [REVISE]  [REJECT]                           │
│                                                           │
│ ③ SS-S01-E01-VID-animatic-v01  EXEC-EDIT · 12m            │
│   [APPROVE]  [REVISE]  [REJECT]                           │
│                                                           │
│ ④ Story Brief decision  ART-HW · 25m                      │
│   [PICK A]  [PICK B]  [REQUEST C]                         │
│                                                           │
│ ⑤ Budget ceiling reached  BOARD-FIN · 2m                  │
│   [LIFT TO $30]  [HOLD]                                   │
└──────────────────────────────────────────────────────────┘
```

### 3.2 Behaviour

- Source: `GET /api/director/inbox?limit=5`. See `director_inbox.md §15`.
- Cards compress to one-line per item plus button row. Note input is hidden
  in preview; clicking REVISE/REJECT opens the full Inbox page focused on
  that item with note field expanded.
- Hotkeys (`A`, `R`, `X`, `J`, `K`) work directly from the Dashboard zone
  when focus is inside it. Focus indicator is a subtle accent border.
- `[ Open Inbox → ]` opens `/inbox` for full triage.
- Empty state: "Inbox clear · pipeline running autonomously" with a link to
  Active Episodes.

### 3.3 Visual gate enforcement

Visual items (`character_visual`, `location_ref`, `generated_shots`,
`thumbnail`) show ⚠ chip but **do not** disable buttons in the preview —
clicking APPROVE on a visual item from the Dashboard preview opens the
preview drawer first (per `director_inbox.md §11`). The Director must
acknowledge the preview before the actual approve fires.

---

## 4. Zone 2 — Active Episodes Timelines

### 4.1 Mockup

```
┌──────────────────────────────────────────────────────────────┐
│ Active Episodes · 2                       [ + New Episode ]  │
├──────────────────────────────────────────────────────────────┤
│ SS-S01-E01 "The Red Carpet"                  GENERATION 50%  │
│   ●─●─●─●─●─●─◐─○─○─○                                        │
│   Brief Story Script Story- World Anim. Gen. Distr. Pub Anal.│
│                                                              │
│ SS-S01-E02 "Working Title"                   SCRIPT_REVIEW   │
│   ●─●─◐─○─○─○─○─○─○─○                                        │
│   Brief Story Script Story- World Anim. Gen. Distr. Pub Anal.│
└──────────────────────────────────────────────────────────────┘
```

### 4.2 Per-episode row anatomy

Each row is a clickable card linking to `pipeline_view.md` for that
episode.

| Element | Details |
|---------|---------|
| Code + title | `SS-S01-E01 "The Red Carpet"` |
| Status chip (right) | Episode-level status from `episode_status` enum |
| Timeline | 10 inline node glyphs using same states as `pipeline_view.md §3.2` |
| Stage labels | Compact under each glyph (small caps). Truncates on narrow viewport. |
| Hover | Shows micro-tooltip with `<stage_label>: <state>; <agent>; <last update>` |
| Click | Navigates to `/episodes/[id]` (Pipeline View) |
| Right-click / context menu | Quick actions: `Open in pipeline view`, `Re-trigger latest agent`, `Pause` |

### 4.3 Sort order

```yaml
active_episodes_sort:
  - blocked_first: true       # episodes with at least one ◇ node first
  - oldest_running_first: true
  - alphabetical: true        # tie-breaker
```

### 4.4 `[+ New Episode]` CTA

Always present as the final card in the list, even when many episodes
exist. Clicking opens the Episode Brief form (same form as onboarding
step 4) in a modal scoped to the most recently active series. If the
Director has multiple series, a series selector precedes the form.

### 4.5 Empty state (post-onboarding skip)

```
┌──────────────────────────────────────────────────────────┐
│ No active episodes.                                       │
│                                                           │
│ [ + Create your first episode ]                           │
│                                                           │
│ Or pick an inactive episode below to resume:              │
│   • SS-S01-E00 (drafted, BRIEF_DRAFT)                     │
└──────────────────────────────────────────────────────────┘
```

### 4.6 "Active" definition

An episode is "active" if its status is **not** in `{IDEA, ARCHIVED,
PUBLISHED_FINAL, ABANDONED}`. Inactive episodes live on `/episodes` (Phase
6 page) and surface here only via the empty-state link.

---

## 5. Zone 3 — Live Activity Feed

### 5.1 Mockup

```
┌──────────────────────────────────────────────────────────────┐
│ Live activity                            [ See full feed → ] │
├──────────────────────────────────────────────────────────────┤
│ ⚙ EXEC-VGEN · just now                                        │
│   Generated SS-S01-E01-IMG-shot_04 · $0.34 · 4m12s            │
│                                                               │
│ ✓ EXEC-SREV · 2m ago                                          │
│   Script v01 PASS for SS-S01-E02 — 3 minor notes              │
│                                                               │
│ ⚠ Director · 8m ago                                           │
│   Approved SS-S01-E02 brief                                   │
│                                                               │
│ ⚠ BOARD-FIN · 12m ago                                         │
│   Budget threshold reached for SS-S01-E03 ($24.80/$25)        │
│                                                               │
│ ⚙ EXEC-EDIT · 25m ago                                         │
│   Animatic SS-S01-E01 ready for review                        │
└──────────────────────────────────────────────────────────────┘
```

### 5.2 Behaviour

- Source: `GET /api/activity?limit=10`.
- Cards use the same `agent_report_card` schema as
  `pipeline_view.md §4.1`, but with **episode prefix** added because the
  feed is global.
- Click a card: navigates to that episode's Pipeline View, with the feed
  filtered to that agent and the relevant card scrolled into view.
- Severity stripe on left edge: `info` (subtle), `warning` (amber bar),
  `error` (red bar). Tied to `activity_events.severity`.
- `[ See full feed → ]` opens `/activity` (Phase 6 page) for paginated
  browsing.
- New events surface as a top pill `2 new events [Reload]` — same pattern
  as Inbox and Pipeline View.

### 5.3 Filtering in Zone 3

Inline pill filters above the feed:

```
[ All ]  [ Errors ]  [ Director actions ]  [ Per agent ▾ ]
```

Filters are local to the dashboard component and do not persist (the deep
`/activity` page persists filters in URL).

---

## 6. Header / Topbar Integration

The StudioTopbar (existing) sits above the dashboard. Phase 5a updates it
per `uiux.md §8.4` to make the chips clickable levers:

- System Mode chip → modal "Switch to ===5=== EDIT?".
- Governance Mode chip → dropdown with the four modes and per-mode help.

These changes are described in `uiux.md v0.3 §8.4`. The Dashboard does not
own them, but the cockpit's clarity depends on the chips being interactive.

---

## 7. Quick Actions Strip (optional, end of zone 2)

Below the Active Episodes list, a single horizontal quick-actions strip:

```
[ + New Episode ]  [ + New Series ]  [ Open Concierge ]  [ Run setup again ]
```

`Run setup again` is hidden if the wizard has been completed; it lives in
Settings instead. Phase 5c implementation may consolidate into a single
floating action button (FAB) bottom-left, following Linear's create-FAB
pattern. Reserved decision; ASCII shows the strip variant for clarity.

---

## 8. Empty Dashboard (No Series Yet)

If the Director somehow lands on `/` without completing onboarding (edge
case after partial wizard):

```
┌──────────────────────────────────────────────────────────┐
│ Welcome back.                                             │
│                                                           │
│ No series yet — let's set one up.                         │
│                                                           │
│ [ Run setup wizard → ]                                    │
└──────────────────────────────────────────────────────────┘
```

This is a guard rail, not the normal path. The wizard should normally
auto-block sidebar nav per `onboarding.md §1.3`.

---

## 9. Realtime & Polling

- Zone 1 (Inbox preview) — polls `/api/director/inbox?limit=5` every 30 s.
- Zone 2 (Active Episodes) — polls `/api/episodes?status=active` every 60 s.
- Zone 3 (Activity) — polls `/api/activity?limit=10` every 30 s.

Pollers stagger startup by 5–10 s to avoid bursting the API on first
render. Phase 6 may swap to Supabase realtime channels.

---

## 10. Accessibility & Motion

- Each zone is its own ARIA `region` with a labelled heading.
- Hotkeys in Zone 1 are documented via the same `?` overlay used in the
  full Inbox.
- Status chip colour changes respect `prefers-reduced-motion`: no pulse
  animations on `running` / `blocked` states; static colour.
- Active Episode timelines do not animate on hover; only the tooltip
  appears.

---

## 11. API Contract Summary (for Phase 5b)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/director/inbox?limit=5` | Zone 1 source. See `director_inbox.md §15`. |
| GET | `/api/episodes?status=active` | Zone 2 source. Returns episodes with stage progress for timeline rendering. |
| GET | `/api/activity?limit=10` | Zone 3 source. Pulls from `activity_events`. |
| GET | `/api/budget` (header micro-meter) | Read by Topbar budget chip (Phase 6). |

The episodes-list endpoint must include precomputed `stages` array with
state per stage so the frontend does not have to assemble it from raw
job/asset rows. Shape:

```ts
{
  success: true,
  data: Array<{
    id, code, title, status,
    governance_mode,
    stages: Array<{
      id: 'brief'|'story'|...,    // same enum as pipeline_view §3.1
      state: 'idle'|'running'|'approved'|'blocked'|'failed',
    }>,
    last_event_at: string | null,
  }>
}
```

---

## 12. Pattern References

| Pattern | Reference |
|---------|-----------|
| 3-zone overview cockpit | Vercel dashboard, Linear "My Issues", Sentry overview |
| Episode timeline as rows | GitHub Actions runs list, CircleCI projects view |
| Inbox-preview-on-dashboard | Linear "My Issues" widget, Notion home blocks |
| Live activity feed | Sentry "Recent issues", Vercel deployments stream |
| Quick-actions strip / FAB | Linear bottom-left FAB, Notion `/` slash actions |

---

## 13. Cross-References

- `specs/system/uiux.md` v0.3 — visual host, Topbar lever rules.
- `specs/system/director_inbox.md` — Zone 1 deep page.
- `specs/system/pipeline_view.md` — Zone 2 deep page (per episode).
- `specs/system/onboarding.md` — pre-cockpit flow.
- `specs/system/storage_configuration.md` — surfaced in onboarding before
  cockpit, not on Dashboard itself.
- `specs/system/webapp.md` §6.1 — original Dashboard outline (this spec
  replaces it).
- `webapp/supabase/migrations/0008_activity_events.sql` — Zone 3 data
  source.

---

*SandyStudio dashboard_cockpit.md | v0.1 | Status: DRAFT*
