# SandyStudio — QA Report Schema
## specs/schemas/qa_report.md | v0.2 | APPROVED

> Defines the exact format of a quality assurance report.
> Produced by: EXEC-SREV (script QA), EXEC-WCHK (world/shot QA), ART-MS (music QA)
> Consumed by: EXEC-ORCH (routing), Director (approval decisions)

---

## PURPOSE

A QA report is issued every time an agent reviews a produced asset.
It is the formal record of whether an asset passes or fails quality criteria.
It drives the next action: approve, revise, or escalate.
Every QA report is filed in `reviews/` regardless of outcome.

---

## FILE NAMING

```
SS-[SEASON]-[EPISODE]-REV-[subject_type]_[subject_id]-v[NN]-[STATUS].md
Example: SS-S01-E01-REV-script_qa-v01-DRAFT.md
         SS-S01-E01-REV-shot_S01E01-A1-SC02-SH03-v01-DRAFT.md
         SS-S01-E01-REV-world_check-v01-DRAFT.md
```

---

## SCHEMA

```yaml
report_id: string             # REQUIRED — same as filename without extension
report_type: string           # REQUIRED — SCRIPT | STORYBOARD | SHOT | MUSIC | FINAL | FOUNDATION
subject_file: string          # REQUIRED — path to the file being reviewed
                              # Example: "scripts/s01/SS-S01-E01-SCR-the_souffle_affair-v01-DRAFT.md"
subject_version: string       # REQUIRED — version of the file reviewed e.g. "v01"
reviewer_agent: string        # REQUIRED — agent_id e.g. "EXEC-SREV"
date: string                  # REQUIRED — ISO format
retry_count: integer          # REQUIRED — which review attempt this is (starts at 1)
                              # If retry_count > max_retries, next_action must be ESCALATE

# --- RESULT ---
overall_result: string        # REQUIRED — PASS | FAIL | PASS-WITH-NOTES
                              # PASS-WITH-NOTES: approved but issues logged for awareness

# --- CHECKLIST ---
# Each check is a specific criterion the reviewer applies.
# Checklists differ by report_type (see below).

checks:
  - check_id: string          # REQUIRED — short identifier e.g. "CHK-001"
    check_name: string        # REQUIRED — what was checked
    result: string            # REQUIRED — PASS | FAIL | N/A
    notes: string             # OPTIONAL — detail on why failed, or context for N/A

# --- ISSUES (only if overall_result is FAIL or PASS-WITH-NOTES) ---
issues:
  - issue_id: string          # REQUIRED — e.g. "ISS-001"
    severity: string          # REQUIRED — CRITICAL | MAJOR | MINOR
                              # CRITICAL: blocks approval entirely
                              # MAJOR: must be fixed before next stage
                              # MINOR: should be fixed but does not block
    location: string          # REQUIRED — where in the document
                              # Example: "Act 2, Scene 3" or "Shot S01E01-A2-SC03-SH01"
    description: string       # REQUIRED — what the problem is
    recommendation: string    # REQUIRED — what should be done to fix it

# --- ROUTING ---
next_action: string           # REQUIRED — APPROVE | REVISE | ESCALATE
                              # APPROVE: overall_result is PASS or PASS-WITH-NOTES,
                              #          no CRITICAL issues
                              # REVISE: one or more CRITICAL or MAJOR issues,
                              #         retry_count < max_retries
                              # ESCALATE: retry_count >= max_retries, or
                              #           CRITICAL issue that agent cannot resolve

escalation_reason: string     # REQUIRED if next_action is ESCALATE
                              # Example: "3 revision cycles completed. Script still
                              #           missing Act 2 comedy beat from brief.
                              #           Director decision required on brief revision
                              #           vs accepting script as-is."

revision_instructions: string # REQUIRED if next_action is REVISE
                              # Specific instructions for the producing agent.
                              # Must be actionable — not vague.

# --- APPROVAL RECORD (populated when next_action is APPROVE) ---
approved_by: string           # REQUIRED when next_action is APPROVE
                              # "Director/CEO" | "AI-EP"
                              # Records who approved — critical for audit trail
approved_date: string         # REQUIRED when next_action is APPROVE — ISO format
approval_notes: string        # OPTIONAL — any conditions or caveats on the approval
                              # Example: "Approved with note: fix typo in scene 3
                              #           before storyboard begins"
```

---

## CHECKLISTS BY REPORT TYPE

