// ──────────────────────────────────────────────────────────────────────────────
// app/api/episodes/[id]/vgen/approve-pilots/route.ts
// VGEN Pilot Pass → Fan-out trigger.
//
// Mirrors EREF's approve-pilots flow (purrfect-stirring-hollerith, Phase 1).
//
// Flow:
//   1. EXEC-VGEN-PILOT generated 1-2 pilot shots → vgen_pilot_state=PENDING_REVIEW
//   2. Director approved each pilot in the drawer (per-shot APPROVE).
//   3. Director clicks "Approve Direction & Fan Out" — POST here.
//   4. Validate: state=PENDING_REVIEW AND every pilot shot's most-recent VID-shot
//      is APPROVED.
//   5. Set state=FANOUT_RUNNING; emit `sandystudio/exec-vgen/fanout-trigger`.
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
  getVgenPilotState,
  setVgenPilotState,
} from '@/lib/api/vgen-pilot-state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  directorConfirm: z.boolean().optional(),
});

export const POST = withApiHandler(async (req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const episodeId = params?.id;
  if (!episodeId) throw new NotFoundError('Episode');

  const { user, supabase } = await requireDirector();
  const body = await parseJson(req, Body);

  const { data: ep, error: epErr } = await supabase
    .from('episodes')
    .select('id,governance_mode,episode_code')
    .eq('id', episodeId)
    .maybeSingle();
  if (epErr) throw new Error(`episode fetch: ${epErr.message}`);
  if (!ep) throw new NotFoundError(`Episode ${episodeId}`);

  // Mode gate (Category C — Director auth + episode existence)
  const decision = enforceMode('AGENT_RUN', ep as GovernanceEpisode, {
    directorConfirm: body.directorConfirm ?? true,
    confirmedBy: user.id,
  });
  if (!decision.passed) {
    throw new GovernanceBlockError(decision.reason ?? 'Governance gate refused');
  }

  // ── State + invariant checks ───────────────────────────────────────────────
  const state = await getVgenPilotState(supabase, episodeId);
  if (state !== 'PENDING_REVIEW') {
    throw new ConflictError(
      `VGEN pilot fan-out requires vgen_pilot_state=PENDING_REVIEW (got ${state})`,
    );
  }

  // Verify at least one VID-shot in REVIEW or APPROVED status that's marked
  // as a pilot in metadata.vgen_pilot=true. Director must have approved
  // every pilot shot before fan-out can proceed.
  // VID-shot rows carry a per-shot variant suffix in their file_type
  // (e.g. "VID-shot-ss-s14-e01-a1-sc01-sh01"). Use prefix match instead of
  // `.eq()` so we catch every variant.
  const { data: pilotShots, error: pilotErr } = await supabase
    .from('assets')
    .select('id,status,metadata,filename')
    .eq('episode_id', episodeId)
    .like('file_type', 'VID-shot%');
  if (pilotErr) throw new Error(`pilot shots fetch: ${pilotErr.message}`);
  // Only consider pilot rows in an "active" status. REVISION / REJECTED /
  // INVALIDATED are explicitly out of consideration — they include rows
  // demoted from a previous run, manually rejected pilots, etc. Without this
  // filter a re-trigger after a demote leaves leftover rows that block
  // fan-out forever even after the new cohort is fully approved.
  const ACTIVE_PILOT_STATUSES = new Set(['REVIEW', 'APPROVED', 'LOCKED', 'NEEDS_HUMAN_TWEAK']);
  const pilots = (pilotShots ?? []).filter((row) => {
    const meta = (row as { metadata?: unknown }).metadata;
    if (!meta || typeof meta !== 'object') return false;
    if (!ACTIVE_PILOT_STATUSES.has(row.status as string)) return false;
    return (meta as { vgen_pilot?: unknown }).vgen_pilot === true;
  });
  if (pilots.length === 0) {
    throw new ConflictError(
      'No VGEN pilot shots found for this episode — re-run VGEN start before fan-out',
    );
  }
  // Dedupe by canonical shot_id so multi-version pilot rows for the same
  // shot (e.g. v01 REVIEW + v02 APPROVED after a regenerate) collapse to a
  // single entry. The newest APPROVED wins; REVIEW entries fail the
  // unapproved check until Director acts.
  const byShotId = new Map<string, { status: string; filename: string }>();
  for (const row of pilots) {
    const meta = row.metadata as { shot_id?: unknown };
    const sid = typeof meta?.shot_id === 'string' ? meta.shot_id : row.id;
    const prior = byShotId.get(sid);
    // APPROVED outranks REVIEW; later created_at outranks earlier when same status.
    if (!prior) {
      byShotId.set(sid, { status: row.status, filename: row.filename });
    } else if (prior.status !== 'APPROVED' && row.status === 'APPROVED') {
      byShotId.set(sid, { status: row.status, filename: row.filename });
    }
  }
  const dedupedPilots = [...byShotId.values()];
  const unapproved = dedupedPilots.filter((row) => row.status !== 'APPROVED');
  if (unapproved.length > 0) {
    throw new ConflictError(
      `Director must APPROVE all VGEN pilot shots before fan-out (got ${dedupedPilots.length - unapproved.length}/${dedupedPilots.length} approved)`,
    );
  }

  // ── Fire fan-out ───────────────────────────────────────────────────────────
  await setVgenPilotState(supabase, episodeId, 'FANOUT_RUNNING');

  const { ids } = await inngest.send({
    name: 'sandystudio/exec-vgen/fanout-trigger',
    data: { episodeId } as never,
  });

  await supabase.from('activity_events').insert({
    event_type: 'manual_trigger',
    severity: 'info',
    title: 'VGEN fan-out triggered',
    description: `Director ${user.email ?? user.id} approved direction; fanning out ${dedupedPilots.length} pilot shots → remaining shots`,
    actor: user.id,
    episode_id: episodeId,
    metadata: {
      kind: 'vgen_fanout',
      pilot_count: dedupedPilots.length,
      inngest_event_ids: ids,
    },
  } as never);

  return apiOk({
    triggered: true,
    pilot_state: 'FANOUT_RUNNING',
    pilot_count: dedupedPilots.length,
    inngest_event: 'sandystudio/exec-vgen/fanout-trigger',
    inngest_event_ids: ids,
  });
});
