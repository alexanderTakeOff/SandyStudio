// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/providers/anthropic-vision.ts
// Anthropic Claude vision adapter — text + base64-PNG image blocks.
//
// Used by EXEC-EREF-CHECK to score generated EREF images against the shot's
// test plan + Bible character/style references. Sonnet 4.6 is multimodal —
// it can compare reference images and the candidate image in a single call.
//
// Shares the system-prompt + JSON-block + cost-computation pattern with
// anthropic-text.ts; differs only in the user-message construction (mixed
// text/image content blocks instead of a single string).
// ──────────────────────────────────────────────────────────────────────────────

import Anthropic from '@anthropic-ai/sdk';
import {
  AnthropicTextError,
  computeCostUsd,
  extractLastJsonBlock,
  type AnthropicTextResult,
} from './anthropic-text';

export interface VisionImage {
  /** Base64-encoded image (no `data:` prefix). */
  base64: string;
  /** Optional caption shown to the model right before the image — useful
   *  for telling Claude WHY this image is here ("This is the Bible LOCKED
   *  reference for sandy_hourglass — identity anchor."). */
  caption?: string;
  /** MIME type, defaults to 'image/png'. */
  mediaType?: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
}

export interface AnthropicVisionInput {
  systemPrompt: string;
  /** Optional opening text — usually the task description. */
  leadText?: string;
  /** Images to attach, in order. Empty array is allowed (degenerates to text). */
  images: VisionImage[];
  /** Optional closing text — usually instructions about output format. */
  trailText?: string;
  model: string;
  maxOutputTokens?: number;
  expectsJson?: boolean;
}

export async function generateAnthropicVision(
  input: AnthropicVisionInput,
): Promise<AnthropicTextResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new AnthropicTextError('ANTHROPIC_API_KEY is not set');
  }

  const client = new Anthropic({ apiKey });
  const maxTokens = input.maxOutputTokens ?? 4000;

  // Compose multipart user message: optional lead text → image blocks (with
  // their captions inline) → optional trail text. Anthropic SDK accepts an
  // array of content blocks for the `user` role.
  const blocks: Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> = [];
  if (input.leadText && input.leadText.trim()) {
    blocks.push({ type: 'text', text: input.leadText });
  }
  for (const img of input.images) {
    if (img.caption && img.caption.trim()) {
      blocks.push({ type: 'text', text: img.caption });
    }
    blocks.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: img.mediaType ?? 'image/png',
        data: img.base64,
      },
    });
  }
  if (input.trailText && input.trailText.trim()) {
    blocks.push({ type: 'text', text: input.trailText });
  }

  if (blocks.length === 0) {
    throw new AnthropicTextError('Vision call has no content (need at least one image or text block)');
  }

  let response: Awaited<ReturnType<typeof client.messages.create>>;
  try {
    response = await client.messages.create({
      model: input.model,
      max_tokens: maxTokens,
      system: input.systemPrompt,
      messages: [{ role: 'user', content: blocks }],
    });
  } catch (err: unknown) {
    throw new AnthropicTextError(
      `Anthropic vision call failed: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }

  const markdown = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

  if (!markdown) {
    throw new AnthropicTextError(
      `Empty vision response from ${input.model} (stop_reason=${response.stop_reason ?? 'unknown'})`,
    );
  }

  let body: Record<string, unknown> | null = null;
  if (input.expectsJson) {
    body = extractLastJsonBlock(markdown);
    if (!body) {
      throw new AnthropicTextError(
        `Vision call: expected fenced \`\`\`json block but none parsed (stop_reason=${response.stop_reason ?? 'unknown'}, output ${markdown.length} chars)`,
      );
    }
  }

  const usage = {
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
  };

  return {
    markdown,
    body,
    costUsd: computeCostUsd(usage, input.model),
    model: input.model,
    stopReason: response.stop_reason ?? null,
    usage,
  };
}
