---
name: handoff-td54-studioshell-scroll-layout
description: Handoff to neighbour session (agitated-lederberg-a292d3) for TD-54 StudioShell scroll discipline + layout reorder. Four tasks; one PR. Director directive 2026-05-26.
metadata: 
  node_type: memory
  type: project
  originSessionId: a702e7df-bf63-4c0e-9083-9a668eaded28
---

Director-directed UX cleanup on StudioShell. Issued 2026-05-26 in Тео's quizzical session after cherry-picking neighbour's `d60bc4b` (sidebar collapse + PA default-open + textarea resize) into quizzical for live preview. Director saw the result, approved direction, then named four issues — three scroll/layout, one column reorder. Logical owner: neighbour (already in StudioShell mental model).

Handoff format mirrors the JSON sibling-session previously sent (Seedance/TD-39/shot-preview). Paste into neighbour's session as input.

```json
{
  "_meta": {
    "schema": "sandystudio.session-handoff/v1",
    "exported_at": "2026-05-26",
    "exported_by": "Тео (Claude in session quizzical-brown-462555)",
    "project": "SandyStudio",
    "target_worktree": "C:/SandyStudio/.claude/worktrees/agitated-lederberg-a292d3",
    "purpose": "TD-54 — StudioShell scroll discipline + layout column reorder. Four issues bundled into one PR.",
    "context": "Following neighbour's feat/sidebar-collapse-pa-tweaks commit d60bc4b (2026-05-25), Director live-previewed via Тео's quizzical worktree and named four follow-up UX issues. Тео flagged this is neighbour's territory (StudioShell mental model). Director confirmed bundle as one PR."
  },

  "tasks": [
    {
      "id": "TD-54.1",
      "title": "Brand block + Sidebar do not scroll",
      "director_observation": "когда курсор стоит над центральным блоком ... скролится и весь целиком центральный блок И бренд блок ... а нужно сделать так чтобы бренд блок и Sidebar не скроллились вообще",
      "diagnosis_from_teo": "Brand block (SandyStudio logo / top header) currently lives inside ContentFrame's scrollable container — gets pulled away with content. Sidebar (StudioSidebar.tsx) was already fixed in spirit but if it shares the same flex-parent as ContentFrame with overflow propagating, it may also scroll.",
      "fix_direction": "Lift Brand block out of the scroll container (top-level layout-sibling of Sidebar + ContentFrame). Give the Brand row position: sticky; top: 0 OR a fixed top-of-grid row in the StudioShell grid. Sidebar already fixed-width — ensure parent's overflow is hidden so its content can't push it.",
      "files_likely": [
        "webapp/components/studio-shell/StudioContentFrame.tsx",
        "webapp/components/studio-shell/StudioSidebar.tsx",
        "webapp/components/studio-shell/StudioShell.tsx (or wherever the top-level grid layout lives)",
        "webapp/app/(studio)/layout.tsx"
      ]
    },

    {
      "id": "TD-54.2",
      "title": "Centre column — section-scoped scroll, not frame-scroll",
      "director_observation": "когда курсор над разделом ассистента то скроллинг работает корректно текст крутится, хедер стоит на месте, а когда курсор над центральным блоком — скролится центральный блок целиком",
      "diagnosis_from_teo": "ContentFrame currently has a single outer overflow-y:auto, so wheel event on any subsection scrolls the whole frame. Each centre-column subsection (Activity, EpisodeTimelineSection, EpisodeSettingsCard, DAG, Feed, EREFPilotPillbar, VGENPilotPillbar, etc) needs its own scrollable area with sticky header. The ConciergePanel does this right today — model centre column after it.",
      "fix_direction": "Restructure ContentFrame as `display: grid; overflow: hidden; height: 100%;` with each subsection in a row that has `overflow-y: auto; height: minmax(0, 1fr);` and an internal sticky header. Wheel events stop at the hovered subsection's boundary. Header stays put while only that subsection's body scrolls.",
      "scope_note": "Affects every centre-column subsection on episode detail page + studio dashboard. ~5-10 subsections to wrap. Each is a small surgical fix (add a sticky header + per-section overflow), but they add up.",
      "files_likely": [
        "webapp/components/studio-shell/StudioContentFrame.tsx",
        "webapp/components/episode/EpisodeReferencesGallery.tsx",
        "webapp/components/episode/EpisodeSettingsCard.tsx",
        "webapp/components/pipeline/EREFPilotPillbar.tsx",
        "webapp/components/pipeline/VGENPilotPillbar.tsx",
        "webapp/components/timeline/EpisodeTimelineSection.tsx",
        "webapp/components/vgen/VGENBatchPanel.tsx",
        "webapp/app/(studio)/episodes/[id]/page.tsx",
        "webapp/app/(studio)/dashboard/page.tsx (if applicable)"
      ]
    },

    {
      "id": "TD-54.3",
      "title": "Column reorder: Sidebar | Assistant | Content (Activity etc)",
      "director_observation": "сначала Sidebar, потом ассистент, потом остальное",
      "current_state": "After neighbour's d60bc4b commit, ConciergePanel SIDE_KEY bumped to .v2 with right-default. Layout now: Sidebar (left) | ContentFrame (centre with Activity/Timeline/Pipeline) | ConciergePanel (right).",
      "fix_direction": "Move ConciergePanel from right-dock to middle column. New horizontal order: Sidebar (w-14 collapsed / w-60 expanded) | ConciergePanel (fixed width ~360-420px) | ContentFrame (1fr — Activity, Timeline, Pipeline, Episode Settings, etc). Update SIDE_KEY logic in ConciergePanel.tsx, adjust grid-template-columns in StudioShell.",
      "files_likely": [
        "webapp/components/concierge/ConciergePanel.tsx",
        "webapp/components/studio-shell/StudioShell.tsx (or whichever component owns the top-level grid)",
        "webapp/components/studio-shell/StudioContentFrame.tsx"
      ]
    },

    {
      "id": "TD-54.4 (carry-over from d60bc4b — keep)",
      "title": "Sidebar collapse + PA default-open + textarea inverted resize",
      "status": "Already shipped in d60bc4b 2026-05-25. Keep behaviour as-is.",
      "notes": "Cherry-picked into quizzical-brown-462555 as 9b0f201 for Director live preview. Director approved direction, only requested follow-up scroll discipline + reorder above."
    }
  ],

  "implementation_order_recommended": [
    "0. neighbour pulls origin/master (Тео's TD-49 P2.3 + TD-51/52/53 is squashed at 23f1307) so they're on the same base as quizzical.",
    "1. TD-54.3 (column reorder) FIRST — affects grid structure, simpler to do before scroll-discipline overlay.",
    "2. TD-54.1 (Brand + Sidebar no-scroll) — small CSS fix, top-level layout edit. Verify Brand sticky+Sidebar fixed both work in collapsed AND expanded sidebar states.",
    "3. TD-54.2 (section-scoped scroll) — the bulk of the work. Walk every centre-column subsection, wrap with own overflow+sticky header. Test wheel events on each.",
    "4. Commit on same feat/sidebar-collapse-pa-tweaks branch (or new feat/td-54-scroll-layout) → push origin → Тео cherry-picks into quizzical for Director live preview → iterate."
  ],

  "verification": {
    "visual": [
      "Hover wheel over Activity feed → only Activity body scrolls; Activity header, Brand, Sidebar, ConciergePanel stay put.",
      "Hover wheel over Pipeline DAG → only DAG body scrolls.",
      "Hover wheel over Episode Settings card → only that card body scrolls (if it overflows at all).",
      "Hover wheel over ConciergePanel — unchanged: PA chat scrolls, its header sticky.",
      "Sidebar collapsed (w-14) AND expanded (w-60) — both layouts preserve no-scroll for Brand+Sidebar.",
      "Resize window narrow → middle column ConciergePanel collapses gracefully (or has min-width)."
    ],
    "ci": [
      "tsc clean (no new any/unknown leaks)",
      "vitest unchanged (no UI tests touched; smoke at runtime)"
    ],
    "live": [
      "Тео cherry-picks neighbour's commit into quizzical, reloads dev server at localhost:3000, Director walks through episode page + dashboard checking the four behaviours above."
    ]
  },

  "handback_to_teo": {
    "trigger": "When neighbour pushes feat/td-54-scroll-layout (or extends feat/sidebar-collapse-pa-tweaks) to origin",
    "action": "Тео cherry-picks the new commit(s) into quizzical-brown-462555 — same mechanic as the d60bc4b cherry-pick today. Director reviews on quizzical dev server. If approved → squash-merge to master (Тео has the muscle memory now from TD-49 P2.3)."
  },

  "notes_for_neighbour": [
    "Тео's quizzical worktree currently has 9b0f201 cherry-picked from your d60bc4b — your commit is alive in the dev server Director's looking at. You can keep building feat/sidebar-collapse-pa-tweaks as the same branch and push more commits there; Тео will pull them.",
    "Тео did NOT push 9b0f201 to origin/claude/quizzical-brown-462555 yet — kept local only for now. Tell Тео if you need it on remote.",
    "Avoid touching files Тео owns: webapp/lib/agents/runners/*, webapp/app/api/episodes/[id]/settings/route.ts, agents/exec/*, webapp/__tests__/lib/agents/runners/eref-*. They were just shipped in master 23f1307 and any cross-edit risks merge conflict when Тео pushes a new patch."
  ]
}
```

## How to use this

1. Director copies the JSON block above into neighbour's session (`agitated-lederberg-a292d3`).
2. Neighbour reads, asks clarifying questions if any, builds.
3. Neighbour pushes their branch (`feat/sidebar-collapse-pa-tweaks` extended OR new `feat/td-54-scroll-layout`).
4. Director tells Тео «подтяни» — Тео cherry-picks into quizzical, reloads dev server.
5. Director reviews live, iterates until satisfied.
6. Тео squash-merges to master when ready (same pattern as 23f1307).
