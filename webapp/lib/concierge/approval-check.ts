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

import type { ConciergeMode, ConciergeTurnRow } from './types';

// ──────────────────────────────────────────────────────────────────────────────
// q9 (2026-06-09): mode-aware "bold" gate for the Prod Assistant.
//
// Mode '3' (DELEGATED) is the BOLD mode: EXEC-DIR-AI / the pipeline may fire
// NON-hard-limit mutating tools WITHOUT a fresh per-action Director token
// (CLAUDE.md §6 + governance.ts Category-B auto-fire). Modes '1' (MANUAL) and
// '2'/'2.5' stay strict — they continue to require verbal approval, unchanged.
//
// HARD LIMITS are Director-only in EVERY mode (CLAUDE.md §6: Publish · LOCKED ·
// Budget · Mode change). They are NEVER auto-allowed by mode. We classify them
// by the concierge tool NAME so the single chokepoint below can keep them gated:
//   - triggerAgent → only a hard limit when it would PUBLISH (agentCode
//     EXEC-PUB). Other agent runs are Category-B creative gates.
//   - proposeSkill / updateSkill / approveSkill → durable skill canon writes
//     (LOCK-class). Conservative: always Director-gated.
// When unsure whether a tool is a hard limit, prefer treating it as one.
// ──────────────────────────────────────────────────────────────────────────────

/** Modes in which non-hard-limit mutations may auto-fire without a fresh token. */
const BOLD_MODES: ReadonlySet<ConciergeMode> = new Set(['3']);

/**
 * Concierge mutating tools that are ALWAYS Director-only (hard limits), even in
 * bold modes. Skill-canon writes are LOCK-class. `triggerAgent` is handled
 * separately because it is only a hard limit for the EXEC-PUB (publish) agent.
 */
const HARD_LIMIT_TOOLS: ReadonlySet<string> = new Set([
  'proposeSkill',
  'updateSkill',
  'approveSkill',
]);

/** EXEC agent codes that constitute a hard limit when dispatched. */
const HARD_LIMIT_AGENT_CODES: ReadonlySet<string> = new Set(['EXEC-PUB']);

/**
 * Is this concierge tool invocation a hard limit (Director-only in all modes)?
 *
 * `args` is the parsed tool args — inspected only for `triggerAgent` to detect
 * a publish dispatch (agentCode EXEC-PUB). All other tools classify purely by
 * name.
 */
export function isHardLimitTool(
  toolName: string,
  args?: Record<string, unknown> | null,
): boolean {
  if (HARD_LIMIT_TOOLS.has(toolName)) return true;
  if (toolName === 'triggerAgent') {
    const code = args && typeof args.agentCode === 'string' ? args.agentCode : '';
    return HARD_LIMIT_AGENT_CODES.has(code);
  }
  return false;
}

/**
 * Single chokepoint for the per-action mutating-tool gate. Replaces the
 * duplicated `checkVerbalApproval(ctx.recentTurns ?? [])` idiom that lived in
 * ~20 tool execute() bodies, making it mode-aware in one place.
 *
 *   - Hard-limit tools → ALWAYS require verbal approval (every mode).
 *   - Bold mode ('3' DELEGATED), non-hard-limit → auto-pass.
 *   - Strict modes ('1' / '2' / '2.5') → require verbal approval (unchanged).
 *
 * The cost backstop (assertBudgetAvailable, migration 0037) still applies
 * downstream — bold mode does NOT bypass the budget ceiling.
 */
export function gateMutation(
  toolName: string,
  opts: {
    mode: ConciergeMode;
    turns: ConciergeTurnRow[];
    args?: Record<string, unknown> | null;
  },
): ApprovalCheck {
  const hardLimit = isHardLimitTool(toolName, opts.args);
  if (!hardLimit && BOLD_MODES.has(opts.mode)) {
    return {
      approved: true,
      reason: `Mode ${opts.mode} (bold) — non-hard-limit tool "${toolName}" auto-allowed without a fresh Director token (CLAUDE.md §6).`,
    };
  }
  // Strict mode, or a hard-limit tool in any mode → verbal-approval gate.
  // q3 (2026-06-12): hard limits accept the HUMAN Director only — an
  // authorized-principal system turn (Тео via EXEC_DIR_AI_TOKEN) may approve
  // Category-B actions but never Publish / LOCK / Budget / Mode (CLAUDE.md §6).
  const check = checkVerbalApproval(opts.turns, 4, { directorOnly: hardLimit });
  if (!check.approved && hardLimit) {
    return {
      ...check,
      reason: `"${toolName}" is a HARD LIMIT (Publish / LOCK / Budget / Mode per CLAUDE.md §6) — Director must confirm in every mode. ${check.reason}`,
    };
  }
  return check;
}

/**
 * E13 (2026-07-01): concierge tools that ARE the human creative approval gates —
 * they flip a REVIEW asset to APPROVED and thereby fire the next pipeline stage
 * (computeNextEvents). They stay Director-only even under an authorized-principal
 * operational nudge, so the ~9 creative gates survive when Тео drives Polina in
 * a strict mode. (requestRevision is intentionally excluded: sending an asset
 * back for rework loops the gate, it does not pass it.)
 */
