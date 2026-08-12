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
} from '../../providers/anthropic-text';
import type { SeriesBibleCanon } from '../bible-loader';
import type { AgentInputs } from '../types';
import type { CopyBranding } from '../../branding';
import { findApprovedAsset } from '../upstream';

export const COPY_CONTRACT = 'copywriter@v1';
// 2026-07-11 (Director): bumped Haiku → Sonnet. Haiku echoed the prompt's own
// principles into the `title` field — the published title read "Principle: Lead
// with the universal situation… Avoid <name>" (the guidance, not a headline).
// The publicist copy is distribution-facing and instruction-heavy; Sonnet follows
// the "apply, don't restate" contract reliably. One call per episode → cost
// negligible. TODO: surface this as an app_config override in Provider Settings
// (reuse the ConciergePolinaRow pattern) so it's not hardcoded.
export const COPY_MODEL = 'claude-sonnet-4-6';
// 2026-07-05: raised 1500 → 4000. The publicist's SEO-first copy JSON grew past
// ~1500 output tokens and was truncated mid-block (stop_reason=max_tokens, no
// closing ```json fence) → hard parse failure on every run. 4000 gives ~2.6×
// headroom; Haiku output is cheap so the extra budget is negligible.
export const COPY_MAX_TOKENS = 4000;

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
  branding?: CopyBranding | null;
}): string {
  const { episodeCode, episodeTitle, briefContent, scriptContent, bible, branding } = args;
  // Multi-channel Phase 4c: the publicist finally knows WHICH channel it writes
  // for. Data-driven (series → channel cascade) — absent facts are simply not
  // mentioned, never invented.
  const channelBlock = branding && (branding.channelName || branding.subscribeCta || branding.boilerplate)
    ? [
        '## Channel (distribution facts — use, do not invent)',
        '',
        branding.channelName ? `- Channel name: ${branding.channelName}` : '',
        branding.boilerplate
          ? `- Standing boilerplate — include it near the END of the description, verbatim: "${branding.boilerplate}"`
          : '',
        branding.subscribeCta
          ? `- Subscribe CTA — the description's LAST line, verbatim: "${branding.subscribeCta}"`
          : '',
        '',
      ]
        .filter(Boolean)
        .join('\n')
    : '';
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
    channelBlock,
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
    '- The `title` value is the FINAL published headline ONLY — the exact text a viewer sees on YouTube. NEVER restate a principle, rule, instruction, or your own reasoning in it (e.g. never output "Principle: …", "Lead with the situation…", or "Avoid <name>" as the title). Apply the principles silently; print only the headline.',
    '- Title ≤ 70 chars and includes the hero name when natural.',
    '- Description grounded in the brief premise, no invented spoilers.',
    '- Tags: lowercase, no spaces inside multi-word (use dashes).',
    '- The fenced JSON must be valid JSON.',
  ].join('\n');
}

export interface CopywriterRunArgs {
  inputs: AgentInputs;
  /** Channel/series copy branding (Phase 4c) — loaded by the caller from the
   * episode cascade; optional so tests/mocks stay unchanged. */
  branding?: CopyBranding | null;
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
    branding: args.branding ?? null,
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
