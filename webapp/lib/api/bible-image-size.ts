// ──────────────────────────────────────────────────────────────────────────────
// lib/api/bible-image-size.ts
//
// 2026-05-20 Director surfaced: Bible Library references were generated at
// 1024×1024 (1:1) despite being for a landscape-format show. Director:
// «У нас по-моему требования другие». Symmetric with the EREF Designer
// SIZE_BY_DELIVERY_TARGET table that Sprint «Дизайнер и Аниматор» introduced
// for episode references — Bible chain never picked it up.
//
// gpt-image-2 only supports three sizes: 1024x1024, 1024x1536, 1536x1024.
// Anything else gets snapped to the nearest aspect bucket. We tier the
// choice in this order:
//
//   1. Explicit series.metadata.delivery_targets[0] if set → consult the
//      shared SIZE_BY_DELIVERY_TARGET table → snap to gpt-image-2.
//   2. Bible section default — characters & objects = square (best for a
//      single hero specimen on a neutral backdrop); locations & style
//      samples = landscape (environments + framing references look best
//      in landscape to match the show's primary format).
//
// Per-section defaults follow how a production studio shoots refs:
// neutral-backdrop turnarounds for cast / props are typically squarish,
// environment plates are landscape. Both can be overridden by setting
// series.metadata.delivery_targets explicitly later.
// ──────────────────────────────────────────────────────────────────────────────

import { SIZE_BY_DELIVERY_TARGET } from './provider-capabilities';

export type GptImage2Size = '1024x1024' | '1024x1536' | '1536x1024';
export type BibleSectionForSize = 'character' | 'location' | 'object' | 'style' | 'general_idea' | 'audio';

function snapToGptImage2(width: number, height: number): GptImage2Size {
  if (height <= 0) return '1024x1024';
  const aspect = width / height;
  if (aspect > 1.2) return '1536x1024';   // landscape ~3:2
  if (aspect < 0.83) return '1024x1536';  // portrait ~2:3
  return '1024x1024';                       // square
}

/**
 * Default size for a primary Bible Library reference of the given section,
 * optionally overridden by an explicit series-level delivery target.
 */
export function resolveBibleImageSize(args: {
  section: BibleSectionForSize;
  deliveryTargets?: readonly string[] | null | undefined;
}): GptImage2Size {
  const targets = (args.deliveryTargets ?? []).filter((t): t is string => typeof t === 'string' && t.length > 0);
  if (targets.length > 0) {
    const dims = SIZE_BY_DELIVERY_TARGET[targets[0]];
    if (dims) return snapToGptImage2(dims.width, dims.height);
  }
  switch (args.section) {
    case 'character':
    case 'object':
      return '1024x1024';
    case 'location':
    case 'style':
      return '1536x1024';
    case 'general_idea':
    case 'audio':
      // No image expected, but fall back to square for safety.
      return '1024x1024';
    default:
      return '1024x1024';
  }
}
