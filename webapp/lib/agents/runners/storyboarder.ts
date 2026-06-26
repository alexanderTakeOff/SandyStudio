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
//   - body: storyboard_v1 with N acts × shots[] (N = the script's act count,
//     read from its Act headers — not assumed; see countScriptActs)
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
import {
  getAgentSkillManifest,
  loadAgentSkillBodies,
  composeSkillSelectionPrompt,
  composeActivePlaybooksBlock,
} from '../load-skills';
import { parseSkillSelection } from '../../skills/parse-skill-selection';
import { findApprovedAsset } from '../upstream';
import { SHOT_ID_RE, canonicalShotId, episodeShort } from '../../api/shot-id';

export const SB_CONTRACT = 'storyboarder@v2';
// 2026-05-20 — upgraded sonnet-4-6 → opus-4-7 per Director directive.
// Sonnet kept producing cosmetic-only re-writes when asked to apply a
// hard-contract revisionNote (Polina: «revision не выполнен как надо»);
// Opus has stronger instruction-following on structured-removal prompts.
// Cost delta: storyboard is one call per episode (not fan-out), so the
// ~5× per-call jump lands at ~$0.30-0.80 / episode vs ~$0.06-0.16.
export const SB_MODEL = 'claude-opus-4-7';
// Sprint φ.2 — two-step skill activation. Step 1 uses Haiku (cheap, fast,
// reasons over capability manifest only — no body context). Step 2 is the
// existing Sonnet 4.6 main authoring call. Skipped (single-call shortcut)
// when manifest has ≤ SKILL_SELECTION_THRESHOLD entries.
export const SB_SELECTION_MODEL = 'claude-haiku-4-5';
export const SB_SELECTION_MAX_TOKENS = 400;
const SKILL_SELECTION_THRESHOLD = 2;
// v2 contract carries per-character expected_emotion/expected_action/role_in_shot
// + shot_role + expected_gag + structured location, on top of the v1 fields.
// For a 14-shot episode with full Bible canon in input, Sonnet legitimately
// needs ~12-14K output tokens to emit the markdown report + complete JSON block.
// 8K (the v1 budget) hit max_tokens mid-JSON and caused infinite retries.
// Sonnet 4.6 supports up to 64K output tokens; 24K is comfortable headroom
// once ACTIVE SKILLS block (σ.1 2026-05-15) lands in the prompt — observed
// 60K-char markdown output on a 22-shot E21 v03 attempt with SKILLS injected.
export const SB_MAX_TOKENS = 24000;
export const SB_COST_CEILING_USD = 1.0;

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

// F2 (2026-06-12): findApprovedAsset → shared newest-wins resolver
// (lib/agents/upstream.ts; was a local copy, one of ten).

/**
 * 2026-06-22 — number of acts the screenplay defines, read from its
 * "## Act N" / "### Act N" headers. The act count is NARRATIVE STRUCTURE owned
 * by the script (Writer), NOT a constant the Storyboarder may assume
 * (CLAUDE.md §11 Rule 8; skill-creation.md abstraction principle). Every episode
 * through S15-E10 happened to be 3 acts, which masked a hardcoded "exactly 3
 * acts" until E11 — the first 4-act script — drifted: Act-4 shots got filed
 * under act:3 with A4 shot_ids. Returns the count of distinct act numbers; 0
 * when the script carries no parseable Act header (caller falls back).
 */
