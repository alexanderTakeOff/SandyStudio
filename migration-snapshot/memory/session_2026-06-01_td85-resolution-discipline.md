---
name: session-2026-06-01-td85-resolution-discipline
description: "TD-85 shipped — explicit resolution discipline in the Shot Plan pipeline (schema + skill + Critic V13 + runner hard-gate + UI). On feature branch, not merged."
metadata: 
  node_type: memory
  type: project
  originSessionId: 6fe5476b-0f29-4ac9-b6cc-2bbceddcda08
---

# Session 2026-06-01 — TD-85 Resolution discipline

Director found the gap (via Polина): Shot Plan v04 says `provider: seedance-standard, 5s, 16:9` but **no resolution** — before generation you can't tell 720p vs 1080p. Polина proposed a one-skill edit; Director asked me (Тео) to «проработать системно». Systemic investigation flipped the framing.

## Status: REBASED onto master, clean (ahead 1 / behind 0)

Original commit `6150254` rebased onto `origin/master` (08143af, PR #25 TD-72→86) → now **`63b4598`**. 3 conflicts resolved manually:
- **runner.ts** — master's TD-78 rewrote the Plan-load block into hard-fail form (throws on any load failure, deleted the old lenient `try{}catch{}`). Took master's loader wholesale, re-grafted resolution (var + body-type + lenient extract INSIDE the hard-fail block + authoritative gate at generate-site). Did NOT re-introduce the silent-storyboard-fallback TD-78 killed.
- **animator-critic.ts** — unioned master's TD-74 directorOverrides `sections[]` structure with my V13 contract-block injection; intro line → V01-V13.
- **animator_critic.md** — kept master's PASS_WITH_UNCERTAINTY + REVISE rows, bumped PASS to V01-V13; header «V01-V09 Hard Checks» → «V01-V13».
Post-rebase verify: tsc clean · vitest **610/610** · replay-pilot **29/29**.

## What landed (now commit 63b4598 on `claude/tender-aryabhata-740e06`, NOT merged to master)

Vertical slice so the Plan can never lie about resolution:

1. **Schema** `agents/exec/animator.md` — added `resolution` field (q1: minimal, no width_height/resolution_source) + hard rule.
2. **DRY injection** `animator.ts` — `buildResolutionContractBlock()` reads `VIDEO_PROVIDER_CAPS` (SSOT) and injects each provider's `supports_resolutions` into the agent's input context. No enum hardcoded in markdown. Exported; reused by Critic.
3. **Skill** `.claude/skills/animator/SKILL.md` — abstract resolution-by-delivery-target policy (iteration → lowest cost-effective; hero/final → delivery resolution).
4. **Critic V13** `animator_critic.md` + `animator-critic.ts` — presence + provider-aware validity (seedance non-null member; veo null) + soft cost-consistency. Critic gets the same injected contract block.
5. **⭐ runner.ts (load-bearing)** — extract `resolution` leniently inside the parse, then **hard-gate OUTSIDE the JSON-parse try/catch** (a swallowed throw would silently degrade to 720p — the exact bug). Wire validated resolution → `generate()` + persist in metadata + audit log.
6. **PA summary** `system-prompt-builder.ts:528` — approve-gate line now includes resolution.
7. **UI/persist** `VGENShotPanel`/`VGENShotSection` — seed selector from persisted resolution; cost preview routed through `estimateCost` (honours `resolution_cost_mult`).
8. **Cleanup (q2)** `config/providers.yaml` — annotated `supported_resolutions` as legacy/non-authoritative; TS manifest is SSOT (the yaml key is read by no code; uses an older provider taxonomy with no seedance entry).

## Key findings (why this beat the one-skill edit)

- **Infra already existed**: `provider-capabilities.ts` already had `supports_resolutions`, `resolution_cost_mult`, `estimateCost`, and the manual `ProviderControlPanel` selector. That's why the manual SH01 regen went 1080p. Polина didn't know this.
- **Skill-only would make the Plan lie**: runner never read `resolution` → would default 720p while Plan says 1080p. Worse than honest-silent.
- **Back-compat refinement vs plan**: runner hard-fails only on a *declared-but-unsupported* value; *missing* resolution stays back-compat (provider default). Presence is enforced by Critic V13 at authoring, so new plans always declare, but already-APPROVED pre-TD-85 plans don't break on regen.
- **SSOT drift recorded**: yaml `supported_resolutions` (["720p","1080p"]) ≠ TS (['480p','720p','1080p']) ≠ veo-gemini hardcode. Annotated, not «aligned» (aligning would fabricate a seedance entry in a registry no code reads).

## Verify
tsc clean · vitest **599/599** (+5 new for `buildResolutionContractBlock`) · replay-pilot **29/29** (legacy non-plan path untouched). Deps were absent in the worktree — ran `npm install --legacy-peer-deps` (npm ci fails on @react-three/fiber peer conflict).

## Open / next

- **PLAN.md NOT updated** — per parallel-session discipline (non-master worktree doesn't write PLAN.md). PLAN-owner (master session) should fold TD-85 into `## CURRENT STATE`; that block is itself stale (dated 2026-05-22/23).
- **Branch not merged** (Director: commit yes, merge no). Awaiting Director squash-merge.
- **UI not browser-smoked** — `VGENShotPanel` cost-label + selector-seed are observable but need dev server + a VID-shot asset with `resolution` metadata + Supabase. Covered by types+unit; propose a manual UI check post-merge.
- **Recommended smoke** (mock, $0): author Plan `resolution:1080p`(seedance) + `null`(veo) → Critic V13 → approve → EXEC-VGEN single-shot; assert audit log `resolution=1080p`, metadata carries it, PA line shows it. Then one real 1080p seedance shot → cost ≈ 2.25× the 720p baseline.

See also [[plan-md-living-anchor]], [[verify-real-results-not-logs]], [[train-personnel-doctrine]].
