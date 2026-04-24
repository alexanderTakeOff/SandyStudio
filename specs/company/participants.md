# SandyStudio — Human Participants Registry
## specs/company/participants.md | v0.1 | APPROVED

> Single source of truth for all humans with access to SandyStudio systems.
> Maintained by the Director. All changes require Director authorization.
> Permissions matrix: see `specs/company/governance.md` Section 5.

---

## 1. PARTICIPANT REGISTRY

| Field | Description |
|-------|-------------|
| **ID** | Unique participant ID. Format: `P001`, `P002`... Never reused. |
| **Name** | Full name |
| **Handle** | Short alias used in logs, comments, and agent briefs |
| **Role** | Director / Producer / Developer / Reviewer / Observer |
| **Specialization** | What this person works on specifically |
| **Status** | `ACTIVE` / `SUSPENDED` / `PENDING` / `INACTIVE` |
| **Email** | Primary contact |
| **Messenger** | Telegram / Slack / other |
| **Timezone** | For async coordination |
| **Language** | Working language(s) |
| **Can approve** | Which file types this person can move to APPROVED |
| **Can edit agents** | Which agent directories this person can modify |
| **Auth status** | `VERIFIED` / `PENDING` / `REVOKED` |
| **Added** | Date added |
| **Added by** | Who authorized the addition |
| **Last active** | Last confirmed activity in the system |
| **Notes** | Any context, restrictions, or special conditions |

---

### Active participants

#### P001
| Field | Value |
|-------|-------|
| **ID** | P001 |
| **Name** | Sandy |
| **Handle** | @sandy |
| **Role** | Director |
| **Specialization** | Full authority. Showrunner / Executive Producer / CEO |
| **Status** | ACTIVE |
| **Email** | TBD |
| **Messenger** | TBD |
| **Timezone** | TBD |
| **Language** | RU / EN |
| **Can approve** | ALL files at ALL levels |
| **Can edit agents** | ALL |
| **Auth status** | VERIFIED |
| **Added** | Project inception |
| **Added by** | Self |
| **Last active** | — |
| **Notes** | Sole authority for LOCKED status and access rights |

---

### Pending / Placeholder participants

> These slots are reserved for anticipated future participants.
> Fields marked `[TBD]` are filled when the person is onboarded.
> Status `PENDING` means the slot exists but no real person is assigned yet.

---

#### P002 — [Script Developer]
| Field | Value |
|-------|-------|
| **ID** | P002 |
| **Name** | [TBD] |
| **Handle** | [TBD] |
| **Role** | Developer |
| **Specialization** | Agent instruction files: screenwriter, script reviewer, head writer |
| **Status** | PENDING |
| **Email** | [TBD] |
| **Messenger** | [TBD] |
| **Timezone** | [TBD] |
| **Language** | [TBD] |
| **Can approve** | None |
| **Can edit agents** | `agents/exec/screenwriter.md`, `agents/exec/script_reviewer.md`, `agents/artistic/head_writer.md` |
| **Auth status** | PENDING |
| **Added** | [TBD] |
| **Added by** | [TBD] |
| **Last active** | — |
| **Notes** | Restricted to script-related agents only |

---

#### P003 — [Visual Developer]
| Field | Value |
|-------|-------|
| **ID** | P003 |
| **Name** | [TBD] |
| **Handle** | [TBD] |
| **Role** | Developer |
| **Specialization** | Agent instruction files: visual generator, storyboarder, art director, world builder |
| **Status** | PENDING |
| **Email** | [TBD] |
| **Messenger** | [TBD] |
| **Timezone** | [TBD] |
| **Language** | [TBD] |
| **Can approve** | None |
| **Can edit agents** | `agents/exec/visual_generator.md`, `agents/exec/storyboarder.md`, `agents/artistic/art_director.md`, `agents/artistic/world_builder.md` |
| **Auth status** | PENDING |
| **Added** | [TBD] |
| **Added by** | [TBD] |
| **Last active** | — |
| **Notes** | Restricted to visual pipeline agents only |

---

