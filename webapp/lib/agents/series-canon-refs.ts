// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/series-canon-refs.ts
// The ONE place a Series Bible image request is assembled: positive prompt,
// negative terms, and the canon images that ride along as references.
//
// WHY THIS EXISTS (2026-07-30, found while bootstrapping SS-S20 from scratch)
// ---------------------------------------------------------------------------
// Series canon used to be drawn blind, in three different places, each with its
// own prompt builder:
//
//   • first image  — EXEC-BIBLE-AUTHOR (runners/bible-author.ts)
//   • re-roll      — POST /api/assets/[id]/regenerate-image (legacy branch)
//   • Add-asset UI — POST /api/series/[id]/bible/generate-image
//
// None of them attached the series' own canon, so entry N+1 could not see entry
// N and diverged from it BY CONSTRUCTION — the long-standing canon drift the
// Director had been attributing to the models. The models were never wrong:
// they drew exactly what they were told.
//
// Three rules are enforced here so they cannot be forgotten in one of the three
// call sites again:
//
//   1. THE MODEL READS THE RENDER BLOCK, NOT THE WHOLE ENTRY. A Bible entry is
//      a human document; feeding all of it to a renderer hands it canon ids,
//      role labels and production reasoning as things to draw.
//   2. PROHIBITIONS GO TO THE NEGATIVE CHANNEL, never into the positive prompt.
//      openai-edits-multi folds them into one closing clause; a 2026-05-26
//      finding showed hard negatives up front starve the positive prompt.
//   3. REFERENCES ARE DECLARED, NOT ASSUMED. openai-edits-multi supports no
//      per-reference weighting, so an unrelated creature attached to a cabin
//      interior contributes exactly as much as the style anchor.
//
// Back-compatible by construction: an entry with no `## RENDER` section gets
// `render: null`, and every caller falls back to its previous behaviour byte
// for byte. SS-S15's ~50 LOCKED entries need no migration and cannot regress.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { MultiImageRef } from './providers/image-gen-multi';
import { readAssetMediaAsBase64 } from '../media-cache';
import { bibleSlug, parseRenderBrief, type RenderBrief } from '../api/series-bible';

/**
 * Ceiling on canon images attached to one Bible generation, style excluded.
 * The Edits API accepts 16; the low cap is deliberate — every extra reference
 * dilutes the others equally, so more is not better.
 */
export const MAX_CANON_REFS = 4;

/** A reference that was meant to ride along and did not. */
export interface DroppedRef {
  bible_asset_id: string;
  kind: string;
  reason: string;
}

export interface CanonRefsResult {
  refs: MultiImageRef[];
  dropped: DroppedRef[];
  /**
   * A reference the entry's author DECLARED could not be loaded. The author
   * named it load-bearing, so the caller must HALT rather than quietly draw
   * without it. Null when everything declared resolved.
   */
  halt: string | null;
}

interface CanonRow {
  id: string;
  filename: string | null;
  file_type: string;
  status: string;
  staging_path: string | null;
  drive_file_id: string | null;
}

/** Reference kind implied by a Bible file_type. */
function kindFor(fileType: string): MultiImageRef['kind'] {
  if (fileType.startsWith('SBL-style_')) return 'style';
  if (fileType.startsWith('SBL-location_')) return 'location';
  if (fileType.startsWith('SBL-object_')) return 'object';
  return 'identity';
}

/**
 * Load the canon images a Bible generation should be anchored on.
 *
 * Selection is DECLARED, not assumed:
 *   - `refSlugs` — canon the entry's author named on its `Refs:` line, in the
 *     order given. These are load-bearing: one that cannot be loaded HALTs.
 *   - the series style anchor, always appended last (the shot path's order).
 *
 * When nothing is declared the result is the style anchor alone. That is the
 * deliberate default: for a new character another character's face is
 * contamination, not anchoring, and before this rule existed the selection was
 * literally arbitrary — the query had no ORDER BY and took whichever four rows
 * Postgres happened to return.
 */
