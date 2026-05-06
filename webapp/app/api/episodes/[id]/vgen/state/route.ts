// ──────────────────────────────────────────────────────────────────────────────
// app/api/episodes/[id]/vgen/state/route.ts
//
// GET — VGEN Pilot Pass live state for one episode.
// Bridges the integration gap between Track A and Track B:
//   - Track A stores `vgen_pilot_state` in `app_config` (mirror of EREF).
//   - Track B's pillbar UI was originally written against
//     `episode.metadata.vgen_pilot_state` (which we never migrate to).
//
// This endpoint is the single source of truth the pillbar consumes — it reads
// app_config + episode assets + the approved animatic shot list and returns a
// flat, ready-to-render summary.
//
// Response shape:
//   {
//     episode_id: string,
//     pilot_state: 'NONE' | 'PENDING_REVIEW' | 'FANOUT_RUNNING'
//                | 'COMPLETE' | 'CANCELLED',
//     total_shots: number,            // animatic_v1.shot_list.length, or 0
//     pilot_shot_ids: string[],       // from VID-shot.metadata.vgen_pilot=true
//     pilot_approved_count: number,   // pilot shots whose latest VID-shot is APPROVED
//     approved_count: number,         // distinct shot_ids with any APPROVED VID-shot
//     has_vid_shots: boolean,
//     running_jobs: number,           // EXEC-VGEN jobs currently RUNNING for this episode
//   }
// ──────────────────────────────────────────────────────────────────────────────

import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { NotFoundError } from '@/lib/api/errors';
import { getVgenPilotState } from '@/lib/api/vgen-pilot-state';
import { isAnimaticV1 } from '@/lib/api/animatic-shotlist';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface AssetRow {
  id: string;
  file_type: string;
  status: string;
  metadata: unknown;
  version: number | null;
  created_at: string;
}

function getVidShotShotId(meta: unknown): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const obj = meta as { shot_id?: unknown; storyboard_shot?: { shot_id?: unknown } };
  if (typeof obj.shot_id === 'string') return obj.shot_id;
  if (obj.storyboard_shot && typeof obj.storyboard_shot.shot_id === 'string') {
    return obj.storyboard_shot.shot_id;
  }
  return null;
}

function isPilotMeta(meta: unknown): boolean {
  if (!meta || typeof meta !== 'object') return false;
  return (meta as { vgen_pilot?: unknown }).vgen_pilot === true;
}

