// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/runners/on-model-detector.ts
// On-model identity detector — a FOCUSED vision check, separate from EXEC-EREF-CHECK.
//
// The general EREF critic (consistency_score) can't reliably SEE off-model: E30
// calibration showed the same purple-blob defect scoring 22 on one shot and 100 on
// a near-identical one. This detector asks ONE narrow, binary question against the
// Bible character canon:
//   1. silhouette_ok  — does the rendered character match the canon's overall shape?
//   2. transparency_ok — does the body material (e.g. glass vs opaque) match canon?
//
// It returns the raw axes only; the caller applies `decideOnModel(raw, strictness,
// isTransformation)` (lib/api/on-model.ts) to get the PASS/FAIL gate verdict. The
// rubric is built FROM the character refs handed in — series-agnostic, no hardcoded
// character. Model defaults to claude-opus-4-8 (E30 finding: Opus catches on-model
// defects where gpt-5.6-terra flip-flops), overridable via app_config scope 'on_model'.
//
// Mirrors eref-check.ts: skip-fallback to PASS on no key / no canon / parser hiccup,
// so a detector outage NEVER bounces a shot.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../supabase/types.gen';
import { AnthropicTextError } from '../providers/anthropic-text';
import { generateAnthropicVision, type VisionImage } from '../providers/anthropic-vision';

export const ON_MODEL_DETECTOR_CONTRACT = 'on_model_detector@v1';
export const ON_MODEL_DETECTOR_DEFAULT_MODEL = 'claude-opus-4-8';
export const ON_MODEL_DETECTOR_MAX_TOKENS = 700;

const APP_CONFIG_SCOPE = 'on_model';
const APP_CONFIG_KEY = 'model';

/** One Bible character reference — canon identity ground truth for the detector. */
export interface OnModelCharacterRef {
  slug: string;
  /** Base64 PNG (no data: prefix). Refs without an image are skipped. */
  image_b64: string | null;
  /** Long-form Bible description — grounds the silhouette/material rubric in text. */
  description: string;
}

export interface RunOnModelDetectorArgs {
  /** Candidate image fresh from the provider — base64 PNG. */
  candidateImageB64: string;
  /** LOCKED Bible character refs for the character(s) expected in this shot. */
  characterRefs: OnModelCharacterRef[];
  /** Episode code + shot id for prompt context. */
  episodeCode: string;
  shotId: string;
  /** Vision model id (caller resolves via resolveOnModelDetectorModel). */
  model: string;
}

export interface OnModelDetectorResult {
  silhouette_ok: boolean;
  transparency_ok: boolean;
  reason: string;
  model: string;
  cost_usd: number;
  /** True when the vision call was bypassed (fail-open PASS). */
  skipped: boolean;
}

/**
 * The detector model right now: persisted app_config override (scope 'on_model'),
 * else the env-derived default (claude-opus-4-8). Low-frequency (once per rendered
 * medium/strict asset) so it reads app_config directly. Fail-open to the default.
 */
export async function resolveOnModelDetectorModel(
  supabase: SupabaseClient<Database>,
): Promise<string> {
  const envDefault = process.env.ON_MODEL_DETECTOR_MODEL?.trim() || ON_MODEL_DETECTOR_DEFAULT_MODEL;
  try {
    const { data } = await supabase
      .from('app_config')
      .select('value')
      .eq('scope', APP_CONFIG_SCOPE)
      .eq('key', APP_CONFIG_KEY)
      .maybeSingle();
    const v = (data as { value?: unknown } | null)?.value;
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (v && typeof v === 'object' && typeof (v as { model?: unknown }).model === 'string') {
      return (v as { model: string }).model;
    }
    return envDefault;
  } catch {
    return envDefault;
  }
}

