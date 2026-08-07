// ──────────────────────────────────────────────────────────────────────────────
// lib/api/ingest-music.ts
//
// ONE canonical path for a Director-uploaded music track (D3b/D14/D15, 2026-07-09).
//
// Before this helper the two upload routes diverged:
//   - /upload-music-direct (composer, AUD-music asset) wrote the bytes but KEPT
//     status REVIEW — so the stitch music gate stayed unsatisfied and the
//     pipeline could not advance ("composer not approved").
//   - /upload-music (timeline, VID-animatic asset) patched only the animatic_v1
//     contract and never created/approved an AUD-music row — so the same gate
//     stayed unsatisfied from the other side.
//
// Director decision (2026-07-09): a MANUAL upload IS the human decision — treat
// it as APPROVED and advance immediately, no separate Approve click. This helper
// makes both routes converge on that behaviour:
//   1. Upsert an APPROVED AUD-music row for the episode, carrying the REAL
//      uploaded extension in its filename (fixes D14: the .mp3-bytes-as-.wav
//      mismatch that ENOENT'd the final cut).
//   2. Force-bake the newest APPROVED music into the episode's VID-animatic
//      contract (fixes D15: timeline + composer converge without a reload).
//
// Reuses the proven pattern from skip-music (synthetic APPROVED AUD-music) and
// the single-source bake helpers — no new event types, enums, or gate specs.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { bakeApprovedMusic } from '../music';
import { ensureEpisodeAnimaticEDL } from './ensure-animatic';
import { isAnimaticV1 } from './animatic-shotlist';
import { filenameForStatus } from './filename-status';

export interface IngestMusicInput {
  episodeId: string;
  /** Served media URL of the uploaded bytes (`/api/media/<cacheFilename>`). */
  browserUrl: string;
  /** Real uploaded extension derived from the MIME type ('mp3' | 'wav'). */
  ext: string;
  originalFilename: string;
  bytes: number;
  mime: string;
  uploaderId: string;
  /**
   * When the upload targeted an existing AUD-music asset directly (composer
   * path), its id — that exact row is promoted. Omitted for the timeline path,
   * where the newest AUD-music row (if any) is promoted, else a fresh one is
   * inserted.
   */
  targetAudMusicId?: string;
  /**
   * Skip the animatic re-bake (step 2). Set by the timeline route, which has
   * already written the track into the contract via `replaceMusicLayer`
   * (preserving non-music voice/sfx layers that `bakeApprovedMusic` would drop).
   */
  skipBake?: boolean;
}

interface MusicRow {
  id: string;
  filename: string;
  metadata: unknown;
}

/** Replace a filename's extension AND reflow its status suffix to APPROVED. */
function approvedFilename(filename: string, ext: string): string {
  const withExt = filename.replace(/\.[a-z0-9]+$/i, `.${ext}`);
  return filenameForStatus(withExt, 'APPROVED') ?? withExt;
}

/**
 * Promote a Director-uploaded music track to APPROVED and bake it into the
 * episode's animatic. Returns the AUD-music asset id that now backs the track.
 */