export const GET = withApiHandler(async (_req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const episodeId = params?.id;
  if (!episodeId) throw new NotFoundError('Episode');

  const { supabase } = await requireDirector();

  // ── Episode existence + parallel fetch ────────────────────────────────────
  const [epRes, assetsRes, pilotState, jobsRes] = await Promise.all([
    supabase.from('episodes').select('id').eq('id', episodeId).maybeSingle(),
    // VID-shot rows carry a per-shot variant suffix in their file_type
    // (e.g. "VID-shot-ss-s14-e01-a1-sc01-sh01"). Use OR with prefix match
    // instead of `.in()` so we catch every variant.
    supabase
      .from('assets')
      .select('id,file_type,status,metadata,version,created_at')
      .eq('episode_id', episodeId)
      .or('file_type.eq.VID-animatic,file_type.like.VID-shot%'),
    getVgenPilotState(supabase, episodeId),
    supabase
      .from('jobs')
      .select('id,status')
      .eq('episode_id', episodeId)
      .eq('agent_id', 'EXEC-VGEN')
      .eq('status', 'RUNNING'),
  ]);
  if (epRes.error) throw new Error(`episode fetch: ${epRes.error.message}`);
  if (!epRes.data) throw new NotFoundError(`Episode ${episodeId}`);
  if (assetsRes.error) throw new Error(`assets fetch: ${assetsRes.error.message}`);

  const assets = (assetsRes.data ?? []) as AssetRow[];
  const runningJobs = (jobsRes.data ?? []).length;

  // ── total_shots — from latest APPROVED animatic v1 shot_list ──────────────
  // Pick the most recent approved animatic with a v1 contract.
  const animaticAssets = assets.filter(
    (a) => a.file_type === 'VID-animatic' && (a.status === 'APPROVED' || a.status === 'LOCKED'),
  );
  let totalShots = 0;
  for (const a of animaticAssets) {
    if (isAnimaticV1(a.metadata)) {
      const shotList = (a.metadata as { animatic_v1: { shot_list?: unknown[] } })
        .animatic_v1.shot_list;
      if (Array.isArray(shotList) && shotList.length > totalShots) {
        totalShots = shotList.length;
      }
    }
  }

  // ── VID-shot grouping (one row per shot_id; APPROVED/LOCKED wins) ─────────
  // file_type can be the bare 'VID-shot' (legacy) or 'VID-shot-<variant>'
  // (Pilot Pass / fan-out path). Both shapes map to the same shot_id via
  // metadata.shot_id. Only rows with a valid shot_id are counted toward the
  // animatic-derived progress (legacy rows without metadata.shot_id — e.g.
  // pre-Pilot-Pass mock runs that wrote `shot1/shot2/shot3` without
  // metadata — would otherwise inflate approved_count above total_shots).
  const vidShots = assets.filter((a) => a.file_type.startsWith('VID-shot'));
  const byShot = new Map<string, AssetRow[]>();
  for (const a of vidShots) {
    const sid = getVidShotShotId(a.metadata);
    if (!sid) continue; // skip legacy rows without canonical shot_id
    if (!byShot.has(sid)) byShot.set(sid, []);
    byShot.get(sid)!.push(a);
  }

  // For each shot_id, the LATEST row (highest version, or newest created_at as
  // tiebreak) is what represents the "current cohort". Older rows for the same
  // shot are historical (e.g. demoted REVISION from a prior provider switch).
  // Without this rule the pillbar would show 13/13 APPROVED even after
  // re-triggering with a new provider — old mock APPROVEDs would shadow the
  // fresh REVIEW rows.
  function pickLatest(rows: AssetRow[]): AssetRow {
    return rows.reduce((best, r) => {
      const bv = best.version ?? 0;
      const rv = r.version ?? 0;
      if (rv > bv) return r;
      if (rv < bv) return best;
      return r.created_at > best.created_at ? r : best;
    });
  }

  const approvedShotIds = new Set<string>();
  const reviewShotIds = new Set<string>();
  for (const [sid, rows] of byShot) {
    const latest = pickLatest(rows);
    if (latest.status === 'APPROVED' || latest.status === 'LOCKED') {
      approvedShotIds.add(sid);
    } else if (latest.status === 'REVIEW') {
      reviewShotIds.add(sid);
    }
  }

  // ── pilot_shot_ids — distinct shot_ids of VID-shot assets marked vgen_pilot.
  // Apply the same "latest row wins" rule so pilots from a previous run that
  // are now REVISION (demoted) don't bleed into the current cohort.
  const pilotShotIdSet = new Set<string>();
  for (const [sid, rows] of byShot) {
    const latest = pickLatest(rows);
    if (isPilotMeta(latest.metadata)) {
      pilotShotIdSet.add(sid);
    }
  }
  const pilotShotIds = [...pilotShotIdSet];

  const pilotApprovedCount = pilotShotIds.filter((sid) => approvedShotIds.has(sid)).length;

  // Fallback: if total_shots couldn't be determined from animatic, use byShot.size
  // so the UI still has a sensible upper bound.
  if (totalShots === 0 && byShot.size > 0) {
    totalShots = byShot.size;
  }

  // Final safety cap — approved can't logically exceed total. Without this,
  // edge cases (manual DB inserts, legacy rows that DO have a shot_id but
  // aren't in the current animatic) could read N/M with N > M in the UI.
  const approvedCount = Math.min(approvedShotIds.size, totalShots || approvedShotIds.size);

  return apiOk({
    episode_id: episodeId,
    pilot_state: pilotState,
    total_shots: totalShots,
    pilot_shot_ids: pilotShotIds,
    pilot_approved_count: pilotApprovedCount,
    approved_count: approvedCount,
    has_vid_shots: vidShots.length > 0,
    running_jobs: runningJobs,
  });
});
