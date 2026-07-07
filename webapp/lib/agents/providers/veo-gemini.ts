// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/providers/veo-gemini.ts
// Veo 3 video generation via Google Gemini API (single API key, no OAuth).
//
// Endpoint: generativelanguage.googleapis.com — long-running operation pattern.
//   POST :predictLongRunning  → { name: "<operation>" }
//   GET  /<operation>         → poll until done: true
//   When done: response.generateVideoResponse.generatedSamples[0].video has
//   either { uri } (signed download URL valid ~24h) or inline bytes per docs.
//
// We poll every 5s up to 6 minutes (Veo standard generation: ~60-120s).
// Inngest functions allow long step.run durations, so this is safe inside the
// generation step. For the test script we just await inline.
// ──────────────────────────────────────────────────────────────────────────────

import { fetchWithTimeout, FETCH_TIMEOUTS } from './fetch-with-timeout';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const POLL_INTERVAL_MS = 5_000;
const MAX_WAIT_MS = 6 * 60 * 1000;

export type VeoAspectRatio = '16:9' | '9:16' | '1:1';
export type VeoQualityTier = 'standard' | 'fast';

export interface VeoGeminiInput {
  prompt: string;
  /** Default 5. Veo 3 supports 4–8 second clips. */
  durationSeconds?: number;
  aspectRatio?: VeoAspectRatio;
  /** Optional reference frame as base64 PNG/JPEG for image-to-video. */
  referenceImageBase64?: string;
  referenceImageMime?: 'image/png' | 'image/jpeg';
  /**
   * 'standard' uses veo-3.1-generate-preview (default unless VEO_MODEL_STANDARD
   * overrides); 'fast' uses veo-3.1-fast-generate-preview. Defaults to 'fast'
   * — Director directive 2026-05-06 (cheaper iteration; switch to 'standard'
   * for final renders).
   */
  quality?: VeoQualityTier;
}

export interface VeoGeminiResult {
  status: 'success';
  provider: 'veo-3' | 'veo-3-img2vid';
  format: 'MP4';
  width: number;
  height: number;
  duration_seconds: number;
  size_bytes: number;
  /** Base64-encoded MP4 bytes. */
  mp4_b64: string;
  cost_usd: number;
  operation_name: string;
  /**
   * The actual Google model id used at generate time (e.g.
   * `veo-3.1-fast-generate-preview`). Persisted into asset metadata so Director
   * can audit which model produced any given shot without reading runtime
   * logs (Phase A.1 directive 2026-05-07 — "Verify provider").
   */
  model_id: string;
}

export class VeoGeminiError extends Error {
  constructor(
    message: string,
    public readonly status: number | null = null,
    public readonly body: string | null = null,
  ) {
    super(message);
    this.name = 'VeoGeminiError';
  }
}

// Veo model IDs. Defaults switched to Veo 3.1 (preview) in 2026-05-06 Phase 1.5
// upgrade — Director directive: "переходить на 3.1 там квота в 5 раз больше".
// Veo 3.1 lifts the per-region request-rate ceiling vs the Veo 3.0 IDs that
// were previously hard-coded.
//
// Director can override via env without redeploy if Google renames the model:
//   VEO_MODEL_STANDARD  — overrides the 'standard' tier model id
//   VEO_MODEL_FAST      — overrides the 'fast' tier model id
//
// Fallback chain: env → 3.1 default. If 3.1 ever gets retired or renamed,
// env override is the safety valve.
function getVeoModelId(quality: VeoQualityTier): string {
  const env =
    quality === 'standard'
      ? process.env.VEO_MODEL_STANDARD
      : process.env.VEO_MODEL_FAST;
  const trimmed = env?.trim();
  if (trimmed && trimmed.length > 0) return trimmed;
  return quality === 'standard'
    ? 'veo-3.1-generate-preview'
    : 'veo-3.1-fast-generate-preview';
}

// Veo cost estimates per Google AI Studio pricing (USD per second of output).
// Veo 3.1 preview is currently billed at the same rate as Veo 3.0 per Google's
// public pricing page — update here if that changes.
const COST_USD_PER_SECOND: Record<VeoQualityTier, number> = {
  standard: 0.15,
  fast: 0.075,
};

function dimensionsFor(aspect: VeoAspectRatio): { width: number; height: number } {
  if (aspect === '16:9') return { width: 1280, height: 720 };
  if (aspect === '9:16') return { width: 720, height: 1280 };
  return { width: 720, height: 720 };
}

interface PredictResponse {
  name?: string;
  error?: { message?: string };
}

interface OperationResponse {
  name: string;
  done?: boolean;
  error?: { message?: string };
  response?: {
    generateVideoResponse?: {
      generatedSamples?: Array<{
        video?: { uri?: string };
        bytesBase64Encoded?: string;
      }>;
    };
    [key: string]: unknown;
  };
}

