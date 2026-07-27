---
name: Sprint φ + 2026-05-16 hotfixes + gpt-image-2 — merged to master 2026-05-18
description: Squash-merged claude/quizzical-brown-462555 → master at cc43944. Skills-as-capabilities refactor (lazy two-step API + 2 broad capability playbooks), EREF chain bug fix + UI polish + state mirror, gpt-image-1→gpt-image-2 upgrade. Branch tip 3993374 verified green; master pushed cc43944.
type: project
originSessionId: a78046dd-0057-4716-9b11-7af28544c704
---
## What landed in cc43944 (master)

Squash merge of 206 commits covering three sprints + this session's work.

### Sprint σ — Director-Skill canon (already shipped, recapped)
File-based skills at `.claude/skills/<slug>/SKILL.md` + selector + writer + 5 PA tools + `/skills` UI.

### Sprint τ — EREF pilot+fanout visibility (already shipped)
EREFPilotPillbar with FanoutHeadline + pulsing bar + episodes.metadata mirror for total/pilot shot ids.

### Sprint φ — skills-as-capabilities refactor (this session's core)
- **Two-step lazy API**: `getAgentSkillManifest` → agent picks via Haiku → `loadAgentSkillBodies` → real work. Replaces eager `loadAgentSkills`. Storyboarder migrates; PA gets AVAILABLE_PLAYBOOKS manifest + on-demand `getSkill` tool.
- **Content reorg**: 3 atomic σ seeds → DEPRECATED; 2 broad capability skills NEW (`storyboarder-situational-comedy`, `eref-shot-composition`); `seedance-prompting` flipped to ACTIVE.
- **PA Learning Loop**: BEHAVIOR_CONTRACT rule 9 — Director feedback defaults to `updateSkill` (refine existing playbook); `proposeSkill` only for genuinely new capability.
- **Manifesto**: `docs/skills-as-capabilities.md` defines skill = broad playbook per agent, aligned with Claude Code skills. Brief/Bible carry constraints separately.
- **Parser**: `parseSkillSelection` tolerant LLM-reply parser + 12 unit tests.

### Hotfixes 2026-05-16
- **Chain bug** in `app/api/assets/[id]/approve/route.ts`: REV-* approval now resolves underlying STB/SCR asset id via new `findLatestApprovedAssetId` helper. Was passing review id, EREF runner couldn't parse storyboard.
- **RejectModal**: now sends `directorConfirm: true` — Mode 1 was silent-failing the kebab Reject+revise path.
- **regenerate-image route**: skips `auto_upscale` entries when picking last provider from `generation_history` (was using upscale provider, not actual generation).
- **EpisodeAssetDrawer** + **AssetImagePromptSection**: skip upscale stub prompt when regenerating; visible busy/done states — `Regenerating…`, `Approving…`, `Approved` green, `Rejected` with checkmark.

### EREF state mirror 2026-05-18
- `setPilotState` helper (in `lib/api/eref-pilot-state.ts`) now mirrors state into `episodes.metadata.eref_pilot_state` at every transition. Closes UI gap where fan-out completed but UI still showed FANOUT_RUNNING.

### gpt-image-2 upgrade 2026-05-18
- `lib/agents/providers/openai-image.ts`, `openai-image-edit.ts`, `openai-edits-multi.ts` — `gpt-image-1` → `gpt-image-2` model string + ~15% cost table refresh.
- Provider registry logical ids (`gpt-image-1` in registry / app_config) unchanged — only OpenAI-side model string switched.
- gpt-image-1 deprecation announced for May 2026.

## E21 production state (post-merge)

- STB v05 APPROVED (Director, 2026-05-16)
- WCHK v02 APPROVED (Director kebab bulk, 2026-05-16)
- EREF: **22/22 shots generated**, distribution: 2 APPROVED (pilots sc01_sh01 v4 + sc01_sh02 v3) + 39 REVIEW + 17 REJECTED (cleanup from re-fire)
- Budget spent $2.52 / $25.00 ceiling
- pilot_state: FANOUT_COMPLETE (mirror now correctly set in episode.metadata after Step 1 patch)

Director still has 19 distinct shots in REVIEW awaiting his approval/regenerate per-shot before "Advance to Animatic". Not a merge blocker — content work continues on master.

