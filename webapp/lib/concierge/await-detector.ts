// ──────────────────────────────────────────────────────────────────────────────
// lib/concierge/await-detector.ts
// Detects when Polina's assistant turn is implicitly or explicitly waiting on
// Director input. Used by /api/concierge/chat to stamp the persisted turn
// with `metadata.awaiting_director_input`, which surfaces a yellow chip in
// ConciergePanel so Director sees the pending ask without scanning the text.
//
// TD-25 P1+P3 — 2026-05-21
// Background: Director observed Polina silently waiting for events that
// would never auto-fire (e.g. she wrote "жду авто-подхвата" after
// requestRevision, but IMG REQUEST_REVISION has no auto-retry).
// The system-prompt update (OPEN_LOOP_AWARENESS block) teaches her to ask
// in q-format; this detector picks that up. Even when Polina forgets and
// writes a passive "жду" without an explicit question, the detector still
// flags it so Director isn't stranded.
//
// Detection priority:
//   1. Explicit `qN[y/n/letter]: <question>` (or `**qN...**`) → use that.
//   2. Passive "жду / ожидаю / waiting for" without any q-marker →
//      synthesize a generic question. Better a vague chip than silence.
//   3. Nothing → return null (no badge).
// ──────────────────────────────────────────────────────────────────────────────

export interface AwaitingDirectorInput {
  /** Short question text shown on the chip. ≤ 200 chars. */
  question: string;
  /** Optional Y/N or multi-choice options for click-to-answer UX. */
  choices?: ReadonlyArray<{ id: string; label: string }>;
}

/** Match `qN[suffix][/qN[suffix]...]?: <text>` with optional surrounding markdown bold or guillemets. */
const Q_PATTERN = /(?:^|[^a-zA-Z0-9])(\*\*)?(?<marker>q\d+[a-zA-Z]*(?:\/q\d+[a-zA-Z]*)*)\s*[:\-—]\s*(?<text>[^\n«»]+?)(?:\*\*)?(?=[\n.?!»]|$)/g;

// Match Polina's passive "I'm watching / waiting / will react when X happens"
// phrasings as a whole token. Explicit character classes on both sides — `\b`
// in JS regex only recognises ASCII word characters, so it fails on Cyrillic
// (`жду ` would not match `жду\b`). The lookahead+lookbehind via char-class
// avoids the `u`-flag rabbit hole.
//
// Expansion 2026-05-21: Director observed Polina writing "мониторю появление"
// — that's a passive wait too but my v1 regex missed it. Added monitoring /
// observation / "next step is to wait" phrasings in both languages. The list
// is intentionally generous — false-positive yellow chip is cheaper than a
// silent stall.
const PASSIVE_WAIT_PATTERN =
  /(?:^|[\s.\-—«("'`])(жду|ожидаю|мониторю|слежу за|наблюдаю за|следующ(?:ее|ий) (?:действие|шаг)[^.\n]*(?:монитор|следить|подож|ожида)|waiting for|wait for|monitoring|watching for|will (?:wait|react|monitor)|next (?:concrete )?step[^.\n]*(?:wait|monitor|watch))(?=[\s.,!?\-—»)]|$)/i;

/**
 * Inspect Polina's full assistant turn and return an awaiting-input descriptor
 * when she's stalled on Director input. Returns null when the turn looks
 * self-contained (no pending ask).
 *
 * Pure function — no I/O, no logging. Safe to call on every persist.
 */
export function detectAwaitingDirectorInput(
  content: string,
): AwaitingDirectorInput | null {
  if (!content || content.trim().length === 0) return null;

  // ── 1. Explicit q-format question(s) ──────────────────────────────────────
  // Take the LAST match — that's typically the active ask Polina ended with.
  const matches = [...content.matchAll(Q_PATTERN)];
  if (matches.length > 0) {
    const last = matches[matches.length - 1];
    const marker = last.groups?.marker ?? '';
    const text = (last.groups?.text ?? '').trim();
    if (text.length > 0) {
      const question = truncate(text, 200);
      const choices = choicesFromMarker(marker);
      return choices ? { question, choices } : { question };
    }
  }

  // ── 2. Passive "жду / waiting for" with no q-format ───────────────────────
  // Polina forgot the prompt rule. Still flag so Director isn't stranded.
  if (PASSIVE_WAIT_PATTERN.test(content)) {
    const snippet = extractWaitSnippet(content);
    return {
      question: snippet
        ? `жду — ${truncate(snippet, 160)}`
        : 'Полина ждёт сигнала, но не уточнила какого. Подтверди следующий шаг.',
    };
  }

  return null;
}

/**
 * Y/N marker like `q1y/q1n` → two-choice. Letter marker like `q1a/q1b/q1c`
 * → multi-choice with the labelled letters. Bare `q1` → no choices.
 */
function choicesFromMarker(marker: string): AwaitingDirectorInput['choices'] | null {
  const tokens = marker.split('/').map((t) => t.trim());
  // q<N>y/q<N>n → yes/no
  const yn =
    tokens.length === 2 &&
    /^q\d+y$/i.test(tokens[0]) &&
    /^q\d+n$/i.test(tokens[1]);
  if (yn) {
    return [
      { id: tokens[0].toLowerCase(), label: 'Да' },
      { id: tokens[1].toLowerCase(), label: 'Нет' },
    ];
  }
  // q<N>a/q<N>b/q<N>c[/q<N>d] → multi
  const allLetters = tokens.every((t) => /^q\d+[a-z]$/i.test(t));
  if (allLetters && tokens.length >= 2 && tokens.length <= 4) {
    return tokens.map((t) => ({
      id: t.toLowerCase(),
      label: t.toLowerCase().slice(-1).toUpperCase(),
    }));
  }
  return null;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trimEnd()}…`;
}

/** Pull the sentence around "жду" so the chip has some context. */
function extractWaitSnippet(content: string): string | null {
  const lines = content.split(/\n+/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (PASSIVE_WAIT_PATTERN.test(line)) {
      // Strip markdown bullets / bold / blockquote.
      return line.replace(/^[\s>*\-•]+/, '').replace(/\*\*/g, '').trim();
    }
  }
  return null;
}
