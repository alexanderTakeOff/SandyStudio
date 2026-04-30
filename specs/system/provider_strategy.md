# SandyStudio — Provider Strategy
## specs/system/provider_strategy.md | v0.1 | DRAFT

> Defines **which** providers run in Phase 8 MVP and **how** the Director can
> reassign providers later through the webapp UI without code changes.
>
> This spec sits **above** the existing provider stack:
> - `specs/system/api_integrations.md` — contracts (what shape requests/responses have)
> - `specs/system/media_gateway.md` — call lifecycle (validate → budget → route → retry → log)
> - `config/providers.yaml` — provider **registry** (capabilities, cost, env keys)
>
> What this spec adds: **decision of record** for Phase 8 active stack +
> **runtime selection mechanism** (DB-backed, UI-editable).
>
> Last updated: 2026-04-30
> Owner: Director / EXEC-ARCH

---

## 1. PURPOSE

Phase 8 turns the studio from mock-mode into a paid pipeline. The decision is **not**
"connect every provider in `providers.yaml`" — it is "connect the smallest stack
that proves the full cycle end-to-end (Brief → Publish), and make every connection
swappable through a UI control later."

This spec answers three questions:

1. **What stack runs in Phase 8 MVP?** (Section 2 — Active Stack)
2. **How does the Director switch a provider without redeploying code?**
   (Section 3 — Runtime Selection Architecture)
3. **What is the implementation order, and what is the exit criterion?**
   (Section 5 — Implementation Plan + Section 6 — Exit Criteria)

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
| Music | `beatoven` | Beatoven.ai | ⚠️ Registered, inactive | "Silent pilot" for Phase 8. UI dropdown shows `beatoven` available; Director flips switch when ready. |
| SFX | `elevenlabs-sfx` | ElevenLabs SFX | ⚠️ Registered, inactive | Same — present in registry, off in Phase 8 MVP. |
| Publish | `youtube_data_api` | YouTube Data API v3 | ⏳ Last | Wired only after the rest of the cycle is stable on E03 dry-run. Order matters — see §5. |
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
ergonomics for a Director who wants "swap image provider" to be a one-click action.

### 3.2 Source of truth split

| Information | Lives in | Mutable through | Reload |
|---|---|---|---|
| Provider **capabilities** (cost, max chars, supported aspect ratios, env_key name) | `config/providers.yaml` | git commit | `gateway.config_reload_on_call: true` (already on) |
| Provider **active selection** (which adapter id resolves a contract) | Supabase `provider_assignments` table | Webapp UI `/settings/providers` | Cache invalidation on row update; resolver re-reads at next call |
| Provider **health** (last successful call, last error) | Supabase `provider_health` view (computed) | Read-only | 60s TTL cache, same as today |
| Provider **secrets** (env keys) | Server env vars | Deployment platform | Process restart |

### 3.3 New table: `provider_assignments`

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

### 3.4 Resolver: `lib/agents/provider-resolver.ts`

```
resolveProvider(contract: ContractName): ResolvedProvider
  ↓
  1. SELECT * FROM provider_assignments WHERE contract = $1 AND is_active = true
  2. Look up active_provider_id in providers.yaml → get capabilities + env_key + adapter
  3. Check process.env[env_key] is set → fail fast E-CONFIG-002 if not
  4. Return { id, capabilities, adapter, env_key } — gateway uses this in step [3] of
     the existing call lifecycle (specs/system/media_gateway.md §2)
```

Existing gateway logic (validate → budget → call → retry → log) is **unchanged**.
The resolver **replaces** the hard-coded `primary` lookup that today reads YAML directly.

### 3.5 UI: `/settings/providers`

A new settings page (Phase 8 Step 4):

- Table: row per contract, columns: Contract • Active provider (dropdown of all
  candidates from `providers.yaml` whose `automation_allowed` is not `false`) •
  Health badge • Last call • Last error • [Edit]
- Edit dialog: Director changes `active_provider_id` → server validates env key is
  present → write to `provider_assignments` → toast "Switched image to gpt-image-1.
  Will apply on next agent call."
- An "is_active" toggle per row — turns the contract on/off (the way music/SFX are
  off in MVP).
- Audit: every change writes to `activity_events` with `kind = 'provider_switched'`.

### 3.6 Health computation

`provider_health` is a materialised view (or computed in resolver):

```
SELECT
  p.contract,
  p.active_provider_id,
  MAX(j.completed_at) FILTER (WHERE j.status = 'COMPLETED') AS last_success_at,
  MAX(j.completed_at) FILTER (WHERE j.status = 'FAILED')    AS last_failure_at,
  COUNT(*) FILTER (WHERE j.status = 'FAILED' AND j.completed_at > now() - interval '1 hour') AS failures_last_hour
FROM provider_assignments p
LEFT JOIN jobs j ON j.metadata->>'provider_id' = p.active_provider_id
GROUP BY 1, 2;
```

This requires `jobs.metadata` to start carrying `provider_id` (small runner.ts addition).

---

## 4. STORAGE SHIFT — DRIVE AS CANONICAL

### 4.1 What changes

Today: `assets.staging_path = 'H:/My Drive/SandyStudio_Media/...'` — local filesystem
path that happens to live inside a Drive sync folder. **The webapp doesn't know it's
Drive.** No file_id, no sharing model, no API surface.

Phase 8: Drive becomes a **first-class storage backend**.

| Field | Today | Phase 8 |
|---|---|---|
| `assets.staging_path` | local filesystem path string | DEPRECATED, kept for backwards compat one cycle, then dropped |
| `assets.drive_file_id` | — | NEW: canonical Drive file id |
| `assets.drive_web_view_url` | — | NEW: shareable preview link (used by Inbox preview drawer Phase 5d) |
| `assets.size_bytes` | from local fs | from Drive metadata |

