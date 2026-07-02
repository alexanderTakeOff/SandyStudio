// ──────────────────────────────────────────────────────────────────────────────
// inngest/functions/exec-cread.ts
// EXEC-CREAD — Creative Readability Critic (C1-Gate sprint 2026-06-10).
// Universal, process-invariant critic slotted after STB-storyboard and before
// EXEC-WCHK. Fired by EXEC-SB's nextEvent (and the next-events STB branch) when
// READABILITY_GATE_ENABLED is on. Mirrors exec-srev.ts / exec-eprev.ts.
//
// Auto-chain by verdict (see nextEvent below):
//   PASS / PASS_WITH_UNCERTAINTY → EXEC-WCHK (continuity check) with the
//       storyboard asset id carried forward.
//   REVISE                       → re-fire the Storyboarder with the readability
//       acceptance_criteria as a hard-contract revisionNote.
//   HALT / FAIL / UNKNOWN        → no next event (Director escalation only).
//
// Event shape: { episodeId: uuid, storyboardAssetId: uuid }
// ──────────────────────────────────────────────────────────────────────────────

import { createAgentInngestFunction } from '@/lib/agents/factory';
import type { AgentResult } from '@/lib/agents/types';
import { shortShotLabel } from '@/lib/api/vgen-shot-helpers';

export const execCreadReviewStoryboard = createAgentInngestFunction({
  id: 'exec-cread-review-storyboard',
  name: 'EXEC-CREAD: Review Storyboard Readability',
  agentId: 'EXEC-CREAD',
  concurrencyId: 'exec-cread',
  eventName: 'sandystudio/exec-cread/review-storyboard',
  operation: 'storyboard_readability_review',
  // Critic IS the gate from REVIEW to APPROVED for the storyboard it reviews —
  // without this override the input loader filters out the very storyboard
  // under review. Mirrors the SREV / WCHK reviewer pattern.
  inputAllowedStatuses: ['APPROVED', 'REVIEW', 'REVISION'],
  resolveRunArgs: (eventData) => {
    const storyboardAssetId =
      typeof eventData.storyboardAssetId === 'string'
        ? (eventData.storyboardAssetId as string)
        : undefined;
    const out: { storyboardAssetId?: string } = {};
    if (storyboardAssetId) out.storyboardAssetId = storyboardAssetId;
    return out;
  },
  resolveActivityContext: (eventData) => {
    const storyboardAssetId =
      typeof eventData.storyboardAssetId === 'string'
        ? eventData.storyboardAssetId
        : null;
    return {
      metadata: { storyboard_asset_id: storyboardAssetId },
    };
  },
  nextEvent: (_saved, eventData, result: AgentResult) => {
    const meta = result.metadata as
      | {
          verdict?: unknown;
          acceptance_criteria?: unknown;
          storyboard_asset_id?: unknown;
        }
      | undefined;
    const verdict = typeof meta?.verdict === 'string' ? meta.verdict : null;
    const storyboardAssetId =
      typeof meta?.storyboard_asset_id === 'string'
        ? meta.storyboard_asset_id
        : typeof eventData.storyboardAssetId === 'string'
          ? (eventData.storyboardAssetId as string)
          : null;

    // q15 block→warning (2026-06-23): Readability is a SOFT (advisory) critic —
    // it INFORMS the Director's approval, it does not HALT the chain. Previously
    // REVISE bounced the whole storyboard back to the Storyboarder; an over-strict
    // false-REVISE (the E02 cleaning-gag rubric demanding a "six-stage cleaning
    // engine" from a phone-scroll episode) stalled E12 and pushed operators into
    // the planless bypass. Now PASS *and* REVISE both advance to the continuity
    // check — the readability verdict still surfaces as a warning in the feed
    // (the REV-readability asset + "EXEC-CREAD completed · REVISE" warning row),
    // so the Director can choose to re-author, but the pipeline no longer stalls.
    if (
      verdict === 'PASS' ||
      verdict === 'PASS_WITH_UNCERTAINTY' ||
      verdict === 'REVISE'
    ) {
      return {
        name: 'sandystudio/exec-wchk/check-world',
        data: {
          episodeId: eventData.episodeId as string,
          storyboardAssetIds: storyboardAssetId ? [storyboardAssetId] : [],
        },
      };
    }

    // HALT / FAIL / UNKNOWN → no next event. A genuine critic failure (not an
    // advisory readability note) still escalates to the Director.
    return null;
  },
});