async function pollOperation(
  apiKey: string,
  operationName: string,
): Promise<OperationResponse> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < MAX_WAIT_MS) {
    const res = await fetchWithTimeout(`${API_BASE}/${operationName}?key=${encodeURIComponent(apiKey)}`, {}, FETCH_TIMEOUTS.POLL_MS);
    if (!res.ok) {
      throw new VeoGeminiError(
        `Operation poll failed (${res.status})`,
        res.status,
        (await res.text()).slice(0, 600),
      );
    }
    const json = (await res.json()) as OperationResponse;
    if (json.error) {
      throw new VeoGeminiError(
        `Operation reported error: ${json.error.message ?? JSON.stringify(json.error)}`,
      );
    }
    if (json.done) return json;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new VeoGeminiError(
    `Operation polling timed out after ${MAX_WAIT_MS / 1000}s on ${operationName}`,
  );
}

async function downloadVideoBytes(uri: string, apiKey: string): Promise<Uint8Array> {
  // Gemini operation responses sometimes return a download URI that already
  // contains the auth, sometimes one that needs ?key=… appended.
  const url = uri.includes('?') ? `${uri}&key=${encodeURIComponent(apiKey)}` : `${uri}?key=${encodeURIComponent(apiKey)}`;
  const res = await fetchWithTimeout(url, {}, FETCH_TIMEOUTS.BINARY_DOWNLOAD_MS);
  if (!res.ok) {
    throw new VeoGeminiError(
      `Video download failed (${res.status})`,
      res.status,
      (await res.text()).slice(0, 400),
    );
  }
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

export async function generateVideoVeoGemini(
  input: VeoGeminiInput,
): Promise<VeoGeminiResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new VeoGeminiError('GEMINI_API_KEY is not set');
  }

  const quality = input.quality ?? 'fast';
  const model = getVeoModelId(quality);
  const aspectRatio = input.aspectRatio ?? '16:9';
  const durationSeconds = input.durationSeconds ?? 5;

  const instance: Record<string, unknown> = { prompt: input.prompt };
  if (input.referenceImageBase64) {
    instance.image = {
      bytesBase64Encoded: input.referenceImageBase64,
      mimeType: input.referenceImageMime ?? 'image/png',
    };
  }

  const reqBody = {
    instances: [instance],
    parameters: {
      aspectRatio,
      durationSeconds,
      sampleCount: 1,
    },
  };

  const submitRes = await fetchWithTimeout(
    `${API_BASE}/models/${model}:predictLongRunning?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(reqBody),
    },
    FETCH_TIMEOUTS.QUEUE_SUBMIT_MS,
  );
  if (!submitRes.ok) {
    // Surface the actual Veo response body in the error message so Inngest
    // run output shows WHY (content filter? bad reference image? quota?).
    // Without this, every failure read as bare "Veo predictLongRunning
    // failed (4xx)" and Director couldn't tell 429 quota from 400 content
    // policy. 2026-05-13 evening — Director ran into 400s on Standard tier.
    const body = (await submitRes.text()).slice(0, 800);
    throw new VeoGeminiError(
      `Veo predictLongRunning failed (${submitRes.status}) — ${body || '<empty body>'}`,
      submitRes.status,
      body,
    );
  }
  const submitJson = (await submitRes.json()) as PredictResponse;
  if (!submitJson.name) {
    throw new VeoGeminiError(
      `Veo predictLongRunning returned no operation name: ${JSON.stringify(submitJson).slice(0, 400)}`,
    );
  }
  const operationName = submitJson.name;

  const op = await pollOperation(apiKey, operationName);

  // Extract video bytes — try inline first, then download URI.
  const sample = op.response?.generateVideoResponse?.generatedSamples?.[0];
  if (!sample) {
    throw new VeoGeminiError(
      `Veo response missing generatedSamples: ${JSON.stringify(op.response).slice(0, 600)}`,
    );
  }

  let mp4Bytes: Uint8Array;
  if (sample.bytesBase64Encoded) {
    mp4Bytes = Uint8Array.from(Buffer.from(sample.bytesBase64Encoded, 'base64'));
  } else if (sample.video?.uri) {
    mp4Bytes = await downloadVideoBytes(sample.video.uri, apiKey);
  } else {
    throw new VeoGeminiError(
      `Veo sample has no bytes/uri: ${JSON.stringify(sample).slice(0, 400)}`,
    );
  }

  const { width, height } = dimensionsFor(aspectRatio);
  const cost = durationSeconds * COST_USD_PER_SECOND[quality];
  const provider: VeoGeminiResult['provider'] = input.referenceImageBase64
    ? 'veo-3-img2vid'
    : 'veo-3';

  return {
    status: 'success',
    provider,
    format: 'MP4',
    width,
    height,
    duration_seconds: durationSeconds,
    size_bytes: mp4Bytes.length,
    mp4_b64: Buffer.from(mp4Bytes).toString('base64'),
    cost_usd: cost,
    operation_name: operationName,
    model_id: model,
  };
}
