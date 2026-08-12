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
import { AnthropicTextError } from '../../providers/anthropic-text';
import { generateAnthropicVision, type VisionImage } from '../../providers/anthropic-vision';

export const ON_MODEL_DETECTOR_CONTRACT = 'on_model_detector@v1';
export const ON_MODEL_DETECTOR_DEFAULT_MODEL = 'claude-opus-4-8';
export const ON_MODEL_DETECTOR_MAX_TOKENS = 700;

const APP_CONFIG_SCOPE = 'on_model';
const APP_CONFIG_KEY = 'model';

export type OnModelCanonKind = 'character' | 'location' | 'style' | 'object';

/** One LOCKED Bible reference of any kind — canon ground truth for the detector. */
export interface OnModelCanonRef {
  slug: string;
  kind: OnModelCanonKind;
  /** Base64 PNG (no data: prefix). Refs without an image are skipped as anchors. */
  image_b64: string | null;
  /** Long-form Bible description — grounds the rubric in text. */
  description: string;
}

export interface RunOnModelDetectorArgs {
  /** Candidate image fresh from the provider — base64 PNG. */
  candidateImageB64: string;
  /** LOCKED Bible refs for every canon this shot cites (character/location/style/object). */
  canonRefs: OnModelCanonRef[];
  /** Episode code + shot id for prompt context. */
  episodeCode: string;
  shotId: string;
  /** Vision model id (caller resolves via resolveOnModelDetectorModel). */
  model: string;
}

/** Per-axis result: `boolean | null` (null = no canon of that kind → not judged). */
export interface OnModelDetectorResult {
  silhouette_ok: boolean | null;
  transparency_ok: boolean | null;
  location_ok: boolean | null;
  style_ok: boolean | null;
  objects_ok: boolean | null;
  reason: string;
  model: string;
  cost_usd: number;
  /** True when the vision call was bypassed (fail-open — every axis null). */
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

const KIND_LABEL: Record<OnModelCanonKind, string> = {
  character: 'character',
  location: 'location / background',
  style: 'rendering style',
  object: 'prop / object',
};

/** Build the schema + axis rubric for ONLY the axes this shot has a canon for. */
function buildSystemPrompt(present: Set<OnModelCanonKind>): string {
  const axes: string[] = [];
  const schema: string[] = [];
  if (present.has('character')) {
    axes.push(
      '  silhouette_ok   — TRUE only if the rendered character is RECOGNISABLE as THIS canon',
      '                    character by its overall shape/silhouette (whatever that shape is in the',
      '                    reference). FALSE if the shape is lost — a blob, a different creature, an',
      '                    unrecognisable mass.',
      '  transparency_ok — Judge the body MATERIAL, not its brightness. Read the material from the',
      '                    canon reference itself. If the canon body is a transmissive/translucent',
      '                    material, the candidate PASSES only while it still reads as that material —',
      '                    light passes through, internal depth / visible contents. If the canon body',
      '                    is opaque, judge that the surface finish still matches. Scene lighting',
      '                    legitimately darkens/tints a body (night, coloured ambient) — that is',
      '                    CORRECT, not a defect. FAIL only a genuine MATERIAL SWAP vs the canon (e.g.',
      '                    a transmissive canon rendered as a flat opaque painted mass). TRUE when the',
      '                    canon material is unremarkable and the candidate keeps it.',
    );
    schema.push('  "silhouette_ok": true | false,', '  "transparency_ok": true | false,');
  }
  if (present.has('location')) {
    axes.push(
      '  location_ok      — Does the BACKGROUND / setting match the location canon reference? Compare',
      '                    PLACE, not lighting: the same setting at night is still on-model. FALSE when',
      '                    the setting is a DIFFERENT place than the canon (a different room / an',
      '                    exterior where the canon is an interior / a different environment entirely).',
      '                    If the canon location is a flat colour FIELD, TRUE as long as the background',
      '                    is that canonical flat colour (no wrong room/scenery built in).',
    );
    schema.push('  "location_ok": true | false,');
  }
  if (present.has('style')) {
    axes.push(
      '  style_ok         — Does the rendering (medium, line, shading, palette discipline) match the',
      '                    style canon REFERENCE? Read the medium off that reference, never off your',
      '                    own priors: FALSE on a clear medium break (photoreal / live-action / a',
      '                    wholly different art style).',
    );
    schema.push('  "style_ok": true | false,');
  }
  if (present.has('object')) {
    axes.push(
      '  objects_ok       — Do the canon props shown match their object canon (shape/colour/count)?',
      '                    FALSE when a cited canon prop is clearly wrong or replaced. Ignore props not in canon.',
    );
    schema.push('  "objects_ok": true | false,');
  }
  return [
    'You are the ON-MODEL DETECTOR, a strict canon-compliance inspector for an animated series.',
    '',
    'You receive LOCKED Bible reference images (labelled by kind: character / location / style /',
    'prop) that are canon ground truth, then the CANDIDATE image (LAST) — a freshly generated',
    'frame to judge. Judge ONLY the axes below (one per canon kind you were given). Ignore',
    'framing, emotion, and action — not your job.',
    '',
    ...axes,
    '',
    'Be strict on silhouette and location (different character / different place = FALSE). Be',
    'tolerant of scene lighting. When in genuine doubt, prefer FALSE — a human will confirm.',
    '',
    'Output ONLY one fenced ```json block. No preamble, no prose outside it. Schema:',
    '```json',
    '{',
    ...schema,
    '  "reason": "<= 200 chars — the single clearest reason for any FALSE, else \'on-model\'"',
    '}',
    '```',
  ].join('\n');
}

function buildCanonText(args: RunOnModelDetectorArgs): string {
  const lines: string[] = [];
  lines.push(`# Shot ${args.shotId} (episode ${args.episodeCode})`);
  lines.push('');
  lines.push('## Canon references (from the Bible)');
  for (const c of args.canonRefs) {
    if (!c.description) continue;
    lines.push(`### ${KIND_LABEL[c.kind]}: ${c.slug}`);
    lines.push(c.description.slice(0, 600));
  }
  return lines.join('\n');
}

function buildVisionImages(args: RunOnModelDetectorArgs): VisionImage[] {
  const out: VisionImage[] = [];
  for (const ref of args.canonRefs) {
    if (!ref.image_b64) continue;
    out.push({
      base64: ref.image_b64,
      caption: `# Bible reference: ${KIND_LABEL[ref.kind]} "${ref.slug}" (LOCKED canon)`,
    });
  }
  out.push({
    base64: args.candidateImageB64,
    caption: `# CANDIDATE image — newly generated for shot ${args.shotId}. Judge this against the canon above.`,
  });
  return out;
}

// ── Coercion ────────────────────────────────────────────────────────────────

/** An axis is judged (true/false) only when its canon kind is present; else null
 *  (not applicable — decideOnModel never fails a null axis). Within a judged axis,
 *  missing/garbage from the model → false (strict: an unparseable axis is a failure). */
function coerceAxis(present: boolean, v: unknown): boolean | null {
  if (!present) return null;
  return v === true;
}

function skipped(reason: string, model: string): OnModelDetectorResult {
  // Fail-open: an offline / anchorless detector must never bounce a shot. Every axis
  // null ⇒ decideOnModel returns PASS regardless of strictness.
  return {
    silhouette_ok: null, transparency_ok: null, location_ok: null, style_ok: null, objects_ok: null,
    reason, model, cost_usd: 0, skipped: true,
  };
}

// ── Main entry ────────────────────────────────────────────────────────────────

export async function runOnModelDetector(
  args: RunOnModelDetectorArgs,
): Promise<OnModelDetectorResult> {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return skipped('ANTHROPIC_API_KEY not set — detector bypassed (fail-open PASS)', args.model);
  }
  // Which canon kinds actually have a LOCKED image to anchor against — only those
  // axes are judged; the rest stay null (not applicable).
  const present = new Set<OnModelCanonKind>(
    args.canonRefs.filter((r) => r.image_b64).map((r) => r.kind),
  );
  if (present.size === 0) {
    return skipped('No LOCKED canon reference image — nothing to anchor (fail-open PASS)', args.model);
  }

