# Safe & Sustainable — Factory Stability Doctrine

> Git-tracked, survives sessions. Source: stability audit 2026-07-11 + runtime hygiene 2026-07-12.
> Companion to `CLAUDE.md §13` (local stack) and memory `inngest_selfhost_setup.md`.
> Goal: the factory must **self-heal** — no server glitch, provider stall, or task crash may
> leave asset/job statuses stuck forever. Tier-0 shipped; Tier-1 is the open work.

---

## Tier-0 — DONE (shipped master `b99a59f`, 2026-07-11)

### Durable self-host Inngest
- Run `inngest start` (durable, SQLite snapshots in `FILMS\_inngest\main.db`), **NOT** `inngest dev`.
  The old `inngest dev` was ephemeral/in-memory: it died silently and left mid-flight jobs
  RUNNING forever (zombies) — root cause of the whole 2026-07-11 outage.
- Keys in `webapp/.env.local`: `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `INNGEST_DEV=0`,
  `INNGEST_BASE_URL=http://localhost:8288`. The launcher reads them; never hardcode.
- Bring the stack up with `start-stack.ps1` (or `start-stack.cmd`; `-Build` to rebuild first).
  It stops running instances, starts app :3000 + Inngest :8288, re-syncs functions
  (`PUT /api/inngest` → `Successfully registered`), prints health. Details: CLAUDE.md §13.

### Deploy reliability — self-hosted fonts (added 2026-07-12)
- Fonts are **self-hosted** via `next/font/local` (`webapp/app/fonts/*.woff2`), NOT
  `next/font/google`. The build-time fetch of Inter / JetBrains Mono from Google Fonts
  repeatedly timed out (`ETIMEDOUT`), making every `-Build` deploy flaky (1–3 retries).
  The build no longer touches the network for fonts. Do not reintroduce `next/font/google`.

### Runtime invariant (added 2026-07-12)
- There must be **exactly ONE** durable `inngest start` process owning `:8288`, and **no
  `inngest dev` anywhere**. A stray `inngest dev` is a landmine: it can grab `:8288` the moment
  durable restarts/crashes, silently returning us to the unreliable ephemeral mode.
- **Health check before/after any restart:**
  ```powershell
  Get-NetTCPConnection -LocalPort 8288 -State Listen | % { Get-Process -Id $_.OwningProcess }
  Get-CimInstance Win32_Process | ? { $_.CommandLine -match 'inngest-cli.*\bdev\b' }  # must be empty
  ```
  On 2026-07-12 a stray `inngest dev` (PID 30952) was found running beside durable and killed.
- **Do NOT restart mid-run** (CLAUDE.md §7/§12; memory `no_deploy_during_live_run`).

---

## Tier-1 — TODO (self-healing jobs; ordered by leverage / low risk)

The durable executor survives crashes, but a job can still wedge from provider stalls, thrown
errors, or partial failures. Tier-1 makes the `jobs` table self-correcting.

1. **Factory-level `onFailure` handler** — on terminal function failure, flip the job row to
   `FAILED` and release its dispatch claim. Reuse `markJobFailed` (`webapp/lib/agents/runner.ts:3514`)
   + `markDispatchIntent(..., 'failed')`. Crushes zombies from *any* cause, not just inngest death.

2. **Out-of-band reaper for stale RUNNING** — a scheduled sweep that FAILs jobs stuck RUNNING past
   a threshold. **MUST NOT be an inngest function** (it would die with inngest — the exact failure
   we're guarding against). Environment candidates:
   - **pg_cron** (runs inside Supabase, reaches the DB directly) — leading candidate.
   - **Supabase Edge Function on a schedule.**
   - **NOT Vercel Cron** — the app is local (localhost + local ffmpeg); an external cron can't
     reach the local DB/app.
   - **← decide the environment with the Director before implementing.**

3. **Finish provider timeouts** — `webapp/lib/agents/providers/anthropic-brief.ts:141` and
   `anthropic-vision.ts:54` still use bare fetch. Apply the `fetchWithTimeout` pattern already in
   `anthropic-text.ts`. (Root doctrine: memory `provider_fetch_no_timeout_root_cause` — a bare
   fetch that hangs holds its concurrency slot and stalls the stage.)

4. **Critic-loop HALT → `logEvent()`** — the critic-loop HALT currently does a raw insert instead
   of `logEvent()`, so Polina never wakes on it. One-line fix.

---

## Operating rules (carry every session)
- **Runtime beats static analysis** — verify any "it self-heals" claim against the live logs /
  ports / DB, not code-reading (memory `overlay_agent_reports_on_server_logs`).
- **Never deploy/restart during a live run**; pipeline must be idle first.
- **Anti-additivity** — Tier-1 items all *reuse* existing helpers (`markJobFailed`,
  `fetchWithTimeout`, `logEvent`); add no parallel machinery.

*Last updated: 2026-07-12 (runtime invariant + this doc created).*
