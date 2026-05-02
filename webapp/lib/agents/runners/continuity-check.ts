// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/runners/continuity-check.ts
// EXEC-CONT — Continuity Supervisor.
// Reads APPROVED storyboard JSON + LOCKED Series Bible canon. For each shot,
// validates that:
//   - location ∈ LOCKED SBL-location_* names
//   - characters_present[] ⊆ LOCKED SBL-character_* names
// Returns PASS / REVISE / FAIL verdict with per-shot issues.
//
// Honours specs/contracts/continuity_check@v1.yaml.
// ──────────────────────────────────────────────────────────────────────────────

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../supabase/types.gen';
import {
  generateAnthropicText,
  AnthropicTextError,
  type AnthropicTextResult,
} from '../providers/anthropic-text';
import { seriesIdForEpisode, bibleSlug } from '../../api/series-bible';
import type { AgentInputs } from '../types';

export const CONT_CONTRACT = 'continuity_check@v1';
export const CONT_MODEL = 'claude-sonnet-4-6';
// Continuity emits per-shot rows + violations + descriptions in Russian; 3000
// is too tight for 13-17-shot storyboards. 6000 leaves room for prose + JSON.
export const CONT_MAX_TOKENS = 6000;

export class ContinuityCheckError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'ContinuityCheckError';
  }
}

export interface ContinuityCheckRunResult {
  markdown: string;
  body: Record<string, unknown>;
  costUsd: number;
  model: string;
  contract: typeof CONT_CONTRACT;
  verdict: 'PASS' | 'REVISE' | 'FAIL' | 'UNKNOWN';
  storyboardAssetId: string | null;
  description: string;
  bibleSnapshot: { characters: string[]; locations: string[]; styles: string[] };
}

interface UpstreamAssetLike {
  id?: string;
  file_type?: string | null;
  status?: string | null;
  content?: string | null;
  filename?: string | null;
  version?: number | null;
}

interface BibleAssetLike {
  filename: string;
  description: string | null;
  status: string;
  file_type: string;
}

let systemPromptCache: string | null = null;

