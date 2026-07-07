// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/providers/fetch-with-timeout.ts
//
// Single shared fetch wrapper. EVERY provider fetch must go through this so a
// hung upstream socket ABORTS instead of holding an Inngest concurrency slot
// forever. Root cause of the 2026-07-07 E17 firefight: a bare `await fetch(...)`
// with no timeout never returned when the upstream throttled/stalled, the
// Inngest run never settled, and its concurrency slot stayed leased — wedging
// the whole stage (gemini-text hang → critic stage dead 90 min; openai-edits-
// multi hang → artist orphans SH09-12).
//
// On timeout this THROWS `FetchTimeoutError` (a normal Error, NOT
// NonRetriableError) so the runner re-throws → factory.ts re-throws → Inngest
// retries (retries: 2 + backoff). A timeout fires BEFORE any Response exists, so
// it can never collide with response-derived terminal classes (FalBalanceError,
// the billing wall) — those are only reachable from status inspection, which the
// abort short-circuits past.
//
// Template: the original per-call pattern in gemini-text.ts (2026-07-07),
// generalized here so all ~25 provider fetch sites share ONE implementation.
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Per-category fetch timeouts (ms). Each is deliberately SHORTER than the
 * provider's total poll budget (MAX_WAIT_MS) so a single hung poll fetch aborts
 * and the `while (Date.now() < deadline)` loop re-checks its wall-clock deadline
 * (fixes the "Idiom-A defeat" where one stuck poll bypasses the total budget),
 * yet LONGER than a healthy call/poll so a slow-but-alive request is never
 * false-aborted.
 */
export const FETCH_TIMEOUTS = {
  /** gemini-text generateContent (matches the original inline value). */
  LLM_TEXT_MS: 120_000,
  /** openai images/edits, gemini-flash-image — single blocking POST (~10-40s). */
  IMAGE_API_MS: 90_000,
  /** fal/veo queue enqueue POST — returns a request_id in ~1s. */
  QUEUE_SUBMIT_MS: 60_000,
  /** one status GET inside a poll loop — > poll intervals (3-5s), << MAX_WAIT (4-12 min). */
  POLL_MS: 30_000,
  /** video mp4 / 4K png byte downloads — the largest payloads. */
  BINARY_DOWNLOAD_MS: 120_000,
  /** Google OAuth token refresh — tiny/fast. */
  AUTH_MS: 15_000,
  /** drive.ts authedFetch chokepoint — uploads can be large. */
  DRIVE_MS: 120_000,
} as const;

/**
 * Thrown when a provider fetch exceeds its timeout. A plain Error subclass so
 * Inngest treats it as retryable (unlike NonRetriableError). Carries the url +
 * timeout for observability and the underlying DOMException as `cause`.
 */
export class FetchTimeoutError extends Error {
  readonly url: string;
  readonly timeoutMs: number;
  constructor(url: string, timeoutMs: number, cause?: unknown) {
    super(`fetch timed out after ${timeoutMs}ms: ${url} (transient)`);
    this.name = 'FetchTimeoutError';
    this.url = url;
    this.timeoutMs = timeoutMs;
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

/**
 * `fetch` with a hard per-request timeout. Drop-in replacement for a bare
 * `fetch(url, init)` — just pass a timeout from `FETCH_TIMEOUTS`. Composes with a
 * caller-supplied `init.signal` if present (no call site passes one today, but we
 * keep it correct for future callers).
 *
 * @throws {FetchTimeoutError} when the request exceeds `timeoutMs`.
 * @throws the original error for genuine network failures / caller-initiated
 *   aborts (passed through unchanged so each provider's own catch is unaffected).
 */
export async function fetchWithTimeout(
  url: string | URL,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = init.signal
    ? typeof AbortSignal.any === 'function'
      ? AbortSignal.any([init.signal, timeoutSignal])
      : composeSignals(init.signal, timeoutSignal)
    : timeoutSignal;
  try {
    return await fetch(url, { ...init, signal });
  } catch (err) {
    // AbortSignal.timeout fires a DOMException named 'TimeoutError' (NOT
    // 'AbortError'). Only that becomes FetchTimeoutError; genuine network errors
    // and caller-initiated aborts pass through unchanged.
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new FetchTimeoutError(String(url), timeoutMs, err);
    }
    throw err;
  }
}

/** Fallback for runtimes lacking `AbortSignal.any` (< Node 20.3). Dead code today
 *  since no call site passes `init.signal`, but keeps the compose branch safe. */
function composeSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  const ctrl = new AbortController();
  const link = (s: AbortSignal) => {
    if (s.aborted) ctrl.abort(s.reason);
    else s.addEventListener('abort', () => ctrl.abort(s.reason), { once: true });
  };
  link(a);
  link(b);
  return ctrl.signal;
}
