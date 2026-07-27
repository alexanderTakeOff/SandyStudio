---
name: orchestrator-master-session-paradigm
description: "Decision to kill parallel-session merge conflicts via single orchestrator (master-session) + Workflow-dispatched worktree-isolated subagents. Adopted 2026-06-01, pending live obkatka."
metadata: 
  node_type: memory
  type: project
  originSessionId: c648eec7-24ab-4787-8cff-42bfb50582ce
---

Director was burning time/tokens resolving merge conflicts between multiple independent Claude Code sessions editing the same/similar files. Root cause diagnosed: **multiple uncoordinated writers, no single owner**. Not a parallelism problem — a single-writer problem.

**Decision (2026-06-01):** Adopt the **orchestrator / master-session paradigm**.

- **ONE master-session = the only dirigent and the only writer to `master`.** It decomposes big work into file-disjoint units and dispatches them.
- Big parallel chunks go through the **Workflow tool**: JS script → `agent()` calls, each a fresh Claude with own context window, each in its own git **worktree** (`isolation: 'worktree'`) → **auto-merge** back. Conflicts impossible because units are partitioned to non-overlapping files BEFORE dispatch.
- Other live human-driven sessions during a run: **read-only or closed**. Single-writer is enforced by Director closing siblings + Тео being sole dispatcher — the harness gives NO god-mode over sibling windows.

**Why NOT the heavy tooling** (`dmux-workflows`, `claude-devfleet`, `autonomous-loops`): they solve a different problem — manual multi-pane supervision or full autonomy — and add their own state/service/learning curve. Workflow does file-disjoint parallel-under-control natively in-harness. Keep them in library for the day we want autonomous nightly runs.

**q5a chosen:** master-session lives on a fresh session opened directly on `master` (root `C:\SandyStudio`, not a worktree). The worktree session `festive-benz-424128` where this was discussed is to be closed.

**Status:** paradigm AGREED + RE-AFFIRMED as a standing rule by Director 2026-06-03. No longer "pending obkatka" — it is the default operating mode now. Plan to cement into `CLAUDE.md §12` still open; extracting a cross-project `flavor: process` skill still worth doing.

**Standing orchestration contract (Director directive 2026-06-03):** Тео is not "just a master-session" — he is an **orchestrator**. For EVERY non-trivial task:
1. **Make an explicit orchestration decision at the start, out loud.** Before touching anything, state: solo-edit vs parallel subagents vs Workflow pipeline. Don't drift into doing it solo by default.
2. **Default to delegating** — decompose into file-disjoint units, dispatch to subagents/worktrees, synthesize results. Master-session writes the synthesis, not the grunt work.
3. **Solo only for the trivial** — single-file edits, reads, conversational replies.

This is the loop's entry gate, not a suggestion. See [[plan_md_living_anchor]] §12 parallel-session discipline (superseded/extended).

**How to apply on resume:** if on `master` root session — write the §12 protocol, then take first backlog task as live Workflow demo. Builds on CLAUDE.md §12 "Parallel-session discipline" (which already had PLAN.md-owner rule; this extends it to all writes).