// ──────────────────────────────────────────────────────────────────────────────
// Per-shot readability review (T1 consolidation 2026-06-10). Absorbed the
// retired EXEC-GAGAD eref_review / vanim_review. Fired by EPREV/VPREV PASS only
// when READABILITY_GATE_ENABLED is on AND the series genre is comedy-like (the
// genre gate lives in the EPREV/VPREV nextEvent, mirroring the old GAGAD wiring).
//
// #5 one-attempt (2026-07-02): CREAD is the TASTE critic — it is now ADVISORY on
// the per-shot phases too, extending the storyboard-phase q15 flip. A REVISE no
// longer re-fires the producer (Designer / Animator); the Plan simply stays in
// REVIEW and the readability verdict surfaces as advisory only (the REV-readability
// asset + "EXEC-CREAD completed · REVISE" warning row), for the Director / AI-EP
// to triage. This kills the taste-driven auto-regen loop (regen often regresses,
// and the 2nd/3rd attempt is frequently worse) while the CANON critics
// (EPREV / VPREV / WCHK) keep their hard REVISE gate — "если не канон". The
// Director manually re-fires the few genuinely-weak shots.
//
// Auto-chain by verdict: NONE. Every verdict is advisory here — no next event.
// (HALT still escalates via applyCriticVerdict in the runner; the verdict + its
// acceptance_criteria remain readable in the REV-readability asset / critic-notes
// so a Director-initiated REVISION can carry them.)
// ──────────────────────────────────────────────────────────────────────────────

function reviewResolveRunArgs(
  creadPhase: 'eref' | 'vanim',
): (eventData: Record<string, unknown>) => {
  creadPhase: 'eref' | 'vanim';
  planAssetId?: string;
  shotId?: string;
} {
  return (eventData) => {
    const planAssetId =
      typeof eventData.planAssetId === 'string' ? eventData.planAssetId : undefined;
    const shotId =
      typeof eventData.shotId === 'string' ? eventData.shotId : undefined;
    const args: { creadPhase: 'eref' | 'vanim'; planAssetId?: string; shotId?: string } = {
      creadPhase,
    };
    if (planAssetId) args.planAssetId = planAssetId;
    if (shotId) args.shotId = shotId;
    return args;
  };
}

function reviewResolveActivityContext(
  creadPhase: 'eref' | 'vanim',
): (eventData: Record<string, unknown>) => {
  shortLabel?: string;
  metadata?: Record<string, unknown>;
} {
  return (eventData) => {
    const shotId = typeof eventData.shotId === 'string' ? eventData.shotId : '';
    const planAssetId =
      typeof eventData.planAssetId === 'string' ? eventData.planAssetId : null;
    return {
      shortLabel: shortShotLabel(shotId),
      metadata: { shot_id: shotId || null, plan_asset_id: planAssetId, cread_phase: creadPhase },
    };
  };
}

// Advisory per-shot readability: NO auto-re-author on any verdict (#5, 2026-07-02).
// The verdict is surfaced (REV-readability asset + warning feed row) by the runner
// regardless; this hook just declines to re-fire the producer, so attempt-1 ships.
const advisoryNoReauthor = (): null => null;

export const execCreadReviewRefPlan = createAgentInngestFunction({
  id: 'exec-cread-review-ref-plan',
  name: 'EXEC-CREAD: Readability review of SPC-ref_plan',
  agentId: 'EXEC-CREAD',
  concurrencyId: 'exec-cread',
  eventName: 'sandystudio/exec-cread/review-ref-plan',
  operation: 'readability_review_ref_plan',
  resolveRunArgs: reviewResolveRunArgs('eref'),
  resolveActivityContext: reviewResolveActivityContext('eref'),
  nextEvent: advisoryNoReauthor,
});

export const execCreadReviewShotPlan = createAgentInngestFunction({
  id: 'exec-cread-review-shot-plan',
  name: 'EXEC-CREAD: Readability review of SPC-shot_plan',
  agentId: 'EXEC-CREAD',
  concurrencyId: 'exec-cread',
  eventName: 'sandystudio/exec-cread/review-shot-plan',
  operation: 'readability_review_shot_plan',
  resolveRunArgs: reviewResolveRunArgs('vanim'),
  resolveActivityContext: reviewResolveActivityContext('vanim'),
  nextEvent: advisoryNoReauthor,
});
