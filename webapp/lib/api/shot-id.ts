// ──────────────────────────────────────────────────────────────────────────────
// lib/api/shot-id.ts
// Single source of truth for SandyStudio shot identity.
//
// Refactor 2026-06-26 (Director q2). A shot's identity is series · episode · shot
// — `S{season}-E{episode}-SH{number}`, e.g. `S15-E12-SH07`. NO studio prefix, NO
// act, NO scene. Act/scene are POSITION (they drift on board re-version / agent
// re-number / human templating) → derived display metadata, never identity.
//
// Keeping the format in ONE module is the cure for the disease that caused the
// bug class (SH10, SH12/13/14, E11 "18/20 not found"): the format used to be
// re-derived in ~5 places, and each new place rebuilt the unstable compound from
// the drifting scene. With identity defined once, fabricating a scene is
// impossible by construction — it is not in the id.
// ──────────────────────────────────────────────────────────────────────────────

/** Canonical shot id shape: `S{season}-E{episode}-SH{number}`. */
export const SHOT_ID_RE = /^S\d+-E\d+-SH\d+$/i;

/**
 * Episode code without the studio prefix: `"SS-S15-E12"` → `"S15-E12"`.
 * Identity drops `SS` (q2); asset filenames keep it (q7) — the two are
 * intentionally decoupled, so a shot_id is NOT `${episode_code}`-prefixed.
 * Idempotent on an already-short code.
 */
export function episodeShort(episodeCode: string | null | undefined): string {
  return (episodeCode ?? '').replace(/^SS-/i, '');
}

/**
 * Build the canonical shot id for a 1-based episode position. The number is
 * assigned by POSITION in code, never by a model — the heart of the refactor.
 */
export function canonicalShotId(episodeCode: string, position: number): string {
  return `${episodeShort(episodeCode)}-SH${String(position).padStart(2, '0')}`;
}

/**
 * Resolve a human- or tool-supplied shot reference to the canonical id within
 * the active episode (q6 — "in-episode, the button number is enough"):
 *
 *   "7" | "SH7" | "sh07"   → `${episodeShort}-SH07`
 *   "S15-E12-SH07"         → unchanged (already canonical, case-normalised)
 *   legacy / unknown shape → unchanged (a frozen legacy episode still resolves
 *                            to its stored compound id; a genuinely wrong id
 *                            still fails loud at the downstream lookup)
 *
 * Pure function. The single dispatch door (trigger route) applies this once so
 * the canonical id flows everywhere downstream.
 */
export function resolveShotId(
  input: string,
  episodeCode: string | null | undefined,
): string {
  if (typeof input !== 'string') return input;
  const s = input.trim();
  if (SHOT_ID_RE.test(s)) return s.toUpperCase();
  const m = s.match(/^(?:SH)?0*(\d+)$/i);
  if (m && episodeCode) {
    return `${episodeShort(episodeCode)}-SH${m[1].padStart(2, '0')}`;
  }
  return s;
}
