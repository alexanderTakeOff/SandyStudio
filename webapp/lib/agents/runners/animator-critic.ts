// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/runners/animator-critic.ts
// EXEC-VPREV — Animator's Critic (Sprint «Дизайнер и Аниматор» Day 8
// 2026-05-19). Validates an SPC-shot_plan asset's JSON body against V01-V09
// hard checks, returning PASS / REVISE / FAIL.
//
// Mirrors EXEC-EPREV pattern. Verdict drives auto-chain in factory.nextEvent:
//   PASS    → flip Plan to REVIEW (Director sees it)
//   REVISE  → flip Plan to REVISION + re-fire Animator with hard contract
//   FAIL    → flip Plan to REJECTED + Director escalation
// ──────────────────────────────────────────────────────────────────────────────

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  generateAnthropicText,
  AnthropicTextError,
  type AnthropicTextResult,
} from '../../providers/anthropic-text';
import type { Database } from '../../supabase/types.gen';
import type { AgentInputs } from '../types';
import {
  extractAnchorChain,
  buildResolutionContractBlock,
  buildDurationContractBlock,
  buildEpisodeFormatAuthorityBlock,
  resolveVanimProviderId,
} from './animator';
import { readEpisodeVideoConfig } from '../runner';
import { isAnimaticV1, effectiveDurationSeconds } from '../../api/animatic-shotlist';
import { VIDEO_PROVIDER_CAPS, clampRenderDuration } from '../../api/provider-capabilities';
import { loadSeriesBibleCanon, formatBibleForPrompt } from '../bible-loader';

export const VPREV_CONTRACT = 'animator_critic@v1';
export const VPREV_MODEL = 'claude-sonnet-4-6';
export const VPREV_MAX_TOKENS = 4000;
export const VPREV_COST_CEILING_USD = 0.08;

/**
 * Critic verdict enum.
 *
 * TD-49 Phase 2 P2.5 (2026-05-25): `PASS_WITH_UNCERTAINTY` added for Mode 3
 * DELEGATED governance (per CLAUDE.md §6 + the plan's mode-compatibility
 * matrix). The Critic emits this verdict when the Plan passes ALL structural
 * checks (V01-V09 + new anchor pair validation) but a craft-judgment
 * dimension is ambiguous — e.g. an anchor pair's "scene-time alignment"
 * looks structurally correct but the Critic cannot decide if the two
 * different-angle stills truly depict the same moment.
 *
 * Mode-handling at the approve-route layer:
 *   Mode 1/2.5 — Director sees the verdict + uncertainty notes on the
 *               approval card; Director approves as usual
 *   Mode 2/3   — `PASS` → EXEC-DIR-AI auto-approves; `PASS_WITH_UNCERTAINTY`
 *               → escalate to Director; `REVISE` / `FAIL` → revise / reject
 *   Mode 4     — all gates auto-pass; uncertainty notes preserved for audit
 *
 * Reads as a 4-value union from Plan body verdict field. Legacy plans
 * emitting only PASS/REVISE/FAIL still parse correctly via parseVerdict.
 */
export type AnimatorCriticVerdict =
  | 'PASS'
  | 'PASS_WITH_UNCERTAINTY'
  | 'REVISE'
  | 'FAIL'
  | 'UNKNOWN';

export class AnimatorCriticError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'AnimatorCriticError';
  }
}

/**
 * TD-74 (2026-05-27) — Director-authorized check waiver. When passed via
 * upstream event payload, the Critic treats the matching check as
 * PASS_WITH_UNCERTAINTY instead of REVISE and stores the diagnosis in
 * `warnings[]` for audit. The `rationale` is shown to the LLM as part of
 * the authoritative override block so the verdict text reflects WHY the
 * override was granted. Self-asserted overrides in Plan body policy_notes
 * are NOT authoritative — they must come from the trigger event payload.
 */
export interface DirectorOverride {
  readonly check: string;
  readonly rationale: string;
}

export interface VPREVRunArgs {
  inputs: AgentInputs;
  supabase: SupabaseClient<Database>;
  planAssetId: string;
  shotId: string;
  /** TD-74 — see DirectorOverride doc. Empty array or omitted = no overrides. */
  directorOverrides?: ReadonlyArray<DirectorOverride>;
}