## Verify results

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx vitest run` | 216/216 |
| `npm run replay-pilot` | 29/29 |
| `git log master --oneline -1` | cc43944 |
| `git log origin/master` | up to date |

## Backlog (deferred)

### From Stage A smoke 2026-05-18 — HIGH PRIORITY (Director-flagged)

1. **🔴 EREF aspect ratio bug — root cause + fix**
   Director observation: «картинка получилась из квадратного размера 1:1 в 16:9 за счёт срезания верха и низа. Sandy очень крупные фоны вокруг него нет и он не помещается целиком». Root cause located:
   - `lib/agents/runners/episode-references.ts` calls `provider.generate({ size: '1024x1024' })` line ~921
   - gpt-image-2 generates 1:1 square refs
   - Seedance img2vid takes square and crops to 16:9 → loses top + bottom
   - For YouTube output (16:9), EREF should generate at 1536x1024 from the start
   - openai-image.ts default IS 1536x1024 already, BUT openai-edits-multi (which EREF v2 uses) clamps to 1024x1024 by default
   - **Fix**: change EREF size to 1536x1024 + ensure openai-edits-multi supports landscape (verify the clampSize function allows it)
   - **Impact**: all future EREF generations land at 16:9, Seedance no longer crops
   - **Critical for E22+ canonical episodes**

2. **🟡 Camera movement too subtle in Seedance output**
   Director: «не вижу полёта камеры, движение очень маленькое, бы существенно утрировать». Current state:
   - `lib/api/vgen-shot-helpers.ts` builds Seedance prompt with CAMERA slot defaulting to subtle moves
   - `.claude/skills/seedance-prompting/SKILL.md` favors «static + 5% push-in» as default
   - Storyboarder skill prompts may also under-emit camera_movement
   - **Fix options**:
     a. Bump seedance-prompting playbook to favor more aggressive moves (whip-pan, dutch-tilt, orbit)
     b. Storyboarder runner generates camera moves with stronger verbs by default
     c. Director's per-shot CAMERA override in VGEN panel works but tedious
   - **Recommended**: revise `seedance-prompting/SKILL.md` to lean toward "noticeable motion" + add 5+ example clauses

3. **🟡 «no audio yet» when Director tries to attach music in VGEN panel**
   Director: «нажимаю кнопочку, пишет no audio yet». Music asset (AUD-music-main-v02) was approved in Stage A but UI shows «no audio yet» in VGEN drawer.
   - Music asset id: `309059f2-36b2-4fe6-9d39-92bd5cf56392` APPROVED on disk
   - Animatic was fired WITHOUT music (advance route used `.like('AUD-music%')` but Inngest body may have set musicAssetId)
   - Need to trace: VGENShotPanel music attach path → does it read latest APPROVED AUD-music asset for episode? Or just the animatic's musicAssetId? Maybe animatic_v1.music_asset_id is null in metadata.
   - **Likely fix**: animatic runner should write `animatic_v1.music_asset_id` even when music was passed in event payload; VGEN panel reads from there

### From earlier work (still open)

- **Reviewing 39 REVIEW EREF refs for E21** — content review at Director's pace. Some refs were auto-rejected as part of supersede; most are alt candidates.
- **Kebab Reject+revise on EREF v2 → auto-regen** — currently flips status only, Director must open drawer + click Regenerate. UX gap.
- **Lift `draft` state up** so footer Regenerate sees unsaved Image-prompt edits.
- **Behavior-drift toast** when API returns 4xx — current alert lives inside scrollable area, easy to miss.
- **Flux 2 [pro] provider** evaluation (33% cheaper than gpt-image-2 per fal.ai catalogue).
- **Mode 3 readiness drill on master** — separate sprint.

## Stage A smoke result (Director review 2026-05-18)

| Stage | Result | Cost | Time |
|---|---|---|---|
| Bulk-approve 1 EREF + music | ✓ | $0 | <1s |
| Fire `/eref/advance` | ✓ Inngest event 01KRX1M6 | — | — |
| Animatic v01 manifest (22 shots) | ✓ d3bcd4d1-... in REVIEW | ~$0 | 28s |
| Approve animatic + fire VGEN pilots | ✓ events 01KRX1RJW... | — | — |
| 2 VGEN pilot videos (Seedance fal-img2vid, 4s) | ✓ SH01 + SH02 in REVIEW | ~$1.94 | ~4 min |
| Director review | Identified 3 issues for next sprint (see backlog above) | — | — |

**Episode E21 budget**: $4.46 / $25 (was $2.52 before Stage A).

**Director's verdict** (paraphrased): without music hard to judge, but quality "not worse". Sandy identity preserved through gpt-image-2 → Seedance pipe. Need: aspect ratio fix (top priority), more aggressive camera, audio wiring.

## Pilot video drive URLs (for next-session reference)

- SH01 establishing: https://drive.google.com/file/d/17YUCaD5MR9KRKVV4KUFf9mEC_CVaSr4D/view?usp=drivesdk
- SH02 action: https://drive.google.com/file/d/15Bi5ZB_tHy0ANCxDH7b4RtnvOOKOQB0B/view?usp=drivesdk

## Worktree disposition

- Branch `claude/quizzical-brown-462555` still exists locally + on origin. Tip = 3993374.
- Worktree `C:/SandyStudio/.claude/worktrees/quizzical-brown-462555` still has the branch checked out.
- Safe to delete both after master sanity-check. Director's choice.

## Files touched on master (cc43944)

188 files, +19782/-435. Highlights:
- `docs/skills-as-capabilities.md` (NEW)
- `webapp/lib/skills/*` (3 files — selector/parser/writer)
- `webapp/lib/agents/load-skills.ts` (REWRITE — two-step API)
- `webapp/lib/agents/runners/{storyboarder,episode-references}.ts`
- `webapp/lib/api/eref-pilot-state.ts` (metadata mirror)
- `webapp/lib/concierge/{system-prompt-builder,build-context,skill-manifest}.ts`
- `webapp/lib/agents/providers/{openai-image,openai-image-edit,openai-edits-multi}.ts` (gpt-image-2)
- `webapp/app/api/assets/[id]/{approve,regenerate-image}/route.ts`
- `webapp/app/api/concierge/{chat,auto-react}/route.ts`
- `webapp/components/{editor/RejectModal,assets/EpisodeAssetDrawer,assets/AssetImagePromptSection}.tsx`
- `.claude/skills/{eref-shot-composition,storyboarder-situational-comedy}/SKILL.md` (NEW)
- `.claude/skills/seedance-prompting/SKILL.md` (status ACTIVE)
- `.claude/skills/{comedy-shot-must-carry-gag,storyboarder-prose-gag-per-shot,eref-consecutive-camera-angle-variety}/SKILL.md` (DEPRECATED)
- `webapp/__tests__/lib/skills/parse-skill-selection.test.ts` (+12 tests)
- `webapp/scripts/*` — 28 diagnostic + fire scripts useful for future debugging
