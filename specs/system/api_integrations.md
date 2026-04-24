# SandyStudio — API Integrations Spec
## specs/system/api_integrations.md | v0.1 | DRAFT

> Defines all external API integrations: what they do, how they are called,
> rate limits, costs, and fallback behaviour.
> Used by: EXEC-VGEN, EXEC-MGEN, EXEC-THUMB, EXEC-PUB, EXEC-ANAL

---

## GOVERNING RULES (from governance.md §11)

- No agent may call a paid API without an approved budget in the Master Plan
- API credentials are never stored in project files — stored in system environment only
- All API calls are logged in PLAN.md with cost estimate
- If an API call fails, the retry protocol (specs/protocols/qa_retry.md) applies
- BOARD-FIN receives a cost report after every episode production run

---

## 1. VIDEO GENERATION

### 1.1 Google Veo3 (Primary video generator)

| Parameter | Value |
|-----------|-------|
| Purpose | Photorealistic + stylised video generation from text prompts |
| Used by | EXEC-VGEN |
| Output | 5–8 second video clips |
| Resolution | Up to 1920×1080 |
| Aspect ratios | 16:9 (episodes), 9:16 (Shorts) |
| Estimated cost | ~$0.50–$2.00 per clip (varies by duration) |
| Rate limit | Check current Google AI pricing dashboard |
| Authentication | Google Cloud API key (stored in environment: `GOOGLE_VGEN_API_KEY`) |

**Prompt structure for Veo3:**
```
[style anchor], [shot action], [camera direction], [character fragments],
[location description], [lighting], [mood], [special effects]
```

**Known limitations (as of 2026-04-24):**
- Character consistency across separate calls: moderate (use A2 reference if needed)
- Maximum single clip: 8 seconds — longer shots need concatenation
- Does not support negative prompts natively (build avoidances into positive prompt)

**Fallback:** Kling-2.0 (see 1.2) if Veo3 unavailable or quality insufficient

---

### 1.2 Kling AI (Secondary / fallback video generator)

| Parameter | Value |
|-----------|-------|
| Purpose | Video generation; strong character consistency via reference image mode |
| Used by | EXEC-VGEN (primary for character-heavy shots if A2 approach chosen) |
| Models | Kling-1.6 (standard), Kling-2.0 (premium) |
| Output | Up to 10 second clips |
| Resolution | 1920×1080 |
| Estimated cost | ~$0.30–$1.50 per clip |
| Authentication | Kling API key (environment: `KLING_API_KEY`) |

**Kling character consistency mode:**
When `specs/system/character_consistency.md` decision = A2 or A4-upgraded:
- Submit canonical reference image with each call using `reference_image` parameter
- Reference image path: `bibles/characters/references/[character_id]-reference-v[NN]-APPROVED.png`

---

## 2. IMAGE GENERATION

### 2.1 Midjourney v7 (Primary image generator)

| Parameter | Value |
|-----------|-------|
| Purpose | Character reference images, thumbnails, style reference images |
| Used by | EXEC-THUMB, ART-CAST (character reference generation), ART-AD |
| Output | Static images |
| Resolutions | Up to 2048×2048 |
| Estimated cost | ~$0.10–$0.40 per image |
| Authentication | Midjourney API key (environment: `MIDJOURNEY_API_KEY`) |

**Prompt flags in use:**
- `--ar 16:9` for thumbnails
- `--cref [reference_url]` for character consistency (A2 approach)
- `--style raw` for animation style preservation
- `--v 7` (always specify version)

---

### 2.2 Flux Pro (Fallback image generator)

| Parameter | Value |
|-----------|-------|
| Purpose | Fallback when Midjourney unavailable |
| Used by | EXEC-THUMB, ART-CAST |
| Authentication | Replicate API key (environment: `REPLICATE_API_KEY`) |

---

## 3. MUSIC GENERATION

### 3.1 Suno v4 (Primary music generator)