### 4.2 PA-001/002/003 in Drive form

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

Full PA-001/002/003 spec rewrite happens in **Step 9** of the implementation plan.

### 4.3 OAuth model

- One Google Cloud project: `sandystudio-prod` (or similar)
- Two scopes: `drive.file` (asset I/O) + `cloud-platform` (Vertex AI for Veo)
- Refresh token: server-only, stored in `process.env.GOOGLE_REFRESH_TOKEN`
- Browser never receives Google credentials. All Drive operations go through
  `webapp/app/api/storage/*` route handlers (server-side OAuth client).

---

## 5. IMPLEMENTATION PLAN (12 STEPS)

| # | Step | Depends on | Output |
|---|---|---|---|
| 1 | Spec `provider_strategy.md` v0.1 (this file) | — | DRAFT |
| 2 | Migration `0013_provider_assignments.sql` + seed | (1) APPROVED | Supabase table + seed rows |
| 3 | `lib/agents/provider-resolver.ts` + integration into gateway/runner | (2) | Resolver returns ResolvedProvider; existing mock path still works |
| 4 | `/settings/providers` UI + audit events | (3) | Director can swap providers in DB |
| 5 | Migration `0014_assets_drive_fields.sql` + Drive adapter | (3) | `assets.drive_file_id`, Drive read/write |
| 6 | Google OAuth flow (Drive + Vertex) on a single GCP project | — (parallel) | Refresh token in env |
| 7 | `gpt-image-1` adapter | (3) | Image contract goes real |
| 8 | `veo-3` + `veo-3-img2vid` adapters | (5)(6) | Video contracts go real |
| 9 | Rewrite `character_consistency.md` v0.4 + PA-001/002/003 in Drive form | (5) | Spec for Drive-based references |
| 10 | PA-005 Character Visual Development workflow on Drive | (9) + (7) | UI for variant carousel + selection |
| 11 | First real cycle on E03 — Brief → Imagen → Veo → mute assemble → publish DRY-RUN | (10) | E03 reaches "ready_to_publish" without YouTube |
| 12 | `youtube_data_api` adapter + first real publish | (11) ✅ | Phase 8 complete |

**Gate between 11 and 12:** if E03 dry-run reveals character consistency below
acceptable threshold, branch to Phase 8.5 — wire Kling adapter, flip switch through UI,
re-run from Step 11 before Step 12.

---

## 6. EXIT CRITERIA — PHASE 8

Phase 8 is **complete** when:

1. ✅ All 7 contracts have a Director-selectable provider in `provider_assignments`
   (even if `is_active = false`).
2. ✅ `/settings/providers` lets the Director switch provider per contract through UI.
3. ✅ At least one episode (E03) has run end-to-end on real APIs:
   Drive storage + gpt-image-1 + Veo 3 + Veo 3 img2vid + YouTube publish.
4. ✅ Total cost of E03 first real cycle is logged in `PLAN.md` change log and stays
   within 1.5× the PILOT estimate ($12.32) — i.e. ≤ $18.50.
5. ✅ Character consistency on E03 documented (subjective Director rating + any
   Vertex-returned consistency score) — informs Kling Phase 8.5 decision.
6. ✅ No regression in mock-mode: `npm run replay-pilot` still passes 28/28 with
   `provider_mode: real` overridden to `mock` in test env.

---

## 7. SECURITY / SECRETS LAYOUT

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
| YouTube | `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN` | wired in Step 12 | Same Google client recommended (one project, multiple scopes). |

Total **new** secrets to provision before Step 11:
`OPENAI_API_KEY` (already set) + 4 Google vars. That's the entire Phase 8 secret surface.

---

## 8. EXIT STRATEGY — MULTI-VENDOR

The whole point of the abstraction is reversibility. If GCP blocks billing, throttles
quotas, or changes terms unfavourably:

1. Add the alternate provider's env key.
2. Director opens `/settings/providers`, switches `image` from `gpt-image-1` to
   `flux-pro` (already in registry).
3. Next agent call uses Flux Pro. No code change. No deploy.

The same applies to a Veo 3 outage:
- `character_video` → switch to `kling-3-elements` (registered) or
  `runway-gen4-ref` (registered).

This exit-strategy guarantee is **the** justification for paying the abstraction cost
in Phase 8 instead of hard-wiring Google APIs directly.

---

## 9. OPEN QUESTIONS (resolve before APPROVED)

| # | Question | Default if Director doesn't decide |
|---|---|---|
| OQ1 | Should `provider_assignments` cache TTL be 0 (read every call) or 60s? Current `gateway.config_reload_on_call: true` suggests 0; but per-call DB read adds latency. | 60s with explicit invalidate on UI write. |
| OQ2 | Should the `/settings/providers` UI live under `/settings` (existing area) or under a new `/admin/providers` route? | Under `/settings/providers`, alongside Storage/Authority Matrix. |
| OQ3 | Should `is_active = false` show the contract row at all in the UI (greyed out) or hide it entirely? | Show greyed out with "Activate" button — discoverability matters. |
| OQ4 | When Director switches provider, does the swap affect already-queued jobs or only new ones? | Only new jobs. In-flight jobs complete on the provider they started with. |

---

## 10. CHANGE LOG

| Date | Change | By |
|---|---|---|
| 2026-04-30 | v0.1 DRAFT created — Phase 8 Google-first MVP + DB-backed provider switching architecture. | Claude Code under Director session |

---

*Status: DRAFT. Next: Director review + APPROVED status before Step 2 (migration).*
