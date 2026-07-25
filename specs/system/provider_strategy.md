# SandyStudio — Provider Strategy
## specs/system/provider_strategy.md | v0.2 | APPROVED

> Defines **which** providers run in Phase 8 MVP and **how** the Director can
> reassign providers later through the webapp UI without code changes.
>
> This spec sits **above** the existing provider stack:
> - `specs/system/api_integrations.md` — contracts (what shape requests/responses have)
> - `specs/system/media_gateway.md` — call lifecycle (validate → budget → route → retry → log)
> - `config/providers.yaml` — provider **registry** (capabilities, cost, env keys)
>
> What this spec adds: **decision of record** for Phase 8 active stack +
> **runtime selection mechanism** (DB-backed, two-tier: global + per-stage, UI-editable).
>
> Last updated: 2026-04-30
> Owner: Director / EXEC-ARCH
> Status: APPROVED 2026-04-30 (Director resolved OQ1–OQ4, q1–q3)

---

## 1. PURPOSE

Phase 8 turns the studio from mock-mode into a paid pipeline. The decision is **not**
"connect every provider in `providers.yaml`" — it is "connect the smallest stack
that proves the full cycle end-to-end (Brief → Publish), and make every connection
swappable through a UI control later."

This spec answers four questions:

1. **What stack runs in Phase 8 MVP?** (§2 — Active Stack)
2. **How does the Director switch a provider — globally and for a single stage —
   without redeploying code?** (§3 — Runtime Selection Architecture)
3. **What UI carries those switches?** (§4 — UI Surfaces)
4. **What is the implementation order, and what is the exit criterion?**
   (§6 — Implementation Plan + §7 — Exit Criteria)

---

## 2. ACTIVE STACK — PHASE 8 MVP

### 2.1 Decision Summary (Director, 2026-04-29)

> **MVP principle:** Google-first for **media + storage**, OpenAI for **image**, Anthropic
> for **studio agents (script/storyboard/QA reasoning)**. Music and SFX are **registered
> but inactive** — activated through the UI later, when the silent-pilot cycle is proven.

### 2.2 Active provider per contract

| Contract | Active provider | Source | Active in Phase 8? | Notes |
|---|---|---|---|---|
| Storage | `drive_native` | Google Drive API v3 | ✅ Active | Canonical asset store. All writes go through `webapp/app/api/storage/*`; the browser never holds an OAuth token. |
| Image | `gpt-image-1` | OpenAI Images API | ✅ Active | Reuses `OPENAI_API_KEY` (same key as Concierge). Replaces `flux-pro` as primary. Used by EXEC-THUMB and PA-005 character variants. |
| Video (no character) | `veo-3` | Vertex AI | ✅ Active | text-to-video. |
| Video (character) | `veo-3-img2vid` | Vertex AI | ✅ Active | image-to-video using `master_reference.drive_file_id` as start frame. Documented limitation: ~75% character consistency vs ~90% with Kling. Accepted MVP trade-off; Kling re-evaluated post-cycle. |
| Music | `beatoven` | Beatoven.ai | ⚠️ Registered, inactive | "Silent pilot" for Phase 8. UI dropdown shows `beatoven` greyed-out with [Activate] button; Director flips switch when ready. |
| SFX | `elevenlabs-sfx` | ElevenLabs SFX | ⚠️ Registered, inactive | Same — present in registry, off in Phase 8 MVP. |
| Publish | `youtube_data_api` | YouTube Data API v3 | ⏳ Last | Wired only after the rest of the cycle is stable on E03 dry-run. Order matters — see §6. |
| Studio agents | Anthropic Claude (Sonnet 4.6 / Opus 4.7) | Claude Code SDK | ✅ Unchanged | Not part of `providers.yaml` — separate model routing per BOARD-FIN policy. |
| Concierge chat | OpenAI `gpt-5.4-mini` | OpenAI Chat Completions | ✅ Unchanged | Already in production. Same `OPENAI_API_KEY` as `gpt-image-1`. |

### 2.3 What's deferred (and why)

