---
name: Don't run `npm run build` while `npm run dev` is active
description: Webpack chunks in webapp/.next get clobbered, every API route returns "Cannot read properties of undefined (reading 'call')" 500 — fix is kill+rm -rf .next+restart.
type: feedback
originSessionId: 0af321d8-a995-4c87-830d-6bc64fa18f7c
---
When the SandyStudio webapp dev server is running (`npm run dev` in `webapp/`), DO NOT run `npm run build` in the same workspace. The production build overwrites the dev server's `.next/server/webpack-runtime.js` chunks and every subsequent API route returns 500 with `[TypeError: Cannot read properties of undefined (reading 'call')]` and `Cannot find module './<chunk>.js'`.

**Why:** Director encountered this twice in the Phase 5c session (2026-04-29). Each time recovery required: kill dev/inngest processes by port, `rm -rf webapp/.next`, restart both servers, log Director back in.

**How to apply:**
- During verify-gates that run while dev is up, use ONLY `npx tsc --noEmit && npm test && npm run replay-pilot`. Skip `npm run build`.
- Run `npm run build` only when dev is NOT running (e.g. CI, pre-deploy check, end-of-day).
- If you must run a full build during a session, warn the Director first and stop dev cleanly.

**Recovery command if it happens:**
```powershell
$pids = Get-NetTCPConnection -LocalPort 3000,8288 -State Listen -EA SilentlyContinue | Select -Expand OwningProcess -Unique
foreach ($p in $pids) { Stop-Process -Id $p -Force -EA SilentlyContinue }
Remove-Item -Recurse -Force "C:\SandyStudio\.claude\worktrees\<worktree>\webapp\.next" -EA SilentlyContinue
# then npm run dev + npm run inngest:dev in two terminals
```
