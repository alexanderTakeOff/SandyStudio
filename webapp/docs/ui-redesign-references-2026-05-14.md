# SandyStudio UI Redesign — Reference Brief

**Date:** 2026-05-14
**Author:** Research pass via WebSearch / WebFetch
**Director brief:** "Мне нравится UI8 с пилюлями кнопками и прозрачностью и glow эффектами"
**Goal:** Cinematic, premium, production-OS feel. Pill buttons, frosted glass surfaces, subtle neon glow, parallax depth × 3. NOT toy / gamified / hacker.

---

## 1. Aesthetic North Star

SandyStudio should read like a **disciplined production console** in the same family as Linear's "Liquid Glass" refresh, Frame.io v4, and Vercel's Geist — not a flashy SaaS marketing landing. Surfaces are dark, warm-gray (not blue-cold), with a thin, single-layer frosted glass on chrome (sidebar, top bar, drawers, modals). Content cards sit on a deeper substrate, layered with a 1px white/10 inner highlight and a soft cool-blue ambient bloom that lives BEHIND content (deep purple / cyan orbs, low frequency, never a noise gradient). Buttons are pills (radius 999px) in two weights: solid accent for primary actions, translucent ghost for everything else. Glow is restrained — it lives on the focus ring of the active primary CTA and on the rim of an APPROVED status pill, not on every element. Motion is fluid but instant: 150–300ms ease-out-expo, springs only on direct manipulation. Reduce blur and motion when the OS says so. The whole thing should look like Logan Roy uses it, not a Discord overlay.

---

## 2. Tier 1 — Top 4 References (closest match)

### T1-A. Linear — "A Linear spin on Liquid Glass" (Oct 2025 refresh)
- **What it is:** Linear's bespoke glass material — explicitly NOT Apple's consumer Liquid Glass. "ProKit philosophy: purpose-built, disciplined, designed for sustained focus."
- **URL:** https://linear.app/now/linear-liquid-glass , https://linear.app/now/behind-the-latest-design-refresh
- **Tokens to steal:**
  - Layered glass recipe: Gaussian-blur base + gradient overlay + specular-highlight shader on **Plus-Lighter** blend, masked by SDF with subtle shadow.
  - **No refraction** ("makes dense professional UIs harder to read") — straight blur + saturate only.
  - Variable scroll-edge blur (intensifies near edges) layered with soft color mask.
  - Warm-gray surface palette (shifted from cool blue), softer borders, smaller icon-only pills in nav.
  - Solid outline fallback when "Increase Contrast" is on.
- **Why it fits:** Linear is the canonical production-OS feel — disciplined, content-first, but with cinematic depth. SandyStudio's Approval Queue and Pipeline DAG should feel exactly like this.
- **Steal specifically:** the pill/tab family in the new sidebar, scroll-edge variable blur, motion principles (tap = lift + pulse, drag-beyond-edge = subtle distortion).

### T1-B. OpsPulse — AI Operations & Compliance SaaS Dashboard (Orbix Studio, Feb 2026)
- **What it is:** Frosted-glass AI agent monitoring dashboard — the closest visual cousin to SandyStudio's actual product (multi-agent pipeline, approval gates, activity feed).
- **URL:** https://dribbble.com/shots/27131271-OpsPulse-AI-Operations-Compliance-SaaS-Dashboard-Design , gallery: https://me.muz.li/orbix-studio/opspulse-ai-operations-compliance-saas-dashboard-design
- **Tokens to steal:**
  - Frosted-glass cards over a vibrant blurred ambient background (deep purple + cyan orbs).
  - High-contrast data cards layered on the glass — content stays readable.
  - Pill-shaped status chips for agent state.
- **Why it fits:** Same product shape — AI agents, gates, monitoring. Proves the look works for dense operational data, not just hero sections.
- **Steal specifically:** the ambient-orb background layer, glass-on-glass card stacking, status-pill family.

