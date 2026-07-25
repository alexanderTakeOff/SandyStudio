# SandyStudio — Director Inbox
## specs/system/director_inbox.md | v0.1 | DRAFT

> **Status:** Phase 5a UX architecture spec. Implementation: Phase 5c.

---

## 0. Purpose

The Director Inbox is the single, dedicated place where every item awaiting
the Director's personal action is concentrated:

- assets needing approval / revision / rejection;
- creative decisions (option A vs B, etc.);
- blockers requiring explicit unblock;
- anything where the pipeline is **paused waiting on this human**.

It replaces the current `/approvals` placeholder and supplies the
Dashboard Zone 1 preview defined in `dashboard_cockpit.md §4`.

The pattern reference is **Linear Inbox** + **GitHub PR review queue** +
**Superhuman email triage**: aggressive keyboard shortcuts, calm visual
density, and a single decision per item with optional inline note.

---

## 1. Scope

The Inbox shows actionable items only. Things it explicitly does **not** show:

- Completed approvals (those live in the per-episode pipeline timeline).
- Activity from agents that does not require Director input (lives in the
  global activity feed in Dashboard Zone 3).
- Read-only status updates (those live on episode pages).

The rule: **if it has no decision button for the Director, it is not in the
Inbox.**

---

## 2. Item Source

An Inbox item is materialised from one of:

| Source | Trigger |
|--------|---------|
| Asset awaiting approval | `assets.status = 'REVIEW'` AND approver is Director (per Authority Matrix) |
| Decision requested | `activity_events.event_type = 'decision_requested'` AND not yet resolved |
| Awaiting input | `activity_events.event_type = 'input_requested'` AND not yet resolved |
| Blocker | `activity_events.event_type IN ('budget_threshold_reached','blocker_raised')` AND not yet resolved |

A unified Phase 5b view (`director_inbox_view`) joins these into a single list
ordered by priority + age. Items are removed from the view as soon as the
Director acts (status flips, decision recorded, blocker resolved).

---

## 3. Visual Layout

### 3.1 Full Inbox page (`/inbox`)

```
┌──────────────────────────────────────────────────────────────┐
│ Inbox · 5 items                                  [a R x M ?] │
│ Filter: [All] [Visual] [Non-visual] [Blockers] [Mine 🤖]      │
├──────────────────────────────────────────────────────────────┤
│ NEEDS APPROVAL · 3                                            │
│                                                               │
│  ▸ ① SS-S01-E02-SCR-script-v01                                │
│       EXEC-SW · 8m ago · 240 lines · script preview          │
│       3 minor notes from EXEC-SREV.                           │
│       [APPROVE]  [REVISE]  [REJECT]   add note ↩             │
│                                                               │
│  ▸ ② SS-S01-E01-IMG-shot_04-v01                               │
│       EXEC-VGEN · 4m ago · 1024×1024 · cost $0.34            │
│       ⚠ visual — bulk actions disabled per                   │
│         character_consistency.md §3.3                        │
│       [APPROVE]  [REVISE]  [REJECT]   add note ↩             │
│                                                               │
│  ▸ ③ SS-S01-E01-VID-animatic-v01                              │
│       EXEC-EDIT · 12m ago · 60s preview                      │
│       Animatic gate — generation cannot start until this      │
│       is approved.                                            │
│       [APPROVE]  [REVISE]  [REJECT]   add note ↩             │
│                                                               │
├──────────────────────────────────────────────────────────────┤
│ NEEDS DECISION · 1                                            │
│                                                               │
│  ▸ ④ Story Brief — Option A or B?                             │
│       ART-HW · 25m ago · SS-S01-E02                           │
│       Option A: Sandy in elevator chase                       │
│       Option B: Sandy at gallery opening                      │
│       [PICK A]  [PICK B]  [REQUEST OPTION C]   note ↩        │
│                                                               │
├──────────────────────────────────────────────────────────────┤
│ BLOCKED · 1                                                   │
│                                                               │
│  ▸ ⑤ Budget ceiling reached for SS-S01-E03                    │
│       BOARD-FIN · 2m ago · Spent $24.80 / ceiling $25.00     │
│       Lift ceiling to $30.00 to continue, or hold pipeline?   │
│       [LIFT TO $30]  [LIFT CUSTOM…]  [HOLD]   note ↩         │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 Dashboard Zone 1 preview

A compressed list of the top N items (`N = 5` by default, configurable in
`config/uiux.yaml.inbox.preview_limit`). Same item rendering, but groups
collapsed into a single ordered stream and the bottom of each card omits the
note field (focus → expand).

See `dashboard_cockpit.md §4` for the host layout.

---

## 4. Groups

Items are grouped in this exact order. Empty groups are hidden.

```yaml
inbox_groups:
  - id: needs_approval
    label: "Needs approval"
    sort:
      - visual_first: false       # non-visual first; visual is heavier work
      - oldest_first: true
  - id: needs_decision
    label: "Needs decision"
    sort:
      - oldest_first: true
  - id: awaiting_input
    label: "Awaiting your input"
    sort:
      - oldest_first: true
  - id: blocked
    label: "Blocked — awaiting unblock"
    sort:
      - severity_desc: true       # critical blockers first
      - oldest_first: true
