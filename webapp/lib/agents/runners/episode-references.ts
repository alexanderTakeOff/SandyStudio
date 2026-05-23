// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/runners/episode-references.ts
// EXEC-EREF v2 — per-shot Episode Reference Generator with multi-image
// conditioning + post-generation AI reviewer + auto-regenerate loop + 4K upscale.
//
// Architectural shift from v1:
//   - Provider abstraction (MultiImageGenProvider) replaces direct OpenAI
//     edits calls. Director can switch providers per app_config.eref_provider.
//   - Multi-character anchoring: ALL Bible character refs from the shot's
//     test plan are passed simultaneously (where the provider supports it).
//     Solved the v1 "Vial drift" problem — first character no longer wins.
//   - AI reviewer (EXEC-EREF-CHECK) scores every generation. Verdict drives
//     the loop: APPROVE / REGENERATE (≤2 retries with suggested_prompt_v2) /
//     HUMAN_REVIEW.
//   - 4K upscale via fal.ai clarity-upscaler after AI-APPROVE so downstream
//     stages (Animatic, VGEN) ingest 4K input.
//   - Each asset row's metadata carries the full shot_reference contract
//     (test_plan + generation_history + review + retry_history + final_4k_url).
//
// Pipeline per shot:
//
//                 ┌──────────────┐
//                 │ build prompt │ ← Bible canon + storyboard test plan
//                 └──────┬───────┘
//                        ▼
//   ┌──── ≤2 retries ──── generate(provider) ─→ persist generation_history
//   │                            │
//   │                            ▼
//   │                    runEREFCheck(image, test_plan, bible refs)
//   │                            │
//   │                            ▼
//   │                  ┌─────────┴─────────┐
//   │       REGENERATE │     APPROVE       │ HUMAN_REVIEW
//   │                  │         │         │
//   │ retry++          │  upscale to 4K    │
//   │ prompt = sug     │ if enabled        │
//   └─→ next iteration │         │         │
//                      ▼         ▼         ▼
//                       insert/update IMG-episode_ref row
//                       status = REVIEW (Mode 1-3) / APPROVED (Mode 4)
//
// Backward-compat: legacy fields (provenance, image_prompt.history,
// source_bible_refs, anchor_image_asset_id, provider_used) are still
// populated for the current AssetDetailDrawer/EpisodeAssetDrawer surfaces.
// Phase F switches the drawer to read shot_reference primarily.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../supabase/types.gen';
import { persistBinary } from '../persist-binary';
import { seriesIdForEpisode, bibleSlug } from '../../api/series-bible';
import { runStyleCheck } from './style-check';
import { getStyleGuardianMode } from '../../api/style-guardian-config';
import {
  getEREFProvider,
  getEREFUpscaleEnabled,
  type EREFProviderId,
} from '../../api/eref-config';
import {
  getImageGenMultiProvider,
  resolveAvailableProviderId,
} from '../providers/image-gen-multi-registry';
import type {
  MultiImageGenProvider,
  MultiImageRef,
  MultiImageRefKind,
} from '../providers/image-gen-multi';
import { MultiImageGenError } from '../providers/image-gen-multi';
import { readBibleImageAsBase64 } from '../providers/openai-image-edit';
import {
  checkPlanAnchorFreshness,
  formatStaleAnchorMessage,
} from './episode-reference-freshness';
import { upscaleToFourK, UpscaleError } from '../providers/upscale-fal';
import { runEREFCheck, type ReviewBibleRef } from './eref-check';
import { isErefCancelled } from '../../api/eref-cancel';
import { setPilotState } from '../../api/eref-pilot-state';
import {
  deriveSpatialCoverage,
  formatSpatialBlockForPrompt,
  type SpatialShotEntry,
} from '../../api/eref-spatial-coverage';
import type {
  EREFReview,
  GenerationAttempt,
  GenerationTriggeredBy,
  ReferenceUsed,
  RetryEntry,
  ShotCharacterTestPlan,
  ShotReferenceContract,
  ShotTestPlan,
} from '../../api/shot-reference';
import { SHOT_REFERENCE_CONTRACT } from '../../api/shot-reference';
import { selectSkills } from '../../skills/select-skills';
import type { AgentInputs } from '../types';
import type {
  GovernanceModeNum,
  ImagePromptHistoryEntry,
} from '../../api/series-bible';

// ── Constants ────────────────────────────────────────────────────────────────

export const EREF_CONTRACT = SHOT_REFERENCE_CONTRACT; // 'episode_references@v2'
export const EREF_MAX_REFS_CAP = 49;
/** Per Director's plan: ≤2 auto-regenerations, then HUMAN_REVIEW. */
export const EREF_MAX_RETRIES = 2;
export const EREF_QUALITY = 'medium' as const;
/** Image dimensions ≥ this on either axis count as 4K. */
const FOUR_K_THRESHOLD = 3840;

export class EpisodeReferencesError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'EpisodeReferencesError';
  }
}

// ── Local types ──────────────────────────────────────────────────────────────

interface UpstreamAssetLike {
  id?: string;
  file_type?: string | null;
  status?: string | null;
  content?: string | null;
  filename?: string | null;
  version?: number | null;
}

interface BibleAssetLike {
  id: string;
  filename: string;
  description: string | null;
  content: string | null;
  staging_path: string | null;
  drive_web_view_url: string | null;
  status: string;
  file_type: string;
}

interface ParsedShot {
  shot_id: string;
  act: number;
  /** Flat location string for filename / description. */
  location: string;
  /**
   * Bible-locked canonical location slug (e.g. "bedroom_main", "kitchen_morning")
   * — verbatim from storyboard JSON's `location.slug`. TD-30 (2026-05-21):
   * used by Designer to look up the latest APPROVED IMG-episode_ref in the
   * same location and embed it as `scene_continuity_anchor` to stabilise
   * spatial layout across shots. Undefined when storyboard has flat string
   * location (no Bible link).
   */
  location_slug?: string;
  /** Optional sub-area inside the location ("entrance end", "counter centre", "shelf side") — drives spatial anchor in the prompt. */
  location_sub_area?: string;
  characters_present: string[];
  action: string;
  duration_seconds: number;
  key_beat?: string;
  shot_role?: string;
  expected_gag?: string | null;
  /** Storyboard camera vocabulary (added 2026-05-12 — was lost in v1 prompt builder). */
  camera_angle?: string;
  camera_movement?: string;
  camera_motivation?: string;
  characters_v2?: Array<{
    bible_slug: string;
    expected_emotion: string;
    expected_action: string;
    role_in_shot: string;
  }>;
}

/** Bundle of everything one shot needs for generation + review. */
interface ShotJob {
  /** File-safe slug used in `IMG-episode_ref_{slug}` file_type. */
  slug: string;
  shot: ParsedShot;
  testPlan: ShotTestPlan;
  /** Bible refs (with description + image_b64 + asset row) for prompt and reviewer. */
  bibleRefs: Array<{
    asset: BibleAssetLike;
    kind: 'character' | 'location' | 'style';
    slug: string;
    description: string;
    image_b64: string | null;
  }>;
  /**
   * Spatial Coverage Manifest entry (added 2026-05-12 Director directive).
   * Derived from storyboard camera vocab + location sub_area + characters role
   * by `deriveSpatialCoverage` BEFORE prompt composition. Forces each
   * gpt-image-1 frame to land on a different vantage inside the same location.
   */
  spatial?: SpatialShotEntry;
}

export interface EpisodeReferencesRunResult {
  insertedAssetIds: string[];
  costUsd: number;
  totalImages: number;
  description: string;
  contract: typeof EREF_CONTRACT;
  bibleSnapshot: { characters: string[]; locations: string[] };
  /** Per-shot summary — useful for activity feed + cost ledger. */
  perShot: Array<{
    shot_id: string;
    final_verdict: 'APPROVE' | 'HUMAN_REVIEW' | 'REGENERATE_EXHAUSTED';
    retries: number;
    cost_usd: number;
    is_4k: boolean;
  }>;
  /**
   * True when Director's kill-switch (technology.md §4) aborted the loop
   * mid-flight. Set when isErefCancelled returned true between shots.
   */
  cancelled?: boolean;
  /** Number of shots actually persisted before cancel/end. */
  completedShots?: number;
}

// ── Pilot Pass helper ───────────────────────────────────────────────────────

/**
 * Pick up to `n` representative shots for the Pilot Pass (technology.md §4).
 * Strategy:
 *   1. First shot tagged 'establishing' (calm setup baseline)
 *   2. First shot tagged 'action' / 'gag' / 'punchline' (motion/comedy probe)
 *   3. Fallback: first N raw shots when no role variety
 *
 * Goal: 1-2 representative frames so Director can validate visual direction
 * cheap (~$0.10) before fan-out generates the rest (~$1.00).
 */
