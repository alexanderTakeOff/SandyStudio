// ──────────────────────────────────────────────────────────────────────────────
// app/api/assets/[id]/approve/route.ts
// Asset approval. Single point where Director's intent crosses into the agent
// DAG: audit row + status flip + (governance allowing) next Inngest event.
//
// Per director_inbox.md §6 + webapp.md §5.
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { logEvent } from '@/lib/api/events';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import { NotFoundError, ValidationError, ConflictError, GovernanceBlockError } from '@/lib/api/errors';
import { assertAssetTransition, type AssetStatus } from '@/lib/api/status-transitions';
import { filenameForStatus } from '@/lib/api/filename-status';
import { enforceMode, type GovernanceEpisode } from '@/lib/governance';
import { inngest } from '@/lib/inngest/client';
import {
  isShotReferenceV2,
  type ShotReferenceContract,
} from '@/lib/api/shot-reference';
import { getEREFUpscaleEnabled } from '@/lib/api/eref-config';
import {
  isAnimaticV1,
  type AnimaticContract,
} from '@/lib/api/animatic-shotlist';
// TD-87 (2026-06-09): computeNextEvents + the chain-private helpers it needs
// were extracted to lib/agents/next-events.ts so the Mode-4 autonomous chain
// (factory.ts) and the Mode 1-3 Director-driven chain (this route) share ONE
// router instead of factory.ts diverging onto thin per-agent nextEvents.
// `SupabaseClientLike` is re-imported because the slot-demotion helpers below
// still take a Supabase client of that shape.
import {
  computeNextEvents,
  type SupabaseClientLike,
} from '@/lib/agents/next-events';
import { EPISODE_CAST_FILE_TYPE, syncAppearsIn } from '@/lib/agents/episode-cast';
import {
  resolveSlotDescriptor,
  demoteSiblingApproved,
  restoreDemotedSiblings,
  type DemotedSibling,
  type AssetForSlot,
} from '@/lib/api/single-approved';

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

// Single-approved invariant helpers (resolveSlotDescriptor / demoteSiblingApproved
// / restoreDemotedSiblings) were extracted to lib/api/single-approved.ts on
// 2026-06-15 so the Mode-4 autonomous factory auto-approve shares the SAME
// supersede logic this route uses — closing the gap where Mode-4 regen flipped
// straight to APPROVED and collided with the per-slot unique index.

