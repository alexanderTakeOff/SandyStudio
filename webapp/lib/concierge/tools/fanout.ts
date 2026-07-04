// ──────────────────────────────────────────────────────────────────────────────
// lib/concierge/tools/fanout.ts
// fanoutShots — the reliable per-shot Designer fan-out, as a Polina tool.
//
// WHY: the Director's "Approve Direction & Fan Out" button (EREFPilotPillbar /
// VGENPilotPillbar → /eref|vgen/approve-pilots) is GUI-only and gated on a
// pilot-state machine that ad-hoc pilot work never initialises (vgen_pilot_state
// stays undefined → the button never renders). Polina had NO tool for it, so she
// fell back to triggerAgent(EXEC-EREF-DESIGNER / EXEC-VANIM) WITHOUT a shotId →
// the Designer hard-fails "requires shotId in event payload". That is the "blocker
// that keeps stopping her" (E15 live diagnosis 2026-07-04).
//
// WHAT: this tool fires ONE per-shot Designer event (WITH its shotId) for every
// shot still missing the stage's output — the same events approve-pilots emits,
// but callable directly and independent of the pilot-state machine. Each fanned
// shot then self-drives: Designer → Critic → plan-critic-autofire → Executor.
// ──────────────────────────────────────────────────────────────────────────────

import { gateMutation } from '../approval-check';
import {
  authHeaders,
  fail,
  ok,
  resolveEpisodeId,
  type Tool,
  type ToolContext,
  type ToolResult,
} from './types';

interface FanoutShotsArgs {
  episodeId?: string;
  stage: 'reference' | 'video';
  shotIds?: string[];
  reason?: string;
}

const STAGE_CONFIG = {
  reference: { agentCode: 'EXEC-EREF-DESIGNER', outputPrefix: 'IMG-episode_ref' },
  video: { agentCode: 'EXEC-VANIM', outputPrefix: 'VID-shot' },
} as const;

/** Extract the zero-padded shot number (e.g. "08") from a shot_id or filename. */
function shotNum(s: string): string | null {
  const m = s.match(/sh(\d{1,3})/i);
  return m ? m[1].padStart(2, '0') : null;
}

async function internalFetch(
  ctx: ToolContext,
  path: string,
  body: unknown,
): Promise<Response> {
  const url = `${ctx.appOrigin.replace(/\/$/, '')}${path}`;
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(ctx) },
    body: JSON.stringify(body),
  });
}

