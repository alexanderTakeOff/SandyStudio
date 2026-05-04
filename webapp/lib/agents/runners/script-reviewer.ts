// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/runners/script-reviewer.ts
// Real EXEC-SREV (Script Reviewer) runner — replaces mockLLM for this agent.
// Honours specs/contracts/script_reviewer@v1.yaml.
//
// Inputs (from runner.ts loadAgentInputs):
//   - APPROVED brief (file_type === 'SPC-brief')
//   - APPROVED script (file_type === 'SCR-script')
//
// Outputs (consumed by runner.ts case 'EXEC-SREV'):
//   - markdown: review report + fenced JSON block
//   - body: review_v1 verdict object
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

export const SREV_CONTRACT = 'script_reviewer@v1';
export const SREV_MODEL = 'claude-sonnet-4-6';
export const SREV_MAX_TOKENS = 3000;
export const SREV_COST_CEILING_USD = 0.3;

export class ScriptReviewerError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'ScriptReviewerError';
  }
}

export interface ScriptReviewerRunResult {
  markdown: string;
  body: Record<string, unknown>;
  costUsd: number;
  model: string;
  contract: typeof SREV_CONTRACT;
  verdict: 'PASS' | 'REVISE' | 'FAIL' | 'UNKNOWN';
  briefAssetId: string | null;
  scriptAssetId: string | null;
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

let systemPromptCache: string | null = null;

async function loadSystemPrompt(): Promise<string> {
  if (systemPromptCache !== null) return systemPromptCache;
  const candidates = [
    path.resolve(process.cwd(), '../agents/exec/script_reviewer.md'),
    path.resolve(process.cwd(), 'agents/exec/script_reviewer.md'),
    path.resolve(process.cwd(), '../../agents/exec/script_reviewer.md'),
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
  throw new ScriptReviewerError(
    `Could not find agents/exec/script_reviewer.md from cwd=${process.cwd()}`,
  );
}

function findApprovedAsset(
  upstream: readonly UpstreamAssetLike[] | undefined,
  fileType: string,
): UpstreamAssetLike | null {
  if (!upstream) return null;
  // Pick the latest version (highest `version`) that is APPROVED.
  const approved = upstream.filter(
    (a) => a.file_type === fileType && a.status === 'APPROVED',
  );
  approved.sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
  return approved[0] ?? null;
}

function buildUserMessage(args: {
  episodeCode: string;
  episodeTitle: string;
  briefContent: string;
  scriptContent: string;
  scriptVersion: number;
  bible: SeriesBibleCanon;
}): string {
  const { episodeCode, episodeTitle, briefContent, scriptContent, scriptVersion, bible } = args;
  const biblePromptBlock = formatBibleForPrompt(bible);
  const hasCanon = bible.total_entries > 0 || bible.general_idea !== null;
  const characterSlugs = bible.characters.map((c) => c.slug).filter(Boolean);
  const locationSlugs = bible.locations.map((l) => l.slug).filter(Boolean);
  return [
    '# Task',
    `Review the screenplay below against its brief and report a verdict for episode ${episodeCode} — "${episodeTitle}".`,
    '',
    '## Episode Brief (canonical input — APPROVED)',
    '',
    '<brief>',
    briefContent,
    '</brief>',
    '',
    `## Script under review (v${scriptVersion}, APPROVED)`,
    '',
    '<script>',
    scriptContent,
    '</script>',
    '',
    hasCanon
      ? biblePromptBlock
      : [
          '## MVP context — Series Bible empty',
          '',
          'No LOCKED Series Bible entries exist for this series. Review against the brief alone. Where you would normally check Style Bible / World Bible / Character Profiles, instead flag any concern as an issue with `area: brief_alignment` and a recommendation that the relevant bible be created.',
        ].join('\n'),
    '',
    hasCanon
      ? [
          '## Bible-driven review checks',
          '',
          `When checking the script, verify it uses ONLY the Bible canon slugs for characters (${characterSlugs.join(', ') || '(none)'}) and locations (${locationSlugs.join(', ') || '(none)'}). Flag any character or location not present in the canon as a `+'`world_consistency`'+` issue. Verify character behaviour and visual references are consistent with their LOCKED Bible descriptions above.`,
        ].join('\n')
      : '',
    '',
    '## Output format',
    '',
    'Respond in markdown:',
    '',
    '```',
    '# Script Review — <episode code> v<N>',
    '',
    '## Verdict',
    '<PASS | REVISE | FAIL — one line>',
    '',
    '## Summary',
    '<2-3 sentences explaining the verdict>',
    '',
    '## Issues found',
    '<for each issue: severity, area, scene_id (if applicable), what is wrong, recommended fix>',
    '',
    '## What works',
    '<what the script does right — ground future revisions>',
    '```',
    '',
    'Then append exactly one fenced JSON code block with this shape:',
    '',
    '```json',
    '{',
    `  "episode_id": "${episodeCode}",`,
    `  "script_version": ${scriptVersion},`,
    '  "verdict": "PASS" | "REVISE" | "FAIL",',
    '  "checks_passed": ["structure", "character_voice", "comic_beats", "world_consistency", "brief_alignment", ...],',
    '  "issues": [',
    '    {',
    '      "severity": "CRITICAL" | "MAJOR" | "MINOR",',
    '      "area": "structure" | "character_voice" | "comic_beats" | "world_consistency" | "dialogue" | "pacing" | "brief_alignment",',
    '      "scene_id": "<scene id from script or null if structural>",',
    '      "note": "<what is wrong>",',
    '      "recommendation": "<what to change>"',
    '    }',
    '  ],',
    '  "notes": ["<misc notes>"]',
    '}',
    '```',
    '',
    'Verdict rubric:',
    '- PASS: ready for storyboarding. Maybe MINOR notes, no MAJOR or CRITICAL issues.',
    '- REVISE: at least one MAJOR issue OR multiple MINOR issues that compound. Issues must be actionable (exact scene + concrete fix).',
    '- FAIL: at least one CRITICAL issue (script does not deliver brief\'s premise OR violates a hard constraint).',
    '',
    'Hard rules:',
    '- Be specific. "Scene 3 feels weak" is not an issue — say WHAT is weak and HOW to fix.',
    '- If verdict is not PASS, issues[] MUST be non-empty.',
    '- Every mandatory beat from the brief\'s "Key beats" must be referenced — flag if any are missing.',
    '- The fenced JSON must be valid JSON. No trailing commas. No comments.',
  ].join('\n');
}

export interface ScriptReviewerRunArgs {
  inputs: AgentInputs;
}

export async function runScriptReviewer(
  args: ScriptReviewerRunArgs,
): Promise<ScriptReviewerRunResult> {
  const { inputs } = args;

  const ep = inputs.episode as
    | { episode_code?: string; title_working?: string | null }
    | undefined;
  const episodeCode = ep?.episode_code ?? 'UNKNOWN';
  const episodeTitle = ep?.title_working ?? 'Untitled';

  const upstream = inputs.upstream_assets as readonly UpstreamAssetLike[] | undefined;
  const briefAsset = findApprovedAsset(upstream, 'SPC-brief');
  if (!briefAsset?.content) {
    throw new ScriptReviewerError(
      `Precondition failed: APPROVED SPC-brief with non-empty content not found`,
    );
  }
  const scriptAsset = findApprovedAsset(upstream, 'SCR-script');
  if (!scriptAsset?.content) {
    throw new ScriptReviewerError(
      `Precondition failed: APPROVED SCR-script with non-empty content not found`,
    );
  }

  const bible = (inputs.bible as SeriesBibleCanon | undefined) ?? {
    series_id: null,
    general_idea: null,
    characters: [],
    locations: [],
    styles: [],
    total_entries: 0,
  };

  const notes: string[] = [];
  if (bible.total_entries === 0 && !bible.general_idea) {
    notes.push('Series Bible empty — reviewing against brief alone (MVP mode)');
  } else {
    notes.push(
      `Series Bible canon loaded: ${bible.characters.length} characters, ${bible.locations.length} locations, ${bible.styles.length} styles`,
    );
  }

  const systemPrompt = await loadSystemPrompt();
  const userMessage = buildUserMessage({
    episodeCode,
    episodeTitle,
    briefContent: briefAsset.content,
    scriptContent: scriptAsset.content,
    scriptVersion: scriptAsset.version ?? 1,
    bible,
  });

  let result: AnthropicTextResult;
  try {
    result = await generateAnthropicText({
      systemPrompt,
      userMessage,
      model: SREV_MODEL,
      maxOutputTokens: SREV_MAX_TOKENS,
      expectsJson: true,
    });
  } catch (err: unknown) {
    if (err instanceof AnthropicTextError) {
      throw new ScriptReviewerError(`Anthropic generation failed: ${err.message}`, err);
    }
    throw err;
  }

  if (!result.body) {
    throw new ScriptReviewerError(
      'Postcondition failed: Claude returned no parseable JSON block',
    );
  }

  const verdictRaw = result.body.verdict;
  const verdict: ScriptReviewerRunResult['verdict'] =
    verdictRaw === 'PASS' || verdictRaw === 'REVISE' || verdictRaw === 'FAIL'
      ? verdictRaw
      : 'UNKNOWN';

  const description = `Produced by EXEC-SREV · ${SREV_CONTRACT} · ${SREV_MODEL} · verdict ${verdict} · cost $${result.costUsd.toFixed(4)} · ${result.usage.inputTokens}→${result.usage.outputTokens} tokens`;

  return {
    markdown: result.markdown,
    body: result.body,
    costUsd: result.costUsd,
    model: result.model,
    contract: SREV_CONTRACT,
    verdict,
    briefAssetId: briefAsset.id ?? null,
    scriptAssetId: scriptAsset.id ?? null,
    description,
    notes,
  };
}
