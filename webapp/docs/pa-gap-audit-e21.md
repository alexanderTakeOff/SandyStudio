# PA-Gap Audit — E21 production (γ smoke)

> **Status:** LIVE — appended in real time during γ smoke 2026-05-14.
> **Goal:** Produce SS-S14-E21 entirely through PA chat. Zero webapp clicks.
> Log every place where PA cannot drive natively as a GAP. Director approves
> gates via PA bubble. Claude (this CLI agent) supports via `/api/team-chat/post`.
>
> **Budget cap:** ~$80 real spend (Veo / Seedance / GPT-image / Suno).
>
> **Audit format:** append-only. Never rewrite history. Each entry stands alone.

---

## Tag legend

| Tag | Meaning |
|---|---|
| `pa_feasibility=OK` | PA drove this stage natively; no Director hand-off needed. |
| `pa_feasibility=GAP` | PA cannot do this today. Needs new tool / new auth / wider scope. |
| `pa_feasibility=N/A` | Step is intrinsically Director-only (final approval, locked status). |

## Smoke ledger

(empty — entries land as the smoke progresses)

### Format template (copy when appending)

```
### YYYY-MM-DD HH:MM UTC — <pipeline stage>
pa_feasibility=<OK|GAP|N/A>
Director input (verbatim): "..."
PA response (summary): ...
What happened: ...
What was MISSING (if GAP): ...
Workaround used: ...
Next action: ...
```

---

## Pre-flight checklist (verified by Claude before kickoff)

- [x] α layer applied — Postgres trigger fires (`scripts/smoke-alpha-team-chat.ts` Lane 1 ✓)
- [x] α layer applied — `/api/team-chat/post` accepts curl Bearer (Lane 2 ✓)
- [x] β layer applied — VGENShotPanel renders Resolution / Seed / End-frame (capability-aware)
- [x] β layer applied — Regenerate accepts `resolution`/`seed`/`end_image_asset_id` in body
- [x] Migration 0029 + 0030 on remote (`supabase migration list` confirms)
- [x] `webapp/.env.local` has `TEAM_CHAT_TOKEN`
- [x] `verify trio`: tsc clean · vitest 204/204 · replay-pilot 29/29

## How to start the smoke (Director path)

1. Open the webapp PA panel.
2. Type one of:
   - "создай episode SS-S14-E21 с brief 'Sandy meets a brass-band parade. He tries to march in step, fails, but invents his own dance.'" (or your preferred brief)
3. PA should drive: createEpisode → triggerAgent EXEC-SW → wait for SREV → approveAsset → etc.
4. Watch the bubbles. Claude will inject team-chat updates as observations land.

## What Claude monitors

Polls `concierge_turns` for the active thread + writes new lines into this
doc when a new pipeline event or PA tool call appears that hits a GAP.

(Claude curls `/api/team-chat/post` to surface real-time commentary in the
same PA bubble channel; those posts also persist as team-chat history.)

---

## Known potential gaps to watch for (working hypothesis — confirm during smoke)

- **End-frame upload from chat** — Director may want to ask PA to set a
  Seedance end-frame for a shot. β UI is text-input asset_id only; PA tool
  for "set end frame for shot X to <bible asset Y>" is currently absent.
  Predicted `pa_feasibility=GAP` → workaround: regen via UI for that shot.
- **Seed locking through chat** — Director may want "lock seed for shot 5
  to 12345 then regen all". PA has no tool for that yet. Predicted GAP.
- **Resolution batch override** — Director may want "regen all shots at
  1080p for final cut". No batch tool. Predicted GAP.
- **Archive via chat** — P0 endpoint exists but no PA tool wraps it. PA
  cannot say "archive E20 PARTIAL". Predicted GAP if Director asks during
  smoke.
- **Inline status tracking** — when PA fires triggerAgent it returns
  immediately; PA's awareness of completion depends on
  `getRecentActivityEvents` polling OR the new α trigger pushing
  pipeline_event turns. α should fix this — verify during smoke.
