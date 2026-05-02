// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/runners/storyboarder.ts
// Real EXEC-SB (Storyboarder) runner — replaces mockLLM for this agent.
// Honours specs/contracts/storyboarder@v1.yaml.
//
// Inputs (from runner.ts loadAgentInputs):
//   - APPROVED brief
//   - APPROVED script (with parseable scenes_v1 JSON)
//
// Outputs (consumed by runner.ts case 'EXEC-SB'):
//   - markdown: storyboard report + fenced JSON block
//   - body: storyboard_v1 with exactly 3 acts × shots[]
//   - cost_usd, model: cost ledger fields
// ──────────────────────────────────────────────────────────────────────────────

import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  generateAnthropicText,
  AnthropicTextError,
  type AnthropicTextResult,
} from '../providers/anthropic-text';
import type { AgentInputs } from '../types';

export const SB_CONTRACT = 'storyboarder@v1';
export const SB_MODEL = 'claude-sonnet-4-6';
export const SB_MAX_TOKENS = 8000;
export const SB_COST_CEILING_USD = 0.5;

export class StoryboarderError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'StoryboarderError';
  }
}

export interface StoryboarderRunResult {
  markdown: string;
  body: Record<string, unknown>;
  costUsd: number;
  model: string;
  contract: typeof SB_CONTRACT;
  totalShots: number;
  totalDurationS: number;
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
    path.resolve(process.cwd(), '../agents/exec/storyboarder.md'),
    path.resolve(process.cwd(), 'agents/exec/storyboarder.md'),
    path.resolve(process.cwd(), '../../agents/exec/storyboarder.md'),
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
  throw new StoryboarderError(
    `Could not find agents/exec/storyboarder.md from cwd=${process.cwd()}`,
  );
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

function buildUserMessage(args: {
  episodeCode: string;
  episodeTitle: string;
  briefContent: string;
  scriptContent: string;
  scriptVersion: number;
  missingInputs: readonly string[];
}): string {
  const { episodeCode, episodeTitle, briefContent, scriptContent, scriptVersion, missingInputs } = args;
  return [
    '# Task',
    `Break the screenplay below into a shot-by-shot storyboard for episode ${episodeCode} — "${episodeTitle}".`,
    '',
    '## Episode Brief (canonical input — APPROVED)',
    '',
    '<brief>',
    briefContent,
    '</brief>',
    '',
    `## Approved Script (v${scriptVersion}) — your structural source`,
    '',
    '<script>',
    scriptContent,
    '</script>',
    '',
    '## MVP context — missing upstream inputs',
    '',
    'These inputs are NOT YET PROVISIONED:',
    ...missingInputs.map((m) => `- ${m}`),
    '',
    'Per Director\'s decision: storyboard against brief + script alone. Use only locations and characters explicitly named there. Where you would normally consult Style Bible / World Bible / Character Profiles, list each episode-local choice in the `assumptions[]` array.',
    '',
    '## Output format',
    '',
    'Respond in markdown:',
    '',
    '```',
    '# Storyboard — <episode code> v<N>',
    '',
    '## Shot list summary',
    '<one paragraph: total shot count, total runtime, beats coverage>',
    '',
    '## ACT 1 — <act beat summary>',
    '<for each shot: shot id, camera, location, action prose, duration, key beat from brief>',
    '',
    '## ACT 2 — <act beat summary>',
    '<same>',
    '',
    '## ACT 3 — <act beat summary>',
    '<same>',
    '```',
    '',
    'Then append exactly one fenced JSON code block with this shape:',
    '',
    '```json',
    '{',
    `  "episode_id": "${episodeCode}",`,
    `  "script_version": ${scriptVersion},`,
    '  "runtime_target_seconds": <integer from brief>,',
    '  "acts": [',
    '    {',
    '      "act": 1,',
    '      "beat_summary": "<one short sentence — what this act delivers>",',
    '      "shots": [',
    '        {',
    `          "shot_id": "${episodeCode}-A1-SC01-SH01",`,
    '          "camera_angle": "wide" | "medium" | "medium_wide" | "close_up" | "extreme_close_up" | "over_shoulder" | "top_down" | "low_angle" | "dutch",',
    '          "location": "<location name from brief — NOT generic>",',
    '          "action": "<one paragraph of visual action — what is on screen>",',
    '          "characters_present": ["<name>"],',
    '          "duration_seconds": <integer>,',
    '          "key_beat": "<which brief beat this shot delivers, OR \\"transition\\" / \\"setup\\">",',
    '          "continuity_notes": "<what must match the prior shot — pose, prop state, lighting>"',
    '        }',
    '      ]',
    '    },',
    '    { "act": 2, ... },',
    '    { "act": 3, ... }',
    '  ],',
    '  "assumptions": ["<each MVP choice you made because Style/World/Character bibles are missing>"],',
    '  "total_shots": <integer>,',
    '  "total_duration_s": <integer — sum of all duration_seconds>',
    '}',
    '```',
    '',
    'Hard rules:',
    '- Exactly THREE acts in `acts[]`. No more, no fewer.',
    '- Every shot needs a unique `shot_id` following the pattern `<episode>-A<N>-SC<NN>-SH<NN>`.',
    '- `location` must be specific (e.g. "Кафе у окна", "Стойка кафе") — never "scene_1" or "generic_location".',
    '- `characters_present` must use names from the brief.',
    '- Sum of all shot `duration_seconds` should be within ±10% of `runtime_target_seconds`.',
    '- For visual comedy MVP: every shot is action, no dialogue.',
    '- Each shot\'s `action` must describe what the camera SEES — concrete physical action, not internal feelings.',
    '- The fenced JSON must be valid JSON. No trailing commas. No comments. Properly escape any quotes inside strings.',
    '- KEEP PROSE TIGHT in markdown — JSON at end is mandatory and must not be truncated. If running long, shorten markdown — never skip JSON.',
  ].join('\n');
}

export interface StoryboarderRunArgs {
  inputs: AgentInputs;
}

export async function runStoryboarder(
  args: StoryboarderRunArgs,
): Promise<StoryboarderRunResult> {
  const { inputs } = args;

  const ep = inputs.episode as
    | { episode_code?: string; title_working?: string | null }
    | undefined;
  const episodeCode = ep?.episode_code ?? 'UNKNOWN';
  const episodeTitle = ep?.title_working ?? 'Untitled';

  const upstream = inputs.upstream_assets as readonly UpstreamAssetLike[] | undefined;
  const briefAsset = findApprovedAsset(upstream, 'SPC-brief');
  if (!briefAsset?.content) {
    throw new StoryboarderError(
      `Precondition failed: APPROVED SPC-brief not found`,
    );
  }
  const scriptAsset = findApprovedAsset(upstream, 'SCR-script');
  if (!scriptAsset?.content) {
    throw new StoryboarderError(
      `Precondition failed: APPROVED SCR-script not found`,
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
    scriptContent: scriptAsset.content,
    scriptVersion: scriptAsset.version ?? 1,
    missingInputs,
  });

  let result: AnthropicTextResult;
  try {
    result = await generateAnthropicText({
      systemPrompt,
      userMessage,
      model: SB_MODEL,
      maxOutputTokens: SB_MAX_TOKENS,
      expectsJson: true,
    });
  } catch (err: unknown) {
    if (err instanceof AnthropicTextError) {
      throw new StoryboarderError(`Anthropic generation failed: ${err.message}`, err);
    }
    throw err;
  }

  if (!result.body) {
    throw new StoryboarderError(
      'Postcondition failed: Claude returned no parseable JSON block',
    );
  }

  // Validate act count and shot totals — easy to enforce, hard for the model
  // to silently break.
  const acts = Array.isArray(result.body.acts) ? result.body.acts : [];
  if (acts.length !== 3) {
    throw new StoryboarderError(
      `Postcondition failed: expected exactly 3 acts, got ${acts.length}`,
    );
  }

  const totalShots = acts.reduce((sum, act) => {
    const shots = Array.isArray((act as { shots?: unknown[] }).shots)
      ? (act as { shots: unknown[] }).shots
      : [];
    return sum + shots.length;
  }, 0);
  const totalDurationS =
    typeof result.body.total_duration_s === 'number'
      ? result.body.total_duration_s
      : 0;

  const description = `Produced by EXEC-SB · ${SB_CONTRACT} · ${SB_MODEL} · ${totalShots} shots / ${totalDurationS}s · cost $${result.costUsd.toFixed(4)} · ${result.usage.inputTokens}→${result.usage.outputTokens} tokens`;

  return {
    markdown: result.markdown,
    body: result.body,
    costUsd: result.costUsd,
    model: result.model,
    contract: SB_CONTRACT,
    totalShots,
    totalDurationS,
    briefAssetId: briefAsset.id ?? null,
    scriptAssetId: scriptAsset.id ?? null,
    description,
    notes: missingInputs,
  };
}