| Provider | Reason for deferral | Re-evaluation trigger |
|---|---|---|
| Kling 3.0 Elements (D-001) | High character consistency value, but adds an extra vendor + key + adapter before MVP cycle is proven. Veo image-to-video is "good enough" to validate the pipeline. | After first complete real cycle on E03; if `character_consistency_score < 0.80` repeatedly, Kling becomes Phase 8.5. |
| Beatoven (music) | Silent pilot accelerates first paid run. Music is the hardest to QA from text alone. | Director flips UI switch when ready to add audio dimension. |
| ElevenLabs SFX | Same — silent pilot. | Director flip + Beatoven proven. |
| Midjourney | Manual-only by design (Director uses web UI for special hero references). Not on automation path — no change. | Stays manual indefinitely. |
| Flux Pro / Imagen 3 / DALL-E 3 | Single-image-provider rule for MVP. `gpt-image-1` chosen because it shares `OPENAI_API_KEY` (zero new secrets) and supports multi-image input which simplifies PA-005. | Director can switch through UI dropdown with no code change. |

### 2.4 Trade-off accepted in writing

> **D-001 partial reversal:** The original character consistency decision (2026-04-24)
> selected Kling 3.0 Elements as primary. For Phase 8 MVP the active provider is
> `veo-3-img2vid`, with documented ~15-percentage-point consistency loss. This is a
> **MVP-only** override. `providers.yaml` keeps Kling as registered fallback. If the
> first real cycle shows unacceptable character drift, Phase 8.5 = wire Kling adapter +
> flip UI switch.

---

## 3. RUNTIME SELECTION ARCHITECTURE

### 3.1 Why the YAML alone is not enough

`config/providers.yaml` defines **which providers exist** and what they can do. It does
**not** persist the Director's runtime choice. To change `image.primary` from `flux-pro`
to `gpt-image-1` today, an engineer edits the YAML and redeploys. That is the wrong
ergonomics for a Director who wants "swap image provider" to be a one-click action —
sometimes globally, sometimes for a single stage of a single episode.

### 3.2 Two-tier override hierarchy

