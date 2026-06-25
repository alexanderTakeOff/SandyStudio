// ──────────────────────────────────────────────────────────────────────────────
// lib/concierge/auto-react-loop.ts
// goal-loop slice 1 (2026-06-23): make Polina's tool loop behave like a real
// agent loop instead of stopping after 3/5 rounds and "announcing + waiting".
//
// The round cap is a runaway BACKSTOP, not a work limit: a normal multi-step
// task (read → act → verify → report) finishes in ONE wake because the model
// itself returns no tool calls when done. The cap only catches a stuck model.
//
// Polina's LLM rounds are now cost-tracked (lib/concierge/cost.ts, 2026-06-25)
// and a rolling circuit-breaker disarms auto-react over a daily cap — but a tight
// per-wake round cap + SPIN guard are still the first line of defence against a
// stuck/looping model burning Opus tokens. The guard also addresses the
// Director's "несколько почти одинаковых генераций подряд": a repeated MUTATING
// call is a duplicate generation = wasted spend, stopped BEFORE it fires.
// ──────────────────────────────────────────────────────────────────────────────

/** Per-wake runaway backstop for both concierge tool loops. A real task ends far
 *  sooner (model returns 0 tool calls); this only catches a stuck/looping model.
 *  2026-06-25: tightened 25→6 (env CONCIERGE_AUTO_REACT_BACKSTOP) — the SPIN guard
 *  already stops earlier on duplicate/no-progress, and a lower cap fails
 *  safe-and-visible (the cut-off escalates to Director). */
export const AUTO_REACT_ROUND_BACKSTOP = Math.max(
  2,
  Number(process.env.CONCIERGE_AUTO_REACT_BACKSTOP) || 6,
);

/** Consecutive rounds that introduce NO new tool-call signature before we declare
 *  a stall and stop the loop. */
export const MAX_NOPROGRESS_ROUNDS = 3;

/**
 * Canonical signature of a tool call: `name` + key-sorted args. Two calls with
 * the same name and semantically-equal arguments share a signature regardless of
 * key order or whitespace, so a repeat is detected even if the model reformats.
 */
export function toolCallSignature(
  name: string,
  argsJson: string | null | undefined,
): string {
  let canon: string;
  try {
    canon = stableStringify(JSON.parse(argsJson ?? '{}'));
  } catch {
    canon = (argsJson ?? '').trim();
  }
  return `${name}:${canon}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`;
}

/** One tool call as seen by the guard. `mutating` = not a read-only/analysis tool
 *  (a repeated mutating call is a duplicate generation, stopped immediately). */
export interface RoundCall {
  name: string;
  argsJson: string | null | undefined;
  mutating: boolean;
}

export type SpinVerdict = { stop: false } | { stop: true; reason: string };

/**
 * Decide whether the loop must stop on SPIN, given the running set of seen
 * signatures and a no-progress counter (both mutated in place so the caller can
 * thread state across rounds). Pure aside from those handed-in containers.
 *
 *   - a MUTATING call whose signature was already seen → stop NOW (duplicate
 *     generation = wasted spend); the caller breaks before executing it;
 *   - a round whose calls are ALL already seen makes no forward progress; after
 *     MAX_NOPROGRESS_ROUNDS such rounds in a row → stop.
 *
 * Returns `{stop:false}` for a healthy round (and records its signatures).
 */
export function evaluateRound(
  calls: readonly RoundCall[],
  seen: Set<string>,
  state: { noProgress: number },
): SpinVerdict {
  const sigs = calls.map((c) => toolCallSignature(c.name, c.argsJson));
  for (let i = 0; i < calls.length; i++) {
    if (calls[i].mutating && seen.has(sigs[i])) {
      return { stop: true, reason: `duplicate mutating call ${calls[i].name}` };
    }
  }
  const progressed = sigs.some((s) => !seen.has(s));
  for (const s of sigs) seen.add(s);
  if (progressed) {
    state.noProgress = 0;
    return { stop: false };
  }
  state.noProgress += 1;
  if (state.noProgress >= MAX_NOPROGRESS_ROUNDS) {
    return {
      stop: true,
      reason: `no new action across ${MAX_NOPROGRESS_ROUNDS} rounds`,
    };
  }
  return { stop: false };
}
