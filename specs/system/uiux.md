# SandyStudio — UI/UX Visual System
## specs/system/uiux.md | v0.2 | DRAFT

---

## 0. How to Use This File

This file is the source of truth for SandyStudio visual design, layout behavior, theme system, approval UX, and ambient background behavior.

When Claude Code changes anything related to:

- visual design;
- page layout;
- color tokens;
- theme presets;
- StudioShell;
- Approval Queue UI;
- Ambient Asset Field;
- asset visual taxonomy;
- visual status chips;
- motion / animation behavior;

Claude Code must first read this file and keep it aligned with implementation.

This file complements:

- `specs/system/webapp.md`
- `specs/system/auth.md`
- `CLAUDE.md`
- `PLAN.md`
- agent and pipeline specifications

The webapp spec defines the machine.
This UI/UX spec defines the cockpit.

---

## 1. Product Feeling

SandyStudio should feel like:

> **Cinematic Production OS**

A calm, premium production control room for AI-media creation.

The visual tone is:

- calm;
- cinematic;
- deep;
- focused;
- intelligent;
- production-grade;
- readable for long sessions;
- not flashy;
- not gamified;
- not hacker-themed.

The user should feel that the studio is alive, but under control.

---

## 2. Core UX Principle

SandyStudio is a **decision system**, not an exploration interface.

The UI must prioritize:

1. fast approval decisions;
2. production status clarity;
3. asset review quality;
4. budget awareness;
5. calm long-session usability.

Visual richness is allowed only when it supports these goals.

---

## 3. Layer Model

The product UI must clearly separate three layers:

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

Current Sprint UI priority:

```text
Approval Queue first
```

### Sprint UI scope

1. Studio Shell
2. Approval Queue MVP
3. Minimal Episode Detail
4. Ambient Asset Field v1 as a subtle non-blocking background
5. Theme system with predefined presets
6. Required schema/config additions for future v2 graph support

### Do not build now

Do not implement in this sprint:

- full interactive asset galaxy;
- draggable graph interface;
- zoomable 3D node map;
- click-to-enter nodes;
- complex 3D navigation;
- heavy WebGL visual effects;
- background as primary navigation;
- full custom theme editor.

---

## 5. Visual Direction

### 5.1 Base style

SandyStudio uses a dark premium cinematic base, but **not pure black**.

Recommended visual character:

```text
Background: slate / blue-graphite / deep cinematic gradients
Panels: translucent dark glass
Borders: soft low-contrast strokes
Highlights: muted blue, indigo, cyan, sand
Danger / blocked: muted red
Approval / pending: warm amber
Success / approved: calm green
```

### 5.2 UI style

Use:

- glass-like cards;
- soft shadows;
- subtle gradients;
- rounded corners;
- thin borders;
- clear typography;
- restrained accent colors;
- high readability;
- low visual fatigue.

Avoid:

- neon-heavy sci-fi;
- Matrix-style code rain;
- aggressive particles;
- glowing overload;
- dense technical clutter;
- excessive animation;
- pure black backgrounds;
- charcoal-heavy UI without slate/blue lift.

---

## 6. Theme System

SandyStudio must not hardcode visual colors directly in components.

The UI uses named theme tokens.

### 6.1 Default theme

The default and recommended v1 theme is:

```text
slate_blue_cinematic
```

Slate Blue Cinematic is the preferred theme because it gives the best balance of:

- premium look;
- calmness;
- readability;
- technological feeling;
- long-session comfort;
- enough depth without becoming too dark.

### 6.2 Theme presets

The app must support switching between predefined themes.

Required presets:

```yaml
themes:
  slate_blue_cinematic:
    label: "Slate Blue Cinematic"
    default: true
    description: "Recommended calm cinematic production theme."

  sand_gold_studio:
    label: "Sand Gold Studio"
    default: false
    description: "Warmer theme for softer long-session work."

  deep_purple_night:
    label: "Deep Purple Night"
    default: false
    description: "Darker creative night-work theme."
```

