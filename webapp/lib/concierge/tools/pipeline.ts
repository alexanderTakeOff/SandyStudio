// ──────────────────────────────────────────────────────────────────────────────
// lib/concierge/tools/pipeline.ts
// Pipeline-awareness tools — what's next, what's stuck, what needs approval.
// ──────────────────────────────────────────────────────────────────────────────

import { buildPipelineSnapshot, type PipelineStageSnapshot } from '@/lib/api/pipeline-stages';
import { fail, ok, resolveEpisodeId, type Tool, type ToolContext, type ToolResult } from './types';

type AnyArgs = Record<string, unknown>;

interface GetNextGateArgs {
  episodeId?: string;
}

/**
 * "What should I focus on next for this episode?"
 *
 * Walks the pipeline snapshot in order and returns the first stage that
 * either has a pending REVIEW asset (Director gate) or is idle/blocked
 * upstream. Critical for the Prod Assistant's leader behavior — it should
 * call this at the start of every operational turn.
 */
export const getNextGate: Tool<GetNextGateArgs> = {
  name: 'getNextGate',
  description:
    "Find the next actionable gate in the episode pipeline: the first REVIEW asset awaiting Director approval, or the first idle/blocked stage that needs to be kicked off. Call this whenever the Director asks 'what's next?' or before proposing the next step. If episodeId is omitted, uses the active conversation episode.",
  mutating: false,
  schema: {
    type: 'function',
    function: {
      name: 'getNextGate',
      description: 'Find the next actionable pipeline gate for one episode.',
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
    const episodeId = resolveEpisodeId(args, ctx);
    if (!episodeId) {
      return fail(
        'episodeId is required — no active episode in conversation context.',
      );
    }
    const { supabase } = ctx;

    const [epRes, assetsRes, jobsRes] = await Promise.all([
      supabase.from('episodes').select('id,status,episode_code,governance_mode').eq('id', episodeId).maybeSingle(),
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

    const snapshot = buildPipelineSnapshot(
      String(epRes.data.status ?? ''),
      assetsRes.data ?? [],
      jobsRes.data ?? [],
    );

    // Priority order: blocked > failed > running > idle.
    // 'blocked' means there's a REVIEW asset waiting for Director approval —
    // that's the gate. 'failed' is a stuck error needing intervention.
    const blocked = snapshot.find((s) => s.state === 'blocked');
    const failed = snapshot.find((s) => s.state === 'failed');
    const running = snapshot.find((s) => s.state === 'running');
    const firstIdle = snapshot.find((s) => s.state === 'idle');

    if (blocked) {
      const pendingAssets = (assetsRes.data ?? [])
        .filter((a) => a.status === 'REVIEW')
        .filter((a) => stageOf(a.file_type) === blocked.id)
        .map((a) => ({ asset_id: a.id, filename: a.filename, file_type: a.file_type }));
      return ok(
        {
          kind: 'approval_required',
          stage: stageSummary(blocked),
          pending_assets: pendingAssets,
          episode_status: epRes.data.status,
          governance_mode: epRes.data.governance_mode,
        },
        `${blocked.label} has ${pendingAssets.length} item(s) awaiting your approval.`,
      );
    }
    if (failed) {
      return ok(
        {
          kind: 'failed_stage',
          stage: stageSummary(failed),
          episode_status: epRes.data.status,
        },
        `${failed.label} has a failed job — re-trigger or investigate.`,
      );
    }
    if (running) {
      return ok(
        {
          kind: 'in_progress',
          stage: stageSummary(running),
          episode_status: epRes.data.status,
        },
        `${running.label} is running. Wait for it to finish or check logs.`,
      );
    }
    if (firstIdle) {
      return ok(
        {
          kind: 'idle_stage',
          stage: stageSummary(firstIdle),
          episode_status: epRes.data.status,
          governance_mode: epRes.data.governance_mode,
        },
        `${firstIdle.label} is idle — propose triggering its agent.`,
      );
    }
    return ok(
      {
        kind: 'all_done',
        episode_status: epRes.data.status,
      },
      'All pipeline stages are approved. Nothing to do.',
    );
  },
};

interface ListPendingApprovalsArgs {
  episodeId?: string;
  limit?: number;
}

export const listPendingApprovals: Tool<ListPendingApprovalsArgs> = {
  name: 'listPendingApprovals',
  description:
    'List assets in REVIEW status (awaiting Director approval). Filter by episodeId if provided, otherwise return across all episodes.',
  mutating: false,
  schema: {
    type: 'function',
    function: {
      name: 'listPendingApprovals',
      description: 'Assets awaiting Director approval, optionally scoped to an episode.',
      parameters: {
        type: 'object',
        properties: {
          episodeId: { type: 'string', description: 'Optional episode UUID to scope to.' },
          limit: {
            type: 'integer',
            description: 'Max items (default 20, max 100).',
            minimum: 1,
            maximum: 100,
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
      limit: typeof obj.limit === 'number'
        ? Math.min(100, Math.max(1, Math.floor(obj.limit)))
        : undefined,
    };
  },
  async execute(args, ctx): Promise<ToolResult> {
    const limit = args.limit ?? 20;
    const episodeId = resolveEpisodeId(args, ctx) ?? undefined;
    let query = ctx.supabase
      .from('assets')
      .select('id,episode_id,file_type,filename,agent_id,status,created_at')
      .eq('status', 'REVIEW')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (episodeId) query = query.eq('episode_id', episodeId);
    const { data, error } = await query;
    if (error) return fail(`assets fetch failed: ${error.message}`);
    const items = (data ?? []).map((a) => ({
      asset_id: a.id,
      episode_id: a.episode_id,
      file_type: a.file_type,
      filename: a.filename,
      agent: a.agent_id,
      since: a.created_at,
    }));
    return ok(
      { items, total: items.length },
      `${items.length} pending approval${items.length === 1 ? '' : 's'}.`,
    );
  },
};

function stageSummary(s: PipelineStageSnapshot) {
  return {
    id: s.id,
    label: s.label,
    phase: s.phase,
    agents: s.agents,
    state: s.state,
    assets_in_review: s.assets_in_review ?? 0,
  };
}

/**
 * Approximate inverse of STAGE_FROM_ASSET in pipeline-stages.ts — used only
 * for filtering REVIEW assets back to the matched stage, not as canon.
 */
function stageOf(ft: string): string | null {
  if (ft.startsWith('SPC-brief')) return 'brief';
  if (ft.startsWith('SCR')) return 'screenwriter';
  if (ft === 'REV-script_qa') return 'script_critic';
  if (ft.startsWith('STB')) return 'storyboarder';
  if (ft === 'REV-world_check' || ft === 'REV-continuity') return 'continuity_critic';
  if (ft.startsWith('SPC-ref_plan')) return 'reference_designer';
  if (ft.startsWith('REV-ref_plan')) return 'reference_critic';
  if (ft.startsWith('IMG-episode_ref')) return 'episode_references';
  if (ft.startsWith('VID-animatic')) return 'animatic';
  if (ft.startsWith('SPC-shot_plan')) return 'shot_designer';
  if (ft.startsWith('REV-shot_plan')) return 'shot_critic';
  if (ft.startsWith('VID-shot')) return 'visual_generator';
  if (ft.startsWith('VID-final_cut')) return 'final_cut';
  if (ft.startsWith('AUD-music')) return 'music_generator';
  if (ft.startsWith('SPC-metadata') || ft.startsWith('SPC-copy')) return 'copywriter';
  if (ft.startsWith('IMG-thumbnail')) return 'thumbnail_creator';
  if (ft.startsWith('REV-publish')) return 'publisher';
  if (ft.startsWith('REV-analytics')) return 'analytics_collector';
  return null;
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
