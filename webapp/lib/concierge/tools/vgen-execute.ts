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
import { authHeaders, fail, ok, resolveEpisodeId, type Tool, type ToolResult } from './types';
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
    const episodeId = resolveEpisodeId(args, ctx);
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

// ──────────────────────────────────────────────────────────────────────────────
// regenerateShot — anchor-mode flip (orbit ⇒ ref-only doctrine, 2026-06-17).
//
// Empirically (E10 A/B smoke): on camera-orbit shots a pinned end_image fights
// the orbit → ref-only renders much better. Since 80%+ shots orbit (TD-68),
// ref-only is the default; two anchors are the STATIC non-orbit match-cut
// exception. This tool lets Director tell Polина «перегени SH07 без якорей» and
// have her re-render the shot ref-only without editing the Plan.
//
// Thin wrapper over the existing REST route /api/assets/:id/regenerate-video
// (which already accepts provider + end_image_asset_id and auto-resolves the
// approved EREF as reference) — no logic duplicated. Mirrors
// regenerateVideoFromPlan's gate/auth/pickup shape.
// ──────────────────────────────────────────────────────────────────────────────

type AnchorMode = 'ref-only' | 'two-anchor';

interface RegenerateShotArgs {
  shotId: string;
  anchorMode: AnchorMode;
  endImageAssetId?: string;
  episodeId?: string;
  reason?: string;
}

export const regenerateShot: Tool<RegenerateShotArgs> = {
  name: 'regenerateShot',
  description:
    "Re-render one VID-shot with an explicit ANCHOR MODE (orbit⇒ref-only doctrine). " +
    "Use when Director wants to flip how a shot is anchored without re-authoring " +
    "the Plan — typical case is 'перегени SH07 без якорей' / 'только реф' → " +
    "anchorMode='ref-only' (the orbit default; nulls end_image). For the rare " +
    "STATIC non-orbit match-cut, anchorMode='two-anchor' AND pass endImageAssetId " +
    "(the end frame) — omitting it fails loud, never silently degrades. Re-renders " +
    "the newest VID-shot for the shotId via Seedance, reusing the approved EREF as " +
    "reference. Distinct from regenerateVideoFromPlan (which executes an APPROVED " +
    "Plan as-is). Verbal approval required.",
  mutating: true,
  schema: {
    type: 'function',
    function: {
      name: 'regenerateShot',
      description:
        'Re-render one VID-shot with an explicit anchor mode (ref-only = orbit default; two-anchor needs an end frame). Verbal approval required.',
      parameters: {
        type: 'object',
        properties: {
          shotId: {
            type: 'string',
            description:
              "Storyboard shot id (e.g. 'SS-S15-E01-A2-SC04-SH07'). Resolves to the newest VID-shot asset for this shot.",
          },
          anchorMode: {
            type: 'string',
            enum: ['ref-only', 'two-anchor'],
            description:
              "'ref-only' (default, best for camera orbit — single anchor, end_image null) or 'two-anchor' (STATIC non-orbit match-cut only — requires endImageAssetId).",
          },
          endImageAssetId: {
            type: 'string',
            description:
              "UUID of the end-frame image asset. REQUIRED when anchorMode='two-anchor'; ignored for 'ref-only'.",
          },
          episodeId: {
            type: 'string',
            description: 'Episode UUID. Omit to use the active conversation episode.',
          },
          reason: {
            type: 'string',
            description:
              "Short audit reason — paraphrase Director's spoken intent.",
            maxLength: 500,
          },
        },
        required: ['shotId', 'anchorMode'],
        additionalProperties: false,
      },
    },
  },
  parse(raw) {
    const obj = safeParse(raw);
    const shotId = typeof obj.shotId === 'string' ? obj.shotId.trim() : '';
    if (!shotId) throw new Error('shotId is required');
    const anchorMode: AnchorMode =
      obj.anchorMode === 'two-anchor' ? 'two-anchor' : 'ref-only';
    const endImageAssetId =
      typeof obj.endImageAssetId === 'string' && obj.endImageAssetId.trim()
        ? obj.endImageAssetId.trim()
        : undefined;
    return {
      shotId,
      anchorMode,
      endImageAssetId,
      episodeId: typeof obj.episodeId === 'string' ? obj.episodeId : undefined,
      reason: typeof obj.reason === 'string' ? obj.reason : undefined,
    };
  },
  async execute(args, ctx): Promise<ToolResult> {
    const episodeId = resolveEpisodeId(args, ctx);
    if (!episodeId) {
      return fail('episodeId required — no active episode in conversation context.');
    }
    // fail-loud: two anchors require an end frame. Never silently degrade.
    if (args.anchorMode === 'two-anchor' && !args.endImageAssetId) {
      return fail(
        "anchorMode='two-anchor' requires endImageAssetId (the end frame). " +
          "Pass it, or use anchorMode='ref-only'.",
      );
    }
    const approval = gateMutation('regenerateShot', {
      mode: ctx.mode,
      turns: ctx.recentTurns ?? [],
    });
    if (!approval.approved) {
      return fail(approval.reason, 'verbal_approval_required');
    }

    // Resolve shotId → newest VID-shot asset. ilike makes file_type matching
    // case-insensitive (robust to VID-shot / vid-shot casing drift).
    const { data: rows, error: lookupErr } = await ctx.supabase
      .from('assets')
      .select('id, file_type, status, created_at')
      .eq('episode_id', episodeId)
      .ilike('file_type', 'VID-shot%')
      .eq('metadata->>shot_id', args.shotId)
      .order('created_at', { ascending: false })
      .limit(1);
    if (lookupErr) {
      return fail(`regenerateShot lookup failed: ${lookupErr.message}`);
    }
    const assetId = rows?.[0]?.id;
    if (!assetId) {
      return fail(
        `No VID-shot asset found for shot ${args.shotId} — generate the video first.`,
      );
    }

    const url = new URL(
      `/api/assets/${encodeURIComponent(assetId)}/regenerate-video`,
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
        provider: 'seedance-fal-img2vid',
        end_image_asset_id:
          args.anchorMode === 'ref-only' ? null : args.endImageAssetId,
        directorConfirm: true,
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
        body && typeof body === 'object' ? JSON.stringify(body) : `HTTP ${resp.status}`;
      return fail(`regenerateShot failed: ${detail}`);
    }
    const result = ok(
      body,
      `Shot ${args.shotId} re-rendering as ${args.anchorMode}${
        args.anchorMode === 'ref-only' ? ' (🎯 only ref)' : ' (🔗 two anchors)'
      }`,
    );
    return ackOrFailOnPickup(result, {
      supabase: ctx.supabase,
      episodeId,
      agentHint: 'EXEC-VGEN',
      sinceIso,
      label: `regenerateShot(${args.shotId}, ${args.anchorMode})`,
    });
  },
};
