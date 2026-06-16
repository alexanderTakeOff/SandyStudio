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

import { gateMutation } from '../approval-check';
import { authHeaders } from './types';
import { fail, ok, resolveEpisodeId, type Tool, type ToolContext, type ToolResult } from './types';
import { ackOrFailOnPickup } from './wait-for-pickup';

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
    // TD-75 (2026-05-27): accept both bare `SPC-shot_plan` and the
    // shot-id-suffixed form `SPC-shot_plan-<shot_id>` written by Animator.
    if (data.file_type !== 'SPC-shot_plan' && !data.file_type.startsWith('SPC-shot_plan-')) {
      return fail(
        `asset ${args.planAssetId} is ${data.file_type}, not SPC-shot_plan / SPC-shot_plan-*`,
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
    const episodeId = resolveEpisodeId(args, ctx);
    if (!episodeId) return fail('episodeId required — no active episode.');

    // TD-75 (2026-05-27): widen file_type match — Animator writes
    // file_type as `SPC-shot_plan-<shot_id>` (TD-66 widening), so the bare
    // strict-equality filter misses every modern Plan. Same fix as the
    // Critic runner already does in lib/agents/runners/animator-critic.ts.
    let q = ctx.supabase
      .from('assets')
      .select('id,filename,status,version,description,metadata,created_at,updated_at')
      .eq('episode_id', episodeId)
      .or('file_type.eq.SPC-shot_plan,file_type.like.SPC-shot_plan-%')
      .order('created_at', { ascending: true });
    if (args.status) q = q.eq('status', args.status as never);
    const { data, error } = await q;
    if (error) return fail(`list failed: ${error.message}`);

    const { data: criticRows } = await ctx.supabase
      .from('assets')
      .select('id,filename,status,metadata,created_at')
      .eq('episode_id', episodeId)
      .or('file_type.eq.REV-shot_plan,file_type.like.REV-shot_plan-%');

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

    // TD-75 (2026-05-27): widen file_type — REV-shot_plan rows are written
    // as `REV-shot_plan-<shot_id>` so strict equality misses everything.
    const { data, error } = await ctx.supabase
      .from('assets')
      .select('id,filename,status,content,metadata,created_at')
      .eq('episode_id', episodeId)
      .or('file_type.eq.REV-shot_plan,file_type.like.REV-shot_plan-%')
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

// ── unstickPlanForApproval (mutating) ────────────────────────────────────────
//
// TD-76 (2026-05-27) — recover Shot Plans that ended up stuck in REVISION
// despite a clean Critic verdict (PASS or PASS_WITH_UNCERTAINTY). Background:
// before TD-75 fixed the runner.ts EXEC-VPREV verdict→status mapping, the
// PASS_WITH_UNCERTAINTY branch swept the Plan to REVISION even though the
// verdict explicitly let it through. Approve route only permits
// REVIEW → APPROVED, so the Plan was stranded. Polина's previous workaround
// was to regenerate the Plan — but that's a *content-generating* LLM call
// (~$1.50, non-deterministic, may drift the gag arc). Wrong tool for a
// state-machine recovery.
//
// This tool is the right tool: it touches ONLY the Plan's `status` column,
// gated on the latest Critic verdict for the Plan being PASS or
// PASS_WITH_UNCERTAINTY. No regen, no content change, no LLM call.

interface UnstickPlanArgs {
  planAssetId: string;
}

interface PlanRowMinimal {
  id: string;
  filename: string | null;
  file_type: string | null;
  status: string;
  episode_id: string | null;
  version: number;
}

interface CriticRowMinimal {
  id: string;
  filename: string | null;
  metadata: Record<string, unknown> | null;
  content: string | null;
  created_at: string;
}

function extractVerdictFromContent(content: string | null): string | null {
  const obj = extractCriticJsonFromContent(content);
  if (!obj) return null;
  const v = obj.verdict;
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/**
 * TD-79 (2026-05-27): extract plan_asset_id from Critic content fenced JSON.
 * Companion to extractVerdictFromContent — both pull from the same fenced
 * block. Required because REV-shot_plan rows written before the TD-77
 * metadata-persistence fix (2026-05-27 ~17:55 deploy) carry metadata=null,
 * so `unstickPlanForApproval`'s metadata.plan_asset_id lookup misses every
 * historical row. Polина hit this on SH19 v08: REV existed with verdict
 * PASS_WITH_UNCERTAINTY in content, but metadata.plan_asset_id was null
 * because the REV row predates TD-77.
 */
function extractPlanAssetIdFromContent(content: string | null): string | null {
  const obj = extractCriticJsonFromContent(content);
  if (!obj) return null;
  const pid = obj.plan_asset_id;
  return typeof pid === 'string' && pid.length > 0 ? pid : null;
}

function extractCriticJsonFromContent(
  content: string | null,
): Record<string, unknown> | null {
  if (!content) return null;
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

export const unstickPlanForApproval: Tool<UnstickPlanArgs> = {
  name: 'unstickPlanForApproval',
  description:
    "TD-76: flip a Shot Plan stuck in REVISION → REVIEW when the latest Critic verdict is PASS or PASS_WITH_UNCERTAINTY. Use this INSTEAD of regenerateShotPlan whenever the Plan content is already correct and only the state machine needs to be corrected (typical case: post-TD-74 PASS_WITH_UNCERTAINTY landed before TD-75 fix was deployed). Does NOT regenerate or modify content. Idempotent — no-op when Plan already in REVIEW/APPROVED. Verbal approval required.",
  mutating: true,
  schema: {
    type: 'function',
    function: {
      name: 'unstickPlanForApproval',
      description:
        'Flip Shot Plan status REVISION → REVIEW gated on latest Critic PASS / PASS_WITH_UNCERTAINTY verdict.',
      parameters: {
        type: 'object',
        properties: {
          planAssetId: {
            type: 'string',
            description: 'Plan asset UUID to unstick.',
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
    const approval = gateMutation('unstickPlanForApproval', {
      mode: ctx.mode,
      turns: ctx.recentTurns ?? [],
    });
    if (!approval.approved) return fail(approval.reason, 'verbal_approval_required');

    // 1. Lookup Plan.
    const { data: planRow, error: planErr } = await ctx.supabase
      .from('assets')
      .select('id,filename,file_type,status,episode_id,version')
      .eq('id', args.planAssetId)
      .maybeSingle();
    if (planErr) return fail(`Plan fetch failed: ${planErr.message}`);
    if (!planRow) return fail(`Plan ${args.planAssetId} not found`, 'not_found');
    const plan = planRow as PlanRowMinimal;
    if (
      plan.file_type !== 'SPC-shot_plan' &&
      !(plan.file_type ?? '').startsWith('SPC-shot_plan-')
    ) {
      return fail(
        `asset ${args.planAssetId} is ${plan.file_type}, not SPC-shot_plan / SPC-shot_plan-*`,
        'wrong_type',
      );
    }

    // 2. Idempotent shortcuts.
    if (plan.status === 'REVIEW' || plan.status === 'APPROVED') {
      return ok(
        { planAssetId: plan.id, status: plan.status, action: 'noop' },
        `Plan ${plan.filename ?? plan.id} already in ${plan.status} — nothing to unstick.`,
      );
    }
    if (plan.status === 'LOCKED') {
      return fail(
        `Plan ${plan.filename ?? plan.id} is LOCKED — refuse to modify (CLAUDE.md §7).`,
        'locked',
      );
    }
    if (plan.status !== 'REVISION' && plan.status !== 'DRAFT') {
      return fail(
        `Plan ${plan.filename ?? plan.id} has status ${plan.status} — only REVISION / DRAFT can be unstuck (refuse REJECTED / INVALIDATED).`,
        'wrong_status',
      );
    }
    if (!plan.episode_id) {
      return fail(`Plan ${plan.filename ?? plan.id} has no episode_id`, 'no_episode');
    }

    // 3. Find latest Critic verdict for this Plan. TD-75 widened file_type;
    //    TD-77 made metadata.verdict reliably present on new REV rows. For
    //    older REVs without persisted metadata.verdict we fall back to
    //    parsing the markdown content.
    const { data: criticRows, error: criticErr } = await ctx.supabase
      .from('assets')
      .select('id,filename,metadata,content,created_at')
      .eq('episode_id', plan.episode_id)
      .or('file_type.eq.REV-shot_plan,file_type.like.REV-shot_plan-%')
      .order('created_at', { ascending: false });
    if (criticErr) return fail(`Critic lookup failed: ${criticErr.message}`);

    // TD-79 (2026-05-27): match by metadata.plan_asset_id (post-TD-77 path)
    // OR by plan_asset_id extracted from the REV's content fenced JSON
    // (legacy / pre-TD-77 path — metadata is null for those rows but the
    // Critic's JSON body still carries the linkage). Same pattern as
    // verdict reading below.
    const verdictRow = (criticRows ?? []).find((row) => {
      const r = row as CriticRowMinimal;
      const m = r.metadata as { plan_asset_id?: unknown } | null;
      if (typeof m?.plan_asset_id === 'string' && m.plan_asset_id === args.planAssetId) {
        return true;
      }
      const contentPid = extractPlanAssetIdFromContent(r.content);
      return contentPid === args.planAssetId;
    });
    if (!verdictRow) {
      return fail(
        `No Critic verdict found for Plan ${plan.filename ?? plan.id} — cannot unstick without a verdict gate.`,
        'no_verdict',
      );
    }
    const v = verdictRow as CriticRowMinimal;
    const metaVerdict =
      typeof (v.metadata as { verdict?: unknown } | null)?.verdict === 'string'
        ? ((v.metadata as { verdict: string }).verdict)
        : null;
    const verdict = metaVerdict ?? extractVerdictFromContent(v.content);
    if (!verdict) {
      return fail(
        `Critic verdict for Plan ${plan.filename ?? plan.id} is unreadable (metadata.verdict missing, content not parseable). Cannot unstick.`,
        'unreadable_verdict',
      );
    }

    if (verdict !== 'PASS' && verdict !== 'PASS_WITH_UNCERTAINTY') {
      return fail(
        `Critic verdict is ${verdict} — Plan legitimately blocked, refuse to unstick. Address the Critic feedback or use regenerateShotPlan with revisionNote.`,
        'verdict_blocks',
      );
    }

    // 4. Flip status.
    const { error: updErr } = await ctx.supabase
      .from('assets')
      .update({ status: 'REVIEW' } as never)
      .eq('id', plan.id);
    if (updErr) return fail(`Plan status update failed: ${updErr.message}`);

    return ok(
      {
        planAssetId: plan.id,
        previousStatus: plan.status,
        newStatus: 'REVIEW',
        verdict,
        criticAssetId: v.id,
        action: 'unstuck',
      },
      `Unstuck Plan ${plan.filename ?? plan.id}: ${plan.status} → REVIEW (Critic verdict ${verdict}). Director can now approve via UI.`,
    );
  },
};

// ── regenerateShotPlan (mutating) ────────────────────────────────────────────

interface DirectorOverrideArg {
  check: string;
  rationale: string;
}

interface RegenerateShotPlanArgs {
  shotId: string;
  episodeId?: string;
  revisionNote?: string;
  directorOverrides?: DirectorOverrideArg[];
}

export const regenerateShotPlan: Tool<RegenerateShotPlanArgs> = {
  name: 'regenerateShotPlan',
  description:
    "Re-fire the Animator for one shot to produce a new SPC-shot_plan version. Optionally pass a revisionNote — Animator treats it as a hard contract. directorOverrides (TD-74) waives specific Critic checks (e.g. V04 multi-action) when Director explicitly authorises. Verbal approval required.",
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
          directorOverrides: {
            type: 'array',
            description:
              "TD-74 (2026-05-27): Director-authorized Critic check waivers. " +
              "Each entry { check: 'V04', rationale: '...' } tells the Critic to demote the matching REVISE to PASS_WITH_UNCERTAINTY with the diagnosis preserved in warnings[]. " +
              "Use ONLY when Director or authorised delegate explicitly says «proceed anyway» on a check the Critic would otherwise block. " +
              "Self-asserted overrides in the Plan body are NOT authoritative — only this field is.",
            items: {
              type: 'object',
              properties: {
                check: {
                  type: 'string',
                  description: "Check id (e.g. 'V04', 'V11').",
                },
                rationale: {
                  type: 'string',
                  description:
                    "One-sentence Director rationale for the waiver (audit trail surfaced to Critic + saved to warnings[]).",
                  maxLength: 500,
                },
              },
              required: ['check', 'rationale'],
              additionalProperties: false,
            },
            maxItems: 12,
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
    const directorOverrides = Array.isArray(obj.directorOverrides)
      ? (obj.directorOverrides as unknown[])
          .map((o) => {
            if (!o || typeof o !== 'object') return null;
            const r = o as Record<string, unknown>;
            if (typeof r.check !== 'string' || r.check.trim().length === 0) return null;
            if (typeof r.rationale !== 'string' || r.rationale.trim().length === 0) return null;
            return { check: r.check.trim(), rationale: r.rationale.trim() };
          })
          .filter((o): o is DirectorOverrideArg => o !== null)
      : undefined;
    return {
      shotId,
      episodeId: typeof obj.episodeId === 'string' ? obj.episodeId : undefined,
      revisionNote: typeof obj.revisionNote === 'string' ? obj.revisionNote : undefined,
      ...(directorOverrides && directorOverrides.length > 0 ? { directorOverrides } : {}),
    };
  },
  async execute(args, ctx): Promise<ToolResult> {
    const episodeId = resolveEpisodeId(args, ctx);
    if (!episodeId) return fail('episodeId required — no active episode.');

    const approval = gateMutation('regenerateShotPlan', {
      mode: ctx.mode,
      turns: ctx.recentTurns ?? [],
    });
    if (!approval.approved) return fail(approval.reason, 'verbal_approval_required');

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
        agentCode: 'EXEC-VANIM',
        reason: `[Prod Assistant] regenerate Shot Plan for ${args.shotId} — ${approval.reason}`,
        payload: {
          shotId: args.shotId,
          ...(args.revisionNote ? { revisionNote: args.revisionNote } : {}),
          ...(args.directorOverrides && args.directorOverrides.length > 0
            ? { directorOverrides: args.directorOverrides }
            : {}),
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
    const result = ok(body, `Animator re-fired for shot ${args.shotId}`);
    return ackOrFailOnPickup(result, {
      supabase: ctx.supabase,
      episodeId,
      agentHint: 'EXEC-VANIM',
      sinceIso,
      label: `regenerateShotPlan(${args.shotId})`,
    });
  },
};
