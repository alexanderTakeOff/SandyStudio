# SandyStudio — UI/UX Integration Patch for Claude Code

## File purpose

This document is a task brief for Claude Code.

It extends the current SandyStudio web application specification:

- `specs/system/webapp.md | v0.1 | DRAFT`

The goal is to integrate the approved UI/UX direction into the existing architecture without disrupting the current Local-First, Next.js, Inngest, Supabase, and approval-driven production model.

---

## 1. Context

SandyStudio is an AI-media production studio web application.

The existing webapp spec already defines:

- Local-first deployment
- Next.js 15 App Router
- Inngest worker
- Supabase database
- Agent job execution model
- Episode state machine
- Asset lifecycle
- Approval queue
- Approval Authority Matrix
- Budget tracking
- Remote access through Tailscale

The architecture is generally approved.

This patch focuses specifically on the **visual system, UI/UX structure, background layer, and future-ready asset graph preparation**.

---

## 2. Approved Product UI Direction

The approved UI direction is:

> **Cinematic Production OS**

SandyStudio should feel like a calm, premium, cinematic production control room for AI-media creation.

It must not feel like:

- a generic SaaS dashboard;
- a hacker console;
- a gaming UI;
- a static admin panel;
- a decorative 3D toy.

The interface should communicate:

- production control;
- human approval authority;
- AI-assisted creative workflow;
- budget awareness;
- calm technical depth;
- high-end creative studio atmosphere.

---

## 3. Core UI Principle

The product must clearly separate three layers:

```text
1. Primary Work Layer
   Dashboard cards, approval panels, pipeline, asset previews, budget, jobs.

2. Ambient Layer
   Subtle background depth field with abstract nodes and lines.

3. Future Exploration Layer
   Interactive asset/dependency graph or "asset galaxy" in v2.
```

The ambient layer must never block or slow core workflows.

The approval flow remains the highest-priority UX path.

---

## 4. Sprint Priority

The existing spec already states:

```text
W-003 | First UI sprint scope | B) Approval queue first
```

Respect this decision.

### Sprint 9 UI scope should be:

1. Studio Shell
2. Approval Queue MVP
3. Minimal Episode Detail
4. Ambient Asset Field v1 as a subtle non-blocking background
5. UI/UX specification file
6. Required schema/config additions for future v2 graph support

### Do not build in Sprint 9:

- full interactive asset galaxy;
- draggable graph interface;
- zoomable 3D node map;
- click-to-enter nodes;
- complex 3D navigation;
- heavy WebGL visual effects;
- background as primary navigation.

---

## 5. Required Spec Changes

### 5.1 Update `specs/system/webapp.md`

Add the following section after `6.6 Approval Authority Matrix`.

```markdown
### 6.7 Visual System & Studio Shell

The SandyStudio UI follows the "Cinematic Production OS" direction:
a calm, premium, dark production dashboard for AI-media creation.

The UI must separate:

- primary work layer: dashboard cards, approvals, pipeline, asset previews;
- ambient layer: subtle background depth field;
- future exploration layer: interactive asset graph / asset galaxy.

V1 uses the Ambient Asset Field as a non-critical decorative and atmospheric layer.
V2 may upgrade the same conceptual layer into an Interactive Asset Galaxy, where nodes
represent real assets and dependencies.

The background layer must never block core workflows, degrade approval speed, or become
the primary navigation in Sprint 9.

Sprint 9 UI priority remains Approval Queue first.
The dashboard may exist as a basic shell/summary screen, but the primary working MVP is
the approval decision flow.
```

---

## 6. New UI/UX Spec File

Create a new file:

```text
specs/system/uiux.md
```

Use the following content as the initial version.

```markdown
# SandyStudio — UI/UX Visual System
## specs/system/uiux.md | v0.1 | DRAFT

---

## 1. Purpose

This document defines the visual system, UI layout principles, component priorities,
motion rules, and future interaction model for the SandyStudio web application.

It complements:

- `specs/system/webapp.md`
- `specs/system/auth.md`
- agent and pipeline specifications

The webapp spec defines the machine.
This UI/UX spec defines the cockpit.

---

## 2. Product Feeling

SandyStudio should feel like:

> Cinematic Production OS

A premium production control room for AI-media creation.

The visual tone is:

- calm;
- cinematic;
- deep;
- focused;
- intelligent;
- production-grade;
- not flashy;
- not gamified;
- not hacker-themed.

The user should feel that the studio is alive, but under control.

---

## 3. Visual Direction

### 3.1 Base style

Use a dark but not black base.

Recommended palette direction:

```text
Background: deep charcoal / dark slate
Panels: translucent dark glass
Borders: soft low-contrast strokes
Highlights: muted cyan, soft indigo, warm sand
Danger / blocked: muted red
Approval / pending: warm amber
Success / approved: calm green
```

### 3.2 UI style

Use:

- glass-like cards;
- soft shadows;
- subtle gradients;
- rounded corners;
- thin borders;
- clear typography;
- restrained accent colors.

Avoid:

- neon-heavy sci-fi;
- Matrix-style code rain;
- aggressive particles;
- glowing overload;
- dense technical clutter;
- excessive animation.

---

## 4. Studio Shell

The core shell should include:

```text
StudioShell
├── StudioSidebar
├── StudioTopbar
├── AmbientAssetField
└── StudioContentFrame
```

Recommended component structure:

```text
components/
  studio-shell/
    StudioShell.tsx
    StudioSidebar.tsx
    StudioTopbar.tsx
    AmbientAssetField.tsx
    StudioContentFrame.tsx
