// ──────────────────────────────────────────────────────────────────────────────
// lib/concierge/tools/eref-execute.ts
//
// PA tool for plan-driven single-shot image execution (2026-05-22). Closes
// the architectural gap surfaced by Director when Polina tried to regenerate
// SH08 image from APPROVED Plan v03: she had read-only inspection tools for
// plans (getRefPlan / listRefPlans / getCriticVerdict) and a plan-mutating
// tool (regenerateRefPlan), but NO tool to execute an APPROVED plan into a
// fresh IMG-episode_ref. She fell back to triggerAgent(EXEC-EREF) which
// fires `/start` (pilot pass) and ignores planAssetId entirely.
//
// Sprint Designer architectural principle: plan and image are separate
// first-class concerns. Polina now has the matching first-class action.
//
// Sister of regenerateRefPlan in eref.ts. Same pattern:
//   PA tool → POST REST endpoint → Inngest event → executor function.
// REST middleware (requireDirector) handles auth + audit consistency.
// ──────────────────────────────────────────────────────────────────────────────

import { checkVerbalApproval } from '../approval-check';
import { fail, ok, type Tool, type ToolResult } from './types';

interface RegenerateImageFromPlanArgs {
  shotId: string;
  planAssetId: string;
  episodeId?: string;
  reason?: string;
}

function safeParse(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw);
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return v as Record<string, unknown>;
    }
  } catch {
    /* fallthrough */
  }
  return {};
}

export const regenerateImageFromPlan: Tool<RegenerateImageFromPlanArgs> = {
  name: 'regenerateImageFromPlan',
  description:
    "Execute an APPROVED SPC-ref_plan into a fresh IMG-episode_ref for one shot. " +
    "Use when the Director wants a new image for a shot whose Plan is already APPROVED — " +
    "the typical case is 'plan was already corrected, regenerate ONLY the picture' (e.g. " +
    "Director says 'переделай картинку SH08 по обновлённому плану'). " +
    "Do NOT use this to start a fresh Designer round (use regenerateRefPlan for that) " +
    "or to re-fire the whole episode pilot pass (use triggerAgent with agentCode=EXEC-EREF " +
    "for that — rare). Verbal approval required.",
  mutating: true,
  schema: {
    type: 'function',
    function: {
      name: 'regenerateImageFromPlan',
      description:
        'Execute an APPROVED SPC-ref_plan into a fresh IMG-episode_ref for one shot. Verbal approval required.',
      parameters: {
        type: 'object',
        properties: {
          shotId: {
            type: 'string',
            description:
              "Storyboard shot id matching the Plan's metadata.shot_id (e.g. 'SS-S15-E01-A2-SC04-SH08').",
          },
          planAssetId: {
            type: 'string',
            description:
              'UUID of an APPROVED SPC-ref_plan-* asset belonging to this episode.',
          },
          episodeId: {
            type: 'string',
            description: 'Episode UUID. Omit to use the active conversation episode.',
          },
          reason: {
            type: 'string',
            description:
              "Short audit reason — paraphrase Director's spoken intent (default: generic 'execute approved plan').",
            maxLength: 500,
          },
        },
        required: ['shotId', 'planAssetId'],
        additionalProperties: false,
      },
    },
  },
  parse(raw) {
    const obj = safeParse(raw);
    const shotId = typeof obj.shotId === 'string' ? obj.shotId.trim() : '';
    if (!shotId) throw new Error('shotId is required');
    const planAssetId =
      typeof obj.planAssetId === 'string' ? obj.planAssetId.trim() : '';
    if (!planAssetId) throw new Error('planAssetId is required');
    return {
      shotId,
      planAssetId,
      episodeId:
        typeof obj.episodeId === 'string' ? obj.episodeId : undefined,
      reason: typeof obj.reason === 'string' ? obj.reason : undefined,
    };
  },
  async execute(args, ctx): Promise<ToolResult> {
    const episodeId = args.episodeId ?? ctx.episodeId;
    if (!episodeId) {
      return fail('episodeId required — no active episode in conversation context.');
    }
    const approval = checkVerbalApproval(ctx.recentTurns ?? []);
    if (!approval.approved) {
      return fail(approval.reason, 'verbal_approval_required');
    }

    const reason = args.reason
      ? `[Prod Assistant] ${args.reason} — ${approval.reason}`
      : `[Prod Assistant] execute approved Plan for shot ${args.shotId} — ${approval.reason}`;

    const url = new URL(
      `/api/episodes/${encodeURIComponent(episodeId)}/regenerate-image-from-plan`,
      ctx.appOrigin,
    );
    const resp = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(ctx.cookieHeader ? { cookie: ctx.cookieHeader } : {}),
      },
      body: JSON.stringify({
        shotId: args.shotId,
        planAssetId: args.planAssetId,
        reason,
      }),
    });
    let body: unknown = null;
    try {
      body = await resp.json();
    } catch {
      /* body may be empty */
    }
    if (!resp.ok) {
      const detail =
        body && typeof body === 'object'
          ? JSON.stringify(body)
          : `HTTP ${resp.status}`;
      // TD-35: surface PLAN_ANCHOR_STALE as a Polина-readable instruction.
      // The REST guard returns a ValidationError whose message starts with
      // "PLAN_ANCHOR_STALE: …" — translate to a tool result the conversation
      // model can immediately act on (call regenerateRefPlan instead).
      if (typeof detail === 'string' && detail.includes('PLAN_ANCHOR_STALE')) {
        return fail(
          `Plan ${args.planAssetId.slice(0, 8)}… for shot ${args.shotId} references stale continuity anchors. Image-only regen is blocked because it would reproduce outdated continuity. Call regenerateRefPlan({ shotId: "${args.shotId}", revisionNote: "<formula referencing the fresh anchors>" }) to author a v+1 Plan that picks up the current anchors, await Director's approval of the new Plan, then re-fire regenerateImageFromPlan against the new planAssetId.`,
          'plan_anchor_stale',
        );
      }
      return fail(`regenerate-image-from-plan failed: ${detail}`);
    }
    return ok(
      body,
      `Reference Artist re-fired from Plan ${args.planAssetId.slice(0, 8)}… for shot ${args.shotId}`,
    );
  },
};
