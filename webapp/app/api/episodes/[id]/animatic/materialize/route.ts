// ──────────────────────────────────────────────────────────────────────────────
// app/api/episodes/[id]/animatic/materialize/route.ts
// Materialize a VID-animatic asset from the approved storyboard skeleton — the
// "Phase 3" the timeline comments promised but never built.
//
// Why this exists (E25 2026-07-10, Director): the timeline is timeline-first
// (it renders a SYNTHETIC skeleton the moment the storyboard is approved, no
// animatic-approval stage — that ceremony was removed in E18). BUT per-shot
// duration editing (Save-timing) writes into a VID-animatic asset's
// `metadata.animatic_v1.director_overrides`, and STITCH/VGEN read durations
// from that SAME asset. So the duration editor stayed gated behind an existing
// animatic asset → the Director had to APPROVE AN EMPTY ANIMATIC just to unlock
// it. This endpoint removes that ceremony: the timeline calls it lazily on the
// FIRST duration edit, creating the animatic (APPROVED — it is a persistence
// vessel the Director is actively editing, not a creative gate) from the exact
// skeleton he was already looking at. Idempotent: returns the existing approved
// animatic if one is already present.
//
// Reuses the canonical builders (extractShotsFromStoryboard + newAnimaticContract
// + bakeApprovedMusic) so the result is byte-for-byte what the timeline skeleton
// and the agent slideshow path produce — no second animatic shape.
// ──────────────────────────────────────────────────────────────────────────────

import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { logEvent } from '@/lib/api/events';
import {
  isAnimaticV1,
  extractShotsFromStoryboard,
  newAnimaticContract,
  type AnimaticShot,
  type AnimaticContract,
} from '@/lib/api/animatic-shotlist';
import { bakeApprovedMusic } from '@/lib/music';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Mirror EpisodeTimelineSection.SKELETON_FALLBACK_DURATION_S — the fallback the
// synthetic timeline already shows, so the materialized asset matches it.
const SKELETON_FALLBACK_DURATION_S = 2.5;

interface AssetRow {
  id: string;
  file_type: string;
  status: string;
  version: number | null;
  created_at: string;
  content: string | null;
  metadata: unknown;
}

/** Newest-wins pick (version, then created_at) — same rule the timeline uses. */
function newestOf<T extends { version: number | null; created_at: string }>(rows: T[]): T | null {
  if (rows.length === 0) return null;
  return rows.reduce((best, a) => {
    const bv = best.version ?? 0;
    const av = a.version ?? 0;
    if (av > bv) return a;
    if (av < bv) return best;
    return a.created_at > best.created_at ? a : best;
  });
}

export const POST = withApiHandler(async (_req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const episodeId = params?.id;
  if (!episodeId) throw new NotFoundError('Episode');

  const { user, supabase } = await requireDirector();

  const { data: ep, error: epErr } = await supabase
    .from('episodes')
    .select('id,episode_code')
    .eq('id', episodeId)
    .maybeSingle();
  if (epErr) throw new Error(`episode fetch: ${epErr.message}`);
  if (!ep) throw new NotFoundError(`Episode ${episodeId}`);
  const episodeCode = (ep as { episode_code?: string | null }).episode_code ?? 'SS-unknown';

  const { data: assetsRaw, error: aErr } = await supabase
    .from('assets')
    .select('id,file_type,status,version,created_at,content,metadata')
    .eq('episode_id', episodeId)
    .or('file_type.eq.VID-animatic,file_type.like.STB%');
  if (aErr) throw new Error(`assets fetch: ${aErr.message}`);
  const assets = (assetsRaw ?? []) as unknown as AssetRow[];

  // Idempotent: an approved animatic already exists → return it, create nothing.
  const existing = newestOf(
    assets.filter(
      (a) =>
        a.file_type === 'VID-animatic' &&
        (a.status === 'APPROVED' || a.status === 'LOCKED') &&
        isAnimaticV1(a.metadata),
    ),
  );
  if (existing) {
    return apiOk({ asset_id: existing.id, created: false });
  }

  // Build the skeleton from the newest approved storyboard — IDENTICAL to the
  // timeline's storyboardContract, so the materialized asset is what the
  // Director already sees.
  const board = newestOf(
    assets.filter(
      (a) =>
        a.file_type.startsWith('STB') &&
        (a.status === 'APPROVED' || a.status === 'LOCKED') &&
        typeof a.content === 'string' &&
        a.content.length > 0,
    ),
  );
  if (!board) {
    throw new ValidationError(
      'No approved storyboard — approve the storyboard first; the timeline skeleton comes from it.',
    );
  }

  const shots = extractShotsFromStoryboard(board.content as string);
  if (shots.length === 0) {
    throw new ValidationError('Approved storyboard has no parseable shots.');
  }
  const shotList: AnimaticShot[] = shots.map((s) => ({
    shot_id: s.shot_id,
    asset_id: null,
    image_url: null,
    duration_seconds: s.duration_seconds ?? SKELETON_FALLBACK_DURATION_S,
    shot_role: s.shot_role,
    caption: (s.key_beat ?? s.action)?.slice(0, 200) || undefined,
  }));

  let contract: AnimaticContract = newAnimaticContract(shotList);
  // Bake any already-approved music so the vessel matches the agent slideshow path.
  contract = await bakeApprovedMusic(supabase, episodeId, contract);

  const filename = `${episodeCode}-VID-animatic-v01-APPROVED.md`;
  const { data: inserted, error: insErr } = await supabase
    .from('assets')
    .insert({
      episode_id: episodeId,
      // series_id is a UUID FK; episodes.series_id is a CODE — leave null (the
      // row is uniquely keyed by episode_id + file_type). Same as work-plan.
      series_id: null,
      file_type: 'VID-animatic',
      filename,
      status: 'APPROVED',
      version: 1,
      agent_id: 'EXEC-EDIT',
      content: `# Animatic — ${episodeCode}\n\nMaterialized from the approved storyboard on first timeline timing edit.`,
      description: 'Timeline animatic vessel (materialized on first duration edit).',
      metadata: { animatic_v1: contract } as unknown as Record<string, unknown>,
    } as never)
    .select('id')
    .maybeSingle();
  if (insErr) throw new Error(`animatic insert failed: ${insErr.message}`);
  const assetId = (inserted as { id?: string } | null)?.id ?? '';

  // Passive audit — 'asset_updated' is NOT in the actionable whitelist, so this
  // does not wake Polina (materialization is a mechanical vessel, not a gate).
  await logEvent(supabase, {
    event_type: 'asset_updated',
    severity: 'info',
    title: `Animatic materialized for ${episodeCode}`,
    description: `Director ${user.email ?? user.id} started editing shot timing; animatic vessel created from the approved storyboard (${shotList.length} shots).`,
    actor: user.id,
    episode_id: episodeId,
    asset_id: assetId,
    metadata: { kind: 'animatic_materialize', shot_count: shotList.length },
  });

  return apiOk({ asset_id: assetId, created: true });
});
