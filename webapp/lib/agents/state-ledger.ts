// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/state-ledger.ts
// Motor 1 of the WCHK strengthening (Director go 2026-06-11) — deterministic
// state-evolution validator for storyboard shot timelines.
//
// Division of labour (Approach B): an LLM extraction pass turns each shot's
// action_prose + continuity_notes into ShotStateDelta[]; THIS module is the
// judge. It is a PURE function — no I/O, no LLM — so the four known Class-B
// defect families (double-yank cord, resurrected book pile, causeless
// light-on, prop-from-nowhere) are unit-testable as plain fixtures.
//
// Honesty boundary: the ledger judges what the prose says. A defect invisible
// in action_prose is invisible here. Name normalization is the weak link —
// if extraction emits `lamp_cord` in SH03 and `cord` in SH08, the per-entity
// timeline splits and the defect escapes. The extraction prompt instructs
// canonical naming; residual false-negatives are accepted.
//
// Severity policy (Director q2, 2026-06-11 — «it is a comedy cartoon»):
// cartoon logic gets slack. The ledger NEVER produces FAIL on its own;
// REVISE only when MAJOR violations reach LEDGER_REVISE_MAJOR_THRESHOLD;
// below that everything is surfaced as notes and the verdict stays PASS.
// ──────────────────────────────────────────────────────────────────────────────

/** One state-changing (or state-revealing) action inside a shot. */
export interface StateAction {
  /** Canonical entity id ("lamp_cord", "book_pile") — extractor normalizes. */
  entity: string;
  /** Normalized verb ("yank", "collapse", "switch_on"). */
  verb: string;
  /**
   * Who performs the action. A character slug for deliberate actions;
   * EXPLICIT null for autonomous events ("свет включается сам").
   * Undefined = extractor could not tell — judged conservatively (no rule
   * fires on agency alone).
   */
  agent?: string | null;
  /** The beat is staged as a FIRST discovery/encounter of this entity. */
  presented_as_first?: boolean;
  /**
   * Precondition the prose implies the entity is in BEFORE the action
   * ("standing" for a pile being knocked over). Null/undefined = no
   * precondition stated.
   */
  state_before?: string | null;
  /** State the entity is in AFTER the action ("collapsed", "lights_on"). */
  state_after: string;
  /** Narrative cause for autonomous events, when the prose names one. */
  cause?: string | null;
}

/** Extracted state delta of one shot — the unit the extraction pass emits. */
export interface ShotStateDelta {
  shot_id: string;
  /** Ordinal position in the storyboard timeline (0-based). */
  shot_index: number;
  /**
   * Entities visibly established in this shot (establishing inventory,
   * first on-screen appearance). Used by ENTITY_FROM_NOWHERE.
   */
  entities_introduced?: string[];
  actions: StateAction[];
}

export type LedgerRule =
  | 'REPEAT_FIRST_DISCOVERY'
  | 'STATE_REVERT_NO_CAUSE'
  | 'STATE_CHANGE_NO_CAUSE'
  | 'ENTITY_FROM_NOWHERE';

export type LedgerSeverity = 'MAJOR' | 'MINOR';

export interface LedgerViolation {
  rule: LedgerRule;
  entity: string;
  shot_id: string;
  /** Shot where the conflicting earlier state/event lives, when applicable. */
  prior_shot_id?: string;
  severity: LedgerSeverity;
  /** Russian, actionable — flows into the WCHK report verbatim. */
  description: string;
}

/**
 * Comedy-cartoon tolerance (Director q2): a single MAJOR is a note, not a
 * bounce. Only a storyboard with systemic drift gets REVISE.
 */
export const LEDGER_REVISE_MAJOR_THRESHOLD = 3;

/**
 * Verdict impact of the deterministic MAJOR pool (ledger violations +
 * CHK-W05 duration violations + CHK-W02/W07 canon conflicts — the runner
 * sums them into one count). Never FAIL: the deterministic layer may only
 * downgrade PASS → REVISE, and only on systemic drift.
 */
export function reviseImpactForMajorPool(
  majorCount: number,
): 'NONE' | 'REVISE' {
  return majorCount >= LEDGER_REVISE_MAJOR_THRESHOLD ? 'REVISE' : 'NONE';
}

interface EntityHistory {
  /** Every state_after observed, in timeline order. */
  states: { state: string; shot_id: string }[];
  /** Shot of the first action touching this entity. */
  firstActionShotId: string | null;
  introduced: boolean;
}

/**
 * Judge a storyboard timeline of extracted state deltas.
 *
 * Pure and deterministic: same deltas → same violations. Deltas are sorted
 * by shot_index internally, so callers may pass them unordered. At most ONE
 * violation per action (priority: REPEAT_FIRST_DISCOVERY > STATE_REVERT >
 * STATE_CHANGE_NO_CAUSE > ENTITY_FROM_NOWHERE) to avoid double-charging a
 * single prose beat.
 */
