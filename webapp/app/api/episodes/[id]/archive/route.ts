// ──────────────────────────────────────────────────────────────────────────────
// app/api/episodes/[id]/archive/route.ts
// Director-only endpoint to archive an episode.
// Sprint α→ε kickoff plan, P0(b). 2026-05-14. See migration 0029.
//
// One enum value (`ARCHIVED`) covers both partial and complete archives.
// The structural distinction lives in `metadata.archival.state`:
//   PARTIAL  — pipeline closed before finishing all shots (e.g. Veo quota).
//   COMPLETE — episode finished but explicitly retired (analytics done, no
//              further work expected).
//
// Side-effects performed in a single request:
//   1. Compute current `completed_shots` from APPROVED VID-shot count.
//   2. Cancel zombie jobs (QUEUED/RUNNING/RETRYING) on this episode.
//   3. Write `metadata.archival` payload + flip `status` to ARCHIVED.
//   4. Log a single `episode_archived` activity_event (audit trail).
//
// Idempotent: a second POST with the same body is rejected with 409 because
// the episode is already ARCHIVED. Use the un-archive endpoint (future) or
// edit metadata directly if revival is needed.
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import { NotFoundError, ValidationError, ConflictError } from '@/lib/api/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  state: z.enum(['PARTIAL', 'COMPLETE']),
  reason: z.string().trim().min(1).max(2000),
});

interface ArchivalPayload {
  state: 'PARTIAL' | 'COMPLETE';
  completed_shots: number;
  total_shots: number | null;
  reason: string;
  final_cut_asset_id: string | null;
  final_cut_path: string | null;
  archived_at: string;
  archived_by: string;
}

export const POST = withApiHandler(async (req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const episodeId = params?.id;
  if (!episodeId) throw new NotFoundError('Episode');

  const { user, supabase } = await requireDirector();
  const body = await parseJson(req, Body);

  // 1. Lookup + idempotency guard.
  const { data: ep, error: epErr } = await supabase
    .from('episodes')
    .select('id,episode_code,title_working,status,metadata')
    .eq('id', episodeId)
    .maybeSingle();
  if (epErr) throw new Error(`episode fetch: ${epErr.message}`);
  if (!ep) throw new NotFoundError(`Episode ${episodeId}`);
  if (ep.status === 'ARCHIVED') {
    throw new ConflictError(
      `Episode ${ep.episode_code} is already ARCHIVED. Edit metadata.archival directly to revise.`,
    );
  }

  // 2. Compute completed_shots from APPROVED VID-shot assets.
  const { data: vidShots, error: vErr } = await supabase
    .from('assets')
    .select('id,status,metadata')
    .eq('episode_id', episodeId)
    .like('file_type', 'VID-shot%');
  if (vErr) throw new Error(`vid-shot fetch: ${vErr.message}`);
  const approvedShotIds = new Set<string>();
  for (const a of vidShots ?? []) {
    if (a.status !== 'APPROVED') continue;
    const sid = (a.metadata as { shot_id?: string } | null)?.shot_id;
    if (sid) approvedShotIds.add(sid);
  }
  const completedShots = approvedShotIds.size;

  // total_shots: read from latest APPROVED animatic shot_list, fall back to null.
  let totalShots: number | null = null;
  const { data: animatic } = await supabase
    .from('assets')
    .select('metadata')
    .eq('episode_id', episodeId)
    .like('file_type', '%animatic%')
    .eq('status', 'APPROVED')
    .order('updated_at', { ascending: false })
    .limit(1);
  const shotList = (animatic?.[0]?.metadata as { shot_list?: unknown[] } | null)?.shot_list;
  if (Array.isArray(shotList)) totalShots = shotList.length;

  if (body.state === 'PARTIAL' && totalShots !== null && completedShots >= totalShots) {
    throw new ValidationError(
      `State PARTIAL but all ${totalShots} shots are APPROVED. Use COMPLETE instead.`,
    );
  }

  // 3. Final cut artifact (most recent APPROVED final-cut asset).
  const { data: stitch } = await supabase
    .from('assets')
    .select('id,drive_path')
    .eq('episode_id', episodeId)
    .like('file_type', '%final%')
    .eq('status', 'APPROVED')
    .order('updated_at', { ascending: false })
    .limit(1);
  const finalCut = stitch?.[0];

  // 4. Build archival payload.
  const archival: ArchivalPayload = {
    state: body.state,
    completed_shots: completedShots,
    total_shots: totalShots,
    reason: body.reason,
    final_cut_asset_id: finalCut?.id ?? null,
    final_cut_path: finalCut?.drive_path ?? null,
    archived_at: new Date().toISOString(),
    archived_by: user.email ?? user.id,
  };

  // 5. Cancel zombie jobs.
  const { data: activeJobs } = await supabase
    .from('jobs')
    .select('id,agent_id,inngest_event')
    .eq('episode_id', episodeId)
    .in('status', ['QUEUED', 'RUNNING', 'RETRYING']);
  const cancelledIds = (activeJobs ?? []).map((j) => j.id);
  if (cancelledIds.length > 0) {
    const { error: jobErr } = await supabase
      .from('jobs')
      .update({ status: 'CANCELLED', completed_at: new Date().toISOString() })
      .in('id', cancelledIds);
    if (jobErr) throw new Error(`job cancel: ${jobErr.message}`);
  }

  // 6. Flip episode status + write metadata.
  const currentMeta = (ep.metadata ?? {}) as Record<string, unknown>;
  const newMeta = { ...currentMeta, archival };
  const { error: upErr } = await supabase
    .from('episodes')
    .update({
      status: 'ARCHIVED',
      metadata: newMeta as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', episodeId);
  if (upErr) throw new Error(`episode update: ${upErr.message}`);

  // 7. Audit event.
  const cancelledSummary = (activeJobs ?? []).map((j) => ({
    id: j.id,
    agent_id: j.agent_id,
    inngest_event: j.inngest_event,
  }));
  await supabase.from('activity_events').insert({
    event_type: 'episode_archived',
    severity: 'info',
    title: `Episode ${ep.episode_code} archived (${body.state} · ${completedShots}/${totalShots ?? '?'} shots)`,
    description: body.reason,
    actor: user.email ?? user.id,
    episode_id: episodeId,
    metadata: {
      kind: 'episode_archived',
      archival,
      cancelled_jobs: cancelledSummary,
    },
  } as never);

  return apiOk({
    episode_id: episodeId,
    status: 'ARCHIVED',
    archival,
    cancelled_jobs: cancelledIds.length,
  });
});