export const POST = withApiHandler(async (req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const id = params?.id;
  if (!id) throw new NotFoundError('Asset');

  const { user, supabase, principal } = await requireDirector();
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
  // Backlog #7 (2026-06-16): the human Director is BOTH reworker and approver.
  // The FSM forbids REVISION / NEEDS_HUMAN_TWEAK → APPROVED (the autonomous
  // pipeline routes a reworked asset through a second REVIEW), but for a human
  // Director editing the asset on the contract page that re-review is
  // bureaucratic. Allow the direct approve ONLY for the human principal — agents
  // (exec_dir_ai) still must go through REVIEW. Everything else keeps the strict
  // FSM. Governance (enforceMode) below is unaffected.
  const humanDirectApprove =
    principal === 'director' &&
    body.decision === 'APPROVE' &&
    (asset.status === 'REVISION' || asset.status === 'NEEDS_HUMAN_TWEAK');
  if (!humanDirectApprove) {
    assertAssetTransition(asset.status as AssetStatus, targetStatus);
  }

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

  // 1.5. Single-approved invariant (Director rule 2026-06-04, UNIT 1, q24).
  //
  // When APPROVING (or LOCKING, for SBL) an asset that occupies a slot, demote
  // EVERY prior sibling occupying the SAME slot → INVALIDATED (NOT REJECTED;
  // q24 — see helper docs) with a `superseded_by_<id>` marker. One generalized
  // helper covers all slot families:
  //   IMG-episode_ref (shot_id) · IMG-anchor (shot_id+position) ·
  //   SPC-shot_plan / VID-shot / SPC-ref_plan (shot_id) · SBL-* (series+file_type, LOCKED).
  //
  // `resolveSlotDescriptor` returns null for non-slot asset types, so they
  // pass through with NO demotion (behaviour identical to before for them).
  //
  // We sequence the demote BEFORE the promote in step 2 so the DB partial
  // unique index (0024 for EREF) never sees two occupants at once.
  // `demotedSiblings` is restored if the promote later fails.
  let demotedSiblings: DemotedSibling[] = [];
  // Retained for the v2-EREF 4K-upscale trigger further down (step 5).
  const isV2EREFApprove =
    body.decision === 'APPROVE' &&
    asset.episode_id &&
    typeof asset.file_type === 'string' &&
    asset.file_type.startsWith('IMG-episode_ref') &&
    isShotReferenceV2(asset.metadata);
  // For SBL, "approval" is the LOCK action (targetStatus === 'LOCKED'); for
  // every other slot family it is the APPROVE decision.
  const occupiesSlotOnThisDecision =
    body.decision === 'APPROVE' || targetStatus === 'LOCKED';
  if (occupiesSlotOnThisDecision) {
    const slot = resolveSlotDescriptor(asset as unknown as AssetForSlot);
    if (slot) {
      demotedSiblings = await demoteSiblingApproved(supabase, {
        slot,
        currentId: id,
      });
    }
  }

  // 2. Update asset status (+ filename status suffix per CLAUDE.md §3)
  const patch: Record<string, unknown> = { status: targetStatus };
  if (body.decision === 'REQUEST_REVISION' && body.note) {
    patch.revision_log = body.note;
  }
  // Sprint γ 2026-05-14: keep filename in sync with status. Director:
  // «утверждённый файл должен поменять наименование». The CHECK constraint
  // allows only 5 statuses in filenames (DRAFT/REVIEW/REVISION/APPROVED/
  // LOCKED) so we skip rename when the target status has no filename
  // representation (REJECTED, INVALIDATED, …).
  const renamed = filenameForStatus(asset.filename, targetStatus);
  if (renamed && renamed !== asset.filename) {
    patch.filename = renamed;
  }
  const { error: upErr } = await supabase
    .from('assets')
    .update(patch as never)
    .eq('id', id);
  if (upErr) {
    // Best-effort rollback of the auto-demoted siblings so the invariant is
    // preserved even on partial failure. (DB transactions over Supabase JS
    // require an RPC; sequenced demote + rollback is the closest we can get
    // without one — see plan §"Approve transaction".)
    await restoreDemotedSiblings(supabase, demotedSiblings);
    throw new Error(`asset status update failed: ${upErr.message}`);
  }

  // 2.5. Episode cast gallery → appears_in projection (2026-06-14).
  //
  // When an SPC-episode_cast is APPROVED (or LOCKED), recompute
  // `metadata.appears_in` on the series' SBL canon so each asset records which
  // episodes it is cast into. The gallery is the authority; this is its
  // denormalized cross-check. Reference loaders read the gallery directly, so
  // this projection is for Director review / query, not the scoping path.
  if (
    (body.decision === 'APPROVE' || targetStatus === 'LOCKED') &&
    asset.file_type === EPISODE_CAST_FILE_TYPE &&
    asset.episode_id
  ) {
    const { data: epRow } = await supabase
      .from('episodes')
      .select('episode_code')
      .eq('id', asset.episode_id)
      .maybeSingle();
    const episodeCode = (epRow as { episode_code?: string } | null)?.episode_code;
    if (episodeCode) {
      await syncAppearsIn(supabase, asset.episode_id, episodeCode);
    }
  }

  // 3. Audit event
  //
  // TD-29 (2026-05-21): MUST route through logEvent helper, NOT direct
  // `supabase.from('activity_events').insert(...)`. logEvent's side-effect
  // fires the `sandystudio/pa/notify-needed` Inngest event when the
  // event_type is in the actionable whitelist (approval_granted is). Direct
  // insert bypasses that fan-out → Polina silently misses every Director
  // approve, which is exactly what caused the 13-min auto-react gap
  // observed at 08:42-08:43Z. Same class of bug as the factory.ts fix
  // landed in b6c83e7 yesterday.
  const evtType =
    body.decision === 'APPROVE'
      ? 'approval_granted'
      : body.decision === 'REQUEST_REVISION'
      ? 'approval_revision'
      : body.decision === 'REJECT'
      ? 'approval_rejected'
      : 'asset_updated';
  await logEvent(supabase, {
    event_type: evtType,
    severity: body.decision === 'REJECT' ? 'warning' : 'info',
    title: `${body.decision} on ${asset.filename}`,
    description: body.note ?? `Director ${user.email ?? user.id} ${body.decision.toLowerCase()}`,
    actor: user.id,
    asset_id: id,
    episode_id: asset.episode_id,
    metadata: { decision: body.decision, file_type: asset.file_type },
  });

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
  //
  // REQUEST_REVISION auto-chain (Director directive 2026-05-12 + PA finding):
  // after a revision flip the producing agent must re-run automatically so
  // pipeline keeps moving without manual triggerAgent. Map file_type → its
  // Inngest event so we re-fire the upstream agent with the same episode
  // context. Mode 3 readiness requirement.
  const firedEvents: Array<{ name: string; ids: string[] }> = [];

  if (body.decision === 'REQUEST_REVISION' && asset.episode_id) {
    const reviseEvent = revisionEventForAsset(asset.file_type);
    if (reviseEvent) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { ids } = await inngest.send({
        name: reviseEvent as any,
        data: { episodeId: asset.episode_id, revisionNote: body.note ?? null } as never,
      });
      firedEvents.push({ name: reviseEvent, ids });
    }

    // EREF reference image revised (Director directive 2026-06-23): a per-shot
    // image has no whole-stage rerun, so `revisionEventForAsset` returns null for
    // it — which left a Director's Revise note recorded but INERT ("кануло в
    // лету"). Route the note to the DESIGNER instead: it re-authors the Plan with
    // the note as hard acceptance criteria (the runner already injects
    // revisionNote — episode-reference-designer.ts §"HARD ACCEPTANCE CRITERIA"),
    // then the existing chain re-runs (Plan → Critic → approve → re-render). This
    // is exactly what the `regenerateRefPlan` PA tool fires — reused, not new.
    const ft = typeof asset.file_type === 'string' ? asset.file_type : '';
    if (ft.startsWith('IMG-episode_ref') || ft.startsWith('IMG-anchor')) {
      const shotIdFromMeta = isShotReferenceV2(asset.metadata)
        ? (asset.metadata as unknown as { shot_reference: ShotReferenceContract })
            .shot_reference.shot_id
        : null;
      // Fallback: the canonical SH token from the filename. getStoryboardShotById
      // resolves a bare/mis-prefixed SH token to the canonical shot (the
      // SH-number fallback), so a bare "SH04" still lands on the right shot.
      const shotIdFromName =
        typeof asset.filename === 'string'
          ? asset.filename.match(/sh\d+/i)?.[0]?.toUpperCase() ?? null
          : null;
      const shotId = shotIdFromMeta || shotIdFromName;
      if (shotId) {
        const { ids } = await inngest.send({
          name: 'sandystudio/exec-eref-designer/plan',
          data: {
            episodeId: asset.episode_id,
            shotId,
            revisionNote: body.note ?? null,
          } as never,
        });
        firedEvents.push({ name: 'sandystudio/exec-eref-designer/plan', ids });
      } else {
        // eslint-disable-next-line no-console
        console.warn(
          `[approve] EREF revision on ${asset.filename ?? asset.id}: could not resolve a shotId — note saved on the asset, but no Designer re-fire`,
        );
      }
    }
  }

  if (body.decision === 'APPROVE' && asset.episode_id) {
    const events = await computeNextEvents(supabase, asset, user.id);
    for (const ev of events) {
      const { ids } = await inngest.send({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        name: ev.name as any,
        data: ev.data as never,
      });
      firedEvents.push({ name: ev.name, ids });
    }

    // v2 EREF: trigger Director-approve 4K upscale per technology.md §3
    // unless explicitly skipped or asset is already 4K.
    //
    // 2026-06-20 (Director q5): this is now the SOLE 4K upscale point — the
    // pre-approval Phase E.5 in episode-references.ts was removed so the paid
    // upscale fires ONLY on the final (human/authorized) APPROVE, never on
    // candidates that may be rejected/regenerated. The global eref_upscale_enabled
    // kill-switch is honoured HERE now that its former (pre-approval) consumer is
    // gone.
    if (isV2EREFApprove) {
      const sr = (asset.metadata as unknown as { shot_reference: ShotReferenceContract })
        .shot_reference;
      const skipUpscale = body.eref_options?.skip_upscale === true;
      const alreadyFourK = Boolean(sr.final_4k_url);
      const upscaleEnabled = await getEREFUpscaleEnabled(supabase);
      if (upscaleEnabled && !skipUpscale && !alreadyFourK) {
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
    // TD-39 L1: episode anchor lets the PA dispatch wrapper poll for the
    // fan-out job row created by the downstream Inngest function.
    episode_id: asset.episode_id,
    fired_events: firedEvents,
    // `demoted_prior_asset_id` kept (first id) for backward compatibility with
    // existing PA/UI callers; `demoted_prior_asset_ids` is the full list.
    demoted_prior_asset_id: demotedSiblings[0]?.id ?? null,
    demoted_prior_asset_ids: demotedSiblings.map((d) => d.id),
  });
});