```

Visual items (sub-categories `character_visual`, `location_ref`,
`generated_shots`, `thumbnail`) are **sorted last** within `needs_approval`
because they require longer review time — we want non-visual decisions to
flush first.

---

## 5. Card Anatomy

Every Inbox card shares this structure:

```
[checkbox]  ① <asset_filename or decision_title>
            <agent_id> · <relative_time> · <metadata strip>
            <one-line context or summary>
            [primary]  [secondary]  [destructive]   note ↩
            (optional) ⚠ <warning_chip>
```

| Element | Source |
|---------|--------|
| `checkbox` | Hidden for visual items (bulk actions disabled). Shown for non-visual. |
| `①` enumerator | Position in current filter; resets on filter change. |
| `asset_filename` | From SS-* naming convention or decision title. |
| `agent_id` | Producing agent code (`EXEC-SW`, `BOARD-FIN`, …). |
| `relative_time` | Auto-updates: "just now", "4m ago", "2h ago", "yesterday". |
| `metadata strip` | Type-specific. Scripts: line count. Images: dimensions + cost. Video: runtime. Decisions: option count. |
| `one-line context` | Short reason. Generated by agent or pulled from `activity_events.description`. |
| Action buttons | Type-specific. See §6. |
| Warning chip | Visual gate, budget warning, locked-status risk. |

The card collapses to a single line if Director's `compact_mode` setting is
on (Settings → Appearance → Inbox density). Default = expanded.

---

## 6. Decision Buttons by Item Type

### 6.1 Asset approval (most common)

```
[APPROVE]   [REQUEST REVISION]   [REJECT]   [MARK NEEDS HUMAN TWEAK]
```

Rules from `uiux.md §10.4` apply:
- `APPROVE` note optional.
- `REQUEST REVISION` note **required** (text field expands on click).
- `REJECT` note **required**.
- `MARK NEEDS HUMAN TWEAK` flips status to `NEEDS_HUMAN_TWEAK` and exits the
  Inbox. The Director then performs the manual fix outside the agent loop.

### 6.2 Decision request

```
[PICK A]   [PICK B]   [PICK …]   [REQUEST ALTERNATIVE]
```

Number of buttons varies; populated from the agent's `options` array. Note
optional. `REQUEST ALTERNATIVE` requires note explaining what is missing.

### 6.3 Blocker

Buttons depend on the blocker type. Examples:

| Blocker | Buttons |
|---------|---------|
| Budget threshold | `[LIFT TO <suggested>]` `[LIFT CUSTOM…]` `[HOLD]` |
| Storage write failure | `[OPEN STORAGE SETTINGS]` `[HOLD]` |
| API key invalid | `[OPEN PROVIDER SETTINGS]` `[HOLD]` |
| Manual hold raised by agent | `[ACKNOWLEDGE & RESUME]` `[INVESTIGATE → DM]` |

Always include a `[HOLD]` option that pauses the pipeline without resolving
the blocker — useful when Director needs to think.

---

## 7. Keyboard Shortcuts

The whole Inbox is keyboard-first.

| Key | Action |
|-----|--------|
| `J` | Move focus to next item |
| `K` | Move focus to previous item |
| `Space` | Open preview drawer for focused item |
| `A` | Approve focused item |
| `R` | Request revision (focuses note field) |
| `X` | Reject (focuses note field) |
| `T` | Mark needs human tweak |
| `M` | "Mine" — claim a Mode 2/3 item routable to EXEC-DIR-AI for personal review |
| `?` | Open shortcut help overlay |
| `Esc` | Close help / clear focus |
| `Enter` | Confirm primary action (when buttons focused) |
| `1`–`9` | Pick option N (decision items) |
| `G G` | Jump to top |
| `G E` | Jump to end |

Shortcuts are visible in the help overlay (`?`) and in tooltips on hover.

---

## 8. Bulk Actions

Bulk actions exist for **non-visual** items only. The visual gate from
`character_consistency.md §3.3` is enforced at the UI level — visual cards
do not render checkboxes.

### 8.1 Bulk bar

```
┌──────────────────────────────────────────────────────────┐
│ ☑ 3 selected                                             │
│ [Bulk approve]  [Bulk request revision]  [Clear]         │
└──────────────────────────────────────────────────────────┘
```

Appears when at least one checkbox is ticked. Bulk approve confirms with a
single modal listing the selected items; the Director clicks once.

### 8.2 Bulk constraints

- Only same-type items selectable in one bulk action (e.g. all scripts, or
  all metadata copies — not a mix). Mixed selections show a warning chip.
- Bulk reject is **not** offered — rejection is destructive and deserves
  per-item review.
- Bulk size cap: 20 items per action to prevent runaway acceptances.

### 8.3 Clear inbox (added 2026-07-25, Director directive)

`Clear inbox` sits in the page header next to `Help` and drains the
**notification half** of the feed. It exists because the two item sources age
very differently (§2):

- **Asset rows self-clear.** They render only while `status='REVIEW'`, so any
  decision (approve / revise / reject / tweak) drops them from the feed.
- **Event rows did not clear at all.** They render while `resolved_at IS NULL`,
  and before this button the only writer of `resolved_at` was the
  canon-extension sweep. `decision_requested`, `input_requested`,
  `blocker_raised`, `budget_threshold_reached` and `rule_proposal` accumulated
  with no TTL and no cleanup job. Since the list caps at 50 rows and sorts
  oldest-first inside each group, that backlog pushed fresh work off the page.

Rules:

- **Cleared:** the five notification event types above → `resolved_at = now()`.
- **Never cleared:** assets awaiting approval (clearing one would mean deciding
  it, which flips status and fires the DAG) and `canon_extension_proposed` (the
  proposals live in `metadata.proposals`; `resolved_at` is what marks them
  dispositioned).
- **Filter-aware.** Only the active pill's scope is drained — `blockers` clears
  blocker/budget events only; `visual` clears nothing (event rows are never
  visual).
- Button is disabled when nothing on screen is clearable. Its counter is a
  **floor** — the sweep also drains matching events past the 50-row page cap.
- A confirmation modal states what will and will not be cleared before the
  sweep runs.
- **Audit:** one `config_updated` event with `metadata.action='inbox_clear'`,
  the filter, the count and the cleared event ids. Dismissed rows remain in the
  Activity feed — clearing hides them from triage, it does not delete history.
- Shared scope rules live in `lib/api/inbox-clear.ts` so the server sweep and
  the on-screen counter cannot disagree.

---

## 9. Inline Note

Every action surfaces an optional one-line note input below the buttons. The
input expands to a multi-line textarea on focus.

```
[APPROVE]  [REVISE]  [REJECT]   add note ↩
                                       │
                                       ▼ (focus expands)
