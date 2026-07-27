# Session 2026-05-26 — PA UI batch + TD-39 L1 + Seedance PA tool + shot-preview L0

## Worktree
`C:\SandyStudio\.claude\worktrees\agitated-lederberg-a292d3` (deleted at session end —
Director sandboxed it once all PRs were pushed to origin).

## Shipped (squashed to master before session end — confirmed via git log)

| Commit on master | Topic |
|---|---|
| `8f52b50` | sidebar collapse + PA default-open + inverted textarea resize |
| `3004f43` | TD-54 — StudioShell grid + scroll discipline + PA in middle column |
| `d9d106f` | Seedance — regenerateVideoFromPlan PA tool + fan-out planAssetId carry |

## Open PRs (live on origin, not yet squashed)

| Branch | HEAD | Topic |
|---|---|---|
| `feat/td-39-pa-pickup-ack` | `f33e9a8` | TD-39 L1 — PA dispatch pickup acknowledgment (sync ack via composite anchor `episode + agent + T0` polling `jobs` for ≤10s). Wired into triggerAgent + regenerateRefPlan + regenerateImageFromPlan + regenerateVideoFromPlan + regenerateShotPlan. New helper `webapp/lib/concierge/tools/wait-for-pickup.ts`. 6 unit tests. |
| `feat/shot-preview-l0` | `869bc4c` | Version pill badge (`v02`/`v03`) in `AssetPreview` header — accent-tinted, replaces tucked-away `· v01` meta-text |
| `feat/pa-chat-noise-reduction` | `64d57c5` | 6-commit stack — see breakdown below |

### feat/pa-chat-noise-reduction stack (6 commits)

1. `8d189d2` — chip muting (`…Polina thinking · ✓ name`), BREVITY_FOR_DIRECTOR prompt block, ambient pipeline filter (`manual_trigger` + `agent_started` hidden — later partially reverted)
2. `bb3c162` — drop intermediate `🔧 tool_call` rows (filter assistant + auto_react + tool_calls array)
3. `cf99bdd` — restore `agent_started/agent_completed`, new `formatPipelineContent` helper, BREVITY block extended with whitespace rules
4. `f77a3bf` — drop tool chips entirely from message body, mute Polina body via `--tw-prose-body: var(--text-secondary)`, simpler `FRIENDLY — verb — SHxx` pipeline format
5. `0808caa` — use `(actor=EXEC-XXX)` suffix as agent-name fallback via existing `agentDisplayName` helper from `lib/api/agent-names.ts` (fixes the `AGENT — started — SH21` regression)
6. `64d57c5` — Dubai-local timestamps on every chat bubble + pipeline row (`Intl.DateTimeFormat` with `timeZone: 'Asia/Dubai'`)

## Key audits dropped on disk (in deleted worktree, but content saved on origin via shipped commits)

- `webapp/docs/td-39-jobs-activity-audit-2026-05-26.md` — jobs/activity polling signal map
- `webapp/docs/seedance-mode-switching-audit-2026-05-25.md` — 9-layer Seedance audit
- `webapp/docs/shot-preview-metadata-audit-2026-05-25.md` — drawer metadata fields → real-vs-static classification
- `webapp/docs/ui-audit-2026-05-14.md` — recovered 4-wave UI noise map from transcript
- `webapp/docs/ui-redesign-references-2026-05-14.md` — Tier 1+2 references for cinematic redesign

## Coordination with neighbour (quizzical-brown)

- Neighbour shipped TD-55 (`23bcf38`), TD-56 (`46abbdb`), TD-57 (`f0b9157`), TD-58/59 (`e56daab`) in parallel — all in master at session end.
- Neighbour cherry-picked my PRs into quizzical-brown for Director live preview.
- Seedance Patch 1 (animator.md `seedance-standard` allowlist) was confirmed NOOP — already in master via neighbour's TD-52 squash (`23f1307`).

## TD-39 status

- **L1 SHIPPED** in `feat/td-39-pa-pickup-ack` (pending squash).
- Composite anchor approach (`episode + agent + T0`) — no migration, ~50 LoC + 6 tests.
- `L1.5` follow-up: add `inngest_event_id` column to jobs if false positives surface.
- `L2` (watchdog cron) + `L3` (proactive `awaiting_jobs[]`) — deferred to follow-up TDs.

## Plan files

- `~/.claude/plans/swift-wobbling-coral.md` — full plan for TD-39 + Seedance + UI batch (approved + executed).

## Open hooks (none active in this session)

Session ended cleanly. Operational rituals 1/3/4 observed. Hook C (verify-on-push) passed
on every push — tsc clean + vitest 588/588 throughout.

## Resume context

For the next session:
- Three open PRs awaiting squash-merge in master.
- TD-39 L1 needs visual smoke confirmation before merge (Director hasn't seen
  the pickup_timeout message in chat yet).
- TD-39 L2/L3 deferred — when Director surfaces a Mode 3/4 burn, that's the trigger.
- Shot-preview L0b (prompt edit timestamp) — needs backend metadata column; tracked as L1 follow-up.
