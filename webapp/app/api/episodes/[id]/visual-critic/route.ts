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

const Body = z.object({ shotId: z.string().min(1).max(120).optional() }).strict();

export const POST = withApiHandler(async (req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const episodeId = params?.id;
  if (!episodeId) throw new NotFoundError('Episode');

  const { supabase } = await requireDirector();
  const body = await parseJson(req, Body);

  const results = await runVisualCriticForEpisode(
    supabase,
    episodeId,
    body.shotId ? { shotIds: [body.shotId] } : {},
  );

  const flagged = results.filter((r) => r.verdict && r.verdict.verdict !== 'PASS').length;
  return apiOk({
    checked: results.length,
    flagged,
    results: results.map((r) => ({
      assetId: r.assetId,
      shotId: r.shotId,
      verdict: r.verdict?.verdict ?? null,
      summary: r.verdict?.summary ?? r.error ?? null,
      findings: r.verdict?.findings ?? [],
    })),
  });
});
