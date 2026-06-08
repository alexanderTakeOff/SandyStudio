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
import { inngest, type StudioEventName } from '@/lib/inngest/client';
import {
  isShotReferenceV2,
  type ShotReferenceContract,
} from '@/lib/api/shot-reference';
import {
  extractShotsFromStoryboard,
  isAnimaticV1,
  type AnimaticContract,
} from '@/lib/api/animatic-shotlist';
import { pickPilotVgenShots } from '@/lib/api/vgen-shot-helpers';
import { setVgenPilotState } from '@/lib/api/vgen-pilot-state';
import { isComedyLikeGenre } from '@/lib/api/genre';

/**
 * Sprint «Дизайнер и Аниматор» Day 3.2 (2026-05-18) — feature flag for the
 * Designer chain (q2c soft switch). When unset/false: REV-world_check.APPROVED
 * fires the legacy `exec-eref/generate-references` event (current behaviour).
 * When `true`: REV-world_check fans out one `exec-eref-designer/plan` event
 * per shot, and SPC-ref_plan.APPROVED fires `exec-eref/execute-from-plan`.
 * One env var, no destructive deletes — rollback by unsetting.
 */
function designerChainEnabled(): boolean {
  const v = process.env.DESIGNER_CHAIN_ENABLED;
  if (!v) return false;
  return v.toLowerCase() === 'true' || v === '1' || v.toLowerCase() === 'on';
}

/**
 * ANIMATOR_CHAIN_ENABLED env flag (symmetric to designerChainEnabled). When
 * on:
 *   - VID-animatic.APPROVED fires `exec-vanim/plan` per pilot shot
 *     (Animator authors a SPC-shot_plan for each — Critic chain in
 *     exec-vanim.nextEvent runs automatically).
 *   - SPC-shot_plan.APPROVED fires `exec-vgen/start` with planAssetId so
 *     the Plan body drives the video provider (q7a Step 6 wired end_image,
 *     seed, quality_tier extraction from Plan).
 * Off → legacy direct fire-to-VGEN path with buildShotPromptV2 template
 *       (replay-pilot fixtures + pre-Animator episodes).
 */
function animatorChainEnabled(): boolean {
  const v = process.env.ANIMATOR_CHAIN_ENABLED;
  if (!v) return false;
  return v.toLowerCase() === 'true' || v === '1' || v.toLowerCase() === 'on';
}

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
  /** Optional content (markdown / JSON body) — read by Day 3.2 Plan branch
   *  to extract `shot_id` from APPROVED SPC-ref_plan assets. */
  content?: string | null;
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

/**
 * Find the latest APPROVED upstream asset of a given file_type prefix for
 * the episode. Used by the auto-chain when a REV-* approval needs to fire
 * the next agent — the agent expects the underlying creative asset's id
 * (storyboard / script / etc.), not the review asset's id.
 *
 * Sprint φ chain bug fix (2026-05-16): REV-world_check approval was firing
 * EREF with `storyboardAssetId = <review asset id>`; runner loaded review
 * content, found no shots, failed «No episode reference assets inserted».
 * Symmetric bug for REV-script_qa → EXEC-SB (storyboarder ignored it via
 * its `findApprovedAsset` lookup, so the bug was latent there).
 */
/**
 * Resolve `series.genre` for an episode via the episodes→series JOIN.
 * Used by GAGAD chain (Day 11+ 2026-05-19) to fire only on comedy-like
 * genres. Returns null on lookup failure — `isComedyLikeGenre(null)` is
 * false, so the chain safely skips GAGAD in that case.
 */
async function resolveEpisodeGenre(
  supabase: SupabaseClientLike,
  episodeId: string,
): Promise<string | null> {
  const { data: ep } = await supabase
    .from('episodes')
    .select('series_id')
    .eq('id', episodeId)
    .maybeSingle();
  const seriesId = (ep as { series_id?: string | null } | null)?.series_id ?? null;
  if (!seriesId) return null;
  const { data: sr } = await supabase
    .from('series')
    .select('genre')
    .eq('id', seriesId)
    .maybeSingle();
  return (sr as { genre?: string | null } | null)?.genre ?? null;
}

