---
name: kebab-color-grammar
description: "APPROVED color/state grammar for pipeline kebabs — temperature=object, ramp=role, pulse+weight=lifecycle. Impl + deploy DEFERRED (don't deploy during live run)."
metadata: 
  node_type: memory
  type: project
  originSessionId: 48153e1b-a4ac-4f49-aab1-700a41fa7561
  modified: 2026-07-25T08:28:54.279Z
---

Approved 2026-07-11 (Director). Unified colour/state grammar for the pipeline
"kebab" surfaces. Live preview artifact:
https://claude.ai/code/artifact/7f3ac026-93cc-4b31-876d-72dfe86ff290

**STATUS 2026-07-25: CODE WRITTEN + VERIFIED (tsc clean · 1510/1510 vitest), on
branch `claude/artifact-continuation-2cb174`, NOT yet merged/deployed.** Applied to
BOTH surfaces (Director q1a): animatic kebab AND episode stage-rail. Grammar helpers
`stageRamp`/`rampStop`/`stageIdentity` + `StageFamily`/`StageRole` now live node-safe
in `webapp/lib/api/pipeline-stages.ts` (single source for both surfaces). 6 CSS
family tokens `--stage-{ref,vid}-{plan,critic,artist}` in `:root` (theme-invariant).
Repointed `--asset-image`→`var(--stage-ref-artist)` (×3 themes, blast-radius was
AnimaticPlayer-only). Subtractions: killed `cellPalette` status→hue switch, the
object weight-ternary, dead `--accent-role-*` + `--accent-stage-*` + `liveStagePalette`.
STILL PENDING: (1) visual eyeball both themes — no hue-jump on approve (propose, don't
autofire; avoid clashing with a live :3000 run); (2) **MUST NOT deploy while video
generation is live** ([[no_deploy_during_live_run]]).

## The grammar — 3 orthogonal axes (never mix)
- **Hue = stage identity (object + role). STABLE across the whole lifecycle of a
  sub-step — status must NEVER overwrite it.** Two family temperatures:
  - ❄️ Image/Reference = COLD ramp (light→deep): План `#38BDF8` (sky) → Критик
    `#6366F1` (indigo) → Картинка/Artist `#8B5CF6` (cold violet).
  - 🔥 Video = WARM ramp, widely spaced by hue+lightness: План `#FDE047` (yellow)
    → Критик `#F97316` (orange) → Видео/Artist `#C2410C` (burnt orange). Reads as
    "materializing / heating up." Hero stays clear of danger-red `#EF4444`.
- **Glow = activity.** Pulse (`cell-stage-pulse`) = running. Steady glow = settled.
- **Weight = approval.** Thin = awaiting · **Bold = approved**.

Four lifecycle states on one glyph (hue never jumps):
| state | hue | glow | weight |
|---|---|---|---|
| не начато | grey `--text-muted` | — | thin |
| идёт | family hue | **pulse** | thin |
| готов, ждёт | family hue | **ровно (steady)** | thin |
| утверждён | family hue | **ровно (steady)** | **bold** |
(Director's correction: approved keeps STEADY glow, only weight changes.)

## Why it's shaped this way
- Reconciliation insight (Director): **"на кнопке нет позиции."** Old doctrine
  (2026-07-02, `pipeline-stages.ts:533`) "colour=role, position=object" worked on
  the row-strip; a lone button has no position, so object must ride COLOUR as a
  temperature band, role as the ramp within it. Nothing lost, object-legibility
  gained on the unused warm/cool axis.
- Temperature = object (cold=image, warm=video); ramp depth = role; pulse+weight =
  lifecycle. Elegant fix for the raw "blue/red/crimson" idea that "tore" the ramp.

## Root-cause bug it fixes (verified in code)
`AnimaticPlayer.tsx cellPalette()` (~L327-387): while running, colour = role
(violet artist) + pulse; on completion colour switches to STATUS branch
(APPROVED→green, REVIEW→amber). => hue JUMPS ("мерцал фиолетовый → вдруг зелёный").
**Fix = delete the status→hue branch as the colour source**; status only drives
weight + glow on/off. This is mostly SUBTRACTION (also removes today's dual-encode
"object = font-weight 400/700", since object now = hue family → frees weight for
approval). Net ≤ 0 lines expected. [[anti_additivity_principle]]

## Files to touch (impl handoff)
- `webapp/components/animatic/AnimaticPlayer.tsx` — `cellPalette` (L327), number
  render (L1555, weight ternary keys off `cell.kind` today → move to approval),
  popover fields (L1585-1834).
- `webapp/lib/api/pipeline-stages.ts` — `workRolePalette` (L649) retint per family;
  `liveStagePalette` (L525).
- `webapp/app/globals.css` — add/retune family tokens (cold img trio, warm video
  trio; ~1 genuinely new token e.g. video-plan yellow) + reuse `stage-pulse`
  keyframe (L233) + `color-mix(... 60%, transparent)` glow recipe.
- Related backlog: [[backlog_td_kebab_plan_critic_lines]] (plan/critic lines +
  per-version generate buttons) — fold in when touching the popover.

## OPEN question (unanswered by Director)
Scope: apply grammar to the animatic cell-kebab ONLY, or ALSO the coarse
stage-rail on the episode page (`app/(studio)/episodes/[id]/page.tsx` NODE_COLOR
L100-121 — same disease: running=amber, approved=green, hue jumps). Decide before
implementing. Also confirm: cold-violet hero `#8B5CF6` reuses/retints
`--asset-image` (was `#EC4899` magenta) — that token feeds other surfaces, check
for collateral before repointing.

## Verify (when implemented, run NOT during a live run)
tsc·0 · vitest · then eyeball the animatic timeline: run/ready/approved per family,
confirm no hue jump on approve, both themes (dark default) legible.