```

### 4.1 Layout

The shell should provide:

- persistent left navigation;
- top status/search bar;
- main content frame;
- optional contextual right panel;
- background layer behind the main content.

### 4.2 Layering

Use a clear z-index model:

```text
z-0   AmbientAssetField
z-10  background masks / gradients / blur overlays
z-20  main dashboard cards and page content
z-30  drawers / side panels
z-40  approval dialogs / destructive confirmations
```

The background must never capture pointer events unless explicitly enabled for limited hover response.

---

## 5. Dashboard / Control Room

The dashboard is a production overview, not the main Sprint 9 workflow.

Recommended sections:

- Active Episodes
- Pipeline Status
- Pending Approvals
- Budget Snapshot
- Recent Jobs
- Output Queue
- System Health

Dashboard should answer:

```text
What is active?
What needs my decision?
What is running?
What is blocked?
How much have we spent?
```

---

## 6. Approval Queue MVP

Approval Queue is the first major working UI.

Its decision flow is:

```text
Preview → Context → Decision
```

### 6.1 Layout

Recommended layout:

```text
Left / Center:
  Asset preview

Right:
  Context panel

Bottom or right action area:
  Approval actions
```

### 6.2 Preview area

Must support:

- rendered Markdown preview for `.md`;
- image preview;
- video preview;
- audio preview;
- metadata-only fallback if preview is unavailable.

### 6.3 Context panel

Show:

- episode code;
- asset filename;
- asset type;
- version;
- status;
- producing agent;
- review notes;
- revision log;
- cost if available;
- related job;
- required approver;
- governance mode;
- whether this is Director-only, delegate, or EXEC-DIR-AI permitted.

### 6.4 Decision actions

Required actions:

```text
APPROVE
REQUEST REVISION
REJECT
MARK NEEDS HUMAN TWEAK
```

For `REQUEST REVISION`, require a note.

For `REJECT`, require a note.

For `APPROVE`, note is optional.

Visual approvals should make it very clear when human approval is required.

---

## 7. Episode Detail

Episode Detail should behave like mission control for one episode.

Recommended structure:

- top status header;
- horizontal pipeline;
- current gate panel;
- assets summary;
- pending approvals;
- job timeline;
- budget mini-widget.

The current gate should always be visually dominant.

---

## 8. Approval Authority Matrix

The current table-based concept is functionally correct, but the UI should not feel like a spreadsheet.

Recommended UI:

- card or permission-board layout;
- grouped categories;
- visual categories clearly marked;
- publish row hard-locked;
- delegate fields shown only where relevant;
- episode override shown as a badge.

Visual categories should default to Director approval.

---

## 9. Ambient Asset Field v1

### 9.1 Purpose

Ambient Asset Field is a subtle visual background layer.

It is not primary navigation in v1.

It provides:

- depth;
- mood;
- sense of living production space;
- gentle representation of asset categories;
- visual relief from dense production cards.

### 9.2 Visual behavior

The background should show:

- dark non-black depth;
- abstract floating nodes;
- very thin lines between nodes;
- slight 3D/parallax feeling;
- very slow movement;
- soft hover glow;
- color-coded asset categories.

The animation should be almost invisible during work.

Recommended color mapping:

```yaml
asset_visual_taxonomy:
  SCR:
    label: Script
    color: muted_blue
  STB:
    label: Storyboard
    color: soft_indigo
  IMG:
    label: Image
    color: soft_sand
  VID:
    label: Video
    color: muted_violet
  AUD:
    label: Audio
    color: muted_green
  REV:
    label: Review
    color: warm_amber
  PRO:
    label: Production
    color: muted_cyan
  STA:
    label: Status
    color: slate
  BLOCKED:
    label: Blocked
    color: muted_red
