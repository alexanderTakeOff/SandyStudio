// ──────────────────────────────────────────────────────────────────────────────
// lib/concierge/approval-check.ts
//
// Detects whether the Director has given verbal approval in the most recent
// thread turns. Phase 1-B `triggerAgent` and `approveAsset` tools call this
// before executing mutating actions — per the Mode 2.5 behavior contract
// in agents/exec/concierge.md §3.4, the agent must never auto-trigger a
// creative gate without explicit Director consent.
//
// 2026-05-11 fix: switched from \b-based regex to token-set matching. JS
// regex `\b` is ASCII-only — it does NOT treat Cyrillic letters as word
// chars, so `\bодобряю\b` never matches "одобряю". Token splitting using
// Unicode-aware punctuation/whitespace handles both alphabets correctly.
// ──────────────────────────────────────────────────────────────────────────────

import type { ConciergeTurnRow } from './types';

/** Single-token approvals — exact match after lower-case + Unicode tokenisation. */
const APPROVAL_TOKENS: ReadonlySet<string> = new Set([
  // Russian
  'да', 'ага', 'угу', 'ок', 'окей',
  'одобряю', 'одобрено',
  'апрув', 'апрувлю', 'апрувлено',
  'поехали', 'пойхали', 'погнали',
  'давай', 'давайте',
  'вперёд', 'вперед',
  'согласен', 'согласна', 'согласно',
  // English
  'approve', 'approved', 'approves',
  'yes', 'yep', 'yeah', 'yup',
  'ok', 'okay',
  'go', 'goahead',
  'sure', 'confirm', 'confirmed', 'proceed',
]);

/** Single-token rejections. Multi-word phrases handled separately below. */
const REJECTION_TOKENS: ReadonlySet<string> = new Set([
  'нет', 'неа', 'нету',
  'стоп', 'стой', 'хватит',
  'отмена', 'отменить',
  'подожди', 'погоди', 'постой',
  'cancel', 'stop', 'no', 'nope', 'wait', 'abort',
  'reject', 'rejected',
  'dont', 'undo',
]);

/** Multi-word rejection phrases checked via lowercase substring. */
const REJECTION_PHRASES: ReadonlyArray<string> = [
  'не надо', 'не делай', 'не запускай', 'не сейчас',
  "don't", 'do not', 'hold on',
];

/**
 * Tokenise a string Unicode-correctly. Splits on any whitespace, punctuation
 * or symbol — works for both Latin and Cyrillic. Returns lowercase tokens
 * without empty entries.
 */
function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s\p{P}\p{S}]+/u)
    .filter((t) => t.length > 0);
}

function isApproval(text: string): boolean {
  const tokens = tokenise(text);
  return tokens.some((t) => APPROVAL_TOKENS.has(t));
}

function isRejection(text: string): boolean {
  const lower = text.toLowerCase();
  for (const phrase of REJECTION_PHRASES) {
    if (lower.includes(phrase)) return true;
  }
  const tokens = tokenise(text);
  return tokens.some((t) => REJECTION_TOKENS.has(t));
}

export interface ApprovalCheck {
  approved: boolean;
  /** Free-text reason returned to the LLM for explaining decisions. */
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

  // Walk backwards through the window — most recent turn first. A rejection
  // in this window invalidates any earlier approval (so "stop" / "не надо"
  // cancels). Otherwise the most recent approval wins, even when later
  // neutral utterances (questions, complaints, frustration) come after it.
  //
  // Earlier versions BROKE on the first neutral director turn — but that
  // caused this failure mode: Director says "одобряю", PA delays answering,
  // Director then asks "где результат?", and the gate refused because the
  // latest utterance was neutral. Director feedback 2026-05-11:
  //   "Я не вижу никакого действия — что нужно от меня?"
  // Fix: scan the full window; neutral turns no longer reset state.
  const start = Math.max(0, turns.length - windowSize);
  let foundApproval: { i: number; text: string } | null = null;
  for (let i = turns.length - 1; i >= start; i--) {
    const turn = turns[i];
    if (turn.role !== 'director') continue;
    const text = turn.content.trim();
    if (!text) continue;

    // Explicit rejection wins immediately — invalidate any earlier approval.
    if (isRejection(text)) {
      return {
        approved: false,
        reason: `Director's recent input ("${truncate(text, 80)}") signals rejection or hesitation. Ask for explicit re-confirmation.`,
        matchedTurnIndex: i,
      };
    }

    if (isApproval(text)) {
      foundApproval = { i, text };
      // Don't return yet — keep scanning to ensure no later (= already-seen,
      // since we're going backwards) rejection cancelled it. With reverse
      // iteration the rejection would have triggered the early return above.
      // So a found approval here is durable.
      break;
    }
  }

  if (foundApproval) {
    return {
      approved: true,
      reason: `Director said: "${truncate(foundApproval.text, 80)}" — counted as verbal approval.`,
      matchedTurnIndex: foundApproval.i,
    };
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
