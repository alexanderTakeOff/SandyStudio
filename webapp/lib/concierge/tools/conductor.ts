// ──────────────────────────────────────────────────────────────────────────────
// lib/concierge/tools/conductor.ts
//
// Фаза 4 (docs/AUTONOMY-IMPLEMENTATION-PLAN.md) — the conductor's two tools.
//
// The factory self-advances on its own (Фаза 2b loop); the conductor (Polina on
// a strong model) only needs to SEE the whole episode and NUDGE a convergence
// pass when something is stuck. Two tools give exactly that:
//   - getStateMatrix  — the eyes: the one canonical "where is everything now"
//     projection (per-shot × per-stage status/version/fresh + blocked_reason +
//     music/final-cut/reserved gates), rendered as a table the model reads.
//   - reconcileEpisode — the hands: run one convergence pass (auto-approve the
//     mechanical PASS stages the plan allows, fire the stitch, surface HALTs).
//
// The conductor loop is then: read matrix → is anything stuck/decidable? →
// reconcile (or escalate a surfaced exception to the Director). Few decisions,
// compact input — the "$10-15/episode brain" of the doctrine.
// ──────────────────────────────────────────────────────────────────────────────

import {
  authHeaders,
  fail,
  ok,
  resolveEpisodeId,
  type Tool,
  type ToolContext,
  type ToolResult,
} from './types';
import {
  getEpisodeStateMatrix,
  renderStateMatrixMarkdown,
} from '@/lib/agents/state-matrix';

interface EpisodeArg {
  episodeId?: string;
}

function safeParse(raw: string): Record<string, unknown> {
  if (!raw || raw.trim() === '') return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const episodeArgSchema = {
  type: 'object' as const,
  properties: {
    episodeId: {
      type: 'string',
      description: 'UUID of the episode. Omit to use the active conversation episode.',
    },
  },
  additionalProperties: false,
};

// ── The eyes ────────────────────────────────────────────────────────────────

export const getStateMatrix: Tool<EpisodeArg> = {
  name: 'getStateMatrix',
  description:
    "Get the episode's State Matrix: every shot × every stage (ref_plan, ref_image, shot_plan, video) with its status, version, freshness, and any blocked/stale/stuck reason, plus music, final-cut, and the reserved gates. This is the single source of truth for 'where is everything now' — read it before deciding what to do next. Excluded shots are struck through; stuck shots (failed generation) show a plain-language reason. Omit episodeId to use the active episode.",
  mutating: false,
  schema: {
    type: 'function',
    function: {
      name: 'getStateMatrix',
      description: 'The per-shot × per-stage state projection for one episode (markdown + structured).',
      parameters: episodeArgSchema,
    },
  },
  parse(raw) {
    const obj = safeParse(raw);
    return { episodeId: typeof obj.episodeId === 'string' ? obj.episodeId : undefined };
  },
  async execute(args, ctx): Promise<ToolResult> {
    const episodeId = resolveEpisodeId(args, ctx);
    if (!episodeId) {
      return fail(
        'episodeId is required — no active episode in conversation context. Ask the Director which episode, then call again.',
      );
    }
    try {
      const matrix = await getEpisodeStateMatrix(ctx.supabase, episodeId);
      const markdown = renderStateMatrixMarkdown(matrix);
      return ok({ matrix, markdown }, markdown);
    } catch (e) {
      return fail(`getStateMatrix failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};

// ── The hands ───────────────────────────────────────────────────────────────

export const reconcileEpisode: Tool<EpisodeArg> = {
  name: 'reconcileEpisode',
  description:
    "Run ONE convergence pass on the episode: auto-approve the mechanical stages whose critic already PASSed (for shots in the approved plan, never the reserved gates), and fire the final stitch once every live shot is approved and music is present. Use this to un-stick a self-advancing run, or after resolving a surfaced exception. Idempotent — calling it when nothing is actionable is a safe no-op. Requires the episode to be in autonomous mode (MECHANICS_AUTO_ADVANCE); reserved gates (brief/script/canon/pilots/publish) still wait for the Director.",
  mutating: true,
  schema: {
    type: 'function',
    function: {
      name: 'reconcileEpisode',
      description: 'Run one reconciler convergence pass on the episode (auto-advance mechanical stages + stitch).',
      parameters: episodeArgSchema,
    },
  },
  parse(raw) {
    const obj = safeParse(raw);
    return { episodeId: typeof obj.episodeId === 'string' ? obj.episodeId : undefined };
  },
  async execute(args, ctx): Promise<ToolResult> {
    const episodeId = resolveEpisodeId(args, ctx);
    if (!episodeId) {
      return fail('episodeId is required — no active episode in conversation context.');
    }
    const url = `${ctx.appOrigin.replace(/\/$/, '')}/api/episodes/${encodeURIComponent(episodeId)}/reconcile`;
    let resp: Response;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(ctx) },
        body: JSON.stringify({}),
      });
    } catch (e) {
      return fail(`reconcileEpisode fetch failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    let body: unknown = null;
    try {
      body = await resp.json();
    } catch {
      /* fall through */
    }
    if (!resp.ok) {
      const message =
        body && typeof body === 'object' && 'error' in body
          ? String((body as { error: unknown }).error)
          : `reconcileEpisode failed with HTTP ${resp.status}`;
      return fail(message, `http_${resp.status}`);
    }
    const data = (body && typeof body === 'object' && 'data' in body ? (body as { data: unknown }).data : body) as {
      ran?: boolean;
      approved?: unknown[];
      halted?: unknown[];
    };
    const approved = Array.isArray(data?.approved) ? data.approved.length : 0;
    const halted = Array.isArray(data?.halted) ? data.halted.length : 0;
    const summary = data?.ran
      ? `Reconcile ran: ${approved} auto-approved, ${halted} halted.`
      : 'Reconcile is inactive for this episode (MECHANICS_AUTO_ADVANCE off) — nothing changed.';
    return ok(body, summary);
  },
};