### SCRIPT (EXEC-SREV)

| check_id | Check Name |
|----------|-----------|
| CHK-S01 | All comedy beats from brief are present in script |
| CHK-S02 | All characters behave per approved profiles |
| CHK-S03 | All locations exist in approved World Bible |
| CHK-S04 | Dialogue ratio ≤ 40% of scenes |
| CHK-S05 | Act end states match brief act_structure |
| CHK-S06 | Scene count consistent with target runtime |
| CHK-S07 | All actions are storyboardable (no internal states described) |
| CHK-S08 | No character does anything in their never_does list |

### STORYBOARD / WORLD CHECK (EXEC-WCHK)

| check_id | Check Name |
|----------|-----------|
| CHK-W01 | All locations match World Bible exactly |
| CHK-W02 | All lighting conditions match World Bible rules per location |
| CHK-W03 | All characters_present are in approved Character Profiles |
| CHK-W04 | All props are in World Bible object inventory |
| CHK-W05 | Shot durations sum to match target runtime ± 20% |
| CHK-W06 | No physics violations (per World Bible physics rules) |
| CHK-W07 | Character appearance notes align with canonical_prompt_fragment |
| CHK-W08 | Continuity check: character positions consistent shot-to-shot within scene |

### SHOT (EXEC-WCHK — individual generated shot)

| check_id | Check Name |
|----------|-----------|
| CHK-SH01 | Character(s) visually match canonical_prompt_fragment |
| CHK-SH02 | Location matches World Bible description |
| CHK-SH03 | Lighting matches specified lighting_condition |
| CHK-SH04 | Action in shot matches shot schema action description |
| CHK-SH05 | No unspecified characters or objects in frame |
| CHK-SH06 | Style consistent with Style Bible |
| CHK-SH07 | Video quality meets media format spec |

### MUSIC (ART-MS)

| check_id | Check Name |
|----------|-----------|
| CHK-M01 | Duration matches target scene duration ± 2 seconds |
| CHK-M02 | Mood matches music brief specification |
| CHK-M03 | Instrumentation matches music brief |
| CHK-M04 | Style consistent with Style Bible audio aesthetic |
| CHK-M05 | No abrupt starts or endings (suitable for assembly) |

---

## RETRY LIMITS

| Subject type | Max retries | Escalate after |
|-------------|-------------|---------------|
| Script | 3 | 3rd FAIL → Director decides |
| Storyboard | 2 | 2nd FAIL → Director decides |
| Shot (generation) | 3 | 3rd FAIL → Director decides |
| Music | 2 | 2nd FAIL → Director decides |

Full retry protocol: `specs/protocols/qa_retry.md` (Sprint 3).

---

## EXAMPLE

```yaml
report_id: "SS-S01-E01-REV-script_qa-v01-DRAFT"
report_type: "SCRIPT"
subject_file: "scripts/s01/SS-S01-E01-SCR-the_souffle_affair-v01-DRAFT.md"
subject_version: "v01"
reviewer_agent: "EXEC-SREV"
date: "2026-04-23"
retry_count: 1

overall_result: "FAIL"

checks:
  - check_id: "CHK-S01"
    check_name: "All comedy beats from brief present"
    result: "FAIL"
    notes: "Brief lists 3 comedy beats. Script contains beats 1 and 3 but
            beat 2 (Clouseau magnifying glass heat gag) is absent."
  - check_id: "CHK-S02"
    check_name: "Characters behave per approved profiles"
    result: "PASS"
  - check_id: "CHK-S07"
    check_name: "All actions are storyboardable"
    result: "PASS"

issues:
  - issue_id: "ISS-001"
    severity: "MAJOR"
    location: "Act 2, Scene 3"
    description: "Comedy beat #2 from brief (magnifying glass heat gag) is missing.
                  Act 2 currently has only one active gag, making it feel flat."
    recommendation: "Insert a scene between SC03 and SC04 where Clouseau uses
                     magnifying glass to examine countertop, accidentally focusing
                     sunlight onto soufflé #3."

next_action: "REVISE"
revision_instructions: "Add magnifying glass heat gag in Act 2 between scenes 3 and 4.
                        Keep to 1–2 scenes. Clouseau is unaware of the effect.
                        Panther watches in slow-motion horror. Resubmit as v02."
```

---

*SandyStudio qa_report.md schema | v0.2 | Status: APPROVED*
*Changes: added approved_by, approved_date, approval_notes fields for audit trail*
