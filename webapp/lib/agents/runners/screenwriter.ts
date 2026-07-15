// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/runners/screenwriter.ts
// Real EXEC-SW (Screenwriter) runner — replaces mockLLM for this agent.
// Honours specs/contracts/screenwriter@v1.yaml.
//
// Inputs (from runner.ts loadAgentInputs):
//   - episode: { episode_code, title_working, ... }
//   - upstream_assets: includes the APPROVED brief (file_type === 'SPC-brief')
//     and, when the Director/Producer attached one, an OPTIONAL Episode Start
//     Notice (file_type === 'SPC-start_notice') — an advisory reservoir (gag
//     bank / notes) the Writer draws from, kept out of the often-read brief.
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
import { hasVerticalDeliveryTarget } from '../../api/provider-capabilities';
import { readEpisodeDeliveryTargets } from '../delivery-targets';
import type { AgentInputs } from '../types';
import {
  getAgentSkillManifest,
  loadAgentSkillBodies,
  composeSkillSelectionPrompt,
  composeActivePlaybooksBlock,
} from '../load-skills';
import { parseSkillSelection } from '../../skills/parse-skill-selection';
import { findApprovedAsset, START_NOTICE_FILE_TYPE } from '../upstream';

export const SCREENWRITER_CONTRACT = 'screenwriter@v1';
export const SCREENWRITER_MODEL = 'claude-sonnet-4-6';
// Sonnet outputs Russian/Cyrillic at ~2-3 tokens per word. 8000 was empirically
// too low: a 60s comedy rewrite with 28-32 gag beats in Russian + the scenes JSON
// block hit the cap and truncated before the closing ```json fence → parser failed
// ("Expected fenced json block at end of response"), Writer FAILED (SS-S15-E02 v02,
// 2026-06-02). Bumped to 16000 (matches Storyboarder; SREV is 12000) — headroom for
// verbose languages + dense beat counts, still well under the cost ceiling.
export const SCREENWRITER_MAX_TOKENS = 16000;
export const SCREENWRITER_COST_CEILING_USD = 0.5;

// Sprint φ.2 — two-step skill activation (ported from storyboarder.ts).
export const SW_SELECTION_MODEL = 'claude-haiku-4-5';
export const SW_SELECTION_MAX_TOKENS = 400;
const SKILL_SELECTION_THRESHOLD = 2;

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

// F2 (2026-06-12): findApprovedAsset → shared newest-wins resolver
// (lib/agents/upstream.ts; the local copy was an unsorted `.find()`).

