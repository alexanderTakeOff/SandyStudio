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

// Asset approval → which Inngest event(s) to fire next.
//
// Single-asset milestones return one event. Multi-asset milestones (storyboard,
// animatic fan-out, publish-ready) require DB queries to verify the gate set
// is complete — that logic lives in `computeNextEvents` (async) below.
//
// Idempotency: each branch checks whether the target agent already has a
// COMPLETED or RUNNING job for this episode. If yes, no new event fires —
// prevents duplicate runs when Director re-approves or HMR retriggers.

type AssetForChain = {
  id: string;
  filename: string;
  file_type: string;
  episode_id: string | null;
  /** Approval timestamp — used as the "since" floor for idempotency. */
  updated_at?: string | null;
};

type SupabaseClientLike = Awaited<ReturnType<typeof requireDirector>>['supabase'];

/**
 * Has the target agent been triggered for this episode SINCE the given moment?
 *
 * `since` is critical: previous pipeline runs (mock pilot, dev retries, prior
 * revisions) leave COMPLETED/FAILED jobs behind. Without a `since` floor, those
 * stale jobs would block every re-trigger — and Director's APPROVE-after-revision
 * would silently produce no fan-out.
 *
 * Pass the asset's `updated_at` (≈ approval moment) as `since`. Jobs started
 * before that don't count: they belonged to earlier upstream versions.
 */
async function hasJob(
  supabase: SupabaseClientLike,
  episodeId: string,
  agentId: string,
  options?: { since?: string | null; excludeFailed?: boolean },
): Promise<boolean> {
  const excludeFailed = options?.excludeFailed ?? true;
  const since = options?.since;
  let q = supabase
    .from('jobs')
    .select('*', { count: 'exact', head: true })
    .eq('episode_id', episodeId)
    .eq('agent_id', agentId)
    .in(
      'status',
      excludeFailed
        ? ['QUEUED', 'RUNNING', 'COMPLETED']
        : ['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED'],
    );
  // Allow a small grace window (5s) before approval to catch jobs the route
  // itself might have just enqueued in a parallel request — keeps idempotency
  // intact for double-clicks.
  if (since) {
    const sinceMs = new Date(since).getTime() - 5_000;
    q = q.gte('started_at', new Date(sinceMs).toISOString());
  }
  const { count } = await q;
  return (count ?? 0) > 0;
}

async function countApproved(
  supabase: SupabaseClientLike,
  episodeId: string,
  fileTypePrefix: string,
): Promise<number> {
  const { count } = await supabase
    .from('assets')
    .select('*', { count: 'exact', head: true })
    .eq('episode_id', episodeId)
    .eq('status', 'APPROVED')
    .like('file_type', `${fileTypePrefix}%`);
  return count ?? 0;
}

