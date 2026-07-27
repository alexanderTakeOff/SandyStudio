---
name: director-minimal-changes-no-new-entities
description: "Design directive: don't invent new entities/concepts; achieve the goal with the MINIMAL change by extending what already exists. The 'anchor' concept was over-engineering — could have been episode_ref + a `_end`-suffixed sibling. Cross-project, 2026-06-03."
metadata: 
  node_type: memory
  type: project
  originSessionId: e48f29ce-04b7-43a0-8224-f06849b8e1e8
---

**Director directive 2026-06-03 (SandyStudio E02 animatic session).** Cross-project design philosophy.

## The rule

> «Не надо изобретать новые сущности — нужно стараться минимальными изменениями добиваться цели.»

Before introducing a NEW entity, type, concept, agent, asset_type, table, or pipeline stage, ask: **can the goal be met by extending an existing concept instead?** Prefer the smallest change that reuses what's already there.

## The worked example that prompted it — the "anchor" over-engineering

TD-49 introduced a whole new **`IMG-anchor`** entity to give video continuity a START + END frame per shot. The Director's point: this was unnecessary invention. The same outcome was achievable with the EXISTING `IMG-episode_ref` concept:

- the base `episode_ref` for a shot = the **start** frame;
- add a sibling ref with the **identical shot number + a `_end` suffix** = the **end** frame.
- "if there's one ref, it's the one (start); if there's an identical-numbered one, it becomes the second (end)." Done — no new type.

Because a separate `anchor` entity was invented instead, it spawned a long tail of complexity and bugs (all hit in this one session):
- a separate generation path (anchor-gen vs ref-gen — Polina even mis-triggered ref-mode);
- a separate upstream **gate** requirement (EXEC-EDIT demanded `IMG-episode_ref`, blocking anchor episodes);
- separate gallery/drawer handling;
- a separate **shot_id matching** scheme (anchors keyed by filename `ss_s15…` vs storyboard `SS-S15-…` → silent 0-match, animatic built 2 frames instead of 30);
- builder needing an episode_ref fallback anyway.

Every one of those was a patch on top of an avoidable new entity.

## How to apply

- New requirement → first try to **express it as an attribute/sibling/suffix of an existing entity**, not a new type.
- A new entity must justify itself against the *full* cost it imposes: gen path + gate + UI + matching + tests + migration + every consumer. That cost is usually invisible at design time and shows up later as drift/bugs (as above).
- This is the YAGNI/KISS principle from `coding-style.md` applied at the DOMAIN-MODEL level, not just code.
- Existing over-engineered entities: don't mass-refactor (Director: «сейчас переделывать не будем»). Apply on the NEXT new-concept decision; refactor existing ones only when you're already touching them and the simplification is cheap.

## Cross-references

- `~/.claude/rules/common/coding-style.md` — YAGNI/KISS/DRY (this extends them to entities/domain model).
- [[director_message_stream_read_all_first]] — same partnership spirit: think before adding.
- Builds on `partnership.md` — proposing a new entity when a minimal extension works is exactly the kind of thing to push back on.