Do not build a full free-form theme editor yet.

### 6.3 Theme token categories

Each theme must define semantic tokens.

```yaml
theme_tokens:
  background:
    base:
    elevated:
    soft:
    gradient_from:
    gradient_to:

  panel:
    glass_bg:
    glass_bg_strong:
    glass_border:
    glass_border_active:
    glass_blur:
    shadow:
    hover_bg:

  text:
    primary:
    secondary:
    muted:
    inverse:

  accent:
    primary:
    secondary:
    tertiary:
    success:
    warning:
    danger:
    info:

  status:
    draft:
    review:
    revision:
    approved:
    locked:
    blocked:
    running:
    completed:

  ambient:
    node_opacity:
    line_opacity:
    glow_strength:
    motion_intensity:
    parallax_intensity:
```

### 6.4 Component rules

Rules:

- Components must use semantic tokens.
- Raw hex values are allowed only inside theme definitions.
- Do not scatter raw colors inside React components.
- Do not create page-specific colors unless they are mapped to tokens.
- Theme changes must not change layout, workflow, or information hierarchy.
- Ambient background must read from the active theme.
- Status chips and asset badges must read from shared taxonomy and theme tokens.

### 6.5 Recommended implementation

Use CSS variables generated from the active theme.

Example:

```css
:root[data-theme="slate_blue_cinematic"] {
  --bg-base: #0F172A;
  --bg-elevated: #111827;
  --bg-soft: #1E293B;

  --panel-glass-bg: rgba(15, 23, 42, 0.62);
  --panel-glass-bg-strong: rgba(15, 23, 42, 0.78);
  --panel-glass-border: rgba(148, 163, 184, 0.22);
  --panel-glass-border-active: rgba(96, 165, 250, 0.42);

  --text-primary: #E5E7EB;
  --text-secondary: #94A3B8;
  --text-muted: #64748B;

  --accent-primary: #3B82F6;
  --accent-secondary: #6366F1;
  --accent-success: #22C55E;
  --accent-warning: #F59E0B;
  --accent-danger: #EF4444;

  --ambient-node-opacity: 0.34;
  --ambient-line-opacity: 0.10;
  --ambient-glow-strength: 0.22;
  --ambient-motion-intensity: 0.35;
  --ambient-parallax-intensity: 0.25;
}
```

Components should use CSS variables, for example:

```tsx
className="bg-[var(--panel-glass-bg)] text-[var(--text-primary)] border-[var(--panel-glass-border)]"
```

---

## 7. Settings Integration

Add the following to:

```text
Settings → Appearance
```

### 7.1 Theme selector

```text
Theme:
  ○ Slate Blue Cinematic
  ○ Sand Gold Studio
  ○ Deep Purple Night
```

Default:

```text
Slate Blue Cinematic
```

### 7.2 Ambient background selector

```text
Ambient Background:
  ○ On
  ○ Reduced
  ○ Off
```

Default:

```text
On
```

Behavior:

- `On`: subtle background motion and low parallax.
- `Reduced`: static or near-static background, no parallax.
- `Off`: no ambient layer, plain themed background.

### 7.3 Persistence

Persist appearance settings per user if user settings table exists.

If no user settings table exists yet, use local storage as a temporary fallback and document the limitation.

Suggested setting keys:

```text
appearance.theme
appearance.ambientBackground
```

---

## 8. Studio Shell

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

### 8.1 Layout

The shell should provide:

- persistent left navigation;
- top status/search bar;
- main content frame;
- optional contextual right panel;
- background layer behind the main content.

### 8.2 Layering

Use a clear z-index model:

```text
z-0   AmbientAssetField
z-10  background masks / gradients / blur overlays
z-20  main dashboard cards and page content
z-30  drawers / side panels
z-40  approval dialogs / destructive confirmations
```

