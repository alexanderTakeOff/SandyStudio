// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/delivery-targets.ts
// The ONE place episode `delivery_targets` are read + resolved. A leaf module (no
// imports from runner.ts / runners) so every agent — screenwriter, storyboarder,
// episode-reference-designer, animator — and runner.ts can share it without the
// circular-import that previously forced four near-identical private copies.
//
// `delivery_targets` is the canonical shorts/format signal: EREF sizes reference
// images from it (SIZE_BY_DELIVERY_TARGET), the Storyboarder + Screenwriter switch
// to vertical-safe / single-punch framing from it (hasVerticalDeliveryTarget, in
// provider-capabilities.ts). Pure — no DB calls.
// ──────────────────────────────────────────────────────────────────────────────

/** Read `metadata.delivery_targets[]` defensively (string entries only), or null
 *  when absent/garbage. Null (not []) so callers can distinguish "no key" from
 *  "empty" when applying precedence. */
export function readDeliveryTargetsFromMetadata(meta: unknown): readonly string[] | null {
  if (!meta || typeof meta !== 'object') return null;
  const raw = (meta as { delivery_targets?: unknown }).delivery_targets;
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v === 'string' && v.length > 0) out.push(v);
  }
  return out;
}

/** Read `episode.metadata.delivery_targets[]` off an episode row, always an array
 *  (never null) for the common "does this episode declare any target" checks. */
export function readEpisodeDeliveryTargets(episode: unknown): string[] {
  if (!episode || typeof episode !== 'object') return [];
  const fromMeta = readDeliveryTargetsFromMetadata((episode as { metadata?: unknown }).metadata);
  return fromMeta ? [...fromMeta] : [];
}

/**
 * Resolve `delivery_targets[]` for an episode. Precedence:
 *   1. episode.metadata.delivery_targets[] (per-episode override)
 *   2. series.metadata.delivery_targets[] (series default, passed by the caller)
 *   3. Fallback: ['youtube_landscape']
 *
 * Pure — no DB calls. Shared by the Inngest wiring, the runners, and unit tests.
 */
export function resolveDeliveryTargets(args: {
  episodeMetadata: unknown;
  seriesDeliveryTargets?: readonly string[] | null;
}): readonly string[] {
  const fromEpisode = readDeliveryTargetsFromMetadata(args.episodeMetadata);
  if (fromEpisode && fromEpisode.length > 0) return fromEpisode;
  if (args.seriesDeliveryTargets && args.seriesDeliveryTargets.length > 0) {
    return args.seriesDeliveryTargets;
  }
  return ['youtube_landscape'];
}
