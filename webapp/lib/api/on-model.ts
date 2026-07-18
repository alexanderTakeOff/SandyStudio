// ──────────────────────────────────────────────────────────────────────────────
// lib/api/on-model.ts
// On-model gate — per-episode strictness + the pure PASS/FAIL decision.
//
// The rendered reference-image critic (consistency_score) can't reliably SEE
// off-model (E30 calibration: the same purple blob scored 22 on one shot and 100
// on a near-identical one). A separate focused detector (on-model-detector.ts)
// judges two binary axes against the Bible character canon — silhouette + body
// material/transparency — and this module turns those axes into a gate verdict
// under a per-episode strictness dial.
//
// Stored in `episodes.metadata.on_model_strictness` (JSON, no migration) — mirrors
// the proven `pipeline_mode` flag pattern. Absent/unknown ⇒ 'loose' ⇒ the gate is
// OFF and every existing episode + replay-pilot are byte-identical to today.
//
// `decideOnModel` is PURE (no IO) so the whole gate is unit-testable in isolation.
// ──────────────────────────────────────────────────────────────────────────────

export type OnModelStrictness = 'loose' | 'medium' | 'strict';

export const DEFAULT_ON_MODEL_STRICTNESS: OnModelStrictness = 'loose';

/**
 * Raw detector output — one binary axis per canon TYPE present in the shot. Each
 * axis is `boolean | null`; `null` = not applicable (no canon of that type anchored
 * this shot, e.g. a pure-environment frame has no character axes, a flat-field
 * location has no distinct background to match). A `null` axis can never fail.
 */
export interface OnModelRaw {
  /** CHARACTER shape: does the rendered character match the canon silhouette? */
  silhouette_ok: boolean | null;
  /** CHARACTER material: does the body match the canon (e.g. glass vs opaque)? */
  transparency_ok: boolean | null;
  /** LOCATION: does the background/setting match the shot's location canon? */
  location_ok: boolean | null;
  /** STYLE: does the rendering (medium/line/shading) match the style canon? */
  style_ok: boolean | null;
  /** OBJECTS: do the canon props in frame match their object canon? */
  objects_ok: boolean | null;
  /** One-line reason, for audit + the Director's bounce escalation. */
  reason: string;
}

/** Stored on `shot_reference.on_model` — raw axes + frozen gate verdict + provenance. */
export interface OnModelResult extends OnModelRaw {
  /** The gate decision, FROZEN at generation time next to the pixels it judged. */
  verdict: 'PASS' | 'FAIL';
  strictness: OnModelStrictness;
  is_transformation: boolean;
  /** Vision model that produced the raw axes, or a skip marker. */
  model: string;
  /** True when the vision call was skipped (loose gate, or outage fail-open). */
  skipped?: boolean;
  at: string;
}

/** Defensive reader mirroring `readPipelineMode` — any absent/garbage value falls
 *  back to the loose default (gate OFF — the safe, existing behaviour). */
export function readOnModelStrictness(meta: unknown): OnModelStrictness {
  if (meta && typeof meta === 'object') {
    const v = (meta as Record<string, unknown>).on_model_strictness;
    if (v === 'medium') return 'medium';
    if (v === 'strict') return 'strict';
    if (v === 'loose') return 'loose';
  }
  return DEFAULT_ON_MODEL_STRICTNESS;
}

/** Which canon axes each strictness level ENFORCES. loose enforces none. */
const ENFORCED_AXES: Record<OnModelStrictness, ReadonlyArray<keyof OnModelRaw>> = {
  loose: [],
  // medium — "is it the right character, in the right place": silhouette + location.
  // Body-material (transparency), style and props are tolerated.
  medium: ['silhouette_ok', 'location_ok'],
  // strict — every canon axis must match.
  strict: ['silhouette_ok', 'transparency_ok', 'location_ok', 'style_ok', 'objects_ok'],
};

/**
 * PURE gate decision — canon compliance across every axis the strictness level
 * enforces AND the shot actually has a canon for:
 *   - loose  → always PASS (gate off).
 *   - medium → FAIL iff character silhouette OR location is off.
 *   - strict → FAIL iff ANY axis (silhouette, transparency, location, style, objects) is off.
 *
 * An axis that is `null` (no canon of that type in the shot) is skipped — the gate
 * never fails a shot on an axis it has no ground truth for. The transformation
 * exception suppresses ONLY the silhouette term (a legitimate morph is not a
 * silhouette failure); every other axis — including transparency under strict — still
 * enforces.
 */
export function decideOnModel(
  raw: OnModelRaw,
  strictness: OnModelStrictness,
  isTransformation: boolean,
): 'PASS' | 'FAIL' {
  for (const axis of ENFORCED_AXES[strictness]) {
    if (axis === 'silhouette_ok' && isTransformation) continue; // morph exception
    if (raw[axis] === false) return 'FAIL';
  }
  return 'PASS';
}
