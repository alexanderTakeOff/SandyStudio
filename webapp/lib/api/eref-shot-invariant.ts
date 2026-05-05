// ──────────────────────────────────────────────────────────────────────────────
// lib/api/eref-shot-invariant.ts
// Computes the "1 shot ↔ 1 approved image" gate state for an episode.
//
// Used by:
//   - GET /api/episodes/[id]/eref/advance — to decide if Director's button
//     unlocks (all shots covered → fire animatic event)
//   - The EREFPilotPillbar (Track B) — render "Reviewed: 8/13 shots" badge
//
// Reads:
//   - APPROVED storyboard asset (STB-storyboard) — to learn total shot count
//   - assets table — counts APPROVED IMG-episode_ref% by shot_id
//
// Returns:
//   - totalShots: integer
//   - approvedCount: distinct shot_ids with at least one APPROVED EREF
//   - missing: shot_ids with no APPROVED EREF yet
//   - duplicates: shot_ids with > 1 APPROVED (defensive — DB partial unique
//     index in 0024 should make this impossible, but report if observed)
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/types.gen';

export interface ShotApprovalProgress {
  totalShots: number;
  approvedCount: number;
  missing: string[];
  duplicates: string[];
}

interface StoryboardShot {
  shot_id: string;
}

function parseStoryboardShots(content: string): StoryboardShot[] {
  const matches = [...content.matchAll(/```json\s*([\s\S]+?)```/g)];
  if (matches.length === 0) return [];
  const last = matches[matches.length - 1]?.[1];
  if (!last) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(last.trim());
  } catch {
    return [];
  }
  const acts = (parsed as { acts?: unknown[] }).acts;
  if (!Array.isArray(acts)) return [];
  const shots: StoryboardShot[] = [];
  for (const act of acts) {
    const a = act as { shots?: unknown[] };
    if (!Array.isArray(a.shots)) continue;
    for (const s of a.shots) {
      const sh = s as { shot_id?: unknown };
      if (typeof sh.shot_id === 'string' && sh.shot_id.length > 0) {
        shots.push({ shot_id: sh.shot_id });
      }
    }
  }
  return shots;
}

interface AssetMetadataShotRef {
  shot_reference?: { shot_id?: unknown } | null;
}

function readShotIdFromMetadata(meta: unknown): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const sr = (meta as AssetMetadataShotRef).shot_reference;
  if (!sr || typeof sr !== 'object') return null;
  const id = (sr as { shot_id?: unknown }).shot_id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

export async function getShotApprovalProgress(
  supabase: SupabaseClient<Database>,
  episodeId: string,
): Promise<ShotApprovalProgress> {
  // ── Step 1: load the latest APPROVED storyboard for this episode ──
  const { data: stbRows, error: stbErr } = await supabase
    .from('assets')
    .select('content,version')
    .eq('episode_id', episodeId)
    .eq('file_type', 'STB-storyboard')
    .eq('status', 'APPROVED')
    .order('version', { ascending: false })
    .limit(1);
  if (stbErr) {
    throw new Error(`storyboard fetch failed: ${stbErr.message}`);
  }
  const stb = stbRows?.[0];
  const shots = stb?.content ? parseStoryboardShots(stb.content) : [];
  const totalShots = shots.length;

  // ── Step 2: count APPROVED EREF assets grouped by shot_id ──
  const { data: erefRows, error: erefErr } = await supabase
    .from('assets')
    .select('id,metadata')
    .eq('episode_id', episodeId)
    .eq('status', 'APPROVED')
    .like('file_type', 'IMG-episode_ref%');
  if (erefErr) {
    throw new Error(`approved EREF fetch failed: ${erefErr.message}`);
  }

  const approvedByShot = new Map<string, number>();
  for (const row of erefRows ?? []) {
    const sid = readShotIdFromMetadata((row as { metadata?: unknown }).metadata);
    if (!sid) continue;
    approvedByShot.set(sid, (approvedByShot.get(sid) ?? 0) + 1);
  }

  const approvedShotIds = new Set(approvedByShot.keys());
  const missing: string[] = [];
  for (const shot of shots) {
    if (!approvedShotIds.has(shot.shot_id)) missing.push(shot.shot_id);
  }
  const duplicates: string[] = [];
  for (const [sid, count] of approvedByShot.entries()) {
    if (count > 1) duplicates.push(sid);
  }

  return {
    totalShots,
    approvedCount: approvedByShot.size,
    missing,
    duplicates,
  };
}
