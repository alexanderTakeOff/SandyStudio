// ──────────────────────────────────────────────────────────────────────────────
// app/api/episodes/[id]/eref/approve-pilots/route.ts
// Pilot Pass → Fan-out trigger.
//
// Flow (technology.md §4):
//   1. EXEC-EREF generated 2 pilot shots → eref_pilot_state = PENDING_REVIEW
//   2. Director per-image reviewed and APPROVED both pilot candidates
//   3. Director clicks "Approve Direction & Fan Out" — POST to this route
//   4. We validate: state=PENDING_REVIEW AND ≥ pilot_count distinct shot_ids
//      have an APPROVED EREF asset
//   5. Set state=FANOUT_RUNNING; emit `sandystudio/exec-eref/fanout-trigger`
//      so the runner re-enters at start_index=2 and finishes the rest
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import {
  ConflictError,
  GovernanceBlockError,
  NotFoundError,
} from '@/lib/api/errors';
import { enforceMode, type GovernanceEpisode } from '@/lib/governance';
import { inngest } from '@/lib/inngest/client';
import {
  getPilotState,
  setPilotState,
} from '@/lib/api/eref-pilot-state';
import { getShotApprovalProgress } from '@/lib/api/eref-shot-invariant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  pilot_count: z.number().int().min(1).max(8).optional(),
  directorConfirm: z.boolean().optional(),
});

const DEFAULT_PILOT_COUNT = 2;

export const POST = withApiHandler(async (req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const episodeId = params?.id;
  if (!episodeId) throw new NotFoundError('Episode');

  const { user, supabase } = await requireDirector();
  const body = await parseJson(req, Body);
  const pilotCount = body.pilot_count ?? DEFAULT_PILOT_COUNT;

  const { data: ep, error: epErr } = await supabase
    .from('episodes')
    .select('id,governance_mode,episode_code')
    .eq('id', episodeId)
    .maybeSingle();
  if (epErr) throw new Error(`episode fetch: ${epErr.message}`);
  if (!ep) throw new NotFoundError(`Episode ${episodeId}`);

  // Mode gate: AGENT_RUN is Category C — Director auth + episode existence
  // is enough to fire downstream. enforceMode is still called to write
  // mode_at_time into audit trail.
  const decision = enforceMode('AGENT_RUN', ep as GovernanceEpisode, {
    directorConfirm: body.directorConfirm ?? true,
    confirmedBy: user.id,
  });
  if (!decision.passed) {
    throw new GovernanceBlockError(decision.reason ?? 'Governance gate refused');
  }

  // ── State + invariant checks ───────────────────────────────────────────────
  const state = await getPilotState(supabase, episodeId);
  if (state !== 'PENDING_REVIEW') {
    throw new ConflictError(
      `Pilot fan-out requires eref_pilot_state=PENDING_REVIEW (got ${state})`,
    );
  }

  const progress = await getShotApprovalProgress(supabase, episodeId);
  if (progress.approvedCount < pilotCount) {
    throw new ConflictError(
      `Director must APPROVE all pilot shots before fan-out (got ${progress.approvedCount}/${pilotCount} approved)`,
    );
  }

  // ── Fire fan-out ───────────────────────────────────────────────────────────
  await setPilotState(supabase, episodeId, 'FANOUT_RUNNING');

  // Sprint τ (2026-05-15) — mirror state into episodes.metadata so the
  // browser-side EREFPilotPillbar (which reads episode.metadata.eref_*)
  // sees FANOUT_RUNNING immediately and can switch to the FanoutHeadline.
  // The app_config setPilotState above is still authoritative for server-
  // side lookups (getPilotState); episodes.metadata is the UI mirror.
  //
  // We also persist `eref_total_shots` (parsed from the latest APPROVED
  // storyboard JSON) so the headline counter has a real denominator from
  // the moment fan-out fires — eliminates the "0/2 shots" misread when
  // only the 2 pilots are in DB.
  try {
    let totalShots: number | null = null;
    const { data: stbAsset } = await supabase
      .from('assets')
      .select('content')
      .eq('episode_id', episodeId)
      .like('file_type', 'STB-storyboard%')
      .eq('status', 'APPROVED')
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    const stbContent = (stbAsset as { content?: string } | null)?.content ?? '';
    const m = /```json\s*([\s\S]*?)```/i.exec(stbContent);
    if (m && m[1]) {
      try {
        const body = JSON.parse(m[1]) as { acts?: Array<{ shots?: unknown[] }> };
        if (Array.isArray(body.acts)) {
          totalShots = body.acts.reduce(
            (sum, a) => sum + (Array.isArray(a.shots) ? a.shots.length : 0),
            0,
          );
        }
      } catch {
        /* leave totalShots null */
      }
    }

    const { data: epRow } = await supabase
      .from('episodes')
      .select('metadata')
      .eq('id', episodeId)
      .maybeSingle();
    const prevMeta = ((epRow as { metadata?: unknown } | null)?.metadata as Record<string, unknown> | null) ?? {};
    const nextMeta = {
      ...prevMeta,
      eref_pilot_state: 'FANOUT_RUNNING' as const,
      eref_pilot_state_at: new Date().toISOString(),
      eref_pilot_count: pilotCount,
      ...(totalShots !== null && totalShots > 0 ? { eref_total_shots: totalShots } : {}),
    };
    await supabase
      .from('episodes')
      .update({ metadata: nextMeta as never })
      .eq('id', episodeId);
  } catch {
    // Metadata mirror is a UI-helper, never block fan-out on it.
  }

  const { ids } = await inngest.send({
    name: 'sandystudio/exec-eref/fanout-trigger',
    data: {
      episodeId,
      start_index: pilotCount,
    } as never,
  });

  await supabase.from('activity_events').insert({
    event_type: 'manual_trigger',
    severity: 'info',
    title: 'EREF fan-out triggered',
    description: `Director ${user.email ?? user.id} approved direction; fanning out from index ${pilotCount}`,
    actor: user.id,
    episode_id: episodeId,
    metadata: {
      kind: 'eref_fanout',
      pilot_count: pilotCount,
      approved_pilots: progress.approvedCount,
      inngest_event_ids: ids,
    },
  } as never);

  return apiOk({
    triggered: true,
    pilot_state: 'FANOUT_RUNNING',
    start_index: pilotCount,
    inngest_event: 'sandystudio/exec-eref/fanout-trigger',
    inngest_event_ids: ids,
  });
});