export const CREATIVE_APPROVAL_TOOL_NAMES: ReadonlySet<string> = new Set([
  'approveAsset',
]);

/** Result of the auto-react mutating-tool gate: run, or a surfaced block code. */
export type AutoReactMutationDecision =
  | { permitted: true }
  | {
      permitted: false;
      code: 'auto_react_hard_limit_blocked' | 'auto_react_mutating_blocked';
      reason: string;
    };

/**
 * E13: the mutating-tool gate for the auto-react / nudge path (chat-internal).
 * Pure + mode-aware, mirroring {@link gateMutation} so it is unit-testable:
 *   - hard limits → never auto-runnable, any mode;
 *   - bold mode ('3') → mutations run (the tool's own gateMutation auto-passes);
 *   - authorized-principal nudge in a STRICT mode → OPERATIONAL mutations run,
 *     but creative gate approvals ({@link CREATIVE_APPROVAL_TOOL_NAMES}) stay
 *     Director-only;
 *   - otherwise (strict + unauthorized) → blocked (propose-don't-act).
 * The cost ceiling still backstops spend downstream — this gate is authz, not budget.
 */
export function decideAutoReactMutation(opts: {
  toolName: string;
  mode: ConciergeMode;
  authorizedOperational?: boolean;
  args?: Record<string, unknown> | null;
}): AutoReactMutationDecision {
  const { toolName, mode, args } = opts;
  if (isHardLimitTool(toolName, args)) {
    return {
      permitted: false,
      code: 'auto_react_hard_limit_blocked',
      reason: `tool "${toolName}" is a HARD LIMIT (Publish / LOCK / Budget / Mode per CLAUDE.md §6) — Director-only in every mode. Recommend it in your text response instead.`,
    };
  }
  const bold = BOLD_MODES.has(mode);
  const authorizedOp = opts.authorizedOperational === true;
  const isCreativeApproval = CREATIVE_APPROVAL_TOOL_NAMES.has(toolName);
  if (bold || (authorizedOp && !isCreativeApproval)) {
    return { permitted: true };
  }
  return {
    permitted: false,
    code: 'auto_react_mutating_blocked',
    reason:
      authorizedOp && isCreativeApproval
        ? `tool "${toolName}" is a CREATIVE GATE APPROVAL — Director-only even under an authorized nudge. Tell the Director the asset is ready and let them approve it.`
        : `tool "${toolName}" is MUTATING — blocked in auto-react context for Mode ${mode}. Suggest the action in your text response so Director can invoke it on the next turn.`,
  };
}

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

/**
 * Returns the LAST character position where any approval token appears in
 * `text`, or -1 if none. Used to resolve position-based winner when one
 * Director turn contains BOTH approval and rejection tokens (e.g. "мы это
 * не решили, но одобряю N" — rejection mid-sentence, approval near the end).
 */
function approvalPosition(text: string): number {
  const lower = text.toLowerCase();
  let last = -1;
  for (const token of APPROVAL_TOKENS) {
    // Word-boundary using Unicode-aware lookaround. Find last occurrence.
    const re = new RegExp(`(?:^|[\\s\\p{P}\\p{S}])${token}(?=$|[\\s\\p{P}\\p{S}])`, 'gu');
    let m: RegExpExecArray | null;
    while ((m = re.exec(lower)) !== null) {
      if (m.index > last) last = m.index;
    }
  }
  // Director's documented numbered-answer format (director-communication.md):
  // `q<N>y` = yes. Catches "q19y" and "q19 Y". Token-set matching can't see
  // this — tokenisation splits "q19 Y" into ["q19","y"] and whitelisting a
  // bare "y" globally is too false-positive-prone. Multi-choice answers
  // (`q<N>a/b/c/d`) are intentionally NOT treated as approval — they pick an
  // option, and only the PA knows whether the chosen option implies a mutation.
  for (const m of lower.matchAll(/(?:^|[\s\p{P}\p{S}])q\d+\s*y(?=$|[\s\p{P}\p{S}])/gu)) {
    if (m.index !== undefined && m.index > last) last = m.index;
  }
  return last;
}

/**
 * Returns the LAST character position where any rejection token / phrase
 * appears in `text`, or -1 if none.
 */
function rejectionPosition(text: string): number {
  const lower = text.toLowerCase();
  let last = -1;
  for (const phrase of REJECTION_PHRASES) {
    let idx = -1;
    let from = 0;
    while ((idx = lower.indexOf(phrase, from)) !== -1) {
      if (idx > last) last = idx;
      from = idx + 1;
    }
  }
  for (const token of REJECTION_TOKENS) {
    const re = new RegExp(`(?:^|[\\s\\p{P}\\p{S}])${token}(?=$|[\\s\\p{P}\\p{S}])`, 'gu');
    let m: RegExpExecArray | null;
    while ((m = re.exec(lower)) !== null) {
      if (m.index > last) last = m.index;
    }
  }
  // Director's documented numbered-answer format: `q<N>n` = no. Catches
  // "q19n" and "q19 N". Mirror of the q-yes match in approvalPosition.
  for (const m of lower.matchAll(/(?:^|[\s\p{P}\p{S}])q\d+\s*n(?=$|[\s\p{P}\p{S}])/gu)) {
    if (m.index !== undefined && m.index > last) last = m.index;
  }
  return last;
}

