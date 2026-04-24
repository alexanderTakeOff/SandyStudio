# SandyStudio — Authentication Spec
## specs/system/auth.md | v0.1 | DRAFT

> Defines how credentials, access tokens, and secrets are managed.
> Referenced by: api_integrations.md, participants.md
> Until a formal auth system is implemented, this spec defines the manual controls in place.

---

## CURRENT STATE

SandyStudio operates with a single human principal (Sandy, Director).
No multi-user authentication system is in place.
Until the studio scales to include additional human participants, this document
defines credential hygiene rules and the manual access protocol.

---

## 1. CREDENTIAL STORAGE

### Rule: No secrets in project files

No API key, password, OAuth token, or secret of any kind may appear in:
- Any file in `C:\SandyStudio\` (Git repository)
- Any markdown spec, agent instruction, or PLAN.md
- Any commit message or git history

### Storage method: Environment variables

All credentials are stored as system environment variables on Sandy's machine.

```
Required environment variables:

# AI Generation APIs
GOOGLE_VGEN_API_KEY       ← Veo3
KLING_API_KEY             ← Kling AI
MIDJOURNEY_API_KEY        ← Midjourney
REPLICATE_API_KEY         ← Flux / Replicate
SUNO_API_KEY              ← Suno
UDIO_API_KEY              ← Udio

# Distribution
YOUTUBE_CLIENT_ID         ← YouTube OAuth
YOUTUBE_CLIENT_SECRET     ← YouTube OAuth
YOUTUBE_REFRESH_TOKEN     ← YouTube OAuth (generated after first auth)

# Future
SANDYSTUDIO_AUTH_SECRET   ← Reserved for future multi-user auth
```

**Setting environment variables (Windows):**
System Properties → Environment Variables → System Variables → New

**Verifying (PowerShell):**
```powershell
echo $env:GOOGLE_VGEN_API_KEY
```

---

## 2. .GITIGNORE RULES

The following must be in `C:\SandyStudio\.gitignore`:

```
# Environment and secrets
.env
.env.*
*.env
secrets/
credentials/

# OS files
Thumbs.db
.DS_Store

# Claude Code local
.claude/settings.local.json
```

No exceptions. If a secret is ever accidentally committed:
1. Revoke the credential immediately (before anything else)
2. Generate a new credential
3. Remove from git history using `git filter-branch` or `git-filter-repo`
4. Force push (Director authorises)

---

## 3. CREDENTIAL ROTATION

| Credential type | Rotation schedule | Trigger immediate rotation when |
|----------------|------------------|--------------------------------|
| API keys | Every 90 days | Suspected exposure, personnel change |
| OAuth tokens | On expiry (typically 60 days) | Account access change |
| All credentials | On any security incident | — |

EXEC-ARCH maintains a rotation schedule in PLAN.md `## Security` section.
One week before rotation: Director receives reminder.

---

## 4. YOUTUBE OAUTH FLOW

YouTube requires OAuth 2.0 — cannot use a simple API key.

**Initial setup (one-time, requires Developer or Sandy):**
1. Create OAuth 2.0 credentials in Google Cloud Console
2. Set redirect URI to `http://localhost:8080/callback`
3. Run auth flow → browser opens → Sandy authorises
4. Capture `refresh_token` → store as `YOUTUBE_REFRESH_TOKEN`
5. Access tokens are generated from refresh token automatically

**EXEC-PUB uses refresh token to generate access tokens on each upload.**
Full upload spec: `specs/distribution/youtube.md`

---

## 5. MULTI-USER AUTH (FUTURE)

When additional human participants join SandyStudio (Producers, Developers, Reviewers),
a formal authentication system is needed.

**Planned approach (not yet implemented):**
- Identity: Each participant has a named identity stored in `specs/company/participants.md`
- Auth method: TBD — options include:
  - Shared password per role (simple, low security)
  - Google Workspace SSO (leverages existing Google accounts)
  - GitHub account verification (if Developers are on GitHub)
- Session: Each Claude Code session declares participant identity at start
- Audit: All actions logged with participant_id and timestamp in PLAN.md

**Trigger for implementation:** When first non-Director participant is granted access.

---

## 6. AGENT ACCESS TO CREDENTIALS

Agents (Claude Code acting as agents) access credentials through environment variables only.
No agent stores, logs, or transmits credential values.

When an agent needs to call a paid API:
1. Agent confirms budget gate (PLAN.md budget tracker) — has budget been approved?
2. Agent reads credential from environment variable
3. Agent makes API call
4. Agent logs: date, API, action, cost estimate — to PLAN.md budget tracker
5. Agent never logs the credential value itself

---

*SandyStudio auth.md | v0.1 | Status: DRAFT*