async function findLatestApprovedAssetId(
  supabase: SupabaseClientLike,
  episodeId: string,
  fileTypePrefix: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('assets')
    .select('id,version,created_at')
    .eq('episode_id', episodeId)
    .eq('status', 'APPROVED')
    .like('file_type', `${fileTypePrefix}%`)
    .order('version', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

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
  // Resolve underlying SCR-script asset id — `asset.id` here is the REV
  // review, not the script. EXEC-SB's runner currently looks up upstream
  // assets itself (so it survives without this), but passing the correct id
  // keeps event payloads honest and consistent with the EREF fix below.
  if (ft === 'REV-script_qa' && !(await hasJob(supabase, ep, 'EXEC-SB', { since }))) {
    const scrId = await findLatestApprovedAssetId(supabase, ep, 'SCR-script');
    events.push({
      name: 'sandystudio/exec-sb/create-storyboard',
      data: { episodeId: ep, scriptAssetId: scrId ?? asset.id },
    });
  }

  // ── Script review APPROVED → EXEC-GAGAD plan (Day 11+ 2026-05-19)
  // Sprint «Дизайнер и Аниматор» Gag Assistant Director — fires in parallel
  // with EXEC-SB when the series is comedy-like. Writes SPC-gag_plan that
  // Designer/Animator + their Critics consume cross-layer. Genre-conditional
  // via isComedyLikeGenre helper — drama/doc/sci_fi skip GAGAD entirely.
  if (ft === 'REV-script_qa' && !(await hasJob(supabase, ep, 'EXEC-GAGAD', { since }))) {
    const seriesGenre = await resolveEpisodeGenre(supabase, ep);
    if (isComedyLikeGenre(seriesGenre)) {
      const scrId = await findLatestApprovedAssetId(supabase, ep, 'SCR-script');
      events.push({
        name: 'sandystudio/exec-gagad/plan',
        data: {
          episodeId: ep,
          ...(scrId ? { scriptAssetId: scrId } : {}),
        },
      });
    }
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
    // Day 3.2 (2026-05-18, q2c soft switch): when DESIGNER_CHAIN_ENABLED is
    // on, fan out one Designer Plan event per shot in the APPROVED storyboard.
    // Each Plan is a per-shot SPC-ref_plan asset that Director approves
    // independently; APPROVED Plan fires `exec-eref/execute-from-plan` below.
    // Legacy path (flag off) keeps firing the single generate-references
    // event — replay-pilot and in-flight episodes continue to work.
    if (designerChainEnabled()) {
      if (!(await hasJob(supabase, ep, 'EXEC-EREF-DESIGNER', { since }))) {
        const stbId = await findLatestApprovedAssetId(
          supabase,
          ep,
          'STB-storyboard',
        );
        // Load the APPROVED storyboard's content so we can list every shot
        // and fan out one Designer event per shot. If STB lookup fails we
        // intentionally fall back to the legacy path rather than firing zero
        // events (defensive — keeps the pipeline moving on data anomalies).
        let stbContent: string | null = null;
        if (stbId) {
          const { data: stbRow } = await supabase
            .from('assets')
            .select('content')
            .eq('id', stbId)
            .maybeSingle();
          stbContent = (stbRow as { content?: string | null } | null)?.content ?? null;
        }
        const shots = stbContent ? extractShotsFromStoryboard(stbContent) : [];
        if (shots.length > 0) {
          // Pilot Pass (Director directive 2026-05-20): only fire the first
          // PILOT_COUNT shots as Designer Plans. Director reviews / approves
          // both pilots, then we fan out the remaining shots in a second
          // batch. Mirrors the EREF v2 generate-references → fanout-trigger
          // pattern. Previously this fan-out was N×shots all at once, which
          // generated 22 Plans in one go and forced Director to triage all
          // of them before a single execute-from-plan could run. The
          // remaining shot ids are stashed into episodes.metadata so a
          // future auto-fanout-on-last-pilot trigger (or PA `fanoutDesigner`
          // tool) can pick them up without re-reading the storyboard.
          const PILOT_COUNT_DESIGNER = 2;
          const pilotShots = shots.slice(0, PILOT_COUNT_DESIGNER);
          const pendingShotIds = shots.slice(PILOT_COUNT_DESIGNER).map((s) => s.shot_id);
          for (const shot of pilotShots) {
            events.push({
              name: 'sandystudio/exec-eref-designer/plan',
              data: { episodeId: ep, shotId: shot.shot_id },
            });
          }
          // Stash remaining shot ids for the post-pilot fanout, AND mirror the
          // pilot shotIds into the Track-A `eref_pilot_shot_ids` field so the
          // browser-side EREFPilotPillbar (components/pipeline/EREFPilotPillbar.tsx)
          // can count the 2 approved pilot IMGs and activate the
          // "Approve Direction & Fan Out" button. Without this mirror, the UI
          // counter stays "0/2" forever because the Designer-chain branch
          // (Track B) writes only `designer_*` keys, but the pillbar reads
          // `eref_pilot_shot_ids` (Track A).
          //
          // TD-23 / TD-24 follow-up 2026-05-20.
          //
          // We do this AFTER queueing events so a transient metadata write
          // failure does not block the pilots — those still fire.
          try {
            const { data: epRow } = await supabase
              .from('episodes')
              .select('metadata')
              .eq('id', ep)
              .maybeSingle();
            const existingMeta = (epRow?.metadata as Record<string, unknown> | null) ?? {};
            const pilotShotIds = pilotShots.map((s) => s.shot_id);
            const nextMeta: Record<string, unknown> = {
              ...existingMeta,
              designer_pilot_count: PILOT_COUNT_DESIGNER,
              designer_fanout_total: shots.length,
              // Mirror Track-A pilot shotIds so the pillbar counter works.
              eref_pilot_shot_ids: pilotShotIds,
            };
            if (pendingShotIds.length > 0) {
              nextMeta.designer_fanout_pending = pendingShotIds;
            }
            await supabase
              .from('episodes')
              .update({ metadata: nextMeta as never } as never)
              .eq('id', ep);
          } catch {
            /* non-fatal — pilots will still fire */
          }
        } else {
          // Defensive fallback — fire legacy single event so REV-world_check
          // approval doesn't silently land in a state with zero next events.
          events.push({
            name: 'sandystudio/exec-eref/generate-references',
            data: { episodeId: ep, storyboardAssetId: stbId ?? asset.id },
          });
        }
      }
    } else if (!(await hasJob(supabase, ep, 'EXEC-EREF', { since }))) {
      // Resolve the underlying STB asset — `asset.id` is the REV-world_check
      // review, not the storyboard. EREF runner parses storyboard JSON from
      // the asset it receives, so passing the review id makes it find no
      // shots → "No episode reference assets inserted" failure. (Sprint φ
      // chain bug fix 2026-05-16.)
      const stbId = await findLatestApprovedAssetId(supabase, ep, 'STB-storyboard');
      events.push({
        name: 'sandystudio/exec-eref/generate-references',
        data: { episodeId: ep, storyboardAssetId: stbId ?? asset.id },
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

  // ── Ref Plan APPROVED → EXEC-EREF execute-from-plan (Day 3.2)
  // Sprint «Дизайнер и Аниматор» 2026-05-18 (q2c flag-gated). Director (or
  // future Day 4 Critic) approved the per-shot Plan; runner now generates
  // exactly one IMG-episode_ref using the Plan's provider/size/prompt
  // decisions. Idempotency check is keyed per Plan asset id (not per agent
  // for the whole episode) so each Plan triggers its own execute event.
  // TD-24 (2026-05-20): Designer runner writes file_type as
  // `SPC-ref_plan-<shot_id>` (e.g. `SPC-ref_plan-SS-S15-E01-A1-SC01-SH01`)
  // per its documented format. The original strict `===` check missed every
  // real Plan asset and `fired_events: []` blocked Phase 5 of the q2b smoke
  // for SS-S15-E01. Hot-fix accepts both shapes. Helper refactor for the
  // other 4 prod sites in follow-up (TD-24.B).
  if ((ft === 'SPC-ref_plan' || ft.startsWith('SPC-ref_plan-')) && designerChainEnabled()) {
    // Extract shotId from the Plan asset's JSON body so the executor knows
    // which shot to generate. We trust the body — Director would not have
    // approved a Plan with a malformed shot_id (and the Designer runner
    // validates it before write).
    let shotId: string | null = null;
    if (typeof asset.content === 'string') {
      const matches = [...asset.content.matchAll(/```json\s*([\s\S]+?)```/g)];
      const last = matches[matches.length - 1]?.[1];
      if (last) {
        try {
          const body = JSON.parse(last.trim()) as { shot_id?: unknown };
          if (typeof body.shot_id === 'string') shotId = body.shot_id;
        } catch {
          /* leave shotId null */
        }
      }
    }
    // Per-Plan idempotency: runner stamps every IMG with
    // metadata.provenance.plan_asset_id. If any IMG already carries this
    // Plan id, suppress re-fire (handles Director double-click, HMR retrigger).
    let planAlreadyExecuted = false;
    const { data: metadataRows } = await supabase
      .from('assets')
      .select('metadata')
      .eq('episode_id', ep)
      .like('file_type', 'IMG-episode_ref%');
    for (const row of (metadataRows ?? []) as Array<{ metadata?: unknown }>) {
      const meta = row.metadata as
        | { provenance?: { plan_asset_id?: unknown } }
        | null;
      if (meta?.provenance?.plan_asset_id === asset.id) {
        planAlreadyExecuted = true;
        break;
      }
    }
    if (shotId && !planAlreadyExecuted) {
      events.push({
        name: 'sandystudio/exec-eref/execute-from-plan',
        data: { episodeId: ep, shotId, planAssetId: asset.id },
      });
    }
  }

  // ── SPC-shot_plan.APPROVED → exec-vgen/start with planAssetId
  //    (q7a Step 6 wired runner.ts to extract end_image, seed, quality_tier
  //    from Plan body; this branch is what triggers that flow). Mirrors the
  //    SPC-ref_plan branch above. Gated by ANIMATOR_CHAIN_ENABLED so a
  //    pre-flag episode that received Plans manually can't accidentally
  //    fire VGEN twice. Per-Plan idempotency via metadata.provenance.
  //    plan_asset_id on the resulting VID-shot.
  if (
    (ft === 'SPC-shot_plan' || ft.startsWith('SPC-shot_plan-')) &&
    animatorChainEnabled()
  ) {
    let shotId: string | null = null;
    let durationSecondsFromPlan: number | null = null;
    if (typeof asset.content === 'string') {
      const matches = [...asset.content.matchAll(/```json\s*([\s\S]+?)```/g)];
      const last = matches[matches.length - 1]?.[1];
      if (last) {
        try {
          const body = JSON.parse(last.trim()) as {
            shot_id?: unknown;
            duration_seconds?: unknown;
          };
          if (typeof body.shot_id === 'string') shotId = body.shot_id;
          if (typeof body.duration_seconds === 'number' && body.duration_seconds > 0) {
            durationSecondsFromPlan = body.duration_seconds;
          }
        } catch {
          /* leave shotId null */
        }
      }
    }
    // Per-Plan idempotency: VGEN runner stamps every VID-shot with
    // metadata.provenance.plan_asset_id. If any VID-shot already carries
    // this Plan id, suppress re-fire.
    let planAlreadyExecuted = false;
    const { data: vidRows } = await supabase
      .from('assets')
      .select('metadata')
      .eq('episode_id', ep)
      .like('file_type', 'VID-shot%');
    for (const row of (vidRows ?? []) as Array<{ metadata?: unknown }>) {
      const meta = row.metadata as
        | { provenance?: { plan_asset_id?: unknown } }
        | null;
      if (meta?.provenance?.plan_asset_id === asset.id) {
        planAlreadyExecuted = true;
        break;
      }
    }
    if (shotId && !planAlreadyExecuted) {
      const data: {
        episodeId: string;
        shotId: string;
        planAssetId: string;
        duration_seconds?: number;
      } = {
        episodeId: ep,
        shotId,
        planAssetId: asset.id,
      };
      if (durationSecondsFromPlan !== null) {
        data.duration_seconds = durationSecondsFromPlan;
      }
      // TD-47.a (2026-05-24): emit `single-shot` (not `start`/Pilot Pass).
      // Pilot Pass marks output as `vgen_pilot=true` and forces fast tier —
      // both wrong for Plan-driven path. The Plan IS the preview; we want a
      // single canonical VID-shot at the tier the Plan specifies.
      events.push({
        name: 'sandystudio/exec-vgen/single-shot',
        data,
      });
    }
  }

  // ── TD-49 Phase 2 P2.6 — IMG-anchor batch flow
  //
  // When an `IMG-anchor_*` asset is APPROVED, we do NOT immediately fire a
  // downstream agent — the Animator (EXEC-VANIM) needs ALL anchors of the
  // episode in place before it can author Plans (each Plan body references
  // both start_anchor and end_anchor by asset_id). The flow:
  //
  //   1. Read `episodes.metadata.anchor_chain_enabled`. If false / absent →
  //      no-op (legacy path, anchor chain feature off for this episode).
  //   2. Count storyboard shots for the episode.
  //   3. Count APPROVED IMG-anchor_* assets for the episode.
  //   4. If APPROVED count < expected (`2 × shotCount`) → just log progress
  //      and exit. Director continues approving pairs.
  //   5. If APPROVED count >= expected → all anchors locked. Fan-out
  //      `exec-vanim/plan` per shot so the Animator authors each Plan with
  //      references to its `start_anchor` + `end_anchor` IDs.
  //
  // Pair reciprocity (checkAnchorPairCompatibility across adjacent shots)
  // is not gated here in v1 — it lives at the Critic structural validator
  // (P2.5 validateAnchorChainStructure) per-Plan. Approve-route fanout
  // surfaces a warning-level activity event if cross-shot mismatch found
  // but does not block the fan-out (Director can still revise).
  if (ft.startsWith('IMG-anchor_') || ft === 'IMG-anchor') {
    // computeNextEvents is only invoked on APPROVE (callsite line 1157), so
    // no decision check needed here.
    const { data: episodeRow } = await supabase
      .from('episodes')
      .select('id,metadata')
      .eq('id', ep)
      .maybeSingle();
    const epMetadata =
      (episodeRow as { metadata?: Record<string, unknown> | null } | null)
        ?.metadata ?? null;
    const anchorChainEnabled =
      Boolean(epMetadata && (epMetadata as { anchor_chain_enabled?: unknown }).anchor_chain_enabled);

    if (anchorChainEnabled) {
      // 1. Total storyboard shots — 2 × N is the expected anchor count.
      const { data: stbRow } = await supabase
        .from('assets')
        .select('content')
        .eq('episode_id', ep)
        .eq('file_type', 'STB-storyboard')
        .eq('status', 'APPROVED')
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();
      let shotCount = 0;
      const stbContent =
        (stbRow as { content?: string | null } | null)?.content ?? null;
      let shots: Array<{ shotId: string }> = [];
      if (stbContent) {
        try {
          const { listStoryboardShots } = await import('@/lib/api/vgen-shot-helpers');
          shots = listStoryboardShots(stbContent);
          shotCount = shots.length;
        } catch {
          shotCount = 0;
        }
      }
      const expected = shotCount > 0 ? shotCount * 2 : 0;

      // 2. APPROVED IMG-anchor_* count.
      const { count: approvedAnchorCount } = await supabase
        .from('assets')
        .select('id', { count: 'exact', head: true })
        .eq('episode_id', ep)
        .like('file_type', 'IMG-anchor_%')
        .eq('status', 'APPROVED');
      const approved = approvedAnchorCount ?? 0;

      if (expected > 0 && approved >= expected && shots.length > 0) {
        // 3. All anchors approved → ONE animatic pass (pacing gate) before
        // any video. TD-49 Phase 2 re-wire: previously this fanned out
        // exec-vanim/plan per shot, skipping the pacing preview. Now it fires
        // a single exec-edit/create-animatic with anchor_mode so EXEC-EDIT
        // builds the animatic from APPROVED IMG-anchor START frames. The
        // animatic→video gate (Director approves the animatic) is what fans
        // out per-shot planning afterwards (VID-animatic APPROVED branch).
        //
        // Idempotency: hasJob with since=updated_at on this asset gates
        // re-fires of EXEC-EDIT at the episode level.
        const alreadyFired = await hasJob(supabase, ep, 'EXEC-EDIT', { since });
        if (!alreadyFired) {
          // Optional: attach newest APPROVED music so the animatic plays with
          // the real track for pacing review (graceful — absent → silent).
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
              anchor_mode: true,
              ...(musicAssetId ? { musicAssetId } : {}),
            },
          });
        }
      }
      // expected === 0 or approved < expected: no event emitted. Activity
      // feed already shows the per-anchor approval; the gate is implicit.
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
    const animaticMeta = (asset as { metadata?: unknown }).metadata;

    // TD-49 Phase 2 (anchor_chain_enabled): in anchor mode the per-shot Plans
    // already exist (Animator authored them before the anchors). The animatic
    // is now the PACING GATE, and approving it advances into video — without
    // re-planning existing Plans (LOCKED idempotency) and still respecting the
    // pilot gate (q13 LOCKED — KEEP pilot, do NOT fan out all shots).
    const { data: anchorEpRow } = await supabase
      .from('episodes')
      .select('metadata')
      .eq('id', ep)
      .maybeSingle();
    const anchorEpMeta =
      (anchorEpRow as { metadata?: Record<string, unknown> | null } | null)
        ?.metadata ?? null;
    const anchorMode = Boolean(
      anchorEpMeta &&
        (anchorEpMeta as { anchor_chain_enabled?: unknown }).anchor_chain_enabled ===
          true,
    );

    if (anchorMode) {
      // Anchor-mode gate. Idempotency on EXEC-VGEN — advancing approved Plans
      // fires video-gen, never the Animator (plans are not regenerated).
      const alreadyFiredAnchor = await hasJob(supabase, ep, 'EXEC-VGEN', { since });
      if (!alreadyFiredAnchor && isAnimaticV1(animaticMeta)) {
        const v1 = (animaticMeta as { animatic_v1: AnimaticContract }).animatic_v1;
        const shotList = v1.shot_list ?? [];
        // q13 LOCKED — KEEP pilot: only the pilot shots advance, not all shots.
        const pilots = pickPilotVgenShots(shotList);
        if (pilots.length > 0) {
          // Map shot_id → existing SPC-shot_plan (id + status). E02 already has
          // all 30 plans, so this map is fully populated and NO planning fires.
          const { data: planRows } = await supabase
            .from('assets')
            .select('id,status,content,metadata')
            .eq('episode_id', ep)
            .or('file_type.eq.SPC-shot_plan,file_type.like.SPC-shot_plan-%');
          // Only an APPROVED plan may advance to video. A plan that merely
          // EXISTS (REVIEW/REVISION) has NOT passed the Animator's Critic — so
          // firing video on it bypasses the quality gate AND is rejected
          // downstream by EXEC-VGEN ("expected APPROVED", runner.ts). Track
          // APPROVED plans separately from "any plan exists" so unapproved shots
          // WAIT for plan approval instead of spawning doomed video jobs.
          const approvedPlanByShotId = new Map<string, { id: string }>();
          const shotsWithAnyPlan = new Set<string>();
          for (const row of (planRows ?? []) as Array<{
            id: string;
            status?: string | null;
            content?: string | null;
            metadata?: unknown;
          }>) {
            // Prefer metadata.shot_id; fall back to content fenced JSON shot_id.
            let shotId: string | null = null;
            const meta = row.metadata as { shot_id?: unknown } | null;
            if (typeof meta?.shot_id === 'string') shotId = meta.shot_id;
            if (!shotId && typeof row.content === 'string') {
              const matches = [...row.content.matchAll(/```json\s*([\s\S]+?)```/g)];
              const last = matches[matches.length - 1]?.[1];
              if (last) {
                try {
                  const body = JSON.parse(last.trim()) as { shot_id?: unknown };
                  if (typeof body.shot_id === 'string') shotId = body.shot_id;
                } catch {
                  /* leave shotId null */
                }
              }
            }
            if (!shotId) continue;
            shotsWithAnyPlan.add(shotId);
            // Newest-wins: any APPROVED plan for the shot is enough to advance it.
            if (row.status === 'APPROVED') approvedPlanByShotId.set(shotId, { id: row.id });
          }

          // Per-Plan video idempotency: a VID-shot stamped with the plan's
          // asset_id means that plan was already executed → never re-fire.
          const { data: vidRows } = await supabase
            .from('assets')
            .select('metadata')
            .eq('episode_id', ep)
            .like('file_type', 'VID-shot%');
          const executedPlanIds = new Set<string>();
          for (const row of (vidRows ?? []) as Array<{ metadata?: unknown }>) {
            const m = row.metadata as
              | { provenance?: { plan_asset_id?: unknown } }
              | null;
            if (typeof m?.provenance?.plan_asset_id === 'string') {
              executedPlanIds.add(m.provenance.plan_asset_id);
            }
          }

          let firedPilotVideo = false;
          for (const p of pilots) {
            const approvedPlan = approvedPlanByShotId.get(p.shotId);
            if (approvedPlan) {
              // APPROVED plan → advance to video via the plan-driven single-shot
              // path. Skip if its plan already produced a VID-shot.
              if (executedPlanIds.has(approvedPlan.id)) continue;
              events.push({
                name: 'sandystudio/exec-vgen/single-shot',
                data: {
                  episodeId: ep,
                  shotId: p.shotId,
                  planAssetId: approvedPlan.id,
                  duration_seconds: p.durationSeconds,
                },
              });
              firedPilotVideo = true;
            } else if (shotsWithAnyPlan.has(p.shotId)) {
              // Plan exists but is NOT APPROVED (REVIEW/REVISION) — it has not
              // cleared the Animator's Critic. Do NOT fire video (that bypasses
              // the gate and EXEC-VGEN rejects it) and do NOT re-author. The shot
              // advances on its own when its SPC-shot_plan.APPROVED fires.
              continue;
            } else {
              // No plan at all for this pilot shot → author one (Animator chain).
              events.push({
                name: 'sandystudio/exec-vanim/plan',
                data: { episodeId: ep, shotId: p.shotId },
              });
            }
          }
          // Only mark pilots PENDING_REVIEW when a pilot video actually fired —
          // not when every pilot is waiting on plan approval (E02's case).
          if (firedPilotVideo) await setVgenPilotState(supabase, ep, 'PENDING_REVIEW');
        }
      }
    } else {
    // ANIMATOR_CHAIN: idempotency on EXEC-VANIM (Plan author); legacy:
    // EXEC-VGEN. Picking the wrong one would either re-fire pilots on
    // double-click (animator chain) or block animator chain firing at all.
    const animatorChain = animatorChainEnabled();
    const alreadyFired = animatorChain
      ? await hasJob(supabase, ep, 'EXEC-VANIM', { since })
      : await hasJob(supabase, ep, 'EXEC-VGEN', { since });
    if (!alreadyFired) {
      if (isAnimaticV1(animaticMeta)) {
        const v1 = (animaticMeta as { animatic_v1: AnimaticContract }).animatic_v1;
        const shotList = v1.shot_list ?? [];
        const pilots = pickPilotVgenShots(shotList);
        if (pilots.length > 0) {
          // Set pilot_state PENDING_REVIEW upfront — runner will reaffirm
          // it after each pilot finishes. Doing it here means the UI reflects
          // "pilot in flight" the moment Director clicks Approve animatic.
          await setVgenPilotState(supabase, ep, 'PENDING_REVIEW');
          if (animatorChain) {
            // ANIMATOR_CHAIN ON: per-shot Animator authors SPC-shot_plan →
            // exec-vprev (Critic) auto-chained → comedy → GAGAD review →
            // Director approves Plan → SPC-shot_plan.APPROVED branch below
            // fires exec-vgen/start with planAssetId for plan-driven video.
            // Closes the 2026-05-19 «~30 LoC follow-up» gap. Symmetric to
            // designer chain (REV-world_check → exec-eref-designer per shot).
            for (const p of pilots) {
              events.push({
                name: 'sandystudio/exec-vanim/plan',
                data: {
                  episodeId: ep,
                  shotId: p.shotId,
                },
              });
            }
          } else {
            // Legacy direct-to-VGEN (buildShotPromptV2 template path).
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
    } // end non-anchor (else) branch
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
  if (ft === 'SPC-metadata' && !(await hasJob(supabase, ep, 'EXEC-THUMB-DESIGNER', { since }))) {
    events.push({
      name: 'sandystudio/exec-thumb-designer/plan',
      data: {
        episodeId: ep,
        assetId: asset.id,
      },
    });
  }

  // ── Thumbnail Plan APPROVED → EXEC-THUMB executor renders the designed
  //    variants from the plan (1280×720 + overlay). Director's APPROVE click
  //    on the SPC-thumb_plan is what fires rendering in Mode 1-3.
  if (ft === 'SPC-thumb_plan' && !(await hasJob(supabase, ep, 'EXEC-THUMB', { since }))) {
    events.push({
      name: 'sandystudio/exec-thumb/generate-thumbnail',
      data: {
        episodeId: ep,
        planAssetId: asset.id,
      },
    });
  }

  // ── Thumbnail APPROVED → check publish-ready set (animatic + metadata +
  //    thumbnail all APPROVED) → EXEC-PUB. Director's APPROVE click on the
  //    thumbnail is the implicit publish-confirm in Mode 1-3.
  if (ft === 'IMG-thumbnail') {
    // 2026-06-01: publish-ready now requires the real final cut, not the animatic.
    const finalCutOk = (await countApproved(supabase, ep, 'VID-final_cut')) >= 1;
    const metadataOk = (await countApproved(supabase, ep, 'SPC-metadata')) >= 1;
    const thumbOk = (await countApproved(supabase, ep, 'IMG-thumbnail')) >= 1;
    if (finalCutOk && metadataOk && thumbOk && !(await hasJob(supabase, ep, 'EXEC-PUB', { since }))) {
      events.push({
        name: 'sandystudio/exec-pub/publish',
        data: { episodeId: ep, directorConfirm: true, confirmedBy: directorUserId },
      });
    }
  }

  // ── Final cut APPROVED → if metadata + thumbnail are also approved, the
  //    episode is publish-ready (final_cut may be the last of the three to
  //    be approved). Mirrors the thumbnail branch so order doesn't matter.
  if (ft === 'VID-final_cut') {
    const finalCutOk = (await countApproved(supabase, ep, 'VID-final_cut')) >= 1;
    const metadataOk = (await countApproved(supabase, ep, 'SPC-metadata')) >= 1;
    const thumbOk = (await countApproved(supabase, ep, 'IMG-thumbnail')) >= 1;
    if (finalCutOk && metadataOk && thumbOk && !(await hasJob(supabase, ep, 'EXEC-PUB', { since }))) {
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
  if (fileType === 'SPC-gag_plan')                      return 'sandystudio/exec-gagad/plan';
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
