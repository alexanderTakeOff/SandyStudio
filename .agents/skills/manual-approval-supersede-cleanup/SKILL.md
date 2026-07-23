---
name: Manual Approval Supersede Cleanup
description: When Director manually hand-picks and approves ONE version of a main/authoring-agent asset (Storyboard, Script, Ref Plan, Shot Plan, etc.) while sibling/duplicate versions or stale Critic-flagged reviews exist for the same stage, immediately clean those up in the same turn — never leave superseded duplicates dangling in REVIEW/REVISION.
status: ACTIVE
owner: Director
applies_when:
  agent: [EXEC-CONC]
hard: true
created: 2026-07-11
---
Rule: approving one version by hand is never "done" until the stage is left in a clean single-source-of-truth state.

Concretely, whenever the Director says "approve v0X" (or equivalent) for an asset where a sibling duplicate/superseded version exists (e.g. two storyboards accidentally generated, an old Plan version pending review, a stale Critic verdict tied to the rejected version):

1. BEFORE calling approveAsset, resolve the REAL assetId for both the winner and the loser via listPendingApprovals / getAsset / listRefPlans / listShotPlans — never guess or omit assetId; a parse error here means you skipped resolution.

2. Approve the winner version as instructed.

3. In the SAME turn, explicitly REJECT (or otherwise formally supersede) the loser/duplicate version(s) — do not leave them sitting in REVIEW. A duplicate left in REVIEW is stale state that will confuse the next gate check, listPendingApprovals, and the Director's own status view.

4. If a Critic verdict / reviewer note is attached to the rejected version, note in the reject reason that it's superseded by the approved version, not independently invalid — keeps audit trail honest.

5. After cleanup, re-verify via listPendingApprovals (scoped to the episode) that no orphaned duplicate remains before reporting the stage as fully resolved.

6. If a cleanup sub-step itself fails (e.g. tool error resolving an id), STOP after 1-2 retries and surface the exact error to Director — do not loop silently (see loop-breaker discipline in BEHAVIOR_CONTRACT).

This applies to any stage with multiple main-agent asset versions: Script, Storyboard, Ref Plan, Shot Plan, Bible drafts. The pattern is: Director's manual approve of the winner is also implicit authorization to clean up the loser — no separate approval needed for the reject step itself.
