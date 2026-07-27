---
name: Webapp local dev — two terminals required
description: Running the SandyStudio webapp locally needs both `npm run dev` (Next.js, port 3000) and `npm run inngest:dev` (Inngest CLI dev server, port 8288) in separate terminals. Skipping the second terminal silently breaks all Inngest jobs.
type: project
originSessionId: 6d0edfd7-097b-42f3-ad06-4abcefe3c3d8
---
`webapp/` is local-first per `specs/system/webapp.md §2` — it never ships to Vercel. To run the full stack on the Director's workstation:

1. Terminal 1 — Next.js dev server:
   ```
   cd webapp && npm run dev
   ```
   Serves http://localhost:3000.

2. Terminal 2 — Inngest dev server:
   ```
   cd webapp && npm run inngest:dev
   ```
   Wraps `npx inngest-cli@latest dev -u http://localhost:3000/api/inngest`. Auto-discovers the `/api/inngest` route handler. UI at http://localhost:8288.

**Why:** Inngest jobs (currently `studio-ping`, in Phase 4 onwards: 11 EXEC-* agent functions) only fire when both processes are up. Without the Inngest dev server, events silently queue and nothing happens.

**How to apply:**
- When debugging "ping doesn't work" or "agent jobs aren't running", first check both terminals are alive: `curl http://localhost:3000/api/inngest` and `curl http://localhost:8288/health` should both return 200.
- Production deployment will use PM2 (Sprint 9 Phase 8) to supervise both processes from one `ecosystem.config.js`.
- If Next.js falls back to port 3001 (3000 occupied by zombie), Inngest will not find functions — kill the zombie via `taskkill /PID <pid> /F` or update the `-u` flag.