| Parameter | Value |
|-----------|-------|
| Purpose | Background music and scene scoring |
| Used by | EXEC-MGEN |
| Output | MP3, up to 4 minutes per generation |
| Estimated cost | ~$0.10–$0.30 per track |
| Authentication | Suno API key (environment: `SUNO_API_KEY`) |

**Prompt structure for Suno:**
```
[genre], [mood], [instrumentation], [tempo descriptor],
[structural notes], [duration target], [style reference]
Example: "playful jazz, comedic anticipation, piano and light brass,
          upbeat 120bpm, builds to comedic peak at 0:30,
          resolves quietly, 45 seconds, 1960s MGM cartoon style"
```

**Known limitation:** Duration is approximate ±5 seconds. ART-MS trims/fades in assembly.

---

### 3.2 Udio v2 (Secondary music generator)

| Parameter | Value |
|-----------|-------|
| Purpose | Fallback or alternative style for Suno |
| Used by | EXEC-MGEN |
| Estimated cost | ~$0.10–$0.25 per track |
| Authentication | Udio API key (environment: `UDIO_API_KEY`) |

---

## 4. DISTRIBUTION

### 4.1 YouTube Data API v3

| Parameter | Value |
|-----------|-------|
| Purpose | Upload episodes, set metadata, schedule publishing |
| Used by | EXEC-PUB |
| Authentication | OAuth 2.0 (YouTube account: Sandy's work Google account) |
| Quota | 10,000 units/day free; 1 upload ≈ 1,600 units |
| Full spec | `specs/distribution/youtube.md` |

---

### 4.2 YouTube Analytics API v2

| Parameter | Value |
|-----------|-------|
| Purpose | Collect post-publish performance metrics |
| Used by | EXEC-ANAL |
| Authentication | Same OAuth 2.0 as Data API |
| Data available | Views, watch time, CTR, retention curve, traffic sources |
| Full spec | `specs/distribution/analytics.md` |

---

## 5. ERROR HANDLING

### API-level errors

| Error type | Response |
|-----------|---------|
| Rate limit (429) | Wait 60 seconds, retry once. If persists → BLOCKED state in PLAN.md |
| Auth failure (401/403) | BLOCKED immediately. Do not retry. Notify Director. Check credentials. |
| Timeout | Retry once after 30 seconds. If timeout again → BLOCKED |
| Quality failure | Not an API error — route through QA retry protocol |
| Unexpected output format | BLOCKED. Log raw response. Notify Director. |

### Budget gate

Before every API call, EXEC-VGEN/EXEC-MGEN checks:
```
current_episode_spend + estimated_call_cost <= episode_budget_ceiling
```
- If within budget: proceed
- If would exceed: BLOCKED → Director approval for budget override

Budget ceiling per episode: defined in Master Plan.
Current spend tracked in: PLAN.md `## Budget Tracker` section.

---

## 6. CREDENTIAL MANAGEMENT

| Credential | Environment variable | Owner |
|-----------|---------------------|-------|
| Google Veo3 | `GOOGLE_VGEN_API_KEY` | Sandy |
| Kling | `KLING_API_KEY` | Sandy |
| Midjourney | `MIDJOURNEY_API_KEY` | Sandy |
| Replicate (Flux) | `REPLICATE_API_KEY` | Sandy |
| Suno | `SUNO_API_KEY` | Sandy |
| Udio | `UDIO_API_KEY` | Sandy |
| YouTube OAuth | `YOUTUBE_CLIENT_ID` + `YOUTUBE_CLIENT_SECRET` | Sandy |

**Rules:**
- Never stored in project files (not in `C:\SandyStudio\` or committed to git)
- Stored in system environment variables or a `.env` file excluded by `.gitignore`
- Rotated every 90 days or immediately if suspected compromise
- Full auth spec: `specs/system/auth.md`

---

*SandyStudio api_integrations.md | v0.1 | Status: DRAFT*
