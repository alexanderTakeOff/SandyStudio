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
import { formatBibleForPrompt, type SeriesBibleCanon } from '../bible-loader';
import type { AgentInputs } from '../types';

export const SB_CONTRACT = 'storyboarder@v2';
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
  bible: SeriesBibleCanon;
}): string {
  const { episodeCode, episodeTitle, briefContent, scriptContent, scriptVersion, bible } = args;
  const biblePromptBlock = formatBibleForPrompt(bible);
  const hasCanon = bible.total_entries > 0 || bible.general_idea !== null;
  const characterSlugs = bible.characters.map((c) => c.slug).filter(Boolean);
  const locationSlugs = bible.locations.map((l) => l.slug).filter(Boolean);
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
    hasCanon
      ? biblePromptBlock
      : [
          '## MVP context — Series Bible empty',
          '',
          'No LOCKED Series Bible entries exist for this series. Storyboard against brief + script alone. Use only locations and characters explicitly named there. List each episode-local visual choice (character appearance, location details, camera vocabulary) in the `assumptions[]` array.',
        ].join('\n'),
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
    '<for each shot: shot id, camera, location, action prose, duration, key beat>',
    '',
    '## ACT 2 — <act beat summary>',
    '<same>',
    '',
    '## ACT 3 — <act beat summary>',
    '<same>',
    '```',
    '',
    'Then append exactly one fenced JSON code block with this shape (storyboarder@v2):',
    '',
    '```json',
    '{',
    `  "episode_id": "${episodeCode}",`,
    `  "script_version": ${scriptVersion},`,
    '  "contract": "storyboarder@v2",',
    '  "runtime_target_seconds": <integer from brief>,',
    '  "acts": [',
    '    {',
    '      "act": 1,',
    '      "beat_summary": "<one short sentence — what this act delivers>",',
    '      "shots": [',
    '        {',
    `          "shot_id": "${episodeCode}-A1-SC01-SH01",`,
    '          "camera_angle": "wide" | "medium" | "medium_wide" | "close_up" | "extreme_close_up" | "over_shoulder" | "top_down" | "low_angle" | "dutch",',
    '          "shot_role": "establishing" | "action" | "reaction" | "gag" | "punchline" | "transition",',
    hasCanon
      ? `          "location": { "slug": "<one of: ${locationSlugs.join(', ') || '(none)'}>", "sub_area": "<optional sub-area within that location, e.g. \\"entrance\\" or \\"window table\\". Use null if shot covers the whole location.>" },`
      : '          "location": { "slug": "<short slug derived from brief location name, lowercase_with_underscores>", "sub_area": "<optional sub-area or null>" },',
    '          "characters": [',
    '            {',
    hasCanon
      ? `              "bible_slug": "<one of the Bible character slugs: ${characterSlugs.join(', ') || '(none)'}>",`
      : '              "bible_slug": "<character slug from brief, lowercase_with_underscores>",',
    '              "expected_emotion": "<one short noun phrase — e.g. \\"smitten\\", \\"panicked\\", \\"dignified composure\\", \\"oblivious\\". The mood the AI image reviewer will check against.>",',
    '              "expected_action": "<one short verb phrase — e.g. \\"leaning forward toward the vial\\", \\"falling backward like a plank\\", \\"raising one open hand\\". The physical action the AI image reviewer will check against.>",',
    '              "role_in_shot": "subject" | "co-star" | "background"',
    '            }',
    '          ],',
    '          "expected_gag": "<one short sentence describing the visual joke this shot delivers, OR null if shot is a setup/transition/reaction-without-gag>",',
    '          "action_prose": "<one paragraph of visual action — what is on screen, written for the storyboard reader. Can include all characters and props in motion. This is your prose narration of the shot.>",',
    '          "duration_seconds": <integer>,',
    '          "key_beat": "<which brief beat this shot delivers, OR \\"transition\\" / \\"setup\\">",',
    '          "continuity_notes": "<what must match the prior shot — pose, prop state, lighting>"',
    '        }',
    '      ]',
    '    },',
    '    { "act": 2, ... },',
    '    { "act": 3, ... }',
    '  ],',
    hasCanon
      ? '  "assumptions": ["<minor episode-local visual choices not covered by Series Bible canon — keep this list short; major drift goes through Continuity Check>"],'
      : '  "assumptions": ["<each MVP choice you made because Series Bible is empty>"],',
    '  "total_shots": <integer>,',
    '  "total_duration_s": <integer — sum of all duration_seconds>',
    '}',
    '```',
    '',
    'Hard rules (storyboarder@v2):',
    '- Exactly THREE acts in `acts[]`. No more, no fewer.',
    '- Every shot needs a unique `shot_id` following the pattern `<episode>-A<N>-SC<NN>-SH<NN>`.',
    hasCanon
      ? `- \`location.slug\` MUST be one of the Bible location slugs (verbatim, lowercase): ${locationSlugs.join(', ') || '(none)'}. Use \`location.sub_area\` for a specific zone within that location (e.g. slug=\`neon_cafe\`, sub_area=\`window table\`). Never invent a new location slug.`
      : '- `location.slug` must be a stable lowercase_with_underscores identifier derived from the brief.',
    hasCanon
      ? `- \`characters[].bible_slug\` MUST be a Bible character slug (verbatim). Available: ${characterSlugs.join(', ') || '(none)'}. Never use display names ("Sandy") or invent characters. EREF and the AI reviewer match canonical reference images by exact slug.`
      : '- `characters[].bible_slug` must be a stable lowercase_with_underscores identifier from the brief.',
    '- `characters[]` must contain EVERY character visible or audible in the shot — even brief background presence. If a character is offscreen, do NOT include them.',
    '- For each character: `expected_emotion` and `expected_action` are the two values the downstream AI image reviewer will use to score the generated image. Be specific and physical (not abstract). "happy" is too vague; "wide-eyed admiration" is good. "moving" is too vague; "leaning forward toward vial, hands flat on table" is good.',
    '- `role_in_shot`: "subject" = main focus, "co-star" = also active in this shot, "background" = visible but passive.',
    '- `expected_gag` is null only for transitions/setups. Every shot tagged `shot_role: "gag" | "punchline"` MUST have a non-null `expected_gag`.',
    hasCanon
      ? '- Every visual description in `action_prose` MUST be consistent with the Bible canon above. Do not contradict canonical character appearance, location layout, or style direction.'
      : '',
    '- Sum of all shot `duration_seconds` should be within ±10% of `runtime_target_seconds`.',
    '- For visual comedy MVP: every shot is action, no dialogue.',
    '- Each shot\'s `action_prose` must describe what the camera SEES — concrete physical action, not internal feelings.',
    '- The fenced JSON must be valid JSON. No trailing commas. No comments. Properly escape any quotes inside strings.',
    '- KEEP PROSE TIGHT in markdown — JSON at end is mandatory and must not be truncated. If running long, shorten markdown — never skip JSON.',
  ]
    .filter(Boolean)
    .join('\n');
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
    notes.push('Series Bible empty — storyboarding against brief + script alone (MVP mode)');
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

  // ── storyboarder@v2 post-validation ─────────────────────────────────────
  // Each shot must carry the test-plan fields EREF + AI-reviewer rely on.
  // If Claude drifted off contract we want a loud failure here, not a silent
  // EREF run that misinterprets v1 fields. Bible-slug membership is checked
  // when canon is loaded (only; otherwise we trust the slug as-is).
  const allowedCharSlugs = new Set(bible.characters.map((c) => c.slug).filter(Boolean));
  const allowedLocSlugs = new Set(bible.locations.map((l) => l.slug).filter(Boolean));
  const validationErrors: string[] = [];
  for (const act of acts) {
    const shots = Array.isArray((act as { shots?: unknown[] }).shots)
      ? ((act as { shots: unknown[] }).shots as unknown[])
      : [];
    for (const sh of shots) {
      const s = sh as {
        shot_id?: string;
        shot_role?: string;
        location?: { slug?: string; sub_area?: string | null };
        characters?: Array<{
          bible_slug?: string;
          expected_emotion?: string;
          expected_action?: string;
          role_in_shot?: string;
        }>;
        expected_gag?: string | null;
        action_prose?: string;
      };
      const id = s.shot_id ?? '<unknown>';
      if (typeof s.shot_role !== 'string') {
        validationErrors.push(`${id}: missing shot_role`);
      }
      if (!s.location || typeof s.location.slug !== 'string') {
        validationErrors.push(`${id}: missing location.slug`);
      } else if (allowedLocSlugs.size > 0 && !allowedLocSlugs.has(s.location.slug)) {
        validationErrors.push(
          `${id}: location.slug "${s.location.slug}" not in Bible canon (${[...allowedLocSlugs].join(', ')})`,
        );
      }
      if (!Array.isArray(s.characters) || s.characters.length === 0) {
        // Allowed: a pure-environment shot with zero characters. But action_prose
        // must reference no character then. Cheap proxy: we don't enforce.
      } else {
        for (const c of s.characters) {
          if (typeof c.bible_slug !== 'string') {
            validationErrors.push(`${id}: character missing bible_slug`);
            continue;
          }
          if (allowedCharSlugs.size > 0 && !allowedCharSlugs.has(c.bible_slug)) {
            validationErrors.push(
              `${id}: character bible_slug "${c.bible_slug}" not in Bible canon (${[...allowedCharSlugs].join(', ')})`,
            );
          }
          if (typeof c.expected_emotion !== 'string' || c.expected_emotion.trim().length === 0) {
            validationErrors.push(`${id}: character "${c.bible_slug}" missing expected_emotion`);
          }
          if (typeof c.expected_action !== 'string' || c.expected_action.trim().length === 0) {
            validationErrors.push(`${id}: character "${c.bible_slug}" missing expected_action`);
          }
          if (typeof c.role_in_shot !== 'string') {
            validationErrors.push(`${id}: character "${c.bible_slug}" missing role_in_shot`);
          }
        }
      }
      if (s.expected_gag === undefined) {
        validationErrors.push(`${id}: expected_gag not provided (use null for transitions)`);
      }
      if (typeof s.action_prose !== 'string') {
        validationErrors.push(`${id}: missing action_prose`);
      }
    }
  }
  if (validationErrors.length > 0) {
    // Fail loud — Claude broke contract. Show first 5 errors.
    const sample = validationErrors.slice(0, 5).join('; ');
    const more = validationErrors.length > 5 ? ` (+${validationErrors.length - 5} more)` : '';
    throw new StoryboarderError(
      `Postcondition failed: storyboarder@v2 contract violations: ${sample}${more}`,
    );
  }

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
    notes,
  };
}