The background must never capture pointer events unless explicitly enabled for limited hover response.

### 8.3 Sidebar behavior

Sidebar should be:

- stable;
- readable;
- icon + label based;
- visually quiet;
- active section highlighted with soft glow or subtle border;
- never visually louder than current work content.

---

## 9. Dashboard / Control Room

The dashboard is a production overview, not the main Sprint workflow.

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

Dashboard must not become the main development focus before Approval Queue MVP is usable.

---

## 10. Approval Queue MVP

Approval Queue is the first major working UI.

Its decision flow is:

```text
Preview → Context → Decision
```

### 10.1 Layout

Recommended layout:

```text
Left / Center:
  Asset preview

Right:
  Context panel

Bottom or right action area:
  Approval actions
```

### 10.2 Preview area

Must support:

- rendered Markdown preview for `.md`;
- image preview;
- video preview;
- audio preview;
- metadata-only fallback if preview is unavailable.

### 10.3 Context panel

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
- whether this is Director-only, human delegate, or EXEC-DIR-AI permitted.

### 10.4 Decision actions

Required actions:

```text
APPROVE
REQUEST REVISION
REJECT
MARK NEEDS HUMAN TWEAK
```

Rules:

- `REQUEST REVISION` requires a note.
- `REJECT` requires a note.
- `APPROVE` note is optional.
- Visual approvals must clearly show when human approval is required.
- One decision should be possible from one focused screen.

---

## 11. Episode Detail

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

## 12. Approval Authority Matrix

The matrix is functionally correct, but the UI should not feel like a spreadsheet.

Recommended UI:

- card or permission-board layout;
- grouped categories;
- visual categories clearly marked;
- publish row hard-locked;
- delegate fields shown only where relevant;
- episode override shown as a badge.

Visual categories should default to Director approval.

---

## 13. Visual Approval Rule

Visual approvals are special.

### 13.1 Final rule

```text
Visual categories can be delegated to humans only.
EXEC-DIR-AI can review/comment, but cannot final-approve visual categories.
Exception: AUTOTEST mode only.
```

### 13.2 Enforcement

If category is visual and governance mode is not AUTOTEST:

```text
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

## 14. Ambient Asset Field v1

### 14.1 Purpose

Ambient Asset Field is a subtle visual background layer.

It is not primary navigation in v1.

It provides:

- depth;
- mood;
- sense of living production space;
- gentle representation of asset categories;
- visual relief from dense production cards.

### 14.2 Visual behavior

The background should show:

- dark non-black depth;
- abstract floating nodes;
- very thin lines between nodes;
- slight 3D/parallax feeling;
- very slow movement;
- soft hover glow;
- color-coded asset categories.

The animation should be almost invisible during work.

### 14.3 Background intensity rule

Ambient background must remain below visual priority threshold:

```text
opacity: very low
motion speed: very slow
parallax: minimal
glow: subtle
```

Recommended limits:

```yaml
ambient_limits:
  max_line_opacity: 0.12
  max_node_opacity: 0.40
  max_glow_strength: 0.30
  max_parallax_px: 6
  motion_speed: very_slow
```

It must not compete with UI cards.

### 14.4 Interaction rules

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

## 15. Interactive Asset Galaxy v2

This is reserved for a future sprint.

In v2, the ambient layer may become an exploration mode where:

- node = asset;
- line = dependency;
- color = asset type;
- size = importance, cost, or production weight;
- glow = pending approval, running job, or blocked status;
- click = open asset drawer;
- zoom = series → episode → scene → asset.

This must not be implemented in the current sprint.

However, the current sprint should prepare data structures for it.

---

## 16. Asset Visual Taxonomy

Add a shared visual taxonomy to config.

Use this as a starting point:

```yaml
asset_visual_taxonomy:
  SCR:
    label: Script
    color_token: asset_script
  STB:
    label: Storyboard
    color_token: asset_storyboard
  IMG:
    label: Image
    color_token: asset_image
  VID:
    label: Video
    color_token: asset_video
  AUD:
    label: Audio
    color_token: asset_audio
  REV:
    label: Review
    color_token: asset_review
  PRO:
    label: Production
    color_token: asset_production
  STA:
    label: Status
    color_token: asset_status
  BLOCKED:
    label: Blocked
    color_token: asset_blocked