```

### 9.3 Interaction rules

Allowed in v1:

- very subtle parallax on mouse movement;
- slight hover glow near cursor;
- no navigation;
- no click actions;
- no asset drill-down;
- no required interaction.

Not allowed in v1:

- graph editing;
- node dragging;
- zooming;
- opening assets from nodes;
- background replacing the main UI;
- heavy constant rendering.

---

## 10. Interactive Asset Galaxy v2

This is reserved for a future sprint.

In v2, the ambient layer may become an exploration mode where:

- node = asset;
- line = dependency;
- color = asset type;
- size = importance, cost, or production weight;
- glow = pending approval, running job, or blocked status;
- click = open asset drawer;
- zoom = series → episode → scene → asset.

This must not be implemented in Sprint 9.

However, Sprint 9 should prepare data structures for it.

---

## 11. Motion and Accessibility

The interface must support reduced motion.

Rules:

- respect `prefers-reduced-motion`;
- disable or heavily reduce parallax when reduced motion is enabled;
- keep cards stable;
- do not move primary content unnecessarily;
- keep background optional.

Recommended setting:

```text
Settings → Appearance → Ambient Background: On / Reduced / Off
```

Default:

```text
On, but subtle
```

---

## 12. Implementation Notes

### 12.1 Next.js

The main layout should stay server-rendered where possible.

Interactive visual components that require browser APIs must be client components.

`AmbientAssetField.tsx` should be isolated from the main dashboard rendering tree as much as possible.

### 12.2 Performance

Do not store high-frequency animation state in React state.

If using canvas or WebGL:

- use refs;
- avoid frequent React re-renders;
- throttle pointer interactions;
- pause when tab is hidden;
- provide reduced/off modes.

### 12.3 Recommended implementation path

Sprint 9:

```text
CSS / Canvas / very light WebGL acceptable
```

Do not over-engineer.

If using React Three Fiber, keep the scene minimal and avoid continuous expensive rendering.

---

## 13. Component Library

Required component families:

```text
components/
  ui/
    Card
    Badge
    Button
    Tabs
    Dialog
    Drawer
    Tooltip
    Progress
    StatusChip

  studio-shell/
    StudioShell
    StudioSidebar
    StudioTopbar
    StudioContentFrame
    AmbientAssetField

  approval/
    ApprovalQueue
    ApprovalPreview
    ApprovalContextPanel
    ApprovalActions
    RevisionRequestDialog

  pipeline/
    EpisodePipeline
    GateStatusChip
    CurrentGatePanel

  budget/
    BudgetSnapshot
    BudgetLogTable
    CostBadge

  assets/
    AssetCard
    AssetPreview
    AssetStatusBadge
```

---

## 14. UX Success Criteria

The Sprint 9 UI is successful if:

- the Director can see pending approvals immediately;
- the Director can preview an asset without hunting for files;
- the Director can approve/request revision/reject in one focused screen;
- the current episode gate is obvious;
- the UI feels like SandyStudio, not generic SaaS;
- the ambient background improves mood but does not distract;
- disabling motion does not break the experience;
- the system is prepared for future asset graph features without implementing them now.

---

*SandyStudio uiux.md | v0.1 | Status: DRAFT*
```

---

## 7. Required Logic Correction: Visual Approval Authority

There is a contradiction in the current spec.

Current spec says both:

1. `is_visual=true blocks AI approval always`
2. EXEC-DIR-AI may auto-approve visual categories if the Director explicitly configured it

Resolve this contradiction.

### Recommended resolution

Use this rule:

```text
Visual categories can be delegated to humans only.
EXEC-DIR-AI can review/comment, but cannot final-approve visual categories.
Exception: AUTOTEST mode only.
```

### Required change

Update the `approval_authority` rules and governance enforcement accordingly.

Recommended rule:

```text
If category is visual and governance_mode is not AUTOTEST:
  final approver must be Director or human_delegate.
  EXEC-DIR-AI may produce review notes but cannot create final approval.
```

Visual categories include:

```text
character_visual
location_ref
generated_shots
thumbnails
```

`PUBLISH` remains hard-locked to Director only in all modes.

---

## 8. Required Database / Config Preparation for Future Asset Galaxy

Do not build Interactive Asset Galaxy in Sprint 9.

But prepare the data model.

### 8.1 Add `asset_relations`

Add migration:

```sql
CREATE TABLE IF NOT EXISTS asset_relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_asset_id uuid REFERENCES assets(id),
  target_asset_id uuid REFERENCES assets(id),
  relation_type text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asset_relations_source
ON asset_relations(source_asset_id);

CREATE INDEX IF NOT EXISTS idx_asset_relations_target
ON asset_relations(target_asset_id);
```

Recommended `relation_type` values:

```text
derives_from
depends_on
replaces
references
version_of
blocks
unblocks
```

