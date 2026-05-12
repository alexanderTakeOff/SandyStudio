# RESUME-AFTER-CLEAR — read first after `/clear` or `/strategic-compact`

**Last update:** 2026-05-12 08:00 UTC — Phase A of Mode 2.5 PA fixes complete + gpt-5.5 swap + reasoning_effort calibration. Director paused for context-budget management.
**Branch:** `claude/quizzical-brown-462555` (auto-sync hook commits frequently)
**Master state:** PR #23 (Mode 2.5 Phase 1-A + 1-B) — **OPEN, not yet merged**. Contains Prod Assistant rename, 13 tools, function calling, verbal approval, bug fixes.
**Strategic plan:** `~/.claude/plans/valiant-soaring-karp.md` — Mode 2.5 roadmap with root-cause analysis (RC1-RC6), Phase A (done) + Phase B (next).

---

## TL;DR — Where we are RIGHT NOW

**Prod Assistant (PA)** is the conversational agent in webapp Right Panel. Director uses it to drive the pipeline by voice/text. Today (2026-05-12) Director ran a real smoke testing Bible enrichment and discovered systemic PA failure modes. We did 3 things:

1. **Phase A prompt fixes** — system prompt restructured around block-priority. New BEHAVIOR_CONTRACT block at top (rules 1-8) banning "если хочешь" / "Собираю и записываю" patterns. ACTIVE_INTENT block dynamically shows Director's last approval + drift count. Behavior-drift activity_events log permission-asking phrases.

2. **gpt-5.4-mini → gpt-5.5** model upgrade. Better analysis but slow output (52s, 0 chars) due to greedy reasoning_effort burn.

3. **Critical reasoning fix:** `OPENAI_REASONING_EFFORT=none` (was 'low'), `OPENAI_MAX_OUTPUT_TOKENS=8000` (was 2000). Direct API test: 9.7s, 0 reasoning tokens, full content generation. Dev restarted.

**Last unfinished smoke step:** Director asked PA to "запиши прямо сейчас" Cast Bible markdown to SBL-general_idea v02-DRAFT. PA was hanging on previous (reasoning-burned) config. Awaiting Director's retry with new settings.

---

## Server + Monitor state

| What | ID/Path | Status |
|---|---|---|
| `next-dev` (webapp:3000) | `dd7d7bfc-e1b4-4ff3-9fc9-69cb6ca6e990` | running |
| `inngest-dev` (:8288) | `64a25d6f-aef6-4721-b838-d5151e8ad80b` | running |
| Monitor task (PA feedback tail) | `bjf7qlmns` | **persistent**, watching `.claude/pa-feedback.log` |
| PAON capture | active in thread `bdbdafcf-2a38-4c58-b706-362fd7ff0f16` | listening to all Director + PA turns |

---

## Files modified in this session (after PR #23 base)

| File | Change |
|---|---|
| `webapp/lib/concierge/system-prompt-builder.ts` | Restructured into 10 blocks. New BEHAVIOR_CONTRACT (top-priority, rules 1-8), ACTIVE_INTENT (dynamic from recentTurns), BIBLE_DOMAIN, model_id injection |
| `webapp/lib/concierge/feedback-capture.ts` | Added `===PAON===`/`===PAOFF===` toggle support (`detectToggle`, `readCaptureState`, `captureSimple`) |
| `webapp/lib/concierge/approval-check.ts` | Fixed `\b` Cyrillic regex bug (token-based). Removed break-on-neutral — now scans full window for latest approval. |
| `webapp/lib/concierge/tools/series.ts` | `setBibleContent` OVERWRITES latest DRAFT in place + slug auto-defaults to 'main' |
| `webapp/app/api/concierge/chat/route.ts` | Function-calling loop (5 rounds max), PAON toggle handling, ambient capture of assistant turns, behavior_drift activity_event emitter (LOG-ONLY) |
| `webapp/components/concierge/ConciergePanel.tsx` | Voice mic continuous=true + 5.5s silence tolerance, textarea resize-y, panel dock left/right + drag-resize, TTS, append-not-replace dictation, markdown line breaks |
| `webapp/components/studio-shell/StudioShell.tsx` | CSS var `--pa-pad-left/right` → panel pushes content instead of overlay |
| `webapp/components/editor/MarkdownEditor.tsx` | `EditorView.lineWrapping` enabled in CodeMirror |
| `webapp/components/assets/EpisodeAssetDrawer.tsx`, `webapp/components/preview/AssetPreview.tsx` | `withHardBreaks` for markdown line break rendering |
| `webapp/.env.local` | `OPENAI_MODEL=gpt-5.5`, `OPENAI_REASONING_EFFORT=none`, `OPENAI_MAX_OUTPUT_TOKENS=8000` |
| `webapp/supabase/migrations/0025_concierge_threads.sql` | Already applied to remote (concierge_threads + concierge_turns + extensible event_type enum) |

---

## Director's directives accumulated (treat as canon)

These are NOT in any single rule file yet — they live in PA's system prompt + my behavior:

