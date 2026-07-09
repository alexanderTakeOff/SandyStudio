// ──────────────────────────────────────────────────────────────────────────────
// lib/api/start-video-latch.ts
// Pure decision seam for the "Start Video" latch (2026-07-09, animatic-stage
// demotion). Extracted from app/api/episodes/[id]/start-video/route.ts so the
// retro-fanout shot selection is unit-testable without mocking auth / inngest /
// supabase (mirrors decideFanoutEmit in inngest/functions/exec-vgen.ts).
// ──────────────────────────────────────────────────────────────────────────────

import { isShotReferenceV2 } from '@/lib/api/shot-reference';
import { resolveShotId } from '@/lib/api/shot-identity';

/** Minimal asset shape the selection needs — a v2 shot reference row. */
export interface RefRowForFanout {
  metadata?: unknown;
}

/** Minimal shot-plan row shape — resolveShotId reads metadata or content. */
export interface PlanRowForFanout {
  metadata?: unknown;
  content?: string | null;
}

/**
 * Pure: given the episode's APPROVED references, its existing shot plans, and the
 * excluded-shot set, return the deduped shot_ids that should fan out to their
 * Video Designer when the latch opens. A shot fires iff it has a valid v2
 * shot_reference, is NOT excluded, and has NO plan yet — the parallel edge in
 * next-events only fires for NEW approvals, so this sweeps the pre-latch backlog.
 */
export function selectRetroFanoutShots(
  refs: ReadonlyArray<RefRowForFanout>,
  plans: ReadonlyArray<PlanRowForFanout>,
  excluded: ReadonlySet<string>,
): string[] {
  const shotsWithPlan = new Set<string>();
  for (const p of plans) {
    const sid = resolveShotId({ metadata: p.metadata, content: p.content });
    if (sid) shotsWithPlan.add(sid);
  }

  const fired: string[] = [];
  for (const r of refs) {
    if (!isShotReferenceV2(r.metadata)) continue;
    const shotId = (r.metadata as { shot_reference?: { shot_id?: unknown } }).shot_reference
      ?.shot_id;
    if (typeof shotId !== 'string' || shotId.length === 0) continue;
    if (excluded.has(shotId) || shotsWithPlan.has(shotId)) continue;
    if (fired.includes(shotId)) continue;
    fired.push(shotId);
  }
  return fired;
}
