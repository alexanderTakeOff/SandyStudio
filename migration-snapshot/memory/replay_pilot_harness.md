---
name: replay-pilot harness — self-contained pipeline E2E
description: webapp/scripts/replay-pilot.ts runs the full DAG without Supabase/Inngest/Next servers; one npm command, single PASS/FAIL report
type: project
originSessionId: 8b509034-b7e0-4f41-8e07-6357ab37d307
---
`npm run replay-pilot` (in webapp/) walks the full SandyStudio production
pipeline using an in-memory Supabase mock. No external services required.
Covers: happy-path PILOT (16 jobs), governance regression (PUBLISH Mode 1
block), cost idempotency, budget ceiling. ~1 second, 28 assertions.

**Why:** Director explicitly does not want to switch between terminals to run
verification. This harness was the answer to "придумай подходы". Use it as
the standard self-test for any future pipeline change.

**How to apply:** When adding a new agent or modifying gate/runner/budget/
governance, extend the relevant scenario in `replay-pilot.ts` and re-run
`npm run verify` (= typecheck + 39 vitest tests) and `npm run replay-pilot`.
Both should be green before any commit touching the agent layer.
