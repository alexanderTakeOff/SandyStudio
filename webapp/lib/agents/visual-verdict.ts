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
  model: string;
}): Promise<VisualVerdict> {
  const { frames, contract, styleCanon, model } = opts;
  if (frames.length === 0) throw new Error('runVisualVerdict: no frames');
  const { client, tokenParam } = visionClient(model);

  const promptText =
    `SHOT CONTRACT (storyboard — the intent to verify against):\n${JSON.stringify(contract, null, 2)}\n\n` +
    `STYLE CANON (Bible — style/genre/on-model reference):\n${styleCanon.slice(0, 6000)}\n\n` +
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

  const raw = res.choices[0]?.message?.content ?? '';
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`visual verdict: model returned no JSON: ${raw.slice(0, 200)}`);
  const parsed = JSON.parse(jsonMatch[0]) as VisualVerdict;
  if (!parsed.verdict) throw new Error('visual verdict: missing "verdict" field');
  parsed.findings = Array.isArray(parsed.findings) ? parsed.findings : [];
  return parsed;
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
