---
name: Director question numbering — continuous q1..qN per session
description: Director's directive 2026-05-18 — never reset question numbering per message. All questions in a session are numbered q1, q2, q3 … qN until /clear. Answers use q<N>y/q<N>n for yes-no, q<N>a/b/c/d for multi-choice.
type: feedback
originSessionId: 10800d29-02d1-485a-8f34-df3cd3f52a58
---
**Rule:** numbered questions to the Director use a **single monotonic counter** through the entire session — never reset per message.

**Why:** Director's correction 2026-05-18 — I asked `q1/q2/q3` in checkpoint #1, then asked `q1/q2/q3` again in checkpoint #2. His reply `q1y` became ambiguous (which q1?). Mistake is mine, not his. Continuous numbering eliminates the ambiguity by design.

**How to apply:**

- Start at `q1` at session start (or after `/clear`).
- Increment monotonically across the entire session: every new question gets a fresh `q<N+1>` where N is the highest number asked so far in the session.
- Never re-use a number even if the prior question became moot.
- Each option in a multi-choice question gets a sub-letter: `q12a / q12b / q12c / q12d`. Answer format mirrors: `q12c`.
- Yes/No questions use `q<N>y` / `q<N>n`. Director's `q7y` = yes to q7.
- Track the running counter silently — scroll back to find max N if unsure.
- Reset ONLY at `/clear`.

**Codified globally:** `~/.claude/rules/common/director-communication.md` — auto-loaded into every future session as part of the rules system. This memory note is the session-level safety net.

**Sessions where I broke this (avoid regression):** 2026-05-18 PM SandyStudio Sprint «Дизайнер и Аниматор» — asked q1/q2/q3 four times in different messages. Director answered `q1a`, `q1y` etc and there was real ambiguity until I caught up.
