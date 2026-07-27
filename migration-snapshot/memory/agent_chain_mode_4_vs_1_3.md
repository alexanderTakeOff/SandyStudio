---
name: Agent chain logic — Mode 4 (factory auto-chain) vs Mode 1-3 (Director-driven via asset approve)
description: How the pipeline DAG advances depending on episode.governance_mode. Critical context for any change to factory.ts or asset-approve route.
type: project
originSessionId: 0af321d8-a995-4c87-830d-6bc64fa18f7c
---
SandyStudio's 11-agent pipeline advances differently depending on the episode's governance_mode:

**Mode 4 (AUTOTEST):** factory.ts step 5 saves output as `APPROVED`, step 6 fires `spec.nextEvent` (and `result.next_event`, `result.fan_out_events`). The chain auto-runs through Brief → Script → Storyboard → World Check → Animatic → Generation (3×VGEN+MGEN) → Distribution (COPY+THUMB) → Publish without Director intervention. Mock-mode latency = 50ms per agent + Inngest dev overhead = full episode in ~30-60 seconds.

**Modes 1/2/3 (MANUAL, HYBRID, DELEGATED):** factory step 5 saves output as `REVIEW` (lands in Director Inbox), step 6 SUPPRESSES the chain (`if (autoChain)` gate where autoChain = ep.governance_mode === 4). The chain advances ONLY when the Director clicks APPROVE in `/inbox` — `POST /api/assets/[id]/approve` calls `computeNextEvents(supabase, asset, userId)` which returns the array of Inngest events to fire next.

`computeNextEvents` is the single source of truth for the human-driven chain. Each branch checks idempotency via `hasJob(supabase, episodeId, agentId)` before firing — prevents duplicate runs on re-approve or HMR retrigger.

**Multi-asset milestones in Mode 1-3:**
- 3 STB-* assets APPROVED → fire EXEC-WCHK (gate spec requires minCount 3 acts)
- VID-animatic APPROVED → fan out 3× EXEC-VGEN + 1× EXEC-MGEN (deterministic shotIds shot1/2/3)
- IMG-thumbnail APPROVED + (animatic+metadata+thumbnail all APPROVED) → fire EXEC-PUB with directorConfirm=true

**Why:** Avoids the trap where factory's auto-chain fires `EXEC-SREV` after EXEC-SW completes, but EXEC-SREV's gate requires SCR APPROVED while the just-saved asset is REVIEW. Result: chain breaks at every step in Mode 1-3 unless suppressed.

**Files involved:**
- `webapp/lib/agents/factory.ts` — Step 5 (status), Step 6 (autoChain check)
- `webapp/app/api/assets/[id]/approve/route.ts` — `computeNextEvents` async helper
- `webapp/lib/agents/gate.ts` — Per-agent gate spec (minCount on STB stays 3 for production parity)
- `webapp/lib/agents/mock-providers.ts` — Mock LLM stubs (deterministic outputs)

When changing chain logic, update both Mode 4 path (factory.ts) and Mode 1-3 path (computeNextEvents) so they stay equivalent.
