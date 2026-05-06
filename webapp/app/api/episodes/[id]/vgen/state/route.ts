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
    supabase
      .from('assets')
      .select('id,file_type,status,metadata')
      .eq('episode_id', episodeId)
      .in('file_type', ['VID-animatic', 'VID-shot']),
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
  const vidShots = assets.filter((a) => a.file_type === 'VID-shot');
  const byShot = new Map<string, AssetRow[]>();
  for (const a of vidShots) {
    const sid = getVidShotShotId(a.metadata) ?? a.id; // fallback per-asset
    if (!byShot.has(sid)) byShot.set(sid, []);
    byShot.get(sid)!.push(a);
  }

  const approvedShotIds = new Set<string>();
  for (const [sid, rows] of byShot) {
    if (rows.some((r) => r.status === 'APPROVED' || r.status === 'LOCKED')) {
      approvedShotIds.add(sid);
    }
  }

  // ── pilot_shot_ids — distinct shot_ids of VID-shot assets marked vgen_pilot
  const pilotShotIdSet = new Set<string>();
  for (const a of vidShots) {
    if (!isPilotMeta(a.metadata)) continue;
    const sid = getVidShotShotId(a.metadata);
    if (sid) pilotShotIdSet.add(sid);
  }
  const pilotShotIds = [...pilotShotIdSet];

  const pilotApprovedCount = pilotShotIds.filter((sid) => approvedShotIds.has(sid)).length;

  // Fallback: if total_shots couldn't be determined from animatic, use byShot.size
  // so the UI still has a sensible upper bound.
  if (totalShots === 0 && byShot.size > 0) {
    totalShots = byShot.size;
  }

  return apiOk({
    episode_id: episodeId,
    pilot_state: pilotState,
    total_shots: totalShots,
    pilot_shot_ids: pilotShotIds,
    pilot_approved_count: pilotApprovedCount,
    approved_count: approvedShotIds.size,
    has_vid_shots: vidShots.length > 0,
    running_jobs: runningJobs,
  });
});