```

Important:

- taxonomy uses color tokens, not raw colors;
- actual colors come from active theme;
- taxonomy is used by badges, cards, ambient nodes, filters, and future graph.

---

## 17. Future Asset Relations

Do not build Interactive Asset Galaxy yet.

But prepare the data model.

Suggested table:

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

---

## 18. Motion and Accessibility

The interface must support reduced motion.

Rules:

- respect `prefers-reduced-motion`;
- disable or heavily reduce parallax when reduced motion is enabled;
- keep cards stable;
- do not move primary content unnecessarily;
- keep background optional;
- all core workflows must remain usable when ambient background is off.

Recommended setting:

```text
Settings → Appearance → Ambient Background: On / Reduced / Off
```

Default:

```text
On, but subtle
```

---

## 19. Implementation Notes

### 19.1 Next.js

The main layout should stay server-rendered where possible.

Interactive visual components that require browser APIs must be client components.

`AmbientAssetField.tsx` should be isolated from the main dashboard rendering tree as much as possible.

### 19.2 Performance

Do not store high-frequency animation state in React state.

If using canvas or WebGL:

- use refs;
- avoid frequent React re-renders;
- throttle pointer interactions;
- pause when tab is hidden;
- provide reduced/off modes.

### 19.3 Recommended implementation path

Current sprint:

```text
CSS / Canvas / very light WebGL acceptable
```

Do not over-engineer.

If using React Three Fiber, keep the scene minimal and avoid continuous expensive rendering.

---

## 20. Component Library

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

  settings/
    AppearanceSettings
    ThemeSelector
    AmbientBackgroundSelector
```

---

## 21. Recommended Optional Addition: Activity Events

The current app has jobs, approvals, budget logs, and analytics reports.

For UI purposes, it will be useful to add a unified event feed.

Add only if it does not overcomplicate the current sprint.

Suggested table:

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

If this is too much for the current sprint, add it to `RoadMap.md` as a near-term task.

---

## 22. Implementation Plan for Claude Code

### Step 1 — Update specs

1. Modify `specs/system/webapp.md`.
2. Add section `6.7 Visual System & Studio Shell`.
3. Create or replace `specs/system/uiux.md` with this file.
4. Fix the visual approval contradiction.
5. Add notes about `asset_relations`, `asset_visual_taxonomy`, and theme system.

### Step 2 — Add theme system

1. Add predefined theme tokens.
2. Add default theme `slate_blue_cinematic`.
3. Add `sand_gold_studio`.
4. Add `deep_purple_night`.
5. Generate CSS variables from active theme.
6. Ensure components use tokens, not raw colors.

### Step 3 — Add Settings controls

Create or update:

```text
Settings → Appearance
```

Add:

```text
Theme selector
Ambient Background selector
```

### Step 4 — Add schema/config preparation

1. Add migration for `asset_relations`.
2. Add visual taxonomy to config.
3. Optionally add `activity_events`, or add it to `RoadMap.md` if too large.

### Step 5 — Create shell components

Create component placeholders:

```text
components/studio-shell/StudioShell.tsx
components/studio-shell/StudioSidebar.tsx
components/studio-shell/StudioTopbar.tsx
components/studio-shell/StudioContentFrame.tsx
components/studio-shell/AmbientAssetField.tsx
```

### Step 6 — Build Approval Queue MVP components

Create or stub:

```text
components/approval/ApprovalQueue.tsx
components/approval/ApprovalPreview.tsx
components/approval/ApprovalContextPanel.tsx
components/approval/ApprovalActions.tsx
components/approval/RevisionRequestDialog.tsx
```

### Step 7 — Integrate shell into App Router

Update:

```text
app/(studio)/layout.tsx
```

So that all studio pages use `StudioShell`.

### Step 8 — Add Ambient Asset Field v1

Implement a subtle background placeholder.

Requirements:

- non-blocking;
- low motion;
- pointer events disabled by default;
- optional hover/parallax only if safe;
- respects reduced motion;
- can be disabled from settings;
- reads from active theme tokens.

Initial implementation may use CSS/canvas/lightweight SVG.

Do not implement real asset graph navigation yet.

### Step 9 — Verify

Run:

```bash
pnpm lint
pnpm build
```

If the repo uses a different package manager or scripts, inspect `package.json` first and use the existing commands.

---

## 23. Acceptance Criteria

The work is complete when:

1. `specs/system/webapp.md` includes the new visual system section.
2. `specs/system/uiux.md` exists and documents the approved UI direction.
3. The contradiction around visual AI approval is resolved.
4. Theme system exists with at least three predefined presets.
5. Slate Blue Cinematic is the default theme.
6. Components use semantic tokens instead of scattered raw colors.
7. Settings includes theme selector.
8. Settings includes ambient background selector.
9. `asset_relations` is added or explicitly deferred.
10. `asset_visual_taxonomy` is added to config or explicitly deferred.
11. Studio shell component structure exists.
12. Ambient background v1 exists as a non-blocking placeholder.
13. Approval Queue remains the sprint priority.
14. No v2 interactive asset galaxy is implemented prematurely.
15. Lint/build pass or failures are documented clearly.

---

## 24. Do Not Do

Do not:

- replace the approved Local-First architecture;
- move UI to Vercel;
- build cloud worker architecture;
- implement full interactive asset galaxy in the current sprint;
- make background the main navigation;
- allow EXEC-DIR-AI to final-approve visual outputs outside AUTOTEST;
- overbuild dashboard before Approval Queue MVP;
- add heavy WebGL without a reduced/off mode;
- hardcode visual colors directly into random components;
- build a full custom theme editor now;
- let theme switching change layout or workflow.

---

## 25. Final Product Rule

SandyStudio must feel like:

```text
A calm cinematic control room where AI can produce,
but humans still approve the creative truth.
```

And structurally:

```text
The system is built for decisions first,
visual exploration second,
and decorative effects last.
```

---

## 26. Required Reminder for CLAUDE.md

Add this section to `CLAUDE.md`:

```markdown
## UI/UX Source of Truth

Before making any visual, layout, theme, animation, shell, dashboard, approval UI, or ambient background change, read:

- `specs/system/uiux.md`

This file is the source of truth for:

- SandyStudio visual direction;
- theme tokens and presets;
- StudioShell structure;
- Approval Queue UX;
- Ambient Asset Field behavior;
- asset visual taxonomy;
- motion/accessibility rules.

Do not hardcode colors directly inside components.
Use semantic theme tokens.

If implementation changes visual behavior, update `specs/system/uiux.md` in the same task.
```

---

## 27. Required Reminder for PLAN.md

Add this to `PLAN.md` under current sprint / implementation notes:

```markdown
## UI/UX Implementation Note

Any task that touches visual UI must keep `specs/system/uiux.md` synchronized.

Before coding visual changes:

1. Read `specs/system/uiux.md`.
2. Confirm the change follows the active theme/token system.
3. Avoid raw hardcoded colors in components.
4. Keep Approval Queue as current UI priority.
5. Do not implement Interactive Asset Galaxy v2 unless explicitly planned.
6. Update `specs/system/uiux.md` if visual rules or behavior change.
```

---

*SandyStudio uiux.md | v0.2 | Status: DRAFT*