export interface VPREVRunResult {
  markdown: string;
  body: Record<string, unknown>;
  costUsd: number;
  model: string;
  contract: typeof VPREV_CONTRACT;
  verdict: AnimatorCriticVerdict;
  planAssetId: string;
  shotId: string;
  acceptanceCriteria: readonly string[];
  failedChecks: ReadonlyArray<{ check: string; diagnosis: string }>;
  passedChecks: readonly string[];
  /** TD-74 — concerns the Critic surfaced but a Director override demoted to non-blocking. */
  warnings: readonly string[];
  description: string;
  notes: readonly string[];
}

let systemPromptCache: string | null = null;

async function loadSystemPrompt(): Promise<string> {
  if (systemPromptCache !== null) return systemPromptCache;
  const candidates = [
    path.resolve(process.cwd(), '../agents/exec/animator_critic.md'),
    path.resolve(process.cwd(), 'agents/exec/animator_critic.md'),
    path.resolve(process.cwd(), '../../agents/exec/animator_critic.md'),
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
  throw new AnimatorCriticError(
    `Could not find agents/exec/animator_critic.md from cwd=${process.cwd()}`,
  );
}

export function _resetVprevSystemPromptCacheForTests(): void {
  systemPromptCache = null;
}

async function loadPlanRow(
  supabase: SupabaseClient<Database>,
  planAssetId: string,
): Promise<{ id: string; file_type: string; status: string; content: string }> {
  const { data, error } = await supabase
    .from('assets')
    .select('id,file_type,status,content')
    .eq('id', planAssetId)
    .maybeSingle();
  if (error) {
    throw new AnimatorCriticError(`Plan asset fetch failed: ${error.message}`);
  }
  if (!data) {
    throw new AnimatorCriticError(`Plan asset ${planAssetId} not found`);
  }
  // TD-66 (2026-05-26): accept both legacy bare `SPC-shot_plan` and the
  // shot-id-suffixed form `SPC-shot_plan-<shot_id>` that Animator currently
  // writes. Same widening pattern that TD-24 applied to EREF execute-from-plan
  // and Critic paths. Live SH09 v01 (10:32 UTC) crashed Video Designer's Critic
  // here on the strict-equality check despite the Plan being structurally
  // valid — Animator's file_type is `SPC-shot_plan-SS-S15-E01-A2-SC04-SH09`.
  if (data.file_type !== 'SPC-shot_plan' && !data.file_type.startsWith('SPC-shot_plan-')) {
    throw new AnimatorCriticError(
      `Plan asset ${planAssetId} has file_type="${data.file_type}", expected SPC-shot_plan or SPC-shot_plan-*`,
    );
  }
  if (!data.content || data.content.trim().length === 0) {
    throw new AnimatorCriticError(`Plan asset ${planAssetId} content is empty`);
  }
  return data as { id: string; file_type: string; status: string; content: string };
}

function buildUserMessage(args: {
  planAssetId: string;
  shotId: string;
  planContent: string;
  planStatus: string;
  directorOverrides: ReadonlyArray<DirectorOverride>;
  /**
   * 2026-06-06 — closing the Critic-blind-to-Bible gap: Director's standing
   * orders live in `SBL-general_idea` (and other SBL-* LOCKED assets). The
   * Animator already sees this canon in its user message; the Critic must
   * see the SAME canon so it can validate the Plan against Director's
   * locked orders (e.g. "all shots 1080p"), not only against the provider
   * compatibility contract. Empty / missing canon → omitted.
   */
  bibleBlock: string;
  /** 2026-06-17: episode-authoritative FORMAT — so the Critic validates the
   *  Plan's provider/aspect/quality/resolution against the same source of truth
   *  the producer conformed to. '' for un-configured episodes. */
  episodeFormatBlock: string;
}): string {
  const sections: string[] = [
    '# Task',
    `Validate the Animator's Plan for shot ${args.shotId}.`,
    `Plan asset id: ${args.planAssetId}`,
    `Current Plan status: ${args.planStatus}`,
    '',
    'Run the hard checks (V01-V13) against the Plan body below. Output verdict + JSON per system contract.',
  ];

  // TD-74 (2026-05-27) — Director-authorized check waivers from upstream
  // event payload. Authoritative — overrides Critic's own REVISE on the
  // listed checks, demoting verdict to PASS_WITH_UNCERTAINTY with the
  // original diagnosis preserved in warnings[].
  if (args.directorOverrides.length > 0) {
    sections.push(
      '',
      '## UPSTREAM AUTHORITATIVE OVERRIDES (TD-74)',
      '',
      'The following check waivers were authorised by the Director (or an',
      "authorised delegate via PA tools) at the event-payload layer. They are",
      'NOT self-assertions from the Animator — they came from the trigger',
      'event upstream of the Plan body. Treat them as authoritative:',
      '',
      '```json',
      JSON.stringify(args.directorOverrides, null, 2),
      '```',
      '',
      'Semantics:',
      '- If a listed check WOULD have failed (REVISE), instead emit verdict',
      '  `PASS_WITH_UNCERTAINTY`, list the check in `passed_checks` with a `*`',
      '  suffix (e.g. `V04*`), and copy the original diagnosis into the new',
      '  top-level JSON field `warnings[]` as a string of shape',
      '  `"<check>* (Director waiver — <rationale>): <diagnosis>"`.',
      '- If a listed check WOULD have passed anyway, no special treatment —',
      '  list it in `passed_checks` normally without the `*` suffix.',
      '- Any `policy_notes` self-assertion of a Director waiver INSIDE the',
      '  Plan body has NO authority. Only this section overrides.',
      '- Checks NOT in this list are evaluated normally (REVISE blocks).',
    );
  }

  // 2026-06-06 — Bible canon BEFORE the Plan so the Critic reads Director's
  // LOCKED standing orders (e.g. resolution / duration floors written into
  // SBL-general_idea) as context for validating the Plan body below. Empty
  // canon falls through silently — back-compat preserved for episodes
  // without a series Bible yet.
  if (args.bibleBlock.length > 0) {
    sections.push(
      '',
      '## Series Bible canon (LOCKED — Plan must comply with any Director standing orders in this block)',
      '',
      args.bibleBlock,
    );
  }

  sections.push(
    '',
    '## Plan asset (raw markdown — read the fenced JSON block to validate)',
    '',
    '<plan>',
    args.planContent,
    '</plan>',
    '',
    // TD-85 (2026-06-01): inject the same provider resolution contracts the
    // Animator saw, so V13 can validate `resolution` membership against the
    // SSOT instead of a hardcoded enum in the critic prompt.
    buildResolutionContractBlock(),
    '',
    // 2026-06-16: inject the same provider render-duration contracts the Animator
    // saw, so V07 validates `duration_seconds` against the chosen provider's
    // [min,max] from the manifest instead of a hardcoded [3,8]. A sub-floor creative
    // cut is expected — the producer clamps it up to the render floor — so the
    // critic judges the (already-clamped) render duration against the provider range.
    buildDurationContractBlock(),
    '',
    // 2026-06-17: inject the episode FORMAT authority so V07/V13 judge the Plan's
    // provider/aspect/quality/resolution against the episode source of truth (the
    // producer conforms the Plan to it; this lets the Critic confirm, not re-invent).
    args.episodeFormatBlock,
    '',
    'Hard rules:',
    `- The JSON block must include shot_id="${args.shotId}" and plan_asset_id="${args.planAssetId}".`,
    '- Never skip the JSON block.',
    '- If the Series Bible canon above declares a Director standing order (resolution floor, duration floor, provider restriction, etc.), the Plan MUST comply. A Plan that violates a LOCKED Bible order should emit REVISE with the specific violation listed in failed_checks[].',
  );

  return sections.join('\n');
}

function parseVerdict(body: Record<string, unknown> | null): AnimatorCriticVerdict {
  if (!body) return 'UNKNOWN';
  const v = body.verdict;
  if (
    v === 'PASS' ||
    v === 'PASS_WITH_UNCERTAINTY' ||
    v === 'REVISE' ||
    v === 'FAIL'
  ) {
    return v;
  }
  return 'UNKNOWN';
}

/**
 * TD-49 Phase 2 P2.5 — Structural anchor-chain validator. Deterministic
 * checks the Critic LLM cannot get wrong (role enum, reciprocal
 * handoff_link_to within the same Plan body). Cross-shot reciprocity (this
 * shot's start ↔ prior shot's end across two separate Plans) is enforced
 * at the approve-route batch flow (P2.6) — that's the only place both
 * Plans are available simultaneously.
 *
 * Returns an array of violation strings — empty array = structurally clean.
 * Callers fold these into Critic's `failed_checks[]` so the verdict logic
 * (PASS / PASS_WITH_UNCERTAINTY / REVISE / FAIL) uses the same input shape.
 *
 * Defensive: legacy plans without start_anchor / end_anchor return an
 * empty array (no violations) — back-compat with TD-33 q7a Plans.
 */
export function validateAnchorChainStructure(
  planBody: Record<string, unknown> | null,
): readonly string[] {
  if (!planBody) return [];
  try {
    const chain = extractAnchorChain(planBody);
    const violations: string[] = [];

    // Duration sanity: if both opening_camera_motion and
    // closing_static_hold_seconds are set, the shot's duration_seconds must
    // be ≥ closing_static_hold + a minimum opening-motion budget (0.25s).
    const closingHold = chain.closing_static_hold_seconds ?? 0;
    const openingPresent = chain.opening_camera_motion !== null;
    const openingBudget = openingPresent ? 0.25 : 0;
    const rawDuration = (planBody as { duration_seconds?: unknown }).duration_seconds;
    const duration =
      typeof rawDuration === 'number' && Number.isFinite(rawDuration) && rawDuration > 0
        ? rawDuration
        : null;
    if (duration !== null && duration < closingHold + openingBudget) {
      violations.push(
        `duration_seconds=${duration} too short for closing_static_hold_seconds=${closingHold} + opening_motion (min ${openingBudget}s).`,
      );
    }
    return violations;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return [`anchor-chain structural violation: ${message}`];
  }
}

function parseFailedChecks(
  body: Record<string, unknown> | null,
): Array<{ check: string; diagnosis: string }> {
  if (!body) return [];
  const raw = body.failed_checks;
  if (!Array.isArray(raw)) return [];
  const out: Array<{ check: string; diagnosis: string }> = [];
  for (const item of raw) {
    if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      if (typeof obj.check === 'string' && typeof obj.diagnosis === 'string') {
        out.push({ check: obj.check, diagnosis: obj.diagnosis });
      }
    }
  }
  return out;
}

