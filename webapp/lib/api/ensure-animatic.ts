// ──────────────────────────────────────────────────────────────────────────────
// lib/api/ensure-animatic.ts
//
// Timeline-as-home Phase 3 (2026-07-02): materialize a SILENT, auto-APPROVED
// VID-animatic EDL for a PARALLEL-pipeline episode that never ran the
// ref-animatic approval ceremony.
//
// The `animatic_v1` contract is the sole home for the final-cut edit-decision
// list — shot ORDER, director_overrides (per-shot trim + re-timing → ffmpeg
// inpoint/outpoint), the soft-delete set, and audio shaping. EXEC-STITCH reads
// it directly (runner.ts EXEC-STITCH) and throws "no APPROVED VID-animatic" if
// it is absent. In sequential mode the ceremony-built animatic supplies it; in
// parallel mode nothing does — so parallel episodes could never assemble a
// final cut. This helper closes that gap WITHOUT reintroducing the approval
// ceremony: it builds the identical contract and persists it already APPROVED.
//
// Server-only (does DB inserts). Do NOT import from client components.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildShotListFromApprovedEREF,
  newAnimaticContract,
  type AnimaticContract,
} from './animatic-shotlist';

/**
 * Ensure a parallel-pipeline episode has a VID-animatic EDL. Idempotent — if any
 * VID-animatic row already exists for the episode, returns its id and inserts
 * nothing. Returns null when the EDL cannot be built yet (no approved storyboard
 * or no approved references); callers treat null as "not ready, try again later".
 *
 * Reuses the SAME builder chain the EXEC-EDIT runner uses
 * (buildShotListFromApprovedEREF + newAnimaticContract + APPROVED-music bake) so
 * the persisted contract is structurally identical to a ceremony-built animatic;
 * only the Director approval step is skipped (status starts APPROVED).
 */
export async function ensureEpisodeAnimaticEDL(
  supabase: SupabaseClient,
  episodeId: string,
): Promise<string | null> {
  // Idempotent: an animatic already exists (any status) → reuse it.
  const { data: existing } = await supabase
    .from('assets')
    .select('id')
    .eq('episode_id', episodeId)
    .like('file_type', 'VID-animatic%')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if ((existing as { id?: string } | null)?.id) {
    return (existing as { id: string }).id;
  }

  // Episode code — for the filename convention (mirrors saveAgentOutput).
  const { data: epRow } = await supabase
    .from('episodes')
    .select('episode_code')
    .eq('id', episodeId)
    .maybeSingle();
  const episodeCode =
    (epRow as { episode_code?: string } | null)?.episode_code ?? 'SS-unknown';

  // Newest APPROVED/LOCKED storyboard content = the shot skeleton (order + base
  // durations + captions).
  const { data: stbRow } = await supabase
    .from('assets')
    .select('content')
    .eq('episode_id', episodeId)
    .like('file_type', 'STB%')
    .in('status', ['APPROVED', 'LOCKED'])
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  const stbContent = (stbRow as { content?: string | null } | null)?.content ?? null;
  if (!stbContent) return null;

  let contract: AnimaticContract;
  try {
    const shotList = await buildShotListFromApprovedEREF(
      supabase,
      episodeId,
      stbContent,
    );
    contract = newAnimaticContract(shotList);
  } catch {
    // Throws when there are no APPROVED references yet — not ready.
    return null;
  }

  // Bake newest APPROVED music (mirrors runAnimaticSlideshow) — optional/graceful.
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
    if (musicUrl) {
      contract = {
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
    }
  } catch {
    /* music bake is non-fatal — the EDL still assembles video-only */
  }

  // Version + filename per the saveAgentOutput convention (auto-increment).
  const { data: existingRows } = await supabase
    .from('assets')
    .select('version')
    .eq('episode_id', episodeId)
    .eq('file_type', 'VID-animatic');
  const maxV = ((existingRows ?? []) as Array<{ version?: number | null }>).reduce(
    (mx, r) => Math.max(mx, r.version ?? 0),
    0,
  );
  const nextVersion = maxV + 1;
  const versionTag = `v${String(nextVersion).padStart(2, '0')}`;
  const filename = `${episodeCode}-VID-animatic-${versionTag}-APPROVED.md`;

  const { data: inserted, error } = await supabase
    .from('assets')
    .insert({
      episode_id: episodeId,
      agent_id: 'EXEC-EDIT',
      file_type: 'VID-animatic',
      filename,
      drive_path: null,
      staging_path: null,
      drive_file_id: null,
      drive_web_view_url: null,
      // Silent EDL — no approval ceremony in parallel mode (the whole point of
      // the demotion). Director still edits timing/trim/audio in the timeline.
      status: 'APPROVED',
      version: nextVersion,
      content: `Auto-materialized EDL (parallel pipeline) — ${contract.shot_list.length} shots. Silent animatic: no approval ceremony; edit-decision-list backing for the Episode Timeline + EXEC-STITCH.`,
      description: 'Auto-materialized silent EDL (parallel pipeline)',
      metadata: { animatic_v1: contract } as unknown,
    } as never)
    .select('id')
    .single();
  if (error) return null; // non-fatal: the caller (stitch trigger) simply won't fire this pass
  return (inserted as { id: string }).id;
}
