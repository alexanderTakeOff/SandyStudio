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

// ──────────────────────────────────────────────────────────────────────────────
// Single-approved invariant (UNIT 1, Director rule 2026-06-04, q24)
//
// When an asset is APPROVED (or LOCKED for SBL Bible assets), ALL sibling
// assets in the SAME set must leave the occupying status (→ INVALIDATED) AT
// APPROVE TIME. There must never be more than one occupying asset per slot.
//
// Demoted status = 'INVALIDATED' (Director q24 — NOT 'REJECTED'; REJECTED
// means "Director rejected this artifact", INVALIDATED means "auto-superseded
// by a newer approval"). The `demoted_reason: superseded_by_<id>` marker is
// preserved so the UI / audit can render provenance.
// ──────────────────────────────────────────────────────────────────────────────

/** Status that "occupies" a slot for a given asset family. */
type OccupyingStatus = 'APPROVED' | 'LOCKED';

/**
 * Describes which slot an asset occupies under the single-approved invariant.
 * `null` for asset types that have no slot (no demotion happens for those).
 */
interface SlotDescriptor {
  /** Status that counts as occupying the slot (LOCKED only for SBL). */
  readonly occupyingStatus: OccupyingStatus;
  /** Scope column the sibling query filters on. */
  readonly scopeColumn: 'episode_id' | 'series_id';
  /** Scope value (episode_id or series_id). */
  readonly scopeValue: string;
  /** `file_type LIKE` pattern that selects candidate siblings. */
  readonly fileTypeLike: string;
  /** True when a candidate row shares this asset's exact slot. */
  readonly matches: (candidateMetadata: unknown, candidateFileType: string) => boolean;
}

/** Shape just enough of an asset to resolve its slot. */
interface AssetForSlot {
  readonly file_type: string;
  readonly episode_id: string | null;
  readonly series_id?: string | null;
  readonly metadata?: unknown;
  readonly content?: string | null;
}

/**
 * Extract a Plan/shot `shot_id` from metadata, falling back to the last fenced
 * JSON block in the markdown body. SPC-shot_plan / SPC-ref_plan / VID-shot all
 * carry `metadata.shot_id`; older Plans only embedded it in the content body.
 */
function extractShotId(metadata: unknown, content?: string | null): string | null {
  const metaShotId = (metadata as { shot_id?: unknown } | null)?.shot_id;
  if (typeof metaShotId === 'string' && metaShotId.length > 0) return metaShotId;
  if (typeof content === 'string') {
    const matches = [...content.matchAll(/```json\s*([\s\S]+?)```/g)];
    const last = matches[matches.length - 1]?.[1];
    if (last) {
      try {
        const body = JSON.parse(last.trim()) as { shot_id?: unknown };
        if (typeof body.shot_id === 'string' && body.shot_id.length > 0) {
          return body.shot_id;
        }
      } catch {
        /* malformed body — fall through to null */
      }
    }
  }
  return null;
}

/**
 * Resolve the slot an asset occupies, or `null` if its type has no
 * single-approved invariant (most asset types — no demotion for those).
 *
 * Slot definitions (Director rule + UNIT 1 spec):
 *   - IMG-episode_ref (v2)          → slot = shot_reference.shot_id
 *   - IMG-anchor                    → slot = (shot_reference.shot_id, anchor_position)
 *   - SPC-shot_plan / -%            → slot = shot_id (metadata, fallback content)
 *   - VID-shot                      → slot = shot_id
 *   - SPC-ref_plan / -%             → slot = shot_id
 *   - SBL-*  (LOCKED set)           → slot = (series_id, file_type exact)
 */