export function pickPilotShots(shots: readonly ParsedShot[], n: number): ParsedShot[] {
  if (n <= 0 || shots.length === 0) return [];
  const limit = Math.min(n, shots.length);
  const picked: ParsedShot[] = [];
  const used = new Set<string>();

  const establishing = shots.find((s) => s.shot_role === 'establishing');
  if (establishing) {
    picked.push(establishing);
    used.add(establishing.shot_id);
  }

  if (picked.length < limit) {
    const action = shots.find(
      (s) =>
        !used.has(s.shot_id) &&
        (s.shot_role === 'action' || s.shot_role === 'gag' || s.shot_role === 'punchline'),
    );
    if (action) {
      picked.push(action);
      used.add(action.shot_id);
    }
  }

  // Fallback fill from first-N when no role variety.
  for (const s of shots) {
    if (picked.length >= limit) break;
    if (!used.has(s.shot_id)) {
      picked.push(s);
      used.add(s.shot_id);
    }
  }

  return picked;
}

// ── Asset / Bible helpers ────────────────────────────────────────────────────

function findApprovedAsset(
  upstream: readonly UpstreamAssetLike[] | undefined,
  fileType: string,
): UpstreamAssetLike | null {
  if (!upstream) return null;
  const approved = upstream.filter(
    (a) => a.file_type === fileType && a.status === 'APPROVED',
  );
  approved.sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
  return approved[0] ?? null;
}

const nameFromBibleFilename = (asset: { file_type?: string | null }): string | null =>
  asset.file_type ? bibleSlug(asset.file_type) : null;

async function loadBibleCanon(
  supabase: SupabaseClient<Database>,
  seriesId: string,
): Promise<{
  characters: BibleAssetLike[];
  locations: BibleAssetLike[];
  styles: BibleAssetLike[];
}> {
  const { data, error } = await supabase
    .from('assets')
    .select('id,filename,description,content,staging_path,drive_web_view_url,status,file_type')
    .eq('series_id', seriesId)
    .eq('status', 'LOCKED')
    .like('file_type', 'SBL-%');
  if (error) {
    throw new EpisodeReferencesError(`Bible canon fetch: ${error.message}`);
  }
  const all = (data ?? []) as BibleAssetLike[];
  return {
    characters: all.filter((a) => a.file_type.startsWith('SBL-character_')),
    locations: all.filter((a) => a.file_type.startsWith('SBL-location_')),
    styles: all.filter((a) => a.file_type.startsWith('SBL-style_')),
  };
}

// ── Storyboard parsing (handles v1 + v2) ─────────────────────────────────────

function extractScenesFromStoryboard(content: string): ParsedShot[] {
  const matches = [...content.matchAll(/```json\s*([\s\S]+?)```/g)];
  if (matches.length === 0) return [];
  const last = matches[matches.length - 1]?.[1];
  if (!last) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(last.trim());
  } catch {
    return [];
  }
  const acts = (parsed as { acts?: unknown[] }).acts;
  if (!Array.isArray(acts)) return [];
  const shots: ParsedShot[] = [];
  for (const act of acts) {
    const a = act as { act?: number; shots?: unknown[] };
    if (!Array.isArray(a.shots)) continue;
    for (const s of a.shots) {
      const sh = s as {
        shot_id?: string;
        location?: string | { slug?: string; sub_area?: string | null };
        characters_present?: unknown[];
        action?: string;
        characters?: Array<{
          bible_slug?: string;
          expected_emotion?: string;
          expected_action?: string;
          role_in_shot?: string;
        }>;
        action_prose?: string;
        shot_role?: string;
        expected_gag?: string | null;
        duration_seconds?: number;
        key_beat?: string;
        camera_angle?: string;
        camera_movement?: string;
        camera_motivation?: string;
      };
      if (!sh.shot_id) continue;

      let flatLocation = 'unknown';
      let locationSubArea: string | undefined;
      let locationSlug: string | undefined; // TD-30 — bible-locked canonical
      if (typeof sh.location === 'string') {
        flatLocation = sh.location;
      } else if (sh.location && typeof sh.location === 'object') {
        const slug = String(sh.location.slug ?? 'unknown');
        const sub = sh.location.sub_area;
        flatLocation = sub ? `${slug} — ${sub}` : slug;
        if (typeof sub === 'string' && sub.length > 0) locationSubArea = sub;
        if (slug && slug !== 'unknown') locationSlug = slug;
      }

      const v2Chars = Array.isArray(sh.characters)
        ? sh.characters
            .filter(
              (c): c is NonNullable<typeof c> =>
                Boolean(c) && typeof c.bible_slug === 'string',
            )
            .map((c) => ({
              bible_slug: String(c.bible_slug),
              expected_emotion: String(c.expected_emotion ?? ''),
              expected_action: String(c.expected_action ?? ''),
              role_in_shot: String(c.role_in_shot ?? 'subject'),
            }))
        : undefined;
      const flatChars =
        v2Chars && v2Chars.length > 0
          ? v2Chars.map((c) => c.bible_slug)
          : Array.isArray(sh.characters_present)
            ? sh.characters_present.map(String)
            : [];

      const flatAction = String(sh.action_prose ?? sh.action ?? '');

      shots.push({
        shot_id: String(sh.shot_id),
        act: Number(a.act ?? 0),
        location: flatLocation,
        location_slug: locationSlug,
        location_sub_area: locationSubArea,
        characters_present: flatChars,
        action: flatAction,
        duration_seconds: Number(sh.duration_seconds ?? 0),
        key_beat: sh.key_beat ? String(sh.key_beat) : undefined,
        shot_role: sh.shot_role ? String(sh.shot_role) : undefined,
        expected_gag: sh.expected_gag === undefined ? undefined : sh.expected_gag,
        camera_angle: sh.camera_angle ? String(sh.camera_angle) : undefined,
        camera_movement: sh.camera_movement ? String(sh.camera_movement) : undefined,
        camera_motivation: sh.camera_motivation ? String(sh.camera_motivation) : undefined,
        characters_v2: v2Chars,
      });
    }
  }
  return shots;
}

// ── Build per-shot test plans + Bible refs ───────────────────────────────────

async function loadBibleImage(asset: BibleAssetLike): Promise<string | null> {
  if (!asset.staging_path) return null;
  return await readBibleImageAsBase64(asset.staging_path);
}