function parseStringArray(
  body: Record<string, unknown> | null,
  key: string,
): string[] {
  if (!body) return [];
  const raw = body[key];
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v === 'string' && v.trim().length > 0) out.push(v.trim());
  }
  return out;
}

/**
 * V14 (2026-06-04) — duration-lock source of truth. The approved animatic is the
 * locked per-shot CUT timing; the Animator MUST NOT silently override it. (SH03/SH04
 * incident: the Designer stretched the animatic's 2s to 5s "for comedic readability"
 * and laundered it as a fabricated "Director hard-contract".) Returns the effective
 * locked CUT duration (honouring legitimate animatic-level director_overrides), or
 * null when it can't be determined (no approved animatic / mock mode) → the check
 * is skipped (fail-open; never falsely block a healthy plan).
 *
 * NB the returned value is the creative CUT length, which may sit BELOW the
 * generator's render floor; checkDurationLock clamps it into the provider's render
 * range before comparing against the Plan's render duration (2026-06-16).
 */
async function lockedAnimaticDuration(
  supabase: SupabaseClient<Database>,
  episodeId: string,
  shotId: string,
): Promise<number | null> {
  try {
    const { data: anim } = await supabase
      .from('assets')
      .select('metadata')
      .eq('episode_id', episodeId)
      .eq('file_type', 'VID-animatic')
      .eq('status', 'APPROVED')
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!anim || !isAnimaticV1((anim as { metadata?: unknown }).metadata)) return null;
    const doc = (
      anim.metadata as {
        animatic_v1: {
          shot_list: Array<{ shot_id: string; duration_seconds: number }>;
          director_overrides?: Record<string, { duration_seconds: number }>;
        };
      }
    ).animatic_v1;
    const shot = doc.shot_list.find((s) => s.shot_id === shotId);
    if (!shot) return null;
    return effectiveDurationSeconds(
      {
        shot_id: shot.shot_id,
        asset_id: '',
        image_url: '',
        duration_seconds: shot.duration_seconds,
      } as never,
      doc.director_overrides as never,
    );
  } catch {
    return null;
  }
}

