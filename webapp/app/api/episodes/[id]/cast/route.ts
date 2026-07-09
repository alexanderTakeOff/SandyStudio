// ──────────────────────────────────────────────────────────────────────────────
// app/api/episodes/[id]/cast/route.ts
// ART-AD Casting stage (Phase D, 2026-06-14). Creates/updates the episode cast
// gallery (SPC-episode_cast) from a Director/ART-AD-selected slug list, gated by a
// canon-existence preflight (stage C0). The gallery is created in REVIEW so it
// lands in the standard Approval Queue / Casting-stage workstation with the normal
// Approve button (DRAFT was invisible to the approval UI — `assets_in_review`
// counts only REVIEW, and the asset state-machine forbids DRAFT→APPROVED, so a
// DRAFT cast could never be ratified and the episode ran silently unscoped). The
// Director ratifies it via the standard approve route, which flips scoping live and
// writes the appears_in projection.
//
// Why a dedicated route: casting was only doable via ad-hoc scripts. This makes it
// a first-class, Polина/Director-callable stage with the preflight HARD GATE that
// kills the phantom-canon class at the source.
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { logEvent } from '@/lib/api/events';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { seriesIdForEpisode, validateCanonExists } from '@/lib/api/series-bible';
import { EPISODE_CAST_FILE_TYPE } from '@/lib/agents/episode-cast';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  cast: z
    .array(
      z.object({
        slug: z.string().min(1),
        role: z.string().max(200).optional(),
      }),
    )
    .min(1, 'cast must list at least one canon slug'),
  note: z.string().max(2000).optional(),
});

export const POST = withApiHandler(async (req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const episodeId = params?.id;
  if (!episodeId) throw new NotFoundError('Episode');

  const { user, supabase } = await requireDirector();
  const body = await parseJson(req, Body);

  // Episode + series resolution.
  const { data: ep, error: epErr } = await supabase
    .from('episodes')
    .select('id,episode_code')
    .eq('id', episodeId)
    .maybeSingle();
  if (epErr) throw new Error(`episode fetch failed: ${epErr.message}`);
  if (!ep) throw new NotFoundError(`Episode ${episodeId}`);
  const episodeCode = (ep as { episode_code?: string }).episode_code ?? 'UNKNOWN';

  const seriesId = await seriesIdForEpisode(supabase, episodeId);
  if (!seriesId) throw new ValidationError('Episode has no parent series — cannot cast');

  // ── C0: canon-existence preflight (HARD GATE) ──────────────────────────────
  const slugs = body.cast.map((c) => c.slug.trim().toLowerCase());
  const preflight = await validateCanonExists(supabase, seriesId, slugs);
  if (!preflight.ok) {
    throw new ValidationError(
      `Canon-existence preflight FAILED — no LOCKED canon for: ${preflight.missing.join(', ')}. ` +
        `Create these in the Library (or drop them from the cast) before casting.`,
    );
  }

  // ── Build the gallery artifact ─────────────────────────────────────────────
  const content =
    `# Episode Cast — ${episodeCode}\n\n` +
    `Casting: the subset of the series Library cast into this episode. Anything not ` +
    `listed is scoped OUT of every downstream stage.\n\n## Cast\n\n` +
    body.cast.map((c) => `- **${c.slug}**${c.role ? ` — ${c.role}` : ''}`).join('\n') +
    `\n\n\`\`\`json\n${JSON.stringify({ cast: slugs }, null, 2)}\n\`\`\`\n`;

  // Supersede any prior un-ratified cast gallery for this episode (one live
  // proposal). Covers legacy DRAFT and the current REVIEW state.
  await supabase
    .from('assets')
    .update({ status: 'INVALIDATED' } as never)
    .eq('episode_id', episodeId)
    .eq('file_type', EPISODE_CAST_FILE_TYPE)
    .in('status', ['DRAFT', 'REVIEW']);

  const { data: existing } = await supabase
    .from('assets')
    .select('version')
    .eq('episode_id', episodeId)
    .eq('file_type', EPISODE_CAST_FILE_TYPE)
    .order('version', { ascending: false })
    .limit(1);
  const nextVersion = (((existing ?? [])[0] as { version?: number } | undefined)?.version ?? 0) + 1;
  const versionTag = `v${String(nextVersion).padStart(2, '0')}`;

  const { data: inserted, error: insErr } = await supabase
    .from('assets')
    .insert({
      episode_id: episodeId,
      series_id: null,
      file_type: EPISODE_CAST_FILE_TYPE,
      filename: `${episodeCode}-SPC-episode_cast-${versionTag}-REVIEW.md`,
      description: `Episode cast gallery — ${body.cast.length} canon members. Ratify to lock scoping.`,
      version: nextVersion,
      status: 'REVIEW',
      agent_id: 'ART-AD',
      content,
      metadata: { cast: slugs },
    } as never)
    .select('id')
    .maybeSingle();
  if (insErr) throw new Error(`cast gallery insert failed: ${insErr.message}`);
  const assetId = (inserted as { id?: string } | null)?.id ?? '';

  // D2 (2026-07-09): cast is born in REVIEW but its only signal used to be
  // `asset_updated` — absent from both event whitelists — so in Mode 1 (Director
  // works through Polina, not the dashboard) nobody was woken to approve it and
  // the pipeline deadlocked after the brief. Emit the already-wired MUST-WAKE
  // `decision_requested` so the ratification gate surfaces to Director/Polina.
  await logEvent(supabase, {
    event_type: 'decision_requested',
    severity: 'info',
    title: `Каст предложен для ${episodeCode} (${body.cast.length}) — утверди`,
    description: body.note ?? `ART-AD cast: ${slugs.join(', ')}`,
    actor: user.id,
    asset_id: assetId,
    episode_id: episodeId,
    metadata: { agent: 'ART-AD', operation: 'cast', cast: slugs },
  });

  return apiOk({
    cast_asset_id: assetId,
    episode_id: episodeId,
    cast: slugs,
    status: 'REVIEW',
    // Director ratifies via POST /api/assets/{cast_asset_id}/approve {decision:'APPROVE'}.
    next: 'approve to lock scoping + write appears_in',
  });
});