function isApproval(text: string): boolean {
  return approvalPosition(text) >= 0;
}

function isRejection(text: string): boolean {
  return rejectionPosition(text) >= 0;
}

/**
 * Position-aware verdict for a single director turn. When BOTH tokens
 * appear, the LATER one wins. Returns 'approved' / 'rejected' / 'neutral'.
 * Director directive 2026-05-12: long messages contain mid-sentence "нет"
 * followed by clear "одобряю" at the end — gate must not reject on the
 * earlier token.
 */
function verdictForTurn(text: string): 'approved' | 'rejected' | 'neutral' {
  const a = approvalPosition(text);
  const r = rejectionPosition(text);
  if (a < 0 && r < 0) return 'neutral';
  if (a < 0) return 'rejected';
  if (r < 0) return 'approved';
  return a > r ? 'approved' : 'rejected';
}

export interface ApprovalCheck {
  approved: boolean;
  /** Free-text reason returned to the LLM for explaining decisions. */
  reason: string;
  /** Index in `turns` of the matched director utterance (for audit). */
  matchedTurnIndex?: number;
}

/**
 * Scan the most recent `windowSize` Director turns (default 4) for an
 * approval statement. Intermediate assistant / tool turns DO NOT count
 * toward the window — a compound approval like "одобряю создание и
 * генерацию N локаций" must survive PA's multi-step execution (each tool
 * call adds intermediate turns).
 *
 * Returns `approved=false` with a human-readable reason when consent is
 * missing or has been revoked.
 *
 * @param turns oldest-first turn history (any role)
 */
export function checkVerbalApproval(
  turns: ConciergeTurnRow[],
  windowSize = 4,
  opts?: {
    /**
     * q3 (2026-06-12): when true, ONLY role='director' turns count (hard
     * limits). When false (default), turns from an AUTHORIZED PRINCIPAL also
     * count: role='system' with metadata.authorized_principal === true — set
     * exclusively by /api/team-chat/post when the caller presents
     * EXEC_DIR_AI_TOKEN (the EXEC-DIR-AI role token, CLAUDE.md §4 delegation).
     * The right rides on the ROLE TOKEN, not on the author label — the
     * «Александр» name-masking workaround is retired.
     */
    directorOnly?: boolean;
  },
): ApprovalCheck {
  if (turns.length === 0) {
    return {
      approved: false,
      reason:
        'No conversation history yet. Ask the Director to confirm before triggering this action.',
    };
  }
  const directorOnly = opts?.directorOnly === true;
  const isPrincipalTurn = (turn: ConciergeTurnRow): boolean =>
    turn.role === 'director' ||
    (!directorOnly &&
      turn.role === 'system' &&
      (turn.metadata as { authorized_principal?: unknown } | null)
        ?.authorized_principal === true);

  // Walk backwards through Director turns ONLY — most recent first. A
  // rejection in this window invalidates any earlier approval (so "stop" /
  // "не надо" cancels). Otherwise the most recent approval wins, even when
  // later neutral Director utterances (questions, complaints, frustration)
  // come after it.
  //
  // Window counts DIRECTOR turns, not total turns. PA's intermediate
  // assistant/tool turns between Director's approval and a downstream tool
  // call must not push the approval out of scope. Director feedback
  // 2026-05-12: "Почему повторно давать одобрение Хотя я давал предыдущим
  // сообщении на создание И генерацию". Fix: count only director turns.
  // Earlier versions ALSO broke on the first neutral director turn — that
  // is now also fixed (only rejection cancels; neutral utterances are
  // ignored).
  let directorTurnsSeen = 0;
  let foundApproval: { i: number; text: string } | null = null;
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i];
    if (!isPrincipalTurn(turn)) continue;
    if (directorTurnsSeen >= windowSize) break;
    directorTurnsSeen++;
    const text = turn.content.trim();
    if (!text) continue;

    // Per-turn verdict respects WHERE in the message the tokens appeared.
    // Long Director messages may include mid-sentence "нет" / hesitation
    // followed by clear approval near the end — approval at later position
    // wins.
    const verdict = verdictForTurn(text);
    if (verdict === 'rejected') {
      return {
        approved: false,
        reason: `Director's recent input ("${truncate(text, 80)}") signals rejection or hesitation. Ask for explicit re-confirmation.`,
        matchedTurnIndex: i,
      };
    }
    if (verdict === 'approved') {
      foundApproval = { i, text };
      break;
    }
    // 'neutral' — keep scanning earlier director turns for prior approval
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
      'No verbal approval found in the last few turns. Ask the Director "Можно запускать? / Should I proceed?" and wait for "да" / "yes" / "одобряю" / "q<N>y" before retrying.',
  };
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}
