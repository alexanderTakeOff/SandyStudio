// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/runners/eref-check.ts
// EXEC-EREF-CHECK — post-generation AI reviewer for Episode References v2.
//
// Runs immediately after a MultiImageGenProvider produces a shot reference.
// Compares the candidate image against:
//   - the shot test plan (per-character expected_emotion + expected_action +
//     role_in_shot + expected_gag) carried in metadata.shot_reference.test_plan
//   - the LOCKED Bible reference images for each character / location / style
//
// Returns a structured EREFReview verdict that drives the runner's loop:
//   APPROVE        → land in REVIEW (Mode 1-3) or APPROVED (Mode 4)
//   REGENERATE     → auto-retry (≤2 retries) with suggested_prompt_v2
//   HUMAN_REVIEW   → land in REVIEW (Director must judge by eye)
//
// Mirrors style-check.ts patterns (skip on no key / no canon / parser hiccup,
// fall back to PASS so a checker outage never blocks production).
// ──────────────────────────────────────────────────────────────────────────────

import {
  AnthropicTextError,
} from '../providers/anthropic-text';
import { generateAnthropicVision, type VisionImage } from '../providers/anthropic-vision';
import type {
  EREFReview,
  EREFReviewIssue,
  EREFReviewIssueArea,
  EREFReviewSeverity,
  EREFReviewVerdict,
  ShotTestPlan,
} from '../../api/shot-reference';

export const EREF_CHECK_CONTRACT = 'eref_check@v1';
export const EREF_CHECK_MODEL = 'claude-sonnet-4-6';
export const EREF_CHECK_MAX_TOKENS = 2000;

export class EREFCheckError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'EREFCheckError';
  }
}

/** Bible reference image bundled with its slug + role hint for the reviewer. */
export interface ReviewBibleRef {
  slug: string;
  kind: 'character' | 'location' | 'style';
  /** Base64 PNG (no data: prefix). null = description-only ref, no image. */
  image_b64: string | null;
  /** Long-form Bible description — read by reviewer when image is null. */
  description: string;
}

export interface RunEREFCheckArgs {
  /** Candidate image fresh from the provider — base64 PNG. */
  candidateImageB64: string;
  /** Shot test plan from metadata.shot_reference.test_plan. */
  testPlan: ShotTestPlan;
  /** Bible references for every character + location + style in test plan. */
  bibleRefs: ReviewBibleRef[];
  /** Episode code for context. */
  episodeCode: string;
  /** Shot id for context (e.g. "SS-S14-E01-A1-SC01-SH01"). */
  shotId: string;
}

/** Subset of EREFReview that gets returned when the checker is bypassed. */
export interface EREFCheckSkipped {
  skipped: true;
  skipped_reason: string;
  /** Always APPROVE so the pipeline doesn't deadlock when the checker is offline. */
  review: EREFReview;
}

export interface EREFCheckPerformed {
  skipped: false;
  review: EREFReview;
}

export type EREFCheckResult = EREFCheckSkipped | EREFCheckPerformed;

// ── Skip-fallback helpers ───────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString();
}

function approvePassReview(reason: string): EREFReview {
  return {
    verdict: 'APPROVE',
    consistency_score: 100,
    emotion_alignment_score: 100,
    action_clarity_score: 100,
    gag_readability_score: null,
    style_match_score: 100,
    extraneous_objects: [],
    issues: [],
    suggested_prompt_v2: null,
    reviewer_model: EREF_CHECK_MODEL,
    reviewer_cost_usd: 0,
    at: nowIso(),
  };
}

function buildSkipped(reason: string): EREFCheckSkipped {
  return { skipped: true, skipped_reason: reason, review: approvePassReview(reason) };
}

