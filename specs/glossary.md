# SandyStudio — Glossary / Глоссарий

> **Status:** DRAFT v0.1 · 2026-05-01
> **Purpose:** Single source of truth for every term used across CLAUDE.md, agent prompts, contracts, schemas, UI, and Concierge dialogue.
> **Bilingual rule:** every term has both RU and EN form. UI may show either based on user preference (see `display_ru` / `display_en` in [`webapp/lib/agents/registry.ts`](../webapp/lib/agents/registry.ts)).
> **Growth rule:** every new spec MUST add its new terms here in the same commit. Glossary never trails behind specs.

## Table of contents

1. [Roles / Роли](#1-roles--роли)
2. [Production scope / Уровни производства](#2-production-scope--уровни-производства)
3. [Series-level pre-production / Pre-production уровня сериала](#3-series-level-pre-production--pre-production-уровня-сериала)
4. [Episode pipeline / Пайплайн эпизода](#4-episode-pipeline--пайплайн-эпизода)
5. [Visual derivatives / Визуальные деривативы](#5-visual-derivatives--визуальные-деривативы)
6. [Asset & contract concepts / Ассеты и контракты](#6-asset--contract-concepts--ассеты-и-контракты)
7. [Status & gates / Статусы и гейты](#7-status--gates--статусы-и-гейты)
8. [Operating modes / Режимы работы](#8-operating-modes--режимы-работы)
9. [Scope discipline / Дисциплина скоупа](#9-scope-discipline--дисциплина-скоупа)

---

## 1. Roles / Роли

### Director / Режиссёр (CEO)
Final human authority. Owner of every approval. Creates briefs, accepts or rejects deliverables at every gate. Cannot be impersonated by an agent. Synonyms: CEO, Sandy. See `agents` (none — Director is human).

### Producer / Продюсер
Top-level orchestrating agent. Owns episode plan: chooses sub-agents, sequences contracts, enforces cost ceilings, escalates to Director. Does NOT make creative decisions — composes them from sub-agents. Implemented via `EXEC-ORCH` (currently a stub; promotion is part of the Producer spec). See [`specs/system/producer.md`](system/producer.md) (planned).

### Assistant / Ассистент (Concierge)
Conversational interface agent between Director and Producer. Translates voice/text intent into actions, surfaces pending items, proactively reports status. Does not approve creative work and does not run pipeline stages. Implemented via `EXEC-CONC`. See [`agents/exec/concierge.md`](../agents/exec/concierge.md).

### Sub-agent / Под-агент (Specialist)
Single-purpose execution agent (Screenwriter, Storyboarder, World Checker, etc.). Fulfils exactly one contract. Replaceable by any other agent that honours the same contract. All `EXEC-*` entries except `EXEC-ORCH` and `EXEC-CONC` are sub-agents.

### Validator / Валидатор (Reviewer)
Subclass of sub-agent whose contract is to verify another agent's output against Series Bible / canon / schema. Examples: `EXEC-SREV` (Script Reviewer), `EXEC-WCHK` (World Checker), `ART-CONT` (Continuity Supervisor).

---

## 2. Production scope / Уровни производства

### Series / Сериал
Top-level production unit (e.g. "Sandy & Friends"). Owns its own bible, libraries, audio palette, visual style. Spans multiple seasons. Series-level assets are LOCKED once approved and reused across all child episodes.

### Season / Сезон
Numbered grouping of episodes within a Series (e.g. `S01`, `S02`). May introduce new characters or refine style, but inherits Series Bible. Code: `S{NN}`.

### Episode / Эпизод
Atomic production unit — one short film. Produced by running the full episode pipeline (sections 4 below). Code: `E{NN}` within season; full code: `SS-{S}-{E}` (e.g. `SS-S01-E01`).

### Shot / Шот (план)
Smallest video unit — a single continuous camera take, typically 3–8 seconds. Each shot has one prompt, one Veo (or other video provider) generation, one approval. Shot id: `{episode_code}-A{N}-SC{NN}-SH{NN}` (Act-Scene-Shot).

---

## 3. Series-level pre-production / Pre-production уровня сериала

### Series Bible / Библия серии
Master document containing everything canonical about the series: world rules, hero list with refs, location list with refs, object list with refs, audio palette, visual style guide. Once a Series Bible section is LOCKED, no episode may contradict it. See [`specs/company/series_bible.md`](company/series_bible.md) (planned).

### World / Мир
Section of Series Bible: physics, geography, cultural rules of the universe (e.g. "in Sandy's world all objects have body language"). Describes WHAT EXISTS. No character or shot detail.

### Character canonical reference / Канонический референс персонажа
LOCKED visual + textual definition of one hero. Includes turnaround sheet (multiple angles + emotions), description, voice (when applicable), behavioural rules. Stored as `BIB-character_*` asset. Episode-level variations live in **Episode reference** (section 4).

### Location canonical reference / Канонический референс локации
LOCKED visual + textual definition of one location reused across episodes (e.g. "Sandy's kitchen"). Includes multi-angle views, lighting variants. Stored as `BIB-location_*`.

### Object canonical reference / Канонический референс объекта
LOCKED visual definition of a recurring prop (e.g. "Sandy's hourglass"). Per-episode props are NOT here — they live in Episode reference.

### Audio palette / Аудио палитра
Series-level sound canon: theme music, leitmotifs per character, ambient sound rules. Visual-only S01 still uses music + SFX (no dialogue). Stored as `BIB-audio_*`.

### Visual style guide / Гайд визуального стиля
LOCKED rules for rendering: art direction (e.g. "Flat 2D cartoon, bold black outlines, soft gradients"), color palette, line weights, typography. Stored as `BIB-style*`.

---

## 4. Episode pipeline / Пайплайн эпизода

The 9 stages every episode passes through, in order. Director may approve, request revision, or reject at every stage. **No stage may be skipped**, but Producer chooses HOW each stage is fulfilled.

### Brief / Бриф
**Stage 1.** Director's structured request for the episode: logline, premise, key beats, characters in this episode, tone & style notes, runtime. Asset: `SPC-brief`. Schema: [`specs/schemas/brief.md`](schemas/brief.md). Created by Director via webapp + Anthropic Haiku enrichment.

### Beat sheet / Бит-лист
**Stage 2.** 15–20 numbered story beats — set-ups and punchlines of comedy, structural skeleton. Cheap to revise. Catches structural problems before prose. Asset: `SCR-beats` (planned).

### Outline / Поэпизодник
**Stage 3.** Beat sheet expanded into scene-by-scene outline with character actions, no full prose. Asset: `SCR-outline` (planned). Approval here means structure is final.

### Script / Сценарий
**Stage 4.** Full prose script with dialogue (when applicable), action lines, comedy timing. Visual-comedy MVP: action lines only, no dialogue. Asset: `SCR-script`. Schema: [`specs/schemas/script.md`](schemas/script.md). Produced by `EXEC-SW`. Reviewed by `EXEC-SREV`.

### Storyboard / Раскадровка
**Stage 5.** Static panels — one per shot — with camera angle, location id, action description, duration. **Visualises STRUCTURE, not final picture.** Asset: `STB-storyboard`. Schema: [`specs/schemas/shot.md`](schemas/shot.md). Produced by `EXEC-SB`. Continuity-checked by `EXEC-WCHK` against Series Bible.

### Episode reference / Эпизод-референс
**Stage 6 (NEW).** Episode-specific reference pictures: heroes in episode-specific moods/poses/costumes, locations in episode-specific lighting/angles, episode-only props. Director approves these BEFORE Animatic. Sources MUST be canonical refs from Series Bible (continuity check enforces this). Asset: `IMG-episode_ref` (planned). Produced by Visual Generator with character + location refs as input.

### Animatic / Аниматик
**Stage 7.** Episode references arranged in timeline + scratch music + SFX. **First moment Director can validate comedy timing with sound.** A gag works or doesn't here — at low cost, before Veo. Asset: `VID-animatic`. Produced by `EXEC-EDIT`. Replaces today's silent placeholder.

### Video generation / Генерация видео
**Stage 8.** Per-shot video generation via Veo (or chosen provider) using episode references as image-to-video anchors. Each shot is separate Veo call. Asset: `VID-shot`. Produced by `EXEC-VGEN`. Most expensive stage.

### Assembly / Сборка
**Stage 9a.** Cuts + transitions + final music + final SFX mix into one MP4. Asset: `VID-assembly`. Produced by `EXEC-EDIT` (second pass) or dedicated assembly tool.

### Publish / Публикация
**Stage 9b.** YouTube (and other channels) upload + metadata + thumbnail. Asset: `SPC-metadata` + `IMG-thumbnail`. Produced by `EXEC-COPY`, `EXEC-THUMB`, `EXEC-PUB`. Hard limit — Director-only approval (Category A).

---

## 5. Visual derivatives / Визуальные деривативы

Every approved canonical or episode reference image automatically produces both forms:

### HiRes derivative / HiRes-дериватив
4K (or native model resolution) image. Used as input for Veo image-to-video, decisions, master archive.

### LoRes derivative / LoRes-дериватив
Thumbnail (e.g. 256×256). Used in webapp cockpit, Concierge avatars, lists. Generated automatically — never manually selected.

> Both derivatives belong to the same asset and are produced together as a postcondition of any visual contract. They are not separate approval items.

---

## 6. Asset & contract concepts / Ассеты и контракты

### Asset / Ассет
Any persistent artifact in the studio: file (markdown, image, video, audio) + DB row in `assets` table. Identified by filename per [CLAUDE.md §3](../CLAUDE.md). Has `file_type`, `status`, `version`, `content` or `drive_file_id`.

### Contract / Контракт
Machine-readable + human-readable specification of one agent's job: input schema, output schema, preconditions, postconditions, cost ceiling, SLA, escalation policy, approval gate. Stored as `specs/contracts/<name>@v{N}.md` with YAML front-matter for the machine fields. Format defined by [`specs/contracts/contract_format.md`](contracts/contract_format.md) (planned).

### Stage / Стадия
One step of the episode pipeline (e.g. "Storyboard"). Always corresponds to one or more contracts. A stage completes only when its primary asset reaches APPROVED.

### Gate / Гейт
Approval checkpoint between stages. Director (or in Mode 2/3, EXEC-DIR-AI) decides: APPROVE → next stage starts; REVISION → upstream agent re-runs with feedback; REJECT → stage halted.

### Approval / Одобрение
Recorded decision with actor, timestamp, optional revision_note. Stored on the asset (status transition) and in `activity_events`.

### Producer plan / План продюсера
Episode-level instance of a contract: which sub-agents Producer will engage, in what order, with what budget. Director approves the plan before execution begins (this is the Producer↔Director contract).

---

## 7. Status & gates / Статусы и гейты

| Status | Meaning |
|---|---|
| **DRAFT** | Just produced by an agent. Not yet seen by Director. |
| **REVIEW** | Submitted for Director approval. Editable. |
| **REVISION** | Director asked for changes. Agent re-runs with revision_note. Editable. |
| **APPROVED** | Director signed off. Downstream stages may consume this asset. Editable: NO. |
| **LOCKED** | Series-level canonical assets only. Frozen forever; new version requires new asset. Director-only transition. |
| **REJECTED** | Director permanently rejected. Stage halted. |
| **NEEDS_HUMAN_TWEAK** | Producer escalation: agent cannot self-correct, Director must intervene. |

Editable rule (text assets): only `DRAFT`, `REVIEW`, `REVISION`. See [`webapp/app/api/assets/[id]/content/route.ts`](../webapp/app/api/assets/[id]/content/route.ts).

---

## 8. Operating modes / Режимы работы

Per [CLAUDE.md §6](../CLAUDE.md). Approval authority levels.

| Mode | Code | Approver |
|---|---|---|
| **MANUAL** | Mode 1 | Director approves every gate. Default at session start. |
| **HYBRID** | Mode 2 | Director keeps defined scope; EXEC-DIR-AI handles the rest. |
| **DELEGATED** | Mode 3 | EXEC-DIR-AI approves all gates except hard limits. |
| **AUTOTEST** | Mode 4 | All gates auto-pass. Pipeline testing only. Reverts to Mode 1 on session end. |

**Hard limits** (Director-only, all modes): Publish · LOCKED transitions · Budget changes · Mode changes.

System modes (orthogonal): `===1===` ANALYTICS (read-only), `===5===` EDIT (writes permitted).

---

## 9. Scope discipline / Дисциплина скоупа

### MVP scope / MVP-скоуп
Minimum to prove the creative idea works for the pilot. For S01: 3 героя, 2 локации, 3-минутные эпизоды, visual comedy без диалога (но с music + SFX), no TTS, no auto-analytics loop. Anything beyond MVP is **post-pilot**. See [CLAUDE.md §11.8](../CLAUDE.md).

### Backbone / Костяк
The 9 episode stages above (Brief → Publish). Producer cannot skip a stage, but is free to choose HOW to fulfil each (which sub-agents, single-shot vs multi-pass). Backbone is fixed; composition is flexible.

### Continuity policy / Политика канона
Any visual element in an episode reference, animatic, or shot MUST trace back to a LOCKED Series Bible reference. Validators (`EXEC-WCHK`, `ART-CONT`) enforce this gate. New visual elements require either a new canonical ref (Series Bible update, separate sub-pipeline) OR an explicit episode-only ref approved by Director.

### Versioning policy / Политика версий
- **Costume change in episode** → new Episode reference, NOT new canonical ref.
- **Permanent appearance change** → new canonical ref version (`v02`), old version stays LOCKED for back-compat.
- **Error / regression** → revision of current version, not new version.
- Detailed rules in [`specs/company/series_bible.md`](company/series_bible.md) (planned).

---

## Pending / To be added

These terms are referenced above but not yet defined here. Each will land with its parent spec:

- Contract Runtime — when [`specs/system/producer.md`](system/producer.md) is written.
- Cost ceiling enforcement, SLA, Escalation policy — when [`specs/contracts/contract_format.md`](contracts/contract_format.md) is written.
- Episode reference schema fields — when stage-6 schema is added to `specs/schemas/`.
- Beat sheet, Outline schemas — when added to `specs/schemas/`.

---

*v0.1 · DRAFT · бilingual reference, grows with every new spec.*
