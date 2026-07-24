---
name: sandystudio-archivist
description: SandyStudio project-local skill for the EXEC-ARCH agent. Enforces the SS-S0X-... naming convention, manages status transitions DRAFT→REVIEW→APPROVED→LOCKED, and keeps the canonical asset registry from specs/system/project_state.md in sync. Use when creating new project files, promoting status, or auditing the file tree against the convention.
status: DRAFT
---

# SandyStudio Archivist

> Status: **DRAFT** (placeholder — not loaded at runtime) — full implementation in Sprint 5 (per CLAUDE.md §8).
> Canonical owner agent: `EXEC-ARCH` (`agents/exec/archivist.md`).

## Scope

This skill is the **project-local enforcement layer** for the rules in CLAUDE.md §3 (naming convention) and §7 (workflow rules). It is invoked by `EXEC-ARCH` and any agent that creates, renames, or transitions a tracked artifact (script, storyboard, bible, prompt, review, spec, state).

The runtime governance is delegated to two project-level hooks (`naming-validator.cjs`, `locked-status-guard.cjs`) — this skill encodes the policy and the higher-level workflows that the hooks alone cannot express.

## Responsibilities

1. **Naming convention enforcement** (CLAUDE.md §3)
   `SS-{S0X|PILOT}-{E0X?}-{TYPE}-{description_snake_case}-v{NN}-{STATUS}.{ext}`
   - Allowed `TYPE`: `SCR`, `STB`, `IMG`, `VID`, `AUD`, `BIB`, `PRO`, `REV`, `SPC`, `STA`
   - Allowed `STATUS`: `DRAFT`, `REVIEW`, `APPROVED`, `LOCKED`
   - Validation also runs at write-time via `naming-validator.cjs`.

2. **Status transition policy** (CLAUDE.md §7)
   - Allowed transitions: `DRAFT → REVIEW → APPROVED → LOCKED`.
   - `APPROVED → LOCKED` requires explicit Director sign-off (or `EXEC-DIR-AI` within delegated scope).
   - `LOCKED` is terminal: never modified, only superseded by a new version (`v{NN+1}`) starting at `DRAFT`.

3. **Asset registry**
   - Canonical state in `specs/system/project_state.md`.
   - Each transition appends an audit row: `timestamp | file | from_status | to_status | actor | rationale`.
   - Storage paths follow CLAUDE.md §2: project files in `C:\SandyStudio\`, media in `H:\My Drive\SandyStudio_Media\`.

4. **Cross-referencing**
   - Detect orphaned references (file renamed/deleted but referenced elsewhere).
   - Re-link versions on cascade (`character_profile-v01-LOCKED` → `v02-DRAFT` is born; references should pin or float per CLAUDE.md §11.8 «Parameter completeness at gate»).

## Heavy lifting delegated to

- **`knowledge-ops`** (global skill) — vector/keyword indexes over the asset tree, used for orphan detection and registry reconciliation.
- **`hookify`** (global skill) — to evolve enforcement hooks as policy expands.

## Inputs / Outputs (Sprint 5 contract — preview)

```yaml
ArchivistRequest:
  action: VALIDATE_NAME | TRANSITION_STATUS | REGISTER | SCAN_ORPHANS
  target_path: string
  target_status: DRAFT | REVIEW | APPROVED | LOCKED | null
  rationale: string | null
  actor: string                     # agent_id of caller, e.g. "EXEC-SREV"

ArchivistResponse:
  status: OK | REJECTED | NEEDS_DIRECTOR_APPROVAL
  reason: string | null
  registry_updated: boolean
  audit_entry_id: string | null
```

## When to invoke

- A new file is being written under `scripts/`, `storyboards/`, `bibles/`, `prompts/`, `reviews/`, `specs/`, or `archive/`.
- An agent wants to promote `DRAFT → REVIEW` or `REVIEW → APPROVED`.
- Director/CEO requests an asset audit or a scan for orphans/dead refs.

## When NOT to invoke

- Editing transient session state, `PLAN.md`, or files outside the governance directories.
- Generating media (`raw/`, `reviewed/`, `approved/` paths in `H:\My Drive\...`) — those follow a separate media gateway protocol (`specs/system/media_gateway.md`).

---

*SandyStudio skill | sandystudio-archivist | STUB v0.1 | Sprint 5 owner: EXEC-ARCH*