// ── System & user prompts ───────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return [
    'You are EXEC-EREF-CHECK, the visual QC inspector for an animated comedy studio.',
    '',
    'You receive:',
    '  1. The CANDIDATE image — a freshly generated reference frame for one shot.',
    '  2. ZERO OR MORE BIBLE REFERENCE images — canonical LOCKED Bible artwork for',
    '     each character, location, and style cited in the shot. Identity ground truth.',
    '  3. A shot test plan (text) listing per-character expected emotion + action + role',
    '     and the expected_gag.',
    '',
    'Your job: score the candidate against the test plan + bible refs on FIVE axes',
    '(0-100 each), find any extraneous objects, and emit a verdict + actionable',
    'suggested_prompt_v2 if regeneration would help.',
    '',
    'Verdict rubric:',
    '  APPROVE        — every axis ≥ 80 AND no CRITICAL issues. Image is shippable.',
    '  REGENERATE     — fixable via prompt change. Provide concrete suggested_prompt_v2.',
    '                   Use this when emotion/action/composition is off but identity is OK.',
    '  HUMAN_REVIEW   — judgement call needed (e.g. style edge case, narrative concern,',
    '                   identity drift that prompt cannot fix). Director must look.',
    '',
    'Be terse. Issue descriptions ≤ 140 chars. fix_hints ≤ 200 chars.',
    'suggested_prompt_v2 ≤ 1200 chars and must produce a SAME-shape generation',
    '(do not change shot_role or characters).',
    '',
    'Output ONLY one fenced ```json block. No preamble, no markdown sections. Schema:',
    '```json',
    '{',
    '  "verdict": "APPROVE" | "REGENERATE" | "HUMAN_REVIEW",',
    '  "consistency_score": 0-100,         // identity match vs Bible refs',
    '  "emotion_alignment_score": 0-100,   // average across characters',
    '  "action_clarity_score": 0-100,',
    '  "gag_readability_score": 0-100 or null,  // null when test_plan.expected_gag is null',
    '  "style_match_score": 0-100,',
    '  "extraneous_objects": ["<short label of any extra prop/character not in plan>"],',
    '  "issues": [',
    '    {',
    '      "area": "character_identity"|"emotion"|"action"|"composition"|"style"|"extraneous"|"gag",',
    '      "character_slug": "<bible_slug>" | null,',
    '      "severity": "CRITICAL"|"MAJOR"|"MINOR",',
    '      "description": "<≤140 chars>",',
    '      "fix_hint": "<≤200 chars actionable suggestion>"',
    '    }',
    '  ],',
    '  "suggested_prompt_v2": "<≤1200 chars rewrite or null>"',
    '}',
    '```',
  ].join('\n');
}

function formatTestPlanText(args: RunEREFCheckArgs): string {
  const { testPlan, episodeCode, shotId } = args;
  const lines: string[] = [];
  lines.push(`# Shot ${shotId}  (episode ${episodeCode})`);
  lines.push(`shot_role: ${testPlan.shot_role}`);
  lines.push(`expected_gag: ${testPlan.expected_gag ?? '(null — no gag in this shot)'}`);
  lines.push('');
  lines.push('## Characters expected in frame');
  if (testPlan.characters.length === 0) {
    lines.push('(none — pure environment shot)');
  } else {
    for (const c of testPlan.characters) {
      lines.push(`### ${c.bible_slug}  (role: ${c.role_in_shot})`);
      lines.push(`expected_emotion: ${c.expected_emotion}`);
      lines.push(`expected_action:  ${c.expected_action}`);
    }
  }
  return lines.join('\n');
}

function buildVisionImages(args: RunEREFCheckArgs): VisionImage[] {
  const out: VisionImage[] = [];
  // Bible refs first — give the model identity ground truth before the candidate.
  for (const ref of args.bibleRefs) {
    if (!ref.image_b64) continue; // text-only refs are surfaced via the test plan text instead
    out.push({
      base64: ref.image_b64,
      caption: `# Bible reference: ${ref.kind} "${ref.slug}" (LOCKED canon)`,
    });
  }
  // Candidate last so the model evaluates it against everything above.
  out.push({
    base64: args.candidateImageB64,
    caption: `# CANDIDATE image — newly generated for shot ${args.shotId}. Score this.`,
  });
  return out;
}

function appendDescriptionOnlyRefs(args: RunEREFCheckArgs): string {
  const text: string[] = [];
  const desc = args.bibleRefs.filter((r) => !r.image_b64 && r.description);
  if (desc.length === 0) return '';
  text.push('## Bible references with no LOCKED image (text-only)');
  for (const r of desc) {
    text.push(`### ${r.kind} "${r.slug}"`);
    text.push(r.description);
  }
  return text.join('\n');
}

// ── Result parsing & coercion ──────────────────────────────────────────────

