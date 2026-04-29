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
import { NotFoundError } from '@/lib/api/errors';
import { enforceMode, type GovernanceEpisode } from '@/lib/governance';
import { GovernanceBlockError } from '@/lib/api/errors';

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

  return apiOk({
    approved: true,
    approvalType: body.approvalType,
    governanceCode: decision.code,
  });
});
