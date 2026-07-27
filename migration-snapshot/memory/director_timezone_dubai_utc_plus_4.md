---
name: Director in Dubai — UTC+4 timezone discipline
description: Director works in Dubai (UTC+4). Local clock (git auto-sync commit msgs, machine `date` without -u) leads UTC by 4h — always cross-check timestamps explicitly.
type: user
originSessionId: 4a7a6edf-60b9-4fd8-b7dd-1d7120c92f90
---
Director works in **Dubai (UTC+4)**.

## Where this matters

- **Auto-sync hook commit messages** (`auto-sync YYYY-MM-DD HH:MM`) use local Dubai time. A commit labelled "22:30" was actually at 18:30 UTC.
- **Machine `date` without `-u`** returns Dubai local time.
- **Supabase DB timestamps**, **Inngest dev events**, **`date -u`**, and **DB column `created_at`** are all UTC.
- **Activity log files** (`.claude/pa-feedback.log`) use UTC ISO strings.

## How to apply

Before declaring anything "X hours ago" based on a timestamp:

1. Run `date -u` to know the current UTC moment, not the local one.
2. If the timestamp is from git/auto-sync/local file → it is in Dubai time (UTC+4).
3. If the timestamp is from DB/Inngest/PA log → it is in UTC.
4. Subtract 4h from local to compare with UTC, or add 4h to UTC to compare with local.

A 4-hour discrepancy between "git commit time" and "DB job started_at" is **expected**, not a stale-job signal. Cancelling a running Inngest job because the wallclock appears stale by 4h is the wrong action — verify with `date -u` first.

## Origin

2026-05-12 evening: I read auto-sync commit "22:30" alongside Supabase `started_at: 18:27` and concluded the EREF Inngest run had been zombie for 4 hours. Cancelled it via Inngest GraphQL `cancelRun`. Director caught it — the system was operating in real time; the gap was purely a Dubai-vs-UTC offset. EREF would have completed normally; instead a fresh event had to be republished and gpt-image-1 quota was partially wasted.
