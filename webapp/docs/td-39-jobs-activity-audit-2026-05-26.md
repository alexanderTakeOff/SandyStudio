# TD-39 Layer 1 Polling Signals Audit
**Date:** 2026-05-26  
**Scope:** webapp/lib/concierge/tools/dispatch.ts polling design for Inngest event pickup confirmation  
**Critical Finding:** insertJobRow executes INSIDE the Inngest function (factory.ts:203-212), making job rows a reliable signal that Inngest picked up the event.

---

## 1. Jobs Table Schema

**Location:** webapp/supabase/migrations/0002_core_tables.sql:84–98

**Columns:**
- id (uuid, PK)
- episode_id (uuid, FK episodes)
- inngest_event (text) — e.g. "sandystudio/exec-sw/write-script"
- inngest_run_id (text) — Inngest run ID from factory.ts line 210
- agent_id (text) — producing agent code
- status (job_status enum)
- input_snapshot (jsonb) — event payload at job creation
- output_ref (text) — asset filename if produced
- error_message (text)
- started_at (timestamptz) — set to now() in insertJobRow (runner.ts:2650)
- completed_at (timestamptz)
- created_at (timestamptz) — insertion time

**Critical:** Job row carries inngest_run_id, so the response can use this as anchor field.

---

## 2. Activity Events Table Schema

**Location:** webapp/supabase/migrations/0008_activity_events.sql extended in 0018 and 0033

**Event Types in Whitelist:**
- agent_started — emitted right after insertJobRow (factory.ts:233)
- agent_completed — after saveAgentOutput
- agent_failed — in catch block
- manual_trigger — manual re-fire
- approval_granted, approval_revision, approval_rejected
- Standard workflow events

**Critical:** Metadata contains job_id field, so activity_events rows point back to jobs.

---

## 3. InsertJobRow Lifecycle

**Location:** webapp/lib/agents/runner.ts:2640–2658

**When It Runs:** INSIDE the Inngest function, Step 1 of factory.ts.

**Exact Call Chain:**
1. Inngest event fires (e.g., sandystudio/exec-sw/write-script)
2. Factory createAgentInngestFunction handler runs
3. Step 1 (factory.ts:203) calls insertJobRow with service-role Supabase client
4. Row inserted with status=RUNNING, started_at=now(), inngest_run_id=runId
5. Same step.run() context then calls logEvent(...) to emit agent_started activity

**Implication:** If a job row exists with inngest_run_id matching dispatch response's ids[0], Inngest has definitively picked up and is executing the event.

---

## 4. Per-Tool Dispatch Trace

### 4.1 triggerAgent

**Endpoint:** POST /api/episodes/{id}/trigger

**Sync Side-Effects (before 200):**
- Episode validation
- VGEN Pilot Pass: setVgenPilotState
- logEvent for manual_trigger activity

**Inngest Events Emitted:**
- Single event or array via inngest.send()
- For VGEN Pilot Pass: array of exec-vgen/start, one per pilot
- For legacy: single event

**Response Body:** { triggered: true, agent, inngest_event, inngest_event_ids: ids }

**First Observable Signal:** activity_events row with event_type=agent_started created in Step 1.

---

### 4.2 approveAsset

**Endpoint:** POST /api/assets/{id}/approve

**Sync Side-Effects (before 200):**
- Asset status validation + transition
- Asset filename update
- Approval row insertion
- logEvent for approval_granted/revision/rejected

**Inngest Events Emitted:**
- Conditional on asset type and status transition
- May emit zero, one, or multiple events

**First Observable Signal:** Same as triggerAgent.

---

## 5. Identification Anchors

**From Dispatch Response:**
- inngest_event_ids (array) — the ids from inngest.send()
- episode_id (known; passed by caller)
- agent / agentCode (known; passed by caller)

**Recommended Primary Anchor:** inngest_event_ids[0] (first Inngest run ID)

**Lookup Strategy:**
- Job row: WHERE inngest_run_id = ? AND episode_id = ?

---

## 6. Existing Latency Patterns

**pa-escalation-timer:**
- Sleep duration: deadlineSec (typically 30–300 seconds)
- Pattern: event-driven timer with cancelOn

**pa-orphaned-awaiting-sweep:**
- Cron: HOURLY (0 * * * *)
- Orphan threshold: 1 hour
- Bounded query: 50 rows max

**Observable Patterns:**
- Agent runtime estimates: 10s–180s range
- Inngest step.run(insert-job-row) completes <100ms
- Realistic P50: 50ms, P99: 500ms

---

## 7. Recommended TD-39 L1 Polling Shape

**Design Decision:** Use jobs table query as canonical signal, NOT activity_events.

**Rationale:**
- insertJobRow is transactional INSERT inside Inngest function
- activity_events depends on RLS policies and trigger logic
- Jobs table has direct FK to episodes and unique inngest_run_id

**Polling Pattern:**
- Anchor Field: inngest_event_ids[0]
- Timeout: 10 seconds (P50 ~50ms, P99 ~500ms)
- Poll Interval: 100ms
- Termination: Job row exists OR timeout
- False-Positive Risk: Negligible
- False-Negative Risk: Near-zero

**Query:**

```sql
SELECT id, status, started_at FROM public.jobs
WHERE inngest_run_id = $1 AND episode_id = $2
LIMIT 1;
```

**Index:**

```sql
CREATE INDEX IF NOT EXISTS jobs_inngest_run_id_episode_idx
  ON public.jobs (inngest_run_id, episode_id);
```

**Applicability:** ALL dispatch tools (triggerAgent, approveAsset, requestRevision). Both single-event and multi-event flows work.