function safeParse(raw: string): Record<string, unknown> {
  if (!raw || raw.trim() === '') return {};
  try {
    const p: unknown = JSON.parse(raw);
    return p && typeof p === 'object' ? (p as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export const fanoutShots: Tool<FanoutShotsArgs> = {
  name: 'fanoutShots',
  description:
    "Fan out a per-shot Designer stage across ALL shots that still need it — the reliable, one-call fan-out (what the Director's 'Approve Direction & Fan Out' button does). stage='reference' fires the Reference Designer (EXEC-EREF-DESIGNER) per shot; stage='video' fires the Video Designer (EXEC-VANIM) per shot. Use this AFTER the pilot shots are approved to generate every remaining shot in one call, instead of triggering shots one-by-one. Each fanned shot then self-drives through its Critic + Executor (reference image / shot video). CRITICAL: do NOT use triggerAgent(EXEC-EREF-DESIGNER / EXEC-VANIM) for fan-out — that fires WITHOUT a shotId and the Designer HARD-FAILS 'requires shotId in event payload'. This tool passes the shotId per shot, which is the whole point. By default it targets every APPROVED-storyboard shot missing the stage output (skipping excluded shots); pass shotIds to target specific shots. Verbal approval required (auto-passes in bold Mode 3).",
  mutating: true,
  schema: {
    type: 'function',
    function: {
      name: 'fanoutShots',
      description:
        'Fan out the per-shot Reference or Video Designer across all shots missing that stage output (one event per shot, with shotId). Verbal approval required.',
      parameters: {
        type: 'object',
        properties: {
          episodeId: {
            type: 'string',
            description: 'Episode UUID. Omit to use the active conversation episode.',
          },
          stage: {
            type: 'string',
            enum: ['reference', 'video'],
            description:
              "'reference' → Reference Designer (EXEC-EREF-DESIGNER, produces SPC-ref_plan → image); 'video' → Video Designer (EXEC-VANIM, produces SPC-shot_plan → video).",
          },
          shotIds: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Optional explicit shot ids (e.g. ["S15-E15-SH08"]). Omit to fan out every storyboard shot missing the stage output.',
          },
          reason: {
            type: 'string',
            description: "Short audit reason — paraphrase the Director's intent.",
          },
        },
        required: ['stage'],
        additionalProperties: false,
      },
    },
  },
  parse(raw) {
    const obj = safeParse(raw);
    const stage =
      obj.stage === 'reference' || obj.stage === 'video' ? obj.stage : null;
    if (!stage) throw new Error("stage must be 'reference' or 'video'");
    const episodeId = typeof obj.episodeId === 'string' ? obj.episodeId : undefined;
    const shotIds = Array.isArray(obj.shotIds)
      ? obj.shotIds.filter((x): x is string => typeof x === 'string')
      : undefined;
    const reason = typeof obj.reason === 'string' ? obj.reason : undefined;
    return { episodeId, stage, shotIds, reason };
  },
  async execute(args, ctx): Promise<ToolResult> {
    const episodeId = resolveEpisodeId(args, ctx);
    if (!episodeId) {
      return fail('episodeId required — no active episode in conversation context.');
    }
    // Not a hard limit → auto-passes in bold Mode 3; verbal-gated in strict modes.
    const approval = gateMutation('fanoutShots', {
      mode: ctx.mode,
      turns: ctx.recentTurns ?? [],
    });
    if (!approval.approved) {
      return fail(approval.reason, 'verbal_approval_required');
    }

    const cfg = STAGE_CONFIG[args.stage];

    // ── Resolve the target shot list ─────────────────────────────────────────
    let targets: string[];
    if (args.shotIds && args.shotIds.length > 0) {
      targets = args.shotIds;
    } else {
      const { data: stb } = await ctx.supabase
        .from('assets')
        .select('content')
        .eq('episode_id', episodeId)
        .like('file_type', 'STB-storyboard%')
        .eq('status', 'APPROVED')
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();
      const content = (stb as { content?: string } | null)?.content ?? '';
      const allShots = [...content.matchAll(/"shot_id"\s*:\s*"([^"]+)"/g)].map(
        (m) => m[1],
      );
      if (allShots.length === 0) {
        return fail(
          'No APPROVED storyboard shot_ids found — cannot fan out. Approve the storyboard first.',
          'no_storyboard',
        );
      }

      // Shots that already have this stage's output.
      const { data: outs } = await ctx.supabase
        .from('assets')
        .select('filename')
        .eq('episode_id', episodeId)
        .like('file_type', `${cfg.outputPrefix}%`);
      const doneNums = new Set(
        ((outs ?? []) as { filename: string }[])
          .map((o) => shotNum(o.filename))
          .filter((n): n is string => n !== null),
      );

      // Excluded shots — episodes.metadata.excluded_shot_ids is the SSOT.
      const { data: ep } = await ctx.supabase
        .from('episodes')
        .select('metadata')
        .eq('id', episodeId)
        .maybeSingle();
      const excludedRaw =
        ((ep as { metadata?: { excluded_shot_ids?: unknown } } | null)?.metadata
          ?.excluded_shot_ids as string[] | undefined) ?? [];
      const excludedNums = new Set(
        excludedRaw.map(shotNum).filter((n): n is string => n !== null),
      );

      targets = allShots.filter((sid) => {
        const n = shotNum(sid);
        return n !== null && !doneNums.has(n) && !excludedNums.has(n);
      });
    }

    if (targets.length === 0) {
      return ok(
        { stage: args.stage, fired: 0, shots: [] },
        `Nothing to fan out — every shot already has its ${args.stage} output.`,
      );
    }

    // ── Fire one per-shot Designer event (WITH shotId) per target ────────────
    const fired: string[] = [];
    const failed: { shotId: string; error: string }[] = [];
    for (const shotId of targets) {
      try {
        const resp = await internalFetch(
          ctx,
          `/api/episodes/${encodeURIComponent(episodeId)}/trigger`,
          {
            agentCode: cfg.agentCode,
            reason: `[Prod Assistant] fan-out ${args.stage} ${shotId}${
              args.reason ? ` — ${args.reason}` : ''
            }`,
            payload: { shotId },
          },
        );
        if (resp.ok) fired.push(shotId);
        else failed.push({ shotId, error: `HTTP ${resp.status}` });
      } catch (e) {
        failed.push({ shotId, error: (e as Error).message });
      }
    }

    return ok(
      {
        stage: args.stage,
        agentCode: cfg.agentCode,
        fired: fired.length,
        shots: fired,
        failed,
      },
      `Fanned out ${args.stage}: fired ${cfg.agentCode} for ${fired.length}/${targets.length} shot(s)${
        failed.length ? `, ${failed.length} failed` : ''
      }. Each shot now self-drives Designer→Critic→${
        args.stage === 'video' ? 'Video Artist' : 'Reference Artist'
      }.`,
    );
  },
};
