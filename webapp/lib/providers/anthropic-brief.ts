// ──────────────────────────────────────────────────────────────────────────────
// lib/providers/anthropic-brief.ts
// Episode Brief generator using Anthropic Claude Haiku 4.5.
//
// Phase 5d UX-fix (2026-04-30): NewEpisodeModal collects 6 fields. POST
// /api/episodes builds a deterministic markdown template (instant) AND fires
// this generator (~3s, ~$0.001) to produce a richer AI brief. Template is
// the safety net — if Claude errors, the brief still has structured content
// and Director can edit/extend in CodeMirror.
//
// Reuse pattern: Phase 2 (Concierge tools) will call generateBriefMarkdown
// from a `create_episode_with_brief` tool — same engine, conversational
// entry point.
// ──────────────────────────────────────────────────────────────────────────────

import Anthropic from '@anthropic-ai/sdk';

import { anthropicTimeoutMs, computeCostUsd } from './anthropic-text';

export interface BriefInput {
  episodeCode: string; // e.g. "SS-S01-E05"
  episodeTitle?: string | null;
  premise: string;
  runtimeSeconds?: number | null;
  seriesContext?: { code: string; title: string };
}

export class AnthropicBriefError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'AnthropicBriefError';
  }
}

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 1500;
// Approximate cost — Haiku 4.5 input ~$0.80/M, output ~$4/M tokens.
// A typical brief: ~500 input + 600 output tokens → ~$0.003.
const ESTIMATED_COST_USD = 0.003;

export const briefGenerationCostEstimate = ESTIMATED_COST_USD;

function buildPrompt(input: BriefInput): string {
  const seriesLine = input.seriesContext
    ? `${input.seriesContext.code} — "${input.seriesContext.title}"`
    : '(no series context yet)';
  const titleLine = input.episodeTitle
    ? `${input.episodeCode} — "${input.episodeTitle}"`
    : input.episodeCode;
  const runtime = input.runtimeSeconds ?? 60;

  return [
    'You are a TV-series production assistant. Write a clear, structured Episode Brief in markdown.',
    'This brief is the canonical source of truth that the Screenwriter agent (EXEC-SW) will read to generate the script.',
    '',
    `Episode: ${titleLine}`,
    `Series: ${seriesLine}`,
    `Target runtime: ${runtime} seconds`,
    '',
    `Director's premise:`,
    input.premise,
    '',
    'Write the brief as markdown with these sections in order:',
    '',
    '# Episode Brief — <episode code> "<title or short hook>"',
    '',
    '## Logline',
    'One concise sentence (<=20 words) that captures the conflict.',
    '',
    '## Premise',
    "Director's input expanded into 2-3 short paragraphs. Don't invent characters or plot beats beyond what the premise implies — clarify, don't extend.",
    '',
    '## Setting & atmosphere',
    'Location, time of day, mood, sensory texture (1 paragraph).',
    '',
    '## Key beats',
    '3-5 bullets that form the story spine — beginning, midpoint, end. Each bullet is one short line.',
    '',
    '## Characters in this episode',
    'List the characters explicitly named or implied by the premise. For each: one line of who they are + their function in the story.',
    '',
    '## Tone & style notes',
    'Comedy register, pacing, visual style cues (1 paragraph).',
    '',
    '## Runtime',
    `${runtime} seconds`,
    '',
    'Constraints:',
    "- Stay grounded in what the Director said. If something isn't in the premise, mark it `_(TBD by Director)_` instead of inventing.",
    '- Keep the whole brief under 600 words.',
    '- No preamble, no commentary, no markdown code fences around the output. Output the markdown body directly.',
  ].join('\n');
}

export function buildBriefTemplate(input: BriefInput): string {
  const titleLine = input.episodeTitle
    ? `${input.episodeCode} — "${input.episodeTitle}"`
    : input.episodeCode;
  const seriesLine = input.seriesContext
    ? `${input.seriesContext.code} — ${input.seriesContext.title}`
    : '_(no series context)_';
  const runtime = input.runtimeSeconds ?? 60;

  return [
    `# Episode Brief — ${titleLine}`,
    '',
    '## Logline',
    '_(TBD by Director)_',
    '',
    '## Premise',
    input.premise,
    '',
    '## Setting & atmosphere',
    '_(TBD by Director)_',
    '',
    '## Key beats',
    '- _(TBD by Director)_',
    '',
    '## Characters in this episode',
    '_(TBD — see series cast bible when available)_',
    '',
    '## Tone & style notes',
    '_(TBD — see series style bible when available)_',
    '',
    '## Runtime',
    `${runtime} seconds`,
    '',
    `## Series`,
    seriesLine,
    '',
    '---',
    '',
    `_This is a fallback template — Anthropic Claude was unavailable when the episode was created. Edit this brief directly or click "Regenerate" once Claude is reachable._`,
  ].join('\n');
}

/**
 * Priced result of the brief call (2026-07-25). `usage` used to be read off the
 * response and dropped, so the Anthropic call fired on EVERY episode creation
 * never reached budget_log. Small per call (Haiku), but a per-episode spend that
 * the money page cannot see is exactly the leak the Director asked us to close.
 */
export interface BriefMarkdownResult {
  markdown: string;
  costUsd: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export async function generateBriefMarkdown(
  input: BriefInput,
): Promise<BriefMarkdownResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new AnthropicBriefError('ANTHROPIC_API_KEY is not set');
  }

  const client = new Anthropic({ apiKey });
  let response: Awaited<ReturnType<typeof client.messages.create>>;
  try {
    response = await client.messages.create(
      {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: 'user', content: buildPrompt(input) }],
      },
      {
        // D6 (ported 2026-07-14): bound the SDK's 10-minute default timeout so a
        // wedged provider socket can't hang the brief call. Scaled to MAX_TOKENS,
        // same helper the text provider uses.
        timeout: anthropicTimeoutMs(MAX_TOKENS),
        maxRetries: 1,
      },
    );
  } catch (err) {
    throw new AnthropicBriefError(
      `Anthropic call failed: ${(err as Error).message}`,
      err,
    );
  }

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();

  if (!text) {
    throw new AnthropicBriefError(
      `Empty response from ${MODEL} (stop_reason=${response.stop_reason})`,
    );
  }

  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;
  return {
    markdown: text,
    costUsd: computeCostUsd({ inputTokens, outputTokens }, MODEL),
    model: MODEL,
    inputTokens,
    outputTokens,
  };
}
