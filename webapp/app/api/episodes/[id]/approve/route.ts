// ──────────────────────────────────────────────────────────────────────────────
// app/api/episodes/[id]/approve/route.ts
// Episode-level approval. Used for milestone approvals like "approve brief"
// which kicks the script pipeline.
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import { NotFoundError, GovernanceBlockError, ValidationError } from '@/lib/api/errors';
import { enforceMode, type GovernanceEpisode } from '@/lib/governance';
import { inngest } from '@/lib/inngest/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ApproveBody = z.object({
  approvalType: z.string().min(1),
  notes: z.string().max(2000).optional(),
  directorConfirm: z.boolean().optional(),
});

export const POST = withApiHandler(async (req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const id = params?.id;
  if (!id) throw new NotFoundError('Episode');

  const { user, supabase } = await requireDirector();
  const body = await parseJson(req, ApproveBody);

  const { data: ep, error: epErr } = await supabase
    .from('episodes')
    .select('id,governance_mode,episode_code,status')
    .eq('id', id)
    .maybeSingle();
  if (epErr) throw new Error(`episode fetch failed: ${epErr.message}`);
  if (!ep) throw new NotFoundError(`Episode ${id}`);

  // Governance check (Phase 4 enforces only PUBLISH; rest pass through)
  const action: 'PUBLISH' | 'AGENT_RUN' =
    body.approvalType.toUpperCase() === 'PUBLISH' ? 'PUBLISH' : 'AGENT_RUN';
  const decision = enforceMode(action, ep as GovernanceEpisode, {
    directorConfirm: body.directorConfirm,
    confirmedBy: user.id,
  });
  if (!decision.passed) {
    throw new GovernanceBlockError(decision.reason ?? 'Governance gate refused approval');
  }

  // Insert approval row
  await supabase.from('approvals').insert({
    episode_id: id,
    approved_by: 'DIRECTOR',
    approval_type: body.approvalType,
    notes: body.notes ?? null,
  });

  await supabase.from('activity_events').insert({
    event_type: 'approval_granted',
    severity: 'info',
    title: `Approved ${body.approvalType} on ${ep.episode_code}`,
    description: body.notes ?? `Director ${user.email ?? user.id} approved`,
    actor: user.id,
    episode_id: id,
    metadata: { approval_type: body.approvalType, governance_code: decision.code },
  } as never);

  // ── BRIEF approval is the pipeline starter ──────────────────────────────────
  // Find the brief asset, flip status DRAFT/REVIEW → APPROVED, flip episode
  // BRIEF_PENDING → BRIEF_APPROVED, then fire the EXEC-SW Inngest event.
  let firedEvent: { name: string; ids: string[] } | null = null;
  if (body.approvalType.toUpperCase() === 'BRIEF') {
    if (ep.status !== 'BRIEF_PENDING') {
      throw new ValidationError(
        `Episode is in status ${ep.status}, not BRIEF_PENDING — brief already started`,
      );
    }
    const { data: brief, error: bErr } = await supabase
      .from('assets')
      .select('id,filename')
      .eq('episode_id', id)
      .eq('file_type', 'SPC-brief')
      .maybeSingle();
    if (bErr) throw new Error(`brief lookup failed: ${bErr.message}`);
    if (!brief) {
      throw new ValidationError(
        'No brief asset found for this episode. Did the wizard finish step 4?',
      );
    }
    await supabase.from('assets').update({ status: 'APPROVED' }).eq('id', brief.id);
    await supabase.from('episodes').update({ status: 'BRIEF_APPROVED' }).eq('id', id);

    // D5 fix (2026-07-09): casting is a stage AFTER the brief, BEFORE the Writer
    // (Director 2026-07-04). EXEC-SW's own gate requires an APPROVED cast, so
    // firing the Writer unconditionally here raced the casting stage → transient
    // "0 approved cast" agent_failed on every episode. Fire the Writer NOW only
    // when the cast is already approved; otherwise the Writer waits and is
    // launched by the cast-approval branch in next-events.ts once the cast lands.
    const { count } = await supabase
      .from('assets')
      .select('id', { count: 'exact', head: true })
      .eq('episode_id', id)
      .eq('file_type', 'SPC-episode_cast')
      .eq('status', 'APPROVED');
    const castApproved = (count ?? 0) >= 1;

    if (castApproved) {
      const { ids } = await inngest.send({
        name: 'sandystudio/exec-sw/write-script',
        data: { episodeId: id, briefAssetId: brief.id },
      });
      firedEvent = { name: 'sandystudio/exec-sw/write-script', ids };

      await supabase.from('activity_events').insert({
        event_type: 'pipeline_started',
        severity: 'info',
        title: `Pipeline started for ${ep.episode_code}`,
        description: 'Brief approved (cast ready) — EXEC-SW dispatched',
        actor: user.id,
        episode_id: id,
        metadata: { brief_asset_id: brief.id, inngest_event_ids: ids },
      } as never);
    } else {
      await supabase.from('activity_events').insert({
        event_type: 'pipeline/brief-approved-awaiting-cast',
        severity: 'info',
        title: `Brief approved for ${ep.episode_code} — awaiting cast`,
        description:
          'Бриф одобрен. Writer запустится после аппрува каста (castEpisode → approve).',
        actor: user.id,
        episode_id: id,
        metadata: { brief_asset_id: brief.id },
      } as never);
    }
  }

  return apiOk({
    approved: true,
    approvalType: body.approvalType,
    governanceCode: decision.code,
    fired_event: firedEvent,
  });
});