export async function loadSeriesCanonRefs(
  supabase: SupabaseClient<never>,
  args: {
    seriesId: string;
    /** Never reference the asset being generated — it would anchor on the version being replaced. */
    excludeAssetId?: string | null;
    /** Canon slugs declared by the entry's author. */
    refSlugs?: readonly string[];
  },
): Promise<CanonRefsResult> {
  const dropped: DroppedRef[] = [];

  const { data, error } = await supabase
    .from('assets')
    .select('id,filename,file_type,status,staging_path,drive_file_id')
    .eq('series_id', args.seriesId)
    .in('status', ['LOCKED', 'APPROVED'])
    .like('file_type', 'SBL-%')
    // Deterministic: LOCKED canon outranks APPROVED, then oldest first, so the
    // same entry assembles the same request on every run.
    .order('status', { ascending: true })
    .order('created_at', { ascending: true });
  // Best-effort by design: a canon-lookup hiccup must degrade to text-to-image,
  // never fail a generation the Director is waiting for.
  if (error) return { refs: [], dropped, halt: null };

  const canon = (data ?? []) as unknown as CanonRow[];
  const usable = canon.filter((c) => c.id !== args.excludeAssetId);

  const declared = (args.refSlugs ?? []).slice(0, MAX_CANON_REFS);
  const chosen: CanonRow[] = [];
  const missingDeclared: string[] = [];

  for (const slug of declared) {
    // LOCKED first — `usable` is already ordered, so find() takes the best match.
    const row = usable.find((c) => bibleSlug(c.file_type) === slug);
    if (row) chosen.push(row);
    else missingDeclared.push(slug);
  }

  // Style anchor last, and only once.
  const style = usable.find((c) => c.file_type.startsWith('SBL-style_'));
  if (style && !chosen.some((c) => c.id === style.id)) chosen.push(style);

  const refs: MultiImageRef[] = [];
  for (const c of chosen) {
    const b64 = await readAssetMediaAsBase64({
      filename: c.filename,
      driveFileId: c.drive_file_id,
      stagingPath: c.staging_path,
    });
    if (!b64) {
      dropped.push({
        bible_asset_id: c.id,
        kind: kindFor(c.file_type),
        reason: 'media unreachable',
      });
      const slug = bibleSlug(c.file_type);
      if (slug && declared.includes(slug)) missingDeclared.push(slug);
      continue;
    }
    refs.push({ kind: kindFor(c.file_type), bible_asset_id: c.id, image_b64: b64 });
  }

  const halt =
    missingDeclared.length > 0
      ? `Declared canon reference(s) unavailable: ${[...new Set(missingDeclared)].join(', ')}. ` +
        `The entry's author named them load-bearing — draw without them and the result is off-canon by construction.`
      : null;

  return { refs, dropped, halt };
}

export interface AssembledImageRequest {
  prompt: string;
  negative: string[];
  refs: MultiImageRef[];
  dropped: DroppedRef[];
  halt: string | null;
  /** True when the entry carried a RENDER block; false means the caller's fallback prompt was used. */
  usedRenderBlock: boolean;
}

/**
 * Assemble one Bible image request from an entry.
 *
 * `fallbackPrompt` is what the caller would have sent before this module
 * existed. It is used verbatim when the entry has no `## RENDER` section, which
 * is what keeps every pre-2026-07-30 entry behaving exactly as it did.
 *
 * `defaultNegative` carries the per-section prohibitions that used to be prose
 * inside the positive prompt.
 */
export async function assembleBibleImageRequest(
  supabase: SupabaseClient<never>,
  args: {
    seriesId: string | null;
    assetId?: string | null;
    /** The entry's markdown body. */
    content: string | null | undefined;
    /** Prompt to use when the entry has no RENDER block. */
    fallbackPrompt: string;
    /** Prompt prefix applied to a RENDER block (e.g. «Canonical character reference for …»). */
    renderPrefix?: string;
    defaultNegative?: readonly string[];
    /** Set when the caller supplies its own prompt (Director hand-edit) — RENDER is then ignored. */
    explicitPrompt?: string | null;
  },
): Promise<AssembledImageRequest> {
  const brief: RenderBrief | null = parseRenderBrief(args.content);

  const usedRenderBlock = !args.explicitPrompt && brief !== null;
  const positive = args.explicitPrompt
    ? args.explicitPrompt
    : brief
      ? [args.renderPrefix, brief.render].filter(Boolean).join('\n\n')
      : args.fallbackPrompt;

  const negative = [...new Set([...(args.defaultNegative ?? []), ...(brief?.negative ?? [])])];

  if (!args.seriesId) {
    return { prompt: positive, negative, refs: [], dropped: [], halt: null, usedRenderBlock };
  }

  const { refs, dropped, halt } = await loadSeriesCanonRefs(supabase, {
    seriesId: args.seriesId,
    excludeAssetId: args.assetId ?? null,
    refSlugs: brief?.refSlugs ?? [],
  });

  return { prompt: positive, negative, refs, dropped, halt, usedRenderBlock };
}