// ── Prompt ────────────────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return [
    'You are the ON-MODEL DETECTOR, a strict identity inspector for an animated series.',
    '',
    'You receive:',
    '  1. ONE OR MORE BIBLE REFERENCE images — the LOCKED canonical look of a character.',
    '     These are identity ground truth.',
    '  2. The CANDIDATE image (LAST) — a freshly generated frame to judge.',
    '',
    'Judge the candidate on EXACTLY TWO binary axes, comparing ONLY the character(s)',
    'against the Bible canon (ignore background, framing, emotion, action — not your job):',
    '',
    '  silhouette_ok   — TRUE only if the rendered character is RECOGNISABLE as the canon',
    '                    character by its overall shape/silhouette. FALSE if the shape is',
    '                    lost — a blob, a different creature, an unrecognisable mass.',
    '  transparency_ok — TRUE only if the body MATERIAL matches canon (e.g. if the canon',
    '                    body is transparent glass, the candidate must read as transparent',
    '                    glass — not milky, opaque, or a solid recolour). TRUE by default',
    '                    when the canon body has no special material property.',
    '',
    'Be strict and literal. When in genuine doubt, prefer FALSE — a human will confirm.',
    '',
    'Output ONLY one fenced ```json block. No preamble, no prose outside it. Schema:',
    '```json',
    '{',
    '  "silhouette_ok": true | false,',
    '  "transparency_ok": true | false,',
    '  "reason": "<= 200 chars — the single clearest reason for any FALSE, else \'on-model\'"',
    '}',
    '```',
  ].join('\n');
}

function buildCanonText(args: RunOnModelDetectorArgs): string {
  const lines: string[] = [];
  lines.push(`# Shot ${args.shotId} (episode ${args.episodeCode})`);
  lines.push('');
  lines.push('## Canon character identity (from the Bible)');
  for (const c of args.characterRefs) {
    lines.push(`### ${c.slug}`);
    if (c.description) lines.push(c.description.slice(0, 800));
  }
  return lines.join('\n');
}

function buildVisionImages(args: RunOnModelDetectorArgs): VisionImage[] {
  const out: VisionImage[] = [];
  for (const ref of args.characterRefs) {
    if (!ref.image_b64) continue;
    out.push({
      base64: ref.image_b64,
      caption: `# Bible reference: character "${ref.slug}" (LOCKED canon — identity ground truth)`,
    });
  }
  out.push({
    base64: args.candidateImageB64,
    caption: `# CANDIDATE image — newly generated for shot ${args.shotId}. Judge this against the canon above.`,
  });
  return out;
}

// ── Coercion ────────────────────────────────────────────────────────────────

/** Missing/garbage → false (strict: an unparseable axis reads as a failure). */
function coerceBool(v: unknown): boolean {
  return v === true;
}

function skipped(reason: string, model: string): OnModelDetectorResult {
  // Fail-open: an offline / anchorless detector must never bounce a shot.
  return { silhouette_ok: true, transparency_ok: true, reason, model, cost_usd: 0, skipped: true };
}

// ── Main entry ────────────────────────────────────────────────────────────────

export async function runOnModelDetector(
  args: RunOnModelDetectorArgs,
): Promise<OnModelDetectorResult> {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return skipped('ANTHROPIC_API_KEY not set — detector bypassed (fail-open PASS)', args.model);
  }
  const withImage = args.characterRefs.filter((r) => r.image_b64);
  if (withImage.length === 0) {
    return skipped('No LOCKED character reference image — nothing to anchor identity (fail-open PASS)', args.model);
  }

  let response;
  try {
    response = await generateAnthropicVision({
      systemPrompt: buildSystemPrompt(),
      leadText:
        'Compare the CANDIDATE image (last) against the Bible reference image(s) above. Judge the two identity axes only.',
      images: buildVisionImages(args),
      trailText: buildCanonText(args),
      model: args.model,
      maxOutputTokens: ON_MODEL_DETECTOR_MAX_TOKENS,
      expectsJson: true,
    });
  } catch (err) {
    if (err instanceof AnthropicTextError) {
      return skipped(`on-model detector vision error: ${err.message.slice(0, 200)}`, args.model);
    }
    throw err;
  }

  const body = response.body ?? {};
  const reason =
    typeof body.reason === 'string' && body.reason.trim()
      ? body.reason.slice(0, 200)
      : 'on-model';
  return {
    silhouette_ok: coerceBool(body.silhouette_ok),
    transparency_ok: coerceBool(body.transparency_ok),
    reason,
    model: response.model,
    cost_usd: response.costUsd,
    skipped: false,
  };
}
