// ──────────────────────────────────────────────────────────────────────────────
// app/api/assets/[id]/approve/route.ts
// Asset approval. Single point where Director's intent crosses into the agent
// DAG: audit row + status flip + (governance allowing) next Inngest event.
//
// Per director_inbox.md §6 + webapp.md §5.
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import { NotFoundError, ValidationError, ConflictError, GovernanceBlockError } from '@/lib/api/errors';
import { assertAssetTransition, type AssetStatus } from '@/lib/api/status-transitions';
import { enforceMode, type GovernanceEpisode } from '@/lib/governance';
import { inngest, type StudioEventName } from '@/lib/inngest/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ApproveBody = z.object({
  decision: z.enum(['APPROVE', 'REQUEST_REVISION', 'REJECT', 'NEEDS_HUMAN_TWEAK']),
  note: z.string().max(2000).optional(),
  preview_acknowledged: z.boolean().optional(),  // visual gate flag
  directorConfirm: z.boolean().optional(),
});

const VISUAL_FILE_TYPES: ReadonlySet<string> = new Set(['IMG', 'VID']);

const STATUS_AFTER_DECISION: Record<typeof ApproveBody._type.decision, AssetStatus> = {
  APPROVE: 'APPROVED',
  REQUEST_REVISION: 'REVISION',
  REJECT: 'REJECTED',
  NEEDS_HUMAN_TWEAK: 'NEEDS_HUMAN_TWEAK',
};

// Asset filename → next Inngest event mapping. After APPROVE only.
// Mirrors the canonical pipeline DAG. Returns null when there is no
// downstream event to fire (terminal asset, manual continuation, etc.).
function nextEventForAsset(asset: {
  id: string;
  filename: string;
  file_type: string;
  episode_id: string | null;
}):
  | { name: StudioEventName; data: Record<string, unknown> }
  | null {
  if (!asset.episode_id) return null;
  const ep = asset.episode_id;

  // Brief APPROVED → fire EXEC-SW (write-script). Same trigger as the
  // Pipeline View "Approve Brief" banner — single source of truth.
  if (asset.file_type === 'SPC-brief') {
    return {
      name: 'sandystudio/exec-sw/write-script',
      data: { episodeId: ep, briefAssetId: asset.id },
    };
  }

  // Script APPROVED → fire EXEC-SREV (review-script).
  if (asset.file_type === 'SCR-script') {
    return {
      name: 'sandystudio/exec-srev/review-script',
      data: { episodeId: ep, scriptAssetId: asset.id },
    };
  }

  // Script review APPROVED → fire EXEC-SB (storyboard).
  if (asset.file_type === 'REV-script_qa') {
    return {
      name: 'sandystudio/exec-sb/create-storyboard',
      data: { episodeId: ep, scriptAssetId: asset.id },
    };
  }

  // World check APPROVED → fire EXEC-EDIT (animatic).
  if (asset.file_type === 'REV-world_check') {
    return {
      name: 'sandystudio/exec-edit/create-animatic',
      data: { episodeId: ep, storyboardAssetIds: [] },
    };
  }

  // Storyboard / Animatic / Generation are multi-asset milestones —
  // chaining waits for all required APPROVALs. Phase 6 will add the
  // "all-of-set approved" detector. For now the Director uses
  // Pipeline View → Re-trigger… to advance these manually.
  return null;
}

