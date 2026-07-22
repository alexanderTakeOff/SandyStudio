/**
 * Single source of truth for resolving a browser-loadable preview URL from an
 * asset row. An asset may expose its media via several path fields depending on
 * whether Drive was online at generation time and whether it is a staged local
 * file; previously each surface picked `drive_path` only and silently fell back
 * to a "no preview" message when that field was null/non-HTTP — even though a
 * perfectly valid `staging_path` existed. This util centralises the candidate
 * order so every preview surface behaves identically.
 */

/** Minimal shape needed to resolve a preview src — structurally compatible with AssetRow and drawer asset shapes. */
export interface PreviewSource {
  /** Asset id — enables the stable Drive-backed media route. */
  id?: string | null;
  /** When set with `id`, the asset is Drive-backed and served via /api/media/<id>. */
  drive_file_id?: string | null;
  drive_path?: string | null;
  staging_path?: string | null;
  drive_web_view_url?: string | null;
  /**
   * Cache-bust inputs. Regenerating an image keeps the same asset id + filename,
   * so `/api/media/<id>` is byte-stale in the browser cache (DRAFT files carry
   * max-age=3600). Appending `?t=<freshness>` gives each regen a distinct URL.
   * `image_prompt.current_version` bumps on every (re)generation; `version` is
   * the row-level fallback.
   */
  version?: number | null;
  /** Loosely typed so `AssetRow.metadata` (unknown) stays assignable; narrowed in `previewFreshness`. */
  metadata?: unknown;
}

/**
 * Best available "image changed" signal for cache-busting the media URL.
 *
 * Two things change the pixels under a fixed asset id + filename:
 *   1. (re)generation — bumps `image_prompt.current_version` (row `version` fallback).
 *   2. picking a different attempt variant (`select_attempt`) — copies that
 *      attempt's bytes onto the canonical filename and sets
 *      `shot_reference.selected_version`, but touches NEITHER version field.
 * Folding `selected_version` into the key is what makes the in-drawer preview
 * (and the CandidatesStrip) actually refresh on a variant pick — without it the
 * `/api/media/{id}?t=` URL was byte-identical before/after the click, so the
 * browser (DRAFT media carries max-age=3600) re-served the stale image. The
 * timeline updated only because ITS resolver falls through to the attempt's
 * distinct URL when the route nulls `drive_web_view_url`; the drawer's resolver
 * still returns `/api/media/{id}` because `drive_file_id` stays set. (2026-07-17)
 */
export function previewFreshness(s?: PreviewSource | null): string | number | null {
  if (!s) return null;
  const meta = s.metadata as {
    image_prompt?: { current_version?: number | null } | null;
    shot_reference?: { selected_version?: number | null } | null;
  } | null;
  const ip = meta?.image_prompt;
  const base =
    typeof ip?.current_version === 'number'
      ? ip.current_version
      : typeof s.version === 'number'
        ? s.version
        : null;
  const sel = meta?.shot_reference?.selected_version;
  if (typeof sel === 'number') return base != null ? `${base}-sel${sel}` : `sel${sel}`;
  return base;
}

/**
 * Bump the cache-bust key so an in-place image replacement (same asset id +
 * filename) forces the browser to refetch. `previewFreshness` reads
 * `image_prompt.current_version`; incrementing it changes the `/api/media/<id>?t=`
 * URL. Without this, replacing an image (especially a LOCKED canon, served
 * `immutable` for a year) leaves the drawer showing the stale cached picture —
 * the 2026-07-22 metelka symptom that had to be bumped by hand.
 *
 * Returns a NEW metadata object (immutable — coding-style.md); creates the
 * `image_prompt` node if absent, seeding `current_version` from the row
 * `version` fallback or 0.
 *
 * NOTE: `regenerate-image` and `upload` already compute a fresh `current_version`
 * inline. This helper is for in-place overwrite paths that DON'T bump on their
 * own — `copy-image-from` inherits the SOURCE's `image_prompt` wholesale, so the
 * target's cache-bust key can stay unchanged and the drawer keeps the stale
 * picture. Apply it wherever bytes are replaced under a fixed asset id/filename
 * without a self-managed version bump.
 */
export function bumpPreviewFreshness(
  metadata: unknown,
  rowVersion?: number | null,
): Record<string, unknown> {
  const meta = (metadata && typeof metadata === 'object' ? metadata : {}) as Record<string, unknown>;
  const ip = (meta.image_prompt && typeof meta.image_prompt === 'object'
    ? meta.image_prompt
    : {}) as Record<string, unknown>;
  const curr =
    typeof ip.current_version === 'number'
      ? ip.current_version
      : typeof rowVersion === 'number'
        ? rowVersion
        : 0;
  return {
    ...meta,
    image_prompt: { ...ip, current_version: curr + 1 },
  };
}

/** True when the path is something the browser can load directly (absolute root path or http(s) URL). */
export function isHttpishUrl(path: string | null | undefined): boolean {
  if (!path) return false;
  return path.startsWith('/') || path.startsWith('http://') || path.startsWith('https://');
}

/**
 * The stable, worktree-independent media route for a Drive-backed asset.
 * After the 2026-06-01 media-cache migration this is the ONLY renderable source
 * for generated media — `/staging/*` no longer serves and `drive_web_view_url`
 * is a Drive *viewer page*, not an image. The `/api/media/<id>` route resolves
 * `drive_file_id` server-side, so the browser only needs the asset id. We treat
 * an asset as Drive-backed when EITHER `drive_file_id` or `drive_web_view_url`
 * is set (they are populated together at persist time) — this avoids having to
 * thread `drive_file_id` through every SELECT, since `drive_web_view_url` is
 * already carried everywhere. Returns null for local-only / mock assets.
 */
export function driveBackedMediaUrl(
  a: {
    id?: string | null;
    drive_file_id?: string | null;
    drive_web_view_url?: string | null;
  },
  freshness?: string | number | null,
): string | null {
  if (a.id && (a.drive_file_id || a.drive_web_view_url)) {
    const base = `/api/media/${a.id}`;
    // `?t=` is ignored by the media route (it only reads `?w=`/`?thumb=`) and
    // coexists with `?w=` via withThumbParam — safe cache-bust on the URL only.
    return freshness != null ? `${base}?t=${encodeURIComponent(String(freshness))}` : base;
  }
  return null;
}

/**
 * Resolve the first browser-loadable preview URL for an asset.
 * Candidate order (highest priority first): the asset's own drive_path,
 * staging_path, drive_web_view_url, then an optional prompt-history entry's
 * staging_path and drive_web_view_url.
 */
export function resolvePreviewSrc(
  asset: PreviewSource,
  promptEntry?: PreviewSource | null,
): string | null {
  // Prefer the stable Drive-backed media route when the asset is Drive-backed.
  // It survives worktree deletion and doesn't depend on the local /staging
  // cache or symlinks (the breakage that wiped every preview). Falls through to
  // the legacy local candidates for mock/local-only assets without a Drive id.
  const freshness = previewFreshness(asset) ?? previewFreshness(promptEntry);
  const route =
    driveBackedMediaUrl(asset, freshness) ?? driveBackedMediaUrl(promptEntry ?? {}, freshness);
  if (route) return route;
  const candidates: Array<string | null | undefined> = [
    asset.drive_path,
    asset.staging_path,
    asset.drive_web_view_url,
    promptEntry?.staging_path,
    promptEntry?.drive_web_view_url,
  ];
  return candidates.find(isHttpishUrl) ?? null;
}
