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
// Before anything else it HALTs when the board in hand is not the newest live
// storyboard for the episode (E33: PASS stamped on v2 while v3 was approved).
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
} from '../../providers/anthropic-text';
import { seriesIdForEpisode, bibleSlug } from '../../api/series-bible';
import { loadEpisodeCastSlugs } from '../episode-cast';
import { continuityLedgerEnabled } from '../chain-flags';
import { findApprovedAsset } from '../upstream';

// WCHK runs pre-approval (CREAD-PASS chain) — accept the latest board in any
// reviewable status, mirroring the Script Critic's SCR-script resolution.
const STB_REVIEWABLE: ReadonlySet<string> = new Set(['REVIEW', 'REVISION', 'APPROVED']);
/** Statuses a storyboard row can hold and still be a LIVE candidate for approval.
 *  A newer row in one of these is the board the Director is about to approve —
 *  see assertCheckedBoardIsLatest. REJECTED / INVALIDATED / TEST are dead ends. */
const STB_LIVE_STATUSES = [
  'DRAFT',
  'REVIEW',
  'REVISION',
  'APPROVED',
  'LOCKED',
  'NEEDS_HUMAN_TWEAK',
] as const;
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
/** Output budget for the Continuity Sonnet call.
 *
 *  History:
 *  - 3000 was too tight for 13-17-shot storyboards. 6000 replaced it, sized
 *    for membership-only reports (location + characters per shot).
 *  - 2026-07-17: 6000 → 12000 after E30 died with `stop_reason=max_tokens` at
 *    15385 chars, truncated before the mandatory closing JSON fence. The 6000
 *    predates Motor 1 (4ff52624), which added per-shot lighting_canon +
 *    appearance_canon and the prop-canon block. WCHK also emits every shot
 *    TWICE — markdown prose AND the JSON per_shot array — and its Russian
 *    issue prose runs ~2-3 chars/token against English's ~4, so the char
 *    count understates the spend. 12000 matches SREV, the closest sibling
 *    (critic over a large artifact, structured findings). Checkers ride the
 *    free tier (F7, agentClass 'checker') — the extra budget costs nothing.
 */
export const CONT_MAX_TOKENS = 12000;
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

