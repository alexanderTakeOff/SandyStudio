// ──────────────────────────────────────────────────────────────────────────────
// lib/api/anchor-usage.ts
// The REVERSE of `checkPlanAnchorFreshness`: given a reference frame, which
// APPROVED Plans are anchored to it?
//
// Why this exists (S20-E01, 2026-07-31): the anchor link is one-directional. A
// Plan records the frame it was authored against; the frame knows nothing about
// the Plans depending on it. So approving a different version of SH04 silently
// invalidated five sibling Plans — the Director could not have seen the cost of
// that click, because nothing on the screen knew it existed.
//
// Lives in lib/api (not next to `checkPlanAnchorFreshness`) purely to avoid an
// import cycle: `episode-references.ts` already imports the freshness module, and
// this needs `parseContinuityAnchors` FROM `episode-references.ts`.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/types.gen';
import {
  parseContinuityAnchors,
  parseLastJsonBlock,
} from '../agents/runners/episode-references';
import type { ContinuityAnchorKind } from '../agents/runners/episode-references';

/** One Plan that would go stale if the given anchor frame were replaced. */
export interface AnchoredPlan {
  planAssetId: string;
  planFilename: string;
  shotId: string;
  anchorKind: ContinuityAnchorKind;
}

interface PlanRow {
  id: string;
  filename: string;
  content: string | null;
  created_at: string | null;
  metadata: unknown;
}

/**
 * Every APPROVED `SPC-ref_plan` of the episode whose continuity anchors point at
 * `assetId`. Empty array when nothing depends on the frame — the common case, and
 * the one where the UI stays silent.
 *
 * Best-effort by design: a Plan whose content does not parse is skipped rather
 * than throwing. This function only ever ADDS a warning to a screen; it must
 * never be the reason an approval fails.
 */
export async function findPlansAnchoredTo(
  supabase: SupabaseClient<Database>,
  episodeId: string,
  assetId: string,
): Promise<AnchoredPlan[]> {
  if (!episodeId || !assetId) return [];

  const { data, error } = await supabase
    .from('assets')
    .select('id,filename,content,created_at,metadata')
    .eq('episode_id', episodeId)
    .eq('status', 'APPROVED')
    .like('file_type', 'SPC-ref_plan%');
  if (error) return [];

  const out: AnchoredPlan[] = [];
  for (const row of (data ?? []) as PlanRow[]) {
    if (!row.content) continue;
    let anchors: ReturnType<typeof parseContinuityAnchors>;
    try {
      const body = parseLastJsonBlock(row.content);
      if (!body) continue;
      anchors = parseContinuityAnchors(body, row.created_at ?? new Date(0).toISOString());
    } catch {
      continue; // unparseable Plan — not a reason to block the caller
    }
    const hit = anchors.find((a) => a.assetId === assetId);
    if (!hit) continue;
    out.push({
      planAssetId: row.id,
      planFilename: row.filename,
      shotId: shotIdOf(row),
      anchorKind: hit.kind,
    });
  }
  return out;
}

/** Shot id from the Plan's metadata, falling back to the filename convention. */
function shotIdOf(row: PlanRow): string {
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  if (typeof meta.shot_id === 'string' && meta.shot_id) return meta.shot_id;
  const m = row.filename.match(/(S\d+-E\d+-SH\d+)/i);
  return m ? m[1] : '';
}

/** One-line Russian summary for the approval surfaces. Empty when nothing depends. */
export function formatAnchorUsage(plans: ReadonlyArray<AnchoredPlan>): string {
  if (plans.length === 0) return '';
  const shots = [...new Set(plans.map((p) => p.shotId).filter(Boolean))].sort();
  return `Этот кадр — якорь непрерывности для ${shots.join(', ')}. Замена потребует перевыпуска ${shots.length === 1 ? 'его плана' : 'их планов'}.`;
}