async function computeNextEvents(
  supabase: SupabaseClientLike,
  asset: AssetForChain,
  directorUserId: string,
): Promise<Array<{ name: StudioEventName; data: Record<string, unknown> }>> {
  if (!asset.episode_id) return [];
  const ep = asset.episode_id;
  const ft = asset.file_type;
  const since = asset.updated_at ?? null;
  const events: Array<{ name: StudioEventName; data: Record<string, unknown> }> = [];

  // ── Brief APPROVED → EXEC-SW (single)
  if (ft === 'SPC-brief' && !(await hasJob(supabase, ep, 'EXEC-SW', { since }))) {
    events.push({
      name: 'sandystudio/exec-sw/write-script',
      data: { episodeId: ep, briefAssetId: asset.id },
    });
  }

  // ── Script APPROVED → EXEC-SREV (single) AND EXEC-COPY (parallel chain start)
  if (ft === 'SCR-script') {
    if (!(await hasJob(supabase, ep, 'EXEC-SREV', { since }))) {
      events.push({
        name: 'sandystudio/exec-srev/review-script',
        data: { episodeId: ep, scriptAssetId: asset.id },
      });
    }
    if (!(await hasJob(supabase, ep, 'EXEC-COPY', { since }))) {
      events.push({
        name: 'sandystudio/exec-copy/write-metadata',
        data: { episodeId: ep, scriptAssetId: asset.id },
      });
    }
  }

  // ── Script review APPROVED → EXEC-SB
  if (ft === 'REV-script_qa' && !(await hasJob(supabase, ep, 'EXEC-SB', { since }))) {
    events.push({
      name: 'sandystudio/exec-sb/create-storyboard',
      data: { episodeId: ep, scriptAssetId: asset.id },
    });
  }

  // ── Storyboard APPROVED → EXEC-WCHK (Continuity Supervisor)
  // Backbone v2.5: Bible canon validation BEFORE generating episode refs.
  if (ft.startsWith('STB-')) {
    const stbCount = await countApproved(supabase, ep, 'STB');
    if (stbCount >= 1 && !(await hasJob(supabase, ep, 'EXEC-WCHK', { since }))) {
      events.push({
        name: 'sandystudio/exec-wchk/check-world',
        data: { episodeId: ep, storyboardAssetIds: [asset.id] },
      });
    }
  }

  // ── Continuity Check APPROVED → EXEC-EREF (episode references)
  if (ft === 'REV-world_check' && !(await hasJob(supabase, ep, 'EXEC-EREF', { since }))) {
    events.push({
      name: 'sandystudio/exec-eref/generate-references',
      data: { episodeId: ep, storyboardAssetId: asset.id },
    });
  }

  // ── Episode references APPROVED → EXEC-EDIT (animatic)
  if (ft.startsWith('IMG-episode_ref') && !(await hasJob(supabase, ep, 'EXEC-EDIT', { since }))) {
    events.push({
      name: 'sandystudio/exec-edit/create-animatic',
      data: { episodeId: ep, storyboardAssetIds: [] },
    });
  }

  // ── Animatic APPROVED → fan-out EXEC-VGEN×3 + EXEC-MGEN×1
  if (ft === 'VID-animatic') {
    if (!(await hasJob(supabase, ep, 'EXEC-VGEN', { since }))) {
      for (const shotN of [1, 2, 3] as const) {
        events.push({
          name: 'sandystudio/exec-vgen/generate-shot',
          data: { episodeId: ep, shotId: `shot${shotN}`, animaticAssetId: asset.id },
        });
      }
    }
    if (!(await hasJob(supabase, ep, 'EXEC-MGEN', { since }))) {
      events.push({
        name: 'sandystudio/exec-mgen/generate-music',
        data: { episodeId: ep, animaticAssetId: asset.id, section: 'main' },
      });
    }
  }

  // ── Metadata APPROVED → EXEC-THUMB (covered also by EXEC-COPY's auto-chain
  //    from factory.nextEvent in Mode 4; in Mode 1-3 chain is suppressed and
  //    Director's metadata approval is what fires THUMB).
  if (ft === 'SPC-metadata' && !(await hasJob(supabase, ep, 'EXEC-THUMB', { since }))) {
    events.push({
      name: 'sandystudio/exec-thumb/generate-thumbnail',
      data: {
        episodeId: ep,
        scriptAssetId: '', // optional in event schema; THUMB doesn't strictly need it
        metadataAssetId: asset.id,
      },
    });
  }

  // ── Thumbnail APPROVED → check publish-ready set (animatic + metadata +
  //    thumbnail all APPROVED) → EXEC-PUB. Director's APPROVE click on the
  //    thumbnail is the implicit publish-confirm in Mode 1-3.
  if (ft === 'IMG-thumbnail') {
    const animaticOk = (await countApproved(supabase, ep, 'VID-animatic')) >= 1;
    const metadataOk = (await countApproved(supabase, ep, 'SPC-metadata')) >= 1;
    const thumbOk = (await countApproved(supabase, ep, 'IMG-thumbnail')) >= 1;
    if (animaticOk && metadataOk && thumbOk && !(await hasJob(supabase, ep, 'EXEC-PUB', { since }))) {
      events.push({
        name: 'sandystudio/exec-pub/publish',
        data: { episodeId: ep, directorConfirm: true, confirmedBy: directorUserId },
      });
    }
  }

  return events;
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

  // 4. Brief approval also flips the episode milestone status so the
  // "Approve Brief" banner disappears from Pipeline View.
  if (body.decision === 'APPROVE' && asset.file_type === 'SPC-brief' && asset.episode_id) {
    await supabase
      .from('episodes')
      .update({ status: 'BRIEF_APPROVED' })
      .eq('id', asset.episode_id);
  }

  // 5. Fire downstream Inngest event(s) after APPROVE. Multi-asset
  // milestones (storyboard 3-of-3, animatic fan-out, publish-ready) are
  // resolved by computeNextEvents — async because it queries the asset
  // and job tables to verify the gate set is complete and idempotent.
  const firedEvents: Array<{ name: string; ids: string[] }> = [];
  if (body.decision === 'APPROVE' && asset.episode_id) {
    const events = await computeNextEvents(supabase, asset, user.id);
    for (const ev of events) {
      const { ids } = await inngest.send({
        name: ev.name,
        data: ev.data as never,
      });
      firedEvents.push({ name: ev.name, ids });
    }
  }

  return apiOk({
    decision: body.decision,
    asset_status: targetStatus,
    fired_events: firedEvents,
  });
});
