// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/production-plan.ts
//
// Фаза 2 (docs/AUTONOMY-IMPLEMENTATION-PLAN.md) — the "approved production plan"
// contract + the MECHANICAL-vs-reserved distinction.
//
// The Director approves a `production_plan` once; from then on every per-shot
// stage is MECHANICAL (code auto-advances it on a critic PASS) EXCEPT the
// reserved gates the human keeps (brief · script · canon · pilots · publish ·
// lock · budget · mode). This module is the single source of truth for that
// distinction — the state matrix, the reconciler, and the conductor all read it.
//
// Anti-additivity: the reserved-gate list + resolver previously lived inline in
// state-matrix.ts; centralized here and imported back, so there is ONE list.
// ──────────────────────────────────────────────────────────────────────────────

/** Reserved gates the human/Director keeps even under full autonomy. These are
 *  the "hard limits + creative gates" from CLAUDE.md §6, expressed as plan keys. */
export const DEFAULT_RESERVED_GATES = [
  'brief',
  'script',
  'canon',
  'pilots',
  'publish',
  'lock',
  'budget',
  'mode',
] as const;

export interface ProductionPlan {
  /** shot_ids the Director approved for this episode (the allowlist). A shot NOT
   *  in this list is never auto-advanced by the reconciler. Empty/absent → the
   *  reconciler treats every shot in the matrix spine as in-plan (back-compat). */
  shots?: string[];
  /** Per-stage provider ids the plan pins (informational for the reconciler). */
  providers?: Record<string, string>;
  /** Hard budget ceiling for autonomous spend on this episode. */
  budget_ceiling?: number;
  /** Overrides DEFAULT_RESERVED_GATES when present + non-empty. */
  reserved_gates?: string[];
}

type EpisodeMetaWithPlan = { production_plan?: unknown } | null;

/** Read the approved production plan from episode metadata, if any. */
export function readProductionPlan(episodeMeta: unknown): ProductionPlan | null {
  const meta = (episodeMeta ?? null) as EpisodeMetaWithPlan;
  const pp = meta?.production_plan;
  if (!pp || typeof pp !== 'object') return null;
  return pp as ProductionPlan;
}

/** The reserved-gate list for an episode — plan override or the default. */
export function resolveReservedGates(episodeMeta: unknown): readonly string[] {
  const pp = readProductionPlan(episodeMeta);
  const rg = pp?.reserved_gates;
  if (Array.isArray(rg) && rg.length > 0 && rg.every((g) => typeof g === 'string')) {
    return rg as string[];
  }
  return DEFAULT_RESERVED_GATES;
}

/**
 * The shots the Director still gates when 'pilots' is a reserved gate — the
 * pilot shots (persisted as `episodes.metadata.eref_pilot_shot_ids`). The
 * reconciler must NEVER auto-approve these: the Director eyeballs the pilot
 * images/videos before the rest fans out mechanically. Empty when 'pilots' is
 * not reserved or no pilots were recorded.
 *
 * SAFETY: without this the reconciler would auto-approve pilots, bypassing the
 * Director's visual gate — so reconcileEpisode calls it whenever the caller did
 * not supply an explicit reservedShots set.
 */
export function resolveReservedShots(episodeMeta: unknown): Set<string> {
  const reserved = resolveReservedGates(episodeMeta);
  if (!reserved.includes('pilots')) return new Set<string>();
  const meta = (episodeMeta ?? null) as { eref_pilot_shot_ids?: unknown } | null;
  const ids = meta?.eref_pilot_shot_ids;
  if (!Array.isArray(ids)) return new Set<string>();
  return new Set(ids.filter((v): v is string => typeof v === 'string'));
}

/** Is a given shot inside the approved plan's allowlist? Absent/empty plan
 *  shot-list → every shot is in-plan (back-compat with un-planned episodes). */
export function isShotInPlan(plan: ProductionPlan | null, shotId: string): boolean {
  if (!plan || !Array.isArray(plan.shots) || plan.shots.length === 0) return true;
  return plan.shots.includes(shotId);
}

/**
 * MECHANICS_AUTO_ADVANCE — master flag for the Фаза 2 reconciler's auto-advance.
 * Default OFF: the reconciler is a no-op mutator until an episode opts in, so
 * the manual path is fully preserved (rollback = one env var). On for autonomous
 * episodes only.
 */
export function mechanicsAutoAdvanceEnabled(): boolean {
  const v = process.env.MECHANICS_AUTO_ADVANCE;
  if (!v) return false;
  return v.toLowerCase() === 'true' || v === '1' || v.toLowerCase() === 'on';
}
