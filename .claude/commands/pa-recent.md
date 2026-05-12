---
description: Read the last N turns of the most recent Prod Assistant conversation. Optional arg N (default 10, max 100).
allowed-tools: Bash
---

Run the Prod Assistant tail reader for the latest conversation thread.

If `$ARGUMENTS` is empty, default to N=10. Otherwise treat `$ARGUMENTS` as a positive integer N (cap at 100). Reject non-integers with a short message.

Execute:

```
cd "C:\SandyStudio\.claude\worktrees\quizzical-brown-462555\webapp" && node scripts/pa-tail.mjs recent <N>
```

Pass through the script output verbatim — it is already formatted for human reading (turn-by-turn timestamp + role + content). Do not paraphrase or summarise unless the user asks.

When the output mentions a tool error or `!fb`/`!todo` marker, surface it explicitly at the top of your reply so the Director sees the actionable items first.
