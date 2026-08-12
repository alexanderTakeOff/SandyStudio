// ──────────────────────────────────────────────────────────────────────────────
// lib/providers/gemini-flash-image.ts
// Gemini 2.5 Flash Image via Google Generative Language REST API.
//
// Free tier (2026): 500 images/day, 2 img/min — $0 for pipeline debugging.
// Uses the same GEMINI_API_KEY already in env for Veo 3.1 — no new secrets.
//
// Endpoint:
//   POST https://generativelanguage.googleapis.com/v1beta/models/<model>
//        :generateContent?key=<GEMINI_API_KEY>
//
// References: passed as inlineData parts before the text prompt. Gemini attends
// to preceding image parts when generating, so refs come first. Max 4 refs
// (safe cap; Gemini supports more but quality degrades with many anchors on a
// non-finetuned model — identity consistency is worse than gpt-image-1 edits,
// which is fine for pipeline testing where throughput > quality).
//
// Override model via GEMINI_FLASH_IMAGE_MODEL env if fal renames the preview.
// ──────────────────────────────────────────────────────────────────────────────

import type { MultiImageGenProvider, MultiImageGenInput, MultiImageGenResult } from './image-gen-multi';
import { MultiImageGenError } from './image-gen-multi';
import { fetchWithTimeout, FETCH_TIMEOUTS } from './fetch-with-timeout';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
// 2026-06-11 live-verified: the image-capable model is `gemini-2.5-flash-image`
// (the "Nano Banana" image model). The previously shipped
// `gemini-2.5-flash-preview-05-20` is a TEXT preview and returns
// "not supported for generateContent". Override via GEMINI_FLASH_IMAGE_MODEL.
// Newer options seen in ListModels: gemini-3.1-flash-image, gemini-3-pro-image.
const DEFAULT_MODEL = 'gemini-2.5-flash-image';

function getModel(): string {
  return process.env.GEMINI_FLASH_IMAGE_MODEL?.trim() || DEFAULT_MODEL;
}

// ── Internal REST types ───────────────────────────────────────────────────────

interface GeminiInlinePart { inlineData: { mimeType: string; data: string } }
interface GeminiTextPart { text: string }
type GeminiPart = GeminiInlinePart | GeminiTextPart;

interface GeminiRequest {
  contents: Array<{ parts: GeminiPart[] }>;
  generationConfig: {
    responseModalities: string[];
    imageConfig?: { aspectRatio: string };
  };
}

interface GeminiResponsePart {
  inlineData?: { mimeType?: string; data?: string };
  text?: string;
}
interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: GeminiResponsePart[] } }>;
  error?: { message?: string; code?: number };
}

// Nominal dimensions for size-hint reporting — FALLBACK ONLY when the actual
// PNG header can't be parsed. Real dims come from parsePngDims (E07 smoke
// 2026-06-11: Gemini ignored the hint and returned 1024×1024 while metadata
// claimed 1536×1024 — never report dimensions we didn't verify).
const SIZE_DIMS: Record<string, { width: number; height: number }> = {
  '1024x1024': { width: 1024, height: 1024 },
  '1024x1536': { width: 1024, height: 1536 },
  '1536x1024': { width: 1536, height: 1024 },
  '2048x2048': { width: 2048, height: 2048 },
  '2752x1536': { width: 2752, height: 1536 },
  '1536x2752': { width: 1536, height: 2752 },
};

// Size keys encode the DELIVERY aspect (landscape / portrait / square — see
// SIZE_BY_DELIVERY_TARGET), not gpt-image-2 pixel counts. Gemini accepts a
// native aspectRatio, so map by orientation: landscape → 16:9, portrait → 9:16
// (the delivery targets behind these keys are YouTube landscape / Shorts).
const ASPECT_BY_SIZE: Record<string, string> = {
  '1024x1024': '1:1',
  '2048x2048': '1:1',
  '1536x1024': '16:9',
  '2752x1536': '16:9',
  '1024x1536': '9:16',
  '1536x2752': '9:16',
};

/** Width/height from the PNG IHDR chunk (bytes 16-23 after the signature). */
function parsePngDims(b64: string): { width: number; height: number } | null {
  try {
    const head = Buffer.from(b64.slice(0, 48), 'base64');
    if (head.length < 24 || head.readUInt32BE(0) !== 0x89504e47) return null;
    const width = head.readUInt32BE(16);
    const height = head.readUInt32BE(20);
    if (width === 0 || height === 0) return null;
    return { width, height };
  } catch {
    return null;
  }
}

// ── Provider implementation ───────────────────────────────────────────────────

async function generate(input: MultiImageGenInput): Promise<MultiImageGenResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new MultiImageGenError('GEMINI_API_KEY is not set', 'gemini-flash-image');

  const model = getModel();
  const parts: GeminiPart[] = [];

  // References before the text prompt (up to 4 — caps at provider capability).
  for (const ref of input.references.slice(0, 4)) {
    parts.push({ inlineData: { mimeType: 'image/png', data: ref.image_b64 } });
  }
  parts.push({ text: input.prompt });

  const size = input.size ?? '1024x1024';
  const aspectRatio = ASPECT_BY_SIZE[size] ?? '1:1';
  const body: GeminiRequest = {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ['IMAGE', 'TEXT'],
      imageConfig: { aspectRatio },
    },
  };

  const res = await fetchWithTimeout(
    `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
    FETCH_TIMEOUTS.IMAGE_API_MS,
  );

  const json = (await res.json()) as GeminiResponse;
  if (!res.ok || json.error) {
    const msg = json.error?.message ?? `HTTP ${res.status}`;
    throw new MultiImageGenError(`Gemini Flash Image failed: ${msg}`, 'gemini-flash-image');
  }

  const imgPart = json.candidates?.[0]?.content?.parts
    ?.find((p): p is GeminiResponsePart & { inlineData: NonNullable<GeminiResponsePart['inlineData']> } =>
      Boolean(p.inlineData?.data),
    );
  const b64 = imgPart?.inlineData?.data;
  if (!b64) {
    throw new MultiImageGenError(
      'Gemini Flash Image returned no image data',
      'gemini-flash-image',
    );
  }

  const dims = parsePngDims(b64) ?? SIZE_DIMS[size] ?? SIZE_DIMS['1024x1024'];

  return {
    b64_data: b64,
    cost_usd: 0, // free-tier (500 img/day); on pay tier ~$0.039/image
    width: dims.width,
    height: dims.height,
    provider_id: 'gemini-flash-image',
    model,
  };
}

export const geminiFlashImageProvider: MultiImageGenProvider = {
  id: 'gemini-flash-image',
  capabilities: {
    max_references: 4,
    supports_strength: false,
    supports_per_ref_weight: false,
    default_strength: 0,
  },
  generate,
};
