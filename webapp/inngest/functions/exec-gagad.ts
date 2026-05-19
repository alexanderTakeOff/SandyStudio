// ──────────────────────────────────────────────────────────────────────────────
// inngest/functions/exec-gagad.ts
// EXEC-GAGAD — Gag Assistant Director (Sprint «Дизайнер и Аниматор» Day 11+
// 2026-05-19). Three Inngest functions, one per phase. All share agent_id
// `EXEC-GAGAD` and concurrency key `exec-gagad` so they're rate-limited
// together per episode.
//
// Phase plan: no auto-chain on success. Director reviews + approves
// SPC-gag_plan via standard inbox flow. REQUEST_REVISION re-fires this same
// event with revisionNote (handled by approve-route's revisionEventForAsset).
//
// Phase eref_review / vanim_review:
//   - On REVISE verdict + revision_count < 2 → re-fire Designer/Animator
//     with revisionNote = acceptance_criteria
//   - On HALT verdict (cap reached) → no chain. Activity event emitted in
//     runner already.
//   - On PASS → no chain. SPC-ref_plan / SPC-shot_plan stays in REVIEW for
//     Director.
// ──────────────────────────────────────────────────────────────────────────────

import { createAgentInngestFunction } from '@/lib/agents/factory';
import type { AgentResult } from '@/lib/agents/types';

// ── Phase plan ───────────────────────────────────────────────────────────────

export const execGagadPlan = createAgentInngestFunction({
  id: 'exec-gagad-plan',
  name: 'EXEC-GAGAD: Author Gag Plan',
  agentId: 'EXEC-GAGAD',
  concurrencyId: 'exec-gagad',
  eventName: 'sandystudio/exec-gagad/plan',
  operation: 'gag_plan_generation',
  // Plan author needs to see prior DRAFT/REVISION versions of its own Plan
  // so revision iterations compute correct version numbers + acceptance
  // criteria can reference prior diagnoses.
  inputAllowedStatuses: ['APPROVED', 'REVIEW', 'REVISION', 'DRAFT'],
  resolveRunArgs: (eventData) => {
    const scriptAssetId =
      typeof eventData.scriptAssetId === 'string'
        ? (eventData.scriptAssetId as string)
        : undefined;
    const args: { gagPhase?: 'plan'; scriptAssetId?: string } = {
      gagPhase: 'plan' as const,
    };
    if (scriptAssetId) args.scriptAssetId = scriptAssetId;
    return args;
  },
  // No auto-chain — Director reviews + approves manually. Revision flow
  // goes through approve-route's revisionEventForAsset which re-fires this
  // same event with revisionNote.
  nextEvent: () => null,
});

// ── Phase eref_review ────────────────────────────────────────────────────────

export const execGagadReviewRefPlan = createAgentInngestFunction({
  id: 'exec-gagad-review-ref-plan',
  name: 'EXEC-GAGAD: Cross-layer review of SPC-ref_plan',
  agentId: 'EXEC-GAGAD',
  concurrencyId: 'exec-gagad',
  eventName: 'sandystudio/exec-gagad/review-ref-plan',
  operation: 'gag_review_ref_plan',
  resolveRunArgs: (eventData) => {
    const planAssetId =
      typeof eventData.planAssetId === 'string'
        ? (eventData.planAssetId as string)
        : undefined;
    const shotId =
      typeof eventData.shotId === 'string' ? (eventData.shotId as string) : undefined;
    const args: {
      gagPhase?: 'eref_review';
      planAssetId?: string;
      shotId?: string;
    } = { gagPhase: 'eref_review' as const };
    if (planAssetId) args.planAssetId = planAssetId;
    if (shotId) args.shotId = shotId;
    return args;
  },
  // On REVISE + counter < 2: re-fire Designer with acceptance_criteria.
  // On HALT or PASS: no chain.
  nextEvent: (_saved, eventData, result: AgentResult) => {
    const meta = result.metadata as
      | {
          verdict?: unknown;
          acceptance_criteria?: unknown;
          revision_count_after?: unknown;
        }
      | undefined;
    const verdict = typeof meta?.verdict === 'string' ? meta.verdict : null;
    if (verdict !== 'REVISE') return null;

    const shotId =
      typeof eventData.shotId === 'string' ? (eventData.shotId as string) : null;
    if (!shotId) return null;

    const criteria = Array.isArray(meta?.acceptance_criteria)
      ? (meta.acceptance_criteria as unknown[]).filter(
          (v): v is string => typeof v === 'string' && v.trim().length > 0,
        )
      : [];
    const revisionNote =
      criteria.length > 0
        ? `GAGAD eref_review REVISE — hard acceptance criteria:\n- ${criteria.join('\n- ')}`
        : 'GAGAD eref_review REVISE — re-derive ref plan to honour gag intent.';

    return {
      name: 'sandystudio/exec-eref-designer/plan',
      data: {
        episodeId: eventData.episodeId as string,
        shotId,
        revisionNote,
      },
    };
  },
});

// ── Phase vanim_review ───────────────────────────────────────────────────────

export const execGagadReviewShotPlan = createAgentInngestFunction({
  id: 'exec-gagad-review-shot-plan',
  name: 'EXEC-GAGAD: Cross-layer review of SPC-shot_plan',
  agentId: 'EXEC-GAGAD',
  concurrencyId: 'exec-gagad',
  eventName: 'sandystudio/exec-gagad/review-shot-plan',
  operation: 'gag_review_shot_plan',
  resolveRunArgs: (eventData) => {
    const planAssetId =
      typeof eventData.planAssetId === 'string'
        ? (eventData.planAssetId as string)
        : undefined;
    const shotId =
      typeof eventData.shotId === 'string' ? (eventData.shotId as string) : undefined;
    const args: {
      gagPhase?: 'vanim_review';
      planAssetId?: string;
      shotId?: string;
    } = { gagPhase: 'vanim_review' as const };
    if (planAssetId) args.planAssetId = planAssetId;
    if (shotId) args.shotId = shotId;
    return args;
  },
  nextEvent: (_saved, eventData, result: AgentResult) => {
    const meta = result.metadata as
      | { verdict?: unknown; acceptance_criteria?: unknown }
      | undefined;
    const verdict = typeof meta?.verdict === 'string' ? meta.verdict : null;
    if (verdict !== 'REVISE') return null;

    const shotId =
      typeof eventData.shotId === 'string' ? (eventData.shotId as string) : null;
    if (!shotId) return null;

    const criteria = Array.isArray(meta?.acceptance_criteria)
      ? (meta.acceptance_criteria as unknown[]).filter(
          (v): v is string => typeof v === 'string' && v.trim().length > 0,
        )
      : [];
    const revisionNote =
      criteria.length > 0
        ? `GAGAD vanim_review REVISE — hard acceptance criteria:\n- ${criteria.join('\n- ')}`
        : 'GAGAD vanim_review REVISE — re-derive shot plan to honour gag intent.';

    return {
      name: 'sandystudio/exec-vanim/plan',
      data: {
        episodeId: eventData.episodeId as string,
        shotId,
        revisionNote,
      },
    };
  },
});
