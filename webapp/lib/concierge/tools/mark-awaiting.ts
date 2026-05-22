// ──────────────────────────────────────────────────────────────────────────────
// lib/concierge/tools/mark-awaiting.ts
//
// TD-25 P4 (2026-05-22): structured replacement for the regex-based
// `await-detector.ts`. When Polina genuinely needs Director input, she calls
// `markAwaitingDirector({ question, choices?, deadline_sec? })` explicitly.
// The route attaches the resulting metadataPatch to the persisted assistant
// turn — same shape the yellow chip in ConciergePanel already reads.
//
// Why a tool, not a regex:
//   - The regex over-fires on any passive "жду / ожидаю / мониторю" phrasing,
//     stamping awaiting=true on turns that were just narration. That false-
//     positive fueled the watchdog→exec-pa-react→new-turn loop that burned
//     14 GB of Supabase egress on 2026-05-22.
//   - A tool is intentional: only fires when Polina explicitly decides she's
//     blocked. No false positives possible.
//   - Carries `deadline_sec` so the downstream `pa-escalation-timer` (Step 2
//     of this sprint) knows when to escalate — replacing fixed 90s cooldown.
//
// The regex detector (`await-detector.ts`) stays for one more sprint as a
// fallback for cases where Polina forgets the tool. It logs a deprecation
// warning when it fires so we can monitor adoption.
// ──────────────────────────────────────────────────────────────────────────────

import { fail, okWithPatch, type Tool, type ToolResult } from './types';

interface MarkAwaitingArgs {
  question: string;
  choices?: ReadonlyArray<{ id: string; label: string }>;
  deadline_sec?: number;
}

const QUESTION_MAX_LEN = 200;
const DEADLINE_DEFAULT_SEC = 90;
const DEADLINE_MIN_SEC = 30;
const DEADLINE_MAX_SEC = 3600;
const CHOICES_MAX = 4;

export const markAwaitingDirector: Tool<MarkAwaitingArgs> = {
  name: 'markAwaitingDirector',
  description:
    'Declare that this turn ends in a pending question for the Director. ' +
    'Surfaces a yellow chip in the chat panel with the question text and any choices. ' +
    'Call this INSTEAD of writing passive "жду / waiting" prose — gives Director a one-glance ' +
    'view of what you are blocked on, and sets a deadline after which the escalation timer ' +
    'will ping if Director has not replied. Use sparingly — only on genuine blocking decisions, ' +
    'not on every narration of pipeline state.',
  mutating: false, // does not change studio state; only annotates the turn metadata
  schema: {
    type: 'function',
    function: {
      name: 'markAwaitingDirector',
      description:
        'Mark this assistant turn as awaiting Director input, with optional choices and a deadline.',
      parameters: {
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description:
              'Short question text (≤200 chars). Surfaced verbatim in the yellow chip and used by the escalation timer when it pings Director after the deadline.',
          },
          choices: {
            type: 'array',
            description:
              'Optional click-to-answer options. 2-4 entries, each with stable id (e.g. "q5y","q5n","q5a") and short label.',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                label: { type: 'string' },
              },
              required: ['id', 'label'],
              additionalProperties: false,
            },
          },
          deadline_sec: {
            type: 'number',
            description:
              'Seconds after which the escalation timer should ping Director if no reply. Default 90. Clamped to [30, 3600].',
          },
        },
        required: ['question'],
        additionalProperties: false,
      },
    },
  },
  parse(raw) {
    const obj = safeParseJson(raw);
    const question =
      typeof obj.question === 'string' ? obj.question.trim() : '';
    if (question.length === 0) {
      throw new Error('markAwaitingDirector: question is required and non-empty');
    }
    if (question.length > QUESTION_MAX_LEN) {
      throw new Error(
        `markAwaitingDirector: question exceeds ${QUESTION_MAX_LEN} chars (got ${question.length})`,
      );
    }
    const choices = parseChoices(obj.choices);
    const deadlineRaw =
      typeof obj.deadline_sec === 'number' && Number.isFinite(obj.deadline_sec)
        ? obj.deadline_sec
        : DEADLINE_DEFAULT_SEC;
    const deadline_sec = clamp(
      Math.round(deadlineRaw),
      DEADLINE_MIN_SEC,
      DEADLINE_MAX_SEC,
    );
    return { question, choices, deadline_sec };
  },
  async execute(args): Promise<ToolResult> {
    const { question, choices, deadline_sec } = args;
    if (!question || question.trim().length === 0) {
      // parse() already guards this — belt-and-braces for direct execute() calls in tests.
      return fail('question is required', 'invalid_args');
    }
    // The patch shape is identical to what `detect-await` used to produce so
    // the existing yellow-chip reader in ConciergePanel works unchanged.
    const awaitingPayload: Record<string, unknown> = {
      question,
      ...(choices && choices.length > 0 ? { choices } : {}),
      deadline_sec,
      // Provenance so we can later distinguish tool-marked vs regex-detected
      // turns in the DB when measuring adoption.
      source: 'markAwaitingDirector',
      marked_at: new Date().toISOString(),
    };
    return okWithPatch(
      {
        question,
        choices: choices ?? null,
        deadline_sec,
      },
      { awaiting_director_input: awaitingPayload },
      `Marked turn as awaiting Director — ${truncate(question, 80)} (${deadline_sec}s deadline)`,
    );
  },
};

// ── helpers ──────────────────────────────────────────────────────────────────

function safeParseJson(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function parseChoices(
  raw: unknown,
): ReadonlyArray<{ id: string; label: string }> | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: Array<{ id: string; label: string }> = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as { id?: unknown; label?: unknown };
    if (typeof e.id !== 'string' || typeof e.label !== 'string') continue;
    const id = e.id.trim();
    const label = e.label.trim();
    if (!id || !label) continue;
    out.push({ id, label });
    if (out.length >= CHOICES_MAX) break;
  }
  return out.length > 0 ? out : undefined;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trimEnd()}…`;
}
