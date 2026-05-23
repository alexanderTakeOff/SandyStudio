// ──────────────────────────────────────────────────────────────────────────────
// lib/concierge/tools/eref.ts
// Prod Assistant tools for the Episode Reference pipeline (Sprint «Дизайнер
// и Аниматор» Day 4.5, 2026-05-19).
//
// Three read-only inspection tools + one mutating regenerate:
//
//   - getRefPlan(planAssetId)     → return full Plan asset (body, status,
//                                   linked Critic verdict if any). Director
//                                   uses this to ask "what does the Plan for
//                                   shot SH02 say?" in chat without opening
//                                   the asset drawer.
//   - listRefPlans(episodeId)     → list every SPC-ref_plan for the episode,
//                                   with status + Critic verdict snapshot.
//                                   "Покажи статус всех планов в эпизоде".
//   - getCriticVerdict(planAssetId) → fetch the REV-ref_plan row attached
//                                   to a Plan (Critic verdict + failed
//                                   checks). "Что сказал критик про этот план?"
//   - regenerateRefPlan(shotId)   → MUTATING. Re-fire the Designer for one
//                                   shot. Used when Director wants different
//                                   direction without waiting for Critic-
//                                   mediated REVISE. Verbal approval required.
// ──────────────────────────────────────────────────────────────────────────────

import { checkVerbalApproval } from '../approval-check';
import { fail, ok, type Tool, type ToolContext, type ToolResult } from './types';

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

// ── getRefPlan ───────────────────────────────────────────────────────────────

interface GetRefPlanArgs {
  planAssetId: string;
}

