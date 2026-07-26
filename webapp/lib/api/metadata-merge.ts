// ──────────────────────────────────────────────────────────────────────────────
// lib/api/metadata-merge.ts
// Shared jsonb-metadata patch helpers for the Director-facing PATCH routes
// (channels / series — multi-channel Phase 4c). One implementation so the two
// routes can't drift on null-deletes-key semantics.
//
// Known pattern debt (backlog_episode_metadata_rmw_race): this is a
// read-modify-write, acceptable here because these are rare Director-UI writes,
// not concurrent agent paths.
// ──────────────────────────────────────────────────────────────────────────────

export function metaObject(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

/**
 * Apply a flat patch onto an object: `null` deletes the key, `undefined` leaves
 * it untouched, anything else replaces it. Returns a NEW object (immutable).
 */
export function applyPatch(
  base: Record<string, unknown>,
  patch: Record<string, unknown | null | undefined>,
): Record<string, unknown> {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (v === null) delete out[k];
    else out[k] = v;
  }
  return out;
}

/** Merge a flat patch into metadata.<section> (null deletes a key). */
export function mergeSectionPatch(
  metadata: unknown,
  section: string,
  patch: Record<string, unknown | null | undefined>,
): Record<string, unknown> {
  const meta = metaObject(metadata);
  return { ...meta, [section]: applyPatch(metaObject(meta[section]), patch) };
}
