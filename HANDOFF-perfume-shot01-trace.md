# HANDOFF — Perfume Shot 1 Prompt Trace

Snapshot for a fresh Claude Code session (Director switched from cloud-VM to local laptop).
Read this **after** CLAUDE.md + PLAN.md (per the §9 session-start protocol).

---

## Goal

Pipeline currently produces low-зрелищность video: gags flat, emotions mis-placed,
location described in bible by 1 image + 1 short prompt. Suspect cause: information
is dropped at one of the agent hand-offs (Brief → Script → Storyboard → World-Check →
Animatic → VGEN → Veo-3) and the prompts arriving at the image / Veo-3 generators
are near-empty.

Diagnostic case: trace **every** prompt-bearing artefact for the first shot of the
last episode we ran end-to-end:

- **Episode:** `SS-S14-E01` "Perfume Vial"
- **Shot:** `SS-S14-E01-A1-SC01-SH01` (Act 1, Scene 1, Shot 1)
- **Pipeline state (per RESUME-AFTER-CLEAR.md):** reached Publish on mocks; Animatic v05
  APPROVED with `metadata.animatic_v1`; 13 EREF v2 records APPROVED; VGEN ran on
  mocks (3 fake shots) — awaiting first real Veo-3 run.

Deliverable: **one Markdown report** with two parts —
1. Per-agent table (who produced what, fed to whom)
2. Information-loss diagnostics (which fields existed upstream and got dropped/collapsed downstream)

This becomes the evidence base for the next quality push (richer location, multi-image
bible, beat propagation, etc.).

---

## Status

| Done | Item |
|---|---|
| ✅ | Plan approved by Director (Phases 1–4) |
| ✅ | Episode + shot id confirmed: `SS-S14-E01` / `SS-S14-E01-A1-SC01-SH01` |
| ✅ | Output format confirmed: MD + diagnostics (no JSON dump) |
| ✅ | Output path confirmed: `Staging/diagnostics/perfume-shot01-prompt-trace.md` (no SS- prefix to avoid `naming-validator.cjs`) |
| ❌ | DB access — **THIS IS THE BLOCKER** |
| ❌ | Phases 1–4 (DB extraction → bible pull → per-agent walk → report) |

---

## Blocker — pick ONE access path

The cloud-VM session could not reach the production Supabase. New local session has options:

### Path A (recommended) — `webapp/.env.local`

Director copies live values from the working machine (or Supabase dashboard
→ Settings → API) into `webapp/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

Then ask Claude to: write `webapp/scripts/extract-prompt-trace.ts`, run it,
generate the report.

### Path B — add SandyStudio Supabase to MCP

The Supabase MCP server in this account is bound to a different org
("Jenny Assistant RAG" + "supabase-medroute-auto-created" — both INACTIVE,
neither is SandyStudio).

Two sub-paths:
- B.1: Director's main Supabase user is a member of SandyStudio org → re-issue PAT,
  swap it in MCP config, restart Claude Code.
- B.2: SandyStudio is under a separate Supabase account → either invite main user
  into the org, OR run a second MCP server (`claude mcp add supabase-sandystudio …`)
  with a PAT from that other account.

If MCP works, queries go through `mcp__30e3b4b7-…__execute_sql` directly — no script needed.

---

## Concrete next steps (for the new session)

1. Read `CLAUDE.md` and `PLAN.md` (§9 protocol). Verify Mode is `===5===` before writing files.
2. Read this handoff.
3. Pick Path A or B above. For Path A — verify `webapp/.env.local` exists with both keys.
4. If Path A: install deps if needed (`cd webapp && npm install --legacy-peer-deps`),
   then write the extraction script (skeleton below).
5. Run script, generate report at `Staging/diagnostics/perfume-shot01-prompt-trace.md`.
6. Show the report to Director. Discuss diagnostics.

---

## Extraction logic (reuse this — already designed and approved)

### Phase 1 — DB queries (Supabase, read-only)

```sql
-- 1. Episode
SELECT id, episode_code, status, governance_mode, budget_spent
FROM episodes
WHERE episode_code = 'SS-S14-E01';

