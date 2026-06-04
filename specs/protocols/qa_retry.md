# SandyStudio — QA Retry Protocol
## specs/protocols/qa_retry.md | v0.1 | APPROVED

> Defines what happens when a QA check fails: retry limits, ownership, and escalation.
> Enforced by: EXEC-ORCH
> QA agents (EXEC-SREV, EXEC-WCHK, ART-MS) follow this protocol on every failure.

---

## CORE PRINCIPLE

Every failure has a retry budget. When the budget is exhausted, the decision
escalates to the Director. Agents never loop silently — every attempt is logged.
Every escalation surfaces exactly why the agent cannot resolve the issue.

---

## RETRY BUDGETS BY ASSET TYPE

| Asset | QA Agent | Max Retries | Escalates After |
|-------|----------|-------------|-----------------|
| Script | EXEC-SREV | 3 | 3rd FAIL |
| Storyboard | EXEC-WCHK | 2 | 2nd FAIL |
| Individual Shot (generation) | EXEC-WCHK | 3 | 3rd FAIL |
| Music track | ART-MS | 2 | 2nd FAIL |
| Thumbnail image | EXEC-WCHK | 2 | 2nd FAIL |

`retry_count` in the QA report (specs/schemas/qa_report.md) tracks attempt number.
Attempt #1 = first review. Attempt #3 = third and final before escalation.

### Plan critics (EPREV / VPREV / GAGAD) — enforced in code

The per-shot **plan** critics enforce this protocol automatically (I9, 2026-06-04,
`lib/agents/critic-loop.ts` `applyCriticVerdict`). A REVISE re-fires the
Designer/Animator with the verdict as hard criteria; once **cap = 2** revisions are
reached, the next REVISE is coerced to **HALT** — the Plan stays in REVIEW and a
`revision_requested` event escalates to the Director Inbox (Director is not the
first defect router — see the critic-revision-cap doctrine in `specs/glossary.md`).
The attempt counter is the Plan asset's `version` (v01 = attempt 1 = 0 revisions),
so it survives the re-authoring that creates a fresh Plan asset each cycle.

| Asset | Critic | Cap | Escalates After |
|-------|--------|-----|-----------------|
| SPC-ref_plan | EXEC-EPREV | 2 | 2 revisions → HALT |
| SPC-shot_plan | EXEC-VPREV | 2 | 2 revisions → HALT |
| SPC-gag_plan review | EXEC-GAGAD | 2 | 2 revisions → HALT |

---

## RETRY FLOW

```
PRODUCING AGENT creates asset
        │
        ▼
QA AGENT reviews → writes QA Report (attempt #N)
        │
        ├─── PASS ──────────────────────────────────────────────► Asset → APPROVED pipeline
        │                                                          EXEC-ORCH routes forward
        │
        ├─── FAIL (attempt < max_retries)
        │         │
        │         ▼
        │    EXEC-ORCH routes QA report back to PRODUCING AGENT
        │    QA report includes revision_instructions (mandatory)
        │         │
        │         ▼
        │    PRODUCING AGENT revises asset (increments version)
        │    PRODUCING AGENT re-submits → back to QA AGENT (attempt N+1)
        │
        └─── FAIL (attempt = max_retries)
                  │
                  ▼
             EXEC-ORCH escalates to Director
             QA report includes escalation_reason (mandatory)
             Director chooses one of three paths (see Escalation Options)
```

---

## REVISION INSTRUCTIONS (required on every FAIL)

When a QA agent writes a FAIL report, `revision_instructions` must be:
- **Specific** — name the exact location (scene, shot, beat)
- **Actionable** — describe exactly what to change
- **Bounded** — state the minimum change required (do not over-prescribe)

**Bad:** "The script needs more comedy."
**Good:** "Act 2, Scene 3 is missing the magnifying glass heat gag specified in brief
           item #2. Insert 1–2 scenes between SC03 and SC04 showing Clouseau's
           magnifying glass accidentally focusing sunlight onto the soufflé.
           Clouseau must be unaware of the effect."

---

## ESCALATION OPTIONS

When Director receives an escalation, they choose one of:

| Option | Description | EXEC-ORCH action |
|--------|-------------|-----------------|
| **REVISE-BRIEF** | The brief is wrong — change the requirement | Brief gets new version; cascade protocol triggers; producing agent restarts |
| **ACCEPT-AS-IS** | Asset passes despite failing the check | Asset status → APPROVED with Director note overriding QA |
| **REASSIGN** | Different agent or approach for this asset | EXEC-ORCH assigns to alternative method or manual intervention |
| **SKIP** | This asset is dropped from the episode | Asset marked SKIPPED in PLAN.md; downstream adjusted |

---

## SHOT REGENERATION SPECIFICS

For individual shot generation failures (EXEC-VGEN → EXEC-WCHK):

### Failure categories and retry approach

| Failure type | Retry approach |
|-------------|---------------|
| Character appearance wrong | Update `canonical_prompt_fragment` → regenerate |
| Location/setting wrong | Update prompt location description → regenerate |
| Action not matching shot spec | Revise prompt action text → regenerate |
| Style inconsistency | Adjust style fragment → regenerate |
| Technical quality (blur, artifact) | Change seed or model parameter → regenerate |

### Prompt versioning on retry

Each retry creates a new prompt version:
- `SS-S01-E01-PRO-video_[shot_id]-v01-FAIL.md` (original)
- `SS-S01-E01-PRO-video_[shot_id]-v02-DRAFT.md` (retry)

Failed prompts are retained — not deleted. They are the studio's learning record.

### Character consistency escalation

If a character fails CHK-SH01 (visual match to canonical_prompt_fragment) across
2+ consecutive shots despite prompt revision:

→ Automatic escalation to ART-CAST + ART-AD
→ Issue: canonical_prompt_fragment may need updating
→ If fragment is updated: ALL existing approved prompts using old fragment are INVALIDATED
   (version cascade applies)
→ Director approves updated fragment before any new generation begins

---

## WHAT EXEC-ORCH LOGS

For every QA cycle, EXEC-ORCH writes to PLAN.md file tracker:

```
| Shot S01E01-A1-SC02-SH02 | v01 | FAIL (attempt 1/3) | EXEC-WCHK | → EXEC-VGEN (revise prompt) |
| Shot S01E01-A1-SC02-SH02 | v02 | FAIL (attempt 2/3) | EXEC-WCHK | → EXEC-VGEN (revise prompt) |
| Shot S01E01-A1-SC02-SH02 | v03 | FAIL (attempt 3/3) | EXEC-WCHK | → ESCALATE Director |
```

This makes the full history of any asset's QA journey visible at a glance.

---

## PASS-WITH-NOTES

`PASS-WITH-NOTES` is a valid QA outcome. It means:
- The asset is approved for the next stage
- Minor issues are logged but do not block progress
- Issues are flagged to Director in the next digest
- A MINOR issue that appears in 3+ consecutive episodes gets escalated to ART-AD
  for a systemic fix (not just a per-episode patch)

---

*SandyStudio qa_retry.md | v0.1 | Status: DRAFT*
