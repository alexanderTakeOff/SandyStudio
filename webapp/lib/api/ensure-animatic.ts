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
  isAnimaticV1,
  type AnimaticContract,
} from './animatic-shotlist';
import { bakeApprovedMusic, contractHasMusic } from '../music';

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
  // Idempotent: an animatic already exists (any status) → reuse it. BUT: the EDL
  // is materialized at pilot approval — BEFORE music is approved — so the first
  // bake writes null, and without a refresh here EXEC-STITCH freezes that stale
  // music-less contract into a silent final cut (Director complaint, E14). On the
  // idempotent path, if the existing animatic carries no music but an APPROVED
  // AUD-music now exists, re-bake it into the existing row. Idempotent: once
  // music is present the refresh is a no-op.
  const { data: existing } = await supabase
    .from('assets')
    .select('id,metadata')
    .eq('episode_id', episodeId)
    .like('file_type', 'VID-animatic%')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  const existingRow = existing as { id?: string; metadata?: unknown } | null;
  if (existingRow?.id) {
    const meta = existingRow.metadata;
    if (isAnimaticV1(meta) && !contractHasMusic(meta.animatic_v1)) {
      const refreshed = await bakeApprovedMusic(supabase, episodeId, meta.animatic_v1);
      if (contractHasMusic(refreshed)) {
        await supabase
          .from('assets')
          .update({ metadata: { animatic_v1: refreshed } } as never)
          .eq('id', existingRow.id);
      }
    }
    return existingRow.id;
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

  // Bake newest APPROVED music into the fresh contract (shared with the
  // sequential runner — single source of truth). No-op when no APPROVED music
  // yet; the idempotent-path refresh above catches music approved LATER, after
  // this first materialization.
  contract = await bakeApprovedMusic(supabase, episodeId, contract);

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