1. **Russian, terse, fast** — Director speaks RU briefly, expects action not narration. Match his tone.
2. **"не спрашивай у меня разрешения на чтение"** — read-only tools fire immediately, never ask.
3. **"делай" / "go" / "поехали" = full approval** — covers an entire operation scope, doesn't expire on neutral utterances.
4. **"не плодить новые драфты"** — overwrite latest DRAFT in place; bump version only when previous is LOCKED/APPROVED.
5. **Bible structure**: General idea tab = ALL text canon (one markdown). Library tab = visual assets only.
6. **Announce-without-act = failure** — "Собираю и записываю" without tool_call in same response = contract violation.
7. **"Записал в инженерный лог", not "отправил инженеру"** — for `!fb`/`!todo` markers (log-only, no action).
8. **Smoke tests propose, don't auto-fire** — anything destructive needs explicit Director go.

---

## Bible state (SS-S14 `d1dfa060-748d-4713-ad55-ec30d3214f73`)

| File | Status | Updated |
|---|---|---|
| SBL-general_idea v01-LOCKED | locked canon | 2026-05-04 |
| SBL-general_idea v02-DRAFT | working canon (contains general idea + style merge) | 2026-05-11 10:16 (engineer-merged, not via PA) |
| SBL-style_episode_perfume_02 v01-LOCKED | image asset | 2026-05-04 |
| SBL-style_episode_perfume_style v01-DRAFT | image asset | 2026-05-04 |
| SBL-style_main + style_style_s14 | **REJECTED** (engineer cleanup, were orphan text-in-image) | 2026-05-11 10:16 |
| SBL-character_sandy_hourglass v01-LOCKED | image asset | 2026-05-04 |
| SBL-character_perfume_vial v01-LOCKED | image asset | 2026-05-04 |
| SBL-location_neon_cafe v01-LOCKED | image asset | 2026-05-04 |

**Director's open ask:** Append "## Cast Bible" section (16 characters from his paste) to v02-DRAFT general_idea via `setBibleContent`. Hadn't fired by PA yet when Director paused.

---

## Open todos

1. **Director smoke retry** with new gpt-5.5 + reasoning=none config — call setBibleContent for Cast Bible.
2. **Path B: Skill Editor / Learning Loop** — full implementation per valiant-soaring-karp.md "Phase B" section. Migration `0026_skill_rules.sql`, UI `/skill-editor` page, etc. ~3-5 days work. Should start after Phase A pilot stabilises.
3. **Inter-session summaries** (Director's directive #2) — `concierge_summaries` table, auto-generate at thread close, inject as `[CONTEXT_FROM_PRIOR_SESSIONS]` block. Plan in valiant-soaring-karp.md "B1".
4. **PA introspection layer** (`self_review_alert`) — periodic self-check via cheap LLM call. valiant-soaring-karp.md "B3".
5. **Metrics dashboard** — `permission_asks_per_thread`, `verbal_approval_friction`, drift rate. valiant-soaring-karp.md "C1".
6. **A1b (Responses API migration)** — only if reasoning=none doesn't solve gpt-5.5 hangs. Not needed if today's fix works.

---

## How to pick up in a fresh session

1. **Read this file fully.**
2. **Read** `~/.claude/plans/valiant-soaring-karp.md` — full strategic context + RC analysis + phase breakdown.
3. **Check** Monitor task is still alive: `mcp__Claude_Preview__preview_list` — if not running, restart `next-dev` and `inngest-dev`.
4. **Catch up** on recent PA conversation: `/pa-recent 30` (slash command — installed at `~/.claude/commands/pa-recent.md`).
5. **Review** recent feedback markers: `/pa-summary 1d`.
6. **Re-start** Monitor on `pa-feedback.log` if it was stopped:
   ```
   Monitor: tail -n 0 -F "C:/SandyStudio/.claude/worktrees/quizzical-brown-462555/.claude/pa-feedback.log"
   ```
7. **Verify** PR #23 status: `gh pr view 23`.
8. Re-load context of Director's working style from "Director's directives accumulated" section above.

---

## Available slash commands

- `/pa-recent [N]` — last N turns of latest PA thread
- `/pa-summary [period]` — feedback markers over time window (1h, 1d, today, 1w)
- `/pa-resume` — load this file + restart monitors (TODO: create this)

To create new slash commands, add `.md` file to `~/.claude/commands/<name>.md` with frontmatter:
```
---
description: Short description shown in slash menu
allowed-tools: Bash, Read
---
Instructions for me (Claude) in markdown body. `$ARGUMENTS` is available.
```

---

## Active PA conversation thread

`bdbdafcf-2a38-4c58-b706-362fd7ff0f16` — Director's working thread today. PAON active. Director might either continue here or open a fresh thread (PA panel X → reopen) for cleaner context — fresh thread will use updated system prompt without "asking" pattern history.

If Director opens new thread post-clear → I should suggest he says `===PAON===` again to re-enable ambient capture.
