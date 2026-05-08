// ──────────────────────────────────────────────────────────────────────────────
// app/api/episodes/[id]/eref/advance/route.ts
// "Advance to Animatic" gate.
//
// Validates the 1-shot-1-approved invariant (every storyboard shot must have
// at least one APPROVED IMG-episode_ref) and emits the EXEC-EDIT event
// carrying the list of approved EREF asset ids.
//
// Returns 409 with `missing` shot_ids when the gate is not yet satisfied so
// the UI can show "Advance" disabled with the reason.
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
import { getShotApprovalProgress } from '@/lib/api/eref-shot-invariant';

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

  const decision = enforceMode('AGENT_RUN', ep as GovernanceEpisode, {
    directorConfirm: body.directorConfirm ?? true,
    confirmedBy: user.id,
  });
  if (!decision.passed) {
    throw new GovernanceBlockError(decision.reason ?? 'Governance gate refused');
  }

  // ── Invariant check ────────────────────────────────────────────────────────
  const progress = await getShotApprovalProgress(supabase, episodeId);
  if (
    progress.totalShots === 0 ||
    progress.approvedCount !== progress.totalShots ||
    progress.missing.length > 0
  ) {
    // Use ConflictError carrier (409) so the UI can branch on `details`.
    throw new ConflictError(
      `Cannot advance: ${progress.approvedCount}/${progress.totalShots} shots have an APPROVED EREF; missing ${progress.missing.length}`,
    );
  }

  // ── Collect approved EREF asset ids ───────────────────────────────────────
  const { data: approvedAssets, error: erefErr } = await supabase
    .from('assets')
    .select('id')
    .eq('episode_id', episodeId)
    .eq('status', 'APPROVED')
    .like('file_type', 'IMG-episode_ref%');
  if (erefErr) {
    throw new Error(`approved EREF fetch: ${erefErr.message}`);
  }
  const storyboardAssetIds = (approvedAssets ?? []).map((a) => a.id);

  // Phase A.2 PR γ (LT-04, 2026-05-08): pass APPROVED music asset id to
  // EXEC-EDIT so the produced animatic bakes the music URL in. EDIT runs
  // even without music (legacy path) — the runner will silently fall
  // through to upload-music's contract update. With music, animatic
  // playback is ready for pacing review immediately.
  const { data: musicRow } = await supabase
    .from('assets')
    .select('id')
    .eq('episode_id', episodeId)
    .eq('file_type', 'AUD-music')
    .eq('status', 'APPROVED')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const musicAssetId = (musicRow as { id?: string } | null)?.id ?? null;

  // ── Fire downstream Animatic event ────────────────────────────────────────
  const { ids } = await inngest.send({
    name: 'sandystudio/exec-edit/create-animatic',
    data: {
      episodeId,
      storyboardAssetIds,
      ...(musicAssetId ? { musicAssetId } : {}),
    } as never,
  });

  await supabase.from('activity_events').insert({
    event_type: 'manual_trigger',
    severity: 'info',
    title: 'Advanced to Animatic',
    description: `Director ${user.email ?? user.id} advanced ${storyboardAssetIds.length} approved shots to EXEC-EDIT`,
    actor: user.id,
    episode_id: episodeId,
    metadata: {
      kind: 'eref_advance',
      approved_asset_count: storyboardAssetIds.length,
      inngest_event_ids: ids,
    },
  } as never);

  return apiOk({
    advanced: true,
    approved_count: progress.approvedCount,
    total_shots: progress.totalShots,
    storyboard_asset_ids: storyboardAssetIds,
    inngest_event: 'sandystudio/exec-edit/create-animatic',
    inngest_event_ids: ids,
  });
});