export async function ingestUploadedMusic(
  supabase: SupabaseClient,
  input: IngestMusicInput,
): Promise<{ audMusicId: string }> {
  const { episodeId, browserUrl, ext, originalFilename, bytes, mime, uploaderId } = input;

  // 1. Resolve the AUD-music row to promote: explicit target → newest existing →
  //    fresh insert.
  let row: MusicRow | null = null;
  if (input.targetAudMusicId) {
    const { data } = await supabase
      .from('assets')
      .select('id,filename,metadata')
      .eq('id', input.targetAudMusicId)
      .maybeSingle();
    row = (data as MusicRow | null) ?? null;
  } else {
    const { data } = await supabase
      .from('assets')
      .select('id,filename,metadata')
      .eq('episode_id', episodeId)
      .eq('file_type', 'AUD-music')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    row = (data as MusicRow | null) ?? null;
  }

  const uploadMeta = {
    uploaded_by_director: true,
    uploaded_at: new Date().toISOString(),
    original_filename: originalFilename,
    bytes,
    mime,
    // A real upload un-skips a previously-skipped (silent) episode.
    skipped: false,
  };

  let audMusicId: string;
  if (row) {
    const mergedMeta = { ...((row.metadata ?? {}) as Record<string, unknown>), ...uploadMeta };
    const { error } = await supabase
      .from('assets')
      .update({
        status: 'APPROVED',
        filename: approvedFilename(row.filename, ext),
        drive_path: browserUrl,
        // staging_path is a filesystem path or null — NEVER a URL. Persisting the
        // browser URL here made EXEC-STITCH's fs.readFile('/api/media/…') resolve
        // against cwd → ENOENT on C:\api\media\… (the Online Editor music crash).
        // Media lives in the cache addressed by drive_path/URL; leave the FS
        // column null like every persistBinary-created binary row.
        staging_path: null,
        drive_file_id: null,
        drive_web_view_url: null,
        metadata: mergedMeta as never,
      } as never)
      .eq('id', row.id);
    if (error) throw new Error(`AUD-music promote failed: ${error.message}`);
    audMusicId = row.id;
  } else {
    const { data: epRow } = await supabase
      .from('episodes')
      .select('episode_code')
      .eq('id', episodeId)
      .maybeSingle();
    const episodeCode = (epRow as { episode_code?: string } | null)?.episode_code ?? 'SS-unknown';
    const filename = `${episodeCode}-AUD-music-v01-APPROVED.${ext}`;
    const { data: inserted, error } = await supabase
      .from('assets')
      .insert({
        episode_id: episodeId,
        agent_id: 'EXEC-MGEN',
        file_type: 'AUD-music',
        filename,
        status: 'APPROVED',
        version: 1,
        description: 'Director-uploaded music track.',
        drive_path: browserUrl,
        // See note above — staging_path is FS-native or null, never a URL.
        staging_path: null,
        metadata: { agent_id: 'EXEC-MGEN', section: 'main', ...uploadMeta } as never,
      } as never)
      .select('id')
      .single();
    if (error) throw new Error(`AUD-music insert failed: ${error.message}`);
    audMusicId = (inserted as { id: string }).id;
  }

  // 2. Bake the now-APPROVED track into the episode's animatic contract so the
  //    timeline reflects it immediately (D15). An explicit upload OVERRIDES any
  //    previously-baked track (unlike ensureEpisodeAnimaticEDL's fill-if-empty
  //    idempotent path, which deliberately never clobbers). When no animatic
  //    exists yet, materialize one (it bakes our APPROVED music in the process).
  //    Skipped when the caller already patched the contract (timeline route).
  if (input.skipBake) return { audMusicId };
  await bakeMusicIntoEpisodeAnimatic(supabase, episodeId);
  return { audMusicId };
}

/**
 * Bake the newest APPROVED AUD-music into the episode's current VID-animatic
 * contract and persist it, so the track flows to the timeline. Override (not
 * fill-if-empty): a freshly-approved track replaces a previously-baked one. When
 * no animatic exists yet, materialize one (ensureEpisodeAnimaticEDL bakes music
 * in the process). Shared by ingestUploadedMusic (upload routes) AND the
 * AUD-music APPROVE branch in computeNextEvents (2026-07-11, Director: approve in
 * the Composer → the track appears on the timeline automatically, no Replace).
 */
export async function bakeMusicIntoEpisodeAnimatic(
  supabase: SupabaseClient,
  episodeId: string,
): Promise<void> {
  const { data: animaticRow } = await supabase
    .from('assets')
    .select('id,metadata')
    .eq('episode_id', episodeId)
    .like('file_type', 'VID-animatic%')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  const anim = animaticRow as { id?: string; metadata?: unknown } | null;
  if (anim?.id && isAnimaticV1(anim.metadata)) {
    const refreshed = await bakeApprovedMusic(supabase, episodeId, anim.metadata.animatic_v1);
    await supabase
      .from('assets')
      .update({
        metadata: {
          ...((anim.metadata ?? {}) as Record<string, unknown>),
          animatic_v1: refreshed,
        } as never,
      } as never)
      .eq('id', anim.id);
  } else {
    await ensureEpisodeAnimaticEDL(supabase, episodeId);
  }
}
