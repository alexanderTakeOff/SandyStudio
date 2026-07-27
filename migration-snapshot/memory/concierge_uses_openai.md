---
name: Concierge uses OpenAI, not Anthropic
description: For the SandyStudio webapp Concierge agent, default to OpenAI direct API. Director switched away from Anthropic SDK on 2026-04-28.
type: feedback
originSessionId: 6d0edfd7-097b-42f3-ad06-4abcefe3c3d8
---
The Studio Concierge (`EXEC-CONC`, in `webapp/app/api/concierge/chat/route.ts`) calls OpenAI directly via the `openai` npm package — NOT Anthropic.

**Why:** Director has a paid OpenAI account with low latency and explicitly asked to swap. The original implementation used `@anthropic-ai/sdk`; he hit "credit balance too low" within minutes and asked to switch.

**How to apply:**
- New chat / conversational features inside the webapp → OpenAI by default.
- The studio production agents (EXEC-SW, EXEC-SREV, etc., spec'd in CLAUDE.md §5 model routing) still use Anthropic via Claude Code SDK — that's a different runtime path.
- `@anthropic-ai/sdk` package is still in webapp dependencies (kept for future cost-routing per BOARD-FIN policy), but don't wire new code to it without checking with Director first.
