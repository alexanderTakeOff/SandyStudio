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

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Next.js 15 (App Router) | Studio UI — all pages |
| Database | Supabase (PostgreSQL) | All persistent state |
| Job queue | Inngest | Agent execution, scheduling, retries |
| Deployment | Vercel | Hosting, edge functions, CI/CD |
| Auth | Supabase Auth | Director login; future multi-user |
| Storage | Google Drive (via API) | Media files — raw, reviewed, approved |
| AI runtime | Anthropic API (Claude) | All agent logic |
| Media APIs | Kling, Midjourney/fal.ai, Suno/Udio, YouTube | Generation + distribution |

All environment variables in `.env.local` (dev) and Vercel Environment Variables (prod).
No credentials in source code. Reference: `specs/system/auth.md`.

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
  'SCRIPT_APPROVED',
  'STORYBOARD_IN_PROGRESS',
  'STORYBOARD_REVIEW',
  'STORYBOARD_APPROVED',
  'GENERATION_IN_PROGRESS',
  'GENERATION_REVIEW',
  'GENERATION_APPROVED',
  'PUBLISH_PENDING',
  'PUBLISHED',
  'ANALYTICS_COLLECTING'
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
storage_path    text                             -- Google Drive path or DB path
agent_id        text                             -- which agent produced this
created_at      timestamptz DEFAULT now()
updated_at      timestamptz DEFAULT now()
```

#### `asset_status` (enum)
```sql
CREATE TYPE asset_status AS ENUM (
  'DRAFT', 'REVIEW', 'APPROVED', 'LOCKED', 'INVALIDATED', 'TEST'
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
| `sandystudio/exec-vgen/generate-shot` | EXEC-VGEN | Storyboard approved + per shot | 5–20 min |
| `sandystudio/exec-mgen/generate-music` | EXEC-MGEN | Storyboard approved | 5–15 min |
| `sandystudio/exec-thumb/generate-thumbnail` | EXEC-THUMB | Script + metadata approved | 2–5 min |
| `sandystudio/exec-copy/write-metadata` | EXEC-COPY | Script approved | 1–2 min |
| `sandystudio/exec-pub/publish` | EXEC-PUB | All assets approved + Director confirm | 3–10 min |
| `sandystudio/exec-anal/collect` | EXEC-ANAL | Inngest scheduled (T+1h/24h/7d/30d) | 1–3 min |

### 4.2 Job function shape (TypeScript)

```typescript
// All agent jobs follow this pattern — no exceptions
export const execSwWriteScript = inngest.createFunction(
  {
    id: "exec-sw-write-script",
    name: "EXEC-SW: Write Script",
    retries: 2,
    timeouts: { finish: "10m" },
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
  ▼
SCRIPT_APPROVED
  │ → triggers: EXEC-SB (storyboard), EXEC-MGEN (music brief)
  ▼
STORYBOARD_IN_PROGRESS
  │ EXEC-SB completes → EXEC-WCHK + ART-CONT check
  ▼
STORYBOARD_REVIEW
  │ Director approves (or EXEC-DIR-AI in Mode 3)
  ▼
STORYBOARD_APPROVED
  │ → triggers: EXEC-VGEN fan-out (all shots), EXEC-THUMB, EXEC-MGEN execute
  ▼
GENERATION_IN_PROGRESS
  │ All shots + music + thumbnail complete
  ▼
GENERATION_REVIEW
  │ Director reviews generated assets
  ▼
GENERATION_APPROVED
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

All values from `.env.local` (dev) / Vercel Environment Variables (prod).
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

| # | Decision | Options | Notes |
|---|----------|---------|-------|
| W-001 | Agent prompt source | A) Filesystem (build-time) B) Supabase (runtime-editable) | B = Director edits agent prompts from UI |
| W-002 | Web app repo | A) Monorepo with C:\SandyStudio\ B) Separate repo | A = simpler for solo dev |
| W-003 | First UI sprint scope | A) Full dashboard B) Approval queue only C) Episode tracker only | Recommend B — highest value fastest |
| W-004 | config/defaults.yaml location | A) Static in repo B) Supabase table (editable via Settings UI) | B = all params in UI as promised |

---

*SandyStudio webapp.md | v0.1 | Status: DRAFT*
*The spec defines the machine. The machine runs the studio.*
