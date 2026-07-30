// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/series-canon-refs.ts
// Load a series' own LOCKED Bible canon as multi-image references.
//
// WHY THIS EXISTS (2026-07-30, found on the SS-S20 bootstrap)
// ------------------------------------------------------------
// Series canon used to be drawn BLIND. Both paths that produce a Bible image
// called plain text-to-image with zero references:
//
//   • first image  — EXEC-BIBLE-AUTHOR (runners/bible-author.ts)
//   • re-roll      — POST /api/assets/[id]/regenerate-image, legacy branch
//                    (its multi-ref branch only opens for v2 SHOT assets,
//                     which carry a test_plan; a Bible asset has none)
//
// So every canon entry after the first could not see the series style anchor or
// its hero, and therefore diverged from them BY CONSTRUCTION — not by bad luck.
// That is the long-standing Sandy canon drift the Director identified.
//
// The mechanism was never missing: openai-edits-multi works, the byte loader
// works, scripts/gen-brand-visual.ts has used this path since May. What was
// missing was the connection — in TWO places. This module is that connection,
// written ONCE so the next lesson does not have to be applied twice.
//
// Deliberately NOT a gate: a series with no canon yet (its very first entry, by
// definition) gets an empty list and the caller falls through to text-to-image.
// This anchors; it never blocks.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { MultiImageRef } from './providers/image-gen-multi';
import { readAssetMediaAsBase64 } from '../media-cache';

/**
 * How many LOCKED `SBL-character_*` identity anchors ride along. The Edits API
 * accepts up to 16 references; this cap leaves room for the style guide and
 * keeps a mature series (Sandy has 10 characters) from crowding the request
 * with cast members irrelevant to the entry being drawn.
 */
export const MAX_CANON_IDENTITY_REFS = 4;

interface CanonRow {
  id: string;
  filename: string | null;
  file_type: string;
  staging_path: string | null;
  drive_file_id: string | null;
}

/**
 * Assemble multi-image references from a series' LOCKED Bible canon.
 *
 * Order mirrors the shot path (`buildMultiImageRefs`): identity anchors first,
 * style guide last.
 *
 * @param excludeAssetId the asset being generated — never referenced, otherwise
 *        a re-roll would anchor the new image to the very version it replaces.
 * @returns references with bytes loaded; empty when the series has no usable
 *          LOCKED canon yet (caller should fall back to text-to-image).
 */
export async function loadSeriesCanonRefs(
  supabase: SupabaseClient<never>,
  args: { seriesId: string; excludeAssetId?: string | null },
): Promise<MultiImageRef[]> {
  const { data, error } = await supabase
    .from('assets')
    .select('id,filename,file_type,staging_path,drive_file_id')
    .eq('series_id', args.seriesId)
    .eq('status', 'LOCKED')
    .like('file_type', 'SBL-%');
  // Best-effort by design: a canon-lookup hiccup must degrade to text-to-image,
  // never fail a generation the Director is waiting for.
  if (error) return [];

  const canon = (data ?? []) as unknown as CanonRow[];
  const ordered = [
    ...canon
      .filter((c) => c.file_type.startsWith('SBL-character_'))
      .slice(0, MAX_CANON_IDENTITY_REFS),
    ...canon.filter((c) => c.file_type.startsWith('SBL-style_')).slice(0, 1),
  ];

  const refs: MultiImageRef[] = [];
  for (const c of ordered) {
    if (args.excludeAssetId && c.id === args.excludeAssetId) continue;
    const b64 = await readAssetMediaAsBase64({
      filename: c.filename,
      driveFileId: c.drive_file_id,
      stagingPath: c.staging_path,
    });
    if (!b64) continue;
    refs.push({
      kind: c.file_type.startsWith('SBL-style_') ? 'style' : 'identity',
      bible_asset_id: c.id,
      image_b64: b64,
    });
  }
  return refs;
}
