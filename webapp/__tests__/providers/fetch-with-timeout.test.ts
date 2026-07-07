import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchWithTimeout,
  FetchTimeoutError,
  FETCH_TIMEOUTS,
} from '../../lib/agents/providers/fetch-with-timeout';

// Preserve the real fetch so we can restore it between cases.
const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
  vi.restoreAllMocks();
});

describe('fetchWithTimeout', () => {
  it('aborts and throws FetchTimeoutError when the request outlives timeoutMs', async () => {
    // fetch that honors the abort signal: rejects with the exact DOMException the
    // runtime throws for AbortSignal.timeout, and never resolves otherwise.
    global.fetch = vi.fn((_url: string | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation timed out.', 'TimeoutError'));
        });
      });
    }) as unknown as typeof fetch;

    const started = Date.now();
    await expect(
      fetchWithTimeout('https://example.test/hang', { method: 'GET' }, 20),
    ).rejects.toBeInstanceOf(FetchTimeoutError);
    // settled well before any real-world budget
    expect(Date.now() - started).toBeLessThan(500);

    // and the error carries observability fields
    try {
      await fetchWithTimeout('https://example.test/hang', {}, 20);
    } catch (err) {
      expect(err).toBeInstanceOf(FetchTimeoutError);
      expect((err as FetchTimeoutError).timeoutMs).toBe(20);
      expect((err as FetchTimeoutError).url).toContain('example.test');
    }
  });

  it('returns the Response unchanged on fast success', async () => {
    const ok = new Response('body', { status: 200 });
    global.fetch = vi.fn(async () => ok) as unknown as typeof fetch;

    const res = await fetchWithTimeout(
      'https://example.test/ok',
      { method: 'POST' },
      FETCH_TIMEOUTS.IMAGE_API_MS,
    );
    expect(res).toBe(ok);
    expect(res.status).toBe(200);
  });

  it('re-throws a genuine network error unchanged (not converted to timeout)', async () => {
    const netErr = new TypeError('fetch failed');
    global.fetch = vi.fn(async () => {
      throw netErr;
    }) as unknown as typeof fetch;

    await expect(
      fetchWithTimeout('https://example.test/down', {}, FETCH_TIMEOUTS.POLL_MS),
    ).rejects.toBe(netErr);
  });

  it('rejects immediately when a caller-supplied signal is already aborted', async () => {
    // fetch that rejects the moment its signal aborts — verifies compose wiring.
    global.fetch = vi.fn((_url: string | URL, init?: RequestInit) => {
      return new Promise<Response>((resolve, reject) => {
        const signal = init?.signal;
        if (signal?.aborted) {
          reject(new DOMException('aborted', 'AbortError'));
          return;
        }
        signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
        resolve(new Response('never', { status: 200 }));
      });
    }) as unknown as typeof fetch;

    const pre = new AbortController();
    pre.abort();
    await expect(
      fetchWithTimeout(
        'https://example.test/x',
        { signal: pre.signal },
        FETCH_TIMEOUTS.POLL_MS,
      ),
    ).rejects.toBeInstanceOf(DOMException);
  });
});
