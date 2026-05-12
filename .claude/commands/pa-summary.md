---
description: Summarise Prod Assistant feedback markers (!fb / !todo) over a time window. Optional period arg.
allowed-tools: Bash
---

Run the Prod Assistant feedback reader over a time window.

Parse `$ARGUMENTS` as the period (default `1d`):
- `1h`, `6h`, `12h` — last N hours
- `1d`, `2d`, `7d` — last N days
- `today` — since midnight local time
- `1w` — last 7 days
- Any other string — fall back to `1d` and mention the fallback in your reply.

Execute:

```
cd "C:\SandyStudio\.claude\worktrees\quizzical-brown-462555\webapp" && node scripts/pa-tail.mjs summary <period>
```

After printing the raw script output, add a one-paragraph engineer-facing synthesis:
- Group similar feedback under headings (e.g. "Voice / mic UX", "Approval gate", "Tool dispatch", "UI papercuts", "Tooling gaps").
- For each group, list 1-3 bullet points with the action implied.
- End with a single line "Next concrete fix:" pointing at the highest-leverage item.

If no feedback markers exist in the window, say so plainly and propose enabling them via `!fb [N] <note>` in PA chat.
