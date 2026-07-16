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
 * Append `▶ Full episode: https://youtu.be/<id>` to a Short's description.
 * Idempotent (skips if the id is already present) and a no-op when the parent
 * is not yet known — per doctrine, ship the Short without the backlink rather
 * than block; the bridge can be backfilled once the parent is live.
 */
export function appendParentBacklink(description: string, parentVideoId: string | null): string {
  if (!parentVideoId) return description;
  if (description.includes(parentVideoId)) return description;
  return `${description.trimEnd()}\n\n▶ Full episode: https://youtu.be/${parentVideoId}`;
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
 */
export async function persistShortId(
  supabase: SupabaseClient<Database>,
  episodeId: string,
  shortId: string,
  shortUrl: string,
): Promise<void> {
  const { data } = await supabase.from('episodes').select('metadata').eq('id', episodeId).single();
  const meta = metaObject(data?.metadata);
  await supabase
    .from('episodes')
    .update({
      metadata: {
        ...meta,
        youtube_short_id: shortId,
        youtube_short_url: shortUrl,
        youtube_short_uploaded_at: new Date().toISOString(),
      } as Json,
    })
    .eq('id', episodeId);
}