async function loadSystemPrompt(): Promise<string> {
  if (systemPromptCache !== null) return systemPromptCache;
  const candidates = [
    path.resolve(process.cwd(), '../agents/exec/world_checker.md'),
    path.resolve(process.cwd(), 'agents/exec/world_checker.md'),
    path.resolve(process.cwd(), '../../agents/exec/world_checker.md'),
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
  // Fallback inline prompt — Continuity Supervisor role.
  systemPromptCache = [
    'You are the Continuity Supervisor for a TV-style animation studio.',
    'You enforce the Series Bible canon: every storyboard shot must use ONLY characters and locations',
    'that have a LOCKED canonical reference in the Series Bible. Unknown elements are violations.',
    '',
    'You do NOT rewrite the storyboard. You produce a verdict and an actionable list of violations the',
    'Storyboarder (or the Director) can address.',
  ].join('\n');
  return systemPromptCache;
}

function findApprovedAsset(
  upstream: readonly UpstreamAssetLike[] | undefined,
  fileType: string,
): UpstreamAssetLike | null {
  if (!upstream) return null;
  const approved = upstream.filter(
    (a) => a.file_type === fileType && a.status === 'APPROVED',
  );
  approved.sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
  return approved[0] ?? null;
}

// Canonical slug lookup goes through lib/api/series-bible.bibleSlug — DO NOT
// re-introduce a local filename regex here. See JSDoc on bibleSlugFromFileType
// for the history of the bug this prevents.

async function loadBibleCanon(
  supabase: SupabaseClient<Database>,
  seriesId: string,
): Promise<{
  characters: BibleAssetLike[];
  locations: BibleAssetLike[];
  styles: BibleAssetLike[];
}> {
  const { data, error } = await supabase
    .from('assets')
    .select('filename,description,status,file_type')
    .eq('series_id', seriesId)
    .eq('status', 'LOCKED')
    .like('file_type', 'SBL-%');
  if (error) throw new ContinuityCheckError(`Bible canon fetch: ${error.message}`);
  const all = (data ?? []) as BibleAssetLike[];
  return {
    characters: all.filter((a) => a.file_type.startsWith('SBL-character_')),
    locations: all.filter((a) => a.file_type.startsWith('SBL-location_')),
    styles: all.filter((a) => a.file_type.startsWith('SBL-style_')),
  };
}

function buildUserMessage(args: {
  episodeCode: string;
  storyboardContent: string;
  storyboardVersion: number;
  bible: {
    characters: BibleAssetLike[];
    locations: BibleAssetLike[];
    styles: BibleAssetLike[];
  };
}): string {
  const { episodeCode, storyboardContent, storyboardVersion, bible } = args;
  const charNames = bible.characters
    .map((c) => bibleSlug(c.file_type))
    .filter((s): s is string => Boolean(s));
  const locNames = bible.locations
    .map((c) => bibleSlug(c.file_type))
    .filter((s): s is string => Boolean(s));

  const charDescriptions = bible.characters
    .map((c) => {
      const name = bibleSlug(c.file_type) ?? 'unknown';
      const desc = (c.description ?? '').slice(0, 400);
      return `- ${name}: ${desc || '(no description)'}`;
    })
    .join('\n');
  const locDescriptions = bible.locations
    .map((c) => {
      const name = bibleSlug(c.file_type) ?? 'unknown';
      const desc = (c.description ?? '').slice(0, 400);
      return `- ${name}: ${desc || '(no description)'}`;
    })
    .join('\n');

  return [
    '# Task',
    `Validate the APPROVED storyboard for episode ${episodeCode} (v${storyboardVersion}) against the LOCKED Series Bible canon below.`,
    '',
    '## LOCKED Series Bible canon',
    '',
    `**Allowed characters** (${charNames.length}):`,
    charDescriptions || '(none)',
    '',
    `**Allowed locations** (${locNames.length}):`,
    locDescriptions || '(none — episode may use any location, but flag any that look invented)',
    '',
    `**Style guide** (${bible.styles.length} entries) — see Bible Library; not enforced here, just informs tone of violations.`,
    '',
    '## Storyboard under review',
    '',
    '<storyboard>',
    storyboardContent,
    '</storyboard>',
    '',
    '## Output format',
    '',
    'Markdown report:',
    '```',
    '# Continuity Check — <episode> v<N>',
    '',
    '## Verdict',
    '<PASS | REVISE | FAIL>',
    '',
    '## Summary',
    '<2-3 sentences why>',
    '',
    '## Per-shot results',
    '<for each shot in storyboard JSON.acts[].shots[]: shot_id, location verdict, characters verdict, list any issues>',
    '',
    '## Violations',
    '<list any character or location that is not in the LOCKED Bible canon>',
    '```',
    '',
    'Then append exactly one fenced JSON block:',
    '',
    '```json',
    '{',
    `  "episode_id": "${episodeCode}",`,
    `  "storyboard_version": ${storyboardVersion},`,
    '  "verdict": "PASS" | "REVISE" | "FAIL",',
    '  "per_shot": [',
    '    {',
    '      "shot_id": "<from storyboard>",',
    '      "location_canon": "PASS" | "MISSING" | "UNKNOWN",',
    '      "characters_canon": "PASS" | "MISSING" | "UNKNOWN",',
    '      "issues": ["<actionable issue>"]',
    '    }',
    '  ],',
    '  "summary": "<short summary>",',
    '  "canon_used": {',
    '    "characters": ["<canonical name>"],',
    '    "locations": ["<canonical name>"]',
    '  },',
    '  "violations": ["<short violation lines>"]',
    '}',
    '```',
    '',
    'KEEP PROSE TIGHT — JSON block at end is mandatory and must not be truncated. If running long, shorten markdown — never skip JSON.',
    '',
    'Verdict rubric:',
    '- PASS: every shot uses only canonical characters; locations are canonical OR clearly episode-only and acceptable.',
    '- REVISE: some shots reference a character or location not in the LOCKED Bible. Storyboarder must rewrite.',
    '- FAIL: storyboard introduces multiple unknown characters or breaks the world rules — needs Director intervention.',
    '',
    'Hard rules:',
    '- Compare characters by lowercase name match against the canonical list above.',
    '- Locations are softer: a new location is allowed if the brief implies it; flag with "UNKNOWN" only when it is invented mid-storyboard with no narrative justification.',
    '- The fenced JSON must be valid JSON.',
  ].join('\n');
}

export interface ContinuityCheckRunArgs {
  inputs: AgentInputs;
  /** Service-role supabase to load Bible canon (cross-RLS read). */
  supabase: SupabaseClient<Database>;
}

export async function runContinuityCheck(
  args: ContinuityCheckRunArgs,
): Promise<ContinuityCheckRunResult> {
  const { inputs, supabase } = args;

  const ep = inputs.episode as
    | { id?: string; episode_code?: string; series_id?: string | null }
    | undefined;
  const episodeCode = ep?.episode_code ?? 'UNKNOWN';

  const upstream = inputs.upstream_assets as readonly UpstreamAssetLike[] | undefined;
  const sbAsset = findApprovedAsset(upstream, 'STB-storyboard');
  if (!sbAsset?.content) {
    throw new ContinuityCheckError(
      'Precondition failed: APPROVED STB-storyboard with content not found',
    );
  }

  // Series is required to load Bible canon. Always resolve via helper so we
  // get a real UUID even when episodes.series_id was populated with the code
  // (legacy NewEpisodeModal bug).
  const seriesId = await seriesIdForEpisode(supabase, ep?.id ?? inputs.episode_id);
  if (!seriesId) {
    throw new ContinuityCheckError(
      'Precondition failed: episode has no parent series_id, cannot load Bible canon',
    );
  }

  const bible = await loadBibleCanon(supabase, seriesId);

  const systemPrompt = await loadSystemPrompt();
  const userMessage = buildUserMessage({
    episodeCode,
    storyboardContent: sbAsset.content,
    storyboardVersion: sbAsset.version ?? 1,
    bible,
  });

  let result: AnthropicTextResult;
  try {
    result = await generateAnthropicText({
      systemPrompt,
      userMessage,
      model: CONT_MODEL,
      maxOutputTokens: CONT_MAX_TOKENS,
      expectsJson: true,
    });
  } catch (err: unknown) {
    if (err instanceof AnthropicTextError) {
      throw new ContinuityCheckError(`Anthropic call failed: ${err.message}`, err);
    }
    throw err;
  }

  if (!result.body) {
    throw new ContinuityCheckError('No JSON block in continuity response');
  }

  const verdictRaw = result.body.verdict;
  const verdict: ContinuityCheckRunResult['verdict'] =
    verdictRaw === 'PASS' || verdictRaw === 'REVISE' || verdictRaw === 'FAIL'
      ? verdictRaw
      : 'UNKNOWN';

  const description =
    `Produced by EXEC-CONT · ${CONT_CONTRACT} · ${CONT_MODEL} · ` +
    `verdict ${verdict} · ` +
    `${bible.characters.length} canon characters / ${bible.locations.length} locations · ` +
    `cost $${result.costUsd.toFixed(4)}`;

  const charNames = bible.characters
    .map((c) => bibleSlug(c.file_type))
    .filter((s): s is string => Boolean(s));
  const locNames = bible.locations
    .map((c) => bibleSlug(c.file_type))
    .filter((s): s is string => Boolean(s));
  const styleNames = bible.styles
    .map((c) => bibleSlug(c.file_type))
    .filter((s): s is string => Boolean(s));

  return {
    markdown: result.markdown,
    body: result.body,
    costUsd: result.costUsd,
    model: result.model,
    contract: CONT_CONTRACT,
    verdict,
    storyboardAssetId: sbAsset.id ?? null,
    description,
    bibleSnapshot: { characters: charNames, locations: locNames, styles: styleNames },
  };
}
