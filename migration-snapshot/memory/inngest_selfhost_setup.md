---
name: inngest-selfhost-setup
description: "Inngest now runs SELF-HOSTED (durable) via `inngest start`, NOT `inngest dev`. Startup command + env + sync + rollback. Bring it up this way or durability is lost."
metadata: 
  node_type: memory
  type: project
  originSessionId: 48153e1b-a4ac-4f49-aab1-700a41fa7561
---

Tier-0 durability fix (2026-07-11) — the audit's #1. Switched the local Inngest
from the ephemeral **dev server** (`inngest dev`, in-memory → a silent crash
zombied jobs forever, the E27 incident) to the **self-hosted production server**
(`inngest start`, durable). Minimal config — **no Docker / Postgres / Redis**:
`start` defaults to in-memory queue + **periodic SQLite snapshots** (and a snapshot
on shutdown), so a process crash/restart resumes from the snapshot.

## Bring it up (do it THIS way, not `inngest dev`)
From `C:\SandyStudio\webapp`, two processes (both minimized windows, logs to file):
1. **App** (prod): `npm run start *> prod.log` (reads the self-host env below).
2. **Inngest self-host**:
   ```
   npx inngest-cli@1.33.0 start \
     --event-key <INNGEST_EVENT_KEY> --signing-key <INNGEST_SIGNING_KEY> \
     --sdk-url http://localhost:3000/api/inngest \
     --sqlite-dir C:\SandyStudio\FILMS\_inngest \
     *> inngest.log
   ```
   Keys are in `webapp/.env.local` (do NOT paste them here). Same :8288 port.
3. **Sync functions** (start mode `--poll-interval=0` → server does NOT auto-poll
   the app): `curl -X PUT http://localhost:3000/api/inngest` → expect
   `{"message":"Successfully registered"}`. Re-run after any inngest OR app restart.

## App env (webapp/.env.local — already set)
`INNGEST_EVENT_KEY=…` · `INNGEST_SIGNING_KEY=…` (hex, even chars) · `INNGEST_DEV=0`
· `INNGEST_BASE_URL=http://localhost:8288`. App log shows
`[inngest] Using native Web Crypto for request signing` = self-host signing mode ON.

## Durable state
SQLite `main.db` in `C:\SandyStudio\FILMS\_inngest` (outside git, Tier-2). Survives
restart. **Caveat (honest):** snapshots are periodic + on graceful shutdown — a hard
crash loses only the delta since the last snapshot (fine for our low crash rate,
Director: "only on batches"). Full mid-run-resume proof comes on the next real batch.
Scale-up path if ever needed: add `--postgres-uri` (+ `--redis-uri`) — not needed now.

## Rollback to dev
`.env.local`: `INNGEST_DEV=1`, blank both keys, drop `INNGEST_BASE_URL` → restart app
→ run `npx inngest-cli@1.33.0 dev -u http://localhost:3000/api/inngest`.

Supersedes the dev-server half of [[webapp_local_dev_two_terminals]]. Closes the
Tier-0 gap in [[reconciler_audit_2026-07-10]] / the 2026-07-11 stability audit.
[[no_deploy_during_live_run]] still applies (don't restart mid-run).
