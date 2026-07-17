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
10. [Entity identifier convention / Конвенция идентификаторов сущностей](#10-entity-identifier-convention--конвенция-идентификаторов-сущностей)

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

### Critic / Критик (canonical — was Validator / Reviewer / Checker)
Subclass of sub-agent whose contract is to verify another agent's plan or artifact against Series Bible / canon / schema and **return a verdict (PASS / REVISE / FAIL) without ever rewriting**. Topic 3 (2026-06-02) canonicalised the single word **Critic** to replace the prior Reviewer / Checker / Supervisor / Validator sprawl ("5 names for one job"). A Critic never spends media budget and never edits the work it judges — REVISE re-fires the upstream Designer/Author with the notes as hard criteria, capped 2-3 attempts then HALT→Director (critic-revision-cap doctrine). Examples: `EXEC-SREV` (Script Critic, subtitle "Story Editor"), `EXEC-WCHK` (Continuity Critic, subtitle "Script Supervisor"), `EXEC-EPREV` (Reference Critic), `EXEC-VPREV` (Video Critic), `EXEC-GAGAD` (Gag Critic in its review phases). Series-level craft leads (`ART-HW`, `ART-AD`, `ART-MS`) keep the title **Supervisor** — they are not per-episode plan-gates and never appear in the episode DAG.

> **Reviewer / Рецензент → see Critic.** Legacy alias. Any "Reviewer" in older specs/prompts means a Critic.
> **Checker / Проверяющий → see Critic.** Legacy alias (e.g. "World Checker" = Continuity Critic).
> **Validator / Валидатор → see Critic.** Legacy alias retained for the typed `Validator` concept in older contracts.

### Designer / Дизайнер (canonical plan-author role)
Sub-agent whose contract is to **author a plan / breakdown** (a Plan-asset) that fully specifies an upcoming generation job — provider, parameters, prompt, reasoning — **without spending media budget**. The Designer is gated by a paired Critic before its plan reaches the Director or the Artist. Examples: `EXEC-EREF-DESIGNER` (Reference Designer), `EXEC-VANIM` (Video Designer), `EXEC-THUMB-DESIGNER` (Key Art Designer), `EXEC-GAGAD` in its plan phase (Gag Designer). For prose authoring the equivalent word is **Author** (e.g. Writer `EXEC-SW`, Storyboard Artist `EXEC-SB`, Publicist `EXEC-COPY`).

### Artist / Художник (canonical execution role)
Sub-agent that **executes an APPROVED plan, calls the provider, and is the only tier that spends media budget**. Output = f(approved plan). Examples: `EXEC-EREF` (Reference Artist), `EXEC-VGEN` (Video Artist), `EXEC-THUMB` (Key Art Artist — it RENDERS the approved Key Art plan, hence not "Designer"), `EXEC-MGEN` (Composer). The per-artifact loop is: **Designer (plan) → Plan-Critic (verdict) → Artist (generate, $) → Output-Critic (judge artifact) → Director gate**. Output-Critics for video/thumbnail/final are acknowledged but not yet staffed (rendered as honest empty slots in the Pipeline View per Topic 3 q11a); the only live Output-Critic today is the inline EREF image check (`EXEC-EREF-CHECK`).

### EXEC-GAGAD dual role / Двойная роль гэг-режиссёра
`EXEC-GAGAD` (Gag) is **a Designer in its plan phase** (gag continuity plan after Script Critic) and **a Critic in its review phases** (per-shot review of reference plans → folds into Reference Critic; per-shot review of shot plans → folds into Video Critic). It is genre-conditional (fires only for comedy-like genres) and does not occupy its own Pipeline View row — it folds into the relevant Critic row by phase.

### Episode Reference Designer / Дизайнер референсов эпизода
Full LLM-driven agent (Sprint «Дизайнер и Аниматор», 2026-05-18) responsible for **all decisions** about an episode's reference images: provider choice (gpt-image-2 for character faces vs Flux 2 pro for environments), size per delivery_target (1536×1024 YouTube landscape vs 1024×1792 Shorts), variant count, pilot strategy (1 ref to validate continuity before fanout), camera-angle coverage (sub_area variation for same-location shots), prompt formulation, negative-term list. Replaces the legacy template-function `episode-references.ts`. Implemented as `EXEC-EREF` agent + `agents/exec/episode_reference_designer.md` + `.claude/skills/eref-designer/SKILL.md`. Output: `SPC-ref_plan-<shot_id>` asset that the Designer's Critic validates and Director (or EXEC-DIR-AI in Mode 2/3) approves before image generation runs.

### Reference Critic / Критик дизайнера (was Designer's Critic)
Critic paired with Episode Reference Designer. Validates each `SPC-ref_plan` against hard checks: aspect matches `delivery_targets`, provider obosnovan by shot type, sub_area variation present for same-location shots, Bible style canon referenced, negative-term baseline included, EREF reference anchor present for cross-shot continuity. Verdict PASS → Plan stays REVIEW for Director · REVISE → Designer re-runs with revision_note · FAIL → Plan REJECTED, Director intervention. Mirrors Writer↔SREV pattern. Implemented as `EXEC-EPREV` agent.

### Animator / Аниматор
Full LLM-driven agent (Sprint «Дизайнер и Аниматор», Day 6-7 2026-05-19) responsible for **all decisions** about a video shot: provider choice (Seedance fast for iteration vs Veo standard for hero shots vs Seedance with end_image for emotion arc), quality tier per hero-marker, aspect per delivery_target, duration with action-complexity reasoning, seed locking strategy (random first try, lock after approve for batch consistency), end_image strategy (camera-tightening shots, character-enter beats), prompt formulation in provider-specific format (Seedance 7-slot vs Veo prose), negative-term list. Replaces the legacy template-function `buildShotPromptV2` in `vgen-shot-helpers.ts` when `ANIMATOR_CHAIN_ENABLED=true` and `planAssetId` is supplied to EXEC-VGEN. Implemented as **`EXEC-VANIM` agent** (Day 6-7 split from EXEC-VGEN for symmetry with EREF Designer pattern; Director glossary entry originally targeted `EXEC-VGEN`, refactored 2026-05-19) + `agents/exec/animator.md` + `.claude/skills/animator/SKILL.md`. Output: `SPC-shot_plan-<shot_id>` asset. EXEC-VGEN remains as the executor that reads APPROVED `SPC-shot_plan` and dispatches the actual provider call.

### Video Critic / Критик аниматора (was Animator's Critic)
Critic paired with Animator (Video Designer). Validates each `SPC-shot_plan` against V01-V09 hard checks: 7-slot structure for Seedance / well-formed prose for Veo, ≤1 primary action (Seedance hard rule #4 — multi-action = blur), NEGATIVE non-empty + contains baseline, CONTINUITY references locked EREF anchor, STYLE matches Bible style canon, CAMERA aligns with storyboard camera_angle + camera_movement, SUBJECT references same characters as STB shot.characters[], duration consistent with action complexity per technology.md §3.5, no on-screen text instruction. Verdict routing as Designer's Critic. Implemented as `EXEC-VPREV` agent.

### Plan-asset / План-ассет
A first-class asset that captures **all decisions** a media-generation agent has made about an upcoming generation job: provider, parameters, prompt, reasoning. Two concrete subtypes: `SPC-ref_plan-<shot_id>` (Episode Reference Designer's output) and `SPC-shot_plan-<shot_id>` (Animator's output). Plan-assets undergo the same DRAFT → REVIEW → APPROVED lifecycle as Script and Storyboard. The associated execution step (gpt-image-2 call, Seedance call) only runs after the Plan is APPROVED. This makes media generation auditable, redo-able from the same Plan, and editable by Director before any money is spent.

### delivery_targets / Цели дистрибуции
Array of distribution-target slugs declared at series level (`series.metadata.delivery_targets[]`) with optional per-episode override (`episodes.metadata.delivery_targets[]`, set via `SPC-brief`). Designer / Animator consult the list to choose aspect ratio, image size, and variant count. Recognised slugs:
- `youtube_landscape` — YouTube main channel · 16:9 · video 1920×1080 · ref 1536×1024
- `youtube_shorts` — YouTube Shorts · 9:16 · video 1080×1920 · ref 1024×1792
- `instagram_reels` — Reels · 9:16
- `instagram_post` — feed square · 1:1 · 1080×1080
- `tiktok` — 9:16
- `print_poster` — printed material · 2048×1536

For S14 pilot period the default is `['youtube_landscape']`. Adding more targets is additive — extends the list, never replaces.

### askAgent (PA tool) / Запрос к Агенту через Полину
PA-proxy tool that lets Director ask a specific agent (Designer / Animator / etc.) a free-form question about its current work, without spinning up a persistent per-agent dialog thread. Polina dispatches the question to the agent via a short one-shot LLM call (agent system_prompt + current context + question), receives a structured answer, and returns it to Director in her own thread. Avoids N-thread fragmentation while preserving direct conversational access. Implemented as `lib/concierge/tools/askAgent.ts`. See `.claude/hooks/` and `lib/concierge/system-prompt-builder.ts` for integration.

---

## 2. Production scope / Уровни производства

### Series / Сериал
Top-level production unit (e.g. "Sandy & Friends"). Owns its own bible, libraries, audio palette, visual style. Spans multiple seasons. Series-level assets are LOCKED once approved and reused across all child episodes.

**Series status (DRAFT · ACTIVE · ARCHIVED).** `ACTIVE` is **derived, not stored** (Director directive 2026-06-02): a series counts as ACTIVE once its `general_idea` Bible doc (`SBL-general_idea`) is **LOCKED** — the moment its concept is canonized and it enters production. New series are stored `DRAFT` and stay DRAFT until the Director locks the general idea (a Director-only act, CLAUDE.md §6). `ARCHIVED` is an explicit stored override. No stored ACTIVE flag ⇒ no drift, no backfill; a series reverts to DRAFT if its general idea is unlocked for a new version. Computed by `webapp/lib/api/series-status.ts`.

### Season / Сезон
Numbered grouping of episodes within a Series (e.g. `S01`, `S02`). May introduce new characters or refine style, but inherits Series Bible. Code: `S{NN}`.

### Episode / Эпизод
Atomic production unit — one short film. Produced by running the full episode pipeline (sections 4 below). Code: `E{NN}` within season; full code: `SS-{S}-{E}` (e.g. `SS-S01-E01`).

### Shot / Шот (план)
Smallest video unit — a single continuous camera take, typically 3–8 seconds. Each shot has one prompt, one Veo (or other video provider) generation, one approval. Shot id: `{episode_code}-A{N}-SC{NN}-SH{NN}` (Act-Scene-Shot).

---

## 3. Series-level pre-production / Pre-production уровня сериала

### Series Bible / Библия серии
Master document containing everything canonical about the series: world rules, hero list with refs, location list with refs, object list with refs, audio palette, visual style guide. Once a Series Bible section is LOCKED, no episode may contradict it. Final Bible = description + media per asset; text-only Bible is incomplete. Spec: [`specs/company/series_bible.md`](company/series_bible.md). Two top-level tabs: **General idea** (text) and **Library** (visual + audio canon).

### General idea / Общая идея
The textual side of a Series Bible — one markdown document holding premise, philosophy, world rules, tone. Asset type: `SBL-general_idea`.

### Library / Библиотека
The visual + audio side of a Series Bible — feeds of Heroes / Locations / Objects / Style / Audio canonical assets. Each entry has both description and media.

### Bible asset / Ассет Библии
Any `SBL-*` file_type asset belonging to a Series Bible. Distinct from Episode references (`IMG-episode_ref`) which are episode-scoped and anchor on Bible assets.

### Cross-reference / Кросс-референс
The link between an Episode reference and the Bible asset it anchors on. Recorded in `IMG-episode_ref.metadata.bible_ref_ids[]`. Drives the Bible UI's "Used in [episode]" lookup.

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

### Episode Start Notice / Стартовая записка эпизода
Optional episode-scoped vessel that hands the Writer (`EXEC-SW`) any large or incidental pre-authoring material that must NOT bloat the often-read Brief — a big **gag reservoir** (e.g. a 100-gag Car-Wash-style bank), extra directorial notes, references, constraints. Asset: `SPC-start_notice`. Written by the Producer (`EXEC-CONC` / Polina) via the `writeStartNotice` tool at APPROVED. The Writer reads it as an **advisory reservoir** to draw from — it is NOT a beat-contract and does NOT override the Brief; the Brief's Key beats remain the only MUST-hit surface. Rationale: the Brief carries the directorial SPINE (read ~20 places); the Start Notice carries the bulk (read only by the Writer). Established 2026-07-11 (Director q1b).

### Beat sheet / Бит-лист
**Stage 2.** 15–20 numbered story beats — set-ups and punchlines of comedy, structural skeleton. Cheap to revise. Catches structural problems before prose. Asset: `SCR-beats` (planned).

### Outline / Поэпизодник
**Stage 3.** Beat sheet expanded into scene-by-scene outline with character actions, no full prose. Asset: `SCR-outline` (planned). Approval here means structure is final.

### Script / Сценарий
**Stage 4.** Full prose script with dialogue (when applicable), action lines, comedy timing. Visual-comedy MVP: action lines only, no dialogue. Asset: `SCR-script`. Schema: [`specs/schemas/script.md`](schemas/script.md). Produced by `EXEC-SW`. Reviewed by `EXEC-SREV`.

### Storyboard / Раскадровка
**Stage 5.** Static panels — one per shot — with camera angle, location id, action description, duration. **Visualises STRUCTURE, not final picture.** Asset: `STB-storyboard`. Schema: [`specs/schemas/shot.md`](schemas/shot.md). Produced by `EXEC-SB`. Continuity-checked by `EXEC-WCHK` against Series Bible.

### Episode reference / Эпизод-референс
**Stage 6.** Episode-specific reference pictures: heroes in episode-specific moods/poses/costumes, locations in episode-specific lighting/angles, episode-only props. Director approves these BEFORE Animatic. Sources MUST be canonical refs from Series Bible (continuity check enforces this once Bible exists). Asset: `IMG-episode_ref`. Produced by `EXEC-EREF` (Episode Reference Generator) — see `webapp/lib/agents/registry.ts`. MVP step (current): stub mock; Step 5 implements real `gpt-image-1` fan-out per unique location/character pose in the storyboard.

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

### Contract instance / Инстанс контракта
One execution of a contract — the runtime job that consumes the input, calls the agent, validates the output, records cost. Persisted as a row in `jobs` + linked rows in `assets` and `costs`. Identified by `job.id`.

### Cost ceiling / Потолок стоимости
Hard upper bound in USD specified in a contract (`cost_ceiling_usd`). If a single contract instance exceeds this, the runtime aborts the job, marks it FAILED, and logs the violation. Per-episode budget ceilings are separate (see [`webapp/lib/budget.ts`](../webapp/lib/budget.ts)).

### JSON block / JSON-блок
Structured machine-readable output appended at the end of a text agent's markdown response, wrapped in a fenced ` ```json ` code block. The runtime parses the LAST such block in the response (so models that include schema examples earlier still emit canonical output at the end). Used by Screenwriter, Script Reviewer, Storyboarder, World Checker, Copywriter to deliver typed structured payloads alongside human-readable prose.

### Reset script / Скрипт сброса
Operational helper that returns an episode to a known intermediate state (e.g. "brief APPROVED, everything downstream cleared") and re-triggers the next agent. Example: [`webapp/scripts/reset-episode-after-brief.ts`](../webapp/scripts/reset-episode-after-brief.ts). Always preserves the brief; demotes downstream assets to `REVISION`; cancels in-flight jobs.

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

### On-model gate / Гейт «на модели» (2026-07-17)
A focused identity check on a rendered reference image (`IMG-episode_ref`), SEPARATE from the general Reference Critic (whose `consistency_score` proved unreliable — E30: the same off-model blob scored 22 and 100). The **on-model detector** (`lib/agents/runners/on-model-detector.ts`) asks two binary questions against the Bible character canon — **silhouette** (recognisable shape?) and **transparency** (body material matches, e.g. glass vs opaque?) — and `decideOnModel` (`lib/api/on-model.ts`) turns them into PASS/FAIL under the episode's **strictness** dial. The verdict is FROZEN into the image's `shot_reference.on_model` at generation time; the reconciler reads only that verdict and **bounces** a FAIL (keeps REVIEW + escalates to the Director) instead of auto-approving. Series-agnostic — the rubric is built from the character refs, never hardcoded.

### On-model strictness / Строгость гейта (`on_model_strictness`)
Per-episode dial in `episodes.metadata`: **`loose`** (default — gate OFF, no vision call, byte-identical to pre-gate behavior), **`medium`** (bounce on silhouette-loss only; tolerate milky/opaque bodies), **`strict`** (bounce on silhouette-loss OR transparency drift). Mirrors the `pipeline_mode` pattern; set in Episode Settings.

### Transformation shot / Кадр-трансформация (`transformation: true`)
Storyboard shot flag marking a DELIBERATE loss of a character's normal body form (morph / gloop / a transparent-body-melts-to-a-puddle gag, cf. `sandy-gag-library` TRANSPARENT_BODY). Tells the on-model gate a silhouette change is EXPECTED here, so the detector's **silhouette** FAIL is suppressed for that shot (transparency drift is still enforced under `strict`). Emitted by the Storyboarder; consumed by `decideOnModel`.

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
> **Policy lives in [`specs/rules/canon_versioning.md`](rules/canon_versioning.md).** Glossary holds definitions only.
> Any visual element in an episode reference, animatic, or shot must trace back to a LOCKED Series Bible reference. The `EXEC-CONT` validator enforces this once Series Bible exists.

### Versioning policy / Политика версий
> **Policy lives in [`specs/rules/canon_versioning.md`](rules/canon_versioning.md).** Glossary holds definitions only.
> Costume changes use Episode references; permanent canon changes create new Bible asset versions; errors are revisions of the current version. Full table in the rules document.

---

## 10. Entity identifier convention / Конвенция идентификаторов сущностей

Stable, human-readable IDs for **recurring entities** (not files). An identifier names
the entity *type*, never its role in a specific episode. Adopted 2026-06-28. This is a
**distinct layer** from the file-naming convention (`SS-S0X-E0Y-TYPE-…`, CLAUDE.md §3)
and from Bible-asset `file_type` slugs (`SBL-character_sandy`): those name files / DB
rows; these name the entities the files are *about*.

| Prefix | Meaning | Examples |
|---|---|---|
| `CHR-` | Recurring character | `CHR-Sandy`, `CHR-Heavy`, `CHR-Metelka` |
| `PET-` | Companion / pet | `PET-Detonix` |
| `OBJ-` | Physical object / prop | `OBJ-Smartphone`, `OBJ-Elevator`, `OBJ-Plates` |
| `THEME-` | Episode theme / central conflict (a reusable gag engine) | `THEME-Infinite_Feed`, `THEME-Kitchen_Plates` |
| `LOC-` | Location | `LOC-Kitchen`, `LOC-Beach` |
| `LAW-` | World law / philosophy | `LAW-Illusion_of_Control` |

Rules: a character is always `CHR-*` (never `OBJ-Sandy`). An `OBJ-*` may participate in
many `THEME-*` (`OBJ-Smartphone` → `THEME-Infinite_Feed`, `THEME-Low_Battery`). **A new
`OBJ-*` is not a new `THEME-*`** — the theme is the *engine*, not the prop.

Mapping to existing layers: entity `CHR-Sandy` ↔ Bible asset `file_type
SBL-character_sandy` ↔ files `SS-…`. One entity, three layers (entity-id / DB-asset /
filename) — keep them mapped, never duplicated. The episode-theme bank (`SPC-theme_bank`
asset, series Themes tab) is indexed by `THEME-*` id.

Consumed by the theme-development skills (`series-episode-theme-generation` /
`series-episode-theme-selection`) and by any spec that references recurring entities.

---

## Pending / To be added

These terms are referenced above but not yet defined here. Each will land with its parent spec:

- Contract Runtime — when [`specs/system/producer.md`](system/producer.md) is written.
- Cost ceiling enforcement, SLA, Escalation policy — when [`specs/contracts/contract_format.md`](contracts/contract_format.md) is written.
- Episode reference schema fields — when stage-6 schema is added to `specs/schemas/`.
- Beat sheet, Outline schemas — when added to `specs/schemas/`.

---

*v0.1 · DRAFT · бilingual reference, grows with every new spec.*
