// ──────────────────────────────────────────────────────────────────────────────
// lib/api/pipeline-mode.ts
// Per-episode pipeline mode (Director S-reorder, 2026-07-01).
//
//   - 'sequential' (DEFAULT): today's flow — all references → animatic (ref-fill,
//     reviewed) → video (gated on an APPROVED animatic) → stitch.
//   - 'parallel': 2 refs → 2 video pilots → Director approves the 2 VIDEO shots →
//     fan out remaining refs→videos; per-reference canon-gating replaces the batch
//     ref-animatic review; video is NOT gated on a pre-approved animatic.
//
// Stored in `episodes.metadata.pipeline_mode` (JSON, no migration) — mirrors the
// proven `anchor_chain_enabled` flag pattern. Read LIVE at each routing decision
// so the toggle is switchable mid-run. Absent/unknown ⇒ 'sequential' ⇒ every
// existing episode and replay-pilot are byte-identical.
// ──────────────────────────────────────────────────────────────────────────────

export type PipelineMode = 'sequential' | 'parallel';

export const DEFAULT_PIPELINE_MODE: PipelineMode = 'sequential';

/** Defensive reader mirroring `readAnchorChainEnabled` — any absent/garbage value
 *  falls back to the sequential default (the safe, existing behaviour). */
export function readPipelineMode(meta: unknown): PipelineMode {
  if (meta && typeof meta === 'object') {
    const v = (meta as Record<string, unknown>).pipeline_mode;
    if (v === 'parallel') return 'parallel';
    if (v === 'sequential') return 'sequential';
  }
  return DEFAULT_PIPELINE_MODE;
}
