# SandyStudio — First-Run Onboarding Wizard
## specs/system/onboarding.md | v0.1 | DRAFT

> **Status:** Phase 5a UX architecture spec. Implementation: Phase 5c.

---

## 0. Purpose

Define the first-run experience that takes a Director from a fresh login to a
running first episode in four guided steps.

The current webapp (end of Phase 4) drops the Director into a polished shell
filled with placeholders. There is no "Create Series" CTA, no storage
configuration, no first-episode flow. This spec fixes that.

---

## 1. When Does the Wizard Run?

### 1.1 Trigger condition

The wizard runs when **all** are true:

- Director is authenticated.
- `series.count === 0` (no series exists for this Director).
- `app_config['storage'].project_root_writable` is missing OR `false` OR older
  than 24 h since `last_validated_at`.

If only the storage condition is missing (i.e. one or more series already
exist), the wizard runs in **partial mode** — only step 1 (Storage) plus a
"Skip to dashboard" exit.

### 1.2 Re-entry

Director can re-open the wizard from `/settings → Onboarding → "Run setup
wizard again"`. Re-run never deletes or modifies existing series; it only adds
new ones.

### 1.3 Hard-block exit

Until step 4 is complete on first run, all sidebar nav (except Settings) is
disabled. The Concierge floating button is hidden during onboarding to avoid
distraction.

---

## 2. Wizard Steps Overview

```
Step 1 — Storage         (required, blocking)
Step 2 — First Series    (required, blocking)
Step 3 — Approval Authority Matrix  (required, defaults pre-selected)
Step 4 — First Episode Brief        (optional — Director can save and exit)
```

Progress is saved between steps. Refreshing the browser resumes at the same
step. State stored in `app_config['onboarding']`:

```
{
  current_step: 1 | 2 | 3 | 4,
  completed_steps: number[],
  draft_series_id: uuid | null,
  draft_episode_id: uuid | null,
  started_at: timestamptz,
}
```

---

## 3. Visual Frame

The wizard uses a fullscreen card on top of the StudioShell ambient field. The
sidebar/topbar are dimmed and inert.

