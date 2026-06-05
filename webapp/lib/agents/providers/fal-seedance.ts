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

export type FalSeedanceAspectRatio = '16:9' | '9:16' | '1:1' | '21:9' | '4:3' | '3:4' | 'auto';
export type FalSeedanceQualityTier = 'standard' | 'fast';
export type FalSeedanceResolution = '480p' | '720p' | '1080p';

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
  /**
   * Output resolution. Default '720p'. '1080p' costs ~2.25× more per second
   * (Seedance pricing scales with pixel count). Sprint β 2026-05-14.
   */
  resolution?: FalSeedanceResolution;
  /**
   * Reproducibility seed. Integer. Minor variation may still occur per fal
   * docs, but identical (prompt, image, seed) tends to render very close.
   * Sprint β 2026-05-14 — Director directive "волшебный параметр SEED".
   */
  seed?: number;
  /**
   * Optional end frame (base64). When set, Seedance smoothly transitions
   * from the start image to this end image over the requested duration.
   * Useful for camera tightening / character entering frame / etc.
   * Sprint β 2026-05-14.
   */
  endImageBase64?: string;
  endImageMime?: 'image/png' | 'image/jpeg';
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

/**
 * Signature of a fal "out of money / account locked" rejection. fal returns a
 * 403 whose body reads e.g. {"detail":"User is locked. Reason: Exhausted
 * balance. Top up your balance at fal.ai/dashboard/billing."}. This is a
 * TERMINAL condition — retrying just burns the retry budget and leaks pre-spend
 * reservations (observed 2026-06-05: ~$11 phantom on 3× retries of a locked
 * account). Detect by text so it survives error-wrapping (MultiVideoGenError).
 * Shared by every fal provider (seedance / flux / upscale / ideogram) — same
 * `Authorization: Key` + same 403 body.
 */
export function isFalBalanceLock(text: string | null | undefined): boolean {
  if (!text) return false;
  return /exhausted balance|user is locked|account is locked|insufficient.{0,12}balance/i.test(
    text,
  );
}

/** Typed terminal error for a fal balance-lock (403). Callers map this to a
 *  NonRetriableError so Inngest does not retry a provider that has no funds. */
export class FalBalanceError extends FalSeedanceError {
  readonly isBalanceLock = true as const;
  constructor(message: string, status: number | null = null, body: string | null = null) {
    super(message, status, body);
    this.name = 'FalBalanceError';
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

// Resolution cost multiplier (Sprint β 2026-05-14). Baseline is 720p (mult=1).
// 480p uses ~half the pixels → ~0.55×. 1080p uses ~2.25× the pixels.
// Tune against real billing data; this is the rough first-order model.
export const SEEDANCE_RESOLUTION_COST_MULT: Readonly<Record<FalSeedanceResolution, number>> = {
  '480p': 0.55,
  '720p': 1.0,
  '1080p': 2.25,
};

// Aspect ratios that don't have a canonical pixel grid (21:9 / 4:3 / 3:4 /
// auto) are reported using their nearest-neighbour 16:9 / 9:16 dimensions
// scaled by resolution — refined when we receive the real fal manifest.
function dimensionsFor(
  aspect: FalSeedanceAspectRatio,
  resolution: FalSeedanceResolution,
): { width: number; height: number } {
  // Base shapes at 720p, then scale by the resolution short-edge ratio.
  const SHORT_EDGE: Record<FalSeedanceResolution, number> = { '480p': 480, '720p': 720, '1080p': 1080 };
  const short = SHORT_EDGE[resolution];
  switch (aspect) {
    case '16:9':
      return { width: Math.round((short * 16) / 9), height: short };
    case '9:16':
      return { width: short, height: Math.round((short * 16) / 9) };
    case '1:1':
      return { width: short, height: short };
    case '21:9':
      return { width: Math.round((short * 21) / 9), height: short };
    case '4:3':
      return { width: Math.round((short * 4) / 3), height: short };
    case '3:4':
      return { width: short, height: Math.round((short * 4) / 3) };
    case 'auto':
      // Fall back to 16:9 dimensions; fal will infer from the reference image.
      return { width: Math.round((short * 16) / 9), height: short };
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

  const resolution: FalSeedanceResolution = input.resolution ?? '720p';
  const endImageUrl = input.endImageBase64
    ? `data:${input.endImageMime ?? 'image/png'};base64,${input.endImageBase64}`
    : undefined;

  const payload: Record<string, unknown> = {
    prompt: input.prompt,
    duration: String(durationSeconds),
    aspect_ratio: aspectRatio,
    resolution,
    // Audio handled by EXEC-MGEN (SUNO) + EXEC-STITCH (ffmpeg mux), never the
    // video provider. Inline Seedance audio would clash with the music track.
    generate_audio: false,
  };
  if (imageUrl) payload.image_url = imageUrl;
  if (endImageUrl) payload.end_image_url = endImageUrl;
  if (typeof input.seed === 'number' && Number.isFinite(input.seed)) {
    payload.seed = Math.trunc(input.seed);
  }

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
    const message = `fal submit failed (${submitRes.status}) — ${body || '<empty body>'}`;
    if (submitRes.status === 403 && isFalBalanceLock(body)) {
      // Out of money / locked account — terminal, do NOT retry.
      throw new FalBalanceError(message, submitRes.status, body);
    }
    throw new FalSeedanceError(message, submitRes.status, body);
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

  const { width, height } = dimensionsFor(aspectRatio, resolution);
  // Resolution multiplier — Seedance pricing scales roughly with pixel
  // count: 480p ≈ 0.55×, 720p = 1× (baseline), 1080p ≈ 2.25×.
  const resolutionMult = SEEDANCE_RESOLUTION_COST_MULT[resolution];
  const cost = durationSeconds * COST_USD_PER_SECOND[quality] * resolutionMult;
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
