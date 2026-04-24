# SandyStudio — Version Cascade Protocol
## specs/protocols/version_cascade.md | v0.1 | APPROVED

> Defines what happens when an upstream document changes version.
> Protects the pipeline from silent inconsistencies.
> Enforced by: EXEC-ARCH (detection) + EXEC-ORCH (routing) + Director (approval of re-work scope)

---

## PROBLEM THIS SOLVES

When a script changes from v01 to v02, the storyboard derived from v01 is now
based on outdated source material. If no one catches this, the studio generates
video from a storyboard that no longer matches the approved script.

Without a cascade protocol, version drift is invisible until final assembly —
when mismatches are expensive to fix.

---

## CORE RULE

> Every downstream asset carries a reference to the upstream version it was derived from.
> When that upstream version changes, all downstream assets derived from the old version
> are automatically marked INVALIDATED until re-validated or re-created.

---

## DEPENDENCY CHAIN

```
Series Slate (LOCKED)
    └──► Master Plan
         └──► Style Bible
              └──► World Bible
                   └──► Character Profiles
                        └──► Season Arc
                             └──► Episode Brief
                                  └──► Script
                                       └──► Storyboard (all shots)
                                            └──► Generation Prompts (per shot)
                                                 └──► Generated Video Files
                                                      └──► Assembly
```

A version change at any level invalidates everything below it in the chain.

---

## TRIGGER CONDITIONS

A cascade is triggered when ANY of the following occurs:

| Event | Trigger |
|-------|---------|
| Approved document gets a new version (v01 → v02) | Director approves revision |
| Director explicitly invalidates a document | Director instruction |
| EXEC-SREV or EXEC-WCHK flags a source inconsistency | QA report with CRITICAL issue |

---

## CASCADE PROCESS

### Step 1 — Detection (EXEC-ARCH)

When a new version of a document is approved:
```
EXEC-ARCH scans all downstream files for references to the old version.

Check fields:
  brief.md        → script: brief_version field
  script.md       → storyboard: script_version field per shot
  shot.md         → prompt: source_version field
  prompt.md       → generated file: source_version field
```

EXEC-ARCH produces a **Cascade Impact Report**:
```
SS-[SEASON]-[EPISODE]-REV-cascade_[source_id]_v[old]_to_v[new]-v01-DRAFT.md
```

### Step 2 — Impact Report (EXEC-ARCH → Director)

Cascade Impact Report contains:

```yaml
cascade_id: string                # unique ID
triggered_by: string              # document that changed
old_version: string               # e.g. "v01"
new_version: string               # e.g. "v02"
change_summary: string            # what changed in the new version (from diff)

invalidated_assets:
  - asset_type: string            # e.g. "storyboard", "shot", "prompt", "video"
    asset_id: string
    current_status: string
    invalidation_reason: string   # why this specific asset is affected

scope_assessment:
  total_invalidated: integer
  estimated_rework_effort: string # e.g. "3 shots need regeneration"
  unaffected_assets: integer      # assets downstream that are NOT affected

director_decision_required:
  options:
    - option: "FULL CASCADE"
      description: "Invalidate all listed assets, re-create from new version"
    - option: "PARTIAL CASCADE"
      description: "Director specifies which assets to invalidate vs grandfather"
    - option: "REVERT"
      description: "Revert to old version (create new version = old content)"
```

### Step 3 — Director Decision

Director reviews the Cascade Impact Report and chooses:
- **FULL CASCADE** → All listed assets marked INVALIDATED, re-work queued
- **PARTIAL CASCADE** → Director specifies which assets to invalidate
- **REVERT** → The new version is not used; old version remains current

### Step 4 — INVALIDATION (EXEC-ARCH)

For each asset chosen for invalidation:
1. EXEC-ARCH updates the asset's `status` field to `INVALIDATED`
2. EXEC-ARCH adds `invalidated_by` and `invalidated_date` fields
3. EXEC-ARCH updates PLAN.md file tracker: status = INVALIDATED, owner = producing agent
4. EXEC-ORCH queues re-work for each invalidated asset

### Step 5 — Re-Work Queue (EXEC-ORCH)

EXEC-ORCH prioritises re-work:
1. Upstream assets first (storyboard before prompts before video)
2. Shots in scene order (not random)
3. New versions of invalidated assets increment version number (v01 → v02)
4. Old INVALIDATED files remain in place (never deleted) for audit trail

---

## GRANDFATHERING (PARTIAL CASCADE)

When Director chooses PARTIAL CASCADE, some assets may be "grandfathered" —
kept from the old version despite upstream changes, if the change does not affect them.

Example: Script v02 changes Act 3 only. Storyboard shots from Acts 1 and 2
may be grandfathered if Act 1/2 content is unchanged.

Grandfathered assets:
- Retain their current status (APPROVED / REVIEWED)
- Get a `grandfathered_from` note added: source version they were originally derived from
- Are logged in the Cascade Impact Report as "grandfathered"
- Remain valid for production

---

## LOCKED FILE RULE

`LOCKED` files are **never invalidated**. They are the gold master.
If a LOCKED file's upstream changes:
- A new version of the LOCKED file must be created (e.g. v02)
- The LOCKED v01 remains frozen forever
- Director must approve the new version before production uses it

---

## FIELDS REQUIRED IN ALL DOWNSTREAM ASSETS

Every asset schema includes a version reference field:

| Asset | Field name | Points to |
|-------|-----------|-----------|
| Script | `brief_version` | Approved brief version |
| Shot (in storyboard) | `script_version` | Approved script version |
| Prompt | `source_version` | Approved shot version |
| Generated file | tracked in prompt file | Prompt version |

These fields are mandatory. EXEC-ARCH checks them on every QA cycle.

---

*SandyStudio version_cascade.md | v0.1 | Status: DRAFT*