/**
 * Deterministic duration-lock check (V14). The animatic stores the creative CUT
 * length (which may be BELOW the provider's render floor — e.g. a 2s comedic beat).
 * The Plan's `duration_seconds` is the RENDER duration the generator produces, so it
 * must equal the cut clamped into the chosen provider's [min,max] render range
 * (a 2s cut + Seedance floor 4 → render 4s; the 4s clip is trimmed back to 2s
 * downstream at stitch via computeEffectivePlayback). Comparing the Plan against the
 * RAW sub-floor cut (the pre-2026-06-16 behaviour) produced an unsatisfiable lock —
 * the provider cannot render 2s — and deadlocked the critic. Returns a violation
 * string on mismatch, null otherwise (incl. fail-open when the provider can't be
 * resolved, so a healthy plan is never falsely blocked).
 */
export function checkDurationLock(
  planBody: Record<string, unknown> | null,
  lockedDuration: number | null,
  directorOverrides: ReadonlyArray<DirectorOverride>,
  shotId: string,
): string | null {
  if (lockedDuration === null) return null;
  const raw = (planBody as { duration_seconds?: unknown } | null)?.duration_seconds;
  const planDur =
    typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : null;
  if (planDur === null) return null;
  // Director can waive the lock via an explicit override whose check mentions duration.
  const waived = directorOverrides.some((o) => /duration/i.test(o.check));
  if (waived) return null;

  // Clamp the creative cut into the Plan provider's render range before comparing.
  const providerObj = (planBody as { provider?: { id?: unknown } } | null)?.provider;
  const providerId =
    providerObj && typeof providerObj === 'object' && typeof providerObj.id === 'string'
      ? providerObj.id
      : null;
  let lockedRender = Math.round(lockedDuration);
  if (providerId) {
    try {
      const { providerImpl } = resolveVanimProviderId(providerId);
      lockedRender = clampRenderDuration(VIDEO_PROVIDER_CAPS[providerImpl], lockedDuration);
    } catch {
      // Off-allowlist / unresolvable provider → can't compute the render floor;
      // fall open rather than false-block (V14's standing fail-open posture).
      return null;
    }
  }

  if (Math.round(planDur) !== Math.round(lockedRender)) {
    return `Plan duration_seconds=${planDur}s does not match the provider-clamped animatic timing=${lockedRender}s for ${shotId} (animatic cut=${lockedDuration}s, floored to the generator's render minimum). The approved animatic is the source of truth for timing — to change it the Director adjusts the animatic or grants an explicit duration override. Sub-floor creative timing is achieved by trimming the rendered clip at stitch, NOT by writing a sub-floor duration into the Plan.`;
  }
  return null;
}