export const POST = withApiHandler(async (req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const id = params?.id;
  if (!id) throw new NotFoundError('Asset');

  const { user, supabase } = await requireDirector();
  const body = await parseJson(req, ApproveBody);

  // Fetch asset + episode context
  const { data: asset, error: aerr } = await supabase
    .from('assets')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (aerr) throw new Error(`asset fetch failed: ${aerr.message}`);
  if (!asset) throw new NotFoundError(`Asset ${id}`);

  // Note + visual gate enforcement
  if (body.decision === 'REQUEST_REVISION' || body.decision === 'REJECT') {
    if (!body.note || body.note.trim().length === 0) {
      throw new ValidationError(
        `${body.decision} requires a note explaining the requested change`,
      );
    }
  }
  if (
    VISUAL_FILE_TYPES.has(asset.file_type) &&
    body.decision === 'APPROVE' &&
    !body.preview_acknowledged
  ) {
    throw new ValidationError(
      'Visual asset approval requires preview_acknowledged: true. ' +
        'Open the preview drawer at least once before approving.',
    );
  }

  const targetStatus = STATUS_AFTER_DECISION[body.decision];
  assertAssetTransition(asset.status as AssetStatus, targetStatus);

  // Governance check (Phase 4: PUBLISH-only enforcement; rest pass through)
  let episode: GovernanceEpisode | null = null;
  if (asset.episode_id) {
    const { data: ep } = await supabase
      .from('episodes')
      .select('id,governance_mode')
      .eq('id', asset.episode_id)
      .maybeSingle();
    if (ep) episode = ep as GovernanceEpisode;
  }
  if (episode) {
    const decision = enforceMode('AGENT_RUN', episode, {
      directorConfirm: body.directorConfirm,
      confirmedBy: user.id,
    });
    if (!decision.passed) {
      throw new GovernanceBlockError(decision.reason ?? 'Governance gate refused');
    }
  }

  // Idempotency guard: if a Director approval row already exists for the
  // same asset, return the existing record rather than re-firing events.
  const { data: existingApproval } = await supabase
    .from('approvals')
    .select('id,approval_type')
    .eq('asset_id', id)
    .eq('approved_by', 'DIRECTOR')
    .maybeSingle();

  if (existingApproval && body.decision === 'APPROVE' && asset.status === 'APPROVED') {
    throw new ConflictError(
      `Asset ${asset.filename} is already APPROVED (idempotent no-op)`,
    );
  }

  // 1. Insert approval audit row
  await supabase.from('approvals').insert({
    asset_id: id,
    episode_id: asset.episode_id,
    approved_by: 'DIRECTOR',
    approval_type: body.decision,
    notes: body.note ?? null,
  });

  // 2. Update asset status
  const patch: Record<string, unknown> = { status: targetStatus };
  if (body.decision === 'REQUEST_REVISION' && body.note) {
    patch.revision_log = body.note;
  }
  const { error: upErr } = await supabase
    .from('assets')
    .update(patch as never)
    .eq('id', id);
  if (upErr) throw new Error(`asset status update failed: ${upErr.message}`);

  // 3. Audit event
  const evtType =
    body.decision === 'APPROVE'
      ? 'approval_granted'
      : body.decision === 'REQUEST_REVISION'
      ? 'approval_revision'
      : body.decision === 'REJECT'
      ? 'approval_rejected'
      : 'asset_updated';
  await supabase.from('activity_events').insert({
    event_type: evtType,
    severity: body.decision === 'REJECT' ? 'warning' : 'info',
    title: `${body.decision} on ${asset.filename}`,
    description: body.note ?? `Director ${user.email ?? user.id} ${body.decision.toLowerCase()}`,
    actor: user.id,
    asset_id: id,
    episode_id: asset.episode_id,
    metadata: { decision: body.decision, file_type: asset.file_type },
  } as never);

  // 4. (Optional) fire downstream Inngest event after APPROVE
  let firedEvent: { name: string; ids: string[] } | null = null;
  if (body.decision === 'APPROVE') {
    const next = nextEventForAsset(asset);
    if (next) {
      const { ids } = await inngest.send({
        name: next.name,
        data: { ...next.data, episodeId: asset.episode_id } as never,
      });
      firedEvent = { name: next.name, ids };
    }
  }

  return apiOk({
    decision: body.decision,
    asset_status: targetStatus,
    fired_event: firedEvent,
  });
});
