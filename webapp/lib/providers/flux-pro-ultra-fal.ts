// ──────────────────────────────────────────────────────────────────────────────
// lib/providers/flux-pro-ultra-fal.ts
// Flux Pro 1.1 Ultra Redux adapter via fal.ai.
//
// Why this provider exists:
//   - gpt-image-1 edits is identity-locked — character emotion in v1 was
//     stuck at the Bible reference's baseline expression. We needed a
//     provider that lets text-prompt override the anchor for action /
//     emotion shots without losing identity.
//   - Flux Pro 1.1 Ultra Redux exposes `image_prompt_strength` (0..1).
//     0.6 is the empirical sweet spot: identity stays recognisable, the
//     action/emotion described in the prompt actually lands.
//
// Limitations vs openai-edits-multi:
//   - Single reference image only. For multi-character shots we anchor on
//     the most prominent character (subject, then co-star, then location).
//     If the shot has 2+ subject-role characters, only one identity is
//     image-anchored; the other relies on the canonical Bible description
//     in the prompt.
//
// Endpoint: https://queue.fal.run/fal-ai/flux-pro/v1.1-ultra/redux
// Auth:     `Authorization: Key <FAL_KEY>` (env var)
// Pricing:  ~$0.05–0.06 per image at this resolution (medium quality).
//
// fal.ai uses a queue API: POST returns a request_id; we poll the status
// endpoint until COMPLETED, then fetch the result. Implemented inline
// without the SDK to keep the dependency tree thin (one less moving part).
// ──────────────────────────────────────────────────────────────────────────────

import type {
  MultiImageGenInput,
  MultiImageGenProvider,
  MultiImageGenResult,
} from './image-gen-multi';
import { MultiImageGenError } from './image-gen-multi';
import { fetchWithTimeout, FETCH_TIMEOUTS } from './fetch-with-timeout';

const PROVIDER_ID = 'flux-pro-1.1-ultra';
const MODEL = 'flux-pro/v1.1-ultra/redux';
const ENDPOINT = `https://queue.fal.run/fal-ai/${MODEL}`;
// Polling cap: most renders return < 30s; allow up to ~3 minutes worst-case.
const POLL_INTERVAL_MS = 1500;
const POLL_MAX_ATTEMPTS = 120;

// Cost ladder (fal.ai docs as of plan approval). Re-tune in app_config when
// pricing shifts; this is just the default reported back to the cost ledger.
function costForSize(size: NonNullable<MultiImageGenInput['size']>): number {
  if (size === '2752x1536' || size === '1536x2752' || size === '2048x2048') return 0.06;
  return 0.05;
}

function dimensionsFor(size: NonNullable<MultiImageGenInput['size']>): { width: number; height: number } {
  const [w, h] = size.split('x').map((n) => Number(n));
  return { width: w ?? 1024, height: h ?? 1024 };
}

/**
 * Pick the strongest single anchor from the references list.
 * Order: identity (subject preferred) → location → style.
 * If references[] is empty, returns null and caller falls back to text-only.
 */
function pickPrimaryAnchor(refs: MultiImageGenInput['references']): MultiImageGenInput['references'][number] | null {
  return (
    refs.find((r) => r.kind === 'identity') ??
    refs.find((r) => r.kind === 'location') ??
    refs.find((r) => r.kind === 'style') ??
    null
  );
}

interface FalQueuedResponse {
  request_id: string;
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  status_url?: string;
  response_url?: string;
}

interface FalStatusResponse {
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  response_url?: string;
}

interface FalResultImage {
  url: string;
  width: number;
  height: number;
  content_type?: string;
}

interface FalResultResponse {
  images: FalResultImage[];
  prompt?: string;
  has_nsfw_concepts?: boolean[];
  seed?: number;
}