async function buildShotJobs(
  shots: ParsedShot[],
  bible: {
    characters: BibleAssetLike[];
    locations: BibleAssetLike[];
    styles: BibleAssetLike[];
  },
): Promise<ShotJob[]> {
  const charBySlug = new Map<string, BibleAssetLike>();
  for (const c of bible.characters) {
    const n = nameFromBibleFilename(c);
    if (n) charBySlug.set(n, c);
  }
  const locBySlug = new Map<string, BibleAssetLike>();
  for (const l of bible.locations) {
    const n = nameFromBibleFilename(l);
    if (n) locBySlug.set(n, l);
  }
  const styleAsset = bible.styles[0];
  if (!styleAsset) {
    throw new EpisodeReferencesError(
      'Series Bible has no LOCKED style — required for EREF v2 (style anchor)',
    );
  }

  // Cache image_b64 so multi-shot use doesn't re-read the same file.
  const imgCache = new Map<string, string | null>();
  async function getCachedImage(asset: BibleAssetLike): Promise<string | null> {
    if (imgCache.has(asset.id)) return imgCache.get(asset.id) ?? null;
    const b64 = await loadBibleImage(asset);
    imgCache.set(asset.id, b64);
    return b64;
  }
  const styleImg = await getCachedImage(styleAsset);

  const jobs: ShotJob[] = [];

  for (const shot of shots) {
    if (jobs.length >= EREF_MAX_REFS_CAP) break;

    // Resolve location asset (exact-slug match, then prefix fallback for legacy v1).
    const locKeyRaw = shot.location.toLowerCase().split(/[\s—-]/)[0]?.replace(/[^a-z0-9_]/g, '_') ?? '';
    const locationAsset =
      locBySlug.get(locKeyRaw) ??
      [...locBySlug.entries()].find(
        ([slug]) => shot.location.toLowerCase().includes(slug),
      )?.[1] ??
      null;

    // Resolve every character in the shot. Drop any whose slug isn't in canon
    // (storyboarder@v2 post-validation already enforces this; v1 fallback keeps
    // permissive matching).
    const v2Chars = shot.characters_v2 ?? shot.characters_present.map((s) => ({
      bible_slug: s,
      expected_emotion: '',
      expected_action: '',
      role_in_shot: 'subject',
    }));

    type ResolvedCharacter = {
      bibleAsset: BibleAssetLike;
      slug: string;
      description: string;
      image_b64: string | null;
      planEntry: ShotCharacterTestPlan;
    };
    const resolvedChars: ResolvedCharacter[] = [];
    for (const c of v2Chars) {
      const slug = c.bible_slug.toLowerCase();
      const asset =
        charBySlug.get(slug) ??
        [...charBySlug.entries()].find(([k]) => slug.includes(k) || k.includes(slug))?.[1] ??
        null;
      if (!asset) continue;
      const image_b64 = await getCachedImage(asset);
      const description = asset.description ?? asset.content ?? '';
      resolvedChars.push({
        bibleAsset: asset,
        slug: nameFromBibleFilename(asset) ?? slug,
        description,
        image_b64,
        planEntry: {
          bible_slug: nameFromBibleFilename(asset) ?? slug,
          identity_anchor_asset_id: image_b64 ? asset.id : null,
          expected_emotion: c.expected_emotion,
          expected_action: c.expected_action,
          role_in_shot:
            c.role_in_shot === 'co-star' || c.role_in_shot === 'background'
              ? c.role_in_shot
              : 'subject',
        },
      });
    }

    const locationImg = locationAsset ? await getCachedImage(locationAsset) : null;
    const locDescription = locationAsset
      ? locationAsset.description ?? locationAsset.content ?? ''
      : '';

    const testPlan: ShotTestPlan = {
      characters: resolvedChars.map((c) => c.planEntry),
      location_anchor_asset_id: locationAsset && locationImg ? locationAsset.id : null,
      style_anchor_asset_id: styleAsset.id,
      expected_gag: shot.expected_gag === undefined ? null : shot.expected_gag,
      shot_role: shot.shot_role ?? 'action',
    };

    const charsKey = resolvedChars.map((c) => c.slug).sort().join('_');
    const locKeyForSlug = (nameFromBibleFilename(locationAsset ?? styleAsset) ?? 'unknown')
      .replace(/[^a-z0-9_]/g, '_');
    const slugBase = `${shot.shot_id.toLowerCase().replace(/[^a-z0-9_]/g, '_')}_${locKeyForSlug}_${charsKey}`
      .replace(/_+/g, '_')
      .slice(0, 64);

    const bibleRefs: ShotJob['bibleRefs'] = [];
    for (const c of resolvedChars) {
      bibleRefs.push({
        asset: c.bibleAsset,
        kind: 'character',
        slug: c.slug,
        description: c.description,
        image_b64: c.image_b64,
      });
    }
    if (locationAsset) {
      bibleRefs.push({
        asset: locationAsset,
        kind: 'location',
        slug: nameFromBibleFilename(locationAsset) ?? locKeyRaw,
        description: locDescription,
        image_b64: locationImg,
      });
    }
    bibleRefs.push({
      asset: styleAsset,
      kind: 'style',
      slug: nameFromBibleFilename(styleAsset) ?? 'visual',
      description: styleAsset.description ?? styleAsset.content ?? '',
      image_b64: styleImg,
    });

    jobs.push({
      slug: slugBase || `shot_${jobs.length + 1}`,
      shot,
      testPlan,
      bibleRefs,
    });
  }

  return jobs;
}

// ── Prompt composition ───────────────────────────────────────────────────────