export interface BibleAssetLike {
  filename: string;
  description: string | null;
  /** Long-form canon body when the card keeps it separate from `description`. */
  content?: string | null;
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

/**
 * HALT guard (E33, 2026-07-29): WCHK must judge the board that is going for
 * approval — not whichever older row happened to be in `upstream_assets`.
 *
 * On E33 the v02 report graded `storyboard_version: 2` (ten shots, incl. a
 * SH10 that no longer exists) while v03 — nine shots — was the board that got
 * APPROVED. The final artifact was never checked, and the PASS was read as if
 * it covered it. Silently grading the older version is worse than not checking
 * at all: it manufactures a green verdict for an artifact nobody looked at.
 *
 * So: if a NEWER live storyboard row exists for this episode, stop. Never
 * downgrade to "check the old one and mention it".
 */
async function assertCheckedBoardIsLatest(
  supabase: SupabaseClient<Database>,
  episodeId: string | null | undefined,
  checkedVersion: number,
): Promise<{ status: 'OK' | 'SKIPPED'; newest_version: number | null; note?: string }> {
  if (!episodeId) return { status: 'SKIPPED', newest_version: null, note: 'no episode id' };
  const { data, error } = await supabase
    .from('assets')
    .select('id,version,status')
    .eq('episode_id', episodeId)
    .eq('file_type', 'STB-storyboard')
    .in('status', STB_LIVE_STATUSES as unknown as never)
    .order('version', { ascending: false })
    .limit(1);
  // A failed lookup cannot PROVE a mismatch — do not block the pipeline on it,
  // but say so in the report rather than presenting the guard as having run.
  if (error) return { status: 'SKIPPED', newest_version: null, note: error.message };
  const newest = (data ?? [])[0] as { version?: number | null; status?: string } | undefined;
  const newestVersion = typeof newest?.version === 'number' ? newest.version : null;
  if (newestVersion !== null && newestVersion > checkedVersion) {
    throw new ContinuityCheckError(
      `HALT — storyboard version mismatch: the newest live board is v${newestVersion} ` +
        `(${newest?.status ?? 'unknown status'}), but the board reaching this check is ` +
        `v${checkedVersion}. Checking the older board would stamp a verdict on an artifact ` +
        `that is not the one being approved. Re-fire EXEC-WCHK against v${newestVersion}.`,
    );
  }
  return { status: 'OK', newest_version: newestVersion };
}

async function loadBibleCanon(
  supabase: SupabaseClient<Database>,
  seriesId: string,
  castSlugs: Set<string> | null,
): Promise<{
  characters: BibleAssetLike[];
  locations: BibleAssetLike[];
  styles: BibleAssetLike[];
  objects: BibleAssetLike[];
}> {
  const { data, error } = await supabase
    .from('assets')
    .select('filename,description,content,status,file_type,metadata')
    .eq('series_id', seriesId)
    .eq('status', 'LOCKED')
    .like('file_type', 'SBL-%')
    // Deterministic order (2026-07-31) — see loadBibleCanon in episode-references.
    .order('created_at', { ascending: true });
  if (error) throw new ContinuityCheckError(`Bible canon fetch: ${error.message}`);
  const all = (data ?? []) as BibleAssetLike[];
  // Episode casting (2026-06-14): the continuity critic validates the storyboard
  // against the episode's CAST, not all-series canon — a character/object/
  // location the episode wasn't cast for must read as "not allowed here", not
  // "valid because it's somewhere in the series". `castSlugs === null` → no
  // gallery → unscoped (pre-casting behaviour). Styles stay series-wide.
  const inCast = (a: BibleAssetLike): boolean => {
    if (!castSlugs) return true;
    const slug = bibleSlug(a.file_type);
    return slug != null && castSlugs.has(slug.toLowerCase());
  };
  const locations = all.filter(
    (a) => a.file_type.startsWith('SBL-location_') && inCast(a),
  );
  return {
    characters: all.filter((a) => a.file_type.startsWith('SBL-character_') && inCast(a)),
    locations,
    styles: all.filter((a) => a.file_type.startsWith('SBL-style_')),
    // Motor 2 (CHK-W04): the v1 contract declared SBL-object_ as
    // optional_series from day one — the runner just never loaded it.
    objects: selectCanonObjects(all, inCast, locations),
  };
}

/**
 * Which LOCKED objects are prop canon for THIS episode.
 *
 * E33 fix (2026-07-29) — props resolve THROUGH the location card. The cast
 * gallery lists the story's principals; it does not list the standing
 * set-dressing of the rooms it casts. Cast-only filtering emptied the inventory
 * on E33 (cast = 3 entries: hero, antagonist, bedroom), so CHK-W04
 * self-deactivated (NO_INVENTORY), and the LLM — handed no prop canon at all —
 * flagged six LOCKED props as "not confirmed in the Bible inventory": 6 false
 * positives out of 6, every one of them named in the bedroom card's own
 * locked-object block. The missing step was never the check, it was this
 * resolution. With it the inventory is populated again and CHK-W04 can do the
 * one job nothing else does: catch a prop carried through a whole episode with
 * no canon card at all (E33's crib).
 */
export function selectCanonObjects(
  all: readonly BibleAssetLike[],
  inCast: (a: BibleAssetLike) => boolean,
  castLocations: readonly BibleAssetLike[],
): BibleAssetLike[] {
  const locationCanonText = castLocations
    .map((l) => `${l.description ?? ''}\n${l.content ?? ''}`)
    .join('\n')
    .toLowerCase();
  return all.filter((a) => {
    if (!a.file_type.startsWith('SBL-object_')) return false;
    if (inCast(a)) return true;
    const slug = bibleSlug(a.file_type);
    return (
      slug != null && slug.length > 0 && locationCanonText.includes(slug.toLowerCase())
    );
  });
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
          `**Prop canon** (${inventory.length} entries — Bible objects named by the`,
          'episode\'s cast OR by its location cards, ∪ the brief\'s prop_delta).',
          'This list is the ONLY authority on what is a canonical prop. An entry that',
          'appears here IS canon — never flag it as "not in the Bible", not even when',
          'the episode cast does not name it: standing set-dressing belongs to the',
          'location, not to the cast. A prop a shot uses that is ABSENT from this list',
          'has no canon card and no reference image, so every shot will re-invent its',
          'shape and colour — flag it as an issue naming the shot.',
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
    `## Output budget — ${CONT_MAX_TOKENS} tokens, hard cap`,
    '',
    `You have ${CONT_MAX_TOKENS} output tokens for this entire reply and no way to`,
    'exceed them: the response is cut off mid-word at the cap, so anything you have',
    'not written yet is simply lost. Russian prose costs ~2-3 tokens per word (vs ~4',
    'characters per token in English), so a per-shot report in Russian spends the',
    'budget roughly twice as fast as it looks.',
    '',
    'The fenced JSON block is the ONLY part that is machine-read, and it comes last —',
    'so overspending on markdown does not merely bloat the report, it destroys the',
    'output entirely. Spend the budget in this order:',
    '  1. The fenced JSON block — always, in full.',
    '  2. Markdown rows for shots that HAVE issues.',
    '  3. Everything else.',
    '',
    'If you are running long, compress the markdown, never the JSON: one line per',
    'clean shot, or collapse consecutive clean shots into a single',
    '"SH03-SH09: canon clean" line. A terse markdown report with valid JSON is a',
    'success; a beautiful report without the JSON block is a total failure.',
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
  // 2026-06-14 WCHK ordering fix: the Continuity Critic IS the gate that decides
  // whether the storyboard becomes APPROVED, so it must read the latest board in
  // a REVIEWABLE status (it runs pre-approval from the CREAD-PASS chain) — same
  // rule the Script Critic uses for SCR-script. APPROVED-only here was the E09
  // "APPROVED STB not found → never re-fires" stall. The brief below stays
  // APPROVED-only (it is approved upstream of the storyboard).
  const sbAsset = findApprovedAsset(upstream, 'STB-storyboard', STB_REVIEWABLE);
  if (!sbAsset?.content) {
    throw new ContinuityCheckError(
      'Precondition failed: STB-storyboard (REVIEW/REVISION/APPROVED) with content not found',
    );
  }

  // The board must be the one going for approval — HALT, never silently grade
  // an older version (E33: PASS stamped on v2 while v3 was approved).
  const checkedVersion = sbAsset.version ?? 1;
  const versionGuard = await assertCheckedBoardIsLatest(
    supabase,
    ep?.id ?? inputs.episode_id,
    checkedVersion,
  );

  // Series is required to load Bible canon. Always resolve via helper so we
  // get a real UUID even when episodes.series_id was populated with the code
  // (legacy NewEpisodeModal bug).
  const seriesId = await seriesIdForEpisode(supabase, ep?.id ?? inputs.episode_id);
  if (!seriesId) {
    throw new ContinuityCheckError(
      'Precondition failed: episode has no parent series_id, cannot load Bible canon',
    );
  }

  const castSlugs = await loadEpisodeCastSlugs(supabase, ep?.id ?? inputs.episode_id);
  const bible = await loadBibleCanon(supabase, seriesId, castSlugs);

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
    storyboardVersion: checkedVersion,
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
      agentClass: 'checker', // F7: critics ride the free tier (CHECKERS_FREE_TIER)
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
  let downgradedByLedger = false;

  // ── Motor 1 (CONTINUITY_LEDGER_ENABLED): CHK-W05 durations + CHK-W08 state
  //    ledger + CHK-W02/W07 conflict counting. Flag off → byte-identical
  //    legacy membership-only behaviour (replay-pilot keeps passing).
  let totalCostUsd = result.costUsd;
  let markdown = result.markdown;
  const body: Record<string, unknown> = { ...result.body };

  // The LLM echoes `storyboard_version` from the prompt template, so a report
  // can name a version it did not read. Overwrite with the artifact we actually
  // fed it — identity of the checked board is a fact, not a model opinion.
  body.storyboard_version = checkedVersion;
  body.storyboard_asset_id = sbAsset.id ?? null;
  body.storyboard_status = sbAsset.status ?? null;
  body.version_guard = versionGuard;

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
    // q15 block→warning (2026-06-23): the state-ledger's soft state-drift
    // (STATE_CHANGE_NO_CAUSE / STATE_REVERT_NO_CAUSE — pupil dilation, glow,
    // sand level, body-parts-as-props) is now ADVISORY. It still surfaces in the
    // section below + `major_pool` as warnings, but it NO LONGER bounces the
    // board. Only the genuine-canon (CHK-W02/W07 lighting/appearance CONFLICT)
    // and duration deterministic pool keeps the hard REVISE gate — plus the LLM
    // critic's own per-shot location/character canon verdict, untouched. This
    // kills the over-strict 61-micro-flag false-REVISE that stalled E12 while
    // preserving the real canon guard the Director asked to keep hard.
    const hardPool = durationViolations.length + canonConflicts;
    const downgraded =
      verdict === 'PASS' && reviseImpactForMajorPool(hardPool) === 'REVISE';
    if (downgraded) {
      verdict = 'REVISE';
      downgradedByLedger = true;
    }

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
    `Produced by EXEC-CONT · ${CONT_CONTRACT} · ${result.model} · ` +
    `verdict ${verdict} · STB v${checkedVersion} · ` +
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

  // 2026-06-14 verdict-stamp fix: the LLM's prose verdict can be stale after a
  // state-ledger downgrade (PASS in prose, REVISE in body.verdict + metadata —
  // the E09 content↔metadata mismatch). Prepend the authoritative final verdict
  // so the content headline always agrees with body.verdict and metadata.verdict.
  const verdictBanner =
    `## Continuity verdict: ${verdict}` +
    (downgradedByLedger ? ' — downgraded from PASS by the state-ledger (see below)' : '') +
    '\n\n' +
    `_Checked artifact: STB-storyboard v${checkedVersion} ` +
    `(${sbAsset.status ?? 'unknown status'}, asset ${sbAsset.id ?? 'unknown'})` +
    (versionGuard.status === 'SKIPPED'
      ? ' · ⚠️ latest-version guard skipped: ' + (versionGuard.note ?? 'unknown')
      : '') +
    '._\n\n';
  markdown = verdictBanner + markdown;

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
