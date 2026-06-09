// ──────────────────────────────────────────────────────────────────────────────
// lib/concierge/tools/gagad.ts
// Prod Assistant tools for the Gag Assistant Director chain (Sprint
// «Дизайнер и Аниматор» Day 11+, 2026-05-19). Mirrors the EREF / Animator
// tool shape but operates on SPC-gag_plan and REV-gag_check_* assets.
//
//   - getGagPlan(episodeId)          → latest SPC-gag_plan + parsed JSON
//   - listGagPlans(episodeId)        → version history of gag plans
//   - getGagVerdict(planAssetId)     → REV-gag_check_* verdict referencing
//                                       a given SPC-ref_plan or SPC-shot_plan
//   - regenerateGagPlan(episodeId, revisionNote?) → MUTATING. Re-fire Gag AD
//                                       Phase plan with optional hard contract
// ──────────────────────────────────────────────────────────────────────────────

import { gateMutation } from '../approval-check';
import { authHeaders, fail, ok, type Tool, type ToolContext, type ToolResult } from './types';

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

function extractLastJson(content: string): Record<string, unknown> | null {
  const matches = [...content.matchAll(/```json\s*([\s\S]+?)```/g)];
  if (matches.length === 0) return null;
  const last = matches[matches.length - 1]?.[1];
  if (!last) return null;
  try {
    return JSON.parse(last.trim()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ── getGagPlan ───────────────────────────────────────────────────────────────

interface GetGagPlanArgs {
  episodeId?: string;
}

export const getGagPlan: Tool<GetGagPlanArgs> = {
  name: 'getGagPlan',
  description:
    "Fetch the LATEST SPC-gag_plan (Gag AD's episode-level plan) for an episode. Returns full markdown + parsed JSON (theme, antagonist, escalation_pattern, per-shot gag intent table). Read-only. Use when the Director asks 'покажи gag plan' or 'какие гэги запланированы на этот эпизод'.",
  mutating: false,
  schema: {
    type: 'function',
    function: {
      name: 'getGagPlan',
      description: 'Read the latest SPC-gag_plan asset for an episode (markdown + parsed JSON).',
      parameters: {
        type: 'object',
        properties: {
          episodeId: {
            type: 'string',
            description: 'Episode UUID. Omit to use active conversation episode.',
          },
        },
        additionalProperties: false,
      },
    },
  },
  parse(raw) {
    const obj = safeParse(raw);
    return {
      episodeId: typeof obj.episodeId === 'string' ? obj.episodeId : undefined,
    };
  },
  async execute(args, ctx): Promise<ToolResult> {
    const episodeId = args.episodeId ?? ctx.episodeId;
    if (!episodeId) return fail('episodeId required — no active episode.');

    const { data, error } = await ctx.supabase
      .from('assets')
      .select('id,filename,status,version,description,content,metadata,created_at,updated_at')
      .eq('episode_id', episodeId)
      .eq('file_type', 'SPC-gag_plan')
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return fail(`gag_plan fetch failed: ${error.message}`);
    if (!data) {
      return ok(
        { episodeId, hasPlan: false },
        'No SPC-gag_plan yet for this episode (may not be comedy, or Gag AD hasn\'t fired yet).',
      );
    }
    const jsonBody = extractLastJson(data.content ?? '');
    return ok(
      {
        id: data.id,
        filename: data.filename,
        status: data.status,
        version: data.version,
        description: data.description,
        bodyJson: jsonBody,
        markdown: data.content,
        metadata: data.metadata,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
      `Gag Plan ${data.filename} (${data.status} v${data.version})`,
    );
  },
};

// ── listGagPlans ─────────────────────────────────────────────────────────────

interface ListGagPlansArgs {
  episodeId?: string;
}

export const listGagPlans: Tool<ListGagPlansArgs> = {
  name: 'listGagPlans',
  description:
    "List ALL SPC-gag_plan versions for an episode (version history). Useful when there's been a revision cycle and Director wants to compare. Read-only.",
  mutating: false,
  schema: {
    type: 'function',
    function: {
      name: 'listGagPlans',
      description: 'List all SPC-gag_plan versions for an episode.',
      parameters: {
        type: 'object',
        properties: {
          episodeId: { type: 'string', description: 'Episode UUID. Omit to use active.' },
        },
        additionalProperties: false,
      },
    },
  },
  parse(raw) {
    const obj = safeParse(raw);
    return {
      episodeId: typeof obj.episodeId === 'string' ? obj.episodeId : undefined,
    };
  },
  async execute(args, ctx): Promise<ToolResult> {
    const episodeId = args.episodeId ?? ctx.episodeId;
    if (!episodeId) return fail('episodeId required — no active episode.');

    const { data, error } = await ctx.supabase
      .from('assets')
      .select('id,filename,status,version,description,created_at,updated_at')
      .eq('episode_id', episodeId)
      .eq('file_type', 'SPC-gag_plan')
      .order('version', { ascending: false });
    if (error) return fail(`list failed: ${error.message}`);
    const plans = (data ?? []).map((p) => ({
      id: p.id,
      filename: p.filename,
      status: p.status,
      version: p.version,
      description: p.description,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    }));
    return ok(
      { episodeId, count: plans.length, plans },
      `${plans.length} Gag Plan version(s) for episode`,
    );
  },
};

// ── getGagVerdict ────────────────────────────────────────────────────────────

interface GetGagVerdictArgs {
  planAssetId: string;
}

export const getGagVerdict: Tool<GetGagVerdictArgs> = {
  name: 'getGagVerdict',
  description:
    "Fetch the Gag AD's cross-layer verdict (REV-gag_check_ref or REV-gag_check_shot) for a given Plan asset (SPC-ref_plan OR SPC-shot_plan). Returns verdict (PASS/REVISE/HALT), failed/passed checks, acceptance criteria. Read-only. Use when Director asks 'что сказал Gag AD про этот ref plan' or 'почему этот shot plan на ревизии'.",
  mutating: false,
  schema: {
    type: 'function',
    function: {
      name: 'getGagVerdict',
      description: "Read Gag AD's verdict for a given SPC-ref_plan or SPC-shot_plan.",
      parameters: {
        type: 'object',
        properties: {
          planAssetId: {
            type: 'string',
            description: 'SPC-ref_plan OR SPC-shot_plan asset UUID.',
          },
        },
        required: ['planAssetId'],
        additionalProperties: false,
      },
    },
  },
  parse(raw) {
    const obj = safeParse(raw);
    const planAssetId = typeof obj.planAssetId === 'string' ? obj.planAssetId : '';
    if (!planAssetId) throw new Error('planAssetId is required');
    return { planAssetId };
  },
  async execute(args, ctx): Promise<ToolResult> {
    const { data: planRow } = await ctx.supabase
      .from('assets')
      .select('episode_id,filename,file_type')
      .eq('id', args.planAssetId)
      .maybeSingle();
    if (!planRow) return fail(`Plan ${args.planAssetId} not found`, 'not_found');
    const episodeId = (planRow as { episode_id?: string | null }).episode_id;
    if (!episodeId) return fail('Plan has no episode_id', 'no_episode');

    // Look in BOTH REV-gag_check_ref and REV-gag_check_shot for a row whose
    // metadata.plan_asset_id matches.
    const { data, error } = await ctx.supabase
      .from('assets')
      .select('id,filename,status,content,metadata,file_type,created_at')
      .eq('episode_id', episodeId)
      .or('file_type.eq.REV-gag_check_ref,file_type.eq.REV-gag_check_shot')
      .order('created_at', { ascending: false });
    if (error) return fail(`Gag AD verdict lookup failed: ${error.message}`);

    const match = (data ?? []).find((row) => {
      const meta = (row as { metadata?: unknown }).metadata as
        | { plan_asset_id?: unknown }
        | null;
      return (
        typeof meta?.plan_asset_id === 'string' &&
        meta.plan_asset_id === args.planAssetId
      );
    });
    if (!match) {
      return ok(
        { planAssetId: args.planAssetId, hasVerdict: false },
        `No Gag AD verdict yet for ${(planRow as { filename?: string }).filename ?? args.planAssetId}`,
      );
    }
    const meta = (match as { metadata?: unknown }).metadata as Record<string, unknown> | null;
    const verdict = typeof meta?.verdict === 'string' ? meta.verdict : 'UNKNOWN';
    const phase = typeof meta?.phase === 'string' ? meta.phase : '?';
    const failedChecks = Array.isArray(meta?.failed_checks) ? meta.failed_checks : [];
    const passedChecks = Array.isArray(meta?.passed_checks) ? meta.passed_checks : [];
    const acceptanceCriteria = Array.isArray(meta?.acceptance_criteria)
      ? meta.acceptance_criteria
      : [];
    const revisionCount =
      typeof meta?.revision_count_before === 'number' ? meta.revision_count_before : 0;
    return ok(
      {
        planAssetId: args.planAssetId,
        criticAssetId: match.id,
        criticFilename: match.filename,
        phase,
        verdict,
        revisionCountBefore: revisionCount,
        failedChecks,
        passedChecks,
        acceptanceCriteria,
        narrative: match.content,
        createdAt: match.created_at,
      },
      `Gag AD ${phase} verdict: ${verdict} (revision ${revisionCount}/2)`,
    );
  },
};

// ── regenerateGagPlan (mutating) ─────────────────────────────────────────────

interface RegenerateGagPlanArgs {
  episodeId?: string;
  revisionNote?: string;
}

export const regenerateGagPlan: Tool<RegenerateGagPlanArgs> = {
  name: 'regenerateGagPlan',
  description:
    "Re-fire the Gag Assistant Director to produce a new SPC-gag_plan version for the episode. Optionally pass a revisionNote — Gag AD treats it as a hard contract. Use when Director wants different gag direction (e.g. 'добавь больше chain reactions', 'смени antagonist на Inspector Stopwatch'). Verbal approval required.",
  mutating: true,
  schema: {
    type: 'function',
    function: {
      name: 'regenerateGagPlan',
      description: 'Re-fire EXEC-GAGAD Phase plan. Verbal approval required.',
      parameters: {
        type: 'object',
        properties: {
          episodeId: {
            type: 'string',
            description: 'Episode UUID. Omit to use active conversation episode.',
          },
          revisionNote: {
            type: 'string',
            description: "Optional hard-contract note. Quote Director's spoken concern.",
            maxLength: 2000,
          },
        },
        additionalProperties: false,
      },
    },
  },
  parse(raw) {
    const obj = safeParse(raw);
    return {
      episodeId: typeof obj.episodeId === 'string' ? obj.episodeId : undefined,
      revisionNote: typeof obj.revisionNote === 'string' ? obj.revisionNote : undefined,
    };
  },
  async execute(args, ctx): Promise<ToolResult> {
    const episodeId = args.episodeId ?? ctx.episodeId;
    if (!episodeId) return fail('episodeId required — no active episode.');

    const approval = gateMutation('regenerateGagPlan', {
      mode: ctx.mode,
      turns: ctx.recentTurns ?? [],
    });
    if (!approval.approved) return fail(approval.reason, 'verbal_approval_required');

    const url = new URL(
      `/api/episodes/${encodeURIComponent(episodeId)}/trigger`,
      ctx.appOrigin,
    );
    const resp = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...authHeaders(ctx),
      },
      body: JSON.stringify({
        agentCode: 'EXEC-GAGAD',
        reason: `[Prod Assistant] regenerate Gag Plan — ${approval.reason}`,
        payload: {
          ...(args.revisionNote ? { revisionNote: args.revisionNote } : {}),
        },
      }),
    });
    let body: unknown = null;
    try {
      body = await resp.json();
    } catch {
      /* */
    }
    if (!resp.ok) {
      return fail(
        `trigger failed: HTTP ${resp.status} ${typeof body === 'object' ? JSON.stringify(body) : ''}`,
      );
    }
    return ok(body, `Gag AD re-fired for episode ${episodeId}`);
  },
};
