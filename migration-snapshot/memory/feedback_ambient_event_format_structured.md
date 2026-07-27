---
name: feedback-ambient-event-format-structured
description: "System/pipeline event rows in Polina↔Director CHAT must show WHO(human role, the event's SUBJECT) · WHAT · TARGET(shot+kind+VERSION) with role-colour — reuse the Activity-feed formatter, don't keep the chat's inferior duplicate"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: b9958896-0b0d-4a48-8124-5e7cbbee4fc6
---

Scope (took several rounds + Director corrections to pin down): about the **system/pipeline event rows INSIDE the Polina↔Director chat** (`role === 'pipeline'` in [ConciergePanel.tsx](../../../../../SandyStudio/webapp/components/concierge/ConciergePanel.tsx)). NOT the time-header above Polina's own bubbles (already works). Activity feed has the same class of gap but is a separate, lower-priority surface.

**Director's requirements (2026-07-04):** every system event row reads at a glance as `WHO · WHAT · TARGET`:
- **WHO** = the SUBJECT the event is ABOUT (q1: "ставить того о ком сообщается" — writer wrote → Writer; critic approved → Critic; artist finished → the artist), in HUMAN role names ("Continuity Critic", "Video Artist"), NOT codes like "wchk". Colour-highlight the role from the existing system palette, reusing existing logic — don't invent a new one.
- **WHAT** = plain action.
- **TARGET** = shot + asset kind + **VERSION** ("третью версию картинки двадцатой" → SH20 ... v03). Versions are explicitly required.

**KEY FINDING — the wanted behaviour already exists, in the wrong place.** The Activity feed's [ActivityEventRow.tsx](../../../../../SandyStudio/webapp/components/activity/ActivityEventRow.tsx) already implements ALL of it:
- `formatActivity()` → `{who, whoKind, action, verdict}`; `who` via `actorKind(actor)` + `agentDisplayName(actor)` from [agent-names.ts](../../../../../SandyStudio/webapp/lib/api/agent-names.ts) (the SINGLE source of truth: `EXEC-WCHK→"Continuity Critic"`, `EXEC-SW→"Writer"`, `EXEC-VGEN→"Video Artist"`).
- For agent events `actor` = the agent code (`EXEC-*`) = exactly the SUBJECT → maps to human role. For Director approvals `actor` = Director UUID → "You"/"Polina" (and the 0030 trigger already skips Director-own approvals).
- `action` for approvals = `[decision, shot, assetKind, versionTag]` — it PARSES shot+version out of the SS filename in the title, doesn't strip them.
- `WHO_STYLE` map = the role→colour palette (`--accent-*` tokens) the Director asked for.

**The chat has an inferior DUPLICATE** — `formatPipelineContent` in ConciergePanel.tsx (~line 109): strips the filename (`"<DECISION> on <filename> —"` regex → loses target), shows NO who, no palette. Classic anti-additivity duplication. Systemic fix = DELETE `formatPipelineContent`, route chat pipeline rows through the SAME `formatActivity`+`WHO_STYLE` (extract that core into one shared module so both surfaces physically call one).

**VERSIONS — two different cases (verified in code):**
1. Approval rows: version already lives in the filename in `title`; `formatActivity` extracts it. Reuse → done, no emit change.
2. Agent-completion rows ("artist finished v3"): [factory.ts:692](../../../../../SandyStudio/webapp/lib/agents/factory.ts:692) title = `"Video Artist completed — SH20 · REVISE"` — has role+shot+verdict but **NO version**; version lives only in the asset (`asset_id` UUID), never emitted. AND the agent branch of `formatActivity` ([ActivityEventRow.tsx:124](../../../../../SandyStudio/webapp/components/activity/ActivityEventRow.tsx:124)) builds only `verb+shot`, dropping versionTag/assetKind. So no formatter can show the version — the SOURCE doesn't carry it. Fix: make the SUBJECT emitter (factory, knows `out.assetId`) add the asset version to the `agent_completed` title/metadata (symmetric with the existing shot-label suffix), + extend the agent branch of `formatActivity` to include versionTag+assetKind. Fixes BOTH feed and chat at once ("systemic, not patchwork").

**Data-delivery gap (open q2):** to reuse `formatActivity`, chat needs the structured fields (`title`, `actor`, `event_type`). Chat's `Message` object for pipeline rows currently carries only `content`/`severity`/`createdAt`; the 0030 trigger bakes `title` into the flat `content` string and does NOT put `title` in turn.metadata (it DOES put `actor`). Options: (a) add `title` to turn metadata in trigger 0030 (SQL migration); (b) parse `title` back out of `content` (between `]` and `(actor=`), no migration; (c) extract `formatActivity`/`WHO_STYLE` into one shared module (needed either way). Тео leans (b)+(c). Awaiting Director's q2 choice.

**How to apply (needs `===5===`):** (1) extract shared formatter+palette module from ActivityEventRow; (2) chat ingestion carries actor(+title) into Message and renders via shared formatter with WHO chip; (3) delete `formatPipelineContent`; (4) factory.ts emits asset version in `agent_completed`; (5) extend agent branch of formatActivity with versionTag+assetKind. Net line-delta ~flat/negative (deleting the duplicate offsets the shared-module + emit tweaks).
