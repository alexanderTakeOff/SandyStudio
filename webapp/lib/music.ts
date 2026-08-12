// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/music.ts
// Shared APPROVED-music → animatic@v1 bake. ONE source of truth, consumed by:
//   - the sequential EREF / anchor-chain animatic runner (animatic-slideshow.ts)
//   - the parallel-pipeline silent-EDL materializer (lib/api/ensure-animatic.ts)
//
// Before this module the bake logic lived in TWO copies (the runner's private
// `bakeApprovedMusic` + an inline duplicate in ensure-animatic). The parallel
// duplicate ran too EARLY — the EDL is materialized at pilot approval, before
// music is approved, so it baked `null` and the idempotent EDL never refreshed.
// Collapsing to one function lets both paths (and the stitch-time refresh) reuse
// identical, tested behaviour. See docs/AUTONOMY-IMPLEMENTATION-PLAN.md Фаза 0.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './supabase/types.gen';
import {
  getAudioTracks,
  type AnimaticContract,
} from './api/animatic-shotlist';

/**
 * Bake the newest APPROVED AUD-music URL into an animatic@v1 contract when one
 * exists. Graceful: on any failure — or when no APPROVED music is present — the
 * original contract is returned UNCHANGED (the animatic still assembles silently).
 * Idempotent: re-baking a contract that already carries the same music is a no-op.
 */
export async function bakeApprovedMusic(
  supabase: SupabaseClient<Database>,
  episodeId: string,
  contract: AnimaticContract,
): Promise<AnimaticContract> {
  try {
    const { data: musicRow } = await supabase
      .from('assets')
      .select('drive_path,staging_path,filename')
      .eq('episode_id', episodeId)
      .eq('file_type', 'AUD-music')
      .eq('status', 'APPROVED')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const m = musicRow as
      | { drive_path?: string | null; staging_path?: string | null; filename?: string }
      | null;
    const musicUrl = m?.drive_path ?? m?.staging_path ?? null;
    if (!musicUrl) return contract;
    return {
      ...contract,
      music_url: musicUrl,
      music_filename: m?.filename ?? null,
      audio_tracks: [
        {
          layer: 'music',
          url: musicUrl,
          filename: m?.filename ?? 'music.mp3',
          volume: 1.0,
          muted: false,
        },
      ],
    };
  } catch {
    return contract;
  }
}

/** True when the contract already carries a music track (via audio_tracks or the
 *  legacy music_url fallback). Used by the stitch-time refresh + precondition. */
export function contractHasMusic(contract: AnimaticContract): boolean {
  return getAudioTracks(contract).some((t) => t.layer === 'music');
}