export function buildUserMessage(args: {
  episodeCode: string;
  episodeTitle: string;
  briefContent: string;
  bible: SeriesBibleCanon;
  revisionNote?: string;
  activeSkillsBlock?: string;
  /**
   * Optional Episode Start Notice content — a reservoir / advisory context from
   * the Director/Producer (gag bank, extra notes, references). NOT a beat
   * contract: the brief's Key beats stay the only MUST-hit surface.
   */
  startNoticeContent?: string | null;
  /**
   * True when the episode's delivery_targets include a 9:16 vertical surface
   * (youtube_shorts / instagram_reels / tiktok). Switches the Writer to a
   * single-punch short structure instead of a multi-act long-form script.
   */
  shortsIsTarget?: boolean;
}): string {
  const { episodeCode, episodeTitle, briefContent, bible, revisionNote, activeSkillsBlock, startNoticeContent, shortsIsTarget } = args;
  const biblePromptBlock = formatBibleForPrompt(bible);
  const hasCanon = bible.total_entries > 0 || bible.general_idea !== null;
  const characterSlugs = bible.characters.map((c) => c.slug).filter(Boolean);
  const locationSlugs = bible.locations.map((l) => l.slug).filter(Boolean);
  return [
    '# Task',
    `Write the screenplay for episode ${episodeCode} — "${episodeTitle}".`,
    '',
    activeSkillsBlock && activeSkillsBlock.length > 0 ? activeSkillsBlock : '',
    activeSkillsBlock && activeSkillsBlock.length > 0 ? '' : '',
    '## Episode Brief (canonical input — APPROVED)',
    '',
    '<brief>',
    briefContent,
    '</brief>',
    '',
    startNoticeContent && startNoticeContent.trim().length > 0
      ? [
          '## Episode Start Notice (advisory reservoir — NOT a beat-contract)',
          '',
          'The Director/Producer attached extra pre-authoring material for this',
          'episode below — e.g. a large gag reservoir, references, or notes. Draw',
          'on it as relevant and select/sequence per the brief\'s arc and density.',
          'It is NOT a checklist: you are NOT required to use every item, and it',
          'does NOT override the brief. The brief\'s "Key beats" remain the only',
          'MUST-hit contract.',
          '',
          '<episode_start_notice>',
          startNoticeContent,
          '</episode_start_notice>',
          '',
        ].join('\n')
      : '',
    shortsIsTarget
      ? [
          '## SHORTS DELIVERY IS ACTIVE (short-target episode)',
          '',
          'This episode ships as a vertical (9:16) YouTube Short. Write it as ONE',
          'self-contained gag arc, NOT a multi-act long-form script:',
          '- Target runtime ~15–40 seconds total — a Short reads as a single punch,',
          '  not an anthology of gags.',
          '- Single-punch structure: ONE clear desire, ONE escalation ramp, ONE punch.',
          '  No B-plot, no second independent gag chain.',
          '- Front-load the hook: the setup must be legible in the first 1–2 seconds so',
          '  a scroller does not swipe away before the gag lands.',
          '- Keep the scene count low (typically 2–4 short scenes). Density comes from',
          '  escalation within the single arc, not from adding more beats.',
          '- `runtime_target_seconds` MUST fall in the 15–40s range; make the scene',
          '  `duration_seconds` sum to it.',
          '',
        ].join('\n')
      : '',
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
          '## Revision request from Director — HARD ACCEPTANCE CRITERIA',
          '',
          revisionNote,
          '',
          'Treat every numeric / structural item above as a HARD CONTRACT, not a hint:',
          '- explicit unit count → produce exactly that count',
          '- explicit per-unit / total duration → match within ±1s',
          '- explicit forbidden token / wording → must be absent from output',
          '- explicit pronoun / casing rule → enforce throughout BOTH the prose AND the JSON block (including assumptions and self-QA)',
          '',
          'If the revision asks for restructure (e.g. "rewrite into N short units"), perform a FULL restructure — do not "minimally tweak" the previous draft. Cosmetic edits to the previous version are a contract violation in this mode.',
          '',
          'Before finalising output, self-validate against the criteria. If any criterion fails, fix it in the same response — do NOT submit a draft you know is non-compliant with a self-QA that pretends it passes ("80s ≈ 60s within tolerance" is a failure, not tolerance).',
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
    shortsIsTarget
      ? '- SHORTS: `runtime_target_seconds` MUST be between 15 and 40 (a single-punch vertical Short) — do NOT author a long-form runtime.'
      : '',
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
  // Shorts-awareness: a 9:16 delivery surface switches the Writer to a
  // single-punch short structure (mirrors the Storyboarder's vertical-safe gate).
  const shortsIsTarget = hasVerticalDeliveryTarget(readEpisodeDeliveryTargets(inputs.episode));

  const upstream = inputs.upstream_assets as readonly UpstreamAssetLike[] | undefined;
  const briefAsset = findApprovedAsset(upstream, 'SPC-brief');
  if (!briefAsset?.content) {
    throw new ScreenwriterError(
      `Precondition failed: APPROVED SPC-brief with non-empty content not found in upstream_assets`,
    );
  }

  // Optional Episode Start Notice — a reservoir / advisory context (gag bank,
  // extra notes) the Director/Producer attached for this episode. Absent for
  // most episodes; when present it rides the same APPROVED upstream bag.
  const startNoticeAsset = findApprovedAsset(upstream, START_NOTICE_FILE_TYPE);
  const startNoticeContent =
    startNoticeAsset?.content && startNoticeAsset.content.trim().length > 0
      ? startNoticeAsset.content
      : null;

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
    notes.push('Series Bible empty — proceeding in MVP mode without canon');
  } else {
    notes.push(
      `Series Bible canon loaded: ${bible.characters.length} characters, ${bible.locations.length} locations, ${bible.styles.length} styles`,
    );
  }

  const systemPrompt = await loadSystemPrompt();

  // ── Sprint φ.2 — two-step skill activation (ported from storyboarder.ts) ──
  // Step 1: list capability manifest (frontmatter only — no body context).
  // Step 2: if the manifest is non-trivial, run a cheap Haiku selection
  //         call to let the agent pick which skills to apply. Below
  //         SKILL_SELECTION_THRESHOLD entries we skip Step 2 and activate
  //         all matching skills directly.
  // Step 3: load bodies for activated slugs and compose the Active
  //         Playbooks block injected into the main Sonnet call.
  // Non-fatal at every step: missing .claude/skills/ or empty selector
  // yields an empty block and the runner proceeds.
  const seriesGenre =
    typeof inputs.series_genre === 'string' ? inputs.series_genre : undefined;
  const seriesId =
    (inputs.episode as { series_id?: string | null } | undefined)?.series_id ?? undefined;

  const manifestResult = await getAgentSkillManifest({
    agentId: 'EXEC-SW',
    genre: seriesGenre,
    series_id: seriesId ?? undefined,
    episode_id: inputs.episode_id,
  });

  let activatedSlugs: readonly string[] = [];
  let selectionCostUsd = 0;
  let selectionSkipped = true;

  if (manifestResult.count > 0) {
    if (manifestResult.count <= SKILL_SELECTION_THRESHOLD) {
      activatedSlugs = manifestResult.available.map((m) => m.slug);
      notes.push(
        `Skill selection skipped — ${manifestResult.count} matching skill${manifestResult.count === 1 ? '' : 's'} ≤ threshold (${SKILL_SELECTION_THRESHOLD}); activated all`,
      );
    } else {
      const selectionPrompt = composeSkillSelectionPrompt(
        manifestResult.available,
        `Writing screenplay for episode ${episodeCode} "${episodeTitle}" (${manifestResult.count} candidate skills)`,
      );
      try {
        const selectionResult = await generateAnthropicText({
          systemPrompt:
            'You are EXEC-SW (Screenwriter) preparing for a screenplay authoring task. Your only job in this turn is to pick which craft playbooks to activate from your repertoire.',
          userMessage: selectionPrompt,
          model: SW_SELECTION_MODEL,
          maxOutputTokens: SW_SELECTION_MAX_TOKENS,
          expectsJson: false,
        });
        selectionCostUsd = selectionResult.costUsd;
        const parsed = parseSkillSelection(selectionResult.markdown);
        const knownSlugs = new Set(manifestResult.available.map((m) => m.slug));
        activatedSlugs = parsed.slugs.filter((s) => knownSlugs.has(s));
        selectionSkipped = false;
        notes.push(
          `Skill selection (${SW_SELECTION_MODEL}): ${activatedSlugs.length}/${manifestResult.count} activated · source=${parsed.source} · cost $${selectionCostUsd.toFixed(4)}`,
        );
        if (parsed.error) {
          notes.push(`Skill selection parse note: ${parsed.error}`);
        }
      } catch (err) {
        // Step 2 failure must not block the main authoring call. Fall back
        // to activating all matching skills — equivalent to pre-φ behaviour.
        activatedSlugs = manifestResult.available.map((m) => m.slug);
        const msg = err instanceof Error ? err.message : String(err);
        notes.push(`Skill selection failed (${msg.slice(0, 200)}); activated all ${manifestResult.count} as fallback`);
      }
    }
  }

  const bodiesResult = await loadAgentSkillBodies(activatedSlugs);
  if (bodiesResult.loaded.length > 0) {
    notes.push(
      `Active playbooks loaded: ${bodiesResult.loaded.map((s) => s.slug).join(', ')} (${bodiesResult.totalChars} chars${bodiesResult.truncatedCount > 0 ? ` · ${bodiesResult.truncatedCount} truncated for budget` : ''})`,
    );
  }
  const activeSkillsBlock = composeActivePlaybooksBlock(bodiesResult.loaded);

  const userMessage = buildUserMessage({
    episodeCode,
    episodeTitle,
    briefContent: briefAsset.content,
    bible,
    revisionNote,
    activeSkillsBlock,
    startNoticeContent,
    shortsIsTarget,
  });
  if (startNoticeContent) {
    notes.push(
      `Episode Start Notice loaded (${startNoticeContent.length} chars) — advisory reservoir injected`,
    );
  }
  if (shortsIsTarget) {
    notes.push('SHORTS delivery active — single-punch short structure (~15–40s) enforced in prompt');
  }

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

  const totalCostUsd = result.costUsd + selectionCostUsd;
  const selectionTag = selectionSkipped
    ? ''
    : ` (+$${selectionCostUsd.toFixed(4)} skill selection)`;
  const description = `Produced by EXEC-SW · ${SCREENWRITER_CONTRACT} · ${result.model} · cost $${totalCostUsd.toFixed(4)}${selectionTag} · ${result.usage.inputTokens}→${result.usage.outputTokens} tokens`;

  return {
    markdown: result.markdown,
    body: result.body,
    costUsd: totalCostUsd,
    model: result.model,
    contract: SCREENWRITER_CONTRACT,
    briefAssetId: briefAsset.id ?? null,
    description,
    notes,
  };
}
