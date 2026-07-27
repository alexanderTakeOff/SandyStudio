---
name: backlog-td36-studio-shell-ergonomics
description: "TD-36 backlog — StudioShell layout/scroll/collapse ergonomics. 3 fixes dictated by Director 2026-05-22 evening. Not urgent, just-don't-forget."
metadata: 
  node_type: memory
  type: project
  originSessionId: ebea9132-e98d-4ed0-bead-18d57a73fe0d
---

# TD-36 — Studio Shell ergonomics (3 fixes)

**Status:** Backlog. Not urgent. Director-dictated 2026-05-22 evening to «just-don't-forget».
**Scope:** `webapp/components/shell/*` + relevant CSS / Tailwind. Probably touches `StudioShell.tsx`, `Sidebar.tsx`, `ConciergePanel.tsx`, episode/content page layout.
**Source-of-truth doc to update on touch:** `specs/system/uiux.md` (per CLAUDE.md §7.5).

---

## Fix 1 — Independent scroll for References-by-shot block

**Problem (verbatim):** «если я начинаю скролить чтобы посмотреть кадры которые там внизу скрыты за низом экрана у меня уходит всё вверх вместе со столбцами за исключением окошка ассистента».

**Behaviour now:** Concierge panel is sticky/independent. Everything else (Sidebar, Topbar, content header) scrolls away when Director scrolls within the References-by-shot grid.

**Wanted behaviour:** Only the References-by-shot block itself scrolls internally. Sidebar + Topbar + Concierge all remain pinned. Likely fix: pin shell chrome (`position: sticky` or grid-template-rows with `overflow: hidden` on shell + `overflow-y: auto` only on content-scroll-container). Container around References-by-shot becomes the only scrollable region.

---

## Fix 2 — Re-order shell columns: Sidebar | Concierge | Content

**Problem:** Concierge (Polина) is currently on the right edge. Director wants it center-stage.

**Wanted layout:**

| Position | Block | Notes |
|---|---|---|
| **LEFT** | Sidebar (SandyStudio logo + Inbox / Серии / Спринты / etc.) | Same as today, just stays on left |
| **CENTER** | Concierge / Polина panel | Move from right edge |
| **RIGHT** | All remaining content blocks (episodes list, budget, references grid, etc.) | Move from center to right side |

**Implication:** Concierge becomes the focal column. Probably needs width re-tuning — Concierge is narrower than the current content area, so the «right column» (former content area) keeps a usable width on standard monitor. May need a different breakpoint strategy.

---

## Fix 3 — Collapsible Sidebar with hover-revealed toggle

**Problem (verbatim):** «к блоку где у нас надпись типа эпизоды бюджет и так далее добавил бы появляющуюся при наведении на верхний блок кнопочку чтобы можно было бы свернуть в узкую полоску чтобы она не занимала лишнего места чтобы оставались только пиктограммы значок SandyStudio».

**Interpretation (CHECK WITH DIRECTOR ON SCREENSHOT — wording ambiguous between Sidebar vs. an episode/budget content block):**
- Most likely target: the **Sidebar** itself (since Fix 2 just moved it to LEFT and the user wants more horizontal real estate for the new Center+Right columns).
- A small toggle button appears on hover over the **top of the Sidebar** (where the «SandyStudio» logo sits).
- Click → Sidebar collapses to an icon-only narrow strip. Only icons + SandyStudio logo glyph remain visible.
- Click again (or hover-expand?) → Sidebar restores.

**Open question:** Does the collapsed-to-icons state persist across page navigations / sessions (localStorage), or session-only?

---

## What to do when picking this up

1. Director will paste the screenshot referenced in the dictation — re-read it before starting Fix 3 (the «блок с надписью эпизоды бюджет» wording is ambiguous between Sidebar and a content block; screenshot will resolve).
2. Update `specs/system/uiux.md` in the same commit — this changes StudioShell structure (Sidebar + Topbar + ContentFrame + Concierge layout).
3. Verify ambient asset field, approval queue, and Polина's auto-react chips all still render correctly after re-order.
4. Touch theme tokens only if the visual direction shifts; otherwise keep `slate_blue_cinematic` defaults.
5. Director-gate before LOCKED: no `===5===` writes to project content from this work, but it does touch `specs/system/uiux.md` which is governed.

## Cross-references

- [[backlog-td32-td33-continuity-and-attempts]] — separate backlog (continuity-stability)
- `specs/system/uiux.md` — source of truth for shell structure
- Relates to [[plan-md-living-anchor]] — TD-36 will need a PLAN.md row when scheduled.