export function validateStateLedger(
  deltas: readonly ShotStateDelta[],
): readonly LedgerViolation[] {
  const ordered = [...deltas].sort((a, b) => a.shot_index - b.shot_index);
  const violations: LedgerViolation[] = [];
  const history = new Map<string, EntityHistory>();

  const getHistory = (entity: string): EntityHistory => {
    const existing = history.get(entity);
    if (existing) return existing;
    const fresh: EntityHistory = {
      states: [],
      firstActionShotId: null,
      introduced: false,
    };
    history.set(entity, fresh);
    return fresh;
  };

  for (const delta of ordered) {
    for (const slug of delta.entities_introduced ?? []) {
      getHistory(slug).introduced = true;
    }

    for (const action of delta.actions) {
      const h = getHistory(action.entity);
      const lastState = h.states.length > 0 ? h.states[h.states.length - 1] : null;
      const violation = judgeAction(action, delta.shot_id, h, lastState);
      if (violation) violations.push(violation);

      // Record AFTER judging — the action's own state must not count as its
      // entity's prior history.
      if (h.firstActionShotId === null) h.firstActionShotId = delta.shot_id;
      h.introduced = true; // any on-screen action establishes the entity
      h.states.push({ state: action.state_after, shot_id: delta.shot_id });
    }
  }

  return violations;
}

function judgeAction(
  action: StateAction,
  shotId: string,
  h: EntityHistory,
  lastState: { state: string; shot_id: string } | null,
): LedgerViolation | null {
  // Rule 1 — REPEAT_FIRST_DISCOVERY: «впервые обнаруживает» сущность,
  // которая уже фигурировала раньше (двойной дёрг шнура).
  if (action.presented_as_first && h.firstActionShotId !== null) {
    return {
      rule: 'REPEAT_FIRST_DISCOVERY',
      entity: action.entity,
      shot_id: shotId,
      prior_shot_id: h.firstActionShotId,
      severity: 'MAJOR',
      description:
        `«${action.entity}» подаётся как первое обнаружение в ${shotId}, ` +
        `но уже фигурировал в ${h.firstActionShotId}. Либо это разные объекты ` +
        `(дать им разные имена), либо повторное «открытие» нелогично.`,
    };
  }

  // Rule 2 — STATE_REVERT_NO_CAUSE: прекондиция действия противоречит
  // последнему известному состоянию И совпадает с более ранним состоянием —
  // объект «откатился» без причины (воскресшая стопка книг).
  if (
    action.state_before != null &&
    lastState !== null &&
    action.state_before !== lastState.state
  ) {
    const revertedToEarlier = h.states.some(
      (s) => s.state === action.state_before,
    );
    if (revertedToEarlier) {
      return {
        rule: 'STATE_REVERT_NO_CAUSE',
        entity: action.entity,
        shot_id: shotId,
        prior_shot_id: lastState.shot_id,
        severity: 'MAJOR',
        description:
          `«${action.entity}» в ${shotId} снова в состоянии ` +
          `«${action.state_before}», хотя после ${lastState.shot_id} был ` +
          `«${lastState.state}» — между кадрами нет действия, вернувшего ` +
          `прежнее состояние.`,
      };
    }
    // Jump to a novel precondition we never saw the entity enter — softer:
    // comedy montage often skips transitions, so MINOR note only.
    return {
      rule: 'STATE_CHANGE_NO_CAUSE',
      entity: action.entity,
      shot_id: shotId,
      prior_shot_id: lastState.shot_id,
      severity: 'MINOR',
      description:
        `«${action.entity}» в ${shotId} предполагается в состоянии ` +
        `«${action.state_before}», но последнее показанное состояние — ` +
        `«${lastState.state}» (${lastState.shot_id}); переход не показан.`,
    };
  }

  // Rule 3 — STATE_CHANGE_NO_CAUSE: автономное событие (agent === null)
  // без названной причины (свет включился сам).
  if (action.agent === null && (action.cause == null || action.cause === '')) {
    return {
      rule: 'STATE_CHANGE_NO_CAUSE',
      entity: action.entity,
      shot_id: shotId,
      severity: 'MAJOR',
      description:
        `«${action.entity}» переходит в «${action.state_after}» в ${shotId} ` +
        `само по себе — ни персонаж, ни названная причина не вызывают переход. ` +
        `Дать причину в прозе или привязать к действию персонажа.`,
    };
  }

  // Rule 4 — ENTITY_FROM_NOWHERE: действие с заявленной прекондицией над
  // сущностью, которую никто не вводил (ни establishing, ни ранние действия).
  if (
    action.state_before != null &&
    !h.introduced &&
    h.firstActionShotId === null
  ) {
    return {
      rule: 'ENTITY_FROM_NOWHERE',
      entity: action.entity,
      shot_id: shotId,
      severity: 'MINOR',
      description:
        `«${action.entity}» появляется в ${shotId} с уже существующим ` +
        `состоянием «${action.state_before}», но не был введён ни одним ` +
        `предыдущим кадром. Ввести объект явно (establishing-кадр или проза).`,
    };
  }

  return null;
}