/**
 * V15 (2026-06-17) — orbit ⇒ ref-only. Empirically validated by the E10 SH07+SH03
 * A/B smoke (seed-locked, only end_image varied; Director verdict «с рефом гораздо
 * лучше»): on a camera-orbit shot a pinned end_image fights the orbit — the camera
 * hitches / morphs toward the locked end frame instead of arcing freely. Two anchors
 * (`end_image` / `seedance-with-end-image`) are therefore reserved for STATIC,
 * non-orbit match-cut landings only. Since 80%+ of shots orbit (TD-68), ref-only is
 * the default and two-anchor is the exception.
 *
 * Deterministic post-LLM check, mirrors V14: if the Plan declares orbit motion AND a
 * non-null end_image (or the with-end-image provider), coerce REVISE. The LLM critic
 * historically PASSed this combo (the Animator skill even recommended end_image for
 * "orbit landing"), so enforce it LLM-independently here. Director can waive via an
 * override whose `check` mentions 'orbit', 'anchor' or 'end_image'. Returns a
 * violation string or null (fail-open — never falsely block a clean plan).
 */
export function checkOrbitEndImage(
  planBody: Record<string, unknown> | null,
  directorOverrides: ReadonlyArray<DirectorOverride>,
  shotId: string,
): string | null {
  if (!planBody) return null;

  // Two-anchor signal: a non-null end_image asset OR the with-end-image provider.
  const endImage = (planBody as { end_image?: { eref_asset_id?: unknown } }).end_image;
  const endId =
    endImage && typeof endImage === 'object' ? endImage.eref_asset_id : null;
  const hasEnd = typeof endId === 'string' && endId.trim().length > 0;
  const providerObj = (planBody as { provider?: { id?: unknown } }).provider;
  const providerId =
    providerObj && typeof providerObj === 'object' && typeof providerObj.id === 'string'
      ? providerObj.id
      : '';
  const twoAnchor = hasEnd || providerId === 'seedance-with-end-image';
  if (!twoAnchor) return null;

  // Orbit signal: opening_camera_motion.kind === 'rotate' OR orbit/rotate prose.
  const cam = (
    planBody as { opening_camera_motion?: { kind?: unknown; prose?: unknown } }
  ).opening_camera_motion;
  const kind =
    cam && typeof cam === 'object' && typeof cam.kind === 'string' ? cam.kind : '';
  const prose =
    cam && typeof cam === 'object' && typeof cam.prose === 'string' ? cam.prose : '';
  const orbit = kind === 'rotate' || /\borbit|\brotat/i.test(prose);
  if (!orbit) return null;

  // Director waiver (TD-74 channel): an override whose check names this axis.
  const waived = directorOverrides.some((o) => /orbit|anchor|end[_ ]?image/i.test(o.check));
  if (waived) return null;

  return `Plan for ${shotId} pairs a camera ORBIT (opening_camera_motion.kind=${kind || 'rotate-prose'}) with a pinned end_image / two-anchor provider (${providerId || 'end_image set'}). Empirically the end-frame lock fights the orbit — the camera hitches/morphs toward the locked frame instead of arcing freely (E10 SH07/SH03 A/B, Director verdict). Orbit shots MUST render ref-only: provider seedance-standard or seedance-fast, end_image.eref_asset_id=null. Two anchors are reserved for STATIC, non-orbit match-cut landings. Fix: drop the end_image, or (rarely) replace the orbit with a justified static frame.`;
}

