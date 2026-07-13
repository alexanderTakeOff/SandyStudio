// ──────────────────────────────────────────────────────────────────────────────
// lib/concierge/tools/visual-critic.ts
// Polina's runVisualCritic tool — fire the advisory post-render Visual Critic on a
// rendered reference (a shot, or the whole episode) and read back the verdict.
// Advisory: it logs a verdict activity_event per asset and NEVER changes status, so
// it is not a gated mutation. Mirrors conductor.ts's route-calling shape.
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

interface VisualCriticArgs {
  episodeId?: string;
  shotId?: string;
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

export const runVisualCritic: Tool<VisualCriticArgs> = {
  name: 'runVisualCritic',
  description:
    "Run the advisory Visual Critic on rendered reference image(s): it LOOKS at the pixels and judges them against the storyboard shot contract + style Bible (equipment/prop completeness per character, activity coherence, physics/geometry, anatomy/on-model, contract fidelity, style/genre), returning PASS / REVISE / FAIL with concrete findings. Pass shotId (e.g. 'S15-E28-SH16') to check ONE shot's ref, or omit it to sweep the whole episode. ADVISORY ONLY — it logs verdicts to the activity feed and never changes asset status. Use it to catch defects a human would spot but the text critics miss (a player with no racket, opponents on the same side of the net, off-model limbs). Omit episodeId to use the active episode.",
  mutating: false,
  schema: {
    type: 'function',
    function: {
      name: 'runVisualCritic',
      description: 'Advisory vision check of rendered refs against the storyboard + style canon.',
      parameters: {
        type: 'object',
        properties: {
          episodeId: {
            type: 'string',
            description: 'UUID of the episode. Omit to use the active conversation episode.',
          },
          shotId: {
            type: 'string',
            description: "Storyboard shot id (e.g. 'S15-E28-SH16') to check ONE ref. Omit to sweep every rendered ref in the episode.",
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
      shotId: typeof obj.shotId === 'string' ? obj.shotId : undefined,
    };
  },
  async execute(args, ctx: ToolContext): Promise<ToolResult> {
    const episodeId = resolveEpisodeId(args, ctx);
    if (!episodeId) {
      return fail('episodeId is required — no active episode in conversation context.');
    }
    const url = `${ctx.appOrigin.replace(/\/$/, '')}/api/episodes/${encodeURIComponent(episodeId)}/visual-critic`;
    let resp: Response;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(ctx) },
        body: JSON.stringify(args.shotId ? { shotId: args.shotId } : {}),
      });
    } catch (e) {
      return fail(`runVisualCritic fetch failed: ${e instanceof Error ? e.message : String(e)}`);
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
          : `runVisualCritic failed with HTTP ${resp.status}`;
      return fail(message, `http_${resp.status}`);
    }
    const data = (body && typeof body === 'object' && 'data' in body ? (body as { data: unknown }).data : body) as {
      checked?: number;
      flagged?: number;
      results?: Array<{ shotId: string | null; verdict: string | null; summary: string | null }>;
    };
    const lines = (data.results ?? []).map(
      (r) => `${r.shotId ?? '?'} → ${r.verdict ?? 'SKIP'}: ${r.summary ?? ''}`,
    );
    const summary =
      `Visual Critic checked ${data.checked ?? 0} ref(s), ${data.flagged ?? 0} flagged.` +
      (lines.length ? `\n${lines.join('\n')}` : '');
    return ok(body, summary);
  },
};