/**
 * Map asset.file_type → the Inngest event that re-runs its producing agent.
 * Used on REQUEST_REVISION to auto-chain the upstream agent so pipeline
 * keeps moving without manual triggerAgent. Returns null when no obvious
 * single-agent rerun applies (e.g. per-shot VID is regenerate-video, not
 * a whole-stage rerun; thumbnails / publish are terminal).
 *
 * Director directive 2026-05-12 (Mode 3 readiness drill): PA observed that
 * requestRevision only flips status without dispatching the producing agent.
 * Pipeline stalls until manual triggerAgent. Auto-chain closes the gap.
 */
function revisionEventForAsset(fileType: string): string | null {
  if (fileType.startsWith('SCR-script'))                return 'sandystudio/exec-sw/write-script';
  if (fileType === 'REV-script_qa')                     return 'sandystudio/exec-srev/review-script';
  if (fileType.startsWith('STB'))                       return 'sandystudio/exec-sb/create-storyboard';
  if (fileType === 'REV-world_check')                   return 'sandystudio/exec-wchk/check-world';
  if (fileType.startsWith('AUD-music'))                 return 'sandystudio/exec-mgen/generate-music';
  if (fileType.startsWith('VID-animatic'))              return 'sandystudio/exec-edit/create-animatic';
  if (fileType === 'SPC-metadata' || fileType.startsWith('SPC-copy'))
                                                        return 'sandystudio/exec-copy/write-metadata';
  // Thumbnail Plan or a rendered thumbnail → re-fire the Designer to author a
  // fresh viral Plan (closes the dead-end Polina hit: requestRevision used to
  // only flip status with no re-author). 2026-06-01 distribution tail.
  if (fileType === 'SPC-thumb_plan' || fileType.startsWith('IMG-thumbnail'))
                                                        return 'sandystudio/exec-thumb-designer/plan';
  // Final cut revision → re-assemble (re-stitch) rather than dead-ending.
  if (fileType.startsWith('VID-final_cut'))             return 'sandystudio/exec-stitch/assemble-episode';
  // Per-shot VGEN regen goes through /regenerate-video, not the wide event.
  // EREF revision per-shot is similar — handled by Director UI, not a global rerun.
  // Publish — terminal, no automatic rerun.
  return null;
}
