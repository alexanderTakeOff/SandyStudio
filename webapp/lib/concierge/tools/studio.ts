// ──────────────────────────────────────────────────────────────────────────────
// lib/concierge/tools/studio.ts
// Read-only tools for studio context.
// ──────────────────────────────────────────────────────────────────────────────

import { fail, ok, type Tool, type ToolContext, type ToolResult } from './types';

type AnyArgs = Record<string, unknown>;

interface GetStudioStatusArgs {
  /** Optional cap on returned episode count (default 6, max 20). */
  episodeLimit?: number;
}

export const getStudioStatus: Tool<GetStudioStatusArgs> = {
  name: 'getStudioStatus',
  description:
    "Get a summary of the studio's current state: recent episodes with their pipeline status and governance mode, count of items awaiting Director approval, last few activity events. Use this when the Director asks 'what is happening' or to orient yourself at the start of a conversation.",
  mutating: false,
  schema: {
    type: 'function',
    function: {
      name: 'getStudioStatus',
      description:
        'Summary of recent episodes, pending approvals count, and last activity. Read-only.',
      parameters: {
        type: 'object',
        properties: {
          episodeLimit: {
            type: 'integer',
            description: 'Cap on returned episode count (default 6, max 20).',
            minimum: 1,
            maximum: 20,
          },
        },
        additionalProperties: false,
      },
    },
  },
  parse(raw) {
    const obj = safeParse(raw);
    const limit = typeof obj.episodeLimit === 'number'
      ? Math.min(20, Math.max(1, Math.floor(obj.episodeLimit)))
      : undefined;
    return { episodeLimit: limit };
  },
  async execute(args, ctx): Promise<ToolResult> {
    const limit = args.episodeLimit ?? 6;
    const { supabase } = ctx;
    try {
      const [episodesRes, pendingRes, activityRes] = await Promise.all([
        supabase
          .from('episodes')
          .select('id,episode_code,title_working,status,governance_mode,created_at,updated_at')
          .order('created_at', { ascending: false })
          .limit(limit),
        supabase
          .from('assets')
          .select('id,episode_id,file_type,filename,status')
          .eq('status', 'REVIEW'),
        supabase
          .from('activity_events')
          .select('id,event_type,title,actor,episode_id,severity,created_at')
          .order('created_at', { ascending: false })
          .limit(5),
      ]);

      if (episodesRes.error) return fail(`episodes fetch failed: ${episodesRes.error.message}`);
      if (pendingRes.error)  return fail(`assets fetch failed: ${pendingRes.error.message}`);
      if (activityRes.error) return fail(`activity fetch failed: ${activityRes.error.message}`);

      const episodes = (episodesRes.data ?? []).map((e) => ({
        id: e.id,
        episode_code: e.episode_code,
        title_working: e.title_working,
        status: e.status,
        governance_mode: e.governance_mode,
      }));
      const pending = (pendingRes.data ?? []).map((a) => ({
        asset_id: a.id,
        episode_id: a.episode_id,
        file_type: a.file_type,
        filename: a.filename,
      }));
      const activity = (activityRes.data ?? []).map((a) => ({
        type: a.event_type,
        title: a.title,
        actor: a.actor,
        episode_id: a.episode_id,
        severity: a.severity,
        when: a.created_at,
      }));

      const summary = `Studio status: ${episodes.length} recent episodes, ${pending.length} item${pending.length === 1 ? '' : 's'} awaiting your approval.`;

      return ok(
        {
          episodes,
          pending_approvals_count: pending.length,
          pending_approvals: pending.slice(0, 10),
          recent_activity: activity,
        },
        summary,
      );
    } catch (err) {
      return fail(err instanceof Error ? err.message : 'unknown error');
    }
  },
};

interface GetEpisodeArgs {
  episodeId?: string;
}

export const getEpisode: Tool<GetEpisodeArgs> = {
  name: 'getEpisode',
  description:
    "Get full state for one episode: pipeline stages with their current state (idle / running / approved / blocked / failed), counts of approved / review / total assets per stage, and the active governance mode. If episodeId is omitted, uses the active episode from the conversation context.",
  mutating: false,
  schema: {
    type: 'function',
    function: {
      name: 'getEpisode',
      description: 'Full per-stage state for one episode.',
      parameters: {
        type: 'object',
        properties: {
          episodeId: {
            type: 'string',
            description: 'UUID of the episode. Omit to use the active conversation episode.',
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
    const episodeId = args.episodeId ?? ctx.episodeId ?? null;
    if (!episodeId) {
      return fail(
        'episodeId is required — no active episode in conversation context. Ask the Director which episode they mean and call again with episodeId.',
      );
    }
    const { supabase } = ctx;

    const [epRes, assetsRes, jobsRes] = await Promise.all([
      supabase.from('episodes').select('*').eq('id', episodeId).maybeSingle(),
      supabase
        .from('assets')
        .select('id,filename,file_type,status,agent_id,created_at')
        .eq('episode_id', episodeId),
      supabase
        .from('jobs')
        .select('id,agent_id,status')
        .eq('episode_id', episodeId),
    ]);

    if (epRes.error)     return fail(`episode fetch failed: ${epRes.error.message}`);
    if (!epRes.data)     return fail(`episode ${episodeId} not found`);
    if (assetsRes.error) return fail(`assets fetch failed: ${assetsRes.error.message}`);
    if (jobsRes.error)   return fail(`jobs fetch failed: ${jobsRes.error.message}`);

    const { buildPipelineSnapshot } = await import('@/lib/api/pipeline-stages');
    const snapshot = buildPipelineSnapshot(
      String(epRes.data.status ?? ''),
      assetsRes.data ?? [],
      jobsRes.data ?? [],
    );

    const ep = epRes.data;
    return ok(
      {
        episode: {
          id: ep.id,
          episode_code: ep.episode_code,
          title_working: ep.title_working,
          status: ep.status,
          governance_mode: ep.governance_mode,
        },
        stages: snapshot.map((s) => ({
          id: s.id,
          label: s.label,
          state: s.state,
          phase: s.phase,
          assets_in_review: s.assets_in_review ?? 0,
        })),
      },
      `Episode ${ep.episode_code ?? ep.id}: status=${ep.status}, mode=${ep.governance_mode}.`,
    );
  },
};

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
