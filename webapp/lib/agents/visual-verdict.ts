// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/visual-verdict.ts
// Core of the post-render Visual Critic — the factory's EYES.
//
// The text critics judge the PLAN before render; this looks at the rendered PIXELS
// after render and judges them against the storyboard shot contract + style Bible,
// via the `visual-shot-verdict` rubric skill. Reused by BOTH the calibration script
// (scripts/visual-critic-check.ts) and the in-pipeline runner
// (runners/visual-shot-critic.ts). NO new infra — the vision call reuses the OpenAI
// SDK client shape the concierge uses (openai/gemini/anthropic by model prefix).
// ──────────────────────────────────────────────────────────────────────────────

import * as fs from 'node:fs';
import * as path from 'node:path';
import OpenAI from 'openai';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/types.gen';
import { computeCostUsd } from '../providers/anthropic-text';

type Client = SupabaseClient<Database>;

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/openai/';
const ANTHROPIC_BASE = 'https://api.anthropic.com/v1/';

export interface VisualFinding {
  check:
    | 'equipment_completeness'
    | 'activity_coherence'
    | 'physics_geometry'
    | 'anatomy_on_model'
    | 'contract_fidelity'
    | 'style_genre'
    | string;
  severity: 'critical' | 'major' | 'minor' | string;
  character?: string;
  what_seen: string;
  what_expected: string;
}

export interface VisualVerdict {
  verdict: 'PASS' | 'REVISE' | 'FAIL';
  findings: VisualFinding[];
  summary: string;
}

/**
 * Token usage + priced cost of ONE vision call (2026-07-25).
 *
 * The visual critic is a genuinely expensive agent — a whole-episode sweep sends
 * ~50 reference images plus 10 frames per video shot to a vision model — and its
 * `usage` was previously read off the response and dropped on the floor, so none
 * of it reached budget_log. Every Director press of "check whole episode" spent
 * real money the Budget tab could not see. Callers record this.
 */
export interface VisualVerdictUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  model: string;
}

export interface MeteredVisualVerdict {
  verdict: VisualVerdict;
  usage: VisualVerdictUsage;
}

/** Resolve the rubric skill file across worktree layouts (webapp cwd → repo root). */
function rubricPath(): string {
  const candidates = [
    path.resolve(process.cwd(), '..', '.claude', 'skills', 'visual-shot-verdict', 'SKILL.md'),
    path.resolve(process.cwd(), '.claude', 'skills', 'visual-shot-verdict', 'SKILL.md'),
    'C:/SandyStudio/.claude/skills/visual-shot-verdict/SKILL.md',
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return candidates[0]!;
}

let _rubricCache: string | null = null;
function loadRubric(): string {
  if (_rubricCache !== null) return _rubricCache;
  _rubricCache = fs.readFileSync(rubricPath(), 'utf8');
  return _rubricCache;
}

/** Vision client + token param, provider inferred from model prefix (mirrors concierge llm.ts). */
function visionClient(model: string): { client: OpenAI; tokenParam: Record<string, number> } {
  if (model.startsWith('gemini')) {
    return { client: new OpenAI({ apiKey: process.env.GEMINI_API_KEY, baseURL: GEMINI_BASE }), tokenParam: { max_tokens: 1800 } };
  }
  if (model.startsWith('claude')) {
    return { client: new OpenAI({ apiKey: process.env.ANTHROPIC_API_KEY, baseURL: ANTHROPIC_BASE }), tokenParam: { max_tokens: 1800 } };
  }
  return { client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }), tokenParam: { max_completion_tokens: 1800 } };
}

/**
 * Judge rendered frames against a shot contract + style canon using the vision model.
 * `frames` are base64 PNGs (one for an image ref, several for a video — from clip-frames).
 * Returns the structured verdict. Throws only on a hard model/parse failure — callers in
 * advisory mode should catch and degrade to a logged note.
 */
export async function runVisualVerdict(opts: {
  frames: string[];
  contract: unknown;
  styleCanon: string;
  /** Location Bible for the shot's location — the spatial ground-truth (where the
   *  set-dressing sits, left/right) so the physics_geometry check can catch a
   *  mirrored/flipped layout. '(no location canon)' when the location has no Bible. */
  locationCanon?: string;
  model: string;
}): Promise<VisualVerdict> {
  return (await runVisualVerdictMetered(opts)).verdict;
}

/**
 * Same call as `runVisualVerdict`, but returns the priced token usage alongside
 * the verdict so the caller can write a budget_log row. Prefer this anywhere the
 * critic runs against the live studio; the plain wrapper above exists for the
 * calibration script, which spends the Director's own key outside the ledger.
 */