### 8.2 Add visual taxonomy config

Add to `config/defaults.yaml` or relevant config file:

```yaml
asset_visual_taxonomy:
  SCR:
    label: Script
    color: muted_blue
  STB:
    label: Storyboard
    color: soft_indigo
  IMG:
    label: Image
    color: soft_sand
  VID:
    label: Video
    color: muted_violet
  AUD:
    label: Audio
    color: muted_green
  REV:
    label: Review
    color: warm_amber
  PRO:
    label: Production
    color: muted_cyan
  STA:
    label: Status
    color: slate
  BLOCKED:
    label: Blocked
    color: muted_red
```

This taxonomy should be used later by:

- badges;
- asset cards;
- status chips;
- ambient nodes;
- future asset galaxy;
- filters.

---

## 9. Recommended Optional Addition: Activity Events

The current spec has jobs, approvals, budget logs, and analytics reports.

For UI purposes, it will be useful to add a unified event feed.

Add only if it does not overcomplicate Sprint 9.

### Suggested table

```sql
CREATE TABLE IF NOT EXISTS activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id uuid REFERENCES episodes(id),
  asset_id uuid REFERENCES assets(id),
  job_id uuid REFERENCES jobs(id),
  event_type text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  description text,
  actor text,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_events_episode
ON activity_events(episode_id, created_at DESC);
```

Suggested event types:

```text
job_started
job_completed
job_failed
asset_submitted
approval_requested
approval_granted
revision_requested
asset_rejected
budget_threshold_reached
publish_pending
published
```

If this is too much for Sprint 9, add it to RoadMap.md as a near-term task.

---

## 10. Implementation Plan for Claude Code

### Step 1 — Update specs

1. Modify `specs/system/webapp.md`
2. Add section `6.7 Visual System & Studio Shell`
3. Create `specs/system/uiux.md`
4. Fix the visual approval contradiction
5. Add notes about asset_relations and visual taxonomy

### Step 2 — Add schema/config preparation

1. Add migration for `asset_relations`
2. Add visual taxonomy to config
3. Optionally add `activity_events`, or add it to RoadMap.md if too large

### Step 3 — Create shell components

Create component placeholders:

```text
components/studio-shell/StudioShell.tsx
components/studio-shell/StudioSidebar.tsx
components/studio-shell/StudioTopbar.tsx
components/studio-shell/StudioContentFrame.tsx
components/studio-shell/AmbientAssetField.tsx
```

### Step 4 — Build Approval Queue MVP components

Create or stub:

```text
components/approval/ApprovalQueue.tsx
components/approval/ApprovalPreview.tsx
components/approval/ApprovalContextPanel.tsx
components/approval/ApprovalActions.tsx
components/approval/RevisionRequestDialog.tsx
```

### Step 5 — Integrate shell into App Router

Update:

```text
app/(studio)/layout.tsx
```

So that all studio pages use `StudioShell`.

### Step 6 — Add Ambient Asset Field v1

Implement a subtle background placeholder.

Requirements:

- non-blocking;
- low motion;
- pointer events disabled by default;
- optional hover/parallax only if safe;
- respects reduced motion;
- can be disabled later from settings.

Initial implementation may use CSS/canvas/lightweight SVG.

Do not implement real asset graph navigation yet.

### Step 7 — Verify

Run:

```bash
pnpm lint
pnpm build
```

If the repo uses a different package manager or scripts, inspect `package.json` first and use the existing commands.

---

## 11. Acceptance Criteria

The work is complete when:

1. `specs/system/webapp.md` includes the new visual system section.
2. `specs/system/uiux.md` exists and documents the approved UI direction.
3. The contradiction around visual AI approval is resolved.
4. `asset_relations` is added or explicitly deferred.
5. `asset_visual_taxonomy` is added to config or explicitly deferred.
6. Studio shell component structure exists.
7. Ambient background v1 exists as a non-blocking placeholder.
8. Approval Queue remains the Sprint 9 priority.
9. No v2 interactive asset galaxy is implemented prematurely.
10. Lint/build pass or failures are documented clearly.

---

## 12. Do Not Do

Do not:

- replace the approved Local-First architecture;
- move UI to Vercel;
- build cloud worker architecture;
- implement full interactive asset galaxy in Sprint 9;
- make background the main navigation;
- allow EXEC-DIR-AI to final-approve visual outputs outside AUTOTEST;
- overbuild dashboard before Approval Queue MVP;
- add heavy WebGL without a reduced/off mode;
- hardcode visual colors directly into random components if taxonomy config exists.

---

## 13. Final Product Rule

SandyStudio must feel like:

```text
A calm cinematic control room where AI can produce,
but humans still approve the creative truth.
```
