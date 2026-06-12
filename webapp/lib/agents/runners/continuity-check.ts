// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/runners/continuity-check.ts
// EXEC-CONT — Continuity Supervisor (the EXEC-WCHK slot).
// Reads APPROVED storyboard JSON + LOCKED Series Bible canon. For each shot,
// validates that:
//   - location ∈ LOCKED SBL-location_* names              (CHK-W01)
//   - characters_present[] ⊆ LOCKED SBL-character_* names  (CHK-W03)
// and — behind CONTINUITY_LEDGER_ENABLED (Motor 1, 2026-06-11) —
//   - lighting / appearance advisory canon checks          (CHK-W02 / W07)
//   - per-shot duration schema limits                      (CHK-W05)
//   - deterministic state-evolution ledger                 (CHK-W08):
//     Haiku extraction → ShotStateDelta[] → validateStateLedger (pure code).
// Returns PASS / REVISE / FAIL verdict with per-shot issues. The ledger never
// FAILs on its own; comedy-soft policy (Director q2 2026-06-11): the MAJOR
// pool (ledger + durations + canon conflicts) must reach the threshold to
// downgrade PASS → REVISE.
//
// Honours specs/contracts/continuity_check@v2.yaml.
// ──────────────────────────────────────────────────────────────────────────────

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../supabase/types.gen';
import {
  generateAnthropicText,
  AnthropicTextError,
  type AnthropicTextResult,
} from '../providers/anthropic-text';
import { seriesIdForEpisode, bibleSlug } from '../../api/series-bible';
import { continuityLedgerEnabled } from '../chain-flags';
import { findApprovedAsset } from '../upstream';
import {
  validateStateLedger,
  reviseImpactForMajorPool,
  LEDGER_REVISE_MAJOR_THRESHOLD,
  type LedgerViolation,
  type ShotStateDelta,
} from '../state-ledger';
import {
  runContinuityExtract,
  ContinuityExtractError,
} from './continuity-extract';
import {
  validateInventory,
  parseBriefPropDelta,
  type PropSpec,
} from '../inventory-cascade';
import {
  listStoryboardShotsV2,
  type StoryboardShotV2,
} from '../../api/vgen-shot-helpers';
import type { AgentInputs } from '../types';

export const CONT_CONTRACT = 'continuity_check@v2';
export const CONT_MODEL = 'claude-sonnet-4-6';
// Continuity emits per-shot rows + violations + descriptions in Russian; 3000
// is too tight for 13-17-shot storyboards. 6000 leaves room for prose + JSON.
export const CONT_MAX_TOKENS = 6000;
// CHK-W05 — per-shot duration limits from specs/schemas/shot.md.
export const SHOT_MIN_SECONDS = 1.5;
export const SHOT_MAX_SECONDS = 8.0;

export class ContinuityCheckError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'ContinuityCheckError';
  }
}

export interface ContinuityCheckRunResult {
  markdown: string;
  body: Record<string, unknown>;
  costUsd: number;
  model: string;
  contract: typeof CONT_CONTRACT;
  verdict: 'PASS' | 'REVISE' | 'FAIL' | 'UNKNOWN';
  storyboardAssetId: string | null;
  description: string;
  bibleSnapshot: { characters: string[]; locations: string[]; styles: string[] };
}

interface UpstreamAssetLike {
  id?: string;
  file_type?: string | null;
  status?: string | null;
  content?: string | null;
  filename?: string | null;
  version?: number | null;
}

interface BibleAssetLike {
  filename: string;
  description: string | null;
  status: string;
  file_type: string;
  /** SBL-object_* carries optional { aliases, geometry } for Motor 2. */
  metadata?: unknown;
}

let systemPromptCache: string | null = null;