export async function runVisualVerdictMetered(opts: {
  frames: string[];
  contract: unknown;
  styleCanon: string;
  locationCanon?: string;
  model: string;
}): Promise<MeteredVisualVerdict> {
  const { frames, contract, styleCanon, locationCanon, model } = opts;
  if (frames.length === 0) throw new Error('runVisualVerdict: no frames');
  const { client, tokenParam } = visionClient(model);

  const promptText =
    `SHOT CONTRACT (storyboard — the intent to verify against):\n${JSON.stringify(contract, null, 2)}\n\n` +
    `STYLE CANON (Bible — style/genre/on-model reference):\n${styleCanon.slice(0, 6000)}\n\n` +
    `LOCATION CANON (Bible — spatial layout / set-dressing positions for the shot's location; use it to verify left/right placement and to catch a horizontally-mirrored render):\n${(locationCanon ?? '(no location canon)').slice(0, 4000)}\n\n` +
    `Judge the attached ${frames.length > 1 ? 'video frames (in order)' : 'reference image'} against the contract and canon using the rubric. ` +
    `Run every check IN ORDER. Output ONLY the JSON verdict object, no prose around it.`;

  const res = await client.chat.completions.create({
    model,
    ...tokenParam,
    messages: [
      { role: 'system', content: loadRubric() },
      {
        role: 'user',
        content: [
          { type: 'text', text: promptText },
          ...frames.map((b64) => ({ type: 'image_url' as const, image_url: { url: `data:image/png;base64,${b64}` } })),
        ],
      },
    ],
  });

  // Price the call BEFORE parsing: the tokens are billed whether or not the model
  // returned parseable JSON, so a parse failure must not swallow the cost. The
  // caller records what it gets from the thrown-path too (see visual-shot-critic).
  const inputTokens = res.usage?.prompt_tokens ?? 0;
  const outputTokens = res.usage?.completion_tokens ?? 0;
  const usage: VisualVerdictUsage = {
    inputTokens,
    outputTokens,
    costUsd: computeCostUsd({ inputTokens, outputTokens }, model),
    model,
  };

  const raw = res.choices[0]?.message?.content ?? '';
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new VisualVerdictParseError(
      `visual verdict: model returned no JSON: ${raw.slice(0, 200)}`,
      usage,
    );
  }
  const parsed = JSON.parse(jsonMatch[0]) as VisualVerdict;
  if (!parsed.verdict) {
    throw new VisualVerdictParseError('visual verdict: missing "verdict" field', usage);
  }
  parsed.findings = Array.isArray(parsed.findings) ? parsed.findings : [];
  return { verdict: parsed, usage };
}

/**
 * Thrown when the vision call succeeded (and was BILLED) but its output could not
 * be parsed into a verdict. Carries the usage so the caller still records the
 * spend — a wasted call is exactly the spend the Director most wants to see.
 */
export class VisualVerdictParseError extends Error {
  readonly usage: VisualVerdictUsage;
  constructor(message: string, usage: VisualVerdictUsage) {
    super(message);
    this.name = 'VisualVerdictParseError';
    this.usage = usage;
  }
}

/** The shot's authoring contract, pulled from the episode's APPROVED storyboard JSON block. */
export async function loadShotContract(
  supabase: Client,
  episodeId: string,
  shotId: string,
): Promise<unknown | null> {
  const { data } = await supabase
    .from('assets')
    .select('content')
    .eq('episode_id', episodeId)
    .like('file_type', 'STB%')
    .in('status', ['APPROVED', 'LOCKED'])
    .order('version', { ascending: false })
    .limit(1);
  const content = (data ?? [])[0]?.content as string | undefined;
  if (!content) return null;
  const jsonMatch = content.match(/```json\s*([\s\S]*?)```/);
  if (!jsonMatch) return null;
  let board: { acts?: Array<{ shots?: Array<{ shot_id?: string }> }> };
  try {
    board = JSON.parse(jsonMatch[1]!);
  } catch {
    return null;
  }
  const want = shotId.toUpperCase();
  for (const act of board.acts ?? []) {
    for (const shot of act.shots ?? []) {
      if (String(shot.shot_id ?? '').toUpperCase().endsWith(want)) return shot;
    }
  }
  return null;
}

/** Style/on-model canon for a series — the LOCKED/APPROVED SBL-style docs. */
export async function loadStyleCanon(supabase: Client, seriesId: string): Promise<string> {
  const { data } = await supabase
    .from('assets')
    .select('content,file_type')
    .eq('series_id', seriesId)
    .like('file_type', 'SBL-style%')
    .in('status', ['APPROVED', 'LOCKED'])
    .limit(3);
  const rows = (data ?? []) as Array<{ content: string | null; file_type: string }>;
  return rows.map((r) => `## ${r.file_type}\n${r.content ?? ''}`).join('\n\n') || '(no style doc)';
}

/**
 * Location Bible for a shot's location — the spatial ground-truth (set-dressing
 * positions, left/right arrangement) the critic checks the render against, so a
 * horizontally-mirrored layout (canonical table on the right rendered on the left)
 * is caught. Fuzzy-matches `SBL-location%<slug>%`. Returns a clear "(no location
 * canon…)" note when the location has no Bible (a phantom location) so the critic
 * does not invent a layout to judge against.
 */
export async function loadLocationCanon(
  supabase: Client,
  seriesId: string,
  locationSlug: string | null,
): Promise<string> {
  if (!locationSlug) return '(no location specified in the shot contract)';
  const slug = locationSlug.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const { data } = await supabase
    .from('assets')
    .select('content,file_type')
    .eq('series_id', seriesId)
    .ilike('file_type', `SBL-location%${slug}%`)
    .in('status', ['APPROVED', 'LOCKED'])
    .limit(2);
  const rows = (data ?? []) as Array<{ content: string | null; file_type: string }>;
  if (rows.length === 0) {
    return `(no location canon for "${slug}" — phantom location, no spatial ground-truth; do NOT flag left/right placement against an assumed layout)`;
  }
  return rows.map((r) => `## ${r.file_type}\n${r.content ?? ''}`).join('\n\n');
}
