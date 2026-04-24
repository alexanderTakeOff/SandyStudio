# Director/CEOStudio — Batch Approval Protocol
## specs/protocols/batch_approval.md | v0.1 | DRAFT

> Defines how Director/CEO and EXEC-DIR-AI review and approve multiple assets efficiently.
> Without this protocol, approving one episode requires 100+ individual decisions.
> This protocol makes scale manageable without sacrificing Director/CEO authority.

---

## PROBLEM

A single episode produces approximately:
- 1 brief
- 1 script
- 1 storyboard (50–80 shots)
- 50–80 generated video files
- 3–6 music tracks
- 1 assembled episode
- 1 metadata set
- 1 thumbnail

Under the standard approval protocol, every file requires Director's explicit "approved".
That is 100+ decisions per episode, which is operationally unsustainable.

---

## SOLUTION: TIERED APPROVAL

Assets are grouped into approval tiers. Lower tiers can be approved in batch.
Higher tiers always require individual Director review.

---

## TIER DEFINITIONS

### TIER 1 — Individual Director Review Required (always)
These decisions are too consequential for batch approval.

| Asset | Why individual |
|-------|---------------|
| Episode Brief | Sets all downstream creative direction |
| Script (final version) | Narrative quality judgment |
| Character Profiles (first version) | Defines visual canon |
| Style Bible | Defines studio aesthetic |
| World Bible | Defines all production rules |
| Final assembled episode | The actual product |
| Any LOCKED status | Permanent — cannot be undone |
| Publish to YouTube | Exits the studio system |
| Any escalated QA failure | Requires judgment call |

---

### TIER 2 — Batch Review with Spot-Check
Director reviews a summary + spot-checks a sample. Approves in one decision.

| Asset | Batch structure | Spot-check recommendation |
|-------|----------------|--------------------------|
| Storyboard shots | Per act (15–25 shots) | Review 3–5 shots per act |
| Generated video shots | Per scene (3–8 shots) | Review every shot flagged PASS-WITH-NOTES |
| Music tracks | Per episode (all tracks together) | Listen to 30-second excerpts |
| Thumbnails | Per episode (2–3 options) | Full review (small set) |

**Batch approval format:**

```
Director receives: Batch Review Digest
Contains:
  - Summary of what was produced (counts, pass rates)
  - QA results for the batch (overall + any PASS-WITH-NOTES)
  - Spot-check selection (specific items for Director to review)
  - One approval decision covers the whole batch

Director responds:
  "approved batch [act/scene ID]" → all items in batch → APPROVED
  "approved batch [ID] except [item ID]" → named item sent back to producing agent
  "reject batch [ID]" → full batch returned for revision
```

---

### TIER 3 — Standing Approval (auto-approved once standing order set)

Director may issue a Standing Approval for specific asset types:

> "All storyboard shots that pass EXEC-WCHK with PASS (not PASS-WITH-NOTES)
>  are auto-approved without my review."

Standing approvals:
- Are issued once per asset type per episode (or per season)
- Are stored in PLAN.md under `## Standing Approvals`
- Can be revoked by Director at any time
- Do not apply to ESCALATED items (those always reach Director)
- Do not apply to the first instance of any asset type (first storyboard, first generated shot)

---

## BATCH REVIEW DIGEST FORMAT

EXEC-ORCH produces a Batch Review Digest whenever a batch is ready for Director review.

```markdown
# Batch Review Digest
## [Episode] — [Asset Type] — [Act/Scene]
**Date:** [ISO date]
**Prepared by:** EXEC-ORCH

### Summary
- Items in batch: [N]
- QA result: [N] PASS, [N] PASS-WITH-NOTES, [N] escalated
- Estimated review time: [X minutes]

### Spot-Check Selection (review these specifically)
1. [item_id] — [reason for selection: e.g. "PASS-WITH-NOTES: minor style inconsistency"]
   File: [path]
2. [item_id] — [reason]

### Full Batch List
| Item | QA Result | Notes |
|------|-----------|-------|
| [shot_id] | PASS | — |
| [shot_id] | PASS-WITH-NOTES | Minor: background colour slightly warm |
| [shot_id] | PASS | — |

### Approval Options
- "approved batch [ID]" — approve all items
- "approved batch [ID] except [item_ids]" — approve all except named items
- "reject batch [ID]" — return all for revision
```

---

## APPROVAL CADENCE

| Phase | Recommended cadence | Volume |
|-------|--------------------|----|
| Creative foundation | Individual, as produced | 3–5 files |
| Script | Individual | 1 file |
| Storyboard | Per act (one session per act) | 3 sessions |
| Shot generation | Per scene (one session per scene) | ~10 sessions |
| Music | One session (all tracks) | 1 session |
| Assembly + final | Individual (the product itself) | 1 session |
| Metadata + thumbnail | One session | 1 session |

Total Director review sessions per episode: ~18–20 (vs 100+ without batch protocol).

---

## FIRST EPISODE EXCEPTION

For the PILOT episode, no batch approvals or standing approvals are permitted.
Every item goes through individual Director review.

Reason: The pilot establishes visual canon. Every shot informs what is acceptable
for future episodes. Shortcuts here create inconsistency that propagates across the series.

Standing approvals and batch review unlock from Episode 2 onward.

---

## DELEGATE APPROVAL

When a Producer participant exists (see specs/company/participants.md), Director may
delegate Tier 2 batch approvals to Producer for specific episodes:

> "Producer may approve shot batches for S01E03."

Delegated approvals:
- Must be explicitly granted per episode (not blanket per season)
- Cannot be delegated for Tier 1 assets
- Are logged in PLAN.md with delegating statement and date
- Director retains override authority at all times

---

*Director/CEOStudio batch_approval.md | v0.1 | Status: DRAFT*