```
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│              ●─────●─────●─────○                             │  ← stepper
│           Storage  Series  Authority  Episode                │
│                                                              │
│   ┌──────────────────────────────────────────────────────┐   │
│   │                                                      │   │
│   │           STEP CONTENT GOES HERE                     │   │
│   │                                                      │   │
│   └──────────────────────────────────────────────────────┘   │
│                                                              │
│                          [ ← Back ]   [ Continue → ]         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

Stepper:
- `●` (filled) = completed
- `◐` (half-filled) = current
- `○` (empty) = pending

Stepper nodes are clickable for completed steps only — Director can revisit
prior decisions before reaching step 4. Pending steps are not navigable.

---

## 4. Step 1 — Storage Configuration

Delegates to `specs/system/storage_configuration.md §3`.

### 4.1 Exit criteria

`Continue →` enables when both `project_root` and `media_storage_root` pass
the write-test probe. `app_config` is persisted on success.

### 4.2 Mockup

See `storage_configuration.md §3.1`.

---

## 5. Step 2 — Create First Series

### 5.1 Form fields

Minimal — just enough to seed the series. Bibles, world model, and character
profiles populate during episode 1 production.

```
┌───────────────────────────────────────────────────────────┐
│ Step 2 of 4 — Your first series                            │
│                                                            │
│  Series code     [SS01]              auto-generated, edit  │
│  Series title    [_______________________________]         │
│  Audience        [▼ Adult comedy / Kids / Mixed / Other]   │
│  Genre           [▼ Comedy / Drama / Doc / Sci-fi / Other] │
│  Logline         [_______________________________]         │
│                  one-sentence pitch (optional)              │
│                                                            │
│  Episode budget ceiling  [$ 25.00]  per episode default    │
│                                                            │
│  ⓘ Bibles (world, characters, style) get populated in       │
│    Episode 1 — you don't write them now.                   │
│                                                            │
│              [ ← Back ]            [ Continue → ]          │
└───────────────────────────────────────────────────────────┘
```

### 5.2 Validation

- `series_code`: must match `^[A-Z]{2,6}[0-9]{0,2}$`. Auto-generated as `SS01`,
  `SS02`, ... if Director does not edit.
- `title`: required, 1–80 chars.
- `audience`, `genre`: required, dropdowns from `config/uiux.yaml` enum.
- `logline`: optional, ≤ 200 chars.
- `episode_budget_ceiling`: required, positive number, default from
  `config/defaults.yaml`.

### 5.3 Persist

On `Continue →` insert one row into `series` (status `DRAFT`) and write
`onboarding.draft_series_id`. The series moves to `ACTIVE` after step 4
completes.

---

## 6. Step 3 — Approval Authority Matrix

This is the wizard from `specs/system/webapp.md §6.6`. Phase 5a places it
inside onboarding so the Director declares delegation rules **before** any
production runs. Phase 7 implements the behavioural side; Phase 5a defines
the UX surface.

### 6.1 Mockup

```
┌───────────────────────────────────────────────────────────┐
│ Step 3 of 4 — Who approves what?                           │
│                                                            │
│ Set once. You can override per episode later.              │
│                                                            │
│ ┌──────────────────────────┬──────────────────────────────┐│
│ │ CATEGORY                 │ APPROVER                     ││
│ ├──────────────────────────┼──────────────────────────────┤│
│ │ 🖼 Character visuals     │ ● Director  (locked)         ││
│ │ 🖼 Location references   │ ● Director  (locked)         ││
│ │ 🎬 Generated shots       │ ● Director  (locked)         ││
│ │ 🖼 Thumbnails            │ ● Director  (locked)         ││
│ │ 📄 Scripts               │ ○ Director  ● EXEC-DIR-AI    ││
│ │ 📋 Storyboards           │ ○ Director  ● EXEC-DIR-AI    ││
│ │ 🎵 Music / audio         │ ○ Director  ● EXEC-DIR-AI    ││
│ │ 📑 Metadata / SEO copy   │ ○ Director  ● EXEC-DIR-AI    ││
│ │ 📤 Publish to YouTube    │ ● Director  (locked)         ││
│ └──────────────────────────┴──────────────────────────────┘│
│                                                            │
│ ⓘ Visual categories and Publish are locked to Director per │
│   character_consistency.md §3.3 and CLAUDE.md §6 hard      │
│   limits. You cannot delegate them.                        │
│                                                            │
│              [ ← Back ]            [ Continue → ]          │
└───────────────────────────────────────────────────────────┘
```

### 6.2 Locked rows

These four rows always show `● Director  (locked)`. The radio buttons are
disabled with a tooltip linking to the rule:

- **Character visuals** → `character_consistency.md §3.3` ("Visual review is
  always human")
- **Location references** → same rule (`uiux.md §13.2`)
- **Generated shots** → same rule
- **Thumbnails** → same rule
- **Publish to YouTube** → `CLAUDE.md §6` hard limits ("Director always, all
  modes")

### 6.3 Delegatable rows

Scripts, storyboards, music/audio, metadata. Default selection in onboarding
is `EXEC-DIR-AI` (the AI Executive Producer). The Director can switch any to
`Director` to keep manual control.

### 6.4 Persist

Stores into a new `approval_authority_matrix` row associated with the series.
Schema flagged for Phase 5b migration:

```
table approval_authority_matrix
  id                       uuid PK
  series_id                uuid FK series(id)
  category                 text  -- enum below
  approver                 text  -- 'director' | 'exec_dir_ai'
  delegate_user_id         uuid  -- nullable, future per webapp.md §6.6
  is_locked                boolean
  updated_at               timestamptz

  unique (series_id, category)

categories:
  character_visual, location_ref, generated_shots, thumbnail,
  script, storyboard, music, metadata, publish