async function falFetch<T>(url: string, init: RequestInit, apiKey: string): Promise<T> {
  const res = await fetchWithTimeout(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Key ${apiKey}`,
    },
  }, FETCH_TIMEOUTS.POLL_MS);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new MultiImageGenError(
      `fal.ai ${res.status} on ${url}: ${body.slice(0, 400)}`,
      PROVIDER_ID,
    );
  }
  return (await res.json()) as T;
}

async function pollUntilComplete(
  initial: FalQueuedResponse,
  apiKey: string,
): Promise<FalResultResponse> {
  if (initial.status === 'COMPLETED' && initial.response_url) {
    return await falFetch<FalResultResponse>(initial.response_url, { method: 'GET' }, apiKey);
  }
  const statusUrl = initial.status_url;
  if (!statusUrl) {
    throw new MultiImageGenError('fal.ai response missing status_url', PROVIDER_ID);
  }

  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const s = await falFetch<FalStatusResponse>(statusUrl, { method: 'GET' }, apiKey);
    if (s.status === 'COMPLETED') {
      const responseUrl = s.response_url ?? statusUrl.replace('/status', '');
      return await falFetch<FalResultResponse>(responseUrl, { method: 'GET' }, apiKey);
    }
    if (s.status === 'FAILED') {
      throw new MultiImageGenError('fal.ai job FAILED', PROVIDER_ID);
    }
  }
  throw new MultiImageGenError(
    `fal.ai job did not finish within ${(POLL_INTERVAL_MS * POLL_MAX_ATTEMPTS) / 1000}s`,
    PROVIDER_ID,
  );
}

async function downloadAsBase64(imageUrl: string): Promise<string> {
  const res = await fetchWithTimeout(imageUrl, {}, FETCH_TIMEOUTS.BINARY_DOWNLOAD_MS);
  if (!res.ok) {
    throw new MultiImageGenError(
      `Failed to download fal.ai result image (${res.status})`,
      PROVIDER_ID,
    );
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.toString('base64');
}

export const fluxProUltraFalProvider: MultiImageGenProvider = {
  id: PROVIDER_ID,
  capabilities: {
    max_references: 1,
    supports_strength: true,
    supports_per_ref_weight: false,
    default_strength: 0.6,
  },

  async generate(input: MultiImageGenInput): Promise<MultiImageGenResult> {
    const apiKey = process.env.FAL_KEY?.trim() ?? process.env.FAL_API_KEY?.trim();
    if (!apiKey) {
      throw new MultiImageGenError(
        'FAL_KEY (or FAL_API_KEY) is not set',
        PROVIDER_ID,
      );
    }

    const anchor = pickPrimaryAnchor(input.references);
    if (!anchor) {
      throw new MultiImageGenError(
        'Flux Pro Ultra Redux requires at least one reference image (use text-only provider for prompt-only generation)',
        PROVIDER_ID,
      );
    }

    const size = input.size ?? '1024x1024';
    const strength = typeof input.strength === 'number' ? input.strength : 0.6;
    const dataUri = `data:image/png;base64,${anchor.image_b64}`;
    // Flux Pro 1.1 Ultra Redux rejects `image_size: "1024x1024"` strings with
    // HTTP 422; the endpoint expects either a named enum
    // ('square_hd' | 'landscape_16_9' | …) or an explicit { width, height }
    // pair. We send dimensions to preserve the existing size matrix.
    const dimensions = dimensionsFor(size);

    // Submit job to queue.
    const queued = await falFetch<FalQueuedResponse>(
      ENDPOINT,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt: input.prompt,
          image_url: dataUri,
          image_prompt_strength: strength,
          image_size: dimensions,
          num_inference_steps: 30,
          guidance_scale: 3.5,
          safety_tolerance: '2',
          output_format: 'png',
        }),
      },
      apiKey,
    );

    const result = await pollUntilComplete(queued, apiKey);
    const first = result.images[0];
    if (!first?.url) {
      throw new MultiImageGenError(
        `fal.ai response had no image URL (response keys: ${Object.keys(result).join(',')})`,
        PROVIDER_ID,
      );
    }

    const b64 = await downloadAsBase64(first.url);
    const { width, height } = dimensionsFor(size);
    const cost = costForSize(size);

    return {
      b64_data: b64,
      cost_usd: cost,
      width: first.width ?? width,
      height: first.height ?? height,
      provider_id: PROVIDER_ID,
      model: MODEL,
      revised_prompt: result.prompt,
    };
  },
};