### T1-C. Vaulto — Cinematic Crypto/Asset Dashboard (Orbix Studio)
- **What it is:** "Dark, cinematic aesthetic. Deep charcoal background. High-contrast typography."
- **URL:** https://me.muz.li/orbix-studio/vaulto-finance-dashboard-design-3
- **Tokens to steal:**
  - Deep charcoal `#0E0F12`-ish substrate (not pure black, not gray).
  - Editorial-scale display type for headline KPIs, tight body type for data tables.
  - Restrained accent — one cool blue, one warm amber, nothing else.
- **Why it fits:** The "Волга газ-24" antidote — premium, opinionated, not generic SaaS card grid.
- **Steal specifically:** type hierarchy for Budget / Jobs / KPI surfaces, the disciplined two-accent palette.

### T1-D. UI8 — MagicDraft AI & SaaS Dashboard Kit (Dark Mode)
- **What it is:** A **buyable** UI8 kit (50+ screens) in the exact aesthetic Director called out. Dark mode, pill buttons, glassmorphism panels, glow accents.
- **URL:** https://ui8.net/htpvvv3/products/magicdraft---ai--saas-dashboard-ui-kit-dark-mode
- **Tokens to steal:**
  - Whole pill-button family (rest/hover/active/disabled in two weights).
  - Card and modal frost recipe.
  - Sidebar with icon-label pills.
- **Why it fits:** Director explicitly said "UI8 с пилюлями" — this is the canonical UI8 source for that exact look. Buy + adapt.
- **Steal specifically:** entire component family as a starting baseline; replace illustrations and copy with SandyStudio's.

---

## 3. Tier 2 — Supporting References (steal one specific element each)

### T2-A. Setproduct — Nocra UI Kit ($98, Figma)
- **URL:** https://www.setproduct.com/templates/nocra
- **What it is:** "Design system for AI products — image, video, audio, music, prompts." 44+ screens, 1,200+ components.
- **Steal:** screen archetypes for media-generation flows (storyboard, image grid, music timeline) — these map 1:1 to SandyStudio's EXEC-VGEN / EXEC-MGEN surfaces. Also: token system architecture (Figma variables → CSS vars).

### T2-B. Apple Liquid Glass — official material (iOS/macOS/visionOS 26)
- **URL:** https://developer.apple.com/documentation/TechnologyOverviews/liquid-glass , https://developer.apple.com/design/new-design-gallery-2026/
- **Steal:** the *idea* of dynamic specular highlights that respond to pointer/scroll, plus the reduced-transparency + reduced-motion accessibility fallbacks. Do **not** copy refraction (Linear was right to drop it for dense UI).

### T2-C. Frame.io v4 — Fluid UI principles
- **URL:** https://frame.io/v4 , https://vercel.com/blog/frameio-never-drop-the-illusion
- **Steal:** the three principles — **instant, smooth, coordinated**. Plus their commitment to "how it feels = how it works." This is the right north-star for SandyStudio's Pipeline DAG and Asset Preview drawer.

### T2-D. Vercel Geist Design System
- **URL:** https://vercel.com/geist/introduction , https://vercel.com/geist/colors
- **Steal:** the **Background-1 / Background-2** layering pattern (substrate vs. raised surface). Use it for SandyStudio's "frame" (sidebar/topbar = Bg-2) vs. "stage" (content = Bg-1). And their disciplined use of accent — Geist barely glows at all.

### T2-E. Rauno Freiberg's portfolio + Web Interface Guidelines
- **URL:** https://rauno.me , https://devouringdetails.com/
- **Steal:** depth-by-layering technique (dock + horizontal scroll + interface sounds). For SandyStudio: episode-timeline horizontal scroller with parallax-on-hover preview cards. Also his "designing depth" essay is the operating philosophy.

