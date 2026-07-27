---
name: Test in browser BEFORE handing off to Director
description: After any UI/backend change, use Chrome MCP browser tools to navigate the webapp, click through the new flow, and verify it works end-to-end. Director should never be the one to find a broken button, missing icon, or 404. Tsc + tests are necessary but insufficient — UI integration bugs only show up in the running app.
type: workflow_rule
originSessionId: 063ac62d-3128-457d-96d1-b2c9907a7ad1
---
When delivering a UI / backend slice to Director, the bar is **not** "TypeScript compiles + unit tests pass". The bar is **"I clicked through the new flow in a real browser and it worked"**.

**Why:** 2026-05-02 incident — I shipped Bible Extension Proposal flow (backend + UI panel + integration). Said "ready, refresh and approve". Director refreshed, saw nothing — no Preview button in kebab, activity feed empty, no panel visible. He asked: "Why don't you test these things yourself first? You have a browser."

He's right. I have Chrome via MCP browser tools (`mcp__Claude_in_Chrome__navigate`, `mcp__Claude_in_Chrome__find`, etc.) and can run the full Director-side flow without bothering him.

**Mandatory checklist before reporting "ready" on any UI/backend slice:**

1. `npx tsc --noEmit` — green
2. `npx vitest run` — all unit tests pass
3. `npm run replay-pilot` — 28+ assertions pass
4. **Restart dev** (`.next/` purged if needed) and wait for `:3000` ready
5. **Open Chrome** to the affected page via `mcp__Claude_in_Chrome__navigate`
6. **Walk the flow**:
   - Click new buttons
   - Verify modals open
   - Verify content loads (no "no activity" / 404 / blank)
   - Open preview/edit modals
   - Submit decisions if applicable
   - Watch network for HTTP errors
7. **Verify DB side effects** — query Supabase to confirm rows changed as expected
8. **Take screenshot** of working state (mcp__Claude_in_Chrome__computer with action=screenshot) — attach to report so Director sees the result before clicking himself
9. **Then** ping Director with "I tested it, here's the screenshot, your turn"

**What I should NOT do:**
- Say "should work, refresh and try" without having verified
- Assume HMR picked up changes
- Trust that "tsc clean + tests pass = end-to-end works" — UI integration gaps don't surface there
- Skip dev restart after factory.ts / inngest changes
- Skip Inngest dev restart when registering new functions

**Tools I have:**
- `mcp__Claude_in_Chrome__navigate(url)` — go to a URL
- `mcp__Claude_in_Chrome__find(query)` — find element by natural-language description
- `mcp__Claude_in_Chrome__computer(action: 'left_click', ...)` — click
- `mcp__Claude_in_Chrome__computer(action: 'screenshot', save_to_disk: true)` — screenshot for report
- `mcp__Claude_in_Chrome__read_page` / `read_console_messages` / `read_network_requests` — inspect state

Director is the producer; my job is to ensure the production line is clean before he steps onto it.
