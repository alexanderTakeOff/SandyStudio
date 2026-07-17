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

/** Raw detector output — exactly what the vision runner returns. */
export interface OnModelRaw {
  /** Does the rendered character match the canon character's overall shape? */
  silhouette_ok: boolean;
  /** Does the body material/transparency match the canon (e.g. glass vs opaque)? */
  transparency_ok: boolean;
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

/**
 * PURE gate decision. Composition rule:
 *   - loose  → always PASS (gate off).
 *   - medium → FAIL iff !silhouette_ok. transparency is tolerated (milky bodies ok).
 *   - strict → FAIL iff !silhouette_ok OR !transparency_ok.
 *
 * The transformation exception suppresses ONLY the silhouette term (a legitimate
 * morph/gloop shot is not a silhouette failure), NEVER the transparency term. So a
 * transformation shot under `strict` with `transparency_ok === false` still FAILs.
 */
export function decideOnModel(
  raw: OnModelRaw,
  strictness: OnModelStrictness,
  isTransformation: boolean,
): 'PASS' | 'FAIL' {
  if (strictness === 'loose') return 'PASS';
  const silhouetteFail = !raw.silhouette_ok && !isTransformation;
  const transparencyFail = strictness === 'strict' && !raw.transparency_ok;
  return silhouetteFail || transparencyFail ? 'FAIL' : 'PASS';
}
