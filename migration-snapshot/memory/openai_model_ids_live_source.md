---
name: OpenAI model IDs — defer to live docs
description: Director's OpenAI account uses gpt-5.4-mini / gpt-5.5 naming (point versions). Assistant training data on OpenAI model names lags the live docs. Always check developers.openai.com/api/docs/models before recommending an ID.
type: feedback
originSessionId: 6d0edfd7-097b-42f3-ad06-4abcefe3c3d8
---
When Director paste-set `OPENAI_MODEL=gpt-5.4-mini` and `gpt-5.5` in `webapp/.env.local`, the assistant pushed back claiming those didn't exist. They were real — visible in **developers.openai.com/api/docs/models** (the API docs subdomain, NOT `platform.openai.com/docs/models`).

**Why:** OpenAI ships new model IDs faster than the assistant's training data refreshes. Confidently asserting "this model doesn't exist" wasted a turn and made the assistant look outdated.

**How to apply:**
- Never tell the Director an OpenAI model ID is invalid based on internal memory. If unsure, fetch developers.openai.com/api/docs/models or ask him to confirm.
- The default in `webapp/app/api/concierge/chat/route.ts` is `gpt-5.4-mini`. The GPT-5 family detector uses regex `/^gpt-5(\.|-|$)/` — handles both dash and dot sub-versions.
- GPT-5.x family rejects custom `temperature` (uses default); the route already gates that conditionally.
- Live fetch may 403 (the docs subdomain checks origin/auth) — when that happens, fall back to asking the Director to paste the relevant snippet.
