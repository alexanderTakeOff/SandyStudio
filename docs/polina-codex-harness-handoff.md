# Polina dual subscription harness — handoff to Claude Code

**Created:** 2026-08-24 · **From:** Theo / Codex · **To:** local Claude Code session
**Director authority:** review both harness paths, merge what belongs to the Assistant line,
prove neither Claude Code nor Codex regressed, then report before the Mega Assistant port.

## Copy this prompt into Claude Code

```text
===5===

CLAUDE — this task is addressed to you.

Objective: independently review the new dual subscription harness for Polina,
verify both Claude Code/Opus and Codex/Terra through the real SandyStudio surfaces,
merge the correct branches without broadening hook scope, and report exact evidence.

REPOSITORIES — do not confuse them:
  1. Main new-paradigm tree: C:\SandyStudio-nx
     base: origin/paradigm/direct-mind
     feature: origin/codex/polina-second-harness
     commits:
       c4d2d091 feat(mind): add OpenAI subscription harness
       9a4b9737 feat(telegram): add Polina model selector
       ec9ba52d fix(telegram): isolate episode command argument

  2. Polina runtime clone: C:\SandyStudio-polina
     runtime branch: github/codex/polina-runtime-hooks
     base branch at creation: polina/kind-thumb
     commit:
       96fdc0e5 feat(mind): add Codex hooks for Polina harness

DIRECTOR-APPROVED MERGE SCOPE:
  - Main feature merges into paradigm/direct-mind, NOT master.
  - Runtime hooks remain scoped to Polina's clone/runtime line. Do NOT blindly merge
    .codex/hooks.json into generic paradigm/direct-mind or master: those hooks call
    Polina-specific hard limits and live-context injection and would then affect Theo.
  - Determine the current intended target of the Polina runtime branch before merging it.
    Keeping codex/polina-runtime-hooks as the runtime branch is valid; merging into
    polina/kind-thumb is valid only if that is still the Director's Polina runtime line.
  - No publish, LOCK, budget change, governance-mode change, or master merge.

WHAT CHANGED — review, do not reimplement from scratch:
  - mind-bridge now has two adapters: claude -p and codex exec --json.
  - Both remove ANTHROPIC_API_KEY, OPENAI_API_KEY and CODEX_API_KEY from the child env;
    billing/auth must stay on saved product subscriptions.
  - app_config providers/concierge_provider is the only selected-model source.
  - Legacy openai/gpt-5.6-{sol,terra,luna} values normalize to codex/gpt-5.6-*.
  - Provider-scoped session_ids preserve Claude and Codex memories independently.
    Critical regression test: first switch to Codex must preserve a legacy Claude scalar id.
  - Explicit unsupported selection fails loudly; it never falls back to Opus.
  - Settings catalog contains only executable subscription runners.
  - Header shows the last ACTUALLY executed harness/model; Settings shows the next selection.
  - Telegram /model and /model terra write the same app_config and show selected vs executed.
  - Telegram model callbacks are fail-closed against TELEGRAM_ALLOWED_CHAT_IDS.
  - /e now consumes only its first argument, so pasted/quoted history cannot become the
    episode code.
  - Cross-channel assignment rule: every task begins DIRECTOR — or POLINA — because the
    same turn is visible in webapp and Telegram and different recipients may answer.

FILES TO SCRUTINIZE FIRST:
  C:\SandyStudio-nx\webapp\lib\concierge\mind-harness.ts
  C:\SandyStudio-nx\webapp\scripts\mind-bridge.ts
  C:\SandyStudio-nx\webapp\lib\api\concierge-provider-config.ts
  C:\SandyStudio-nx\webapp\lib\concierge\threads.ts
  C:\SandyStudio-nx\webapp\components\concierge\ConciergePanel.tsx
  C:\SandyStudio-nx\webapp\scripts\telegram-bot.ts
  C:\SandyStudio-nx\webapp\lib\telegram\model-control.ts
  C:\SandyStudio-polina\.codex\hooks.json

KNOWN LIVE EVIDENCE — reproduce, do not merely trust:
  - Manual Settings switch Opus -> Codex/Terra succeeded.
  - Real panel turn returned exactly: UI CODEX TERRA OK.
  - Header showed: Подписка OpenAI · gpt-5.6-terra.
  - Ledger recorded: openai / gpt-5.6-terra/subscription / cost_usd=0.
  - Then Settings switched back to Opus and a real turn recorded
    anthropic / opus/subscription-estimate.
  - Telegram /model inline buttons were tested by the Director and switched to Opus.
  - Runtime was healthy: app :3001, mind-bridge, Telegram bot.
  - Last full verify: tsc clean; 171 test files; 1841 passed + 1 skipped;
    replay-pilot 30/30; production build succeeded with pre-existing lint warnings.

REVIEW CHECKLIST:
  1. Orient both repositories/branches/remotes/worktrees. Preserve unfamiliar changes.
  2. Fetch both GitHub branches and prove zero source drift before review.
  3. Review the full base...feature diff, with dedicated security scrutiny:
     subscription auth, shell argv construction, hook trust, sandbox/add-dir scope,
     Telegram authorization, session-id cross-provider isolation, audit/ledger truth.
  4. Confirm existing Claude argv is unchanged by its contract test.
  5. Run targeted tests first, then the standard trio from C:\SandyStudio-nx\webapp:
       npx tsc --noEmit
       npm test -- --run
       npm run replay-pilot
     Also run npm run build because production uses next start, not hot reload.
  6. Before live smoke, verify no bridge turn is busy and no unclaimed Director turn exists.
  7. Minimal subscription smoke is authorized for this review:
     - select Opus through Settings or /model; plain no-tool prompt; verify header + ledger;
     - select Terra; plain no-tool prompt; verify header + ledger;
     - switch back to the Director's chosen final model (currently Opus unless he changes it).
     Do not call production tools, media providers, publish, or any API-billed model.
  8. Exercise the Polina hard-limit hook with synthetic stdin:
     safe show/help command exits 0; scripts/run/publish.ts exits 2.
  9. Merge the main feature into paradigm/direct-mind with an auditable merge commit,
     push it, and prove local vs upstream 0/0. Do not touch PLAN.md on a feature branch.
 10. Handle the runtime-hooks branch according to the scoped rule above; push final state.

DO NOT TOUCH / STAGE:
  C:\SandyStudio-nx\FILMS\_run\plate\   (pre-existing untracked work)
  C:\SandyStudio-polina\webapp\tmp\     (pre-existing untracked work)

SECURITY DEBT TO REPORT, NOT HIDE:
  Diagnostic process listings exposed local Inngest event/signing credentials in the
  session transcript. Never print process command lines or secret values again. Tell the
  Director whether those local credentials need rotation and provide the exact safe step;
  do not rotate or restart unrelated services without his approval.

ROLLBACK:
  - Immediate runtime rollback: Settings -> Claude Code / Opus.
  - Main-code rollback: revert the merge commit on paradigm/direct-mind.
  - Polina runtime rollback: switch clone back to its prior branch or revert 96fdc0e5.

FINAL REPORT — addressed to DIRECTOR:
  - findings by severity (or explicitly “no findings”);
  - exact merge targets and resulting commit hashes;
  - tsc/test/replay/build numbers;
  - Opus and Terra live evidence: selected, executed, ledger;
  - hook parity evidence;
  - upstream drift counts;
  - open risks/blockers before porting the design to Mega Assistant.
```

## Source links

- Main feature branch: https://github.com/alexanderTakeOff/SandyStudio/tree/codex/polina-second-harness
- Polina runtime hooks: https://github.com/alexanderTakeOff/SandyStudio/tree/codex/polina-runtime-hooks
- Base branch: https://github.com/alexanderTakeOff/SandyStudio/tree/paradigm/direct-mind
