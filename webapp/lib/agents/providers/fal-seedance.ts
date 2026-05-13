// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/providers/fal-seedance.ts
// ByteDance Seedance 2.0 video generation via fal.ai queue REST API.
//
// Endpoint pattern: queue.fal.run/<full-slug>
//   POST <full-slug>          → { request_id, status_url, response_url, ... }
//   GET  status_url            → poll IN_QUEUE / IN_PROGRESS until COMPLETED
//   GET  response_url          → { video: { url } } — final mp4 download URL
//
// fal REST quirk: submitted to FULL slug (e.g. bytedance/seedance-2.0/image-to-
// video), but the status_url / response_url fal returns are PARENT-TRUNCATED
// (e.g. bytedance/seedance-2.0/requests/<id>/status, without the trailing
// /image-to-video). The Python fal_client SDK hides this; we use fal's
// returned URLs verbatim instead of constructing them from the slug ourselves.
// Discovered during 2026-05-13 Phase 1 probe.
//
// Pricing per fal.ai 2026-05-13 (per second of output):
//   standard  — $0.3024/s  (model bytedance/seedance-2.0/image-to-video)
//   fast      — $0.2419/s  (model bytedance/seedance-2.0/fast/image-to-video)
// ──────────────────────────────────────────────────────────────────────────────

const QUEUE_BASE = 'https://queue.fal.run';
const POLL_INTERVAL_MS = 4_000;
const MAX_WAIT_MS = 12 * 60 * 1000; // Seedance Standard 8s typically runs 90-180s; allow generous headroom.

export type FalSeedanceAspectRatio = '16:9' | '9:16' | '1:1';
export type FalSeedanceQualityTier = 'standard' | 'fast';

export interface FalSeedanceInput {
  prompt: string;
  /** Default 5. Seedance 2.0 supports 4–15 second clips. */
  durationSeconds?: number;
  aspectRatio?: FalSeedanceAspectRatio;
  /** Optional reference frame as base64 PNG/JPEG for image-to-video. Inline data URL up to ~30 MB. */
  referenceImageBase64?: string;
  referenceImageMime?: 'image/png' | 'image/jpeg';
  /**
   * 'standard' = full quality (default); 'fast' = cheaper iteration tier
   * which uses a separate model slug.
   */
  quality?: FalSeedanceQualityTier;
}

export interface FalSeedanceResult {
  status: 'success';
  provider: 'seedance-fal-img2vid' | 'seedance-fal';
  format: 'MP4';
  width: number;
  height: number;
  duration_seconds: number;
  size_bytes: number;
  /** Base64-encoded MP4 bytes. */
  mp4_b64: string;
  cost_usd: number;
  /** fal queue request id (audit trail). */
  operation_name: string;
  /** Stable model slug used (Phase A.1 audit pattern, matches veo-gemini.ts). */
  model_id: string;
}

export class FalSeedanceError extends Error {
  constructor(
    message: string,
    public readonly status: number | null = null,
    public readonly body: string | null = null,
  ) {
    super(message);
    this.name = 'FalSeedanceError';
  }
}

// Seedance 2.0 model slugs. Override via env if fal renames them.
//   FAL_SEEDANCE_MODEL_STANDARD — overrides 'standard' tier
//   FAL_SEEDANCE_MODEL_FAST     — overrides 'fast' tier
function getSeedanceModelSlug(quality: FalSeedanceQualityTier): string {
  const env =
    quality === 'standard'
      ? process.env.FAL_SEEDANCE_MODEL_STANDARD
      : process.env.FAL_SEEDANCE_MODEL_FAST;
  const trimmed = env?.trim();
  if (trimmed && trimmed.length > 0) return trimmed;
  return quality === 'standard'
    ? 'bytedance/seedance-2.0/image-to-video'
    : 'bytedance/seedance-2.0/fast/image-to-video';
}

const COST_USD_PER_SECOND: Record<FalSeedanceQualityTier, number> = {
  standard: 0.3024,
  fast: 0.2419,
};

// 720p output (Phase 1 — matches Veo width/height contract). Phase 2 can
// expose 480p / 1080p via additional input knob.
function dimensionsFor(aspect: FalSeedanceAspectRatio): { width: number; height: number } {
  switch (aspect) {
    case '16:9':
      return { width: 1280, height: 720 };
    case '9:16':
      return { width: 720, height: 1280 };
    case '1:1':
      return { width: 720, height: 720 };
  }
}

interface QueueSubmitResponse {
  request_id: string;
  status_url?: string;
  response_url?: string;
  cancel_url?: string;
  status?: string;
}

interface QueueStatusResponse {
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  request_id?: string;
  response_url?: string;
  logs?: Array<{ message?: string; level?: string }>;
  queue_position?: number;
}

interface SeedanceResultPayload {
  video?: { url?: string; content_type?: string; file_name?: string; file_size?: number };
  seed?: number;
}

function extractVideoUrl(obj: unknown): string | null {
  if (!obj || typeof obj !== 'object') return null;
  const r = obj as { video?: { url?: string }; videos?: Array<{ url?: string }>; response?: unknown };
  if (r.video?.url) return r.video.url;
  if (Array.isArray(r.videos) && r.videos[0]?.url) return r.videos[0]!.url!;
  if (r.response) return extractVideoUrl(r.response);
  return null;
}

