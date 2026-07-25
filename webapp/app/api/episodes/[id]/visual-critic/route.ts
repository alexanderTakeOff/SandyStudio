// ──────────────────────────────────────────────────────────────────────────────
// app/api/episodes/[id]/visual-critic/route.ts
// On-demand trigger for the advisory Visual Critic (Director-only). Shared entry
// for the timeline kebab ("Visual check" on a cell), the "check whole episode"
// header button, and Polina's runVisualCritic tool.
//
// POST body: { shotId?: string }  — a single shot's ref, or the whole episode.
// Advisory: logs a verdict activity_event per asset, never changes status. Returns
// the verdicts so the UI can toast them immediately.
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import { NotFoundError } from '@/lib/api/errors';
import { runVisualCriticForEpisode } from '@/lib/agents/runners/visual-shot-critic';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z
  .object({
    shotId: z.string().min(1).max(120).optional(),
    kind: z.enum(['ref', 'video', 'both']).optional(),
  })
  .strict();

export const POST = withApiHandler(async (req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const episodeId = params?.id;
  if (!episodeId) throw new NotFoundError('Episode');

  const { supabase } = await requireDirector();
  const body = await parseJson(req, Body);

  const results = await runVisualCriticForEpisode(supabase, episodeId, {
    ...(body.shotId ? { shotIds: [body.shotId] } : {}),
    ...(body.kind ? { kind: body.kind } : {}),
  });

  const flagged = results.filter((r) => r.verdict && r.verdict.verdict !== 'PASS').length;
  // The runner already wrote a budget_log row per vision call (2026-07-25 — this
  // sweep used to spend real money invisibly). Surface the total so the Director
  // sees the price of the button he just pressed, in the same response.
  const costUsd = +results.reduce((s, r) => s + r.costUsd, 0).toFixed(4);
  return apiOk({
    checked: results.length,
    flagged,
    costUsd,
    results: results.map((r) => ({
      assetId: r.assetId,
      shotId: r.shotId,
      verdict: r.verdict?.verdict ?? null,
      summary: r.verdict?.summary ?? r.error ?? null,
      findings: r.verdict?.findings ?? [],
      costUsd: r.costUsd,
    })),
  });
});
