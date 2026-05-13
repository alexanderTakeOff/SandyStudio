// Unit tests for the fal.ai Seedance 2.0 provider adapter. We mock global
// fetch so the suite never hits the network — coverage focuses on the
// queue-protocol mechanics that bit us during 2026-05-13 Phase 1 probes:
// full vs parent-truncated URLs, status polling, slug resolution.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  generateVideoFalSeedance,
  FalSeedanceError,
  SEEDANCE_COST_USD_PER_SECOND,
} from '@/lib/agents/providers/fal-seedance';

type FetchInit = RequestInit | undefined;
type FetchResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

function jsonResponse(body: unknown, status = 200): FetchResponse {
  return {
    ok: status < 400,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}

function mp4Response(bytes: Uint8Array): FetchResponse {
  // Copy into a plain ArrayBuffer — vitest's lib.dom typing rejects the union
  // `ArrayBufferLike` returned by Uint8Array.buffer when SharedArrayBuffer is
  // in scope. Plain ArrayBuffer is unambiguous.
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  return {
    ok: true,
    status: 200,
    json: async () => ({}),
    text: async () => '',
    arrayBuffer: async () => ab,
  };
}

const ORIG_FAL_KEY = process.env.FAL_KEY;
const ORIG_FAL_API_KEY = process.env.FAL_API_KEY;
const ORIG_FETCH = globalThis.fetch;

describe('generateVideoFalSeedance', () => {
  beforeEach(() => {
    process.env.FAL_KEY = 'test-fal-key';
    delete process.env.FAL_API_KEY;
    delete process.env.FAL_SEEDANCE_MODEL_STANDARD;
    delete process.env.FAL_SEEDANCE_MODEL_FAST;
  });
  afterEach(() => {
    if (ORIG_FAL_KEY === undefined) delete process.env.FAL_KEY;
    else process.env.FAL_KEY = ORIG_FAL_KEY;
    if (ORIG_FAL_API_KEY === undefined) delete process.env.FAL_API_KEY;
    else process.env.FAL_API_KEY = ORIG_FAL_API_KEY;
    globalThis.fetch = ORIG_FETCH;
    vi.restoreAllMocks();
  });

  it('throws when FAL_KEY is missing', async () => {
    delete process.env.FAL_KEY;
    await expect(
      generateVideoFalSeedance({ prompt: 'test' }),
    ).rejects.toThrow(FalSeedanceError);
  });

  it('uses standard slug for quality=standard and fast slug for quality=fast', async () => {
    const seen: string[] = [];
    globalThis.fetch = vi.fn(async (url: string | URL | Request, _init?: FetchInit) => {
      const u = String(url);
      seen.push(u);
      if (u.startsWith('https://queue.fal.run/') && !u.includes('/requests/')) {
        return jsonResponse({
          request_id: 'req-1',
          status_url: 'https://queue.fal.run/bytedance/seedance-2.0/requests/req-1/status',
          response_url: 'https://queue.fal.run/bytedance/seedance-2.0/requests/req-1',
        }) as unknown as Response;
      }
      if (u.endsWith('/status')) {
        return jsonResponse({ status: 'COMPLETED' }) as unknown as Response;
      }
      if (u.endsWith('/requests/req-1')) {
        return jsonResponse({
          video: { url: 'https://example.com/result.mp4' },
        }) as unknown as Response;
      }
      // Final mp4 download.
      return mp4Response(new Uint8Array([0, 0, 0, 1])) as unknown as Response;
    }) as unknown as typeof fetch;

    await generateVideoFalSeedance({
      prompt: 'p',
      quality: 'standard',
      durationSeconds: 5,
    });
    expect(seen[0]).toBe('https://queue.fal.run/bytedance/seedance-2.0/image-to-video');

    seen.length = 0;
    await generateVideoFalSeedance({
      prompt: 'p',
      quality: 'fast',
      durationSeconds: 5,
    });
    expect(seen[0]).toBe('https://queue.fal.run/bytedance/seedance-2.0/fast/image-to-video');
  });

  it('honors FAL_SEEDANCE_MODEL_FAST env override', async () => {
    process.env.FAL_SEEDANCE_MODEL_FAST = 'bytedance/seedance-2.0/turbo/image-to-video';
    const seen: string[] = [];
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      seen.push(u);
      if (u.startsWith('https://queue.fal.run/') && !u.includes('/requests/')) {
        return jsonResponse({
          request_id: 'r',
          status_url: 'https://queue.fal.run/parent/requests/r/status',
          response_url: 'https://queue.fal.run/parent/requests/r',
        }) as unknown as Response;
      }
      if (u.endsWith('/status')) return jsonResponse({ status: 'COMPLETED' }) as unknown as Response;
      if (u.endsWith('/requests/r')) {
        return jsonResponse({ video: { url: 'https://x/v.mp4' } }) as unknown as Response;
      }
      return mp4Response(new Uint8Array([1])) as unknown as Response;
    }) as unknown as typeof fetch;

    await generateVideoFalSeedance({ prompt: 'p', quality: 'fast', durationSeconds: 4 });
    expect(seen[0]).toBe('https://queue.fal.run/bytedance/seedance-2.0/turbo/image-to-video');
  });

  it('sends Bearer-style Authorization header and JSON body', async () => {
    let captured: { headers?: Record<string, string>; body?: unknown } = {};
    globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: FetchInit) => {
      const u = String(url);
      if (u.startsWith('https://queue.fal.run/') && !u.includes('/requests/')) {
        captured = {
          headers: init?.headers as Record<string, string>,
          body: init?.body ? JSON.parse(init.body as string) : undefined,
        };
        return jsonResponse({
          request_id: 'r',
          status_url: 'https://queue.fal.run/p/requests/r/status',
          response_url: 'https://queue.fal.run/p/requests/r',
        }) as unknown as Response;
      }
      if (u.endsWith('/status')) return jsonResponse({ status: 'COMPLETED' }) as unknown as Response;
      if (u.endsWith('/requests/r')) {
        return jsonResponse({ video: { url: 'https://x/v.mp4' } }) as unknown as Response;
      }
      return mp4Response(new Uint8Array([1])) as unknown as Response;
    }) as unknown as typeof fetch;

    await generateVideoFalSeedance({
      prompt: 'orbit camera prompt',
      quality: 'standard',
      durationSeconds: 6,
      aspectRatio: '16:9',
    });
    expect(captured.headers).toMatchObject({
      Authorization: 'Key test-fal-key',
      'content-type': 'application/json',
    });
    expect(captured.body).toMatchObject({
      prompt: 'orbit camera prompt',
      duration: '6',
      aspect_ratio: '16:9',
      resolution: '720p',
      generate_audio: false,
    });
  });

  it('uses fal-returned status_url + response_url verbatim (parent-truncation quirk)', async () => {
    const visited: string[] = [];
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      visited.push(u);
      if (u.startsWith('https://queue.fal.run/') && !u.includes('/requests/')) {
        return jsonResponse({
          request_id: 'qrz',
          // Truncated to parent (without /image-to-video) — fal's real behavior.
          status_url: 'https://queue.fal.run/bytedance/seedance-2.0/requests/qrz/status',
          response_url: 'https://queue.fal.run/bytedance/seedance-2.0/requests/qrz',
        }) as unknown as Response;
      }
      if (u.endsWith('/status')) {
        return jsonResponse({ status: 'COMPLETED' }) as unknown as Response;
      }
      if (u.endsWith('/requests/qrz')) {
        return jsonResponse({ video: { url: 'https://x/v.mp4' } }) as unknown as Response;
      }
      return mp4Response(new Uint8Array([1])) as unknown as Response;
    }) as unknown as typeof fetch;

    await generateVideoFalSeedance({ prompt: 'p', durationSeconds: 4 });

    // Status poll must hit the parent-truncated URL exactly.
    expect(visited).toContain('https://queue.fal.run/bytedance/seedance-2.0/requests/qrz/status');
    // Result fetch likewise — never the full slug.
    expect(visited).toContain('https://queue.fal.run/bytedance/seedance-2.0/requests/qrz');
  });

  it('surfaces 429 RESOURCE_EXHAUSTED as a typed error', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(
        {
          detail: 'Exhausted balance. Top up your balance at fal.ai/dashboard/billing.',
        },
        403,
      ) as unknown as Response,
    ) as unknown as typeof fetch;
    await expect(generateVideoFalSeedance({ prompt: 'p' })).rejects.toThrow(
      /fal submit failed \(403\)/,
    );
  });

  it('throws when fal returns FAILED status', async () => {
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.startsWith('https://queue.fal.run/') && !u.includes('/requests/')) {
        return jsonResponse({
          request_id: 'r',
          status_url: 'https://queue.fal.run/p/requests/r/status',
          response_url: 'https://queue.fal.run/p/requests/r',
        }) as unknown as Response;
      }
      return jsonResponse({ status: 'FAILED' }) as unknown as Response;
    }) as unknown as typeof fetch;
    await expect(generateVideoFalSeedance({ prompt: 'p' })).rejects.toThrow(/FAILED/);
  });

  it('returns cost_usd = duration × per-second rate, separate per tier', async () => {
    function setupHappyPath(): void {
      globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
        const u = String(url);
        if (u.startsWith('https://queue.fal.run/') && !u.includes('/requests/')) {
          return jsonResponse({
            request_id: 'r',
            status_url: 'https://queue.fal.run/p/requests/r/status',
            response_url: 'https://queue.fal.run/p/requests/r',
          }) as unknown as Response;
        }
        if (u.endsWith('/status')) {
          return jsonResponse({ status: 'COMPLETED' }) as unknown as Response;
        }
        if (u.endsWith('/requests/r')) {
          return jsonResponse({ video: { url: 'https://x/v.mp4' } }) as unknown as Response;
        }
        return mp4Response(new Uint8Array([1, 2, 3])) as unknown as Response;
      }) as unknown as typeof fetch;
    }

    setupHappyPath();
    const fast = await generateVideoFalSeedance({
      prompt: 'p',
      quality: 'fast',
      durationSeconds: 5,
    });
    expect(fast.cost_usd).toBeCloseTo(5 * SEEDANCE_COST_USD_PER_SECOND.fast, 6);

    setupHappyPath();
    const std = await generateVideoFalSeedance({
      prompt: 'p',
      quality: 'standard',
      durationSeconds: 8,
    });
    expect(std.cost_usd).toBeCloseTo(8 * SEEDANCE_COST_USD_PER_SECOND.standard, 6);
  });

  it('attaches inline data URL when referenceImageBase64 is provided', async () => {
    let captured: Record<string, unknown> = {};
    globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: FetchInit) => {
      const u = String(url);
      if (u.startsWith('https://queue.fal.run/') && !u.includes('/requests/')) {
        captured = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : {};
        return jsonResponse({
          request_id: 'r',
          status_url: 'https://queue.fal.run/p/requests/r/status',
          response_url: 'https://queue.fal.run/p/requests/r',
        }) as unknown as Response;
      }
      if (u.endsWith('/status')) return jsonResponse({ status: 'COMPLETED' }) as unknown as Response;
      if (u.endsWith('/requests/r')) {
        return jsonResponse({ video: { url: 'https://x/v.mp4' } }) as unknown as Response;
      }
      return mp4Response(new Uint8Array([1])) as unknown as Response;
    }) as unknown as typeof fetch;

    await generateVideoFalSeedance({
      prompt: 'p',
      referenceImageBase64: 'aGVsbG8=', // "hello"
      referenceImageMime: 'image/png',
    });
    expect(String(captured.image_url)).toBe('data:image/png;base64,aGVsbG8=');
  });

  it('reports provider id `seedance-fal-img2vid` when reference image attached, else `seedance-fal`', async () => {
    function setupHappyPath(): void {
      globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
        const u = String(url);
        if (u.startsWith('https://queue.fal.run/') && !u.includes('/requests/')) {
          return jsonResponse({
            request_id: 'r',
            status_url: 'https://queue.fal.run/p/requests/r/status',
            response_url: 'https://queue.fal.run/p/requests/r',
          }) as unknown as Response;
        }
        if (u.endsWith('/status')) return jsonResponse({ status: 'COMPLETED' }) as unknown as Response;
        if (u.endsWith('/requests/r')) {
          return jsonResponse({ video: { url: 'https://x/v.mp4' } }) as unknown as Response;
        }
        return mp4Response(new Uint8Array([1])) as unknown as Response;
      }) as unknown as typeof fetch;
    }

    setupHappyPath();
    const withRef = await generateVideoFalSeedance({
      prompt: 'p',
      referenceImageBase64: 'aGVsbG8=',
    });
    expect(withRef.provider).toBe('seedance-fal-img2vid');

    setupHappyPath();
    const withoutRef = await generateVideoFalSeedance({ prompt: 'p' });
    expect(withoutRef.provider).toBe('seedance-fal');
  });

  it('clamps duration into [4, 15] and forwards as string enum', async () => {
    let body: Record<string, unknown> = {};
    globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: FetchInit) => {
      const u = String(url);
      if (u.startsWith('https://queue.fal.run/') && !u.includes('/requests/')) {
        body = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : {};
        return jsonResponse({
          request_id: 'r',
          status_url: 'https://queue.fal.run/p/requests/r/status',
          response_url: 'https://queue.fal.run/p/requests/r',
        }) as unknown as Response;
      }
      if (u.endsWith('/status')) return jsonResponse({ status: 'COMPLETED' }) as unknown as Response;
      if (u.endsWith('/requests/r')) {
        return jsonResponse({ video: { url: 'https://x/v.mp4' } }) as unknown as Response;
      }
      return mp4Response(new Uint8Array([1])) as unknown as Response;
    }) as unknown as typeof fetch;

    await generateVideoFalSeedance({ prompt: 'p', durationSeconds: 99 });
    expect(body.duration).toBe('15');

    await generateVideoFalSeedance({ prompt: 'p', durationSeconds: 2 });
    expect(body.duration).toBe('4');

    await generateVideoFalSeedance({ prompt: 'p', durationSeconds: 6.6 });
    expect(body.duration).toBe('7');
  });
});
