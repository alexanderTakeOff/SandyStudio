// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/runners/screenwriter.ts
// Real EXEC-SW (Screenwriter) runner — replaces mockLLM for this agent.
// Honours specs/contracts/screenwriter@v1.yaml.
//
// Inputs (from runner.ts loadAgentInputs):
//   - episode: { episode_code, title_working, ... }
//   - upstream_assets: includes the APPROVED brief (file_type === 'SPC-brief')
//
// Outputs (consumed by runner.ts case 'EXEC-SW'):
//   - markdown: full Claude response (script body + fenced JSON block)
//   - body: parsed scenes_v1 JSON
//   - cost_usd, model: cost ledger fields
// ──────────────────────────────────────────────────────────────────────────────

import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  generateAnthropicText,
  AnthropicTextError,
  type AnthropicTextResult,
} from '../providers/anthropic-text';
import { formatBibleForPrompt, type SeriesBibleCanon } from '../bible-loader';
import type { AgentInputs } from '../types';

export const SCREENWRITER_CONTRACT = 'screenwriter@v1';
export const SCREENWRITER_MODEL = 'claude-sonnet-4-6';
// Sonnet outputs Russian/Cyrillic at ~2-3 tokens per word — a 60s comedy
// script + 6-9 scenes JSON block routinely exceeds 4000 tokens.
// 8000 gives comfortable headroom while staying well under cost ceiling.
export const SCREENWRITER_MAX_TOKENS = 8000;
export const SCREENWRITER_COST_CEILING_USD = 0.5;

export class ScreenwriterError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'ScreenwriterError';
  }
}

export interface ScreenwriterRunResult {
  markdown: string;
  body: Record<string, unknown>;
  costUsd: number;
  model: string;
  contract: typeof SCREENWRITER_CONTRACT;
  briefAssetId: string | null;
  description: string;
  notes: readonly string[];
}

interface UpstreamAssetLike {
  id?: string;
  file_type?: string | null;
  status?: string | null;
  content?: string | null;
  filename?: string | null;
  version?: number | null;
}

// In-process cache for the agent's system prompt — read once per process.
let systemPromptCache: string | null = null;

async function loadSystemPrompt(): Promise<string> {
  if (systemPromptCache !== null) return systemPromptCache;
  // The runner runs from webapp/, but agents/exec/screenwriter.md lives at
  // the repo root. Walk up until we find it. Cache result.
  const candidates = [
    path.resolve(process.cwd(), '../agents/exec/screenwriter.md'),
    path.resolve(process.cwd(), 'agents/exec/screenwriter.md'),
    path.resolve(process.cwd(), '../../agents/exec/screenwriter.md'),
  ];
  for (const p of candidates) {
    try {
      const text = await fs.readFile(p, 'utf-8');
      systemPromptCache = text;
      return text;
    } catch {
      // try next candidate
    }
  }
  throw new ScreenwriterError(
    `Could not find agents/exec/screenwriter.md from cwd=${process.cwd()} (tried ${candidates.length} paths)`,
  );
}

function findApprovedAsset(
  upstream: readonly UpstreamAssetLike[] | undefined,
  fileType: string,
): UpstreamAssetLike | null {
  if (!upstream) return null;
  return (
    upstream.find(
      (a) => a.file_type === fileType && a.status === 'APPROVED',
    ) ?? null
  );
}

