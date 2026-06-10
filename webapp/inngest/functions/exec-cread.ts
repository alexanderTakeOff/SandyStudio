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

    // REVISE → bounce to the Storyboarder with hard acceptance criteria.
    if (verdict === 'REVISE') {
      const criteria = Array.isArray(meta?.acceptance_criteria)
        ? (meta.acceptance_criteria as unknown[]).filter(
            (v): v is string => typeof v === 'string' && v.trim().length > 0,
          )
        : [];
      const revisionNote =
        criteria.length > 0
          ? `Readability Critic verdict REVISE — hard acceptance criteria:\n- ${criteria.join('\n- ')}`
          : 'Readability Critic verdict REVISE — re-author the storyboard for readability.';
      return {
        name: 'sandystudio/exec-sb/create-storyboard',
        data: {
          episodeId: eventData.episodeId as string,
          // create-storyboard requires scriptAssetId; the Storyboarder runner
          // resolves the script from upstream_assets itself, so an empty
          // string is acceptable (matches the SREV→SB revision bounce shape).
          scriptAssetId: '',
          revisionNote,
        },
      };
    }

    // PASS / PASS_WITH_UNCERTAINTY → continuity check.
    if (verdict === 'PASS' || verdict === 'PASS_WITH_UNCERTAINTY') {
      return {
        name: 'sandystudio/exec-wchk/check-world',
        data: {
          episodeId: eventData.episodeId as string,
          storyboardAssetIds: storyboardAssetId ? [storyboardAssetId] : [],
        },
      };
    }

    // HALT / FAIL / UNKNOWN → no next event (Director escalation).
    return null;
  },
});
