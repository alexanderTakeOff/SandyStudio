// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/runners/copywriter.ts
// EXEC-COPY — produces YouTube-ready metadata (title, description, tags, hook).
// Honours specs/contracts/copywriter@v1.yaml. Uses Haiku — cheap and fast.
// ──────────────────────────────────────────────────────────────────────────────

import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  generateAnthropicText,
  AnthropicTextError,
  type AnthropicTextResult,
} from '../providers/anthropic-text';
import type { SeriesBibleCanon } from '../bible-loader';
import type { AgentInputs } from '../types';
import { findApprovedAsset } from '../upstream';

export const COPY_CONTRACT = 'copywriter@v1';
export const COPY_MODEL = 'claude-haiku-4-5';
export const COPY_MAX_TOKENS = 1500;

export class CopywriterError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'CopywriterError';
  }
}

export interface CopywriterRunResult {
  markdown: string;
  body: Record<string, unknown>;
  costUsd: number;
  model: string;
  contract: typeof COPY_CONTRACT;
  description: string;
}

interface UpstreamAssetLike {
  id?: string;
  file_type?: string | null;
  status?: string | null;
  content?: string | null;
  version?: number | null;
}

let systemPromptCache: string | null = null;

async function loadSystemPrompt(): Promise<string> {
  if (systemPromptCache !== null) return systemPromptCache;
  const candidates = [
    path.resolve(process.cwd(), '../agents/exec/copywriter.md'),
    path.resolve(process.cwd(), 'agents/exec/copywriter.md'),
    path.resolve(process.cwd(), '../../agents/exec/copywriter.md'),
  ];
  for (const p of candidates) {
    try {
      const text = await fs.readFile(p, 'utf-8');
      systemPromptCache = text;
      return text;
    } catch {
      // try next
    }
  }
  systemPromptCache = [
    'You are the Copywriter for an AI animation studio.',
    'You write YouTube-ready metadata: a magnetic title, an SEO description, tags, and a one-line hook.',
    'You stay grounded in the brief and script — do not invent characters or plot points that are not there.',
    'For visual-comedy MVP: keep it punchy, no spoilers, no spammy keyword stuffing.',
  ].join('\n');
  return systemPromptCache;
}

// F2 (2026-06-12): findApprovedAsset → shared newest-wins resolver
// (lib/agents/upstream.ts; was a local copy, one of ten).

function buildUserMessage(args: {
  episodeCode: string;
  episodeTitle: string;
  briefContent: string;
  scriptContent: string;
  bible: SeriesBibleCanon;
}): string {
  const { episodeCode, episodeTitle, briefContent, scriptContent, bible } = args;
  const styleToneBlock =
    bible.styles.length > 0
      ? [
          '## Series style direction (tone reference)',
          '',
          'Match the voice/tone of this style direction — it is the LOCKED canonical aesthetic for the whole series. Title, description, and hook should feel native to this tone.',
          '',
          ...bible.styles.flatMap((s) => [
            `### ${s.slug}`,
            '',
            s.description,
            s.content && s.content !== s.description ? s.content : '',
            '',
          ]),
        ]
          .filter(Boolean)
          .join('\n')
      : '';
  return [
    '# Task',
    `Write YouTube-ready metadata for episode ${episodeCode} — "${episodeTitle}".`,
    '',
    '## Brief (canonical)',
    '<brief>',
    briefContent,
    '</brief>',
    '',
    '## Script (final structure)',
    '<script>',
    scriptContent,
    '</script>',
    '',
    styleToneBlock,
    '',
    '## Output format',
    'Markdown:',
    '```',
    '# Metadata — <episode>',
    '## Title',
    '<one short title>',
    '## Description',
    '<2-3 short paragraphs, last paragraph optionally CTA-light>',
    '## Tags',
    '<comma-separated tags>',
    '## Hook',
    '<single-line opening line for shorts/social>',
    '```',
    '',
    'Then exactly one fenced JSON block:',
    '```json',
    '{',
    `  "episode_id": "${episodeCode}",`,
    '  "title": "<≤70 chars>",',
    '  "description": "<≤500 chars, multi-line allowed via \\n>",',
    '  "tags": ["<10-15 specific tags>"],',
    '  "hook": "<one line>",',
    '  "hashtags": ["#<3-5 tags>"]',
    '}',
    '```',
    '',
    'Hard rules:',
    '- Title ≤ 70 chars and includes the hero name when natural.',
    '- Description grounded in the brief premise, no invented spoilers.',
    '- Tags: lowercase, no spaces inside multi-word (use dashes).',
    '- The fenced JSON must be valid JSON.',
  ].join('\n');
}

export interface CopywriterRunArgs {
  inputs: AgentInputs;
}

export async function runCopywriter(
  args: CopywriterRunArgs,
): Promise<CopywriterRunResult> {
  const { inputs } = args;

  const ep = inputs.episode as
    | { episode_code?: string; title_working?: string | null }
    | undefined;
  const episodeCode = ep?.episode_code ?? 'UNKNOWN';
  const episodeTitle = ep?.title_working ?? 'Untitled';

  const upstream = inputs.upstream_assets as readonly UpstreamAssetLike[] | undefined;
  const briefAsset = findApprovedAsset(upstream, 'SPC-brief');
  if (!briefAsset?.content) {
    throw new CopywriterError(`Precondition failed: APPROVED SPC-brief not found`);
  }
  const scriptAsset = findApprovedAsset(upstream, 'SCR-script');
  if (!scriptAsset?.content) {
    throw new CopywriterError(`Precondition failed: APPROVED SCR-script not found`);
  }

  const bible = (inputs.bible as SeriesBibleCanon | undefined) ?? {
    series_id: null,
    general_idea: null,
    characters: [],
    locations: [],
    styles: [],
    total_entries: 0,
  };

  const systemPrompt = await loadSystemPrompt();
  const userMessage = buildUserMessage({
    episodeCode,
    episodeTitle,
    briefContent: briefAsset.content,
    scriptContent: scriptAsset.content,
    bible,
  });

  let result: AnthropicTextResult;
  try {
    result = await generateAnthropicText({
      systemPrompt,
      userMessage,
      model: COPY_MODEL,
      maxOutputTokens: COPY_MAX_TOKENS,
      expectsJson: true,
    });
  } catch (err: unknown) {
    if (err instanceof AnthropicTextError) {
      throw new CopywriterError(`Anthropic call failed: ${err.message}`, err);
    }
    throw err;
  }

  if (!result.body) throw new CopywriterError('No JSON block in response');

  const description = `Produced by EXEC-COPY · ${COPY_CONTRACT} · ${result.model} · cost $${result.costUsd.toFixed(4)} · ${result.usage.inputTokens}→${result.usage.outputTokens} tokens`;

  return {
    markdown: result.markdown,
    body: result.body,
    costUsd: result.costUsd,
    model: result.model,
    contract: COPY_CONTRACT,
    description,
  };
}