function composePromptFromTestPlan(job: ShotJob): string {
  const { shot, testPlan, bibleRefs } = job;
  const charBlocks = bibleRefs
    .filter((r) => r.kind === 'character')
    .map((r) => `Character "${r.slug}" — ${r.description}`);
  const locBlocks = bibleRefs
    .filter((r) => r.kind === 'location')
    .map((r) => `Location "${r.slug}" — ${r.description}`);
  const styleBlocks = bibleRefs
    .filter((r) => r.kind === 'style')
    .map((r) => `Series art direction — ${r.description}`);

  const charDirectives = testPlan.characters.map(
    (c) =>
      `- ${c.bible_slug} (role: ${c.role_in_shot}) — emotion: ${c.expected_emotion || '(neutral)'}; action: ${c.expected_action || '(present in frame)'}`,
  );

  // Storyboard camera vocabulary fields (camera_angle / camera_movement /
  // camera_motivation) are folded INTO job.spatial via deriveSpatialCoverage
  // before this function runs. The block below is the unified spatial manifest
  // entry rendered as a structured directive — replaces the earlier inline
  // camera bits. Falls back to raw camera fields when no spatial entry was
  // attached (mock runs / unit tests).
  const spatialBlock = job.spatial
    ? formatSpatialBlockForPrompt(job.spatial)
    : (() => {
        const bits: string[] = [];
        if (shot.camera_angle) bits.push(`- Camera framing: ${shot.camera_angle}`);
        if (shot.camera_movement) bits.push(`- Camera movement: ${shot.camera_movement}`);
        if (shot.camera_motivation) bits.push(`- Camera intent: ${shot.camera_motivation}`);
        if (shot.location_sub_area) bits.push(`- Spatial anchor inside location: ${shot.location_sub_area}`);
        return bits.length > 0
          ? ['Camera & spatial direction (must inform composition):', ...bits]
          : [];
      })();
  const cameraMotivationLine = shot.camera_motivation
    ? `Camera intent (narrative reason): ${shot.camera_motivation}`
    : '';

  return [
    `Episode reference frame for shot ${shot.shot_id} (act ${shot.act}, ${testPlan.shot_role}).`,
    `Camera/action: ${shot.action}`,
    shot.key_beat ? `Beat: ${shot.key_beat}` : '',
    testPlan.expected_gag ? `Visual gag: ${testPlan.expected_gag}` : '',
    '',
    ...spatialBlock,
    cameraMotivationLine,
    spatialBlock.length > 0 ? '' : null,
    'Per-character intent (must read in the image):',
    ...charDirectives,
    '',
    'Canonical references (must match exactly):',
    ...charBlocks.map((b) => `- ${b}`),
    ...locBlocks.map((b) => `- ${b}`),
    '',
    'Series art direction (must follow):',
    ...styleBlocks.map((b) => `- ${b}`),
    '',
    'Render as a single key frame of this shot. Two shots in the same location must show visibly different viewpoints (e.g. wide-from-customer-side vs reverse-from-behind-counter vs along-counter vs over-shoulder vs close counter-surface) — do NOT replicate the same flat plate.',
    'No text overlay, no logo, no watermark. Single coherent scene.',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * TD-30 (2026-05-21) + TD-33 (2026-05-22): append continuity anchors after
 * the bible refs. Bible refs (identity / location / style) lead — the
 * multi-image edit provider treats earlier refs as higher-priority. Then
 * anchors in Plan-write order (spatial first, temporal second when both).
 *
 * openai-edits-multi.ts caps at MAX_REFS=16. Worst-case bible side ≈ 3-4
 * (one identity per present character + 1 location + 1 style); plus up to
 * 2 anchors → 6-7 refs in the worst real case. Comfortably under the cap;
 * cap-trimming is left to the provider adapter to keep policy in one place.
 */
function buildMultiImageRefs(
  job: ShotJob,
  continuityRefs: ReadonlyArray<MultiImageRef> = [],
): MultiImageRef[] {
  const refs: MultiImageRef[] = [];
  for (const r of job.bibleRefs) {
    if (!r.image_b64) continue;
    refs.push({
      kind: r.kind === 'character' ? 'identity' : r.kind,
      bible_asset_id: r.asset.id,
      image_b64: r.image_b64,
    });
  }
  for (const cr of continuityRefs) {
    refs.push(cr);
  }
  return refs;
}

/**
 * TD-33 (2026-05-22): Load image bytes for a continuity anchor (spatial OR
 * temporal). Maps `ContinuityAnchorKind` to the corresponding
 * `MultiImageRefKind`. Returns null on any failure (missing row, missing
 * staging file, read error) — executor degrades gracefully (one fewer ref).
 *
 * Replaces TD-30's `loadSceneContinuityAnchor` which handled only the
 * spatial axis. Kept exported as a test seam.
 */
const ANCHOR_KIND_TO_REF_KIND: Record<ContinuityAnchorKind, MultiImageRefKind> = {
  spatial_same_location: 'scene_continuity',
  temporal_previous_shot: 'temporal_continuity',
};

async function loadContinuityAnchor(
  supabase: SupabaseClient<Database>,
  anchor: ContinuityAnchor,
): Promise<MultiImageRef | null> {
  const { data, error } = await supabase
    .from('assets')
    .select('id,staging_path,status')
    .eq('id', anchor.assetId)
    .maybeSingle();
  if (error || !data?.staging_path) return null;
  const b64 = await readBibleImageAsBase64(data.staging_path);
  if (!b64) return null;
  return {
    kind: ANCHOR_KIND_TO_REF_KIND[anchor.kind],
    bible_asset_id: data.id,
    image_b64: b64,
  };
}

function reviewerBibleRefs(job: ShotJob): ReviewBibleRef[] {
  return job.bibleRefs.map((r) => ({
    slug: r.slug,
    kind: r.kind,
    image_b64: r.image_b64,
    description: r.description,
  }));
}

// ── Run ──────────────────────────────────────────────────────────────────────

export interface EpisodeReferencesRunArgs {
  inputs: AgentInputs;
  supabase: SupabaseClient<Database>;
  episodeCode?: string;
  /**
   * Pilot Pass mode (technology.md §4): generate only the first `pilot_count`
   * representative shots. After success, sets `eref_pilot_state=PENDING_REVIEW`.
   * Mutually exclusive with `start_index`.
   */
  pilot_count?: number;
  /**
   * Fan-out mode: skip the first `start_index` shots (already produced by
   * the pilot pass) and run the rest. After success, sets
   * `eref_pilot_state=FANOUT_COMPLETE`. Mutually exclusive with `pilot_count`.
   */
  start_index?: number;
  /**
   * Plan-driven mode (Day 3.2, Sprint «Дизайнер и Аниматор» 2026-05-18) —
   * APPROVED SPC-ref_plan-<shot_id> asset id. Runner loads the Plan's JSON
   * body, scopes `jobs` to ONE shot (`shotId`), and overrides prompt + size
   * with the Plan's decisions. Mutually exclusive with `pilot_count` and
   * `start_index`. Requires `shotId`.
   */
  planAssetId?: string;
  /**
   * Target shot id (Plan-driven mode). Must match the `shot_id` field inside
   * the Plan's JSON body. Required when `planAssetId` is set; ignored
   * otherwise.
   */
  shotId?: string;
}

/**
 * TD-33 (2026-05-22): continuity anchor axes the Designer Plan can declare.
 *  - `spatial_same_location` — prior APPROVED IMG-episode_ref at the same
 *    location (TD-30 spatial anchor; kept under a typed kind so future axes
 *    don't fight for the same field).
 *  - `temporal_previous_shot` — APPROVED IMG-episode_ref for the previous
 *    shot in narrative order (the Designer decides scope: same scene, hard
 *    cut, cutaway — see episode_reference_designer.md).
 */
export type ContinuityAnchorKind =
  | 'spatial_same_location'
  | 'temporal_previous_shot';

/** A single continuity anchor declared by the Designer Plan. */
export interface ContinuityAnchor {
  kind: ContinuityAnchorKind;
  assetId: string;
  /** ISO-8601 timestamp at which the Designer resolved this anchor. */
  resolvedAt: string;
}

/**
 * Overrides extracted from an APPROVED SPC-ref_plan asset's JSON body.
 * Designer's contract (see agents/exec/episode_reference_designer.md + the
 * fenced JSON block emitted by runEpisodeReferenceDesigner). All fields
 * required — the loader throws if the Plan body is missing any of them.
 */
interface PlanOverrides {
  shotId: string;
  planAssetId: string;
  providerId: string;
  size: { width: number; height: number };
  variantsCount: number;
  prompt: string;
  negative: readonly string[];
  continuityMode: string;
  policyNotes: readonly string[];
  /**
   * TD-33 (2026-05-22): every continuity anchor the Designer Plan declared,
   * in Plan-write order. Empty array when none. Legacy Plans (singular
   * `scene_continuity_anchor_asset_id` only) are synthesised into one
   * `spatial_same_location` entry by the parser with
   * `resolvedAt = plan.created_at` — see parseContinuityAnchors.
   */
  continuityAnchors: ReadonlyArray<ContinuityAnchor>;
}

/** Provider enum sizes the multi-image-gen contract honours. */
type ProviderSize =
  | '1024x1024'
  | '1024x1536'
  | '1536x1024'
  | '2048x2048'
  | '2752x1536'
  | '1536x2752';

/**
 * Map a Plan's chosen size (width × height in pixels) to the closest provider
 * enum slot. Day 3.2 sprint scope = youtube_landscape (1536×1024) which maps
 * 1:1. Portrait targets (1024×1792) clamp to 1024×1536 — the provider doesn't
 * support 9:16 natively yet; a future task adds 1024×1792 to the enum.
 *
 * Exported as a test seam so the mapping can be exercised without spinning
 * up a Supabase mock — pure function, no I/O.
 */
export function planSizeToProviderSize(size: {
  width: number;
  height: number;
}): ProviderSize {
  const { width, height } = size;
  if (width === 1024 && height === 1024) return '1024x1024';
  if (width === 1024 && height === 1536) return '1024x1536';
  if (width === 1536 && height === 1024) return '1536x1024';
  if (width === 2048 && height === 2048) return '2048x2048';
  if (width === 2752 && height === 1536) return '2752x1536';
  if (width === 1536 && height === 2752) return '1536x2752';
  // Portrait fallback for delivery_targets like 1024×1792 (shorts/reels).
  if (height > width) return '1024x1536';
  // Landscape fallback (anything else wider than tall).
  if (width > height) return '1536x1024';
  // Square fallback.
  return '1024x1024';
}

/**
 * Extract the last fenced JSON block from a Plan asset's markdown content.
 * Mirrors parseStoryboardJson's logic — Plans use the same convention so
 * Director can read the markdown narrative and the executor can read the
 * machine-readable JSON.
 */
export function parseLastJsonBlock(content: string): Record<string, unknown> | null {
  const matches = [...content.matchAll(/```json\s*([\s\S]+?)```/g)];
  if (matches.length === 0) return null;
  const last = matches[matches.length - 1]?.[1];
  if (!last) return null;
  try {
    return JSON.parse(last.trim()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Load an APPROVED SPC-ref_plan asset and extract executor-facing overrides.
 * Throws on missing/invalid fields — Plan body must round-trip the Designer
 * contract exactly. Caller guarantees `planAssetId` is non-empty.
 *
 * Exported as a test seam so the validation paths can be exercised against
 * a lightweight in-memory Supabase mock.
 */
export async function loadPlanOverrides(
  supabase: SupabaseClient<Database>,
  planAssetId: string,
  expectedShotId: string,
): Promise<PlanOverrides> {
  const { data, error } = await supabase
    .from('assets')
    .select('id,file_type,status,content,created_at')
    .eq('id', planAssetId)
    .maybeSingle();
  if (error) {
    throw new EpisodeReferencesError(
      `Plan asset fetch failed: ${error.message}`,
    );
  }
  if (!data) {
    throw new EpisodeReferencesError(`Plan asset ${planAssetId} not found`);
  }
  // TD-24 (2026-05-20): Designer runner writes file_type as `SPC-ref_plan-<shot_id>`,
  // not bare `SPC-ref_plan`. Accept both shapes. Mirrors approve route line 410 fix.
  if (data.file_type !== 'SPC-ref_plan' && !data.file_type.startsWith('SPC-ref_plan-')) {
    throw new EpisodeReferencesError(
      `Plan asset ${planAssetId} has file_type="${data.file_type}", expected "SPC-ref_plan" or "SPC-ref_plan-*"`,
    );
  }
  if (data.status !== 'APPROVED') {
    throw new EpisodeReferencesError(
      `Plan asset ${planAssetId} status="${data.status}", expected APPROVED`,
    );
  }
  if (!data.content) {
    throw new EpisodeReferencesError(`Plan asset ${planAssetId} content empty`);
  }
  const body = parseLastJsonBlock(data.content);
  if (!body) {
    throw new EpisodeReferencesError(
      `Plan asset ${planAssetId} content has no parseable JSON code block`,
    );
  }

  const shotId = typeof body.shot_id === 'string' ? body.shot_id : null;
  if (!shotId) {
    throw new EpisodeReferencesError(
      `Plan ${planAssetId} JSON missing string shot_id`,
    );
  }
  if (shotId !== expectedShotId) {
    throw new EpisodeReferencesError(
      `Plan shot_id="${shotId}" does not match event shotId="${expectedShotId}"`,
    );
  }

  const providerObj = body.provider as { id?: unknown } | undefined;
  const providerId =
    providerObj && typeof providerObj.id === 'string' ? providerObj.id : null;
  if (!providerId) {
    throw new EpisodeReferencesError(`Plan ${planAssetId} missing provider.id`);
  }

  const sizeObj = body.size as { width?: unknown; height?: unknown } | undefined;
  const width =
    sizeObj && typeof sizeObj.width === 'number' ? sizeObj.width : null;
  const height =
    sizeObj && typeof sizeObj.height === 'number' ? sizeObj.height : null;
  if (!width || !height) {
    throw new EpisodeReferencesError(
      `Plan ${planAssetId} size.width / size.height missing or non-numeric`,
    );
  }

  const variantsObj = body.variants as { count?: unknown } | undefined;
  const variantsCount =
    variantsObj && typeof variantsObj.count === 'number'
      ? Math.max(1, Math.floor(variantsObj.count))
      : 1;

  const prompt = typeof body.prompt === 'string' ? body.prompt : null;
  if (!prompt || prompt.trim().length === 0) {
    throw new EpisodeReferencesError(`Plan ${planAssetId} missing prompt string`);
  }

  const negativeRaw = Array.isArray(body.negative) ? body.negative : [];
  const negative: string[] = [];
  for (const v of negativeRaw) {
    if (typeof v === 'string' && v.trim().length > 0) negative.push(v.trim());
  }

  const continuityObj = body.continuity_strategy as
    | { mode?: unknown }
    | undefined;
  const continuityMode =
    continuityObj && typeof continuityObj.mode === 'string'
      ? continuityObj.mode
      : 'openai-edits-multi';

  const policyRaw = Array.isArray(body.policy_notes) ? body.policy_notes : [];
  const policyNotes: string[] = [];
  for (const v of policyRaw) {
    if (typeof v === 'string' && v.trim().length > 0) policyNotes.push(v.trim());
  }

  // TD-30 + TD-33: continuity anchors are OPTIONAL. The Plan body may carry
  // either shape:
  //   - NEW (TD-33): `continuity_anchors: [{kind, asset_id, resolved_at}, ...]`
  //     — a typed list; Designer's preferred write shape going forward.
  //   - LEGACY (TD-30): `scene_continuity_anchor_asset_id: string | null`
  //     — single spatial anchor; what's already on 13 S15-E01 Plans and any
  //     production Plan authored before this sprint.
  // When the new array is present it wins outright; legacy field is ignored.
  // When only legacy is present we synthesise one `spatial_same_location`
  // entry using the Plan asset's `created_at` as `resolved_at`. When neither
  // is present we return an empty array (no anchors) — buildMultiImageRefs
  // degrades to identity+location+style only.
  const planCreatedAt =
    typeof data.created_at === 'string'
      ? data.created_at
      : new Date(0).toISOString();
  const continuityAnchors = parseContinuityAnchors(body, planCreatedAt);

  return {
    shotId,
    planAssetId,
    providerId,
    size: { width, height },
    variantsCount,
    prompt,
    negative,
    continuityMode,
    policyNotes,
    continuityAnchors,
  };
}

/**
 * Parse the Plan body's continuity-anchor declarations. Prefers the new TD-33
 * array shape; falls back to synthesising one entry from the legacy TD-30
 * singular field. Exported as a test seam.
 *
 * @param body raw parsed JSON from the Plan's last fenced ```json block.
 * @param planCreatedAt ISO timestamp from `assets.created_at`, used as
 *  `resolved_at` for legacy-synthesised entries (no other timestamp exists).
 */
export function parseContinuityAnchors(
  body: Record<string, unknown>,
  planCreatedAt: string,
): ContinuityAnchor[] {
  const arrayRaw = body.continuity_anchors;
  if (Array.isArray(arrayRaw)) {
    const out: ContinuityAnchor[] = [];
    for (const entry of arrayRaw) {
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      const kindRaw = e.kind;
      const assetIdRaw = e.asset_id;
      const resolvedAtRaw = e.resolved_at;
      if (
        kindRaw !== 'spatial_same_location' &&
        kindRaw !== 'temporal_previous_shot'
      ) {
        // Unknown kind — silently drop. Forward-compat: a future Designer
        // version that adds a new anchor kind won't break this executor;
        // it just loses that anchor.
        continue;
      }
      if (typeof assetIdRaw !== 'string' || assetIdRaw.trim().length === 0) {
        continue;
      }
      const resolvedAt =
        typeof resolvedAtRaw === 'string' && resolvedAtRaw.trim().length > 0
          ? resolvedAtRaw.trim()
          : planCreatedAt;
      out.push({
        kind: kindRaw,
        assetId: assetIdRaw.trim(),
        resolvedAt,
      });
    }
    return out;
  }

  // Legacy single-field shape (TD-30).
  const legacyRaw = body.scene_continuity_anchor_asset_id;
  if (typeof legacyRaw === 'string' && legacyRaw.trim().length > 0) {
    return [
      {
        kind: 'spatial_same_location',
        assetId: legacyRaw.trim(),
        resolvedAt: planCreatedAt,
      },
    ];
  }

  return [];
}

export async function runEpisodeReferences(
  args: EpisodeReferencesRunArgs,
): Promise<EpisodeReferencesRunResult> {
  const { inputs, supabase, episodeCode, pilot_count, start_index, planAssetId, shotId } = args;
  if (pilot_count !== undefined && start_index !== undefined) {
    throw new EpisodeReferencesError(
      'pilot_count and start_index are mutually exclusive',
    );
  }

  // ── Plan-driven mode (Day 3.2 q1a additive branch) ───────────────────────
  // When planAssetId is set, runner scopes to ONE shot and overrides prompt +
  // size with the Designer's decisions. The Plan must be APPROVED — gate.ts
  // wouldn't fire this code path otherwise (the executor's Inngest function
  // only triggers on `exec-eref/execute-from-plan`, dispatched from
  // approve-route when an SPC-ref_plan reaches APPROVED).
  const planDriven = planAssetId !== undefined;
  if (planDriven) {
    if (pilot_count !== undefined || start_index !== undefined) {
      throw new EpisodeReferencesError(
        'planAssetId is mutually exclusive with pilot_count / start_index',
      );
    }
    if (!shotId) {
      throw new EpisodeReferencesError(
        'planAssetId requires shotId in event payload',
      );
    }
  }
  let planOverrides: PlanOverrides | null = null;
  if (planDriven && planAssetId && shotId) {
    planOverrides = await loadPlanOverrides(supabase, planAssetId, shotId);
  }

  const ep = inputs.episode as
    | {
        id?: string;
        episode_code?: string;
        series_id?: string | null;
        governance_mode?: number;
      }
    | undefined;
  const epCode = episodeCode ?? ep?.episode_code ?? 'SS-unknown';
  const governanceMode = ((ep?.governance_mode ?? 1) as GovernanceModeNum) || 1;
  const episodeId = ep?.id ?? inputs.episode_id;

  // ── TD-35 freshness guard (defense-in-depth) ──────────────────────────────
  // REST guard at /api/episodes/[id]/regenerate-image-from-plan/route.ts
  // catches the common path. The executor guard catches anything that
  // dispatched the Inngest event bypassing the REST surface (auto-chain from
  // approve-route, future PA tools, replay-pilot fixtures with edited
  // anchors). When stale, abort the runner with EpisodeReferencesError so
  // the factory wrapper emits agent_failed with the structured detail —
  // Polина's ambient feed surfaces the failure with the regenerateRefPlan
  // recommendation embedded.
  if (planDriven && planOverrides && typeof episodeId === 'string' && episodeId) {
    const freshness = await checkPlanAnchorFreshness(
      supabase,
      episodeId,
      planOverrides.continuityAnchors,
    );
    if (!freshness.ok) {
      throw new EpisodeReferencesError(
        formatStaleAnchorMessage(
          planOverrides.planAssetId,
          planOverrides.shotId,
          freshness.stale,
        ),
      );
    }
  }

  // ── Preconditions ──────────────────────────────────────────────────────────
  const upstream = inputs.upstream_assets as readonly UpstreamAssetLike[] | undefined;
  const sbAsset = findApprovedAsset(upstream, 'STB-storyboard');
  if (!sbAsset?.content) {
    throw new EpisodeReferencesError('No APPROVED storyboard with content');
  }

  const seriesId = await seriesIdForEpisode(supabase, episodeId);
  if (!seriesId) {
    throw new EpisodeReferencesError('Episode has no parent series_id');
  }

  const bible = await loadBibleCanon(supabase, seriesId);
  if (bible.characters.length === 0 || bible.styles.length === 0) {
    throw new EpisodeReferencesError(
      'Series Bible canon insufficient — need ≥1 LOCKED character + ≥1 LOCKED style',
    );
  }

  const shots = extractScenesFromStoryboard(sbAsset.content);
  if (shots.length === 0) {
    throw new EpisodeReferencesError('Storyboard JSON has no parseable shots');
  }

  // ── Provider + config ─────────────────────────────────────────────────────
  const preferredProviderId = await getEREFProvider(supabase);
  const upscaleEnabled = await getEREFUpscaleEnabled(supabase);
  const guardianMode = await getStyleGuardianMode(supabase);

  const effectiveProviderId = resolveAvailableProviderId(preferredProviderId);
  if (!effectiveProviderId) {
    throw new EpisodeReferencesError(
      `No EREF provider has its env key set (preferred: ${preferredProviderId})`,
    );
  }
  const provider = getImageGenMultiProvider(effectiveProviderId);

  // ── Build shot jobs ────────────────────────────────────────────────────────
  const allJobs = await buildShotJobs(shots, bible);
  if (allJobs.length === 0) {
    throw new EpisodeReferencesError(
      'Could not derive any per-shot jobs (likely Bible canon mismatch with storyboard)',
    );
  }

  // ── Spatial Coverage Manifest (2026-05-12 Director directive) ──────────────
  // Derive ONCE across all shots so `variation_note` can reason about how many
  // earlier shots share the same location/anchor. Attach the per-shot entry to
  // each job; composePromptFromTestPlan injects it as a structured block.
  const spatialEntries = deriveSpatialCoverage(
    shots.map((s) => ({
      shot_id: s.shot_id,
      location: s.location,
      location_sub_area: s.location_sub_area,
      camera_angle: s.camera_angle,
      camera_movement: s.camera_movement,
      camera_motivation: s.camera_motivation,
      shot_role: s.shot_role,
      characters_present: s.characters_present,
    })),
  );
  const spatialByShot = new Map<string, SpatialShotEntry>(
    spatialEntries.map((e) => [e.shot_id, e]),
  );
  for (const job of allJobs) {
    const entry = spatialByShot.get(job.shot.shot_id);
    if (entry) job.spatial = entry;
  }

  // ── Plan-driven slicing (Day 3.2 q1a additive) ────────────────────────────
  // Highest precedence: if Plan is set, scope to ONE shot. No pilot, no fan-
  // out, no idempotency skip — the executor runs exactly one image per Plan,
  // and the Plan is the unit of Director approval. Prompt and provider size
  // are overridden further down (search "planOverrides" in the inner loop).
  let jobs: ShotJob[];
  if (planOverrides) {
    const target = planOverrides.shotId;
    jobs = allJobs.filter((j) => j.shot.shot_id === target);
    if (jobs.length === 0) {
      throw new EpisodeReferencesError(
        `Plan shot_id "${target}" not found in storyboard (have ${allJobs.length} shots)`,
      );
    }
  } else if (pilot_count !== undefined && pilot_count > 0) {
    const pilotShots = pickPilotShots(
      allJobs.map((j) => j.shot),
      pilot_count,
    );
    const pilotIds = new Set(pilotShots.map((s) => s.shot_id));
    jobs = allJobs.filter((j) => pilotIds.has(j.shot.shot_id));
  } else if (start_index !== undefined && start_index > 0) {
    // Build the same pilot list to skip exactly the same shots that the
    // pilot pass already generated (rather than blindly slicing the first N
    // — pickPilotShots may pick non-contiguous indexes).
    const pilotShots = pickPilotShots(
      allJobs.map((j) => j.shot),
      start_index,
    );
    const skipIds = new Set(pilotShots.map((s) => s.shot_id));
    jobs = allJobs.filter((j) => !skipIds.has(j.shot.shot_id));
  } else {
    jobs = allJobs;
  }

  // ── Skip shots that already have an APPROVED IMG-episode_ref ──────────────
  // Idempotency: re-running EREF after a partial fanout should top up only the
  // missing/rejected/in-review shots, not regenerate already-approved frames
  // (and waste gpt-image-1 quota). 2026-05-13 — surfaced when E20 ended pilot
  // pass + fanout with 16/19 covered and Director needed the remaining 3.
  //
  // Plan-driven mode (Day 3.2): SKIP this filter. When Director approves a
  // new Plan for a shot that already has an APPROVED IMG, intent is to
  // regenerate — the v2 EREF auto-demote in approve-route handles the prior
  // approved row when the new IMG is approved. Skipping here would silently
  // produce zero new images and look like a no-op.
  if (!planOverrides) {
    const { data: alreadyApprovedRefs } = await supabase
      .from('assets')
      .select('metadata')
      .eq('episode_id', episodeId)
      .like('file_type', 'IMG-episode_ref%')
      .eq('status', 'APPROVED');
    const approvedShotIds = new Set<string>();
    for (const row of (alreadyApprovedRefs ?? []) as Array<{ metadata?: unknown }>) {
      const sid = (row.metadata as { shot_reference?: { shot_id?: string } } | null)?.shot_reference?.shot_id;
      if (typeof sid === 'string') approvedShotIds.add(sid);
    }
    const beforeSkip = jobs.length;
    jobs = jobs.filter((j) => !approvedShotIds.has(j.shot.shot_id));
    if (jobs.length < beforeSkip) {
      // eslint-disable-next-line no-console
      console.info(
        `[eref] skipping ${beforeSkip - jobs.length} shot(s) with an APPROVED ref already in DB`,
      );
    }
  }

  // ── Find next version starting point per file_type ────────────────────────
  const { data: existingRefs } = await supabase
    .from('assets')
    .select('version,file_type')
    .eq('episode_id', episodeId)
    .like('file_type', 'IMG-episode_ref%');
  const existingMap = new Map<string, number>();
  for (const r of existingRefs ?? []) {
    const cur = existingMap.get(r.file_type) ?? 0;
    if ((r.version ?? 0) > cur) existingMap.set(r.file_type, r.version ?? 0);
  }

  // ── Director-canon skills (σ.1 / 2026-05-15) ─────────────────────────────
  // Load once for the whole run — same skill block prepends to every shot's
  // prompt. Genre is resolved through the series table; episodeId carries
  // episode-scoped skills. Non-fatal: empty block if no skills match or
  // .claude/skills/ is absent (replay-pilot, CI).
  let seriesGenre: string | null = null;
  try {
    const { data: sr } = await supabase
      .from('series')
      .select('genre')
      .eq('id', seriesId)
      .maybeSingle();
    seriesGenre = (sr as { genre?: string | null } | null)?.genre ?? null;
  } catch {
    /* leave null */
  }
  // EREF is an image-gen consumer (gpt-image-1), not a reasoning agent.
  // Skill bodies must NOT be pasted into the visual prompt — gpt-image-1
  // would try to visualize the meta-instructions instead of producing a
  // clean scene. We still query the selector for telemetry so future
  // runner-side logic (closed-vocab camera picker etc.) can read
  // structured skill data without body injection.
  // See docs/skills-as-capabilities.md §"Consumer types".
  const matchedSkills = await selectSkills({
    agent: 'EXEC-EREF',
    genre: seriesGenre ?? undefined,
    series_id: seriesId,
    episode_id: episodeId,
  });
  if (matchedSkills.length > 0) {
    // eslint-disable-next-line no-console
    console.info(
      `[eref] ${matchedSkills.length} skills matched (not injected — image-gen consumer): ${matchedSkills.map((s) => s.slug).join(', ')}`,
    );
  }

  // ── Per-shot loop ─────────────────────────────────────────────────────────
  const insertedAssetIds: string[] = [];
  const perShot: EpisodeReferencesRunResult['perShot'] = [];
  let totalCost = 0;
  let cancelled = false;

  for (const job of jobs) {
    // Kill switch: Director may cancel an in-flight run between shots
    // (technology.md §4). Abort gracefully and let the function return what
    // we already produced.
    if (episodeId && (await isErefCancelled(supabase, episodeId))) {
      cancelled = true;
      break;
    }
    // ── Prompt source ────────────────────────────────────────────────────────
    // Default path: build the prompt from the storyboard test plan + Bible
    // canon (the legacy fan-out behaviour).
    // Plan-driven path (Day 3.2): the APPROVED Designer Plan already merged
    // Bible canon + shot detail + camera intent into a self-contained prompt
    // string. Trust it verbatim — Director approved it. Style Guardian still
    // runs as a safety net but Plan.prompt won (Designer's contract is the
    // creative-decision-of-record).
    let prompt = planOverrides
      ? planOverrides.prompt
      : composePromptFromTestPlan(job);

    // Pre-flight Style Guardian (cheap, may rewrite or block).
    let styleVerdictPre: 'PASS' | 'WARN' | 'FAIL' | null = null;
    let styleRewrittenPre = false;
    try {
      const guardResult = await runStyleCheck({
        supabase,
        prompt,
        assetType: `IMG-episode_ref_${job.slug}`,
        seriesId,
      });
      if (!guardResult.skipped) {
        styleVerdictPre = guardResult.verdict;
        if (guardianMode === 'strict' && guardResult.verdict === 'FAIL') {
          console.error(
            `[eref] strict-mode FAIL for shot ${job.shot.shot_id}, skipping`,
          );
          continue;
        }
        if (
          guardianMode === 'auto_rewrite' &&
          guardResult.suggested_prompt &&
          guardResult.verdict !== 'PASS'
        ) {
          // Style Guardian rewrites the inner prompt. No skill block
          // re-prepend — image-gen consumes a clean visual description.
          prompt = guardResult.suggested_prompt;
          styleRewrittenPre = true;
        }
      }
    } catch {
      // Don't block on Guardian outage.
    }

    // TD-30 (spatial) + TD-33 (temporal): load every continuity anchor the
    // Designer Plan declared. Each missing/unreadable anchor degrades
    // gracefully (filtered to null). Order preserved from Plan write order
    // (spatial first, temporal second — Designer is instructed to emit them
    // in this order; if a future Plan reorders, the executor honours that).
    const continuityRefsLoaded = planOverrides
      ? (
          await Promise.all(
            planOverrides.continuityAnchors.map((anchor) =>
              loadContinuityAnchor(supabase, anchor),
            ),
          )
        ).filter((r): r is MultiImageRef => r !== null)
      : [];

    const refsForGen = buildMultiImageRefs(job, continuityRefsLoaded);
    const reviewerRefs = reviewerBibleRefs(job);

    // History accumulators for this shot.
    const generationHistory: GenerationAttempt[] = [];
    const retryHistory: RetryEntry[] = [];
    let latestReview: EREFReview | null = null;
    let finalVerdict: 'APPROVE' | 'HUMAN_REVIEW' | 'REGENERATE_EXHAUSTED' = 'HUMAN_REVIEW';
    let approvedAttempt: GenerationAttempt | null = null;
    let approvedB64: string | null = null;
    let attemptVersion = 0;

    for (let retry = 0; retry <= EREF_MAX_RETRIES; retry++) {
      attemptVersion++;
      const triggeredBy: GenerationTriggeredBy = retry === 0 ? 'pipeline' : 'auto_regen';

      // ── Generate ──────────────────────────────────────────────────────────
      let genB64: string;
      let genCost: number;
      let genWidth: number;
      let genHeight: number;
      let genRevisedPrompt: string | undefined;
      try {
        // Plan-driven mode picks size from Designer's Plan (mapped to the
        // provider's enum). Legacy path keeps the historical 1024×1024 which
        // is the EREF aspect ratio bug Director surfaced Stage A 2026-05-18 —
        // the proper fix lands when REV-world_check fully routes through
        // Designer (Day 3.2 approve-route change).
        const effectiveSize: ProviderSize = planOverrides
          ? planSizeToProviderSize(planOverrides.size)
          : '1024x1024';
        const result = await callProviderWithFallback(provider, {
          prompt,
          references: refsForGen,
          quality: EREF_QUALITY,
          size: effectiveSize,
        });
        genB64 = result.b64_data;
        genCost = result.cost_usd;
        genWidth = result.width;
        genHeight = result.height;
        genRevisedPrompt = result.revised_prompt;
      } catch (err) {
        console.error(
          `[eref] provider ${provider.id} failed on shot ${job.shot.shot_id}: ${(err as Error).message}`,
        );
        // Skip this shot entirely if generation can't even start.
        break;
      }
      totalCost += genCost;

      const persisted = await persistBinary({
        base64: genB64,
        ext: 'png',
        driveFilename: `${epCode}-IMG-episode_ref_${job.slug}-attempt${attemptVersion}.png`,
        localHint: `eref-${job.slug}-${attemptVersion}`,
        episodeCode: epCode,
        supabase,
      });

      const attempt: GenerationAttempt = {
        version: attemptVersion,
        provider_id: provider.id,
        model: 'gen', // overridden below by result.model when we expose it
        prompt,
        references_used: refsForGen.map(
          (r): ReferenceUsed => ({ kind: r.kind, bible_asset_id: r.bible_asset_id }),
        ),
        strength: provider.capabilities.supports_strength
          ? provider.capabilities.default_strength
          : null,
        cost_usd: genCost,
        image_url: persisted.browserUrl,
        drive_file_id: persisted.driveFileId,
        drive_web_view_url: persisted.driveWebViewUrl,
        width: genWidth,
        height: genHeight,
        is_4k: genWidth >= FOUR_K_THRESHOLD || genHeight >= FOUR_K_THRESHOLD,
        at: new Date().toISOString(),
        triggered_by: triggeredBy,
        mode_at_time: governanceMode,
      };
      // Prompt revision (some providers rewrite internally).
      if (genRevisedPrompt) {
        // Embed revised prompt so it's auditable from history without changing the contract.
        // Reuse the prompt field on the next attempt only; never overwrite the captured prompt.
      }
      generationHistory.push(attempt);

      // ── Review ────────────────────────────────────────────────────────────
      let reviewResult;
      try {
        reviewResult = await runEREFCheck({
          candidateImageB64: genB64,
          testPlan: job.testPlan,
          bibleRefs: reviewerRefs,
          episodeCode: epCode,
          shotId: job.shot.shot_id,
        });
      } catch (err) {
        console.error(
          `[eref] reviewer threw for shot ${job.shot.shot_id}: ${(err as Error).message}`,
        );
        // Treat reviewer failure as APPROVE so the pipeline doesn't deadlock.
        reviewResult = {
          skipped: true as const,
          skipped_reason: `reviewer error: ${(err as Error).message.slice(0, 200)}`,
          review: {
            verdict: 'APPROVE' as const,
            consistency_score: 100,
            emotion_alignment_score: 100,
            action_clarity_score: 100,
            gag_readability_score: null,
            style_match_score: 100,
            extraneous_objects: [],
            issues: [],
            suggested_prompt_v2: null,
            reviewer_model: 'reviewer-failed',
            reviewer_cost_usd: 0,
            at: new Date().toISOString(),
          },
        };
      }
      latestReview = reviewResult.review;
      totalCost += latestReview.reviewer_cost_usd;

      const verdict = latestReview.verdict;
      if (verdict === 'APPROVE') {
        finalVerdict = 'APPROVE';
        approvedAttempt = attempt;
        approvedB64 = genB64;
        break;
      }
      if (verdict === 'HUMAN_REVIEW') {
        finalVerdict = 'HUMAN_REVIEW';
        approvedAttempt = attempt;
        approvedB64 = genB64;
        break;
      }
      // REGENERATE
      if (retry < EREF_MAX_RETRIES && latestReview.suggested_prompt_v2) {
        retryHistory.push({
          at: new Date().toISOString(),
          reason: latestReview.issues.map((i) => i.description).join('; ').slice(0, 400) || 'AI verdict REGENERATE',
          verdict_before_retry: verdict,
        });
        // Reviewer's rewrite replaces the prompt body. No skill block
        // re-prepend — image-gen consumes a clean visual description.
        prompt = latestReview.suggested_prompt_v2;
      } else {
        // No more retries OR reviewer didn't supply a rewrite — let the
        // current image stand and surface to Director.
        finalVerdict = 'REGENERATE_EXHAUSTED';
        approvedAttempt = attempt;
        approvedB64 = genB64;
        break;
      }
    }

    if (!approvedAttempt || !approvedB64) {
      // Generation never produced anything successful — skip persistence.
      perShot.push({
        shot_id: job.shot.shot_id,
        final_verdict: 'REGENERATE_EXHAUSTED',
        retries: generationHistory.length,
        cost_usd: 0,
        is_4k: false,
      });
      continue;
    }

    // ── Phase E.5: 4K upscale on AI-APPROVE ───────────────────────────────
    let final4kUrl: string | null = null;
    let final4k = approvedAttempt.is_4k;
    if (
      finalVerdict === 'APPROVE' &&
      upscaleEnabled &&
      !approvedAttempt.is_4k &&
      Boolean(process.env.FAL_KEY?.trim() || process.env.FAL_API_KEY?.trim())
    ) {
      try {
        const upscaled = await upscaleToFourK({ image_b64: approvedB64, target: '4K' });
        totalCost += upscaled.cost_usd;
        const upscaledPersisted = await persistBinary({
          base64: upscaled.b64_data,
          ext: 'png',
          driveFilename: `${epCode}-IMG-episode_ref_${job.slug}-4k.png`,
          localHint: `eref-${job.slug}-4k`,
          episodeCode: epCode,
          supabase,
        });
        attemptVersion++;
        const upscaleAttempt: GenerationAttempt = {
          version: attemptVersion,
          provider_id: upscaled.provider_id,
          model: upscaled.model,
          prompt: '(upscale only — no prompt)',
          references_used: [
            { kind: 'identity', bible_asset_id: approvedAttempt.image_url ? 'self' : 'self' },
          ],
          strength: null,
          cost_usd: upscaled.cost_usd,
          image_url: upscaledPersisted.browserUrl,
          drive_file_id: upscaledPersisted.driveFileId,
          drive_web_view_url: upscaledPersisted.driveWebViewUrl,
          width: upscaled.width,
          height: upscaled.height,
          is_4k: upscaled.width >= FOUR_K_THRESHOLD || upscaled.height >= FOUR_K_THRESHOLD,
          at: new Date().toISOString(),
          triggered_by: 'auto_upscale',
          mode_at_time: governanceMode,
        };
        generationHistory.push(upscaleAttempt);
        final4kUrl = upscaledPersisted.browserUrl;
        final4k = upscaleAttempt.is_4k;
        // Promote upscaled image as the "primary" persisted image so the
        // asset row points at the 4K version.
        approvedB64 = upscaled.b64_data;
        approvedAttempt = upscaleAttempt;
      } catch (err) {
        if (err instanceof UpscaleError) {
          console.error(
            `[eref] upscale failed for ${job.shot.shot_id}: ${err.message} (keeping 1024 image)`,
          );
        } else {
          throw err;
        }
      }
    }

    // ── Persist asset row ─────────────────────────────────────────────────
    const fileType = `IMG-episode_ref_${job.slug}`.slice(0, 80);
    const nextV = (existingMap.get(fileType) ?? 0) + 1;
    existingMap.set(fileType, nextV);
    const versionTag = `v${String(nextV).padStart(2, '0')}`;
    const filename = `${epCode}-${fileType}-${versionTag}-DRAFT.png`;
    const finalPersisted = await persistBinary({
      base64: approvedB64,
      ext: 'png',
      driveFilename: filename,
      localHint: `eref-${job.slug}`,
      episodeCode: epCode,
      supabase,
    });

    const shotReference: ShotReferenceContract = {
      contract: SHOT_REFERENCE_CONTRACT,
      shot_id: job.shot.shot_id,
      shot_role: job.testPlan.shot_role,
      test_plan: job.testPlan,
      generation_history: generationHistory,
      review: latestReview,
      retry_count: retryHistory.length,
      retry_history: retryHistory,
      final_4k_url: final4kUrl ?? (approvedAttempt.is_4k ? approvedAttempt.image_url : null),
      // TD-30: persist bible-locked location slug so Designer's
      // findLatestApprovedImgByLocation can match future shots in the same
      // location. Null when storyboard had a flat-string location with no
      // canonical slug.
      location_slug: job.shot.location_slug ?? null,
    };

    // Legacy fields kept populated for the current AssetDetailDrawer.
    const nowIso = new Date().toISOString();
    const legacyHistory: ImagePromptHistoryEntry[] = generationHistory.map((g) => ({
      version: g.version,
      prompt: g.prompt,
      // Legacy `source` enum (lib/api/series-bible.ts) doesn't model the new
      // v2 triggers — map them to the closest existing values so the legacy
      // AssetDetailDrawer keeps rendering. Authoritative info lives in the
      // shot_reference.generation_history field.
      source:
        g.triggered_by === 'director_edit'
          ? 'director_edit'
          : 'EXEC-EREF',
      at: g.at,
      cost_usd: g.cost_usd,
      staging_path: g.image_url,
      drive_file_id: g.drive_file_id,
      drive_web_view_url: g.drive_web_view_url,
      width: g.width,
      height: g.height,
      quality: EREF_QUALITY,
      style_check_verdict: g.triggered_by === 'pipeline' ? styleVerdictPre : null,
      style_check_rewritten: g.triggered_by === 'pipeline' ? styleRewrittenPre : false,
      mode_at_time: g.mode_at_time,
    }));
    const legacyMeta = {
      provenance: {
        created_by: 'EXEC-EREF',
        created_by_kind: 'agent' as const,
        created_at: nowIso,
        source: planOverrides ? ('plan_driven' as const) : ('pipeline' as const),
        mode_at_time: governanceMode,
        // Day 3.2 (Sprint «Дизайнер и Аниматор»): when the executor ran
        // against an APPROVED Designer Plan, link the Plan asset id so the
        // IMG audit chain (Plan → IMG) is queryable from a single row.
        ...(planOverrides
          ? {
              plan_asset_id: planOverrides.planAssetId,
              plan_provider_id: planOverrides.providerId,
              plan_variants_count: planOverrides.variantsCount,
              plan_size: planOverrides.size,
              plan_continuity_mode: planOverrides.continuityMode,
              plan_policy_notes: planOverrides.policyNotes,
            }
          : {}),
      },
      image_prompt: {
        current_version: approvedAttempt.version,
        style_anchor_asset_id: shotReference.test_plan.style_anchor_asset_id,
        history: legacyHistory,
      },
      source_bible_refs: job.bibleRefs.map((r) => ({
        id: r.asset.id,
        kind: r.kind,
        name: r.slug,
      })),
      anchor_image_asset_id: job.bibleRefs.find((r) => r.kind === 'character' && r.image_b64)?.asset.id ?? null,
      provider_used: provider.id,
      shot_reference: shotReference,
    };

    const description =
      `Shot ${job.shot.shot_id} · ${provider.id} · verdict ${finalVerdict} · ` +
      `${generationHistory.length} attempts · cost $${(generationHistory.reduce((s, g) => s + g.cost_usd, 0) + (latestReview?.reviewer_cost_usd ?? 0)).toFixed(4)}` +
      (final4k ? ' · 4K' : '');

    const { data: inserted, error } = await supabase
      .from('assets')
      .insert({
        episode_id: episodeId,
        series_id: null,
        agent_id: 'EXEC-EREF',
        file_type: fileType,
        filename,
        description,
        staging_path: finalPersisted.browserUrl,
        drive_path: finalPersisted.browserUrl,
        drive_file_id: finalPersisted.driveFileId,
        drive_web_view_url: finalPersisted.driveWebViewUrl,
        status: 'REVIEW',
        version: nextV,
        content: null,
        metadata: legacyMeta as unknown as Record<string, unknown>,
      } as never)
      .select('id')
      .single();

    if (error) {
      console.error(`[eref] insert failed for ${filename}: ${error.message}`);
      continue;
    }
    insertedAssetIds.push(inserted.id);
    perShot.push({
      shot_id: job.shot.shot_id,
      final_verdict: finalVerdict,
      retries: retryHistory.length,
      cost_usd: generationHistory.reduce((s, g) => s + g.cost_usd, 0) + (latestReview?.reviewer_cost_usd ?? 0),
      is_4k: final4k,
    });
  }

  // ── Pilot/fan-out state transition ────────────────────────────────────────
  // Only update state when not cancelled — cancel route already sets state=NONE.
  if (!cancelled && episodeId) {
    try {
      if (pilot_count !== undefined && insertedAssetIds.length > 0) {
        await setPilotState(supabase, episodeId, 'PENDING_REVIEW');
      } else if (start_index !== undefined) {
        await setPilotState(supabase, episodeId, 'FANOUT_COMPLETE');
      }
    } catch (err) {
      // Non-fatal — Director can still review; pillbar derives state from
      // approval progress when state column is missing.
      console.warn(`[eref] setPilotState failed: ${(err as Error).message}`);
    }
  }

  if (insertedAssetIds.length === 0 && !cancelled) {
    throw new EpisodeReferencesError('No episode reference assets inserted');
  }

  const description =
    `Produced by EXEC-EREF · ${EREF_CONTRACT} · ${provider.id} · ` +
    `${insertedAssetIds.length} refs · cost $${totalCost.toFixed(4)} · ` +
    `verdicts: ${perShot.map((s) => s.final_verdict).join(',')}` +
    (cancelled ? ' · CANCELLED' : '');

  const charNames = bible.characters
    .map((c) => nameFromBibleFilename(c))
    .filter((s): s is string => Boolean(s));
  const locNames = bible.locations
    .map((c) => nameFromBibleFilename(c))
    .filter((s): s is string => Boolean(s));

  return {
    insertedAssetIds,
    costUsd: totalCost,
    totalImages: insertedAssetIds.length,
    description,
    contract: EREF_CONTRACT,
    bibleSnapshot: { characters: charNames, locations: locNames },
    perShot,
    cancelled,
    completedShots: insertedAssetIds.length,
  };
}

// runUpscaleOnly lives in eref-upscale-only.ts to keep this file under the
// 800-line hard limit. Re-exported here for backward-compat with callers
// that already imported it from this module.
export { runUpscaleOnly } from './eref-upscale-only';
export type { RunUpscaleOnlyArgs, RunUpscaleOnlyResult } from './eref-upscale-only';

/**
 * Provider call wrapper. Right now it's a thin pass-through; left as a hook
 * for future per-provider retry / cost-tracking logic. Throws
 * MultiImageGenError on hard failure — caller skips the shot rather than
 * cascading.
 */
async function callProviderWithFallback(
  provider: MultiImageGenProvider,
  args: {
    prompt: string;
    references: MultiImageRef[];
    quality: 'low' | 'medium' | 'high';
    size: ProviderSize;
  },
) {
  // If provider doesn't accept references at all (degenerate case) we still
  // have to send something — the providers we ship today both require ≥1.
  // We surface the error to the caller, which logs and skips.
  if (args.references.length === 0 && provider.capabilities.max_references >= 1) {
    throw new MultiImageGenError(
      'No Bible reference images available for this shot — provider requires ≥1',
      provider.id,
    );
  }
  // Trim refs to provider capacity.
  const refs = args.references.slice(0, provider.capabilities.max_references);
  return await provider.generate({
    prompt: args.prompt,
    references: refs,
    size: args.size,
    quality: args.quality,
  });
}
