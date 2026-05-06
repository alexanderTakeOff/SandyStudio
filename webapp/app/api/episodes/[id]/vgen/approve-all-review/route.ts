// ──────────────────────────────────────────────────────────────────────────────
// app/api/episodes/[id]/vgen/approve-all-review/route.ts
//
// Bulk-approve every VID-shot row in REVIEW status for one episode.
//
// Phase 1 helper for the Director — without it, approving 11 fan-out shots
// individually after Pilot Pass takes 11 round trips through the drawer.
// This route does the equivalent of "click Approve on every REVIEW VID-shot
// row" in a single call: sets status=APPROVED + writes activity events.
//
// Director-only. Does NOT bypass the 1-shot-1-approved invariant — the DB
// constraint (migration 0024) still enforces uniqueness, so any clash returns
// an error and the route reports which shots were affected.
//
// Body: { directorConfirm: true }
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import {
  GovernanceBlockError,
  NotFoundError,
} from '@/lib/api/errors';
import { enforceMode, type GovernanceEpisode } from '@/lib/governance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  directorConfirm: z.boolean().optional(),
});

interface ReviewRow {
  id: string;
  filename: string;
  status: string;
}

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

  // Find every VID-shot row currently in REVIEW for this episode.
  const { data: rows, error: rowsErr } = await supabase
    .from('assets')
    .select('id,filename,status')
    .eq('episode_id', episodeId)
    .like('file_type', 'VID-shot%')
    .eq('status', 'REVIEW');
  if (rowsErr) throw new Error(`review rows fetch: ${rowsErr.message}`);
  const reviewRows = (rows ?? []) as ReviewRow[];

  if (reviewRows.length === 0) {
    return apiOk({ approved: 0, skipped: 0, message: 'no REVIEW shots to approve' });
  }

  // Flip each row sequentially — bulk update is fine but per-row gives us
  // per-row error reporting if a unique constraint trips.
  let approved = 0;
  let skipped = 0;
  const errors: Array<{ id: string; filename: string; error: string }> = [];
  for (const row of reviewRows) {
    const { error: updErr } = await supabase
      .from('assets')
      .update({ status: 'APPROVED' } as never)
      .eq('id', row.id)
      .eq('status', 'REVIEW'); // optimistic — skip if status already changed
    if (updErr) {
      errors.push({ id: row.id, filename: row.filename, error: updErr.message });
      skipped++;
      continue;
    }
    approved++;
    // Fire-and-forget activity event (don't fail the whole call if one insert fails).
    await supabase
      .from('activity_events')
      .insert({
        event_type: 'approval_granted',
        severity: 'info',
        title: `APPROVE on ${row.filename}`,
        description: `Bulk approve: VGEN fan-out (${approved}/${reviewRows.length})`,
        actor: user.id,
        episode_id: episodeId,
        asset_id: row.id,
        metadata: { agent: 'EXEC-VGEN', kind: 'vgen_bulk_approve' },
      } as never)
      .then(
        () => undefined,
        () => undefined,
      );
  }

  return apiOk({
    approved,
    skipped,
    total_review: reviewRows.length,
    errors: errors.slice(0, 10), // cap noise
  });
});
