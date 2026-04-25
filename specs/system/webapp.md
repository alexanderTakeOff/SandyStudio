# SandyStudio — Web Application Spec
## specs/system/webapp.md | v0.1 | DRAFT

---

## 1. PURPOSE

This spec defines the architecture, data model, and interface for the SandyStudio
production web application. The app is the production runtime that replaces
Claude Code sessions for all recurring agent work.

**Role split:**
- **Claude Code sessions** — spec writing, agent instruction authoring, one-off architectural decisions
- **Web app** — episode production pipeline, agent job execution, approvals, budget tracking, analytics

---

## 2. STACK

**Deployment model: LOCAL-FIRST.**
The Next.js server + Inngest worker run locally on the Director's workstation
(via `pnpm dev` in development, PM2 in production). Supabase remains in the cloud.
This gives the server process direct access to:
- Local SSD (`C:\SandyStudio\Staging\`)
- Google Drive sync folder (`H:\My Drive\SandyStudio_Media\`)
- Locally installed FFmpeg + DaVinci Resolve
- DaVinci FCPXML round-trip without cloud upload/download cycles

The UI is reactive via Supabase realtime subscriptions — same DX as a cloud-deployed
Next.js app, but with full filesystem and binary access for the worker.

**Vercel deployment is rejected.** Vercel serverless functions cannot access local
disk paths or invoke locally installed binaries (FFmpeg, DaVinci CLI). Hybrid
deployment (UI on Vercel + local worker) was considered and rejected: too much sync
complexity for a solo-developer workflow. Revisit in S03+ if multi-user access is needed.

| Layer | Technology | Where it runs |
|-------|-----------|---------------|
| Frontend (Next.js 15 App Router) | Studio UI — all pages | localhost:3000 (dev) / PM2-managed (prod) |
| Job worker (Inngest) | Agent execution, scheduling, retries, FFmpeg invocation | Same Node.js process as Next.js |
| Database | Supabase (PostgreSQL) — all persistent state | Cloud (Supabase) |
| Auth | Supabase Auth — Director login; future multi-user | Cloud |
| Storage — staging | Local SSD: `C:\SandyStudio\Staging\` (TTL 48h) | Local |
| Storage — approved | Google Drive: `H:\My Drive\SandyStudio_Media\` | Local mount → Drive sync |
| AI runtime | Anthropic API (Claude) | Cloud API |
| Media APIs | Kling, Midjourney/fal.ai, Suno/Udio, YouTube | Cloud APIs |
| Video assembly | FFmpeg (local binary) + FCPXML export for DaVinci | Local |

All environment variables in `.env.local`. No credentials in source code.
Reference: `specs/system/auth.md`.

### 2.1 REMOTE ACCESS (Tailscale)

Local-First does not mean local-only. The Director needs to check status, approve gates,
and review assets from any device — phone, iPad, laptop in another country. Standard
pattern for SandyStudio:

**Tailscale (recommended default).**
- Install Tailscale on the workstation running the webapp + on every Director device
  (iPhone, iPad, laptop)
- Workstation gets a stable Tailscale URL: `http://sandystudio.tail-XXXXX.ts.net:3000`
- All devices in the same Tailscale net can reach the URL — no public exposure
- Free for personal use; no port forwarding; no domain needed
- Works from any country/network the Director's device has internet on

**Wake-on-LAN companion (optional).**
If the workstation sleeps when idle:
- Configure WoL in BIOS + OS
- Tailscale subnet router on a small always-on device (Raspberry Pi, NAS, or router)
  sends WoL packet on demand
- Alternative: keep workstation in low-power "S3 sleep + WoL" or always-on (cost: ~$5/mo electricity)

**Public access (NOT default — only when explicitly needed).**
For one-off external reviewers, use Cloudflare Tunnel (`cloudflared`):
- Exposes `https://studio.your-domain.com` backed by the local server
- Supabase Auth gates access (invite-only)
- Disable when the external reviewer is done — no permanent public endpoint

**Future: hybrid deployment.**
If 24/7 availability without the workstation becomes a hard requirement (e.g. team
members in different timezones approving while Director sleeps), split:
- UI → Vercel (always available)
- Worker (Inngest + FFmpeg + Drive access) → local workstation, polls Supabase / receives webhooks

This is a separate sprint, not Sprint 9 scope. Tailscale solves 90% of the remote use
cases without architectural changes. Revisit when actually blocked by Tailscale's limits.

**Sprint 9 deliverable for remote access:**
- `docs/REMOTE_ACCESS.md` — setup walkthrough for Tailscale on Windows workstation + iOS/macOS clients
- Health check endpoint `/api/health` for "is the studio online" probe from any device
- No code changes vs. pure local-first; this is config + docs only

---

## 3. DATABASE SCHEMA

### 3.1 Core tables

#### `episodes`
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
series_id       text NOT NULL                    -- e.g. "SS-S01"
episode_code    text UNIQUE NOT NULL             -- e.g. "SS-S01-E03"
title_working   text
status          episode_status NOT NULL DEFAULT 'BRIEF_PENDING'
governance_mode smallint NOT NULL DEFAULT 1      -- 1=MANUAL 2=HYBRID 3=DELEGATED 4=AUTOTEST
budget_ceiling  numeric(10,2)
budget_spent    numeric(10,2) DEFAULT 0
created_at      timestamptz DEFAULT now()
updated_at      timestamptz DEFAULT now()
```

#### `episode_status` (enum)
```sql
CREATE TYPE episode_status AS ENUM (
  'BRIEF_PENDING',
  'BRIEF_APPROVED',
  'SCRIPT_IN_PROGRESS',
  'SCRIPT_REVIEW',
  'SCRIPT_REVISION',           -- returned for rework with revision log
  'SCRIPT_APPROVED',
  'STORYBOARD_IN_PROGRESS',
  'STORYBOARD_REVIEW',
  'STORYBOARD_REVISION',       -- returned for rework
  'STORYBOARD_APPROVED',
  'ANIMATIC_IN_PROGRESS',      -- EXEC-EDIT assembles static frames + SFX placeholder
  'ANIMATIC_REVIEW',           -- Director reviews timing/comedy rhythm before generation spend
  'ANIMATIC_REVISION',         -- timing adjustments needed
  'ANIMATIC_APPROVED',         -- gates: generation cannot start until this is set
  'GENERATION_IN_PROGRESS',
  'GENERATION_REVIEW',
  'GENERATION_REVISION',       -- shots returned for re-generation
  'GENERATION_APPROVED',
  'PUBLISH_PENDING',
  'PUBLISHED',
  'ANALYTICS_COLLECTING',
  'COMPLETE'
);
```

#### `assets`
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
episode_id      uuid REFERENCES episodes(id)
filename        text UNIQUE NOT NULL             -- full filename per CLAUDE.md §3 convention
file_type       text NOT NULL                    -- SCR | STB | IMG | VID | AUD | BIB | PRO | REV | SPC | STA
description     text
version         smallint NOT NULL DEFAULT 1
status          asset_status NOT NULL DEFAULT 'DRAFT'
staging_path    text                             -- local SSD: C:\SandyStudio\Staging\ (pre-approval)
drive_path      text                             -- Google Drive H:\ path (post-approval only)
staging_expires_at timestamptz                  -- TTL: auto-delete from Staging if not APPROVED within 48h
agent_id        text                             -- which agent produced this
revision_log    text                             -- populated when status = REVISION; reason for return
created_at      timestamptz DEFAULT now()
updated_at      timestamptz DEFAULT now()
```

#### `asset_status` (enum)
```sql
CREATE TYPE asset_status AS ENUM (
  'DRAFT', 'REVIEW', 'REVISION', 'APPROVED', 'LOCKED',
  'NEEDS_HUMAN_TWEAK',  -- max retries hit; best attempt kept; human must adjust
  'REJECTED',           -- permanently rejected; not for re-use
  'INVALIDATED', 'TEST'
);
```

#### `approvals`
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
asset_id        uuid REFERENCES assets(id)
episode_id      uuid REFERENCES episodes(id)     -- nullable: some approvals are episode-level
approved_by     text NOT NULL                    -- 'DIRECTOR' | 'EXEC-DIR-AI'
approval_type   text NOT NULL                    -- asset type or gate name
notes           text
created_at      timestamptz DEFAULT now()
```

#### `jobs`
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
episode_id      uuid REFERENCES episodes(id)
inngest_event   text NOT NULL                    -- event name that triggered this job
inngest_run_id  text                             -- Inngest run ID for tracking
agent_id        text NOT NULL                    -- which agent is handling
status          job_status NOT NULL DEFAULT 'QUEUED'
input_snapshot  jsonb                            -- all inputs at time of job creation
output_ref      text                             -- asset filename or path produced
error_message   text
started_at      timestamptz
completed_at    timestamptz
created_at      timestamptz DEFAULT now()
```

#### `job_status` (enum)
```sql
CREATE TYPE job_status AS ENUM (
  'QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'RETRYING', 'CANCELLED'
);
```

#### `budget_log`
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
episode_id      uuid REFERENCES episodes(id)
job_id          uuid REFERENCES jobs(id)
agent_id        text NOT NULL
api_provider    text NOT NULL                    -- e.g. "anthropic" | "kling" | "fal_ai"
model_or_tier   text                             -- e.g. "claude-haiku-4-5" | "kling-3.0"
operation       text NOT NULL                    -- e.g. "video_generation" | "image_generation"
cost_usd        numeric(10,6) NOT NULL
tokens_used     integer                          -- for LLM calls
duration_ms     integer                          -- for generation calls
created_at      timestamptz DEFAULT now()
```

#### `analytics_reports`
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
episode_id      uuid REFERENCES episodes(id)
collection_point text NOT NULL                   -- 'T+1h' | 'T+24h' | 'T+7d' | 'T+30d'
youtube_video_id text
collected_at    timestamptz DEFAULT now()
data            jsonb NOT NULL                   -- raw metrics per analytics.md schema
flags           jsonb                            -- array of {metric, flag_type, value, threshold}
report_path     text                             -- path to generated .md report
```

#### `series_state`
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
series_id       text UNIQUE NOT NULL
world_bible_path text
style_bible_path text
series_arc_path  text
creative_direction_path text
updated_at      timestamptz DEFAULT now()
```

---

### 3.2 Row Level Security

All tables: Director user has full access.
`EXEC-DIR-AI` role: read + update assets, approvals (no delete, no budget modification).
Service role (Inngest jobs): full access via `SUPABASE_SERVICE_ROLE_KEY`.

---

## 4. INNGEST JOB DEFINITIONS

### 4.1 Event → agent mapping

Every agent that runs asynchronously has an Inngest event and a corresponding function.
Events are named: `sandystudio/<agent-id>/<action>`

| Event | Agent | Trigger | Est. Duration |
|-------|-------|---------|---------------|
| `sandystudio/exec-sw/write-script` | EXEC-SW | Brief approved | 2–5 min |
| `sandystudio/exec-srev/review-script` | EXEC-SREV | Script submitted | 1–3 min |
| `sandystudio/exec-sb/create-storyboard` | EXEC-SB | Script approved | 3–8 min |
| `sandystudio/exec-wchk/check-world` | EXEC-WCHK | Storyboard submitted | 2–4 min |
| `sandystudio/exec-edit/create-animatic` | EXEC-EDIT | Storyboard approved | 3–8 min |
| `sandystudio/exec-vgen/generate-shot` | EXEC-VGEN | **Animatic approved** + per shot | 5–20 min |
| `sandystudio/exec-mgen/generate-music` | EXEC-MGEN | Animatic approved | 5–15 min |
| `sandystudio/exec-thumb/generate-thumbnail` | EXEC-THUMB | Script + metadata approved | 2–5 min |
| `sandystudio/exec-copy/write-metadata` | EXEC-COPY | Script approved | 1–2 min |
| `sandystudio/exec-pub/publish` | EXEC-PUB | All assets approved + Director confirm | 3–10 min |
| `sandystudio/exec-anal/collect` | EXEC-ANAL | Inngest scheduled (T+1h/24h/7d/30d) | 1–3 min |

### 4.2 Job function shape (TypeScript)

```typescript
// All agent jobs follow this pattern — no exceptions.
// Concurrency limits MANDATORY per agent — see table below.
export const execSwWriteScript = inngest.createFunction(
  {
    id: "exec-sw-write-script",
    name: "EXEC-SW: Write Script",
    retries: 2,
    timeouts: { finish: "10m" },
    concurrency: {
      limit: 5,                      // Anthropic API calls — moderate parallelism
      key: "event.data.episodeId"   // separate quotas per episode
    },
  },
  { event: "sandystudio/exec-sw/write-script" },
  async ({ event, step }) => {
    const { episodeId } = event.data

    // Step 1: Load all inputs from Supabase
    const inputs = await step.run("load-inputs", async () => {
      return loadAgentInputs("EXEC-SW", episodeId)
    })

    // Step 2: Gate check — all required inputs present
    const gate = await step.run("gate-check", async () => {
      return validateAgentInputs("EXEC-SW", inputs)
    })
    if (!gate.passed) throw new NonRetriableError(`Gate failed: ${gate.missing}`)

    // Step 3: Execute agent via Anthropic API
    const result = await step.run("execute-agent", async () => {
      return runAgent("EXEC-SW", inputs)
    })

    // Step 4: Save output, update job status, notify
    await step.run("save-output", async () => {
      return saveAgentOutput("EXEC-SW", episodeId, result)
    })
  }
)
```

### 4.2.1 Concurrency limits per agent (MANDATORY)

Without these limits, fan-out (e.g. all shots after animatic approval) will trigger
HTTP 429 rate-limiting from upstream providers. Limits set conservatively — raise
after measuring real provider headroom.

| Agent | Limit | Rationale |
|-------|-------|-----------|
| EXEC-SW, EXEC-SREV, EXEC-COPY, EXEC-WCHK, EXEC-SB, EXEC-EDIT | 5 | Anthropic API — moderate parallelism, episode-keyed |
| **EXEC-VGEN** | **3** | **Kling/Veo-3 video generation — strictest limit. Highest cost, lowest provider tolerance.** |
| EXEC-MGEN | 2 | Suno/Udio — typically tighter rate limits than image/video |
| EXEC-THUMB | 4 | Midjourney/fal.ai image generation |
| EXEC-PUB | 1 | YouTube Data API — sequential to avoid quota burn |
| EXEC-ANAL | 2 | YouTube Data API — read-only, can be slightly parallel |

All limits keyed by `event.data.episodeId` so multiple episodes do not starve each other.
Implement as a shared config, not magic numbers per function:

```typescript
// lib/inngest/concurrency.ts
export const CONCURRENCY_LIMITS = {
  "exec-sw": 5, "exec-srev": 5, "exec-sb": 5, "exec-wchk": 5,
  "exec-edit": 5, "exec-copy": 5,
  "exec-vgen": 3,    // most expensive, tightest provider limits
  "exec-mgen": 2,
  "exec-thumb": 4,
  "exec-pub": 1,
  "exec-anal": 2,
} as const
```

### 4.3 Analytics scheduled jobs

```typescript
// Triggered by Inngest cron after publish
// T+1h: "0 * * * *" relative to publish_timestamp
// T+24h: "0 0 * * *" relative to publish_timestamp  
// T+7d: scheduled at publish time + 7 days
// T+30d: scheduled at publish time + 30 days

export const scheduleAnalyticsCollection = inngest.createFunction(
  { id: "schedule-analytics", name: "Schedule analytics collection" },
  { event: "sandystudio/exec-pub/published" },
  async ({ event, step }) => {
    const { episodeId, publishTimestamp } = event.data
    const points = [
      { label: "T+1h",  delay: 60 * 60 * 1000 },
      { label: "T+24h", delay: 24 * 60 * 60 * 1000 },
      { label: "T+7d",  delay: 7 * 24 * 60 * 60 * 1000 },
      { label: "T+30d", delay: 30 * 24 * 60 * 60 * 1000 },
    ]
    for (const point of points) {
      await step.sendEvent(`schedule-${point.label}`, {
        name: "sandystudio/exec-anal/collect",
        data: { episodeId, collectionPoint: point.label },
        ts: new Date(publishTimestamp + point.delay),
      })
    }
  }
)
```

### 4.4 Fan-out: parallel shot generation

Video shots are generated in parallel (one job per shot, up to `config.max_parallel_shots`).

```typescript
// After storyboard approved: fan out one job per shot
await step.sendEvent("fan-out-shots",
  shots.map(shot => ({
    name: "sandystudio/exec-vgen/generate-shot",
    data: { episodeId, shotId: shot.id },
  }))
)
```

---

## 5. API ROUTES (Next.js App Router)

### 5.1 Route structure

```
app/
├── (studio)/
│   ├── layout.tsx              ← Auth guard — Director only
│   ├── page.tsx                ← Dashboard
│   ├── episodes/
│   │   ├── page.tsx            ← Episode list
│   │   ├── new/page.tsx        ← Create episode brief
│   │   └── [id]/
│   │       ├── page.tsx        ← Episode detail
│   │       ├── assets/page.tsx ← Asset list + status
│   │       ├── budget/page.tsx ← Budget breakdown
│   │       └── analytics/page.tsx ← Analytics reports
│   ├── series/
│   │   └── [id]/page.tsx       ← Series state (bibles, arc, style)
│   └── settings/page.tsx       ← Config, providers, thresholds
└── api/
    ├── episodes/
    │   ├── route.ts            ← GET list, POST create
    │   └── [id]/
    │       ├── route.ts        ← GET, PATCH status
    │       ├── approve/route.ts ← POST approval (Director gate)
    │       └── trigger/route.ts ← POST trigger next agent job
    ├── assets/
    │   ├── route.ts            ← GET list
    │   └── [id]/
    │       ├── route.ts        ← GET, PATCH
    │       └── approve/route.ts
    ├── jobs/
    │   └── route.ts            ← GET job list + status
    ├── budget/
    │   └── route.ts            ← GET budget summary
    └── webhooks/
        └── inngest/route.ts    ← Inngest webhook handler (INNGEST_SIGNING_KEY)
```

### 5.2 Key route contracts

#### `POST /api/episodes/[id]/approve`
```typescript
// Body
{ approvalType: string, notes?: string }

// Response
{ approved: boolean, nextStep: string, jobTriggered?: string }

// Side effects
// → Creates row in approvals table
// → If governance mode allows: triggers next Inngest job
// → Updates episode status
```

#### `POST /api/episodes/[id]/trigger`
```typescript
// Body
{ agentId: string, inputOverrides?: Record<string, unknown> }

// Response  
{ jobId: string, inngestRunId: string }

// Auth: Director only. Used for manual re-triggers in Mode 1.
```

#### `GET /api/budget`
```typescript
// Response
{
  totalAllocated: number,
  totalSpent: number,
  remaining: number,
  burnRate: number,        // per episode, trailing average
  projectedRunway: number, // episodes remaining at burn rate
  byEpisode: Array<{ episodeId, total, breakdown }>
}
```

---

## 6. STUDIO UI PAGES

### 6.1 Dashboard (`/`)

```
┌─────────────────────────────────────────────────────┐
│ SandyStudio                           [Mode: MANUAL] │
├─────────────────────────────────────────────────────┤
│ Active Episodes                                      │
│  SS-S01-E01  GENERATION_IN_PROGRESS  12/24 shots ██░│
│  SS-S01-E02  SCRIPT_REVIEW           [APPROVE] [↻]  │
│                                                      │
│ Budget                                               │
│  Spent $42.18 / $200.00   [████░░░░░░] 21%          │
│  Runway: ~7 episodes at current burn rate            │
│                                                      │
│ Pending Approvals (2)                                │
│  SS-S01-E02-SCR-script-v01  ART-HW review  [VIEW]   │
│  SS-S01-E01-IMG-shot_04-v01  EXEC-VGEN     [VIEW]   │
│                                                      │
│ Recent Jobs                                          │
│  EXEC-VGEN  shot_03  ✅ 4m12s                        │
│  EXEC-VGEN  shot_04  ✅ 6m08s                        │
│  EXEC-VGEN  shot_05  ⏳ running 2m...                │
└─────────────────────────────────────────────────────┘
```

### 6.2 Episode Detail (`/episodes/[id]`)

```
┌─────────────────────────────────────────────────────┐
│ SS-S01-E02  "Working Title"        [SCRIPT_REVIEW]  │
├─────────────────────────────────────────────────────┤
│ Pipeline                                             │
│  ✅ Brief    ✅ Story Brief  ⏳ Script  ○ Storyboard  │
│  ○ World Check  ○ Generation  ○ Distribution         │
│                                                      │
│ Current: Script Review                               │
│  File: SS-S01-E02-SCR-script-v01-REVIEW.md          │
│  Submitted by: EXEC-SW  |  ART-HW review: pending   │
│  [VIEW SCRIPT] [APPROVE AS DIRECTOR] [REQUEST REVISION]│
│                                                      │
│ Assets (6)                                           │
│  [Brief APPROVED] [Story Brief APPROVED]             │
│  [Script REVIEW]  [SEO Guidance DRAFT]               │
│                                                      │
│ Budget: $4.20 spent / $25.00 ceiling                 │
│ Jobs (3): 2 completed, 1 queued                      │
└─────────────────────────────────────────────────────┘
```

### 6.3 Approval Queue (`/episodes/[id]` → approval panel)

Every item awaiting Director decision appears here with:
- File preview (rendered Markdown for .md files, image/video preview for media)
- Agent that produced it + agent review notes
- [APPROVE] [REQUEST REVISION] [REJECT] buttons
- Governance mode indicator — which approvals can EXEC-DIR-AI handle vs Director-only

### 6.4 Budget Page (`/episodes/[id]/budget`)

- Per-call log: agent, provider, model, operation, cost, timestamp
- Chart: cumulative spend over time
- Model routing compliance table (per BOARD-FIN audit logic)
- Alert threshold indicators

### 6.5 Settings (`/settings`)

Exposes `config/defaults.yaml` as editable form fields — no raw YAML editing in prod.
Sections:
- `production`: target_runtime, act_count, shot targets
- `visual`: palette defaults, composition rules
- `audio`: tempo range, track count defaults
- `seo`: default tags, series tags, hashtags
- `analytics`: benchmark thresholds
- `finance`: cost estimates, alert thresholds, ROI threshold
- `providers`: active provider per contract (read from `config/providers.yaml`)

---

### 6.6 Approval Authority Matrix (`/series/[id]/approval-authority`)

**When:** Configured once per series at project start, before any production begins.
**Who:** Director only — this page is always Director-only, no delegation.
**Purpose:** The Director explicitly declares, upfront, who reviews and approves each
category of output. This makes implicit delegation explicit and auditable.

```
┌─────────────────────────────────────────────────────────────────┐
│ Approval Authority — Sandy Studio S01                           │
│ "Who approves what. Set once. Override per episode if needed."  │
├──────────────────────────┬──────────────────────────────────────┤
│ APPROVAL CATEGORY        │ APPROVER                             │
├──────────────────────────┼──────────────────────────────────────┤
│ 🖼  Character visuals     │ ● Director personally               │
│    (images, references)  │ ○ Delegate to: ____________         │
│    [VISUAL — human only] │                                      │
├──────────────────────────┼──────────────────────────────────────┤
│ 🖼  Location references   │ ● Director personally               │
│    (world bible images)  │ ○ Delegate to: ____________         │
│    [VISUAL — human only] │                                      │
├──────────────────────────┼──────────────────────────────────────┤
│ 🎬  Generated shots       │ ● Director personally               │
│    (video output review) │ ○ Delegate to: ____________         │
│    [VISUAL — human only] │                                      │
├──────────────────────────┼──────────────────────────────────────┤
│ 🖼  Thumbnails            │ ● Director personally               │
│    [VISUAL — human only] │ ○ Delegate to: ____________         │
├──────────────────────────┼──────────────────────────────────────┤
│ 📄  Scripts               │ ○ Director personally               │
│                          │ ○ Delegate to: ____________         │
│                          │ ● EXEC-DIR-AI (Mode 2/3)            │
├──────────────────────────┼──────────────────────────────────────┤
│ 📋  Storyboards           │ ○ Director personally               │
│                          │ ○ Delegate to: ____________         │
│                          │ ● EXEC-DIR-AI (Mode 2/3)            │
├──────────────────────────┼──────────────────────────────────────┤
│ 🎵  Music/audio           │ ○ Director personally               │
│                          │ ● Delegate to: ____________         │
│                          │ ○ EXEC-DIR-AI (Mode 2/3)            │
├──────────────────────────┼──────────────────────────────────────┤
│ 📝  Copy/metadata         │ ○ Director personally               │
│                          │ ○ Delegate to: ____________         │
│                          │ ● EXEC-DIR-AI (Mode 2/3)            │
├──────────────────────────┼──────────────────────────────────────┤
│ 🚀  PUBLISH               │ ● Director personally (HARD LIMIT)  │
│    [always Director]     │ Cannot be delegated                  │
└──────────────────────────┴──────────────────────────────────────┘

  [SAVE APPROVAL MATRIX]    [RESET TO DEFAULTS]
```

**Rules enforced by the UI:**

1. **Visual categories** (🖼 🎬) default to "Director personally" and show a visible warning label — "Visual content: defaults to Director review." The Director can change this to any option (delegate to human or EXEC-DIR-AI), but must do so explicitly. The default is never silent.

2. **PUBLISH** row is locked to "Director personally" — no radio buttons, no delegation UI. This is the only category with a hard lock.

3. **"Delegate to [human name]"** field accepts a free-text name. In a multi-user future, this will be a user selector. For now: a name label for audit trail.

4. **Override per episode:** The matrix sets series defaults. Any episode can override an individual category via the Episode Detail page → Settings tab. Override is logged with rationale.

5. **Governance mode interaction:** Mode 3/4 (DELEGATED/AUTOTEST) only auto-approves categories where the matrix allows EXEC-DIR-AI. For categories where the matrix says "Director personally" or "human delegate" — Mode 3 still waits for that human. The matrix overrides the mode for each category individually.

**Database addition (new table):**

```sql
CREATE TABLE approval_authority (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
  series_id       text NOT NULL
  episode_id      text            -- null = series default; set = episode override
  category        text NOT NULL   -- 'character_visual' | 'location_ref' | 'generated_shots'
                                  -- | 'thumbnails' | 'scripts' | 'storyboards'
                                  -- | 'audio' | 'copy' | 'publish'
  approver_type   text NOT NULL   -- 'director' | 'human_delegate' | 'exec_dir_ai'
  approver_name   text            -- human name if human_delegate; null otherwise
  is_visual       boolean NOT NULL DEFAULT false  -- visual=true blocks AI approval always
  created_at      timestamptz DEFAULT now()
  set_by          text NOT NULL   -- always Director user ID
);
```

**UX note (carry into Sprint 6 design):** This page is the first thing the Director
sees when starting a new series. It is a declaration of intent. The default state should
show all visual categories pre-locked to "Director personally" so the Director actively
has to choose to delegate — not the other way around.

---

## 7. AGENT EXECUTION MODEL

### 7.1 How agents run

In production, agents are TypeScript functions inside Inngest jobs.
Each agent job:
1. Loads all inputs from Supabase (assets, config, bibles)
2. Validates gate: all required inputs present and APPROVED
3. Calls Anthropic API with the agent's system prompt + structured inputs
4. Parses the structured output
5. Saves output as a new asset row in Supabase
6. Sends notification event for Director review (or auto-approves in Mode 3/4)

### 7.2 Agent system prompt loading

Each agent's `.md` file (from `agents/`) is loaded as the system prompt.
The agent ID maps directly to the file path:

```typescript
const AGENT_PROMPT_MAP: Record<string, string> = {
  "EXEC-SW":   "agents/exec/screenwriter.md",
  "EXEC-SREV": "agents/exec/script_reviewer.md",
  // ... all 25 agents
}
// Prompts are loaded from the filesystem at build time or from Supabase at runtime
// config/defaults.yaml → app.prompt_source: "filesystem" | "database"
```

### 7.3 Governance mode enforcement

The `governance_mode` field on each episode controls auto-progression:

```typescript
async function onAgentCompleted(episodeId: string, agentId: string, output: AgentOutput) {
  const episode = await getEpisode(episodeId)
  const isHardLimit = HARD_LIMITS.includes(output.nextGate)

  if (isHardLimit || episode.governance_mode === 1) {
    // Always require Director — send notification, await approval
    await notifyDirector(episodeId, output)
  } else if (episode.governance_mode === 3 || episode.governance_mode === 4) {
    // Auto-approve and trigger next step
    await autoApprove(episodeId, output)
    await triggerNextAgent(episodeId)
  }
  // Mode 2: selective — per-gate logic from config
}

const HARD_LIMITS = ["PUBLISH", "LOCKED", "BUDGET_INCREASE", "MODE_CHANGE"]

// For every approval gate: check approval_authority table first.
// The matrix is the source of truth — governance mode only applies where matrix allows it.
// If matrix says director/human_delegate for this category → wait for that human,
// regardless of episode governance_mode.
// If matrix says exec_dir_ai → auto-approve is permitted (even for visual categories,
// if Director explicitly configured it that way).
const getApprover = (episodeId: string, category: string) =>
  lookupApprovalAuthority(episodeId, category) // returns { type, name }
```

### 7.4 Input loading contract

All inputs loaded by `loadAgentInputs(agentId, episodeId)`:
```typescript
// Resolves all inputs for an agent from Supabase
// Returns: { [inputName]: { path, content, version, status } }
// Throws if any REQUIRED input is not APPROVED
// Returns fallback from config/defaults.yaml for optional inputs
```

---

## 8. EPISODE STATE MACHINE

```
BRIEF_PENDING
  │ Director approves brief
  ▼
BRIEF_APPROVED
  │ → triggers: EXEC-SW (script), EXEC-COPY (metadata draft starts)
  ▼
SCRIPT_IN_PROGRESS
  │ EXEC-SW completes
  ▼
SCRIPT_REVIEW
  │ ART-HW reviews → EXEC-SREV QA → Director approves (or EXEC-DIR-AI in Mode 3)
  ├─ [REVISION] → SCRIPT_REVISION → back to EXEC-SW with revision_log
  ▼
SCRIPT_APPROVED
  │ → triggers: EXEC-SB (storyboard), EXEC-MGEN (music brief)
  ▼
STORYBOARD_IN_PROGRESS
  │ EXEC-SB completes → EXEC-WCHK + ART-CONT check
  ▼
STORYBOARD_REVIEW
  │ Director approves (or EXEC-DIR-AI in Mode 3)
  ├─ [REVISION] → STORYBOARD_REVISION → back to EXEC-SB with revision_log
  ▼
STORYBOARD_APPROVED
  │ → triggers: EXEC-EDIT (animatic assembly)
  ▼
ANIMATIC_IN_PROGRESS
  │ EXEC-EDIT assembles: static storyboard frames + SFX placeholders + music sketch
  │ Outputs: preview .mp4 (for Director) + FCPXML/EDL (for DaVinci import)
  │ Staging path: C:\SandyStudio\Staging\animatics\
  ▼
ANIMATIC_REVIEW
  │ Director reviews comedy timing and rhythm in preview .mp4
  │ Optional: open FCPXML in DaVinci, adjust pauses manually, re-export
  ├─ [REVISION] → ANIMATIC_REVISION → EXEC-SB adjusts shot durations
  ▼
ANIMATIC_APPROVED  ← GENERATION GATE: nothing generates until this is set
  │ → triggers: EXEC-VGEN fan-out (all shots), EXEC-MGEN (full music), EXEC-THUMB
  ▼
GENERATION_IN_PROGRESS
  │ All shots: max_retries=3 per shot
  │   → on pass: asset staged to C:\SandyStudio\Staging\video\
  │   → on 3 fails: asset status = NEEDS_HUMAN_TWEAK, pipeline continues
  │ All music + thumbnails complete
  ▼
GENERATION_REVIEW
  │ Director reviews generated assets (visual approval per Approval Authority Matrix)
  │ Shots with NEEDS_HUMAN_TWEAK flagged for attention first
  ├─ [REVISION] → GENERATION_REVISION → individual shots re-queued
  ▼
GENERATION_APPROVED
  │ → all APPROVED assets copied: Staging → H:\My Drive\SandyStudio_Media\approved\
  │ → Staging TTL reset: non-approved Staging files deleted after 48h
  │ → triggers: EXEC-COPY (final metadata), pre-publish checklist
  ▼
PUBLISH_PENDING
  │ Director gives explicit publish approval (HARD LIMIT — always Director)
  │ → EXEC-PUB executes
  ▼
PUBLISHED
  │ → schedules: EXEC-ANAL at T+1h, T+24h, T+7d, T+30d
  ▼
ANALYTICS_COLLECTING
  │ All 4 collection points complete
  ▼
COMPLETE
```

State transitions are recorded in `approvals` table with `approved_by` and timestamp.

---

## 9. ENVIRONMENT VARIABLES

All values from `.env.local` (dev) / `.env.production` loaded by PM2 (prod, local-first).
No defaults hardcoded in application code.

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Inngest
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

# Anthropic
ANTHROPIC_API_KEY=

# YouTube OAuth (from auth.md)
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
YOUTUBE_REFRESH_TOKEN=

# Media generation APIs (resolved via providers.yaml)
KLING_API_KEY=
FAL_AI_API_KEY=
SUNO_API_KEY=

# Google Drive
GOOGLE_DRIVE_CLIENT_ID=
GOOGLE_DRIVE_CLIENT_SECRET=
GOOGLE_DRIVE_REFRESH_TOKEN=
GOOGLE_DRIVE_MEDIA_ROOT_ID=     # folder ID for SandyStudio_Media

# App config
NEXT_PUBLIC_APP_URL=
```

---

## 10. DIRECTORY STRUCTURE (Next.js project)

```
sandystudio-app/                 ← separate repository or monorepo package
├── app/
│   ├── (studio)/               ← auth-guarded layout
│   │   ├── layout.tsx
│   │   ├── page.tsx            ← Dashboard
│   │   ├── episodes/
│   │   ├── series/
│   │   └── settings/
│   └── api/
│       ├── episodes/
│       ├── assets/
│       ├── jobs/
│       ├── budget/
│       └── webhooks/inngest/
├── inngest/
│   ├── client.ts               ← Inngest client init
│   ├── functions/
│   │   ├── exec-sw.ts
│   │   ├── exec-srev.ts
│   │   ├── exec-sb.ts
│   │   ├── exec-wchk.ts
│   │   ├── exec-edit.ts
│   │   ├── exec-vgen.ts
│   │   ├── exec-mgen.ts
│   │   ├── exec-copy.ts
│   │   ├── exec-thumb.ts
│   │   ├── exec-pub.ts
│   │   └── exec-anal.ts
│   └── schedules/
│       └── analytics.ts
├── lib/
│   ├── agents/
│   │   ├── runner.ts           ← loadAgentInputs, runAgent, saveAgentOutput
│   │   ├── gate.ts             ← validateAgentInputs
│   │   └── prompts.ts          ← AGENT_PROMPT_MAP loader
│   ├── supabase/
│   │   ├── client.ts           ← browser client
│   │   └── server.ts           ← server client (service role)
│   ├── budget.ts               ← cost logging, alert checking
│   └── governance.ts           ← mode enforcement, hard limit checks
├── components/
│   ├── pipeline/               ← Episode pipeline visualisation
│   ├── approval/               ← Approval panels
│   ├── budget/                 ← Budget charts
│   └── ui/                     ← Shared components
├── config/
│   └── defaults.yaml           ← All fallback config (from C:\SandyStudio\config\)
├── agents/                     ← Agent .md files (from C:\SandyStudio\agents\)
├── supabase/
│   └── migrations/             ← All DB migrations
├── .env.local
└── inngest.ts                  ← Inngest serve handler
```

---

## 11. OPEN DECISIONS

| # | Decision | Resolution | Date |
|---|----------|-----------|------|
| W-001 | Agent prompt source | **HYBRID** — `.md` files in `agents/` are source of truth (git-versioned, code review). On deploy: prompts synced into Supabase `agent_prompts` table. UI Settings allows hot-edit for experiments — edits write to Supabase only; PR back to `.md` required to persist across redeploy. | 2026-04-25 |
| W-002 | Web app repo | **A) Monorepo** — Next.js inside `C:\SandyStudio\webapp\`. Solo dev, keeps specs + agent definitions + code in one git history. | 2026-04-25 |
| W-003 | First UI sprint scope | **B) Approval queue first** — highest pain point. Dashboard/budget/analytics in subsequent sprints. | 2026-04-25 |
| W-004 | `config/defaults.yaml` location | **HYBRID** (same pattern as W-001) — yaml in repo is source of truth, synced to Supabase `app_config` table on deploy. UI Settings edits Supabase, with explicit "promote to repo" action. | 2026-04-25 |
| W-005 | Approval Authority Matrix — entry point | **C) Both** — forced wizard on first series creation; Settings tab accessible any time afterward. | 2026-04-25 |

---

*SandyStudio webapp.md | v0.1 | Status: DRAFT*
*The spec defines the machine. The machine runs the studio.*