function resolveSlotDescriptor(asset: AssetForSlot): SlotDescriptor | null {
  const ft = asset.file_type;
  if (typeof ft !== 'string') return null;

  // ── SBL Bible assets — series-scoped, LOCKED is the occupying status.
  if (ft.startsWith('SBL')) {
    const seriesId = asset.series_id ?? null;
    if (!seriesId) return null;
    return {
      occupyingStatus: 'LOCKED',
      scopeColumn: 'series_id',
      scopeValue: seriesId,
      // Exact file_type match — each SBL file_type is its own slot.
      fileTypeLike: ft,
      matches: (_meta, candidateFileType) => candidateFileType === ft,
    };
  }

  // Everything below is episode-scoped, APPROVED is the occupying status.
  const episodeId = asset.episode_id ?? null;
  if (!episodeId) return null;
  const base = {
    occupyingStatus: 'APPROVED' as const,
    scopeColumn: 'episode_id' as const,
    scopeValue: episodeId,
  };

  // ── IMG-episode_ref (EREF v2): slot = shot_reference.shot_id.
  if (ft.startsWith('IMG-episode_ref')) {
    if (!isShotReferenceV2(asset.metadata)) return null;
    const shotId = (asset.metadata as { shot_reference: ShotReferenceContract })
      .shot_reference.shot_id;
    if (typeof shotId !== 'string') return null;
    return {
      ...base,
      fileTypeLike: 'IMG-episode_ref%',
      matches: (meta) => {
        if (!isShotReferenceV2(meta)) return false;
        return (
          (meta as { shot_reference: ShotReferenceContract }).shot_reference
            .shot_id === shotId
        );
      },
    };
  }

  // ── IMG-anchor: slot = (shot_id, anchor_position). start/end never collapse.
  if (ft.startsWith('IMG-anchor')) {
    const m = asset.metadata as
      | { shot_reference?: { shot_id?: unknown }; anchor_position?: unknown }
      | null;
    const shotId = m?.shot_reference?.shot_id;
    const pos = m?.anchor_position;
    if (typeof shotId !== 'string' || (pos !== 'start' && pos !== 'end')) {
      return null;
    }
    return {
      ...base,
      fileTypeLike: 'IMG-anchor%',
      matches: (meta) => {
        const cm = meta as
          | { shot_reference?: { shot_id?: unknown }; anchor_position?: unknown }
          | null;
        return cm?.shot_reference?.shot_id === shotId && cm?.anchor_position === pos;
      },
    };
  }

  // ── Plan + video slots keyed purely by shot_id.
  const shotIdSlots: ReadonlyArray<{ prefix: string; like: string }> = [
    { prefix: 'SPC-shot_plan', like: 'SPC-shot_plan%' },
    { prefix: 'VID-shot', like: 'VID-shot%' },
    { prefix: 'SPC-ref_plan', like: 'SPC-ref_plan%' },
  ];
  for (const slot of shotIdSlots) {
    if (ft === slot.prefix || ft.startsWith(`${slot.prefix}-`)) {
      const shotId = extractShotId(asset.metadata, asset.content);
      if (!shotId) return null;
      return {
        ...base,
        fileTypeLike: slot.like,
        matches: (meta, candidateFileType) => {
          // Restrict to the same family so SPC-shot_plan never collides with
          // SPC-shot_plan_critique etc. that happen to share a shot_id.
          if (
            candidateFileType !== slot.prefix &&
            !candidateFileType.startsWith(`${slot.prefix}-`)
          ) {
            return false;
          }
          // candidateFileType has no content here, so rely on metadata.shot_id.
          return extractShotId(meta, null) === shotId;
        },
      };
    }
  }

  // ── VID-animatic: ONE approved animatic per episode. Approving a new one
  // supersedes every prior APPROVED animatic. 2026-06-08 — without this slot,
  // v06 stayed APPROVED after v07 was approved, so EXEC-STITCH (which loads all
  // APPROVED animatics unordered) could stitch the STALE v06 while Director
  // edited v07 → every re-render was byte-identical. The stitch-picks-newest
  // guard in runner.ts is the belt; this slot is the suspenders (keeps the DB
  // to a single APPROVED animatic, which gates + critic also assume).
  if (ft.startsWith('VID-animatic')) {
    return {
      ...base,
      fileTypeLike: 'VID-animatic%',
      matches: (_meta, candidateFileType) =>
        typeof candidateFileType === 'string' &&
        candidateFileType.startsWith('VID-animatic'),
    };
  }

  return null;
}

/** A sibling that was demoted by the single-approved invariant. */
interface DemotedSibling {
  readonly id: string;
  /** Prior status, used to roll back if the promote step later fails. */
  readonly status: string;
}

/**
 * Demote every prior sibling occupying the SAME slot as `currentId` to
 * INVALIDATED (+ `demoted_reason: superseded_by_<currentId>`), enforcing the
 * single-approved invariant at approve time.
 *
 * Multiple priors are possible (no DB unique index for anchors / plans / SBL
 * yet) — ALL are demoted. Fails LOUD (throws) on any DB error, after rolling
 * back the siblings already demoted in this call so the slot is never left in
 * a half-demoted state. Returns the demoted siblings so the caller can roll
 * them back if the subsequent promote of `currentId` fails.
 */
async function demoteSiblingApproved(
  supabase: SupabaseClientLike,
  args: { slot: SlotDescriptor; currentId: string },
): Promise<DemotedSibling[]> {
  const { slot, currentId } = args;
  // Branch on scope column explicitly so the typed client narrows the column
  // and its value together (episode_id vs series_id) without a union.
  const base = supabase
    .from('assets')
    .select('id,status,file_type,metadata')
    .eq('status', slot.occupyingStatus)
    .like('file_type', slot.fileTypeLike)
    .neq('id', currentId);
  const scoped =
    slot.scopeColumn === 'series_id'
      ? base.eq('series_id', slot.scopeValue)
      : base.eq('episode_id', slot.scopeValue);
  const { data: candidates, error: fetchErr } = await scoped;
  if (fetchErr) {
    throw new Error(`prior-occupied sibling fetch failed: ${fetchErr.message}`);
  }

  const demoted: DemotedSibling[] = [];
  for (const row of (candidates ?? []) as Array<{
    id: string;
    status: string;
    file_type: string;
    metadata?: unknown;
  }>) {
    if (!slot.matches(row.metadata, row.file_type)) continue;
    const newMeta = {
      ...((row.metadata as Record<string, unknown> | null) ?? {}),
      demoted_reason: `superseded_by_${currentId}`,
    };
    const { error: demoteErr } = await supabase
      .from('assets')
      .update({
        status: 'INVALIDATED',
        metadata: newMeta as unknown as Record<string, unknown>,
      } as never)
      .eq('id', row.id)
      // Guard: only demote if still occupying (idempotent under double-fire).
      .eq('status', slot.occupyingStatus);
    if (demoteErr) {
      // Roll back the siblings already demoted in this call so the slot is not
      // left half-collapsed, then fail loud.
      await restoreDemotedSiblings(supabase, demoted);
      throw new Error(
        `auto-demote of prior occupied sibling ${row.id} failed: ${demoteErr.message}`,
      );
    }
    demoted.push({ id: row.id, status: row.status });
  }
  return demoted;
}

/**
 * Best-effort restore of demoted siblings to their prior status. Used both on
 * mid-loop demote failure and when the promote of the approved asset fails
 * after siblings were already demoted.
 */
async function restoreDemotedSiblings(
  supabase: SupabaseClientLike,
  demoted: ReadonlyArray<DemotedSibling>,
): Promise<void> {
  for (const d of demoted) {
    await supabase.from('assets').update({ status: d.status } as never).eq('id', d.id);
  }
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