#### P004 — [Content Producer]
| Field | Value |
|-------|-------|
| **ID** | P004 |
| **Name** | [TBD] |
| **Handle** | [TBD] |
| **Role** | Producer |
| **Specialization** | Production oversight, REVIEW → APPROVED for content files |
| **Status** | PENDING |
| **Email** | [TBD] |
| **Messenger** | [TBD] |
| **Timezone** | [TBD] |
| **Language** | [TBD] |
| **Can approve** | `SCR`, `STB`, `PRO`, `REV` (not BIB, not LOCKED) |
| **Can edit agents** | None |
| **Auth status** | PENDING |
| **Added** | [TBD] |
| **Added by** | [TBD] |
| **Last active** | — |
| **Notes** | Cannot approve LOCKED or bible files. Cannot edit agents. |

---

#### P005 — [Creative Reviewer]
| Field | Value |
|-------|-------|
| **ID** | P005 |
| **Name** | [TBD] |
| **Handle** | [TBD] |
| **Role** | Reviewer |
| **Specialization** | Creative quality review: scripts, storyboards, character profiles |
| **Status** | PENDING |
| **Email** | [TBD] |
| **Messenger** | [TBD] |
| **Timezone** | [TBD] |
| **Language** | [TBD] |
| **Can approve** | None |
| **Can edit agents** | None |
| **Auth status** | PENDING |
| **Added** | [TBD] |
| **Added by** | [TBD] |
| **Last active** | — |
| **Notes** | Read all + comment only. No write access. |

---

#### P006 — [External Observer]
| Field | Value |
|-------|-------|
| **ID** | P006 |
| **Name** | [TBD] |
| **Handle** | [TBD] |
| **Role** | Observer |
| **Specialization** | Investor / partner / stakeholder view of approved outputs |
| **Status** | PENDING |
| **Email** | [TBD] |
| **Messenger** | [TBD] |
| **Timezone** | [TBD] |
| **Language** | [TBD] |
| **Can approve** | None |
| **Can edit agents** | None |
| **Auth status** | PENDING |
| **Added** | [TBD] |
| **Added by** | [TBD] |
| **Last active** | — |
| **Notes** | Sees APPROVED outputs only. No access to drafts, specs, or agent files. |

---

## 2. ROLE QUICK REFERENCE

| Role | Can edit agents | Can approve files | Can read all | Notes |
|------|----------------|-------------------|--------------|-------|
| Director | ALL | ALL incl. LOCKED | ✓ | Full authority |
| Producer | — | SCR, STB, PRO, REV | ✓ | Not BIB, not LOCKED |
| Developer | Assigned only | — | ✓ | Agent files only |
| Reviewer | — | — | ✓ | Comments only |
| Observer | — | — | APPROVED only | External view |

Full permissions matrix → `specs/company/governance.md` Section 5.

---

## 3. ACCESS LOG

Chronological record of all access changes. Append only — never delete entries.

| # | Date | Action | Participant | Role | Authorized by | Notes |
|---|------|--------|-------------|------|---------------|-------|
| 001 | Project inception | ADDED | P001 Sandy | Director | Self | Founding Director |

---

## 4. ONBOARDING CHECKLIST

When a new participant is added, the Director completes this checklist:

- [ ] Assign participant ID (next available P00X, never reuse)
- [ ] Fill all fields in Section 1 registry
- [ ] Define exact `Can edit agents` scope if role is Developer
- [ ] Define exact `Can approve` file types if role is Producer
- [ ] Add entry to Access Log (Section 3)
- [ ] Share governance.md and this document with new participant
- [ ] Confirm participant has read and understood governance rules
- [ ] Set Auth status to VERIFIED once identity is confirmed
- [ ] Set Status to ACTIVE
- [ ] Update `CLAUDE.md` Document Registry if needed

---

## 5. OFFBOARDING CHECKLIST

When a participant leaves or is suspended:

- [ ] Set Status to `SUSPENDED` or `INACTIVE` in registry
- [ ] Set Auth status to `REVOKED`
- [ ] Add entry to Access Log with reason
- [ ] Review all files touched by participant in last 30 days
- [ ] Flag any REVIEW-status files for re-verification by Director
- [ ] Revoke any active API tokens or credentials (auth system)
- [ ] Notify other active participants if collaboration was in progress

---

## 6. AUTHENTICATION STATUS

Authentication system specification: `specs/system/auth.md` — **NOT STARTED**

Until `auth.md` is defined and implemented:
- All participants except Director are considered `AUTH: PENDING`
- No non-Director participant may act on the system without Director
  explicit confirmation in the session
- Authentication is handled manually by the Director on a per-session basis

---

*SandyStudio participants.md | v0.1 | Status: APPROVED | Approved by Director Sandy*
*Prepared for Director review.*