┌────────────────────────────────────────┐
│ Optional note (visible to agents)…    │
│                                        │
└────────────────────────────────────────┘
```

Notes attach to the resulting `approvals` row as `note` text. They appear in
the per-episode timeline and are passed to the next agent's context as
"Director feedback."

---

## 10. Empty State

When the Inbox has zero items:

```
┌──────────────────────────────────────────────────────────┐
│ Inbox is clear.                                           │
│                                                           │
│ Nothing is waiting on you right now.                      │
│                                                           │
│ Active episodes are continuing autonomously per their     │
│ governance modes. You'll see new items here as they come. │
│                                                           │
│ [ View active episodes → ]                                │
└──────────────────────────────────────────────────────────┘
```

Calm copy. No emoji-confetti. The Inbox being empty is normal in Mode 2/3
production.

---

## 11. Visual Gate Enforcement

Per `character_consistency.md §3.3` and `uiux.md §13`:

```
VISUAL CATEGORIES (hard rule):
  character_visual, location_ref, generated_shots, thumbnail
  →  bulk actions disabled
  →  always Director-only (no EXEC-DIR-AI delegation, even in Mode 2/3)
  →  preview drawer required before APPROVE button enables
  →  card shows ⚠ chip "visual — human review required"
```

The "preview drawer required" rule means: for visual items the `APPROVE`
button is disabled until the Director has opened the preview drawer at
least once. This prevents accidental rubber-stamping. Implemented via
`previewSeenIds` Set in component state.

---

## 12. Mode Behaviour

The Inbox's contents shift based on the active Governance Mode:

| Mode | Inbox content |
|------|---------------|
| 1 — MANUAL | Every approval gate appears. Most items. |
| 2 — HYBRID | Items in the Director's scope appear; delegated items show with `🤖 may auto-approve` chip and `M` shortcut to claim |
| 3 — DELEGATED | Only hard-limit items appear (visuals, publish, budget) plus AI escalations |
| 4 — AUTOTEST | **Inbox hidden entirely** with banner: "AUTOTEST mode — no human gates" |

### 12.1 Claim ("Mine") behaviour in Mode 2/3

A Director claim toggles `inbox_items.claimed_by` to the Director. The item:
- moves up in sort order;
- prevents EXEC-DIR-AI from acting on it;
- stays until Director acts or explicitly releases (`Shift+M`).

---

## 13. Time-Window Filters

Default view: all items, all time.

Optional filters in the toolbar:
- **All** (default)
- **Visual** (only visual gates)
- **Non-visual** (everything except visual)
- **Blockers** (only `blocked` group)
- **Mine 🤖** (only items I've claimed in Mode 2/3)

Filters persist in URL query (`/inbox?filter=visual`) so Director can
bookmark a filtered view.

---

## 14. Realtime Behaviour

Phase 5c MVP uses **polling**: the Inbox fetches `/api/director/inbox` every
30 seconds (configurable). Phase 6+ may move to Supabase realtime
subscriptions or SSE.

When new items arrive between polls, a subtle pill appears at the top:

```
┌────────────────────────────────────┐
│ 2 new items   [Reload]             │
└────────────────────────────────────┘
```

No auto-scroll. The Director clicks `[Reload]` so they don't lose place
mid-decision.

---

## 15. API Contract Summary (for Phase 5b)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/director/inbox` | List items, sorted, grouped. Query: `?limit=`, `?filter=`, `?episode_id=`. |
| POST | `/api/director/inbox/bulk-approve` | Body: `{ asset_ids: string[], note?: string }`. Validates non-visual only. |
| POST | `/api/director/inbox/clear` | Body: `{ filter?: 'all'\|'visual'\|'non_visual'\|'blockers', episode_id?: uuid }`. Sets `resolved_at` on unresolved notification events in scope (§8.3). Returns `{ cleared, cleared_ids }`. Never touches assets or canon-extension proposals. |
| POST | `/api/director/inbox/claim` | Body: `{ item_id, claim: true \| false }`. Mode 2/3 only. |

