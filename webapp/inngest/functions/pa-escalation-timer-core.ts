// ──────────────────────────────────────────────────────────────────────────────
// inngest/functions/pa-escalation-timer-core.ts
//
// Pure decision logic for pa-escalation-timer — split out of the main file
// so it can be unit-tested without pulling Supabase / env imports through.
// Step 2 of the 2026-05-22 Supabase recovery sprint.
// ──────────────────────────────────────────────────────────────────────────────

/** Hard clamps applied even if the upstream forgot — defence in depth. */
export const DEADLINE_MIN_SEC = 30;
export const DEADLINE_MAX_SEC = 3600;

export function clampDeadlineSec(seconds: number): number {
  if (!Number.isFinite(seconds)) return 90;
  return Math.min(
    DEADLINE_MAX_SEC,
    Math.max(DEADLINE_MIN_SEC, Math.round(seconds)),
  );
}

/**
 * Three intents the timer can resolve to after sleep finishes. Mapping to
 * Inngest send / logger calls happens in the orchestration wrapper.
 */
export type EscalationIntent =
  | { intent: 're_check_failed'; reason: string }
  | { intent: 'no_turns_found' }
  | {
      intent: 'state_moved_on';
      latestTurnId: string;
      latestRole: string;
    }
  | { intent: 'escalate' };

interface LatestTurnRow {
  id: string;
  role: string;
  created_at: string;
}

export interface RecheckQueryClient {
  getLatestTurn(threadId: string): Promise<
    | { data: LatestTurnRow | null; error: null }
    | { data: null; error: { message: string } }
  >;
}

export async function decideEscalation(
  threadId: string,
  anchorTurnId: string,
  client: RecheckQueryClient,
): Promise<EscalationIntent> {
  const { data, error } = await client.getLatestTurn(threadId);
  if (error) {
    return { intent: 're_check_failed', reason: error.message };
  }
  if (!data) {
    return { intent: 'no_turns_found' };
  }
  if (data.id !== anchorTurnId) {
    return {
      intent: 'state_moved_on',
      latestTurnId: data.id,
      latestRole: data.role,
    };
  }
  return { intent: 'escalate' };
}
