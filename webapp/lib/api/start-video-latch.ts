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

/** A shot-plan row with the id + status the render selection needs. */
export interface ApprovedPlanRow {
  id?: string | null;
  metadata?: unknown;
  content?: string | null;
  status?: string | null;
}

/** A VID-shot row — only used to know which shots already have a video. */
export interface VidRowForFanout {
  metadata?: unknown;
  content?: string | null;
}

/** One shot ready to render straight from its approved plan. */
export interface RenderFanoutShot {
  shotId: string;
  planAssetId: string;
}

/**
 * Pure: the plan→video edge the ref→plan sweep above does NOT cover. Returns the
 * shots that already have an APPROVED/LOCKED plan but no video yet, each paired
 * with its plan asset id, so the latch can fire a plan-driven render
 * (exec-vgen/single-shot) directly.
 *
 * Why this exists (E25 2026-07-10, Director): in a SEQUENTIAL run plans are
 * built progressively BEFORE the video stream is opened, so by the time the
 * Director presses "Start Video" most shots already have an approved plan.
 * selectRetroFanoutShots skips any shot that has a plan, so the latch fired
 * ~nothing and video only started when the Director pushed it through Polina.
 * This closes that gap — pressing Start Video now renders every approved-plan
 * shot that lacks a video, matching the latch's stated intent (ref → plan →
 * critic → video for every approved reference).
 *
 * `plans` MUST be ordered newest-version-first so the first APPROVED plan seen
 * per shot is the canonical one.
 */
export function selectRenderFanoutShots(
  plans: ReadonlyArray<ApprovedPlanRow>,
  videos: ReadonlyArray<VidRowForFanout>,
  excluded: ReadonlySet<string>,
): RenderFanoutShot[] {
  const shotsWithVideo = new Set<string>();
  for (const v of videos) {
    const sid = resolveShotId({ metadata: v.metadata, content: v.content });
    if (sid) shotsWithVideo.add(sid);
  }

  const out: RenderFanoutShot[] = [];
  const seen = new Set<string>();
  for (const p of plans) {
    const status = String(p.status ?? '').toUpperCase();
    if (status !== 'APPROVED' && status !== 'LOCKED') continue;
    if (typeof p.id !== 'string' || p.id.length === 0) continue;
    const sid = resolveShotId({ metadata: p.metadata, content: p.content });
    if (!sid) continue;
    if (excluded.has(sid) || shotsWithVideo.has(sid) || seen.has(sid)) continue;
    seen.add(sid);
    out.push({ shotId: sid, planAssetId: p.id });
  }
  return out;
}