Per-item action endpoints come from `webapp.md §5`:
- `POST /api/assets/[id]/approve`
- `POST /api/assets/[id]` PATCH for revision/reject status
- `POST /api/blockers/[id]/resolve` (new endpoint flagged for 5b)

---

## 16. Pattern References

| Pattern | Reference |
|---------|-----------|
| Triage inbox + hotkeys | Linear Inbox, Superhuman email |
| Per-card primary/secondary/destructive | GitHub PR review queue, Vercel deployments |
| Inline note expand on focus | Notion comment thread, GitHub PR review note |
| Visual sensitivity flag | Gmail "external sender" warning, GitHub branch protection |
| Bulk action with type constraint | Gmail multi-select, GitHub "auto-merge" rules |

---

## 17. Cross-References

- `specs/system/uiux.md` v0.3 — host visual rules, status chip taxonomy.
- `specs/system/dashboard_cockpit.md` §4 — Zone 1 preview spec.
- `specs/system/pipeline_view.md` — where in-flight items show in context.
- `specs/system/character_consistency.md` §3.3 — visual approval gate rule.
- `specs/system/webapp.md` §6 — Approval Queue history (this spec replaces
  the old §6.3 with the more focused Inbox model).
- `specs/company/governance.md` §4 — mode definitions that drive §12.
- `specs/system/project_state.md` — asset/episode statuses involved.

---

*SandyStudio director_inbox.md | v0.1 | Status: DRAFT*
