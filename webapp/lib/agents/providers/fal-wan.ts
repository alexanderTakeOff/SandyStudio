// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/providers/fal-wan.ts
// Wan 2.6 Flash image-to-video via fal.ai queue REST API.
//
// Cheap debug / iteration tier: ~$0.05/s vs Seedance ~$0.24/s (5× cheaper).
// Same FAL_KEY as fal-seedance / fal-ideogram / upscale-fal — no new secrets.
//
// Endpoint pattern (identical to fal-seedance + fal-ideogram):
//   POST queue.fal.run/<slug>  → { request_id, status_url, response_url }
//   GET  status_url             → poll until COMPLETED
//   GET  response_url           → { video: { url } } → download MP4
//
// Reuses isFalBalanceLock + FalBalanceError from fal-seedance (same fal 403
// body format across all fal providers).
// ──────────────────────────────────────────────────────────────────────────────

import { isFalBalanceLock, FalBalanceError } from './fal-seedance';

const QUEUE_BASE = 'https://queue.fal.run';
const SLUG = 'wan/v2.6/image-to-video/flash';
const POLL_INTERVAL_MS = 4_000;
const MAX_WAIT_MS = 10 * 60 * 1000; // Wan Flash typically 30-90s; generous headroom.

// Approximate cost per output second at 720p flash tier (fal pricing 2026-06).
const COST_USD_PER_SECOND = 0.05;

export type WanAspectRatio = '16:9' | '9:16' | '1:1' | '4:3' | '3:4';
export type WanDuration = 5 | 10 | 15;

export interface FalWanInput {
  prompt: string;
  /** Default 5. Wan 2.6 supports 5 / 10 / 15 second clips. */
  durationSeconds?: WanDuration;
  aspectRatio?: WanAspectRatio;
  /** Start-frame reference for image-to-video. Inline base64 PNG/JPEG. */
  referenceImageBase64?: string;
  referenceImageMime?: 'image/png' | 'image/jpeg';
}

export interface FalWanResult {
  status: 'success';
  provider: 'wan-26-flash';
  format: 'MP4';
  width: number;
  height: number;
  duration_seconds: number;
  size_bytes: number;
  mp4_b64: string;
  cost_usd: number;
  model_id: string;
  operation_name: string;
}

export class FalWanError extends Error {
  constructor(
    message: string,
    public readonly status: number | null = null,
    public readonly body: string | null = null,
  ) {
    super(message);
    this.name = 'FalWanError';
  }
}

function dimensionsFor(aspect: WanAspectRatio): { width: number; height: number } {
  switch (aspect) {
    case '16:9': return { width: 1280, height: 720 };
    case '9:16': return { width: 720, height: 1280 };
    case '1:1':  return { width: 720, height: 720 };
    case '4:3':  return { width: 960, height: 720 };
    case '3:4':  return { width: 720, height: 960 };
  }
}

interface QueueSubmitResponse {
  request_id: string;
  status_url?: string;
  response_url?: string;
}
interface QueueStatusResponse {
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
}
interface WanOutput {
  video?: { url?: string };
}

async function pollUntilDone(apiKey: string, statusUrl: string): Promise<void> {
  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    const res = await fetch(statusUrl, { headers: { Authorization: `Key ${apiKey}` } });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 600);
      throw new FalWanError(`fal Wan status poll failed (${res.status})`, res.status, body);
    }
    const json = (await res.json()) as QueueStatusResponse;
    if (json.status === 'COMPLETED') return;
    if (json.status === 'FAILED' || json.status === 'CANCELLED') {
      throw new FalWanError(`fal Wan request terminated status=${json.status}`, null, JSON.stringify(json).slice(0, 400));
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new FalWanError(`fal Wan polling timed out after ${MAX_WAIT_MS / 1000}s`);
}

export async function generateVideoFalWan(input: FalWanInput): Promise<FalWanResult> {
  const apiKey = (process.env.FAL_KEY ?? process.env.FAL_AI_KEY)?.trim();
  if (!apiKey) throw new FalWanError('FAL_KEY is not set');

  const duration: WanDuration = input.durationSeconds ?? 5;
  const aspect: WanAspectRatio = input.aspectRatio ?? '16:9';
  const dims = dimensionsFor(aspect);

  const payload: Record<string, unknown> = {
    prompt: input.prompt,
    duration: duration,
    aspect_ratio: aspect,
  };
  if (input.referenceImageBase64 && input.referenceImageMime) {
    payload.image_url = `data:${input.referenceImageMime};base64,${input.referenceImageBase64}`;
  }

  const submitRes = await fetch(`${QUEUE_BASE}/${SLUG}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Key ${apiKey}` },
    body: JSON.stringify(payload),
  });
  if (!submitRes.ok) {
    const body = (await submitRes.text()).slice(0, 800);
    if (isFalBalanceLock(body)) {
      throw new FalBalanceError(`fal balance lock (Wan 2.6 Flash)`, submitRes.status, body);
    }
    throw new FalWanError(`fal Wan submit failed (${submitRes.status}) — ${body || '<empty>'}`, submitRes.status, body);
  }
  const submit = (await submitRes.json()) as QueueSubmitResponse;
  const { request_id, status_url, response_url } = submit;
  if (!status_url || !response_url) {
    throw new FalWanError('fal Wan submit returned no status_url/response_url', null, JSON.stringify(submit).slice(0, 400));
  }

  await pollUntilDone(apiKey, status_url);

  const resultRes = await fetch(response_url, { headers: { Authorization: `Key ${apiKey}` } });
  if (!resultRes.ok) {
    throw new FalWanError(`fal Wan result fetch failed (${resultRes.status})`, resultRes.status, (await resultRes.text()).slice(0, 600));
  }
  const out = (await resultRes.json()) as WanOutput;
  const videoUrl = out.video?.url;
  if (!videoUrl) {
    throw new FalWanError('fal Wan response had no video url', null, JSON.stringify(out).slice(0, 400));
  }

  const vidRes = await fetch(videoUrl);
  if (!vidRes.ok) throw new FalWanError(`Wan video download failed (${vidRes.status})`, vidRes.status);
  const buf = Buffer.from(await vidRes.arrayBuffer());

  return {
    status: 'success',
    provider: 'wan-26-flash',
    format: 'MP4',
    width: dims.width,
    height: dims.height,
    duration_seconds: duration,
    size_bytes: buf.byteLength,
    mp4_b64: buf.toString('base64'),
    cost_usd: COST_USD_PER_SECOND * duration,
    model_id: SLUG,
    operation_name: request_id,
  };
}
