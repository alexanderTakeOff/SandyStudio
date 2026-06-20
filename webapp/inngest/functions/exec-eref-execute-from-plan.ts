// ──────────────────────────────────────────────────────────────────────────────
// inngest/functions/exec-eref-execute-from-plan.ts
// EXEC-EREF Plan-driven executor — Sprint «Дизайнер и Аниматор», Day 3.2
// (2026-05-18). Fired by /api/assets/[id]/approve when Director APPROVES an
// SPC-ref_plan-<shot_id> asset (q2c flag-gated chain).
//
// Reads the APPROVED Plan asset's JSON body (provider, size, variants,
// prompt, negative, continuity_strategy) and runs episode-references.ts in
// its Plan-driven branch, scoped to the single planned shot. Coexists with
// the legacy fan-out runner (`exec-eref/generate-references`) and the
// Pilot/fanout entries (`exec-eref/start` + `/fanout-trigger`).
//
// Event shape: { episodeId: uuid, shotId: string, planAssetId: uuid }
// ──────────────────────────────────────────────────────────────────────────────

import { createAgentInngestFunction } from '@/lib/agents/factory';
import { shortShotLabel } from '@/lib/api/vgen-shot-helpers';

export const execErefExecuteFromPlan = createAgentInngestFunction({
  id: 'exec-eref-execute-from-plan',
  name: 'EXEC-EREF: Execute from APPROVED Plan',
  agentId: 'EXEC-EREF',
  concurrencyId: 'exec-eref-execute',
  eventName: 'sandystudio/exec-eref/execute-from-plan',
  operation: 'eref_plan_driven_generation',
  // The Plan itself sits at APPROVED when this fires; the upstream STB is
  // also APPROVED. Default loader is fine — runner pulls the Plan asset by
  // id directly from event payload, not from upstream_assets.
  resolveRunArgs: (eventData) => {
    const shotId =
      typeof eventData.shotId === 'string' ? (eventData.shotId as string) : undefined;
    const planAssetId =
      typeof eventData.planAssetId === 'string'
        ? (eventData.planAssetId as string)
        : undefined;
    // Targeted-anchor regen (2026-06-20): which side(s) to render. Default
    // `both` when absent → first-generation / plan-change semantics unchanged.
    const at = eventData.anchorTarget;
    const anchorTarget =
      at === 'start' || at === 'end' || at === 'both' ? at : undefined;
    const args: {
      shotId?: string;
      planAssetId?: string;
      anchorTarget?: 'start' | 'end' | 'both';
    } = {};
    if (shotId) args.shotId = shotId;
    if (planAssetId) args.planAssetId = planAssetId;
    if (anchorTarget) args.anchorTarget = anchorTarget;
    return args;
  },
  // 2026-05-22 — surface the shot label so the activity feed reads
  // "Reference Artist started — SH08" instead of "Reference Artist started"
  // (which Director can't distinguish across concurrent runs).
  resolveActivityContext: (eventData) => {
    const shotId =
      typeof eventData.shotId === 'string' ? eventData.shotId : '';
    const planAssetId =
      typeof eventData.planAssetId === 'string' ? eventData.planAssetId : null;
    return {
      shortLabel: shortShotLabel(shotId),
      metadata: {
        shot_id: shotId || null,
        plan_asset_id: planAssetId,
        operation: 'execute-from-plan',
      },
    };
  },
  // No auto-chain — the saved IMG-episode_ref goes to Director review like
  // every other EREF asset, and the existing approve-route handlers (v2
  // EREF auto-demote + EXEC-EDIT animatic gate) take over from there.
  nextEvent: () => null,
});
