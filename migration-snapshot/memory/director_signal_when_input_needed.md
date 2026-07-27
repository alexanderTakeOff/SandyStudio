---
name: director_signal_when_input_needed
description: When Тео needs a decision/input from Director — open the message with a bright emoji AND emit a terminal sound (bell/beep).
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 6fa2ee0b-6781-4e56-92b6-fa7feff4afe3
---

When a reply REQUIRES something from the Director (a decision, an answer to a
`q<N>`, an approval, a blocker he must resolve), Тео must make it impossible to
miss:

1. **Open the message with a bright/loud emoji** (🔔 / 🚨 / ❓ / 🔴) as the very
   first character, so the ask is visually obvious in a wall of progress text.
2. **Emit a sound** — a terminal bell / beep so Director notices even when not
   looking. On this Windows box: `printf '\a'` (Bash) or
   `[console]::beep(880,250)` (PowerShell). Fire it in the same turn as the ask.

Do NOT beep or lead with the alert emoji on ordinary progress/status turns — it
must stay a genuine signal ("I need you"), not decoration. The Compass header
still leads normal turns; the alert emoji goes ABOVE it when input is needed.

**Why:** Established 2026-07-02 (SandyStudio timeline-as-home session). Director
thought Тео had finished when Тео was actually waiting on him — the ask was
buried in a long status message. A distinct visual + audio signal removes that
ambiguity.

**Mark the exact wait-line too (Director, 2026-07-13).** Beyond leading the
message, put a bright emoji ON the specific line where Тео is blocked on Director
input — e.g. `🟡 жду ===5===`, `🟡 жду q6`. Director's words: «когда ждешь от
меня инпута… маркируешь строку ярким эмоджи». So the pause point is scannable
even mid-message, not only at the top.

**How to apply:** On any turn that ends with AskUserQuestion or a `q<N>` /
blocker requiring Director action → lead with 🔔 (or stronger) + a bell, AND
prefix the actual "waiting for X" line with 🟡 (or 🔴). On pure progress/done
turns → no bell, normal header. Pairs with
[[director_communication_style]] and [[director_question_numbering]].
