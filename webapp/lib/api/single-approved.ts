// ──────────────────────────────────────────────────────────────────────────────
// lib/api/single-approved.ts
// Single-approved invariant (UNIT 1, Director rule 2026-06-04, q24).
//
// When an asset becomes APPROVED (or LOCKED for SBL Bible assets), ALL sibling
// assets occupying the SAME slot must leave the occupying status (→ INVALIDATED)
// AT APPROVE TIME. There must never be more than one occupying asset per slot —
// the DB partial-unique indexes (assets_one_approved_per_anchor / _ref_plan,
// migration 0036) enforce it at the storage layer, so the new APPROVED row is
// REJECTED unless its prior sibling is demoted first.
//
// Extracted 2026-06-15 from app/api/assets/[id]/approve/route.ts so BOTH the
// Director-driven approve route AND the Mode-4 autonomous factory auto-approve
// share ONE supersede implementation. Before the extraction the factory's
// Mode-4 path inserted/flipped straight to APPROVED without demoting the prior
// sibling → it collided with the unique index on every regeneration of an
// already-approved anchor/plan (E10: SH12 anchor, SH07 ref_plan). Removing the
// index (Polina's proposal) would re-open the duplicate-anchor problem the
// index exists to prevent; superseding the prior is the correct fix.
//
// Demoted status = 'INVALIDATED' (Director q24 — NOT 'REJECTED'; REJECTED means
// "Director rejected this artifact", INVALIDATED means "auto-superseded by a
// newer approval"). The `demoted_reason: superseded_by_<id>` marker is preserved
// so the UI / audit can render provenance.
// ──────────────────────────────────────────────────────────────────────────────

import {
  isShotReferenceV2,
  type ShotReferenceContract,
} from '@/lib/api/shot-reference';
import { resolveShotId } from '@/lib/api/shot-identity';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types.gen';

/**
 * Клиент базы, каким его видит инвариант «один утверждённый на слот».
 *
 * Брался как `SupabaseClientLike` из `agents/next-events` — то есть инвариант хранилища
 * зависел по типу от диспетчера событий конвейера. Инвариант переживает роли; тип назван
 * здесь напрямую (Ф1 новой парадигмы, 2026-08-07).
 */
type SupabaseClientLike = SupabaseClient<Database>;

/** Status that "occupies" a slot for a given asset family. */
export type OccupyingStatus = 'APPROVED' | 'LOCKED';

/**
 * Describes which slot an asset occupies under the single-approved invariant.
 * `null` for asset types that have no slot (no demotion happens for those).
 */
export interface SlotDescriptor {
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
export interface AssetForSlot {
  readonly file_type: string;
  readonly episode_id: string | null;
  readonly series_id?: string | null;
  readonly metadata?: unknown;
  readonly content?: string | null;
}

/**
 * Extract a Plan/shot `shot_id`. Thin wrapper over the shared `resolveShotId`
 * SSOT (A2 2026-06-14) — kept for the existing call-site signature.
 */
function extractShotId(metadata: unknown, content?: string | null): string | null {
  return resolveShotId({ metadata, content });
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
export function resolveSlotDescriptor(asset: AssetForSlot): SlotDescriptor | null {
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

  // ── IMG-thumbnail: ONE approved Key Art per episode. EXEC-THUMB renders the
  // designer's 3 DISTINCT concept variants (emotion/curiosity/text-led) as
  // sibling IMG-thumbnail assets — but each is stamped as a sequential version
  // (v01/v02/v03). They are a "pick ONE of N" choice, NOT sequential revisions.
  // Without this slot all 3 stayed APPROVED, the UI surfaced only the newest
  // (v03), AND a kebab "approve all" fired one exec-pub/publish PER approved
  // thumbnail → TRIPLE distribution (Director E15 2026-07-05). Approving one
  // variant now supersedes the others. Episode-scoped, same shape as VID-animatic.
  if (ft.startsWith('IMG-thumbnail')) {
    return {
      ...base,
      fileTypeLike: 'IMG-thumbnail%',
      matches: (_meta, candidateFileType) =>
        typeof candidateFileType === 'string' &&
        candidateFileType.startsWith('IMG-thumbnail'),
    };
  }

  return null;
}

/** A sibling that was demoted by the single-approved invariant. */
export interface DemotedSibling {
  readonly id: string;
  /** Prior status, used to roll back if the promote step later fails. */
  readonly status: string;
}

/**
 * Demote every prior sibling occupying the SAME slot as `currentId` to
 * INVALIDATED (+ `demoted_reason: superseded_by_<currentId>`), enforcing the
 * single-approved invariant at approve time.
 *
 * Multiple priors are possible — ALL are demoted. Fails LOUD (throws) on any DB
 * error, after rolling back the siblings already demoted in this call so the
 * slot is never left in a half-demoted state. Returns the demoted siblings so
 * the caller can roll them back if the subsequent promote of `currentId` fails.
 */
export async function demoteSiblingApproved(
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
export async function restoreDemotedSiblings(
  supabase: SupabaseClientLike,
  demoted: ReadonlyArray<DemotedSibling>,
): Promise<void> {
  for (const d of demoted) {
    await supabase.from('assets').update({ status: d.status } as never).eq('id', d.id);
  }
}
