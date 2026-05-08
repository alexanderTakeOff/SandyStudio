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
import {
  isShotReferenceV2,
  type ShotReferenceContract,
} from '@/lib/api/shot-reference';
import { isAnimaticV1, type AnimaticContract } from '@/lib/api/animatic-shotlist';
import { pickPilotVgenShots } from '@/lib/api/vgen-shot-helpers';
import { setVgenPilotState } from '@/lib/api/vgen-pilot-state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ApproveBody = z.object({
  decision: z.enum(['APPROVE', 'REQUEST_REVISION', 'REJECT', 'NEEDS_HUMAN_TWEAK']),
  note: z.string().max(2000).optional(),
  preview_acknowledged: z.boolean().optional(),  // visual gate flag
  directorConfirm: z.boolean().optional(),
  /**
   * v2 EREF-only options. `skip_upscale=true` suppresses the
   * `sandystudio/exec-eref/upscale-final` event after APPROVE — useful when
   * the asset is already 4K, when the shot's stylization doesn't benefit
   * (technology.md §3), or when Director wants to defer upscaling cost.
   */
  eref_options: z
    .object({
      skip_upscale: z.boolean().optional(),
    })
    .optional(),
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
  /** Optional metadata — used to detect v2 EREF contract for chain skip. */
  metadata?: unknown;
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

  // ── Continuity Check APPROVED → EXEC-EREF (episode references) +
  //    EXEC-MGEN (music) in parallel.
  // Phase A.2 PR γ (LT-04, Director directive 2026-05-08 q3b): music
  // generation moves BEFORE animatic, so the animatic player can preview
  // pacing WITH music. Both MGEN and EREF run after world_check; EDIT
  // (animatic) waits for both to complete.
  if (ft === 'REV-world_check') {
    if (!(await hasJob(supabase, ep, 'EXEC-EREF', { since }))) {
      events.push({
        name: 'sandystudio/exec-eref/generate-references',
        data: { episodeId: ep, storyboardAssetId: asset.id },
      });
    }
    if (!(await hasJob(supabase, ep, 'EXEC-MGEN', { since }))) {
      events.push({
        name: 'sandystudio/exec-mgen/generate-music',
        // animaticAssetId is empty here — MGEN now generates BEFORE
        // animatic exists. Runner reads section + storyboard for prompt
        // context. Field kept for backward-compat with the event schema.
        data: { episodeId: ep, animaticAssetId: '', section: 'main' },
      });
    }
  }

  // ── Episode references OR music APPROVED → EXEC-EDIT (animatic)
  // Phase A.2 PR γ: animatic creation now waits for BOTH approved EREF v1
  // (or via /eref/advance for v2) AND approved music. This unblocks
  // animatic playback with music for pacing review BEFORE expensive VGEN.
  //
  // EREF v2 (Pilot+Fanout, technology.md §4): per-shot approvals must NOT
  // auto-fire the animatic — Director uses the explicit "Advance to Animatic"
  // button (POST /api/episodes/[id]/eref/advance) once all shots have an
  // approved variant. That route also waits for music to be approved
  // before firing create-animatic.
  if (
    (ft.startsWith('IMG-episode_ref') || ft === 'AUD-music') &&
    !(await hasJob(supabase, ep, 'EXEC-EDIT', { since }))
  ) {
    // For EREF v2 path, the per-shot approvals don't auto-fire — only the
    // explicit advance route does. Skip auto-fire when this asset is v2.
    const isV2EREF =
      ft.startsWith('IMG-episode_ref') &&
      isShotReferenceV2((asset as { metadata?: unknown }).metadata);
    if (!isV2EREF) {
      const erefOk = (await countApproved(supabase, ep, 'IMG-episode_ref')) >= 1;
      const musicOk = (await countApproved(supabase, ep, 'AUD-music')) >= 1;
      if (erefOk && musicOk) {
        // Find the most recent APPROVED music asset to attach as
        // musicAssetId. Lets EXEC-EDIT bake the track into the animatic.
        const { data: musicRow } = await supabase
          .from('assets')
          .select('id')
          .eq('episode_id', ep)
          .eq('file_type', 'AUD-music')
          .eq('status', 'APPROVED')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const musicAssetId = (musicRow as { id?: string } | null)?.id ?? null;
        events.push({
          name: 'sandystudio/exec-edit/create-animatic',
          data: {
            episodeId: ep,
            storyboardAssetIds: [],
            ...(musicAssetId ? { musicAssetId } : {}),
          },
        });
      }
    }
  }

  // ── Animatic APPROVED → VGEN Pilot Pass + EXEC-MGEN×1
  // Per purrfect-stirring-hollerith plan: replace the legacy [1,2,3] hardcode
  // with real shot ids from animatic_v1.shot_list. Pilot Pass picks 1-2
  // representative shots; Director approves direction; remaining shots fan
  // out via the /fanout-trigger event after manual approval.
  //
  // Back-compat: if the animatic asset has no animatic_v1 metadata (legacy
  // mock pilot or pre-shot-list episodes), fall through to the old 3-shot
  // fan-out so replay-pilot keeps passing.
  if (ft === 'VID-animatic') {
    if (!(await hasJob(supabase, ep, 'EXEC-VGEN', { since }))) {
      const animaticMeta = (asset as { metadata?: unknown }).metadata;
      if (isAnimaticV1(animaticMeta)) {
        const v1 = (animaticMeta as { animatic_v1: AnimaticContract }).animatic_v1;
        const shotList = v1.shot_list ?? [];
        const pilots = pickPilotVgenShots(shotList);
        if (pilots.length > 0) {
          // Set pilot_state PENDING_REVIEW upfront — runner will reaffirm
          // it after each pilot finishes. Doing it here means the UI reflects
          // "pilot in flight" the moment Director clicks Approve animatic.
          await setVgenPilotState(supabase, ep, 'PENDING_REVIEW');
          for (const p of pilots) {
            events.push({
              name: 'sandystudio/exec-vgen/start',
              data: {
                episodeId: ep,
                shotId: p.shotId,
                duration_seconds: p.durationSeconds,
                pilot: true,
              },
            });
          }
        }
      } else {
        // Legacy fallback (replay-pilot, pre-Pilot-Pass episodes): 3 fake shots.
        for (const shotN of [1, 2, 3] as const) {
          events.push({
            name: 'sandystudio/exec-vgen/generate-shot',
            data: { episodeId: ep, shotId: `shot${shotN}`, animaticAssetId: asset.id },
          });
        }
      }
    }
    // (Phase A.2 PR γ) MGEN no longer fires here — moved to REV-world_check
    // approval so music is ready BEFORE animatic. See branch above.
  }

  // ── Last VID-shot APPROVED → if all shots have an APPROVED row, fire
  //    EXEC-STITCH to assemble the final-cut mp4 (Phase A.2 PR β).
  //    This is the second half of VGEN auto-COMPLETE: the inline status flip
  //    (after the BRIEF block) handles the episode FSM; this branch fires the
  //    actual stitching job. Idempotent via hasJob.
  if (ft.startsWith('VID-shot') && !(await hasJob(supabase, ep, 'EXEC-STITCH', { since }))) {
    const { data: animaticRow } = await supabase
      .from('assets')
      .select('metadata')
      .eq('episode_id', ep)
      .like('file_type', 'VID-animatic%')
      .eq('status', 'APPROVED')
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    const animMeta = (animaticRow as { metadata?: unknown } | null)?.metadata;
    if (isAnimaticV1(animMeta)) {
      const v1 = (animMeta as { animatic_v1: AnimaticContract }).animatic_v1;
      const totalShots = v1.shot_list?.length ?? 0;
      if (totalShots > 0) {
        const { data: approvedRows } = await supabase
          .from('assets')
          .select('metadata')
          .eq('episode_id', ep)
          .like('file_type', 'VID-shot%')
          .eq('status', 'APPROVED');
        const approvedShotIds = new Set<string>();
        for (const row of (approvedRows ?? []) as Array<{ metadata?: unknown }>) {
          const sid = (row.metadata as { shot_id?: unknown } | null)?.shot_id;
          if (typeof sid === 'string') approvedShotIds.add(sid);
        }
        if (approvedShotIds.size >= totalShots) {
          events.push({
            name: 'sandystudio/exec-stitch/assemble-episode',
            data: { episodeId: ep },
          });
        }
      }
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

  // 1.5. v2 EREF auto-demote: when APPROVING a v2 EREF candidate, any prior
  // APPROVED asset for the same (episode_id, shot_id) tuple is REJECTED in
  // the same logical step (the DB partial unique index in 0024 enforces the
  // invariant; we sequence the demote BEFORE promote to avoid a 23505 flash).
  // Two-step sequence with rollback on failure: if the demote succeeds and
  // the promote fails, restore the demoted asset's prior status.
  let demotedPriorAssetId: string | null = null;
  let demotedPriorAssetStatus: string | null = null;
  const isV2EREFApprove =
    body.decision === 'APPROVE' &&
    asset.episode_id &&
    typeof asset.file_type === 'string' &&
    asset.file_type.startsWith('IMG-episode_ref') &&
    isShotReferenceV2(asset.metadata);
  if (isV2EREFApprove && asset.episode_id) {
    const sr = (asset.metadata as unknown as { shot_reference: ShotReferenceContract })
      .shot_reference;
    const newShotId = sr.shot_id;
    const { data: existing, error: existingErr } = await supabase
      .from('assets')
      .select('id,status,metadata')
      .eq('episode_id', asset.episode_id)
      .eq('status', 'APPROVED')
      .like('file_type', 'IMG-episode_ref%')
      .neq('id', id);
    if (existingErr) {
      throw new Error(`prior-approved fetch failed: ${existingErr.message}`);
    }
    const priorForShot = (existing ?? []).find((row) => {
      const meta = (row as { metadata?: unknown }).metadata;
      if (!isShotReferenceV2(meta)) return false;
      return (
        (meta as { shot_reference: ShotReferenceContract }).shot_reference
          .shot_id === newShotId
      );
    });
    if (priorForShot) {
      const priorMetaRaw = (priorForShot as { metadata?: unknown }).metadata as
        | Record<string, unknown>
        | null;
      const newPriorMeta = {
        ...(priorMetaRaw ?? {}),
        demoted_reason: `superseded_by_${id}`,
      };
      const { error: demoteErr } = await supabase
        .from('assets')
        .update({
          status: 'REJECTED',
          metadata: newPriorMeta as unknown as Record<string, unknown>,
        } as never)
        .eq('id', priorForShot.id);
      if (demoteErr) {
        throw new Error(
          `auto-demote of prior APPROVED ${priorForShot.id} failed: ${demoteErr.message}`,
        );
      }
      demotedPriorAssetId = priorForShot.id;
      demotedPriorAssetStatus = priorForShot.status as string;
    }
  }

  // 2. Update asset status
  const patch: Record<string, unknown> = { status: targetStatus };
  if (body.decision === 'REQUEST_REVISION' && body.note) {
    patch.revision_log = body.note;
  }
  const { error: upErr } = await supabase
    .from('assets')
    .update(patch as never)
    .eq('id', id);
  if (upErr) {
    // Best-effort rollback of the auto-demoted asset so the invariant is
    // preserved even on partial failure. (DB transactions over Supabase JS
    // require an RPC; sequenced + rollback is the closest we can get
    // without one — see plan §"Approve transaction".)
    if (demotedPriorAssetId && demotedPriorAssetStatus) {
      await supabase
        .from('assets')
        .update({ status: demotedPriorAssetStatus } as never)
        .eq('id', demotedPriorAssetId);
    }
    throw new Error(`asset status update failed: ${upErr.message}`);
  }

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

  // VGEN auto-COMPLETE (Phase A.2 PR α, Director directive 2026-05-08 q2b).
  // When the last VID-shot for an episode reaches APPROVED — meaning every
  // shot in the animatic v1 contract now has at least one APPROVED VID-shot
  // row — auto-advance the episode to `GENERATION_APPROVED`. Without this,
  // Director would have to remember to manually click an advance button after
  // 13/13 are green; with it, the pipeline progresses on its own.
  //
  // Idempotency: only flip when current episode status is in the pre-APPROVED
  // generation window. Once the episode reaches GENERATION_APPROVED (or
  // beyond), re-approving a shot is a no-op.
  if (
    body.decision === 'APPROVE' &&
    asset.file_type.startsWith('VID-shot') &&
    asset.episode_id
  ) {
    const { data: animaticRow } = await supabase
      .from('assets')
      .select('metadata')
      .eq('episode_id', asset.episode_id)
      .like('file_type', 'VID-animatic%')
      .eq('status', 'APPROVED')
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    const animaticMeta = (animaticRow as { metadata?: unknown } | null)?.metadata;
    if (isAnimaticV1(animaticMeta)) {
      const v1 = (animaticMeta as { animatic_v1: AnimaticContract }).animatic_v1;
      const totalShots = v1.shot_list?.length ?? 0;
      if (totalShots > 0) {
        // Count DISTINCT shot_ids that have at least one APPROVED VID-shot
        // row. We dedupe by shot_id because regenerate-video creates a new
        // asset row per regen — multiple APPROVED rows for the same shot_id
        // must count as one.
        const { data: approvedRows } = await supabase
          .from('assets')
          .select('metadata')
          .eq('episode_id', asset.episode_id)
          .like('file_type', 'VID-shot%')
          .eq('status', 'APPROVED');
        const approvedShotIds = new Set<string>();
        for (const row of (approvedRows ?? []) as Array<{ metadata?: unknown }>) {
          const sid = (row.metadata as { shot_id?: unknown } | null)?.shot_id;
          if (typeof sid === 'string') approvedShotIds.add(sid);
        }
        if (approvedShotIds.size >= totalShots) {
          await supabase
            .from('episodes')
            .update({ status: 'GENERATION_APPROVED' })
            .eq('id', asset.episode_id)
            .in('status', [
              'ANIMATIC_APPROVED',
              'GENERATION_IN_PROGRESS',
              'GENERATION_REVIEW',
              'GENERATION_REVISION',
            ]);
        }
      }
    }
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

    // v2 EREF: trigger Director-approve 4K upscale per technology.md §3
    // unless explicitly skipped or asset is already 4K.
    if (isV2EREFApprove) {
      const sr = (asset.metadata as unknown as { shot_reference: ShotReferenceContract })
        .shot_reference;
      const skipUpscale = body.eref_options?.skip_upscale === true;
      const alreadyFourK = Boolean(sr.final_4k_url);
      if (!skipUpscale && !alreadyFourK) {
        const { ids } = await inngest.send({
          name: 'sandystudio/exec-eref/upscale-final',
          data: { episodeId: asset.episode_id, assetId: id } as never,
        });
        firedEvents.push({
          name: 'sandystudio/exec-eref/upscale-final',
          ids,
        });
      }
    }
  }

  return apiOk({
    decision: body.decision,
    asset_status: targetStatus,
    fired_events: firedEvents,
    demoted_prior_asset_id: demotedPriorAssetId,
  });
});