-- 2. Series-level bibles (Style, World, Characters)
SELECT id, filename, file_type, status, content, metadata
FROM assets
WHERE filename LIKE 'SS-S14-BIB-%' AND status = 'APPROVED';

-- 3. Episode-level assets (every prompt-bearing artefact)
SELECT id, filename, file_type, status, version, content, metadata,
       staging_path, drive_path, created_at
FROM assets
WHERE episode_id = '<episode_id_from_step_1>'
ORDER BY created_at;

-- 4. Per-agent jobs that touched shot 1
SELECT id, agent_id, inngest_event, status, input_snapshot, output_ref,
       started_at, completed_at
FROM jobs
WHERE episode_id = '<episode_id>'
  AND (input_snapshot::text LIKE '%A1-SC01-SH01%'
    OR output_ref LIKE '%A1-SC01-SH01%'
    OR output_ref LIKE '%-SH01-%');

-- 5. Approvals timeline
SELECT a.id, a.asset_id, a.approved_by, a.approval_type, a.created_at,
       ass.filename
FROM approvals a JOIN assets ass ON ass.id = a.asset_id
WHERE a.episode_id = '<episode_id>'
ORDER BY a.created_at;

-- 6. Activity events (state transitions)
SELECT id, event_type, agent_id, asset_id, created_at, payload
FROM activity_events
WHERE episode_id = '<episode_id>'
ORDER BY created_at;

-- 7. VGEN cost log for shot 1
SELECT id, agent_id, api_provider, operation, cost_usd, duration_ms, created_at
FROM budget_log
WHERE episode_id = '<episode_id>' AND agent_id = 'EXEC-VGEN';
```

### Phase 2 — Pull series-level prompt sources

From the BIB rows (step 2 above) extract:
- **Style Bible** → `style_anchor_text` (a short string spliced as prompt segment 1)
- **World Bible** → location entry matching `shot.location` + lighting rules for `shot.time_of_day`
- **Character profiles** → `canonical_prompt_fragment` for each character in `shot.characters[]`,
  plus any `physics_states` addenda

### Phase 3 — Per-agent walk

For each stage in the canonical chain, record `{ agent, stage, output_asset_id, status, downstream_consumer, prompt_text_or_excerpt }`:

| # | Agent | Stage | Asset filename pattern |
|---|---|---|---|
| 1 | Director / ART-HW | Brief | `SS-S14-E01-SPC-brief-*` |
| 2 | EXEC-SW | Script | `SS-S14-E01-SCR-*` |
| 3 | EXEC-SREV | Script QA | `SS-S14-E01-REV-script_qa-*` |
| 4 | EXEC-SB | Storyboard | `SS-S14-E01-STB-act1-*` (shot record A1-SC01-SH01) |
| 5 | EXEC-WCHK | World check | `SS-S14-E01-REV-world_check_act1-*` |
| 6 | ART-CONT | Continuity | continuity REV row if any |
| 7 | EXEC-EDIT | Animatic v05 | asset with `metadata.animatic_v1` covering shot 1 |
| 8 | EREF v2 | Visual reference | EREF assets attached to shot 1 (13 APPROVED total in episode) |
| 9 | EXEC-VGEN | Build prompt | `jobs.input_snapshot` (the full upstream bundle) + persisted `SS-S14-E01-PRO-video_*-SH01-*` OR `assets.metadata.image_prompt.history[]` on the VID asset |
| 10 | Veo 3 (Gemini) | Video gen | `SS-S14-E01-VID-shot_*-SH01-*` + `budget_log` cost row |

### Phase 4 — Report sections

```
# Shot-1 Prompt Trace — SS-S14-E01 "Perfume Vial"

## 1. Shot identity
shot_id, location, characters, duration, mood, expected_gag.