export async function runAnimatorCritic(args: VPREVRunArgs): Promise<VPREVRunResult> {
  const { supabase, planAssetId, shotId } = args;
  if (!planAssetId) throw new AnimatorCriticError('planAssetId is required');
  if (!shotId) throw new AnimatorCriticError('shotId is required');

  const directorOverrides: ReadonlyArray<DirectorOverride> = Array.isArray(args.directorOverrides)
    ? args.directorOverrides.filter(
        (o): o is DirectorOverride =>
          o !== null &&
          typeof o === 'object' &&
          typeof (o as DirectorOverride).check === 'string' &&
          typeof (o as DirectorOverride).rationale === 'string' &&
          (o as DirectorOverride).check.trim().length > 0,
      )
    : [];

  const plan = await loadPlanRow(supabase, planAssetId);
  const systemPrompt = await loadSystemPrompt();

  // 2026-06-06 — read Director's LOCKED standing orders from the Series Bible
  // (SBL-* assets) so the Critic validates against them, not only against the
  // provider-compatibility contract. Same loader the Animator already uses,
  // so the two agents see identical canon. Failure to load is non-fatal —
  // the Critic degrades to its prior behaviour (no Bible context).
  const episodeIdForBible =
    (args.inputs as { episode_id?: string } | undefined)?.episode_id ?? '';
  let bibleBlock = '';
  if (episodeIdForBible) {
    try {
      const canon = await loadSeriesBibleCanon(supabase, episodeIdForBible);
      bibleBlock = formatBibleForPrompt(canon);
    } catch {
      // Non-fatal: Critic continues without Bible context.
    }
  }

  const episodeFormatBlock = buildEpisodeFormatAuthorityBlock(
    readEpisodeVideoConfig((args.inputs as { episode?: unknown } | undefined)?.episode),
  );

  const userMessage = buildUserMessage({
    planAssetId,
    shotId,
    planContent: plan.content,
    planStatus: plan.status,
    directorOverrides,
    bibleBlock,
    episodeFormatBlock,
  });

  const notes: string[] = [];
  let result: AnthropicTextResult;
  try {
    result = await generateAnthropicText({
      systemPrompt,
      userMessage,
      model: VPREV_MODEL,
      maxOutputTokens: VPREV_MAX_TOKENS,
      expectsJson: true,
      agentClass: 'checker', // F7: critics ride the free tier (CHECKERS_FREE_TIER)
    });
  } catch (err: unknown) {
    if (err instanceof AnthropicTextError) {
      throw new AnimatorCriticError(`Anthropic generation failed: ${err.message}`, err);
    }
    throw err;
  }

  if (!result.body) {
    notes.push('Critic returned no parseable JSON block — UNKNOWN verdict');
  }
  if (result.costUsd > VPREV_COST_CEILING_USD) {
    notes.push(
      `Cost overrun: $${result.costUsd.toFixed(4)} > ceiling $${VPREV_COST_CEILING_USD}`,
    );
  }

  const verdict = parseVerdict(result.body);
  const failedChecks = parseFailedChecks(result.body);
  const passedChecks = parseStringArray(result.body, 'passed_checks');
  const acceptanceCriteria = parseStringArray(result.body, 'acceptance_criteria');
  const warnings = parseStringArray(result.body, 'warnings');

  // V14 (2026-06-04): deterministic duration-lock. Runs AFTER the LLM and
  // OVERRIDES its verdict. The Critic LLM only range-checked duration ([3,8]) and
  // never compared against the locked animatic, so the Animator could stretch
  // 2s→5s undetected (SH03/SH04). Enforce the lock here, LLM-independent.
  const episodeId = (args.inputs as { episode_id?: string } | undefined)?.episode_id ?? '';
  const lockedDuration = episodeId
    ? await lockedAnimaticDuration(supabase, episodeId, shotId)
    : null;
  const durationViolation = checkDurationLock(
    result.body,
    lockedDuration,
    directorOverrides,
    shotId,
  );
  let effectiveVerdict = verdict;
  let effectiveFailedChecks = failedChecks;
  // V15 orbit is advisory (see below): warnings accumulate without touching verdict.
  let effectiveWarnings = [...warnings];
  if (durationViolation) {
    effectiveFailedChecks = [
      ...failedChecks,
      { check: 'V14-duration-lock', diagnosis: durationViolation },
    ];
    if (
      effectiveVerdict === 'PASS' ||
      effectiveVerdict === 'PASS_WITH_UNCERTAINTY' ||
      effectiveVerdict === 'UNKNOWN'
    ) {
      effectiveVerdict = 'REVISE';
    }
    notes.push('V14 duration-lock failed → verdict coerced to REVISE');
  }

  // V15 (2026-06-17; softened 2026-07-04): orbit ⇒ ref-only. The empirical
  // finding is real — a pinned end_image fights a camera orbit (E10 A/B smoke) —
  // but a HARD REVISE forced a Director Override on EVERY orbit+end_image
  // experiment (Director: «orbit должен быть ПРЕДУПРЕЖДЕНИЕМ, а не БЛОКОМ»). So
  // V15 is now ADVISORY: surface a WARNING, preserve the verdict. The guidance
  // stays; the Director (or an EREF frame_role='end' routing) can proceed without
  // a waiver. checkOrbitEndImage itself is unchanged.
  const orbitViolation = checkOrbitEndImage(result.body, directorOverrides, shotId);
  if (orbitViolation) {
    effectiveWarnings = [...effectiveWarnings, `V15-orbit-ref-only: ${orbitViolation}`];
    notes.push('V15 orbit-ref-only → advisory warning (verdict preserved)');
  }

  const description = [
    // F7 honesty: result.model is the ACTUAL model (gemini on the free tier),
    // not the requested constant — descriptions are the Director's audit trail.
    `Animator's Critic verdict ${effectiveVerdict} · ${VPREV_CONTRACT} · ${result.model}`,
    `· ${effectiveFailedChecks.length} failed`,
    `· ${passedChecks.length} passed`,
    `· cost $${result.costUsd.toFixed(4)}`,
  ].join(' ');

  return {
    markdown: result.markdown,
    body: result.body ?? {},
    costUsd: result.costUsd,
    model: result.model,
    contract: VPREV_CONTRACT,
    verdict: effectiveVerdict,
    planAssetId,
    shotId,
    acceptanceCriteria,
    failedChecks: effectiveFailedChecks,
    passedChecks,
    warnings: effectiveWarnings,
    description,
    notes,
  };
}
