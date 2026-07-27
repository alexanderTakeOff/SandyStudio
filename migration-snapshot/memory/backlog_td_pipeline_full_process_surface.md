---
name: backlog-td-pipeline-full-process-surface
description: Director directive — pipeline UI must expose EVERY stage (Bible/Library/Casting too) as a manually-traversable node; casting goes before the brief
metadata: 
  node_type: memory
  type: project
  originSessionId: 933fcbb8-b0a4-4eed-b4c1-4b543c51d981
---

Director directive 2026-06-14: the **pipeline is the canonical surface of the WHOLE process**, not
just the per-episode generation tail. Every stage must be a visible node the Director (or an
authorized deputy acting as Director) can step into and run **by hand**, including for **training**.
«Заходишь в этап Casting, смотришь кто в библиотеке, привязываешь, нет — создаёшь нового, идёшь дальше.»

**Canonical stage order:**
- Series tier (once, reusable): **Bible** create/edit → General Idea → World/Characters/Style →
  **Library** (asset CRUD).
- Episode tier: **Episode concept/logline** → **CASTING** (bind library→episode; missing asset →
  loop to Library to create, then bind; absorbs canon-existence preflight) → **Brief** → Writer →
  Script Critic → Storyboard → WCHK → Designer → EPREV → Artist → Animator → VGEN → Stitch.

**Casting placement = BEFORE the brief** (after the lightweight episode concept), i.e. before the
writer. **Why:** brief author + writer must work inside the LOCKED cast (writer writes knowing which
characters/objects/locations exist). The chicken-egg (cast↔idea) resolves by splitting the
lightweight *concept* (precedes casting) from the full *brief* (follows casting). Casting before
brief makes phantom locations impossible by construction → kills the canon-preflight TD at root.

Lives in the sprint plan `~/.claude/plans/lazy-swinging-sundae.md` Thread 1. Builds on
[[backlog_td_artdir_breakdown_role]] (ART-AD owns Casting + Library-CRUD stages) and the
[[director_process_and_people_first]] doctrine (process surface, not code patch).
