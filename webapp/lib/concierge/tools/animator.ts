// ──────────────────────────────────────────────────────────────────────────────
// lib/concierge/tools/animator.ts
// Prod Assistant tools for the Animator pipeline (Sprint «Дизайнер и
// Аниматор» Day 8.5, 2026-05-19). Mirrors the EREF Day 4.5 tools shape
// but operates on SPC-shot_plan / REV-shot_plan assets.
//
//   - getShotPlan(planAssetId)        → full SPC-shot_plan + JSON body
//   - listShotPlans(episodeId)        → per-episode shot Plans + Critic verdicts
//   - getAnimatorCriticVerdict(planAssetId) → Critic's verdict for given Plan
//   - regenerateShotPlan(shotId)      → MUTATING. Re-fire Animator. Verbal approval.
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

// ── getShotPlan ──────────────────────────────────────────────────────────────

interface GetShotPlanArgs {
  planAssetId: string;
}

export const getShotPlan: Tool<GetShotPlanArgs> = {
  name: 'getShotPlan',
  description:
    "Fetch a single Shot Plan (SPC-shot_plan) asset by id. Returns full markdown + parsed JSON decisions (provider, aspect, duration, prompt, negative, seed, end_image). Read-only.",
  mutating: false,
  schema: {
    type: 'function',
    function: {
      name: 'getShotPlan',
      description: 'Read one SPC-shot_plan asset with parsed JSON body.',
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
    const { data, error } = await ctx.supabase
      .from('assets')
      .select('id,file_type,filename,status,version,episode_id,description,content,metadata,created_at,updated_at')
      .eq('id', args.planAssetId)
      .maybeSingle();
    if (error) return fail(`asset fetch failed: ${error.message}`);
    if (!data) return fail(`Plan ${args.planAssetId} not found`, 'not_found');
    if (data.file_type !== 'SPC-shot_plan') {
      return fail(
        `asset ${args.planAssetId} is ${data.file_type}, not SPC-shot_plan`,
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
      `Shot Plan ${data.filename} (${data.status})`,
    );
  },
};

// ── listShotPlans ────────────────────────────────────────────────────────────

interface ListShotPlansArgs {
  episodeId?: string;
  status?: string;
}

export const listShotPlans: Tool<ListShotPlansArgs> = {
  name: 'listShotPlans',
  description:
    "List every Shot Plan (SPC-shot_plan) for an episode with status + version + linked Animator's Critic verdict. Read-only.",
  mutating: false,
  schema: {
    type: 'function',
    function: {
      name: 'listShotPlans',
      description: 'List per-episode Shot Plans with status and Critic verdicts.',
      parameters: {
        type: 'object',
        properties: {
          episodeId: { type: 'string', description: 'Episode UUID. Omit to use active.' },
          status: { type: 'string', description: 'Optional status filter.' },
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
    if (!episodeId) return fail('episodeId required — no active episode.');

    let q = ctx.supabase
      .from('assets')
      .select('id,filename,status,version,description,metadata,created_at,updated_at')
      .eq('episode_id', episodeId)
      .eq('file_type', 'SPC-shot_plan')
      .order('created_at', { ascending: true });
    if (args.status) q = q.eq('status', args.status as never);
    const { data, error } = await q;
    if (error) return fail(`list failed: ${error.message}`);

    const { data: criticRows } = await ctx.supabase
      .from('assets')
      .select('id,filename,status,metadata,created_at')
      .eq('episode_id', episodeId)
      .eq('file_type', 'REV-shot_plan');

    const criticByPlanId = new Map<
      string,
      { id: string; verdict: string; failedCount: number }
    >();
    for (const row of (criticRows ?? []) as Array<{ id: string; metadata?: unknown }>) {
      const meta = row.metadata as
        | { plan_asset_id?: unknown; verdict?: unknown; failed_checks?: unknown }
        | null;
      const planId =
        typeof meta?.plan_asset_id === 'string' ? meta.plan_asset_id : null;
      const verdict = typeof meta?.verdict === 'string' ? meta.verdict : 'UNKNOWN';
      const failedCount = Array.isArray(meta?.failed_checks)
        ? (meta.failed_checks as unknown[]).length
        : 0;
      if (planId) criticByPlanId.set(planId, { id: row.id, verdict, failedCount });
    }

    const plans = (data ?? []).map((p) => {
      const meta = p.metadata as { shot_id?: unknown } | null;
      const shotId = typeof meta?.shot_id === 'string' ? meta.shot_id : null;
      const critic = criticByPlanId.get(p.id) ?? null;
      return {
        id: p.id,
        filename: p.filename,
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
      `${plans.length} Shot Plan(s) for episode`,
    );
  },
};

// ── getAnimatorCriticVerdict ─────────────────────────────────────────────────

interface GetVprevArgs {
  planAssetId: string;
}

export const getAnimatorCriticVerdict: Tool<GetVprevArgs> = {
  name: 'getAnimatorCriticVerdict',
  description:
    "Fetch the Animator's Critic (REV-shot_plan) verdict for a given Shot Plan. Returns verdict (PASS/REVISE/FAIL), failed V01-V09 checks, and acceptance criteria. Read-only.",
  mutating: false,
  schema: {
    type: 'function',
    function: {
      name: 'getAnimatorCriticVerdict',
      description: "Read the Animator's Critic verdict for a given SPC-shot_plan.",
      parameters: {
        type: 'object',
        properties: {
          planAssetId: { type: 'string', description: 'Shot Plan asset UUID.' },
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
      .eq('file_type', 'REV-shot_plan')
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
        `No Animator's Critic verdict yet for ${(planRow as { filename?: string }).filename ?? args.planAssetId}`,
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
      `Animator's Critic verdict: ${verdict}`,
    );
  },
};

// ── regenerateShotPlan (mutating) ────────────────────────────────────────────

interface RegenerateShotPlanArgs {
  shotId: string;
  episodeId?: string;
  revisionNote?: string;
}

export const regenerateShotPlan: Tool<RegenerateShotPlanArgs> = {
  name: 'regenerateShotPlan',
  description:
    "Re-fire the Animator for one shot to produce a new SPC-shot_plan version. Optionally pass a revisionNote — Animator treats it as a hard contract. Verbal approval required.",
  mutating: true,
  schema: {
    type: 'function',
    function: {
      name: 'regenerateShotPlan',
      description: 'Re-fire EXEC-VANIM for one shot. Verbal approval required.',
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
            description: "Optional hard-contract note.",
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
    if (!episodeId) return fail('episodeId required — no active episode.');

    const approval = checkVerbalApproval(ctx.recentTurns ?? []);
    if (!approval.approved) return fail(approval.reason, 'verbal_approval_required');

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
        agentCode: 'EXEC-VANIM',
        reason: `[Prod Assistant] regenerate Shot Plan for ${args.shotId} — ${approval.reason}`,
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
      /* */
    }
    if (!resp.ok) {
      return fail(
        `trigger failed: HTTP ${resp.status} ${typeof body === 'object' ? JSON.stringify(body) : ''}`,
      );
    }
    return ok(body, `Animator re-fired for shot ${args.shotId}`);
  },
};
