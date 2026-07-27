---
name: director_message_timestamp_dubai
description: "Director wants every assistant message prefixed with Dubai (UTC+4) time, e.g. \"11:24 ~ ...\""
metadata: 
  node_type: memory
  type: feedback
  originSessionId: dac17679-229b-4b22-9353-451b864af467
  modified: 2026-07-24T07:55:21.523Z
---

Prefix EVERY message to the Director with the current Dubai (UTC+4) time in
`HH:MM ~ ` format, e.g. `11:24 ~ Сборщик запущен...`. Established 2026-06-21.

**Why:** Director reviews from his phone (he's in Dubai, UTC+4 — see
[[director_timezone_dubai_utc_plus_4]]) and the timestamp helps him orient across
a stream of async updates / long background runs.

**How to apply:** The machine LOCAL time IS Dubai (UTC+4) — use plain
`date '+%H:%M'`. Do NOT use `TZ='Asia/Dubai' date` on this Git Bash: it misbehaves
and returns UTC (verified 2026-07-23: `TZ='Asia/Dubai'`→05:11 while plain `date`→09:11
AST, the correct Dubai time). If ever in doubt, compute `date -u` + 4h. Put the
`HH:MM ~ ` at the very start of the message, before any 🔴 context chip or Compass
header.

**HARD RULE (2026-07-23, Director called this out TWICE in one session):** the time
in the header is NEVER fabricated, guessed, or "incremented from last known". It is
READ from `date '+%H:%M'` — a literal tool call. Reading the clock is the FIRST
action of composing a reply, not an afterthought. Guessing the clock is what
produced a fake "+15 views/min surge" and a fake "overnight gap" this session —
both were phantom conclusions built on an invented timestamp. On the rare pure-text
turn with no tools at all, if a fresh `date` isn't in hand, say so explicitly rather
than invent a number. Fabricating the header time = the same sin as trusting any
measurement without checking the measuring instrument. [[verify_real_results_not_logs]]

**MECHANISM (2026-07-24, after the 3rd violation — fabricated «02:00» at what was
actually ~11:50):** discipline failed three times → project hook now injects the
clock. `.claude/hooks/inject-time.cjs` (UserPromptSubmit, registered in
`.claude/settings.json`) prepends `[now: HH:MM Dubai]` into context on EVERY
Director message, ~10 tokens/turn, works on both machines via git. **Use THAT
injected value for the header** — it is ground truth for the turn's start; call
`date '+%H:%M'` only when a long turn needs a fresher stamp mid-work.