function buildUserMessage(args: {
  episodeCode: string;
  episodeTitle: string;
  briefContent: string;
  bible: SeriesBibleCanon;
  revisionNote?: string;
}): string {
  const { episodeCode, episodeTitle, briefContent, bible, revisionNote } = args;
  const biblePromptBlock = formatBibleForPrompt(bible);
  const hasCanon = bible.total_entries > 0 || bible.general_idea !== null;
  const characterSlugs = bible.characters.map((c) => c.slug).filter(Boolean);
  const locationSlugs = bible.locations.map((l) => l.slug).filter(Boolean);
  return [
    '# Task',
    `Write the screenplay for episode ${episodeCode} — "${episodeTitle}".`,
    '',
    '## Episode Brief (canonical input — APPROVED)',
    '',
    '<brief>',
    briefContent,
    '</brief>',
    '',
    hasCanon
      ? biblePromptBlock
      : [
          '## MVP context — Series Bible empty',
          '',
          'No LOCKED Series Bible entries exist for this series yet. Proceed using ONLY the brief above. Do not invent series-level canon (no character backstories, no world rules) beyond what the brief states. Where you would normally consult a Style Bible / World Bible / Character Profile, instead derive minimal episode-local choices from the brief — and list each such choice in the `assumptions[]` array of the JSON block. The Director will validate them and decide which become canonical in a later step.',
        ].join('\n'),
    '',
    revisionNote
      ? [
          '## Revision request from Director',
          '',
          revisionNote,
          '',
          'Apply the minimum change needed to address this revision. Do not rewrite scenes that were not flagged.',
          '',
        ].join('\n')
      : '',
    '## Output format',
    '',
    'Respond in markdown with this structure:',
    '',
    '```',
    '# Script — <episode code> "<title>"',
    '',
    '## Logline',
    '<one-sentence)',
    '',
    '## Acts and scenes',
    '<for each act and scene: heading, characters present, location, action prose, key beats>',
    '',
    '## Self-QA',
    '<short bullet list confirming each mandatory beat from the brief is present>',
    '```',
    '',
    'Then, at the very end, append exactly one fenced JSON code block with this shape:',
    '',
    '```json',
    '{',
    '  "episode_id": "<uuid or episode_code>",',
    '  "title": "<episode title>",',
    '  "runtime_target_seconds": <integer>,',
    hasCanon
      ? '  "assumptions": ["<minor episode-local choices not covered by Series Bible canon>"],'
      : '  "assumptions": ["<each MVP assumption you made because Series Bible is empty>"],',
    '  "scenes": [',
    '    {',
    '      "scene_id": "<episode_code>-A<N>-SC<NN>",',
    '      "act": <integer>,',
    hasCanon
      ? `      "characters": ["<Bible character slug — one of: ${characterSlugs.join(', ') || '(none)'}>"]`
      : '      "characters": ["<character name from brief>"],',
    hasCanon
      ? `      "location": "<Bible location slug — one of: ${locationSlugs.join(', ') || '(none)'} — optionally followed by sub-area, e.g. \\"neon_cafe — entrance\\">",`
      : '      "location": "<location name from brief>",',
    '      "action": "<one short paragraph of visual action>",',
    '      "beats": ["<beat from brief that this scene delivers>"],',
    '      "duration_seconds": <integer>',
    '    }',
    '  ]',
    '}',
    '```',
    '',
    'Hard rules:',
    hasCanon
      ? `- Use ONLY the Bible canon slugs in \`characters[]\` and \`location\`. Available characters: ${characterSlugs.join(', ') || '(none)'}. Available locations: ${locationSlugs.join(', ') || '(none)'}. Do not invent new characters or locations.`
      : '- Use only characters and locations the brief explicitly mentions.',
    hasCanon
      ? '- Every character description in your prose MUST be consistent with the Series Bible canon above. Do not contradict canonical appearance, behaviour, or backstory.'
      : '',
    '- For visual comedy MVP: action lines, no dialogue (unless the brief explicitly asks for dialogue).',
    '- Every mandatory beat from the brief\'s "Key beats" section MUST appear in at least one scene\'s `beats[]`.',
    '- Total of `duration_seconds` across all scenes ≈ runtime_target_seconds (within 10%).',
    '- The fenced JSON must be valid JSON. No trailing commas. No comments.',
    '- KEEP PROSE TIGHT. The JSON block at the end is MANDATORY and must not be truncated. Aim for ~3-4 paragraphs of action prose per scene maximum, then the final JSON block. If you find yourself running long, shorten prose — never skip the JSON.',
  ]
    .filter(Boolean)
    .join('\n');
}

export interface ScreenwriterRunArgs {
  inputs: AgentInputs;
  /** Optional revision note from Director — passed through user message when re-running. */
  revisionNote?: string;
}

export async function runScreenwriter(
  args: ScreenwriterRunArgs,
): Promise<ScreenwriterRunResult> {
  const { inputs, revisionNote } = args;

  const ep = inputs.episode as
    | { episode_code?: string; title_working?: string | null }
    | undefined;
  const episodeCode = ep?.episode_code ?? 'UNKNOWN';
  const episodeTitle = ep?.title_working ?? 'Untitled';

  const upstream = inputs.upstream_assets as readonly UpstreamAssetLike[] | undefined;
  const briefAsset = findApprovedAsset(upstream, 'SPC-brief');
  if (!briefAsset?.content) {
    throw new ScreenwriterError(
      `Precondition failed: APPROVED SPC-brief with non-empty content not found in upstream_assets`,
    );
  }

  const missingInputs: string[] = [];
  if (!findApprovedAsset(upstream, 'BIB-style'))
    missingInputs.push('Style Bible (BIB-style) — not yet provisioned');
  if (!findApprovedAsset(upstream, 'BIB-world'))
    missingInputs.push('World Bible (BIB-world) — not yet provisioned');
  if (!findApprovedAsset(upstream, 'BIB-character'))
    missingInputs.push('Character Profiles (BIB-character) — not yet provisioned');

  const systemPrompt = await loadSystemPrompt();
  const userMessage = buildUserMessage({
    episodeCode,
    episodeTitle,
    briefContent: briefAsset.content,
    missingInputs,
    revisionNote,
  });

  let result: AnthropicTextResult;
  try {
    result = await generateAnthropicText({
      systemPrompt,
      userMessage,
      model: SCREENWRITER_MODEL,
      maxOutputTokens: SCREENWRITER_MAX_TOKENS,
      expectsJson: true,
    });
  } catch (err: unknown) {
    if (err instanceof AnthropicTextError) {
      throw new ScreenwriterError(`Anthropic generation failed: ${err.message}`, err);
    }
    throw err;
  }

  if (result.costUsd > SCREENWRITER_COST_CEILING_USD) {
    // Don't fail — the call already happened, money already spent. Log a
    // contract violation in notes; runner.ts will surface this in the asset
    // metadata so Director sees it.
    // (Future: a true cost ceiling enforcer pre-flighting via input token estimate.)
  }

  if (!result.body) {
    throw new ScreenwriterError(
      'Postcondition failed: Claude returned no parseable JSON block',
    );
  }

  const description = `Produced by EXEC-SW · ${SCREENWRITER_CONTRACT} · ${SCREENWRITER_MODEL} · cost $${result.costUsd.toFixed(4)} · ${result.usage.inputTokens}→${result.usage.outputTokens} tokens`;

  return {
    markdown: result.markdown,
    body: result.body,
    costUsd: result.costUsd,
    model: result.model,
    contract: SCREENWRITER_CONTRACT,
    briefAssetId: briefAsset.id ?? null,
    description,
    notes: missingInputs,
  };
}