  // Retry once on a parse/transient error before falling open. The model occasionally
  // emits prose without the fenced JSON block (~2-3/29 observed on E30); a fail-open
  // skip on a flake lets a genuinely off-model frame slip through, so one clean retry
  // meaningfully tightens the gate at trivial cost.
  let response: Awaited<ReturnType<typeof generateAnthropicVision>> | null = null;
  let lastErr = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      response = await generateAnthropicVision({
        systemPrompt: buildSystemPrompt(present),
        leadText:
          'Compare the CANDIDATE image (last) against the LOCKED Bible reference image(s) above. Judge only the axes in the schema.',
        images: buildVisionImages(args),
        trailText: buildCanonText(args),
        model: args.model,
        maxOutputTokens: ON_MODEL_DETECTOR_MAX_TOKENS,
        expectsJson: true,
      });
      break;
    } catch (err) {
      if (err instanceof AnthropicTextError) {
        lastErr = err.message.slice(0, 200);
        continue; // retry once, then fall open
      }
      throw err;
    }
  }
  if (!response) {
    return skipped(`on-model detector vision error (after retry): ${lastErr}`, args.model);
  }

  const body = response.body ?? {};
  const reason =
    typeof body.reason === 'string' && body.reason.trim()
      ? body.reason.slice(0, 200)
      : 'on-model';
  return {
    silhouette_ok: coerceAxis(present.has('character'), body.silhouette_ok),
    transparency_ok: coerceAxis(present.has('character'), body.transparency_ok),
    location_ok: coerceAxis(present.has('location'), body.location_ok),
    style_ok: coerceAxis(present.has('style'), body.style_ok),
    objects_ok: coerceAxis(present.has('object'), body.objects_ok),
    reason,
    model: response.model,
    cost_usd: response.costUsd,
    skipped: false,
  };
}
