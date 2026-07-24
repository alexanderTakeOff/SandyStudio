// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/providers/short-linkage.ts
// The funnel bridge: link an uploaded YouTube Short back to its parent long-form
// episode. YouTube Data API v3 has NO "related video" field — the ONLY
// programmable bridge is the parent watch-URL in the Short's description
// (doctrine: .claude/skills/shorts-longform-distribution/SKILL.md §"The bridge").
//
// Shared by the UI slicer route, the batch script, the backfill, and the future
// gag-cut cycle so the bridge lives in exactly one place.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '../../supabase/types.gen';

/**
 * Append `▶ Full episode: <url>` to a Short's description.
 * Idempotent (skips if the id is already present) and a no-op when the parent
 * is not yet known — per doctrine, ship the Short without the backlink rather
 * than block; the bridge can be backfilled once the parent is live.
 *
 * With a `playlistId` the link becomes `watch?v=<parent>&list=<playlist>`: it
 * still lands on the exact episode the Short promised, but the rest of the
 * catalogue queues up behind it instead of the viewer hitting a dead end.
 * Auto-advance is the one thing playlists reliably do — they are NOT a
 * discovery surface for Shorts (absent from YouTube's own list), so this is a
 * retention lever applied to traffic we already have, nothing more.
 * Unlisted videos DO stay visible inside a playlist (verified 2026-07-21:
 * 13 of 13 items visible to a signed-out viewer), so unlisted parents queue fine.
 */
export function appendParentBacklink(
  description: string,
  parentVideoId: string | null,
  playlistId?: string | null,
): string {
  if (!parentVideoId) return description;
  if (description.includes(parentVideoId)) return description;
  const url = playlistId
    ? `https://www.youtube.com/watch?v=${parentVideoId}&list=${playlistId}`
    : `https://youtu.be/${parentVideoId}`;
  return `${description.trimEnd()}\n\n▶ Full episode: ${url}`;
}

/**
 * The YouTube playlist this episode's series belongs to:
 * episode-metadata override → `series.metadata.youtube_playlist_id` →
 * `YOUTUBE_PLAYLIST_ID` env. Null → callers skip the playlist step.
 *
 * Lives here rather than in runner.ts because both the publisher (playlist
 * insertion) and the Short backlink need the same answer, and two resolvers
 * would drift.
 */
export async function resolveSeriesPlaylistId(
  supabase: SupabaseClient<Database>,
  episodeId: string,
): Promise<string | null> {
  const { data: ep } = await supabase
    .from('episodes')
    .select('metadata, series_id')
    .eq('id', episodeId)
    .maybeSingle();

  const epOverride = metaObject(ep?.metadata)['youtube_playlist_id'];
  if (typeof epOverride === 'string' && epOverride.length > 0) return epOverride;

  if (ep?.series_id) {
    const { data: series } = await supabase
      .from('series')
      .select('metadata')
      .eq('id', ep.series_id)
      .maybeSingle();
    const pl = metaObject(series?.metadata)['youtube_playlist_id'];
    if (typeof pl === 'string' && pl.length > 0) return pl;
  }

  return process.env.YOUTUBE_PLAYLIST_ID?.trim() || null;
}

/**
 * A window-specific idempotency token for a re-cut Short, e.g. `W12-38` for the
 * 12s→38s window. A re-cut is a NEW unlisted upload (YouTube never replaces a
 * video's content), so the plain `#Shorts` marker is not enough — two cuts of
 * the same episode would collide and the batch would skip the valid re-cut.
 * Embedding the window makes each cut uniquely identifiable by title alone.
 */
export function recutWindowMarker(startSec: number, endSec: number): string {
  return `W${Math.round(startSec)}-${Math.round(endSec)}`;
}

function metaObject(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

/** The parent episode's published landscape video id, from episodes.metadata. */
export async function readParentVideoId(
  supabase: SupabaseClient<Database>,
  episodeId: string,
): Promise<string | null> {
  const { data } = await supabase.from('episodes').select('metadata').eq('id', episodeId).maybeSingle();
  const v = metaObject(data?.metadata)['youtube_video_id'];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/**
 * Merge the Short's YouTube id back into episodes.metadata (mirror of
 * persistYouTubeVideoId in runner.ts — the thin distribution ledger, no new
 * table). Records the reverse Short→episode link for analytics/backfill.
 *
 * Clobber fix (2026-07-24, E15 «Автомойка» incident): the ledger USED to keep a
 * single scalar `youtube_short_id`, so every new Short overwrote the pointer to
 * the previous one. A 2s broken re-cut silently replaced the link to a good 75s,
 * 1196-view public Short — the good video stayed live on YouTube but the studio
 * lost track of it. We now APPEND every Short into `youtube_short_ids[]` (dedup
 * by id, newest last) so no prior Short is ever forgotten. `youtube_short_id`
 * (+ url/at) are kept as "latest" for back-compat readers.
 */
export async function persistShortId(
  supabase: SupabaseClient<Database>,
  episodeId: string,
  shortId: string,
  shortUrl: string,
): Promise<void> {
  const uploadedAt = new Date().toISOString();
  const { data } = await supabase.from('episodes').select('metadata').eq('id', episodeId).single();
  const meta = metaObject(data?.metadata);

  // Append to the durable list, deduping by id (id becomes newest-last).
  const priorRaw = Array.isArray(meta.youtube_short_ids) ? meta.youtube_short_ids : [];
  const prior = priorRaw.filter(
    (e): e is { id: string; url?: string; uploaded_at?: string } =>
      !!e && typeof e === 'object' && typeof (e as { id?: unknown }).id === 'string',
  );
  const deduped = prior.filter((e) => e.id !== shortId);
  const youtube_short_ids = [...deduped, { id: shortId, url: shortUrl, uploaded_at: uploadedAt }];

  await supabase
    .from('episodes')
    .update({
      metadata: {
        ...meta,
        youtube_short_ids,
        // Latest — kept for back-compat readers of the scalar keys.
        youtube_short_id: shortId,
        youtube_short_url: shortUrl,
        youtube_short_uploaded_at: uploadedAt,
      } as Json,
    })
    .eq('id', episodeId);
}