```

---

## 7. Step 4 — First Episode Brief

### 7.1 Form fields

```
┌───────────────────────────────────────────────────────────┐
│ Step 4 of 4 — Your first episode                           │
│                                                            │
│  Episode code      [E01]    auto, edit if needed           │
│  Working title     [_______________________________]       │
│  Target runtime    [▼ 30s / 60s / 90s / 120s / Custom]     │
│  Premise           [_______________________________]       │
│                    [_______________________________]       │
│                    2–3 sentence story seed                 │
│                                                            │
│  Initial governance mode for this episode                  │
│   ● Mode 1 MANUAL    ○ Mode 2 HYBRID    ○ Mode 3 DELEGATED │
│   ⓘ Mode 4 AUTOTEST is for pipeline testing — not here.    │
│                                                            │
│  ─ ☐ Skip this for now ─ I'll create the first episode    │
│       from the dashboard.                                   │
│                                                            │
│              [ ← Back ]   [ Save & Open Dashboard → ]      │
└───────────────────────────────────────────────────────────┘
```

### 7.2 Validation

- `episode_code`: `^E[0-9]{1,3}$`, auto `E01` for first episode.
- `title`: required, 1–80 chars.
- `target_runtime`: required, one of preset values + `custom` triggers
  numeric input (5–300 sec).
- `premise`: required, 20–500 chars.
- `governance_mode`: 1, 2, or 3 (no Mode 4 from onboarding).

### 7.3 "Skip for now" path

If checked, no episode is created. The series and authority matrix from
prior steps are committed. Director lands on Dashboard with empty Active
Episodes zone showing a `[+ New Episode]` CTA pointing at the same form.

### 7.4 "Save & Open Dashboard" path

Inserts:

- One row into `episodes` (status `BRIEF_DRAFT`).
- One row into `assets` (`type='SPC'`, `subtype='brief'`, status `DRAFT`).
- One row into `activity_events` (`event_type='episode_created'`).

Then:

- Marks `onboarding.completed_steps` = `[1,2,3,4]`.
- Sets series status to `ACTIVE`.
- Routes Director to `/` (Dashboard).

Note: episode does not auto-trigger EXEC-SW. Director must approve the brief
asset from the Inbox first — that explicit gate is what kicks the pipeline
off. This keeps Mode 1 honest in the onboarding flow.

---

## 8. Empty-State CTAs (Post-Wizard)

If the Director skips step 4, the Dashboard renders an empty-state Zone 1
(Director Inbox preview) and Zone 2 (Active Episodes) with this layout:

```
┌─────────────────────────────────────────────────────┐
│ Welcome to SS01 "Sandy"                              │
│                                                      │
│ Nothing in production yet.                           │
│                                                      │
│ [ + Create your first episode ]                      │
│                                                      │
│ Or read: How SandyStudio works (link to docs)        │
└─────────────────────────────────────────────────────┘
```

The same `[+ New Episode]` button lives in Dashboard Zone 2 once at least one
episode exists. See `dashboard_cockpit.md §3` for full specification.

---

## 9. State Machine

```
NEW_DIRECTOR
  └─ login
     └─ onboarding.current_step = 1 (Storage)
        ├─ probe fail → stay on step 1
        └─ probe pass → step 2 (Series)
                        └─ form valid → step 3 (Authority)
                                        └─ choices saved → step 4 (Episode)
                                                            ├─ skip → DASHBOARD (empty)
                                                            └─ save → DASHBOARD (with E01)
```

---

## 10. Re-entry & Editability

| Setting changed later | Where | Effect on onboarding |
|-----------------------|-------|---------------------|
| Storage paths | Settings → Storage | New paths apply to future writes; existing content untouched |
| Authority matrix | Series → Approval Authority | Future approvals follow new matrix; in-flight approvals keep their snapshot |
| Episode brief | Episode page → Edit Brief | Allowed only while episode in `BRIEF_DRAFT`; later requires REVISION cycle |

---

## 11. Accessibility & Motion

- All steps must be navigable by keyboard. `Tab` cycles focusable controls;
  `Shift+Tab` reverses. `Enter` activates `Continue →` if the form is valid.
- Stepper progress changes respect `prefers-reduced-motion`: no spring
  animations, instant transitions.
- Dimmed shell uses `opacity: 0.4`, no movement.

---

## 12. API Contract Summary (for Phase 5b)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/onboarding/state` | Returns `{ current_step, completed_steps, draft_series_id, draft_episode_id }` |
| POST | `/api/onboarding/advance` | Body: `{ step, payload }`. Validates and persists step output, advances state. |
| POST | `/api/onboarding/exit` | Body: `{ reason }`. Marks onboarding complete (with or without draft episode). |

Existing endpoints reused:
- `POST /api/storage/config` (step 1)
- `POST /api/series` (step 2 form submit)
- `POST /api/series/[id]/approval-matrix` (step 3, new endpoint flagged for 5b)
- `POST /api/episodes` (step 4 form submit)

---

## 13. Pattern References

| Pattern | Reference |
|---------|-----------|
| 4-step wizard with stepper | Linear "Create your first project", Notion workspace setup |
| Storage configuration step | VS Code "Open Folder", Cursor settings, OBS recording path |
| Authority matrix card | GitHub branch protection rules, Notion permissions |
| Final-step optional skip | Stripe onboarding, Vercel project creation |

---

## 14. Cross-References

- `specs/system/uiux.md` v0.3 — visual host (frame, dim, ambient suppress).
- `specs/system/storage_configuration.md` — step 1 detail.
- `specs/system/dashboard_cockpit.md` — post-onboarding landing.
- `specs/system/director_inbox.md` — where the brief approval surfaces.
- `specs/system/webapp.md` §6.6 — Approval Authority Matrix source.
- `specs/system/character_consistency.md` §3.3 — visual approval lock.
- `CLAUDE.md` §2 + §6 — storage architecture + governance hard limits.

---

*SandyStudio onboarding.md | v0.1 | Status: DRAFT*