export const getRefPlan: Tool<GetRefPlanArgs> = {
  name: 'getRefPlan',
  description:
    "Fetch a single Reference Plan (SPC-ref_plan) asset by id, including the full markdown body and parsed JSON decisions (provider, size, prompt, negative, continuity). Read-only. Use when the Director asks 'what does the Plan for shot X say?' or 'show me the Plan for asset Y'.",
  mutating: false,
  schema: {
    type: 'function',
    function: {
      name: 'getRefPlan',
      description: 'Read one SPC-ref_plan asset with parsed JSON body.',
      parameters: {
        type: 'object',
        properties: {
          planAssetId: {
            type: 'string',
            description: 'Plan asset UUID.',
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
    const { data, error } = await ctx.supabase
      .from('assets')
      .select('id,file_type,filename,status,version,episode_id,description,content,metadata,created_at,updated_at')
      .eq('id', args.planAssetId)
      .maybeSingle();
    if (error) return fail(`asset fetch failed: ${error.message}`);
    if (!data) return fail(`Plan ${args.planAssetId} not found`, 'not_found');
    // TD-24 (2026-05-20): Designer runner writes file_type as
    // `SPC-ref_plan-<shot_id>`, not bare `SPC-ref_plan`. Accept both shapes,
    // same as `loadPlanOverrides` in episode-references.ts:776.
    if (
      data.file_type !== 'SPC-ref_plan' &&
      !data.file_type.startsWith('SPC-ref_plan-')
    ) {
      return fail(
        `asset ${args.planAssetId} is ${data.file_type}, not SPC-ref_plan or SPC-ref_plan-*`,
        'wrong_type',
      );
    }

    const jsonBody = extractLastJson(data.content ?? '');
    return ok(
      {
        id: data.id,
        filename: data.filename,
        status: data.status,
        version: data.version,
        episodeId: data.episode_id,
        description: data.description,
        bodyJson: jsonBody,
        markdown: data.content,
        metadata: data.metadata,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
      `Plan ${data.filename} (${data.status})`,
    );
  },
};

// ── listRefPlans ─────────────────────────────────────────────────────────────

interface ListRefPlansArgs {
  episodeId?: string;
  status?: string;
}

export const listRefPlans: Tool<ListRefPlansArgs> = {
  name: 'listRefPlans',
  description:
    "List every Reference Plan (SPC-ref_plan) for an episode with status + version + linked Critic verdict if available. Read-only. Use when the Director asks 'покажи статус всех планов' or 'which plans need approval?'.",
  mutating: false,
  schema: {
    type: 'function',
    function: {
      name: 'listRefPlans',
      description: 'List per-episode Plans with status and Critic verdicts.',
      parameters: {
        type: 'object',
        properties: {
          episodeId: {
            type: 'string',
            description: 'Episode UUID. Omit to use active conversation episode.',
          },
          status: {
            type: 'string',
            description: 'Optional status filter (DRAFT/REVIEW/REVISION/APPROVED/REJECTED).',
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
      status: typeof obj.status === 'string' ? obj.status : undefined,
    };
  },
  async execute(args, ctx): Promise<ToolResult> {
    const episodeId = args.episodeId ?? ctx.episodeId;
    if (!episodeId) {
      return fail('episodeId required — no active episode.');
    }
    // TD-24 (2026-05-20): Designer writes file_type as `SPC-ref_plan-<shot_id>`
    // (per-shot), not bare `SPC-ref_plan`. Match both shapes via PostgREST `or`
    // filter — `like` pattern handles the TD-24 shape, equality catches any
    // legacy bare-shape rows pre-TD-24.
    let q = ctx.supabase
      .from('assets')
      .select('id,file_type,filename,status,version,description,metadata,created_at,updated_at')
      .eq('episode_id', episodeId)
      .or('file_type.eq.SPC-ref_plan,file_type.like.SPC-ref_plan-%')
      .order('created_at', { ascending: true });
    if (args.status) q = q.eq('status', args.status as never);
    const { data, error } = await q;
    if (error) return fail(`list failed: ${error.message}`);

    // Pair each Plan with its latest REV-ref_plan (Critic) row by metadata link.
    const { data: criticRows } = await ctx.supabase
      .from('assets')
      .select('id,filename,status,metadata,created_at')
      .eq('episode_id', episodeId)
      .eq('file_type', 'REV-ref_plan');

    const criticByPlanId = new Map<string, { id: string; verdict: string; failedCount: number }>();
    for (const row of (criticRows ?? []) as Array<{
      id: string;
      metadata?: unknown;
    }>) {
      const meta = row.metadata as
        | { plan_asset_id?: unknown; verdict?: unknown; failed_checks?: unknown }
        | null;
      const planId = typeof meta?.plan_asset_id === 'string' ? meta.plan_asset_id : null;
      const verdict = typeof meta?.verdict === 'string' ? meta.verdict : 'UNKNOWN';
      const failedCount = Array.isArray(meta?.failed_checks)
        ? (meta.failed_checks as unknown[]).length
        : 0;
      if (planId) {
        criticByPlanId.set(planId, { id: row.id, verdict, failedCount });
      }
    }

    const plans = (data ?? []).map((p) => {
      const meta = p.metadata as { shot_id?: unknown } | null;
      // TD-24: shot_id may live either in metadata (Designer-emitted) or
      // be parseable from the file_type suffix (`SPC-ref_plan-<shot_id>`).
      // Prefer metadata, fall back to filename suffix parse.
      const shotIdFromMeta = typeof meta?.shot_id === 'string' ? meta.shot_id : null;
      const fileType = (p as { file_type?: string | null }).file_type ?? '';
      const shotIdFromType = fileType.startsWith('SPC-ref_plan-')
        ? fileType.slice('SPC-ref_plan-'.length)
        : null;
      const shotId = shotIdFromMeta ?? shotIdFromType ?? null;
      const critic = criticByPlanId.get(p.id) ?? null;
      return {
        id: p.id,
        filename: p.filename,
        fileType,
        status: p.status,
        version: p.version,
        shotId,
        description: p.description,
        criticVerdict: critic?.verdict ?? null,
        criticFailedCount: critic?.failedCount ?? null,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
      };
    });
    return ok(
      { episodeId, count: plans.length, plans },
      `${plans.length} Plan(s) for episode`,
    );
  },
};

// ── getCriticVerdict ─────────────────────────────────────────────────────────

interface GetCriticVerdictArgs {
  planAssetId: string;
}

export const getCriticVerdict: Tool<GetCriticVerdictArgs> = {
  name: 'getCriticVerdict',
  description:
    "Fetch the Designer's Critic (REV-ref_plan) verdict for a given Plan asset. Returns verdict (PASS/REVISE/FAIL), failed V01-V09 checks, and acceptance criteria. Read-only. Use when the Director asks 'что сказал критик про этот план?' or 'why was the Plan rejected?'.",
  mutating: false,
  schema: {
    type: 'function',
    function: {
      name: 'getCriticVerdict',
      description: "Read the Critic's verdict for a given SPC-ref_plan.",
      parameters: {
        type: 'object',
        properties: {
          planAssetId: { type: 'string', description: 'Plan asset UUID.' },
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
      .select('episode_id,filename')
      .eq('id', args.planAssetId)
      .maybeSingle();
    if (!planRow) return fail(`Plan ${args.planAssetId} not found`, 'not_found');
    const episodeId = (planRow as { episode_id?: string | null }).episode_id;
    if (!episodeId) return fail('Plan has no episode_id', 'no_episode');

    const { data, error } = await ctx.supabase
      .from('assets')
      .select('id,filename,status,content,metadata,created_at')
      .eq('episode_id', episodeId)
      .eq('file_type', 'REV-ref_plan')
      .order('created_at', { ascending: false });
    if (error) return fail(`Critic lookup failed: ${error.message}`);

    const match = (data ?? []).find((row) => {
      const meta = (row as { metadata?: unknown }).metadata as
        | { plan_asset_id?: unknown }
        | null;
      return typeof meta?.plan_asset_id === 'string' && meta.plan_asset_id === args.planAssetId;
    });
    if (!match) {
      return ok(
        { planAssetId: args.planAssetId, hasVerdict: false },
        `No Critic verdict yet for Plan ${(planRow as { filename?: string }).filename ?? args.planAssetId}`,
      );
    }
    const meta = (match as { metadata?: unknown }).metadata as Record<string, unknown> | null;
    const verdict = typeof meta?.verdict === 'string' ? meta.verdict : 'UNKNOWN';
    const failedChecks = Array.isArray(meta?.failed_checks) ? meta.failed_checks : [];
    const acceptanceCriteria = Array.isArray(meta?.acceptance_criteria)
      ? meta.acceptance_criteria
      : [];
    const passedChecks = Array.isArray(meta?.passed_checks) ? meta.passed_checks : [];
    return ok(
      {
        planAssetId: args.planAssetId,
        criticAssetId: match.id,
        criticFilename: match.filename,
        verdict,
        failedChecks,
        passedChecks,
        acceptanceCriteria,
        narrative: match.content,
        createdAt: match.created_at,
      },
      `Critic verdict: ${verdict}`,
    );
  },
};

// ── regenerateRefPlan (mutating) ─────────────────────────────────────────────

interface RegenerateRefPlanArgs {
  shotId: string;
  episodeId?: string;
  revisionNote?: string;
}

export const regenerateRefPlan: Tool<RegenerateRefPlanArgs> = {
  name: 'regenerateRefPlan',
  description:
    "Re-fire the Designer for one shot to produce a new SPC-ref_plan version. Use when the Director wants different direction without waiting for the Critic to REVISE. Optionally pass a revisionNote — Designer treats it as a hard contract. Verbal approval required.",
  mutating: true,
  schema: {
    type: 'function',
    function: {
      name: 'regenerateRefPlan',
      description: 'Re-fire EXEC-EREF-DESIGNER for one shot. Verbal approval required.',
      parameters: {
        type: 'object',
        properties: {
          shotId: { type: 'string', description: 'Storyboard shot id.' },
          episodeId: {
            type: 'string',
            description: 'Episode UUID. Omit to use active conversation episode.',
          },
          revisionNote: {
            type: 'string',
            description: "Optional hard-contract note. Quote the Director's spoken concern.",
            maxLength: 2000,
          },
        },
        required: ['shotId'],
        additionalProperties: false,
      },
    },
  },
  parse(raw) {
    const obj = safeParse(raw);
    const shotId = typeof obj.shotId === 'string' ? obj.shotId : '';
    if (!shotId) throw new Error('shotId is required');
    return {
      shotId,
      episodeId: typeof obj.episodeId === 'string' ? obj.episodeId : undefined,
      revisionNote: typeof obj.revisionNote === 'string' ? obj.revisionNote : undefined,
    };
  },
  async execute(args, ctx): Promise<ToolResult> {
    const episodeId = args.episodeId ?? ctx.episodeId;
    if (!episodeId) {
      return fail('episodeId required — no active episode.');
    }
    const approval = checkVerbalApproval(ctx.recentTurns ?? []);
    if (!approval.approved) {
      return fail(approval.reason, 'verbal_approval_required');
    }

    // Forward to the existing trigger route — the Designer event is registered
    // and idempotent. We use the typed trigger handler instead of poking
    // Inngest directly so the audit row + activity event land as usual.
    const url = new URL(
      `/api/episodes/${encodeURIComponent(episodeId)}/trigger`,
      ctx.appOrigin,
    );
    const resp = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(ctx.cookieHeader ? { cookie: ctx.cookieHeader } : {}),
      },
      body: JSON.stringify({
        agentCode: 'EXEC-EREF-DESIGNER',
        reason: `[Prod Assistant] regenerate Plan for shot ${args.shotId} — ${approval.reason}`,
        payload: {
          shotId: args.shotId,
          ...(args.revisionNote ? { revisionNote: args.revisionNote } : {}),
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
      return fail(
        `trigger failed: HTTP ${resp.status} ${typeof body === 'object' ? JSON.stringify(body) : ''}`,
      );
    }
    return ok(body, `Designer re-fired for shot ${args.shotId}`);
  },
};

// ── helpers ──────────────────────────────────────────────────────────────────

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
