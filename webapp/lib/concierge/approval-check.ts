// ──────────────────────────────────────────────────────────────────────────────
// lib/concierge/approval-check.ts
//
// Detects whether the Director has given verbal approval in the most recent
// thread turns. Phase 1-B `triggerAgent` and `approveAsset` tools call this
// before executing mutating actions — per the Mode 2.5 behavior contract
// in agents/exec/concierge.md §3.4, the agent must never auto-trigger a
// creative gate without explicit Director consent.
// ──────────────────────────────────────────────────────────────────────────────

import type { ConciergeTurnRow } from './types';

/**
 * Phrases that count as approval. Tuned for RU + EN with common variations.
 * Pattern is intentionally loose: Director rarely types "yes." — they say
 * "да", "одобряю", "поехали", "go", "давай делай", etc.
 *
 * The check applies to the LAST director turn before the tool call. This
 * prevents stale approval from a past gate carrying over to a fresh one.
 */
const APPROVAL_PATTERN =
  /\b(да|ага|угу|ок|окей|одобряю|апрув(л(ю|еено)?)?|по[ей]хали|давай|вперёд|вперед|approve[d]?|yes|yep|yeah|ok(ay)?|go|let'?s\s+go|sure|confirmed?|proceed)\b/i;

/**
 * Phrases that explicitly REJECT — used to invalidate a still-fresh approval
 * if Director changed their mind mid-conversation.
 */
const REJECTION_PATTERN =
  /\b(нет|стоп|отмена|не\s+надо|подожди|cancel|stop|no|wait|abort|reject(ed)?|don'?t|undo)\b/i;

export interface ApprovalCheck {
  approved: boolean;
  /**
   * Free-text reason for either decision. Returned verbatim to the LLM so
   * it can explain to the Director why a tool was refused.
   */
  reason: string;
  /** Index in `turns` of the matched director utterance (for audit). */
  matchedTurnIndex?: number;
}

/**
 * Scan the most recent `windowSize` turns (default 4) for an approval
 * statement from the Director. Returns `approved=false` with a
 * human-readable reason when consent is missing or has been revoked.
 *
 * @param turns oldest-first turn history
 */
export function checkVerbalApproval(
  turns: ConciergeTurnRow[],
  windowSize = 4,
): ApprovalCheck {
  if (turns.length === 0) {
    return {
      approved: false,
      reason:
        'No conversation history yet. Ask the Director to confirm before triggering this action.',
    };
  }

  // Walk backwards through the window — most recent turn first.
  const start = Math.max(0, turns.length - windowSize);
  for (let i = turns.length - 1; i >= start; i--) {
    const turn = turns[i];
    if (turn.role !== 'director') continue;
    const text = turn.content.trim();
    if (!text) continue;

    // Explicit rejection wins immediately — invalidate any earlier approval.
    if (REJECTION_PATTERN.test(text)) {
      return {
        approved: false,
        reason: `Director's most recent input ("${truncate(text, 80)}") signals rejection or hesitation. Ask for explicit re-confirmation.`,
        matchedTurnIndex: i,
      };
    }

    if (APPROVAL_PATTERN.test(text)) {
      return {
        approved: true,
        reason: `Director said: "${truncate(text, 80)}" — counted as verbal approval.`,
        matchedTurnIndex: i,
      };
    }

    // The last director utterance is neither approval nor rejection — stop
    // scanning. Don't carry over an older approval through a topic change.
    break;
  }

  return {
    approved: false,
    reason:
      'No verbal approval found in the last few turns. Ask the Director "Можно запускать? / Should I proceed?" and wait for "да" / "yes" / "одобряю" before retrying.',
  };
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}