async function pollUntilDone(
  apiKey: string,
  statusUrl: string,
): Promise<QueueStatusResponse> {
  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    const res = await fetch(statusUrl, {
      headers: { Authorization: `Key ${apiKey}` },
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 600);
      throw new FalSeedanceError(
        `fal status poll failed (${res.status})`,
        res.status,
        body,
      );
    }
    const json = (await res.json()) as QueueStatusResponse;
    if (json.status === 'COMPLETED') return json;
    if (json.status === 'FAILED' || json.status === 'CANCELLED') {
      throw new FalSeedanceError(
        `fal request terminated with status=${json.status}`,
        null,
        JSON.stringify(json).slice(0, 600),
      );
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new FalSeedanceError(
    `fal request polling timed out after ${MAX_WAIT_MS / 1000}s on ${statusUrl}`,
  );
}

export async function generateVideoFalSeedance(
  input: FalSeedanceInput,
): Promise<FalSeedanceResult> {
  const apiKey = (process.env.FAL_KEY ?? process.env.FAL_API_KEY)?.trim();
  if (!apiKey) {
    throw new FalSeedanceError('FAL_KEY is not set');
  }

  const quality = input.quality ?? 'fast';
  const modelSlug = getSeedanceModelSlug(quality);
  const aspectRatio = input.aspectRatio ?? '16:9';
  // Seedance 2.0 accepts duration as string enum "4".."15" or "auto".
  const durationSeconds = Math.max(4, Math.min(15, Math.round(input.durationSeconds ?? 5)));

  // Inline data URL composition. Seedance docs explicitly allow data: URLs up
  // to 30 MB; the EREF assets we feed are typically ~1.5 MB PNG, well under.
  const imageUrl = input.referenceImageBase64
    ? `data:${input.referenceImageMime ?? 'image/png'};base64,${input.referenceImageBase64}`
    : undefined;

  const payload: Record<string, unknown> = {
    prompt: input.prompt,
    duration: String(durationSeconds),
    aspect_ratio: aspectRatio,
    resolution: '720p',
    // Audio handled by EXEC-MGEN (SUNO) + EXEC-STITCH (ffmpeg mux), never the
    // video provider. Inline Seedance audio would clash with the music track.
    generate_audio: false,
  };
  if (imageUrl) payload.image_url = imageUrl;

  const submitRes = await fetch(`${QUEUE_BASE}/${modelSlug}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Key ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });
  if (!submitRes.ok) {
    const body = (await submitRes.text()).slice(0, 800);
    throw new FalSeedanceError(
      `fal submit failed (${submitRes.status}) — ${body || '<empty body>'}`,
      submitRes.status,
      body,
    );
  }
  const submitJson = (await submitRes.json()) as QueueSubmitResponse;
  if (!submitJson.request_id) {
    throw new FalSeedanceError(
      `fal submit returned no request_id: ${JSON.stringify(submitJson).slice(0, 400)}`,
    );
  }

  // fal's returned URLs are authoritative — they handle the parent-truncation
  // quirk internally. Fallback construction only if fal omits them.
  const statusUrl =
    submitJson.status_url ?? `${QUEUE_BASE}/${modelSlug}/requests/${submitJson.request_id}/status`;
  const resultUrl =
    submitJson.response_url ?? `${QUEUE_BASE}/${modelSlug}/requests/${submitJson.request_id}`;

  const finalStatus = await pollUntilDone(apiKey, statusUrl);

  // Some fal models return the full result inline in the COMPLETED status
  // payload; Seedance 2.0 (as of probe 2026-05-13) requires a separate GET on
  // response_url. Try inline first.
  let videoUrl = extractVideoUrl(finalStatus);
  if (!videoUrl) {
    const fres = await fetch(resultUrl, {
      headers: { Authorization: `Key ${apiKey}` },
    });
    if (!fres.ok) {
      const body = (await fres.text()).slice(0, 800);
      throw new FalSeedanceError(
        `fal result fetch failed (${fres.status}) — ${body}`,
        fres.status,
        body,
      );
    }
    const result = (await fres.json()) as SeedanceResultPayload;
    videoUrl = extractVideoUrl(result);
  }
  if (!videoUrl) {
    throw new FalSeedanceError('fal result missing video.url — schema mismatch');
  }

  const vres = await fetch(videoUrl);
  if (!vres.ok) {
    throw new FalSeedanceError(
      `Video download failed (${vres.status}) from ${videoUrl}`,
      vres.status,
    );
  }
  const mp4Bytes = new Uint8Array(await vres.arrayBuffer());

  const { width, height } = dimensionsFor(aspectRatio);
  const cost = durationSeconds * COST_USD_PER_SECOND[quality];
  const provider: FalSeedanceResult['provider'] = imageUrl
    ? 'seedance-fal-img2vid'
    : 'seedance-fal';

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
    operation_name: submitJson.request_id,
    model_id: modelSlug,
  };
}

/** Exposed for downstream consumers (e.g. UI cost preview, capability
 *  inspection). Mirror `COST_USD_PER_SECOND` from veo-gemini.ts. */
export const SEEDANCE_COST_USD_PER_SECOND: Readonly<Record<FalSeedanceQualityTier, number>> =
  COST_USD_PER_SECOND;