function clampScore(n: unknown): number {
  if (typeof n !== 'number' || Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

const VALID_AREAS: ReadonlySet<EREFReviewIssueArea> = new Set([
  'character_identity',
  'emotion',
  'action',
  'composition',
  'style',
  'extraneous',
  'gag',
]);

function coerceVerdict(v: unknown): EREFReviewVerdict {
  if (v === 'REGENERATE' || v === 'HUMAN_REVIEW') return v;
  return 'APPROVE';
}

function coerceSeverity(s: unknown): EREFReviewSeverity {
  if (s === 'CRITICAL' || s === 'MAJOR') return s;
  return 'MINOR';
}

function coerceIssues(raw: unknown): EREFReviewIssue[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 20).map((r): EREFReviewIssue => {
    const o = (r ?? {}) as Record<string, unknown>;
    const area = typeof o.area === 'string' && VALID_AREAS.has(o.area as EREFReviewIssueArea)
      ? (o.area as EREFReviewIssueArea)
      : 'composition';
    return {
      area,
      character_slug: typeof o.character_slug === 'string' ? o.character_slug : null,
      severity: coerceSeverity(o.severity),
      description: typeof o.description === 'string' ? o.description.slice(0, 400) : '',
      fix_hint: typeof o.fix_hint === 'string' ? o.fix_hint.slice(0, 400) : '',
    };
  });
}

// ── Main entry ──────────────────────────────────────────────────────────────

export async function runEREFCheck(args: RunEREFCheckArgs): Promise<EREFCheckResult> {
  // Skip when API key absent (CI / replay-pilot / no Anthropic budget).
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return buildSkipped('ANTHROPIC_API_KEY not set — checker bypassed, defaulting to APPROVE');
  }

  // Skip when there's nothing to anchor against (truly fresh series).
  // We still run the checker if at least one bible ref OR a non-empty test_plan
  // exists — otherwise there's nothing to score.
  const hasAnyRef = args.bibleRefs.some((r) => r.image_b64 || r.description);
  if (!hasAnyRef && args.testPlan.characters.length === 0) {
    return buildSkipped('No Bible references and empty test plan — nothing to verify');
  }

  const systemPrompt = buildSystemPrompt();
  const planText = formatTestPlanText(args);
  const descRefs = appendDescriptionOnlyRefs(args);
  const trail = [planText, descRefs].filter(Boolean).join('\n\n');
  const images = buildVisionImages(args);

  let response;
  try {
    response = await generateAnthropicVision({
      systemPrompt,
      leadText: 'Compare the CANDIDATE image (last) against the Bible reference images (above) and the test plan below.',
      images,
      trailText: trail,
      model: EREF_CHECK_MODEL,
      maxOutputTokens: EREF_CHECK_MAX_TOKENS,
      expectsJson: true,
    });
  } catch (err) {
    if (err instanceof AnthropicTextError) {
      // Don't block production on a transient checker hiccup — surface the
      // skip so the runner doesn't think the image is bad.
      return buildSkipped(`Sonnet vision error: ${err.message.slice(0, 200)}`);
    }
    throw err;
  }

  const body = response.body ?? {};
  const verdict = coerceVerdict(body.verdict);
  const review: EREFReview = {
    verdict,
    consistency_score: clampScore(body.consistency_score),
    emotion_alignment_score: clampScore(body.emotion_alignment_score),
    action_clarity_score: clampScore(body.action_clarity_score),
    gag_readability_score:
      args.testPlan.expected_gag === null
        ? null
        : typeof body.gag_readability_score === 'number'
        ? clampScore(body.gag_readability_score)
        : null,
    style_match_score: clampScore(body.style_match_score),
    extraneous_objects: Array.isArray(body.extraneous_objects)
      ? (body.extraneous_objects as unknown[])
          .filter((s): s is string => typeof s === 'string')
          .slice(0, 10)
      : [],
    issues: coerceIssues(body.issues),
    suggested_prompt_v2:
      typeof body.suggested_prompt_v2 === 'string' && body.suggested_prompt_v2.length > 0
        ? body.suggested_prompt_v2.slice(0, 2000)
        : null,
    reviewer_model: response.model,
    reviewer_cost_usd: response.costUsd,
    at: nowIso(),
  };

  return { skipped: false, review };
}
