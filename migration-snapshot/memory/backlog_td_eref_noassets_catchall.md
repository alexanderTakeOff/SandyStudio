---
name: ""
metadata: 
  node_type: memory
  originSessionId: ad8a7350-74d9-453e-83c8-929a4d7c8144
---

# TD — EREF "No episode reference assets inserted" catch-all (tonns of false/opaque fails)

Director-flagged 2026-06-24 (E12, «we have tonns reference artist fails»). Read-only diag.

## Facts
- Failing agent: **EXEC-EREF** (Reference Artist). Provider = **`openai-edits-multi`** (gpt-image).
- Provider is NOT down: SH01 generated fine 06-24 06:18 ($0.35). Failures are **per-shot**, not an outage.
- All fails carry one error: **`No episode reference assets inserted`** (`episode-references.ts:2667`,
  thrown when `insertedAssetIds.length === 0`).

## Two DIFFERENT causes under one catch-all
1. **Swallowed provider error (real failure).** Per-shot generation `catch` at
   `episode-references.ts:2331-2336` logs `[eref] provider … failed on shot …` to **console only**
   then `break` → `approvedB64` stays null → shot recorded `REGENERATE_EXHAUSTED` and skipped
   (`2491-2500`). If every targeted shot does this → run throws the generic message with NO provider
   detail. (E12 SH04, SH26 fail repeatedly this way — likely gpt-image content/safety rejection or a
   bad reference; can't confirm because the message is swallowed.)
2. **Idempotent no-op surfaced as FAILURE.** Full fanout run (`!planOverrides`) skips shots that
   already have an APPROVED ref (`2121-2141`). When all remaining shots are already approved, 0 new
   inserts → same throw. This is a **no-op, not an error** (the 3 empty-shotId fails 04:52–05:27 on
   E12). Polina re-fires fanout → each nets 0 → looks like a failure → "tonns".

## Fix directions (subtractive / surface, не плодить)
- **A — SHIPPED `3c7b5c0`** (master 2026-06-24): per-shot provider catch now records `shotFailReason`;
  on a real 0-insert run it throws `No episode reference assets inserted — <per-shot provider errors>`
  → real cause (gpt-image moderation / bad ref / size / 429) reaches `error_message` + feed.
- **B — SHIPPED `3c7b5c0`**: `nothingToDo = jobs.length === 0` (all already-approved or filtered out) →
  returns a completed INFO no-op («all targeted shots already have an approved ref»), no throw. Only a
  run that attempted real work and produced nothing is a failure → kills the false-fail spam.
- **C — per-shot real fix** still open: now that A surfaces it, read the next SH04/SH26 fail message in
  the feed to see WHY gpt-image throws (likely content moderation or a bad reference) and fix that shot.

## Note
Mechanism only; not fixed (session was `===1===` read-only). Image path has no provider-error
surfacing analogous to the TEXT 529→Gemini fallback (`38cac52`) — same blind spot, image side.