Director-resolved decision (q2): **global + per-stage. No per-episode tier.**
If the Director wants "everything in this episode on Flux", that's the global switch
(it affects all episodes equally — that's the trade-off). Per-episode-only override
is over-engineering for MVP.

```
              ┌─ stage_provider_overrides ─┐    (narrowest — per episode + stage)
              │                             │
                                            ▼
                                     applies if found
                                            │
              ┌─ provider_assignments ────┐ │    (global default per contract)
              │                            ▼ │
                                   applies otherwise
                                            │
                                            ▼
                                  resolver returns ResolvedProvider
```

### 3.3 Source of truth split

| Information | Lives in | Mutable through | Reload |
|---|---|---|---|
| Provider **capabilities** (cost, max chars, supported aspect ratios, env_key name) | `config/providers.yaml` | git commit | `gateway.config_reload_on_call: true` (already on) |
| Provider **global selection** (which adapter id resolves a contract by default) | Supabase `provider_assignments` | `/settings/providers` UI | 60s cache, invalidated on UI write (q1) |
| Provider **per-stage override** (override for a single episode + stage) | Supabase `stage_provider_overrides` | Pipeline page kebab menu | 60s cache, invalidated on UI write |
| Provider **health** (last successful call, last error) | computed from `jobs.metadata.provider_id` | Read-only | 60s TTL cache |
| Provider **secrets** (env keys) | Server env vars | Deployment platform | Process restart |

### 3.4 New table: `provider_assignments` (global tier)

```
provider_assignments
─────────────────────────────────────────────────
contract            text PK    -- 'image' | 'video' | 'character_video' | 'music' | 'sfx' | 'storage' | 'publish'
active_provider_id  text NOT NULL  -- e.g. 'gpt-image-1', 'veo-3', 'drive_native'
fallback_provider_id text NULL     -- optional secondary
is_active           bool NOT NULL DEFAULT true  -- false = contract disabled (e.g. music in MVP)
updated_by          uuid REFERENCES auth.users
updated_at          timestamptz NOT NULL DEFAULT now()
notes               text NULL      -- Director's reason for the switch (audit trail)
```

**Seed values for Phase 8 MVP** (migration, not UI):

| contract | active_provider_id | fallback_provider_id | is_active |
|---|---|---|---|
| image | gpt-image-1 | null | true |
| video | veo-3 | null | true |
| character_video | veo-3-img2vid | null | true |
| storage | drive_native | null | true |
| music | beatoven | null | **false** |
| sfx | elevenlabs-sfx | null | **false** |
| publish | youtube_data_api | null | true (wired in Step 12) |

`is_active = false` means the resolver throws `E-CONTRACT-DISABLED` if any agent calls it.
This is how "no music in Phase 8" is enforced — not by deleting the row.

### 3.5 New table: `stage_provider_overrides` (per-stage tier)

```
stage_provider_overrides
─────────────────────────────────────────────────
id                  uuid PK
episode_id          uuid REFERENCES episodes(id) ON DELETE CASCADE
stage               text NOT NULL    -- 'brief' | 'script' | 'script_qa' | 'storyboard' | 'world_check'
                                      -- 'animatic' | 'generation' | 'distribution' | 'thumbnail' | 'publish'
contract            text NOT NULL    -- which contract is being overridden
active_provider_id  text NOT NULL
notes               text NULL        -- "veo-3 drifted on Sandy hourglass — switching to flux+kling"
updated_by          uuid REFERENCES auth.users
updated_at          timestamptz NOT NULL DEFAULT now()

UNIQUE (episode_id, stage, contract)
```

**Lookup precedence in resolver:**

```
1. SELECT active_provider_id FROM stage_provider_overrides
     WHERE episode_id = $1 AND stage = $2 AND contract = $3
2. If found → use it.
3. Else → SELECT active_provider_id FROM provider_assignments WHERE contract = $3
4. If is_active = false → throw E-CONTRACT-DISABLED
5. Else → resolve adapter from providers.yaml
```

### 3.6 Cancellation policy on provider switch (q3)

Director-resolved (q3): **soft cancel only — no early Inngest interruption for now.**

When a Director switches a provider (global or per-stage):
- All `RUNNING` and `QUEUED` jobs that target the affected contract are **marked**
  `CANCELLED_BY_PROVIDER_SWITCH` in the `jobs` table.
- Inngest functions in flight are **not** killed mid-step. They complete their current
  step and the result is discarded (the asset row is not updated from a cancelled job).
- Director sees a toast: "Marked N jobs cancelled. Re-trigger to run on the new provider."
- Director re-triggers manually from the kebab menu. Re-trigger creates a new job with
  the new provider id.

Future Phase (post-MVP): runner.ts learns to check job status at each `step.run()`
boundary and short-circuit if cancelled. Out of scope for Phase 8.

### 3.7 Resolver: `lib/agents/provider-resolver.ts`

```typescript
interface ResolvedProvider {
  id: string;                  // 'gpt-image-1'
  contract: ContractName;       // 'image'
  capabilities: ProviderSpec;   // from providers.yaml
  envKey: string;              // 'OPENAI_API_KEY'
  source: 'stage_override' | 'global';
}

resolveProvider({ contract, episodeId?, stage? }): ResolvedProvider
```

If `episodeId` and `stage` provided → check `stage_provider_overrides` first.
Else → fall through to `provider_assignments`. Existing gateway logic
(validate → budget → call → retry → log) is **unchanged**. The resolver **replaces**
the hard-coded `primary` lookup that today reads YAML directly.

---

## 4. UI SURFACES

### 4.1 `/settings/providers` — global tier

A new settings page (Phase 8 step). Director-only.

- Table: row per contract. Columns: Contract • Active provider (dropdown of all
  candidates from `providers.yaml` whose `automation_allowed` is not `false`) •
  Health badge • Last call • Last error • [Edit].
- Inactive contracts (music/sfx in MVP) are shown **greyed-out with an [Activate]
  button** (q2/OQ3 resolved — discoverability matters).
- Edit dialog: Director changes `active_provider_id` → server validates env key is
  present → write to `provider_assignments` → triggers cancel-on-switch (§3.6) →
  toast confirms.
- Audit: every change writes `activity_events` with `kind = 'provider_switched_global'`.

### 4.2 Pipeline page kebab menu — per-stage tier

This is the **shared UI surface** for Phase 5d (Approve/Reject/Tweak/Re-trigger
controls per stage) and Phase 8 (per-stage provider override). Director ergonomics
require: keep the pipeline visually clean, expose actions on hover.

```
● Storyboard           1/1   [⋯]  ← kebab visible on row hover
                              │
                              ├─ Approve all in stage
                              ├─ Reject + revise
                              ├─ Edit prompt / tweak
                              ├─ Re-trigger this stage
                              ├─ ───────────────────
                              ├─ Provider › [veo-3 ▾]  ← Phase 8 adds this section
                              │   ├─ ● veo-3 (global default)
                              │   ├─ ○ veo-3-img2vid
                              │   ├─ ○ flux-pro
                              │   └─ Reset to global
                              └─ ───────────────────
```

**Sequencing:** Phase 5d ships kebab WITHOUT the Provider section first
(actions only). Phase 8 adds the Provider sub-menu later, slotting into the same
kebab. This is the Director's q1b decision — granularity over big-bang.

### 4.3 Activity item → preview drawer

Today: clicking an activity item filters the feed but doesn't render content.
Director-required behaviour (Phase 5d task #6):

Click on `SS-S01-E02-STB-act3-v01-DRAFT.md` → right-side drawer opens with:

| Asset extension | Render |
|---|---|
| `.md` | rendered Markdown (script, brief, storyboard, review) |
| `.png` / `.jpg` / `.webp` | `<img src={drive_web_view_url}>` |
| `.mp4` / `.mov` | `<video controls src={drive_web_view_url}>` |
| `.wav` / `.mp3` | `<audio controls src={drive_web_view_url}>` |
| other | metadata + "Download" link |

Drawer footer carries the same kebab actions as the pipeline row
(Approve / Reject / Tweak / Re-trigger / Provider — the last shown only after Phase 8).

---

## 5. STORAGE SHIFT — TWO-CHANNEL CANONICAL

### 5.1 Two-channel decision (2026-04-30)

Director-resolved: **markdown lives in the database, binaries live in Drive.**
The earlier "everything on Drive" framing was overruled because:

- Markdown is editorial structured content (briefs, scripts, storyboards, QA reports).
  Each save is a small, frequent operation. ~10ms DB UPDATE vs ~300ms Drive API call
  — accumulates to seconds across an episode.
- DB enables atomic transactions (asset row + content + activity event in one tx),
  full-text search, version-via-INSERT, multi-machine consistency.
- Binaries (image / video / audio) are large, infrequent writes — Drive API latency
  is amortised. Drive also gives sharing, web preview, and free CDN.

Implementation already shipped in Phase 5d step 2.1 (migration 0013):

| Field | Pre-2026-04-30 | Now |
|---|---|---|
| `assets.content` | — (workaround: markdown in `description`, truncated 8000) | NEW: full markdown body, no length cap (256kb soft via API) |
| `assets.description` | dual-purpose summary + truncated body | back to its real role: short summary line |
| `assets.staging_path` | local filesystem path string | UNUSED for text assets. Kept for binaries until Drive lands. |

### 5.2 Phase 8 step 10 — Drive for binaries only

| Field | Today | Phase 8 |
|---|---|---|
| `assets.content` | text-asset body in DB | unchanged — DB stays canonical for markdown |
| `assets.staging_path` | binary path placeholder (currently null in mock) | Optional disk cache; Drive becomes source of truth |
| `assets.drive_file_id` | — | NEW: canonical Drive file id (binaries) |
| `assets.drive_web_view_url` | — | NEW: shareable preview link (used by drawer §4.3) |
| `assets.size_bytes` | computed from `content` length | for binaries: from Drive metadata |

### 5.2 PA-001/002/003 in Drive form

The original character consistency spec defined `master_reference_image_path` as a
local file path. With Drive native, it becomes:

```
character_profile.master_reference: {
  drive_file_id: "1aBcD...",
  drive_web_view_url: "https://drive.google.com/file/d/1aBcD.../view",
  approved_by: "<director_user_id>",
  approved_at: "2026-05-XX",
  version: "v01",
  status: "LOCKED"
}
```

Multi-machine access, automatic backup, sharing, and PA-005 variant carousel all
become trivial: every variant is a Drive file id, the carousel is a `<grid>` of
embeds, the Director clicks "Choose" → `master_reference.drive_file_id := variant_id`.

Full PA-001/002/003 spec rewrite happens in **Step 11** of the implementation plan.

### 5.3 OAuth model

- One Google Cloud project: `sandystudio-prod` (or similar)
- Two scopes: `drive.file` (asset I/O) + `cloud-platform` (Vertex AI for Veo)
- Refresh token: server-only, stored in `process.env.GOOGLE_REFRESH_TOKEN`
- Browser never receives Google credentials. All Drive operations go through
  `webapp/app/api/storage/*` route handlers (server-side OAuth client).

---

## 6. IMPLEMENTATION PLAN

Director-resolved q1b: **Phase 5d ships first, Phase 8 builds on top.** Kebab UI lands
with Approve/Reject/Tweak/Re-trigger only; provider switch slots into the same kebab
as a later step.

### Phase 5d — UI foundation (prerequisite)

| # | Step | Depends on | Output |
|---|---|---|---|
| 1 | Spec `provider_strategy.md` v0.2 (this file) | — | APPROVED ✅ |
| 2 | Pipeline-row kebab UI: Approve all / Reject / Tweak / Re-trigger / Edit prompt | (1) | Hover-revealed `[⋯]` per stage; actions wired to existing approve/reject/re-trigger endpoints |
| 3 | Activity-item preview drawer: markdown / image / video / audio renderers + drawer footer kebab | (2) | Click activity → see content. Approves are now possible from drawer. |
| 4 | Friendly agent names everywhere (EXEC-SW → "Screenwriter") — touches Re-trigger modal, Inbox, Pipeline DAG, Activity feed (debt #1) | (2) | No more EXEC-* codes shown to Director |

### Phase 8 — providers

| # | Step | Depends on | Output |
|---|---|---|---|
| 5 | Migration `0013_provider_assignments.sql` + seed | (1) | global tier table |
| 6 | Migration `0014_stage_provider_overrides.sql` | (5) | per-stage override table |
| 7 | `lib/agents/provider-resolver.ts` + integration into gateway/runner; all jobs save `provider_id` to `metadata` | (6) | Resolver returns ResolvedProvider; mock path still works; cancellation marker (§3.6) implemented |
| 8 | `/settings/providers` UI (global tier) + audit events + greyed-out inactive contracts | (7) | Director can swap globals through UI |
| 9 | Pipeline kebab gets a "Provider" sub-menu (per-stage tier) — slots into the kebab built in step 2 | (3)(7) | Per-stage override flow live |
| 10 | Migration `0015_assets_drive_fields.sql` + Drive adapter | (7) | `assets.drive_file_id`, Drive read/write |
| 11 | Google OAuth flow (Drive + Vertex) on a single GCP project | — (parallel) | Refresh token in env |
| 12 | `gpt-image-1` adapter | (7) | Image contract goes real |
| 13 | `veo-3` + `veo-3-img2vid` adapters | (10)(11) | Video contracts go real |
| 14 | Rewrite `character_consistency.md` v0.4 + PA-001/002/003 in Drive form | (10) | Spec for Drive-based references |
| 15 | PA-005 Character Visual Development workflow on Drive (variant carousel + Director selects master) | (14) + (12) | UI for variant carousel |
| 16 | First real cycle on E03 — Brief → gpt-image-1 → Veo → mute assemble → publish DRY-RUN | (15) | E03 reaches "ready_to_publish" without YouTube |
| 17 | `youtube_data_api` adapter + first real publish | (16) ✅ | Phase 8 complete |

**Gate between 16 and 17:** if E03 dry-run reveals character consistency below
acceptable threshold, branch to Phase 8.5 — wire Kling adapter, flip switch through UI,
re-run from Step 16 before Step 17.

---

## 7. EXIT CRITERIA — PHASE 8

Phase 8 is **complete** when:

1. ✅ All 7 contracts have a Director-selectable provider in `provider_assignments`
   (even if `is_active = false`).
2. ✅ `/settings/providers` lets the Director switch global provider per contract.
3. ✅ Pipeline kebab lets the Director set per-stage override for any episode/stage.
4. ✅ At least one episode (E03) has run end-to-end on real APIs:
   Drive storage + gpt-image-1 + Veo 3 + Veo 3 img2vid + YouTube publish.
5. ✅ Total cost of E03 first real cycle is logged in `PLAN.md` change log and stays
   within 1.5× the PILOT estimate ($12.32) — i.e. ≤ $18.50.
6. ✅ Character consistency on E03 documented (subjective Director rating + any
   Vertex-returned consistency score) — informs Kling Phase 8.5 decision.
7. ✅ No regression in mock-mode: `npm run replay-pilot` still passes 28/28 with
   `provider_mode: real` overridden to `mock` in test env.

---

## 8. SECURITY / SECRETS LAYOUT

| Secret | Env var | Used by | Notes |
|---|---|---|---|
| OpenAI API key | `OPENAI_API_KEY` | Concierge + `gpt-image-1` | Single key, two consumers. |
| Google OAuth client | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Drive + Vertex AI auth | Same client. |
| Google refresh token | `GOOGLE_REFRESH_TOKEN` | server-side OAuth client | Server-only. Never exposed to browser. |
| Google Cloud project | `GOOGLE_CLOUD_PROJECT_ID` | Vertex AI | Same project as OAuth client. |
| Anthropic | `ANTHROPIC_API_KEY` | Studio agents (Claude Code SDK) | Unchanged. |
| Beatoven | `BEATOVEN_API_KEY` | inactive | Not required in Phase 8 MVP. |
| ElevenLabs | `ELEVENLABS_API_KEY` | inactive | Not required in Phase 8 MVP. |
| Kling | `KLING_API_KEY` | inactive (Phase 8.5 candidate) | Not required in Phase 8 MVP. |
| YouTube | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN_<KEY>` | wired in Step 17 | Shared Google client; per-channel refresh tokens (multi-channel.md §3). |

Total **new** secrets to provision before Step 16:
`OPENAI_API_KEY` (already set) + 4 Google vars. That's the entire Phase 8 secret surface.

---

## 9. EXIT STRATEGY — MULTI-VENDOR

The whole point of the abstraction is reversibility. If GCP blocks billing, throttles
quotas, or changes terms unfavourably:

1. Add the alternate provider's env key.
2. Director opens `/settings/providers`, switches `image` from `gpt-image-1` to
   `flux-pro` (already in registry).
3. Next agent call uses Flux Pro. No code change. No deploy.

The same applies to a Veo 3 outage:
- `character_video` → switch to `kling-3-elements` (registered) or
  `runway-gen4-ref` (registered).

Or a single-stage rescue: Director sees Sandy drifting in Storyboard act 3 →
opens kebab → "Provider › flux-pro" → re-triggers just that stage. Pipeline keeps
moving on Veo for everything else.

This exit-strategy guarantee is **the** justification for paying the abstraction cost
in Phase 8 instead of hard-wiring Google APIs directly.

---

## 10. RESOLVED QUESTIONS

| # | Question | Resolution |
|---|---|---|
| OQ1 | Cache TTL for `provider_assignments`? | **60s with explicit invalidate on UI write.** |
| OQ2 | Where does the UI live? | **`/settings/providers` for global tier** + **kebab menu on each pipeline row for per-stage tier**. |
| OQ3 | How are inactive contracts shown? | **Greyed-out with [Activate] button** — discoverability matters. |
| OQ4 | What happens to in-flight jobs on switch? | **Soft cancel** — mark `CANCELLED_BY_PROVIDER_SWITCH`, do NOT kill running Inngest functions early. Director re-triggers manually. |
| q1 | Phase 5d and Phase 8 — bundled or sequential? | **Sequential.** Phase 5d ships kebab + drawer first. Phase 8 slots provider switch into existing kebab. |
| q2 | Override hierarchy depth? | **Two tiers — global + per-stage.** No per-episode tier. |
| q3 | Early job interruption on switch? | **Defer to post-MVP.** Soft cancel marker only; runner short-circuiting comes later when needed. |

---

## 11. CHANGE LOG

| Date | Change | By |
|---|---|---|
| 2026-04-30 | v0.1 DRAFT created — Phase 8 Google-first MVP + DB-backed provider switching architecture. | Claude Code under Director session |
| 2026-04-30 | v0.2 APPROVED — OQ1–OQ4 + q1–q3 resolved by Director. Two-tier hierarchy (global + per-stage), Phase 5d sequenced before Phase 8, soft cancel policy, kebab UI as shared surface, activity preview drawer added as explicit Phase 5d step. | Claude Code under Director session |
| 2026-04-30 | §5 rewritten — Variant A: markdown stays canonical in DB (`assets.content`, migration 0013 applied), Drive holds binaries only in Phase 8 step 10. Reason: 10ms DB update vs 300ms Drive API call accumulates; transactionality + multi-machine consistency are stronger for editorial text. | Claude Code under Director session |

---

*Status: APPROVED 2026-04-30. Next: Step 2 — Phase 5d kebab UI on pipeline rows.*