## 2. Per-agent table
| # | Agent | Stage | Output (asset / row) | Status | Downstream | Description |

## 3. Full prompts per stage
- Brief excerpt (shot-1 relevant)
- Script: scene-1 prose + dialogue + emotion beats
- Storyboard: full shot record (every populated field verbatim)
- Style Bible: style_anchor_text
- World Bible: location entry + lighting rules
- Character profiles: canonical_prompt_fragment per character
- Animatic v1 metadata for shot 1
- EXEC-VGEN job.input_snapshot
- EXEC-VGEN final assembled prompt (string sent to Veo 3)
- Veo 3 response (provider, cost, output filename)

## 4. Information-loss diagnostics  ← the headline
- Brief → Script: expected_gag / comedy_beats / emotional arc — survived?
- Script → Storyboard: which beats made it into shot.action_prose; what collapsed?
- World Bible → Storyboard: location 1 sentence vs full bible entry?
- Character Profile → VGEN: canonical_prompt_fragment injected verbatim? physics_states present?
- Storyboard → VGEN final prompt: which fields spliced into the 8 segments; which dropped?
- VGEN → Veo 3: anything stripped before API call?
For each finding: cite upstream field + downstream gap + asset_ids; character counts on both sides.
```

---

## Critical code references (read-only — do NOT edit)

| File | Lines | What |
|---|---|---|
| `specs/schemas/prompt.md` | 108–149 | 8-segment prompt assembly contract |
| `specs/schemas/shot.md` | full | shot field list (used to detect empty/default fields) |
| `specs/schemas/brief.md`, `specs/schemas/script.md` | full | upstream contracts |
| `webapp/lib/api/vgen-shot-helpers.ts` | 296–328 | `buildShotPromptV2()` — actual code splicing the 8 segments |
| `webapp/lib/agents/runner.ts` | ~1100–1150 | EXEC-VGEN dispatch + `referenceImageBase64` injection |
| `webapp/inngest/functions/exec-vgen.ts` | 82–200 | pilot-pass + fan-out logic |
| `webapp/supabase/migrations/0002_core_tables.sql` | full | table shapes (episodes, assets, jobs, approvals, activity_events, budget_log, series_state) |
| `webapp/supabase/migrations/0020_assets_metadata.sql` | full | `assets.metadata.image_prompt.history[]` JSONB layout |
| `agents/exec/visual_generator.md` | 116–175 | EXEC-VGEN spec — Steps 1–5 of generation workflow |
| `agents/exec/storyboarder.md`, `screenwriter.md`, `world_checker.md` | full | upstream agent specs |
| `RESUME-AFTER-CLEAR.md` | 131–135 | confirms SS-S14-E01 status |

CLAUDE.md §11 (PARAMETER COMPLETENESS AT GATE) is the governance rule that this
trace will be measured against — every parameter EXEC-VGEN needs must be fully
defined upstream.

---

## Verification (definition of done)

1. DB connectivity confirmed (Path A: `.env.local` works; or Path B: `list_projects` shows SandyStudio).
2. Episode row exists for `SS-S14-E01` (`episodes` table).
3. Shot `A1-SC01-SH01` found in at least one `STB` asset's `content` / `metadata.shots[]`.
4. ≥1 `jobs` row with `agent_id='EXEC-VGEN'` whose `input_snapshot` references shot 1.
5. Prompt persisted somewhere — either `PRO` asset for shot 1, or `metadata.image_prompt.history[]` populated on the VID asset.
6. Report §4 lists **≥3** concrete drop-off fields with both upstream source asset_id and downstream asset/field where the value is missing or collapsed. If <3 — trace incomplete; re-run Phase 1 with broader filters before declaring done.

---

## Where the original full plan lives (cloud session, may be lost)

`/root/.claude/plans/snappy-toasting-cat.md` — **inside the cloud VM only**. This handoff
file is the canonical replacement for the local session.

## Working branch

`claude/enhance-video-quality-AcRTn`
