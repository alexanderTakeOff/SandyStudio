// ──────────────────────────────────────────────────────────────────────────────
// lib/concierge/tools/vgen-execute.ts
//
// PA tool for plan-driven single-shot VIDEO execution (TD-50 follow-up,
// 2026-05-26). Symmetric to `regenerateImageFromPlan` in eref-execute.ts:
// the Reference Designer / Reference Artist split has the same shape as
// the Video Designer (Animator) / Video Artist (VGEN) split, so Polина
// gets a matching first-class action.
//
// Without this tool the only path was `triggerAgent({agentCode:'EXEC-VGEN',
// payload:{shotId, planAssetId}})` which works (TD-50 reroute honours
// planAssetId) but is a low-level escape hatch — easy for Polина's LLM to
// forget the payload, in which case the legacy template path fires and the
// quality tier silently drops back to the global default (typically fast).
// A dedicated tool makes the contract explicit.
//
// Pattern mirrors eref-execute.ts:
//   PA tool → POST /api/episodes/:id/trigger → Inngest event with planAssetId
//   → runner.ts honours body.provider.id + body.quality_tier from the Plan.
// ──────────────────────────────────────────────────────────────────────────────

import { gateMutation } from '../approval-check';
import { authHeaders, fail, ok, type Tool, type ToolResult } from './types';
import { ackOrFailOnPickup } from './wait-for-pickup';

interface RegenerateVideoFromPlanArgs {
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

export const regenerateVideoFromPlan: Tool<RegenerateVideoFromPlanArgs> = {
  name: 'regenerateVideoFromPlan',
  description:
    "Execute an APPROVED SPC-shot_plan into a fresh VID-shot for one shot. " +
    "Use when the Plan is already APPROVED and Director wants a new video " +
    "honouring the Plan's provider.id / quality_tier — typical case is " +
    "'переделай видео SH08 по утверждённому плану' or re-doing a legacy " +
    "pre-TD-44 VGEN run with the tier the Animator declared. Routes via " +
    "TD-50 to `sandystudio/exec-vgen/single-shot` so Plan-driven path is " +
    "honoured. Do NOT use this for fresh Plan authoring (use " +
    "`regenerateShotPlan` for that) or for whole-episode pilot pass (use " +
    "triggerAgent with agentCode=EXEC-VGEN, no planAssetId — rare). " +
    "Verbal approval required.",
  mutating: true,
  schema: {
    type: 'function',
    function: {
      name: 'regenerateVideoFromPlan',
      description:
        'Execute an APPROVED SPC-shot_plan into a fresh VID-shot for one shot. Verbal approval required.',
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
              'UUID of an APPROVED SPC-shot_plan-* asset belonging to this episode.',
          },
          episodeId: {
            type: 'string',
            description: 'Episode UUID. Omit to use the active conversation episode.',
          },
          reason: {
            type: 'string',
            description:
              "Short audit reason — paraphrase Director's spoken intent (default: generic 'execute approved Plan').",
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
    const approval = gateMutation('regenerateVideoFromPlan', {
      mode: ctx.mode,
      turns: ctx.recentTurns ?? [],
    });
    if (!approval.approved) {
      return fail(approval.reason, 'verbal_approval_required');
    }

    const reason = args.reason
      ? `[Prod Assistant] ${args.reason} — ${approval.reason}`
      : `[Prod Assistant] execute approved Plan for shot ${args.shotId} — ${approval.reason}`;

    const url = new URL(
      `/api/episodes/${encodeURIComponent(episodeId)}/trigger`,
      ctx.appOrigin,
    );
    // TD-39 L1: T0 before fetch.
    const sinceIso = new Date().toISOString();
    const resp = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...authHeaders(ctx),
      },
      body: JSON.stringify({
        agentCode: 'EXEC-VGEN',
        reason,
        payload: {
          shotId: args.shotId,
          planAssetId: args.planAssetId,
        },
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
      return fail(`regenerateVideoFromPlan failed: ${detail}`);
    }
    const result = ok(
      body,
      `Video Artist re-fired from Plan ${args.planAssetId.slice(0, 8)}… for shot ${args.shotId}`,
    );
    return ackOrFailOnPickup(result, {
      supabase: ctx.supabase,
      episodeId,
      agentHint: 'EXEC-VGEN',
      sinceIso,
      label: `regenerateVideoFromPlan(${args.shotId})`,
    });
  },
};
