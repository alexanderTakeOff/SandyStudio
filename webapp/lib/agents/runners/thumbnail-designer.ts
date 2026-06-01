// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/runners/thumbnail-designer.ts
// Real EXEC-THUMB-DESIGNER (Thumbnail Designer / Key Art) runner.
// LLM Plan author for YouTube thumbnails — mirrors the EXEC-EREF-DESIGNER pattern:
// a pure-cost Anthropic call that art-directs N distinct, high-CTR thumbnail
// concepts reading the `viral-thumbnail-design` skill + Series Bible canon. It
// does NOT call any image provider — it writes a SPC-thumb_plan asset that the
// Director approves; only then does the EXEC-THUMB executor render the images.
//
// Inputs (from runner.ts loadAgentInputs):
//   - episode: { episode_code, title_working, metadata.delivery_targets }
//   - upstream_assets: APPROVED SCR-script (strongest beat) + optional SPC-brief
//   - bible: SeriesBibleCanon (protagonist + style canon — fixes "generic humans")
//
// Output (consumed by runner.ts case 'EXEC-THUMB-DESIGNER'):
//   - markdown: full Claude response (rationale + fenced JSON Plan)
//   - body: parsed { variants: [...], rationale, halt }
//   - costUsd, model
// ──────────────────────────────────────────────────────────────────────────────

import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  generateAnthropicText,
  AnthropicTextError,
  type AnthropicTextResult,
} from '../providers/anthropic-text';
import { formatBibleForPrompt, type SeriesBibleCanon } from '../bible-loader';
import { loadAgentSkillBodies, composeActivePlaybooksBlock } from '../load-skills';
import type { AgentInputs } from '../types';

export const THUMBNAIL_DESIGNER_CONTRACT = 'thumbnail-designer@v1';
export const THUMBNAIL_DESIGNER_MODEL = 'claude-sonnet-4-6';
export const THUMBNAIL_DESIGNER_MAX_TOKENS = 4000;
export const THUMBNAIL_DESIGNER_COST_CEILING_USD = 0.3;
/** Skill slug injected as the active playbook — agent↔skill is 1:1 here. */
const THUMBNAIL_SKILL_SLUG = 'viral-thumbnail-design';
/**
 * Absence-convention default variant count (skill-creation doctrine): enough
 * spread for a real Director choice without wasted render cost. A Brief/config
 * value overrides this when present.
 */
const DEFAULT_VARIANT_COUNT = 3;

export class ThumbnailDesignerError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'ThumbnailDesignerError';
  }
}

export interface ThumbnailDesignerRunResult {
  markdown: string;
  body: Record<string, unknown>;
  costUsd: number;
  model: string;
  contract: typeof THUMBNAIL_DESIGNER_CONTRACT;
  scriptAssetId: string | null;
  description: string;
  notes: readonly string[];
}

interface UpstreamAssetLike {
  id?: string;
  file_type?: string | null;
  status?: string | null;
  content?: string | null;
}

let systemPromptCache: string | null = null;

