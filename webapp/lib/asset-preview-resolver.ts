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

/** Best available "image changed" signal for cache-busting the media URL. */
export function previewFreshness(s?: PreviewSource | null): number | null {
  if (!s) return null;
  const ip = (s.metadata as { image_prompt?: { current_version?: number | null } | null } | null)
    ?.image_prompt;
  if (typeof ip?.current_version === 'number') return ip.current_version;
  return typeof s.version === 'number' ? s.version : null;
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
