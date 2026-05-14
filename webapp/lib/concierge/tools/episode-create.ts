// ──────────────────────────────────────────────────────────────────────────────
// lib/concierge/tools/episode-create.ts
// Create a new episode + find one by code. Used by the new-episode-from-scratch
// flow where the Director dictates premise and metadata via voice.
// ──────────────────────────────────────────────────────────────────────────────

import { checkVerbalApproval } from '../approval-check';
import { fail, ok, type Tool, type ToolContext, type ToolResult } from './types';

type AnyArgs = Record<string, unknown>;

interface CreateEpisodeArgs {
  seriesId: string;
  episodeCode: string;
  titleWorking: string;
  premise: string;
  targetRuntimeSeconds?: number;
  governanceMode?: 1 | 2 | 3 | 4;
}

export const createEpisode: Tool<CreateEpisodeArgs> = {
  name: 'createEpisode',
  description:
    "Create a new episode in a series. Required: seriesId (UUID — call listSeries first to find it), episodeCode (E01..E999 format), titleWorking (working title, 1-80 chars), premise (20-500 chars logline). Optional: targetRuntimeSeconds (5-300, default 60), governanceMode (1=manual default, 2 hybrid, 3 delegated, 4 autotest). Verbal approval required.",
  mutating: true,
  schema: {
    type: 'function',
    function: {
      name: 'createEpisode',
      description: 'Create a new episode under a series. Verbal approval required.',
      parameters: {
        type: 'object',
        properties: {
          seriesId: { type: 'string', description: 'Series UUID from listSeries.' },
          episodeCode: { type: 'string', description: 'Episode code like E01, E02, E10.', pattern: '^E[0-9]{1,3}$' },
          titleWorking: { type: 'string', minLength: 1, maxLength: 80 },
          premise: { type: 'string', minLength: 20, maxLength: 500 },
          targetRuntimeSeconds: { type: 'integer', minimum: 5, maximum: 300 },
          governanceMode: { type: 'integer', enum: [1, 2, 3, 4] },
        },
        required: ['seriesId', 'episodeCode', 'titleWorking', 'premise'],
        additionalProperties: false,
      },
    },
  },
  parse(raw) {
    const obj = safeParse(raw);
    const seriesId = str(obj.seriesId);
    const episodeCode = str(obj.episodeCode);
    const titleWorking = str(obj.titleWorking);
    const premise = str(obj.premise);
    if (!seriesId) throw new Error('seriesId is required');
    if (!/^E[0-9]{1,3}$/.test(episodeCode)) throw new Error('episodeCode must match /^E[0-9]{1,3}$/');
    if (titleWorking.length < 1 || titleWorking.length > 80) throw new Error('titleWorking must be 1-80 chars');
    if (premise.length < 20 || premise.length > 500) throw new Error('premise must be 20-500 chars');
    const target = typeof obj.targetRuntimeSeconds === 'number' ? Math.floor(obj.targetRuntimeSeconds) : undefined;
    if (target !== undefined && (target < 5 || target > 300)) throw new Error('targetRuntimeSeconds must be 5-300');
    const mode = obj.governanceMode;
    const governanceMode = mode === 1 || mode === 2 || mode === 3 || mode === 4 ? mode : undefined;
    return { seriesId, episodeCode, titleWorking, premise, targetRuntimeSeconds: target, governanceMode };
  },
  async execute(args, ctx): Promise<ToolResult> {
    const approval = checkVerbalApproval(ctx.recentTurns ?? []);
    if (!approval.approved) {
      return fail(approval.reason, 'verbal_approval_required');
    }
    const body: Record<string, unknown> = {
      series_id: args.seriesId,
      episode_code: args.episodeCode,
      title_working: args.titleWorking,
      premise: args.premise,
    };
    if (args.targetRuntimeSeconds !== undefined) body.target_runtime_seconds = args.targetRuntimeSeconds;
    if (args.governanceMode !== undefined) body.governance_mode = args.governanceMode;

    const resp = await fetch(`${ctx.appOrigin.replace(/\/$/, '')}/api/episodes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(ctx.cookieHeader ? { Cookie: ctx.cookieHeader } : {}),
      },
      body: JSON.stringify(body),
    });
    let payload: unknown = null;
    try { payload = await resp.json(); } catch { /* */ }
    if (!resp.ok) {
      const message =
        payload && typeof payload === 'object' && 'error' in payload
          ? String((payload as { error: unknown }).error)
          : `createEpisode failed (HTTP ${resp.status})`;
      return fail(message, `http_${resp.status}`);
    }
    return ok(payload, `Episode ${args.episodeCode} "${args.titleWorking}" created. Auto-cascade will start the brief stage.`);
  },
};

interface FindEpisodeArgs {
  query: string;
}

export const findEpisode: Tool<FindEpisodeArgs> = {
  name: 'findEpisode',
  description:
    "Free-text lookup for an episode UUID by code (SS-S14-E01), working title, or any substring. Returns matching episodes with their UUID, code, title, status, and governance_mode. Use when the Director refers to an episode by its human-readable code and you need the UUID to call other tools.",
  mutating: false,
  schema: {
    type: 'function',
    function: {
      name: 'findEpisode',
      description: 'Resolve an episode UUID from a human-readable code or title fragment.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Episode code (SS-S14-E01 / E01), working title, or any substring.',
            minLength: 1,
          },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  parse(raw) {
    const obj = safeParse(raw);
    const query = str(obj.query);
    if (!query) throw new Error('query is required');
    return { query };
  },
  async execute(args, ctx): Promise<ToolResult> {
    const { supabase } = ctx;
    const needle = args.query.trim();

    // Extract a likely episode_code (E01 / SS-S14-E01 → E01) for direct hit first.
    const epCodeMatch = needle.match(/E\d{1,3}/i);
    const epCode = epCodeMatch ? epCodeMatch[0].toUpperCase() : null;

    let q = supabase
      .from('episodes')
      .select('id,episode_code,title_working,series_id,status,governance_mode,created_at')
      .order('created_at', { ascending: false })
      .limit(10);
    if (epCode) {
      q = q.eq('episode_code', epCode);
    } else {
      q = q.ilike('title_working', `%${needle}%`);
    }
    const { data, error } = await q;
    if (error) return fail(`episodes search failed: ${error.message}`);
    const rows = data ?? [];
    if (rows.length === 0) {
      return ok({ matches: [] }, `No episode matches "${needle}".`);
    }
    return ok(
      { matches: rows },
      `${rows.length} match${rows.length === 1 ? '' : 'es'} for "${needle}".`,
    );
  },
};

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function safeParse(raw: string): AnyArgs {
  if (!raw || raw.trim() === '') return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as AnyArgs;
    return {};
  } catch {
    return {};
  }
}

interface EditBriefArgs {
  episodeId?: string;
  content: string;
}

export const editBrief: Tool<EditBriefArgs> = {
  name: 'editBrief',
  description:
    "Overwrite the current episode brief markdown with Director-supplied verbatim text. Targets the latest editable (DRAFT/REVIEW/REVISION) SPC-brief asset for the episode. Use when Director dictates a brief edit — paste / dictate the FULL new brief, not a diff. Verbal approval required. If episodeId omitted, defaults to the episode currently in focus (ctx.episodeId). Refuses when brief is already APPROVED or LOCKED — in that case ask Director to revoke approval first.",
  mutating: true,
  schema: {
    type: 'function',
    function: {
      name: 'editBrief',
      description:
        "Overwrite the latest editable SPC-brief asset for an episode with new markdown content.",
      parameters: {
        type: 'object',
        properties: {
          episodeId: {
            type: 'string',
            description:
              'Episode UUID. Optional — defaults to the episode currently in focus.',
          },
          content: {
            type: 'string',
            description:
              'The full new brief markdown body the Director wants saved verbatim.',
            minLength: 20,
            maxLength: 200000,
          },
        },
        required: ['content'],
        additionalProperties: false,
      },
    },
  },
  parse(raw) {
    const obj = safeParse(raw);
    const episodeId = typeof obj.episodeId === 'string' && obj.episodeId.trim() !== ''
      ? obj.episodeId.trim()
      : undefined;
    const content = typeof obj.content === 'string' ? obj.content : '';
    if (content.length < 20) throw new Error('content too short (min 20 chars)');
    return { episodeId, content };
  },
  async execute(args, ctx): Promise<ToolResult> {
    const approval = checkVerbalApproval(ctx.recentTurns ?? []);
    if (!approval.approved) {
      return fail(approval.reason, 'verbal_approval_required');
    }
    const episodeId = args.episodeId ?? ctx.episodeId ?? null;
    if (!episodeId) {
      return fail(
        'No episode in focus — pass episodeId explicitly or open an episode first.',
        'no_episode_id',
      );
    }

    // Resolve the latest editable SPC-brief asset for this episode.
    const { data: brief, error: briefErr } = await ctx.supabase
      .from('assets')
      .select('id,status,version,filename')
      .eq('episode_id', episodeId)
      .like('file_type', 'SPC-brief%')
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (briefErr) {
      return fail(`brief lookup failed: ${briefErr.message}`, 'db_error');
    }
    if (!brief) {
      return fail(
        `No SPC-brief asset found for episode ${episodeId}.`,
        'brief_missing',
      );
    }
    const EDITABLE_STATUSES = new Set(['DRAFT', 'REVIEW', 'REVISION']);
    if (!EDITABLE_STATUSES.has(brief.status)) {
      return fail(
        `Brief is ${brief.status}, not editable. Ask Director to revoke approval first (requestRevision on the brief).`,
        'not_editable',
      );
    }

    // Overwrite in place via PUT /api/assets/[id]/content — mirrors the
    // setBibleContent overwrite path so audit attribution & status guard
    // stay identical to the manual UI Edit Brief flow.
    const resp = await fetch(
      `${ctx.appOrigin.replace(/\/$/, '')}/api/assets/${encodeURIComponent(brief.id)}/content`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(ctx.cookieHeader ? { Cookie: ctx.cookieHeader } : {}),
        },
        body: JSON.stringify({ content: args.content }),
      },
    );
    let payload: unknown = null;
    try {
      payload = await resp.json();
    } catch {
      /* ignore non-JSON */
    }
    if (!resp.ok) {
      const message =
        payload && typeof payload === 'object' && 'error' in payload
          ? String((payload as { error: unknown }).error)
          : `brief content overwrite failed (HTTP ${resp.status})`;
      return fail(message, `http_${resp.status}`);
    }
    return ok(
      payload,
      `Brief overwritten in place (v${brief.version} ${brief.status}, ${args.content.length} chars). Status preserved — Director still approves via the existing gate.`,
    );
  },
};
