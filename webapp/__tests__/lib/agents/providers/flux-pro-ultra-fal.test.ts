// Unit tests for the Flux Pro 1.1 Ultra Redux provider adapter.
// Locks the 2026-05-14 P0 fix: `image_size` must be sent as a
// { width, height } object, not as the legacy "1024x1024" string,
// otherwise fal.ai returns HTTP 422.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fluxProUltraFalProvider } from '@/lib/providers/flux-pro-ultra-fal';
import { MultiImageGenError, type MultiImageGenInput } from '@/lib/providers/image-gen-multi';

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

function pngResponse(): FetchResponse {
  const ab = new ArrayBuffer(4);
  new Uint8Array(ab).set([0x89, 0x50, 0x4e, 0x47]);
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

function makeRef(kind: 'identity' | 'location' | 'style', id = `bible-${kind}`) {
  return {
    kind,
    bible_asset_id: id,
    image_b64: 'aGVsbG8=', // "hello" — fake image bytes
  };
}

function baseInput(overrides: Partial<MultiImageGenInput> = {}): MultiImageGenInput {
  return {
    prompt: 'Sandy laughs in a neon cafe',
    references: [makeRef('identity')],
    ...overrides,
  };
}

describe('fluxProUltraFalProvider', () => {
  beforeEach(() => {
    process.env.FAL_KEY = 'test-fal-key';
    delete process.env.FAL_API_KEY;
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
    await expect(fluxProUltraFalProvider.generate(baseInput())).rejects.toThrow(MultiImageGenError);
  });

  it('throws when no reference image is supplied', async () => {
    await expect(
      fluxProUltraFalProvider.generate(baseInput({ references: [] })),
    ).rejects.toThrow(/at least one reference/i);
  });

  it('sends image_size as a { width, height } object (P0 fix — fal.ai 422 on legacy "1024x1024" string)', async () => {
    let submittedBody: Record<string, unknown> | null = null;

    globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: FetchInit) => {
      const u = String(url);
      if (u.endsWith('/redux') && init?.method === 'POST') {
        submittedBody = JSON.parse(String(init.body));
        return jsonResponse({
          request_id: 'r1',
          status: 'COMPLETED',
          response_url: 'https://queue.fal.run/result/r1',
        });
      }
      if (u.endsWith('/result/r1')) {
        return jsonResponse({
          images: [{ url: 'https://cdn.fal.ai/out.png', width: 1024, height: 1024 }],
        });
      }
      if (u.startsWith('https://cdn.fal.ai/')) return pngResponse();
      throw new Error(`unexpected url: ${u}`);
    }) as unknown as typeof globalThis.fetch;

    await fluxProUltraFalProvider.generate(baseInput({ size: '1024x1024' }));

    expect(submittedBody).not.toBeNull();
    expect(submittedBody!.image_size).toEqual({ width: 1024, height: 1024 });
    // Defensive regression guard — the old broken value was the literal string.
    expect(submittedBody!.image_size).not.toBe('1024x1024');
  });

  it('converts non-square size matrix entries correctly', async () => {
    let submittedBody: Record<string, unknown> | null = null;

    globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: FetchInit) => {
      const u = String(url);
      if (u.endsWith('/redux') && init?.method === 'POST') {
        submittedBody = JSON.parse(String(init.body));
        return jsonResponse({
          request_id: 'r2',
          status: 'COMPLETED',
          response_url: 'https://queue.fal.run/result/r2',
        });
      }
      if (u.endsWith('/result/r2')) {
        return jsonResponse({
          images: [{ url: 'https://cdn.fal.ai/out2.png', width: 2752, height: 1536 }],
        });
      }
      if (u.startsWith('https://cdn.fal.ai/')) return pngResponse();
      throw new Error(`unexpected url: ${u}`);
    }) as unknown as typeof globalThis.fetch;

    const out = await fluxProUltraFalProvider.generate(baseInput({ size: '2752x1536' }));

    expect(submittedBody!.image_size).toEqual({ width: 2752, height: 1536 });
    // Cost ladder: ultra-wide tier is $0.06.
    expect(out.cost_usd).toBeCloseTo(0.06, 5);
    expect(out.provider_id).toBe('flux-pro-1.1-ultra');
  });

  it('prefers identity anchor over location and style refs', async () => {
    let submittedBody: { image_url?: string } | null = null;
    const identityRef = makeRef('identity', 'bible-identity');
    const locationRef = makeRef('location', 'bible-location');
    const styleRef = makeRef('style', 'bible-style');

    globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: FetchInit) => {
      const u = String(url);
      if (u.endsWith('/redux') && init?.method === 'POST') {
        submittedBody = JSON.parse(String(init.body));
        return jsonResponse({
          request_id: 'r3',
          status: 'COMPLETED',
          response_url: 'https://queue.fal.run/result/r3',
        });
      }
      if (u.endsWith('/result/r3')) {
        return jsonResponse({ images: [{ url: 'https://cdn.fal.ai/out3.png', width: 1024, height: 1024 }] });
      }
      if (u.startsWith('https://cdn.fal.ai/')) return pngResponse();
      throw new Error(`unexpected url: ${u}`);
    }) as unknown as typeof globalThis.fetch;

    await fluxProUltraFalProvider.generate(
      baseInput({ references: [locationRef, styleRef, identityRef] }),
    );

    // image_url is a data URI — anchor's b64 ("aGVsbG8=") must be embedded.
    expect(submittedBody!.image_url).toContain('aGVsbG8=');
  });

  it('forwards explicit strength override', async () => {
    let submittedBody: { image_prompt_strength?: number } | null = null;

    globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: FetchInit) => {
      const u = String(url);
      if (u.endsWith('/redux') && init?.method === 'POST') {
        submittedBody = JSON.parse(String(init.body));
        return jsonResponse({
          request_id: 'r4',
          status: 'COMPLETED',
          response_url: 'https://queue.fal.run/result/r4',
        });
      }
      if (u.endsWith('/result/r4')) {
        return jsonResponse({ images: [{ url: 'https://cdn.fal.ai/out4.png', width: 1024, height: 1024 }] });
      }
      if (u.startsWith('https://cdn.fal.ai/')) return pngResponse();
      throw new Error(`unexpected url: ${u}`);
    }) as unknown as typeof globalThis.fetch;

    await fluxProUltraFalProvider.generate(baseInput({ strength: 0.85 }));
    expect(submittedBody!.image_prompt_strength).toBe(0.85);

    await fluxProUltraFalProvider.generate(baseInput()); // default
    expect(submittedBody!.image_prompt_strength).toBe(0.6);
  });
});
