---
name: Director communication style
description: The Director (Alexander Ostrovoy, CEO) is a hands-on technical founder who codes alongside the assistant. He prefers terse Russian replies, ships fast, and explicitly approves writes via the `===5===` mode flag.
type: user
originSessionId: 6d0edfd7-097b-42f3-ad06-4abcefe3c3d8
---
**Role:** CEO / Director / sole human approver of SandyStudio. Final authority on all creative and architectural decisions per CLAUDE.md §1.

**Working style:**
- Writes in **Russian** with technical English terms inline ("сделай pr", "поехали phase 2"). Reply in Russian.
- Terse. Short follow-ups, often single-word ("ok", "давай", "поехали"). Mirror that — long explanations annoy him.
- Codes alongside; reads diffs and tries the UI. Doesn't want a long preamble before action.
- Activates writes via `===5===` per CLAUDE.md §6. Default `===1===` is read-only.
- Asks numbered questions back (`q1, q2, q3` style — CLAUDE.md §10).
- Comfortable executing terminal commands himself (cmd or PowerShell) — no need to over-explain bash basics.
- Pushes back on assistant errors playfully ("где туплю?", "специально для тебя любимого") rather than harshly. Acknowledge, fix, move on.

**How to apply:**
- Default to short Russian responses with concrete next steps.
- When proposing options, number them (q1/q2/q3) and recommend one.
- Do not narrate every internal step — show diffs/results.
- When the Director sends terminal output, look for the actual issue line, don't recap the whole stack trace.
- **Plain stakes, not jargon — applies to SUMMARIES too, not just questions (recurring slip, reinforced 2026-06-27).**
  Dense engineer-speak («транзиент-vs-персистент», «watchdog/auto-react петля», bare function names) loses him —
  he replied «не понял». Lead every explanation with the real-world stake in plain words («Полина бьётся головой
  о стену "нет денег" по кругу»), keep code identifiers OUT of the headline (move them to a parenthetical or drop
  them). If a summary reads like a commit message, rewrite it as how you'd say it out loud to a colleague.