async function loadSystemPrompt(): Promise<string> {
  if (systemPromptCache !== null) return systemPromptCache;
  const candidates = [
    path.resolve(process.cwd(), '../agents/exec/thumbnail-designer.md'),
    path.resolve(process.cwd(), 'agents/exec/thumbnail-designer.md'),
    path.resolve(process.cwd(), '../../agents/exec/thumbnail-designer.md'),
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
  throw new ThumbnailDesignerError(
    `Could not find agents/exec/thumbnail-designer.md from cwd=${process.cwd()} (tried ${candidates.length} paths)`,
  );
}

function findApprovedAsset(
  upstream: readonly UpstreamAssetLike[] | undefined,
  fileType: string,
): UpstreamAssetLike | null {
  if (!upstream) return null;
  return upstream.find((a) => a.file_type === fileType && a.status === 'APPROVED') ?? null;
}

function buildUserMessage(args: {
  episodeCode: string;
  episodeTitle: string;
  deliveryTargets: readonly string[];
  scriptContent: string | null;
  briefContent: string | null;
  bible: SeriesBibleCanon;
  playbooks: string;
  variantCount: number;
  revisionNote?: string;
}): string {
  const {
    episodeCode,
    episodeTitle,
    deliveryTargets,
    scriptContent,
    briefContent,
    bible,
    playbooks,
    variantCount,
    revisionNote,
  } = args;
  const biblePromptBlock = formatBibleForPrompt(bible);
  const hasCanon = bible.total_entries > 0 || bible.general_idea !== null;
  return [
    '# Task',
    `Art-direct ${variantCount} distinct, high-CTR YouTube thumbnail concepts for episode ${episodeCode} — "${episodeTitle}".`,
    deliveryTargets.length > 0 ? `Delivery targets: ${deliveryTargets.join(', ')}.` : '',
    '',
    playbooks,
    '',
    hasCanon
      ? biblePromptBlock
      : '## Series Bible empty\n\nNo LOCKED canon exists. You cannot reliably depict a canonical protagonist — set `halt` in the JSON output citing the missing Series Bible character canon, and stop.',
    '',
    scriptContent
      ? ['## Episode script (strongest beat lives here — APPROVED)', '', '<script>', scriptContent, '</script>'].join('\n')
      : '',
    briefContent
      ? ['## Episode brief (APPROVED)', '', '<brief>', briefContent, '</brief>'].join('\n')
      : '',
    '',
    revisionNote
      ? [
          '## Revision request — HARD ACCEPTANCE CRITERIA',
          '',
          revisionNote,
          '',
          'Fix exactly the flagged defects, keep what passed, return a fresh Plan. Default to revising, not abandoning.',
          '',
        ].join('\n')
      : '',
    '## Output format',
    '',
    'Respond with a short markdown rationale, then exactly one fenced JSON block of this shape:',
    '',
    '```json',
    '{',
    `  "episode_code": "${episodeCode}",`,
    '  "halt": null,',
    '  "rationale": "<which beat, why these click levers>",',
    '  "variants": [',
    '    {',
    '      "concept": "<emotion-led | curiosity-led | scale-led | text-led>",',
    '      "prompt": "<positive image prompt: canonical protagonist + exaggerated emotion + composition + palette + 16:9 safe-zone framing>",',
    '      "negative_prompt": "<style-anchor negatives + generic humans, text, watermark, UI chrome, low contrast, blurry>",',
    '      "overlay_text": "<1-3 words, max 5, or null for an image-only concept>",',
    '      "palette": ["<hex or descriptive>"],',
    '      "composition_notes": "<subject placement inside the 16:9 safe zone>"',
    '    }',
    '  ]',
    '}',
    '```',
    '',
    'Hard rules:',
    `- Produce exactly ${variantCount} genuinely distinct variants, each on a different click lever (do not recolour one idea).`,
    '- Use the canonical protagonist from the Bible — never a generic/anonymous figure. This is the single most important rule.',
    '- `overlay_text` ≤ 5 words; do not bake text into the image `prompt` (the executor burns it). Offer at least one text-led and one image-only concept.',
    '- Compose for a centered 16:9 safe zone (provider renders 3:2; the executor crops to 16:9 1280×720).',
    '- If protagonist canon is absent or Bible/Brief conflict on an invariant, set `halt` with the reason, return an empty `variants` array, and stop.',
    '- The fenced JSON must be valid. No trailing commas, no comments.',
  ]
    .filter(Boolean)
    .join('\n');
}

export interface ThumbnailDesignerRunArgs {
  inputs: AgentInputs;
  revisionNote?: string;
}

export async function runThumbnailDesigner(
  args: ThumbnailDesignerRunArgs,
): Promise<ThumbnailDesignerRunResult> {
  const { inputs, revisionNote } = args;

  const ep = inputs.episode as
    | {
        episode_code?: string;
        title_working?: string | null;
        metadata?: { delivery_targets?: unknown } | null;
      }
    | undefined;
  const episodeCode = ep?.episode_code ?? 'UNKNOWN';
  const episodeTitle = ep?.title_working ?? 'Untitled';
  const deliveryTargets = Array.isArray(ep?.metadata?.delivery_targets)
    ? (ep!.metadata!.delivery_targets as unknown[]).filter((t): t is string => typeof t === 'string')
    : [];

  const upstream = inputs.upstream_assets as readonly UpstreamAssetLike[] | undefined;
  const scriptAsset = findApprovedAsset(upstream, 'SCR-script');
  const briefAsset = findApprovedAsset(upstream, 'SPC-brief');

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
    notes.push('Series Bible empty — designer will HALT (cannot depict canonical protagonist)');
  } else {
    notes.push(`Series Bible canon loaded: ${bible.characters.length} characters, ${bible.styles.length} styles`);
  }

  // Inject the virality playbook deterministically (agent↔skill is 1:1).
  const { loaded } = await loadAgentSkillBodies([THUMBNAIL_SKILL_SLUG]);
  const playbooks = composeActivePlaybooksBlock(loaded);
  if (loaded.length === 0) {
    notes.push(`Skill ${THUMBNAIL_SKILL_SLUG} not found — proceeding on system prompt alone`);
  }

  const systemPrompt = await loadSystemPrompt();
  const userMessage = buildUserMessage({
    episodeCode,
    episodeTitle,
    deliveryTargets,
    scriptContent: scriptAsset?.content ?? null,
    briefContent: briefAsset?.content ?? null,
    bible,
    playbooks,
    variantCount: DEFAULT_VARIANT_COUNT,
    revisionNote,
  });

  let result: AnthropicTextResult;
  try {
    result = await generateAnthropicText({
      systemPrompt,
      userMessage,
      model: THUMBNAIL_DESIGNER_MODEL,
      maxOutputTokens: THUMBNAIL_DESIGNER_MAX_TOKENS,
      expectsJson: true,
    });
  } catch (err: unknown) {
    if (err instanceof AnthropicTextError) {
      throw new ThumbnailDesignerError(`Anthropic generation failed: ${err.message}`, err);
    }
    throw err;
  }

  if (!result.body) {
    throw new ThumbnailDesignerError('Postcondition failed: Claude returned no parseable JSON Plan');
  }

  const description = `Produced by EXEC-THUMB-DESIGNER · ${THUMBNAIL_DESIGNER_CONTRACT} · ${THUMBNAIL_DESIGNER_MODEL} · cost $${result.costUsd.toFixed(4)} · ${result.usage.inputTokens}→${result.usage.outputTokens} tokens`;

  return {
    markdown: result.markdown,
    body: result.body,
    costUsd: result.costUsd,
    model: result.model,
    contract: THUMBNAIL_DESIGNER_CONTRACT,
    scriptAssetId: scriptAsset?.id ?? null,
    description,
    notes,
  };
}