export function countScriptActs(scriptContent: string): number {
  const nums = new Set<number>();
  for (const m of (scriptContent || '').matchAll(/^#{1,4}\s*Act\s+(\d+)\b/gim)) {
    nums.add(Number(m[1]));
  }
  return nums.size;
}

// Shot identity (SHOT_ID_RE / episodeShort / canonicalShotId) lives in the single
// source of truth `lib/api/shot-id.ts` — imported above. Only the SH-counter
// capture used by the continuity postcondition below is local to the validator.
/** SH counter capture used by {@link collectShotIdViolations}. */
const SHOT_ID_TAIL_RE = /-SH(\d+)$/i;

/**
 * Verify the shot_id numbering AFTER {@link renumberShotsContinuous} has run.
 *
 * renumberShotsContinuous *forces* episode-continuous SH numbering, but it has
 * no self-check: if a shot_id lacks the canonical `-A<n>-SC<nn>-SH<nn>` tail its
 * regex misses and the id is left untouched (storyboarder.ts fallback) — so a
 * malformed or duplicate id can slip through silently. That is exactly the E11
 * class of defect (gap #1: ~33 shots sharing bare SH01 because gemini reset SH
 * per scene) and the gap #12 lesson — an invariant must verify ALL
 * representations, not assume the forcing step worked. This helper is the
 * verifying postcondition, mirroring the act-count triple invariant.
 *
 * Returns a list of human-readable violations (empty = valid). Pure function;
 * the caller turns a non-empty result into a loud HALT.
 *
 * Rules (across acts[].shots[] in order, 1-based position N):
 *   - every shot_id matches `^S\d+-E\d+-SH\d+$` (else: malformed — rejects the
 *     legacy `SS-…-A…-SC…-SH…` compound, which is exactly the point);
 *   - the SH number equals its episode position N (else: not continuous);
 *   - every shot_id is globally unique within the episode (else: duplicate).
 */
export function collectShotIdViolations(
  body: { acts?: unknown } | null | undefined,
): string[] {
  const acts = Array.isArray(body?.acts) ? (body!.acts as unknown[]) : [];
  const violations: string[] = [];
  const seen = new Set<string>();
  let position = 0;
  for (const act of acts) {
    const shots = Array.isArray((act as { shots?: unknown[] }).shots)
      ? (act as { shots: unknown[] }).shots
      : [];
    for (const sh of shots) {
      position += 1;
      const id = (sh as { shot_id?: unknown }).shot_id;
      if (typeof id !== 'string' || id.length === 0) {
        violations.push(`shot #${position} has no shot_id`);
        continue;
      }
      if (seen.has(id)) {
        violations.push(`duplicate shot_id: ${id}`);
      } else {
        seen.add(id);
      }
      if (!SHOT_ID_RE.test(id)) {
        violations.push(
          `malformed shot_id (expected S<season>-E<episode>-SH<NN>): ${id}`,
        );
        continue;
      }
      const m = SHOT_ID_TAIL_RE.exec(id);
      const shNum = m ? Number(m[1]) : NaN;
      if (shNum !== position) {
        violations.push(
          `shot_id ${id} has SH${m ? m[1] : '??'}, expected SH${String(position).padStart(2, '0')} (episode-continuous)`,
        );
      }
    }
  }
  return violations;
}

function buildUserMessage(args: {
  episodeCode: string;
  episodeTitle: string;
  briefContent: string;
  scriptContent: string;
  scriptVersion: number;
  bible: SeriesBibleCanon;
  /** Sprint γ 2026-05-15 — approve-with-notes propagation. Notes the
   *  Director attached when approving upstream assets (script, brief, etc.).
   *  Render as a hard-contract block so the model treats them as
   *  acceptance criteria, not polish hints. */
  upstreamNotes?: ReadonlyArray<{ label: string; note: string }>;
  /** Sprint σ.1 2026-05-15 — Director-canon skills resolved for this run.
   *  Pre-formatted ACTIVE SKILLS markdown block. Empty string = no skills
   *  matched (no genre, no .claude/skills dir, or all skills DRAFT). */
  activeSkillsBlock?: string;
  /**
   * 2026-05-20 — Director's surgical revision note. When this run was
   * triggered by requestRevision, Polina (or the Director) provides a
   * specific list of fixes. Treat it as the strongest acceptance gate —
   * each item must be visibly addressed in the new storyboard. Without
   * this block (before today), the runner re-generated against the same
   * inputs and produced cosmetic-only diffs — Polina kept reporting
   * 'revision не выполнен как надо'.
   */
  revisionNote?: string;
}): string {
  const { episodeCode, episodeTitle, briefContent, scriptContent, scriptVersion, bible, upstreamNotes, activeSkillsBlock, revisionNote } = args;
  const biblePromptBlock = formatBibleForPrompt(bible);
  const hasCanon = bible.total_entries > 0 || bible.general_idea !== null;
  const characterSlugs = bible.characters.map((c) => c.slug).filter(Boolean);
  const locationSlugs = bible.locations.map((l) => l.slug).filter(Boolean);
  const objectSlugs = (bible.objects ?? []).map((o) => o.slug).filter(Boolean);
  const notesBlock =
    upstreamNotes && upstreamNotes.length > 0
      ? [
          '## DOWNSTREAM NOTES FROM PREVIOUS GATE (Director, MANDATORY)',
          '',
          'The Director approved upstream artefacts on condition that the following',
          'notes carry into this storyboard. Treat each line as a HARD acceptance',
          'criterion — your output must visibly satisfy every numbered item, not',
          'just acknowledge it. If a note demands a beat the script omits, ADD that',
          'beat to the storyboard (you have authority within the same total runtime).',
          '',
          ...upstreamNotes.map(
            (n, i) => `${i + 1}. (from ${n.label} approval): ${n.note}`,
          ),
          '',
        ].join('\n')
      : '';
  // Director's surgical revision note (when re-fired by requestRevision).
  // Top of the prompt because it OVERRIDES every other instruction below
  // for the specific items it names. Each numbered line = a hard fix.
  const revisionBlock = revisionNote && revisionNote.trim().length > 0
    ? [
        '## REVISION NOTE — HARD CONTRACT FROM DIRECTOR',
        '',
        'This run was triggered by requestRevision on the prior storyboard',
        'version. The Director / Prod Assistant flagged specific issues that the',
        'previous version FAILED to address. The new storyboard MUST visibly',
        'satisfy every item below. Acknowledging without changing the output',
        'is a fail; cosmetic re-wording is a fail. Each numbered point is an',
        'acceptance gate.',
        '',
        'If a point demands removing existing material — REMOVE IT.',
        'If a point demands replacing existing material — REPLACE IT exactly.',
        'If a point demands a new beat — ADD IT within the existing runtime.',
        '',
        '<director_revision_note>',
        revisionNote.trim(),
        '</director_revision_note>',
        '',
      ].join('\n')
    : '';
  // 2026-06-22 — act count is read from the script, never assumed. Drives the
  // template headers, the JSON example, and the hard rule below so a 4-act (or
  // 5-act) script produces the matching number of act-objects instead of being
  // forced into a hardcoded 3 (the E11 root cause).
  const actCount = Math.max(1, countScriptActs(scriptContent) || 3);
  // Identity space drops the SS studio prefix (q2): schema example + hard rule
  // below show shot_ids as `S15-E12-SH01`, never `SS-…-A…-SC…`. The runner
  // re-mints them deterministically by position anyway, but a correct example
  // keeps the model's intermediate references consistent.
  const epShort = episodeShort(episodeCode);
  const actTemplateLines: string[] = [];
  for (let a = 1; a <= actCount; a++) {
    actTemplateLines.push(`## ACT ${a} — <act beat summary>`);
    actTemplateLines.push(
      a === 1
        ? '<for each shot: shot id, camera, location, action prose, duration, key beat>'
        : '<same>',
    );
    if (a < actCount) actTemplateLines.push('');
  }
  const actJsonExampleLines: string[] = [];
  for (let a = 2; a <= actCount; a++) {
    actJsonExampleLines.push(`    { "act": ${a}, ... }${a < actCount ? ',' : ''}`);
  }
  return [
    '# Task',
    `Break the screenplay below into a shot-by-shot storyboard for episode ${episodeCode} — "${episodeTitle}".`,
    '',
    activeSkillsBlock && activeSkillsBlock.length > 0 ? activeSkillsBlock : '',
    activeSkillsBlock && activeSkillsBlock.length > 0 ? '' : '',
    revisionBlock,
    notesBlock,
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
    ...actTemplateLines,
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
    `          "shot_id": "${epShort}-SH01",`,
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
    hasCanon && objectSlugs.length > 0
      ? `          "props_in_frame": [<zero or more canon prop slugs visible in this shot, each one of: ${objectSlugs.join(', ')}. These attach the canonical prop reference image so the prop is not hallucinated. Use [] if no canon prop is on screen.>],`
      : '          "props_in_frame": [<zero or more prop slugs visible in this shot, lowercase_with_underscores, or [] if none>],',
    '          "action_prose": "<one paragraph of visual action — what is on screen, written for the storyboard reader. Can include all characters and props in motion. This is your prose narration of the shot.>",',
    '          "duration_seconds": <integer>,',
    '          "key_beat": "<which brief beat this shot delivers, OR \\"transition\\" / \\"setup\\">",',
    '          "continuity_notes": "<what must match the prior shot — pose, prop state, lighting>"',
    '        }',
    '      ]',
    '    },',
    ...actJsonExampleLines,
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
    `- Exactly ${actCount} act${actCount === 1 ? '' : 's'} in \`acts[]\` — matching the ${actCount} acts of the script above. No more, no fewer. Put each shot in its correct act object (an Act-4 shot belongs in the act:4 object, never folded into act:3).`,
    `- Every shot needs a unique \`shot_id\` of the form \`<series>-<episode>-SH<NN>\` — exactly like \`${epShort}-SH01\`. Number SH continuously across the WHOLE episode in shot order (SH01, SH02, SH03 …), never resetting per scene. Do NOT put a studio prefix, act, or scene in the shot_id — act lives in the act object only.`,
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
    hasCanon && objectSlugs.length > 0
      ? `- \`props_in_frame\` MUST list every canon prop physically visible in the shot, by exact slug from: ${objectSlugs.join(', ')}. This is what attaches the prop's canonical reference image at generation time — a prop omitted here will be hallucinated (wrong button count, wrong shape). A prop named only in \`action_prose\` but absent from \`props_in_frame\` will NOT be locked. Use [] when no canon prop is on screen.`
      : '- `props_in_frame` lists prop slugs visible in the shot, or [] if none.',
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
  /**
   * Director's surgical revision note from requestRevision flow. When set,
   * the agent treats it as a HARD CONTRACT — top priority over normal
   * upstream notes. Was silently ignored before 2026-05-20; Polina kept
   * surfacing 'revision не выполнен как надо' because the note never
   * reached this runner. Symmetric with runScreenwriter / EREF Designer /
   * Animator / GAGAD revisionNote pipelines.
   */
  revisionNote?: string;
}

/**
 * Force EPISODE-CONTINUOUS SH numbering across the whole storyboard
 * (SH01, SH02, … in shot order), preserving each shot's `A<n>-SC<nn>` prefix.
 *
 * The storyboarder LLM is NOT consistent about the SH counter: opus numbered SH
 * continuously across the episode (E10: …SC02-SH05, SC03-SH07), gemini resets SH
 * per scene (E11: every scene restarts at SH01). That drift breaks ordering /
 * tracking by SH and differs episode-to-episode. We make it deterministic in code
 * regardless of model (Director directive 2026-06-19 q14a: SH is episode-continuous,
 * never per-scene).
 *
 * Mutates `body.acts[].shots[].shot_id` in place and rewrites the markdown. Each
 * id is RECONSTRUCTED from scratch by episode position — `canonicalShotId` —
 * rather than patched, so whatever the model emitted (compound, SS-prefixed,
 * per-scene-reset, malformed) is overwritten with the deterministic
 * `S{season}-E{episode}-SH{position}`. The markdown rewrite is a two-pass
 * placeholder swap so a freshly-assigned id can never clobber an
 * as-yet-unprocessed old id. Returns the renumbered markdown.
 */
function renumberShotsContinuous(
  markdown: string,
  body: Record<string, unknown>,
  episodeCode: string,
): string {
  const acts = Array.isArray(body.acts) ? (body.acts as unknown[]) : [];
  const idMap = new Map<string, string>(); // old shot_id → new shot_id
  let counter = 0;
  for (const act of acts) {
    const shots = Array.isArray((act as { shots?: unknown[] }).shots)
      ? ((act as { shots: unknown[] }).shots)
      : [];
    for (const sh of shots) {
      const shot = sh as { shot_id?: unknown };
      if (typeof shot.shot_id !== 'string') continue;
      counter += 1;
      const oldId = shot.shot_id;
      const newId = canonicalShotId(episodeCode, counter);
      shot.shot_id = newId;
      if (newId !== oldId) idMap.set(oldId, newId);
    }
  }
  if (idMap.size === 0) return markdown;
  let out = markdown;
  const fromPlaceholder = new Map<string, string>();
  let p = 0;
  for (const [oldId, newId] of idMap) {
    const ph = ` SHID${p++} `;
    fromPlaceholder.set(ph, newId);
    out = out.split(oldId).join(ph);
  }
  for (const [ph, newId] of fromPlaceholder) {
    out = out.split(ph).join(newId);
  }
  return out;
}

export async function runStoryboarder(
  args: StoryboarderRunArgs,
): Promise<StoryboarderRunResult> {
  const { inputs, revisionNote } = args;

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

  // Sprint γ 2026-05-15 — surface upstream approval notes (script + brief).
  const approvalNotesMap =
    (inputs.upstream_approval_notes as Record<string, string> | undefined) ?? {};
  const upstreamNotes: Array<{ label: string; note: string }> = [];
  if (scriptAsset.id && approvalNotesMap[scriptAsset.id]) {
    upstreamNotes.push({ label: `script v${scriptAsset.version ?? 1}`, note: approvalNotesMap[scriptAsset.id]! });
  }
  if (briefAsset.id && approvalNotesMap[briefAsset.id]) {
    upstreamNotes.push({ label: `brief v${briefAsset.version ?? 1}`, note: approvalNotesMap[briefAsset.id]! });
  }
  // SREV review notes — find any REV-* asset that was APPROVED and has a note.
  // SREV's note is the canonical "what to fix" carrier from Story Editor.
  for (const a of (upstream ?? [])) {
    if (!a.file_type?.startsWith('REV-')) continue;
    if (a.status !== 'APPROVED') continue;
    if (!a.id) continue;
    const n = approvalNotesMap[a.id];
    if (!n) continue;
    upstreamNotes.push({ label: `${a.file_type} v${a.version ?? 1}`, note: n });
  }

  const systemPrompt = await loadSystemPrompt();

  // ── Sprint φ.2 — two-step skill activation ─────────────────────────────
  // Step 1: list capability manifest (frontmatter only — no body context).
  // Step 2: if the manifest is non-trivial, run a cheap Haiku selection
  //         call to let the agent pick which skills to apply. Below
  //         SKILL_SELECTION_THRESHOLD entries we skip Step 1 and activate
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
    agentId: 'EXEC-SB',
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
        `Storyboarding episode ${episodeCode} "${episodeTitle}" (${manifestResult.count} candidate skills)`,
      );
      try {
        const selectionResult = await generateAnthropicText({
          systemPrompt:
            'You are EXEC-SB (Storyboard Artist) preparing for a storyboard authoring task. Your only job in this turn is to pick which craft playbooks to activate from your repertoire.',
          userMessage: selectionPrompt,
          model: SB_SELECTION_MODEL,
          maxOutputTokens: SB_SELECTION_MAX_TOKENS,
          expectsJson: false,
        });
        selectionCostUsd = selectionResult.costUsd;
        const parsed = parseSkillSelection(selectionResult.markdown);
        const knownSlugs = new Set(manifestResult.available.map((m) => m.slug));
        activatedSlugs = parsed.slugs.filter((s) => knownSlugs.has(s));
        selectionSkipped = false;
        notes.push(
          `Skill selection (${SB_SELECTION_MODEL}): ${activatedSlugs.length}/${manifestResult.count} activated · source=${parsed.source} · cost $${selectionCostUsd.toFixed(4)}`,
        );
        if (parsed.error) {
          notes.push(`Skill selection parse note: ${parsed.error}`);
        }
      } catch (err) {
        // Step 1 failure must not block the main authoring call. Fall back
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
    scriptContent: scriptAsset.content,
    scriptVersion: scriptAsset.version ?? 1,
    bible,
    upstreamNotes,
    activeSkillsBlock,
    revisionNote,
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
  // q14a (2026-06-19): force episode-continuous SH numbering regardless of model
  // (gemini resets SH per scene; opus ran it continuous). Mutates body.acts shot_ids
  // in place (so `acts` + validation below see the new ids) and rewrites markdown.
  result.markdown = renumberShotsContinuous(result.markdown, result.body, episodeCode);
  // Act-structure integrity (2026-06-22, E11 root cause; simplified 2026-06-26).
  // The act count is owned by the script, never assumed here. Act is no longer
  // part of the shot_id (refactor q2), so the old triple invariant collapses to
  // a DOUBLE one: act-objects === script's Act-header count. The "shot_id act
  // prefix === act object" cross-check is gone by construction — a shot's act is
  // now ONLY its act object, it can no longer disagree with a duplicated copy in
  // the id. HALTs loudly at generation if the board carries the wrong act count.
  const scriptActs = countScriptActs(scriptAsset.content);
  if (scriptActs > 0 && acts.length !== scriptActs) {
    throw new StoryboarderError(
      `Postcondition failed: act structure inconsistent — ${acts.length} act object(s) ` +
        `but the script defines ${scriptActs} act(s). The act count is script-owned; ` +
        `the storyboard must carry exactly that many act objects.`,
    );
  }

  // shot_id numbering integrity (E11 root cause, gap #1). renumberShotsContinuous
  // above FORCES episode-continuous SH numbering but does not self-verify — a
  // malformed prefix slips past its regex untouched. Confirm every shot_id is
  // canonical, SH-continuous (1..N), and unique, else HALT loudly here rather
  // than letting per-scene SH01 duplicates poison the feed downstream.
  const shotIdProblems = collectShotIdViolations(result.body);
  if (shotIdProblems.length > 0) {
    throw new StoryboarderError(
      `Postcondition failed: shot_id numbering invalid after renumber — ${shotIdProblems.join('; ')}`,
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

  const totalCostUsd = result.costUsd + selectionCostUsd;
  const selectionTag = selectionSkipped
    ? ''
    : ` (+$${selectionCostUsd.toFixed(4)} skill selection)`;
  const description = `Produced by EXEC-SB · ${SB_CONTRACT} · ${result.model} · ${totalShots} shots / ${totalDurationS}s · cost $${totalCostUsd.toFixed(4)}${selectionTag} · ${result.usage.inputTokens}→${result.usage.outputTokens} tokens`;

  return {
    markdown: result.markdown,
    body: result.body,
    costUsd: totalCostUsd,
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