### T2-F. Aceternity UI / Magic UI (component libraries)
- **URL:** https://ui.aceternity.com , https://magicui.design
- **Steal:** specific components only — **glowing borders**, **moving-gradient buttons**, **spotlight-on-hover cards** — for hero / empty-state moments. Do NOT use across the whole app (they're built for landing pages).

### T2-G. shadcn/ui + Tailwind glassmorphism generator (Ruixen UI)
- **URL:** https://ui.shadcn.com , https://ruixen.com/generator/glass-morphism
- **Steal:** the underlying form/table/dialog components from shadcn (already the webapp's likely stack), and Ruixen as a live tuner for the exact backdrop-filter recipe.

### T2-H. Setproduct S8 Design System ($148, Figma + React + Tailwind)
- **URL:** https://www.setproduct.com/templates/s8
- **Steal:** 67 dashboard templates as layout precedents — bento grids, multi-panel approval surfaces, settings drawers. Use only the *layout patterns*, not the visual style (S8 is too generic on its own; pair with T1-A's glass recipe).

---

## 4. Design Tokens Shortlist (ready to plug into `webapp/app/globals.css`)

These are derived from Linear's recipe + dark-glassmorphism best-practices + Apple's contrast fallbacks. Numbers are starting points — tune in-product.

```css
:root {
  /* === SURFACES (warmer gray, NOT cool blue) === */
  --surface-bg-0:        oklch(13% 0.008 250);   /* deep substrate — body background */
  --surface-bg-1:        oklch(16% 0.010 250);   /* raised content surface (cards, tables) */
  --surface-bg-2:        oklch(19% 0.012 250);   /* sidebar, topbar, drawer chrome */
  --surface-glass:       rgba(22, 24, 30, 0.55); /* frosted chrome panel base */
  --surface-glass-hover: rgba(28, 30, 36, 0.65);

  /* === GLASS RECIPE === */
  --glass-blur:          20px;          /* base. drops to 10px on low-power */
  --glass-saturate:      160%;
  --glass-border:        1px solid rgba(255, 255, 255, 0.08);
  --glass-inner-hl:      inset 0 1px 0 rgba(255, 255, 255, 0.06);  /* top edge specular */
  --glass-shadow:        0 12px 40px rgba(0, 0, 0, 0.45),
                         0 1px 0 rgba(255, 255, 255, 0.04) inset;

  /* === TEXT (3 tiers) === */
  --text-1:              oklch(96% 0.005 250);   /* primary content */
  --text-2:              oklch(72% 0.008 250);   /* secondary / labels */
  --text-3:              oklch(52% 0.010 250);   /* tertiary / hints */

  /* === ACCENTS (2-3 max, restrained) === */
  --accent-cool:         oklch(72% 0.18 240);    /* primary — cinematic blue */
  --accent-warm:         oklch(78% 0.16 70);     /* secondary — amber, for APPROVED/LOCKED */
  --accent-violet:       oklch(70% 0.20 295);    /* tertiary — ambient orb only, never on type */

  /* === GLOW (focus + active state only) === */
  --glow-cool:           0 0 0 1px rgba(120, 170, 255, 0.35),
                         0 0 24px rgba(120, 170, 255, 0.18);
  --glow-warm:           0 0 0 1px rgba(255, 200, 120, 0.40),
                         0 0 20px rgba(255, 200, 120, 0.15);

  /* === PILL BUTTON FAMILY === */
  --pill-radius:         999px;
  --pill-pad-y:          0.5rem;
  --pill-pad-x:          1rem;
  --pill-h:              2.25rem;
  --pill-font:           500 0.875rem/1.2 "Inter Tight", system-ui, sans-serif;

  /* Motion */
  --duration-fast:       150ms;
  --duration-normal:     280ms;
  --ease-out-expo:       cubic-bezier(0.16, 1, 0.3, 1);
}

/* --- Glass surface utility --- */
.glass {
  background: var(--surface-glass);
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  border: var(--glass-border);
  box-shadow: var(--glass-shadow), var(--glass-inner-hl);
}

/* --- Pill button: primary --- */
.pill-primary {
  border-radius: var(--pill-radius);
  padding: var(--pill-pad-y) var(--pill-pad-x);
  font: var(--pill-font);
  color: oklch(15% 0 0);
  background: var(--accent-cool);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25),
              0 4px 16px rgba(80, 140, 240, 0.25);
  transition: transform var(--duration-fast) var(--ease-out-expo),
              box-shadow var(--duration-fast) var(--ease-out-expo);
}
.pill-primary:hover  { transform: translateY(-1px); box-shadow: inset 0 1px 0 rgba(255,255,255,0.3), 0 8px 24px rgba(80,140,240,0.35); }
.pill-primary:active { transform: translateY(0); }
.pill-primary:focus-visible { box-shadow: var(--glow-cool), inset 0 1px 0 rgba(255,255,255,0.3); outline: none; }

/* --- Pill button: ghost (translucent) --- */
.pill-ghost {
  border-radius: var(--pill-radius);
  padding: var(--pill-pad-y) var(--pill-pad-x);
  font: var(--pill-font);
  color: var(--text-1);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.10);
  backdrop-filter: blur(12px);
  transition: background var(--duration-fast) var(--ease-out-expo);
}
.pill-ghost:hover  { background: rgba(255, 255, 255, 0.09); }
.pill-ghost:active { background: rgba(255, 255, 255, 0.07); }

/* --- Status pill: APPROVED (warm glow rim) --- */
.pill-status-approved {
  border-radius: var(--pill-radius);
  padding: 0.25rem 0.625rem;
  font: 500 0.75rem/1 "Inter Tight", system-ui, sans-serif;
  color: oklch(85% 0.10 70);
  background: rgba(255, 200, 120, 0.10);
  border: 1px solid rgba(255, 200, 120, 0.30);
  box-shadow: 0 0 18px rgba(255, 200, 120, 0.18);
}

/* --- Accessibility fallbacks --- */
@media (prefers-reduced-transparency: reduce) {
  .glass { background: var(--surface-bg-2); backdrop-filter: none; }
}
@media (prefers-reduced-motion: reduce) {
  * { transition-duration: 0ms !important; animation-duration: 0ms !important; }
}
@media (prefers-contrast: more) {
  .glass { border-color: rgba(255, 255, 255, 0.25); }
}
```

---

## 5. Anti-References — Avoid

1. **Cyberpunk hacker terminal** — green-on-black, ASCII art, scanlines, terminal pills, matrix-rain backgrounds. SandyStudio is a **production OS for a Director**, not a CTF challenge. (Steers away from generic dribbble "AI ops" templates that lean cyberpunk.)
2. **Web3 / crypto neon overload** — multi-color rainbow gradient mesh, hot-pink + lime accents, 3D iridescent buttons, "trippy" glow everywhere. Looks expensive at first glance, looks toy on day 3. (Avoid Behance "Crypto Dashboard" templates and most Lovable/Replit default v0 outputs.)
3. **Generic SaaS card grid** — three columns of identical white-on-light-gray cards with pastel pie charts, friendly rounded sans-serif. This is the "Волга газ-24" failure mode Director called out. (Avoid most free Figma "Dashboard UI" community files, and Tailwind admin starters that haven't been re-skinned.)

---

## 6. Implementation Gotchas

### Performance
- `backdrop-filter: blur()` is **expensive**. Apply only to chrome (sidebar, topbar, drawer, modal) — NOT to every card. For card-level "frost" use a flat semi-transparent fill instead.
- Cap blur at **20px**. Linear runs ~16–20px in practice; >24px starts hitting GPU fill-rate on integrated graphics.
- Avoid backdrop-filter inside scrolling lists with 100+ items. If you need it, virtualize the list (TanStack Virtual).
- Test on a 4-year-old MacBook Air, not just on a maxed M-series — that's where blur tanks.

### Accessibility
- Translucent surfaces fail WCAG contrast if the background underneath is busy. Always layer over `--surface-bg-1` (a flat dark substrate), never directly over the ambient orb gradient.
- Honor `prefers-reduced-transparency` (real Safari/Apple users toggle this) — fall back to solid `--surface-bg-2`.
- Honor `prefers-reduced-motion` — kill all transitions/animations, keep static glow.
- Honor `prefers-contrast: more` — bump border opacity from `/.08` to `/.25` and add solid outlines on focused glass elements (Linear does this).
- Focus rings: never rely on glow alone. Always pair `box-shadow` glow with a 1px solid ring for keyboard users.

### Color management
- Use **OKLCH** for tokens (already in stack via Tailwind 4 if upgraded). It keeps hue consistent across light/dark and across alpha levels — RGB does not.
- One cool accent + one warm accent is the cap. Violet is **ambient only** (background orb), never on text or UI controls. More than 2 functional accents = SaaS-template look.

### Ambient orb background (the "wow" layer)
- Two large radial-gradient blobs, deep purple + cool cyan, very low frequency, behind everything.
- Animate position over 60–90s with `transform: translate3d()` — never `top/left`. Pause on `prefers-reduced-motion`.
- Opacity 0.18–0.28 max. Anything brighter starts to read as crypto-flashy.

### Motion budget
- Pill hover: **150ms** ease-out-expo, translateY(-1px) only.
- Drawer open: **280ms**, slide + fade.
- Approval-state transition (DRAFT → REVIEW → APPROVED): **400ms** with a glow pulse on the new state. Do NOT animate the status pill on every render — only on state change.

---

## Sources

- [Linear — A Linear spin on Liquid Glass](https://linear.app/now/linear-liquid-glass)
- [Linear — Behind the latest design refresh](https://linear.app/now/behind-the-latest-design-refresh)
- [Linear — How we redesigned the Linear UI (part Ⅱ)](https://linear.app/now/how-we-redesigned-the-linear-ui)
- [Muzli — 50 Best Dashboard Design Examples for 2026](https://muz.li/blog/best-dashboard-design-examples-inspirations-for-2026/)
- [Dribbble — OpsPulse AI SaaS Dashboard (Orbix Studio)](https://dribbble.com/shots/27131271-OpsPulse-AI-Operations-Compliance-SaaS-Dashboard-Design)
- [UI8 — MagicDraft AI & SaaS Dashboard Kit (Dark Mode)](https://ui8.net/htpvvv3/products/magicdraft---ai--saas-dashboard-ui-kit-dark-mode)
- [Setproduct — Nocra UI Kit (AI design system)](https://www.setproduct.com/templates/nocra)
- [Setproduct — S8 Figma Design System](https://www.setproduct.com/templates/s8)
- [Apple — Liquid Glass official documentation](https://developer.apple.com/documentation/TechnologyOverviews/liquid-glass)
- [Apple — New design gallery 2026](https://developer.apple.com/design/new-design-gallery-2026/)
- [Frame.io v4](https://frame.io/v4)
- [Vercel — How Frame.io builds fluid UI](https://vercel.com/blog/frameio-never-drop-the-illusion)
- [Vercel Geist Design System](https://vercel.com/geist/introduction)
- [Vercel Geist Colors](https://vercel.com/geist/colors)
- [Rauno Freiberg — Killer Portfolio entry](https://www.killerportfolio.com/by/rauno-freiberg)
- [Devouring Details (Rauno)](https://devouringdetails.com/)
- [Aceternity UI](https://ui.aceternity.com)
- [Ruixen — Glassmorphism Generator](https://ruixen.com/generator/glass-morphism)
- [Medium — Dark Glassmorphism: The Aesthetic That Will Define UI in 2026](https://medium.com/@developer_89726/dark-glassmorphism-the-aesthetic-that-will-define-ui-in-2026-93aa4153088f)
- [Inverness Design Studio — Glassmorphism in 2026](https://invernessdesignstudio.com/glassmorphism-what-it-is-and-how-to-use-it-in-2026)
- [Orizon — Glassmorphism in 2026: Without Killing UX](https://www.orizon.co/blog/glassmorphism-in-2026-how-to-use-frosted-glass-without-killing-ux)