async function loadSystemPrompt(): Promise<string> {
  if (systemPromptCache !== null) return systemPromptCache;
  const candidates = [
    path.resolve(process.cwd(), '../agents/exec/world_checker.md'),
    path.resolve(process.cwd(), 'agents/exec/world_checker.md'),
    path.resolve(process.cwd(), '../../agents/exec/world_checker.md'),
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
  // Fallback inline prompt — Continuity Supervisor role.
  systemPromptCache = [
    'You are the Continuity Supervisor for a TV-style animation studio.',
    'You enforce the Series Bible canon: every storyboard shot must use ONLY characters and locations',
    'that have a LOCKED canonical reference in the Series Bible. Unknown elements are violations.',
    '',
    'You do NOT rewrite the storyboard. You produce a verdict and an actionable list of violations the',
    'Storyboarder (or the Director) can address.',
  ].join('\n');
  return systemPromptCache;
}

// F2 (2026-06-12): findApprovedAsset → shared newest-wins resolver
// (lib/agents/upstream.ts; was a local copy, one of ten).

// Canonical slug lookup goes through lib/api/series-bible.bibleSlug — DO NOT
// re-introduce a local filename regex here. See JSDoc on bibleSlugFromFileType
// for the history of the bug this prevents.

async function loadBibleCanon(
  supabase: SupabaseClient<Database>,
  seriesId: string,
): Promise<{
  characters: BibleAssetLike[];
  locations: BibleAssetLike[];
  styles: BibleAssetLike[];
  objects: BibleAssetLike[];
}> {
  const { data, error } = await supabase
    .from('assets')
    .select('filename,description,status,file_type,metadata')
    .eq('series_id', seriesId)
    .eq('status', 'LOCKED')
    .like('file_type', 'SBL-%');
  if (error) throw new ContinuityCheckError(`Bible canon fetch: ${error.message}`);
  const all = (data ?? []) as BibleAssetLike[];
  return {
    characters: all.filter((a) => a.file_type.startsWith('SBL-character_')),
    locations: all.filter((a) => a.file_type.startsWith('SBL-location_')),
    styles: all.filter((a) => a.file_type.startsWith('SBL-style_')),
    // Motor 2 (CHK-W04): the v1 contract declared SBL-object_ as
    // optional_series from day one — the runner just never loaded it.
    objects: all.filter((a) => a.file_type.startsWith('SBL-object_')),
  };
}

/** Bible SBL-object_* asset → PropSpec (aliases/geometry from metadata). */
function bibleObjectToPropSpec(a: BibleAssetLike): PropSpec | null {
  const name = bibleSlug(a.file_type);
  if (!name) return null;
  const meta =
    a.metadata && typeof a.metadata === 'object'
      ? (a.metadata as { aliases?: unknown; geometry?: unknown })
      : null;
  return {
    name,
    aliases: Array.isArray(meta?.aliases)
      ? meta.aliases.filter((x): x is string => typeof x === 'string')
      : undefined,
    geometry:
      typeof meta?.geometry === 'string'
        ? meta.geometry
        : a.description ?? undefined,
  };
}

function buildUserMessage(args: {
  episodeCode: string;
  storyboardContent: string;
  storyboardVersion: number;
  bible: {
    characters: BibleAssetLike[];
    locations: BibleAssetLike[];
    styles: BibleAssetLike[];
  };
  /** Motor 1 flag — adds CHK-W02 lighting + CHK-W07 appearance advisory checks. */
  canonChecks?: boolean;
  /** Motor 2 — prop inventory union; geometry notes ground CHK-W06 advisories. */
  inventory?: readonly PropSpec[];
}): string {
  const {
    episodeCode,
    storyboardContent,
    storyboardVersion,
    bible,
    canonChecks,
    inventory,
  } = args;
  const charNames = bible.characters
    .map((c) => bibleSlug(c.file_type))
    .filter((s): s is string => Boolean(s));
  const locNames = bible.locations
    .map((c) => bibleSlug(c.file_type))
    .filter((s): s is string => Boolean(s));

  const charDescriptions = bible.characters
    .map((c) => {
      const name = bibleSlug(c.file_type) ?? 'unknown';
      const desc = (c.description ?? '').slice(0, 400);
      return `- ${name}: ${desc || '(no description)'}`;
    })
    .join('\n');
  const locDescriptions = bible.locations
    .map((c) => {
      const name = bibleSlug(c.file_type) ?? 'unknown';
      const desc = (c.description ?? '').slice(0, 400);
      return `- ${name}: ${desc || '(no description)'}`;
    })
    .join('\n');

  return [
    '# Task',
    `Validate the APPROVED storyboard for episode ${episodeCode} (v${storyboardVersion}) against the LOCKED Series Bible canon below.`,
    '',
    '## LOCKED Series Bible canon',
    '',
    `**Allowed characters** (${charNames.length}):`,
    charDescriptions || '(none)',
    '',
    `**Allowed locations** (${locNames.length}):`,
    locDescriptions || '(none — episode may use any location, but flag any that look invented)',
    '',
    `**Style guide** (${bible.styles.length} entries) — see Bible Library; not enforced here, just informs tone of violations.`,
    '',
    ...(canonChecks && inventory && inventory.length > 0
      ? [
          `**Prop canon** (${inventory.length} entries — Bible objects ∪ episode prop_delta).`,
          'Geometry notes are physics canon (CHK-W06 advisory): flag an issue when a',
          'shot\'s action contradicts a prop\'s stated geometry (e.g. a four-legged',
          'table "rolling like a wheel" when its canon says it cannot roll).',
          ...inventory.map(
            (p) =>
              `- ${p.name}${p.aliases?.length ? ` (aka ${p.aliases.join(', ')})` : ''}${p.geometry ? ` — ${p.geometry.slice(0, 200)}` : ''}`,
          ),
          '',
        ]
      : []),
    '## Storyboard under review',
    '',
    '<storyboard>',
    storyboardContent,
    '</storyboard>',
    '',
    '## Output format',
    '',
    'Markdown report:',
    '```',
    '# Continuity Check — <episode> v<N>',
    '',
    '## Verdict',
    '<PASS | REVISE | FAIL>',
    '',
    '## Summary',
    '<2-3 sentences why>',
    '',
    '## Per-shot results',
    '<for each shot in storyboard JSON.acts[].shots[]: shot_id, location verdict, characters verdict, list any issues. The storyboard may follow either contract version: v2 uses `location.slug` (object) and `characters[].bible_slug` (array of objects); v1 used `location` (string) and `characters_present[]` (array of strings). Look up the canonical character/location slugs from the LOCKED Bible canon above, regardless of contract version.>',
    '',
    '## Violations',
    '<list any character or location that is not in the LOCKED Bible canon>',
    '```',
    '',
    ...(canonChecks
      ? [
          'Additionally, per shot (CHK-W02 / CHK-W07, advisory):',
          '- lighting_canon: does the shot\'s stated lighting/time-of-day contradict the',
          '  location description above? "CONFLICT" only on a real contradiction (location',
          '  described as windowless but shot says "sunlight floods in"); "N/A" when the',
          '  shot or the location says nothing about lighting; otherwise "PASS".',
          '- appearance_canon: does action_prose DESCRIBE a character\'s appearance in a way',
          '  that contradicts their canonical description above? Motion/behaviour is NOT',
          '  appearance — "N/A". Physically-motivated temporary states (covered in dust)',
          '  are PASS unless they contradict an invariant (e.g. the character\'s canonical',
          '  body is transparent and the prose paints it opaque).',
          '',
        ]
      : []),
    'Then append exactly one fenced JSON block:',
    '',
    '```json',
    '{',
    `  "episode_id": "${episodeCode}",`,
    `  "storyboard_version": ${storyboardVersion},`,
    '  "verdict": "PASS" | "REVISE" | "FAIL",',
    '  "per_shot": [',
    '    {',
    '      "shot_id": "<from storyboard>",',
    '      "location_canon": "PASS" | "MISSING" | "UNKNOWN",',
    '      "characters_canon": "PASS" | "MISSING" | "UNKNOWN",',
    ...(canonChecks
      ? [
          '      "lighting_canon": "PASS" | "CONFLICT" | "N/A",',
          '      "appearance_canon": "PASS" | "CONFLICT" | "N/A",',
        ]
      : []),
    '      "issues": ["<actionable issue>"]',
    '    }',
    '  ],',
    '  "summary": "<short summary>",',
    '  "canon_used": {',
    '    "characters": ["<canonical name>"],',
    '    "locations": ["<canonical name>"]',
    '  },',
    '  "violations": ["<short violation lines>"]',
    '}',
    '```',
    '',
    'KEEP PROSE TIGHT — JSON block at end is mandatory and must not be truncated. If running long, shorten markdown — never skip JSON.',
    '',
    'Verdict rubric:',
    '- PASS: every shot uses only canonical characters; locations are canonical OR clearly episode-only and acceptable.',
    '- REVISE: some shots reference a character or location not in the LOCKED Bible. Storyboarder must rewrite.',
    '- FAIL: storyboard introduces multiple unknown characters or breaks the world rules — needs Director intervention.',
    '',
    'Hard rules:',
    '- Compare characters by exact slug match against the canonical list above (storyboarder@v2 puts the slug in `characters[].bible_slug`; @v1 used `characters_present[]` strings — both should match the canon).',
    '- Compare locations by exact slug match against `location.slug` (v2) or by parsing the prefix of the legacy `location` string (v1).',
    '- A v2 shot also carries per-character `expected_emotion` and `expected_action` — these are NOT canon constraints; do not flag them as violations. They are the test plan for the downstream EREF AI-reviewer.',
    '- Locations are softer: a new location is allowed if the brief implies it; flag with "UNKNOWN" only when it is invented mid-storyboard with no narrative justification.',
    '- The fenced JSON must be valid JSON.',
  ].join('\n');
}

// ── Motor 1 deterministic helpers (CHK-W05 + CHK-W08 merge) ──────────────────

interface DurationViolation {
  shot_id: string;
  duration_seconds: number;
  description: string;
}

/** CHK-W05 — per-shot duration limits from specs/schemas/shot.md. Pure. */
export function checkShotDurations(
  shots: readonly StoryboardShotV2[],
): DurationViolation[] {
  const out: DurationViolation[] = [];
  for (const s of shots) {
    const d = s.duration_seconds;
    if (typeof d !== 'number') continue; // schema demands it; absence is the
    // storyboarder contract's problem, not a duration-limit violation.
    if (d < SHOT_MIN_SECONDS || d > SHOT_MAX_SECONDS) {
      out.push({
        shot_id: s.shot_id,
        duration_seconds: d,
        description:
          `${s.shot_id}: длительность ${d}s вне лимитов схемы ` +
          `(${SHOT_MIN_SECONDS}–${SHOT_MAX_SECONDS}s) — провайдеры ниже по ` +
          `цепочке обрежут или отклонят кадр.`,
      });
    }
  }
  return out;
}

type LedgerStatus = 'OK' | 'EXTRACTION_FAILED' | 'NO_SHOTS';

interface LedgerSectionArgs {
  status: LedgerStatus;
  error: string | null;
  violations: readonly LedgerViolation[];
  durationViolations: readonly DurationViolation[];
  canonConflicts: number;
  majorPool: number;
  downgraded: boolean;
  droppedEntries: number;
  /** Motor 2 result — null when extraction failed (check skipped). */
  inventory?: import('../inventory-cascade').InventoryCheckResult | null;
}

/** Russian report section appended to the WCHK markdown (Director-facing). */
function renderLedgerSection(a: LedgerSectionArgs): string {
  const lines: string[] = ['', '## State Ledger (CHK-W08) + длительности (CHK-W05)', ''];
  if (a.status === 'EXTRACTION_FAILED') {
    lines.push(
      `⚠️ **Extraction не удался** — state-ledger пропущен: ${a.error ?? 'unknown'}.`,
      'Вердикт основан только на canon-membership проверках.',
    );
    return lines.join('\n');
  }
  if (a.status === 'NO_SHOTS') {
    lines.push('⚠️ В раскадровке не распарсилось ни одного кадра — ledger пропущен.');
    return lines.join('\n');
  }
  if (a.violations.length === 0 && a.durationViolations.length === 0 && a.canonConflicts === 0) {
    lines.push('Нарушений эволюции состояний, лимитов длительности и canon-конфликтов не найдено.');
  } else {
    for (const v of a.violations) {
      lines.push(`- [${v.severity}] ${v.rule} — ${v.description}`);
    }
    for (const d of a.durationViolations) {
      lines.push(`- [MAJOR] DURATION_LIMIT — ${d.description}`);
    }
    if (a.canonConflicts > 0) {
      lines.push(
        `- [MAJOR×${a.canonConflicts}] CANON_CONFLICT — lighting/appearance ` +
          'конфликты, см. per_shot.',
      );
    }
  }
  if (a.droppedEntries > 0) {
    lines.push(
      '',
      `_Extraction отбросил ${a.droppedEntries} некорректных записей — ` +
        'покрытие леджера неполное._',
    );
  }
  // Motor 2 (CHK-W04) — inventory cascade status.
  if (a.inventory) {
    if (a.inventory.status === 'NO_INVENTORY') {
      lines.push(
        '',
        '_Инвентарь пропов пуст (нет SBL-object_* в Bible и prop_delta в брифе) — ' +
          'CHK-W04 не активен. Наполнение инвентаря включит проверку._',
      );
    } else if (a.inventory.unresolvedEntities.length > 0) {
      lines.push(
        '',
        `Инвентарь (CHK-W04): ${a.inventory.resolvedCount} пропов опознано, ` +
          `${a.inventory.unresolvedEntities.length} вне канона (MINOR): ` +
          a.inventory.unresolvedEntities.join(', ') +
          '.',
      );
    } else {
      lines.push('', `Инвентарь (CHK-W04): все ${a.inventory.resolvedCount} пропов в каноне.`);
    }
  }
  lines.push(
    '',
    `MAJOR-пул: ${a.majorPool} (порог REVISE: ${LEDGER_REVISE_MAJOR_THRESHOLD}). ` +
      (a.downgraded
        ? '**Вердикт понижен до REVISE** — системный дрейф состояний.'
        : 'Комедийный допуск (q2): вердикт не понижен.'),
  );
  return lines.join('\n');
}

export interface ContinuityCheckRunArgs {
  inputs: AgentInputs;
  /** Service-role supabase to load Bible canon (cross-RLS read). */
  supabase: SupabaseClient<Database>;
}

export async function runContinuityCheck(
  args: ContinuityCheckRunArgs,
): Promise<ContinuityCheckRunResult> {
  const { inputs, supabase } = args;

  const ep = inputs.episode as
    | { id?: string; episode_code?: string; series_id?: string | null }
    | undefined;
  const episodeCode = ep?.episode_code ?? 'UNKNOWN';

  const upstream = inputs.upstream_assets as readonly UpstreamAssetLike[] | undefined;
  const sbAsset = findApprovedAsset(upstream, 'STB-storyboard');
  if (!sbAsset?.content) {
    throw new ContinuityCheckError(
      'Precondition failed: APPROVED STB-storyboard with content not found',
    );
  }

  // Series is required to load Bible canon. Always resolve via helper so we
  // get a real UUID even when episodes.series_id was populated with the code
  // (legacy NewEpisodeModal bug).
  const seriesId = await seriesIdForEpisode(supabase, ep?.id ?? inputs.episode_id);
  if (!seriesId) {
    throw new ContinuityCheckError(
      'Precondition failed: episode has no parent series_id, cannot load Bible canon',
    );
  }

  const bible = await loadBibleCanon(supabase, seriesId);

  const ledgerOn = continuityLedgerEnabled();

  // Motor 2 (CHK-W04) — cascading inventory: Bible SBL-object_* canon ∪ the
  // brief's prop_delta (Director q3a). Empty union = data not populated yet →
  // the check self-deactivates (NO_INVENTORY) — no second feature flag.
  const briefAsset = findApprovedAsset(upstream, 'SPC-brief');
  const inventory: PropSpec[] = ledgerOn
    ? [
        ...bible.objects
          .map(bibleObjectToPropSpec)
          .filter((p): p is PropSpec => p !== null),
        ...parseBriefPropDelta(briefAsset?.content),
      ]
    : [];

  const systemPrompt = await loadSystemPrompt();
  const userMessage = buildUserMessage({
    episodeCode,
    storyboardContent: sbAsset.content,
    storyboardVersion: sbAsset.version ?? 1,
    bible,
    canonChecks: ledgerOn,
    inventory,
  });

  let result: AnthropicTextResult;
  try {
    result = await generateAnthropicText({
      systemPrompt,
      userMessage,
      model: CONT_MODEL,
      maxOutputTokens: CONT_MAX_TOKENS,
      expectsJson: true,
    });
  } catch (err: unknown) {
    if (err instanceof AnthropicTextError) {
      throw new ContinuityCheckError(`Anthropic call failed: ${err.message}`, err);
    }
    throw err;
  }

  if (!result.body) {
    throw new ContinuityCheckError('No JSON block in continuity response');
  }

  const verdictRaw = result.body.verdict;
  let verdict: ContinuityCheckRunResult['verdict'] =
    verdictRaw === 'PASS' || verdictRaw === 'REVISE' || verdictRaw === 'FAIL'
      ? verdictRaw
      : 'UNKNOWN';

  // ── Motor 1 (CONTINUITY_LEDGER_ENABLED): CHK-W05 durations + CHK-W08 state
  //    ledger + CHK-W02/W07 conflict counting. Flag off → byte-identical
  //    legacy membership-only behaviour (replay-pilot keeps passing).
  let totalCostUsd = result.costUsd;
  let markdown = result.markdown;
  const body: Record<string, unknown> = { ...result.body };

  if (ledgerOn) {
    const shots = listStoryboardShotsV2(sbAsset.content);
    const durationViolations = checkShotDurations(shots);

    let ledgerStatus: LedgerStatus = 'OK';
    let ledgerError: string | null = null;
    let ledgerViolations: readonly LedgerViolation[] = [];
    let droppedEntries = 0;
    let extractedDeltas: ShotStateDelta[] | null = null;

    if (shots.length === 0) {
      ledgerStatus = 'NO_SHOTS';
    } else {
      try {
        const ex = await runContinuityExtract(shots);
        totalCostUsd += ex.costUsd;
        droppedEntries = ex.droppedEntries;
        extractedDeltas = ex.deltas;
        ledgerViolations = validateStateLedger(ex.deltas);
      } catch (err: unknown) {
        if (err instanceof ContinuityExtractError) {
          // Surfaced loudly (body + markdown + description), NOT swallowed —
          // but a cheap extraction hiccup must not void the membership
          // verdict the Sonnet call already produced.
          ledgerStatus = 'EXTRACTION_FAILED';
          ledgerError = err.message;
        } else {
          throw err;
        }
      }
    }

    // Motor 2 (CHK-W04) — reuses the SAME extraction deltas; characters and
    // locations are known non-props. Skipped when extraction failed.
    const knownNonProps = [
      ...bible.characters.map((c) => bibleSlug(c.file_type)),
      ...bible.locations.map((c) => bibleSlug(c.file_type)),
    ].filter((s): s is string => Boolean(s));
    const inventoryResult = extractedDeltas
      ? validateInventory(extractedDeltas, inventory, knownNonProps)
      : null;

    // CHK-W02/W07 — count CONFLICT labels the Sonnet pass emitted per shot.
    const perShot = Array.isArray(body.per_shot) ? body.per_shot : [];
    let canonConflicts = 0;
    for (const row of perShot) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      if (r.lighting_canon === 'CONFLICT') canonConflicts += 1;
      if (r.appearance_canon === 'CONFLICT') canonConflicts += 1;
    }

    const ledgerMajors = ledgerViolations.filter(
      (v) => v.severity === 'MAJOR',
    ).length;
    const majorPool = ledgerMajors + durationViolations.length + canonConflicts;
    const downgraded =
      verdict === 'PASS' && reviseImpactForMajorPool(majorPool) === 'REVISE';
    if (downgraded) verdict = 'REVISE';

    body.verdict = verdict;
    body.state_violations = ledgerViolations;
    body.duration_violations = durationViolations;
    body.canon_conflicts = canonConflicts;
    body.inventory = inventoryResult
      ? {
          status: inventoryResult.status,
          inventory_size: inventory.length,
          resolved: inventoryResult.resolvedCount,
          unresolved_entities: inventoryResult.unresolvedEntities,
          violations: inventoryResult.violations,
        }
      : { status: 'SKIPPED_NO_EXTRACTION', inventory_size: inventory.length };
    body.ledger = {
      status: ledgerStatus,
      error: ledgerError,
      dropped_entries: droppedEntries,
      major_pool: majorPool,
      revise_threshold: LEDGER_REVISE_MAJOR_THRESHOLD,
      downgraded_verdict: downgraded,
    };

    markdown += renderLedgerSection({
      status: ledgerStatus,
      error: ledgerError,
      violations: ledgerViolations,
      durationViolations,
      canonConflicts,
      majorPool,
      downgraded,
      droppedEntries,
      inventory: inventoryResult,
    });
  }

  const ledgerSuffix = ledgerOn
    ? ` · ledger ${String((body.ledger as { status?: unknown })?.status ?? 'OFF')}` +
      ` (pool ${String((body.ledger as { major_pool?: unknown })?.major_pool ?? 0)})`
    : '';
  const description =
    `Produced by EXEC-CONT · ${CONT_CONTRACT} · ${CONT_MODEL} · ` +
    `verdict ${verdict} · ` +
    `${bible.characters.length} canon characters / ${bible.locations.length} locations · ` +
    `cost $${totalCostUsd.toFixed(4)}${ledgerSuffix}`;

  const charNames = bible.characters
    .map((c) => bibleSlug(c.file_type))
    .filter((s): s is string => Boolean(s));
  const locNames = bible.locations
    .map((c) => bibleSlug(c.file_type))
    .filter((s): s is string => Boolean(s));
  const styleNames = bible.styles
    .map((c) => bibleSlug(c.file_type))
    .filter((s): s is string => Boolean(s));

  return {
    markdown,
    body,
    costUsd: totalCostUsd,
    model: result.model,
    contract: CONT_CONTRACT,
    verdict,
    storyboardAssetId: sbAsset.id ?? null,
    description,
    bibleSnapshot: { characters: charNames, locations: locNames, styles: styleNames },
  };
}
