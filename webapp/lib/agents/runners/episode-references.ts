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
import { loadAnchorChainContext, type AnchorChainContext } from '../runner';
import type {
  MultiImageGenProvider,
  MultiImageRef,
  MultiImageRefKind,
} from '../providers/image-gen-multi';
import { MultiImageGenError } from '../providers/image-gen-multi';
import { readAssetMediaAsBase64 } from '@/lib/media-cache';
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
import { findApprovedAsset } from '../upstream';
import { loadEpisodeCastSlugs } from '../episode-cast';
import { logEvent } from '../../api/events';
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
  drive_file_id?: string | null;
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
  /**
   * Canon prop slugs visible in this shot (storyboard `props_in_frame`, from the
   * World Bible inventory). 2026-06-14: previously unparsed → object refs never
   * attached → provider hallucinated props (E09 elevator button panel: 1 vs 2
   * buttons across the pair). Resolved against cast-scoped `SBL-object_*` canon
   * and attached as `kind:'object'` refs.
   */
  props_in_frame?: string[];
}

/** Bundle of everything one shot needs for generation + review. */
export interface ShotJob {
  /** File-safe slug used in `IMG-episode_ref_{slug}` file_type. */
  slug: string;
  shot: ParsedShot;
  testPlan: ShotTestPlan;
  /** Bible refs (with description + image_b64 + asset row) for prompt and reviewer. */
  bibleRefs: Array<{
    asset: BibleAssetLike;
    kind: 'character' | 'location' | 'style' | 'object';
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

// F2 (2026-06-12): findApprovedAsset → shared newest-wins resolver
// (lib/agents/upstream.ts; was a local copy, one of ten).

const nameFromBibleFilename = (asset: { file_type?: string | null }): string | null =>
  asset.file_type ? bibleSlug(asset.file_type) : null;

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
    .select('id,filename,description,content,staging_path,drive_web_view_url,status,file_type')
    .eq('series_id', seriesId)
    .eq('status', 'LOCKED')
    .like('file_type', 'SBL-%');
  if (error) {
    throw new EpisodeReferencesError(`Bible canon fetch: ${error.message}`);
  }
  const all = (data ?? []) as BibleAssetLike[];
  // Episode casting (2026-06-14): scope characters + locations + objects to the
  // episode's cast gallery. `castSlugs === null` → no gallery → unscoped (all
  // series canon, the pre-casting behaviour). Styles are series-wide, never scoped.
  const inCast = (a: BibleAssetLike): boolean => {
    if (!castSlugs) return true;
    const slug = bibleSlug(a.file_type);
    return slug != null && castSlugs.has(slug.toLowerCase());
  };
  return {
    characters: all.filter((a) => a.file_type.startsWith('SBL-character_') && inCast(a)),
    locations: all.filter((a) => a.file_type.startsWith('SBL-location_') && inCast(a)),
    styles: all.filter((a) => a.file_type.startsWith('SBL-style_')),
    objects: all.filter((a) => a.file_type.startsWith('SBL-object_') && inCast(a)),
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
        props_in_frame?: unknown[];
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
        props_in_frame: Array.isArray(sh.props_in_frame)
          ? sh.props_in_frame.map(String).filter((s) => s.trim().length > 0)
          : [],
        characters_v2: v2Chars,
      });
    }
  }
  return shots;
}

// ── Build per-shot test plans + Bible refs ───────────────────────────────────

async function loadBibleImage(asset: BibleAssetLike): Promise<string | null> {
  return await readAssetMediaAsBase64({
    filename: asset.filename,
    driveFileId: asset.drive_file_id,
    stagingPath: asset.staging_path,
  });
}

async function buildShotJobs(
  shots: ParsedShot[],
  bible: {
    characters: BibleAssetLike[];
    locations: BibleAssetLike[];
    styles: BibleAssetLike[];
    objects?: BibleAssetLike[];
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
  const objBySlug = new Map<string, BibleAssetLike>();
  for (const o of bible.objects ?? []) {
    const n = nameFromBibleFilename(o);
    if (n) objBySlug.set(n, o);
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

    // Objects (2026-06-14): resolve the shot's props_in_frame against cast-scoped
    // SBL-object_* canon so the prop's reference image is attached (no more
    // hallucinated panels). Mirrors the anchor path.
    type ResolvedObject = {
      bibleAsset: BibleAssetLike;
      slug: string;
      description: string;
      image_b64: string | null;
    };
    const resolvedObjects: ResolvedObject[] = [];
    const seenObjIds = new Set<string>();
    for (const raw of shot.props_in_frame ?? []) {
      const slug = raw.toLowerCase();
      const asset =
        objBySlug.get(slug) ??
        [...objBySlug.entries()].find(([k]) => slug.includes(k) || k.includes(slug))?.[1] ??
        null;
      if (!asset || seenObjIds.has(asset.id)) continue;
      seenObjIds.add(asset.id);
      resolvedObjects.push({
        bibleAsset: asset,
        slug: nameFromBibleFilename(asset) ?? slug,
        description: asset.description ?? asset.content ?? '',
        image_b64: await getCachedImage(asset),
      });
    }

    const testPlan: ShotTestPlan = {
      characters: resolvedChars.map((c) => c.planEntry),
      location_anchor_asset_id: locationAsset && locationImg ? locationAsset.id : null,
      style_anchor_asset_id: styleAsset.id,
      expected_gag: shot.expected_gag === undefined ? null : shot.expected_gag,
      shot_role: shot.shot_role ?? 'action',
      objects: resolvedObjects.map((o) => ({ slug: o.slug, description: o.description })),
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
    for (const o of resolvedObjects) {
      bibleRefs.push({
        asset: o.bibleAsset,
        kind: 'object',
        slug: o.slug,
        description: o.description,
        image_b64: o.image_b64,
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
  const objBlocks = bibleRefs
    .filter((r) => r.kind === 'object')
    .map((r) => `Prop "${r.slug}" — ${r.description}`);

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
    ...objBlocks.map((b) => `- ${b}`),
    objBlocks.length > 0
      ? 'The props above are attached as canon reference images — render them exactly as shown (shape, count, layout). Do not invent or duplicate prop variants.'
      : null,
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
/**
 * TD-53 (2026-05-25): Ref-order contract.
 *
 * The Phase 1 LAYOUT LOCK prompt template explicitly says «The first
 * attached anchor image is the LOCKED LOCATION BIBLE master… Treat it
 * as the canonical layout.» Before this fix, refs were emitted in
 * insertion order from `job.bibleRefs` which was built [characters...,
 * location, style] — so identity came first and gpt-image-2 happily
 * adopted Sandy's portrait as the canonical layout, dropping mirror /
 * rug / bookshelf along the way. Empirically observed on SS-S15-E01
 * SH08 v05/v06/v07 (all REGENERATE_EXHAUSTED with mirror missing).
 *
 * Order is now stable and matches the prompt contract:
 *   1. location  (canonical layout — must be first)
 *   2. identity  (one or more characters)
 *   3. style     (rendering rules)
 *   4. continuity (spatial / temporal — TD-30/33)
 *
 * Identity locking on gpt-image-2 from slot 2+ is empirically strong;
 * the model still copies face/palette/silhouette reliably. The fix is
 * therefore safe to apply uniformly — no per-Plan strategy flag needed.
 */
export function buildMultiImageRefs(
  job: ShotJob,
  continuityRefs: ReadonlyArray<MultiImageRef> = [],
): MultiImageRef[] {
  const byKind: Record<'location' | 'identity' | 'object' | 'style', MultiImageRef[]> = {
    location: [],
    identity: [],
    object: [],
    style: [],
  };
  for (const r of job.bibleRefs) {
    if (!r.image_b64) continue;
    const ref: MultiImageRef = {
      kind: r.kind === 'character' ? 'identity' : r.kind,
      bible_asset_id: r.asset.id,
      image_b64: r.image_b64,
    };
    if (r.kind === 'location') byKind.location.push(ref);
    else if (r.kind === 'style') byKind.style.push(ref);
    else if (r.kind === 'object') byKind.object.push(ref);
    else byKind.identity.push(ref);
  }
  // Order: location (layout) → identity (characters) → object (props) → style → continuity.
  return [
    ...byKind.location,
    ...byKind.identity,
    ...byKind.object,
    ...byKind.style,
    ...continuityRefs,
  ];
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
    .select('id,filename,drive_file_id,staging_path,status')
    .eq('id', anchor.assetId)
    .maybeSingle();
  if (error || !data) return null;
  const b64 = await readAssetMediaAsBase64({
    filename: data.filename,
    driveFileId: data.drive_file_id,
    stagingPath: data.staging_path,
  });
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
 * TD-49 Phase 2 P2.3 (2026-05-25): one side of a Designer anchor pair, parsed
 * from `anchor_pair.start` / `anchor_pair.end`. Mirrors animator.ts P2.1 shape
 * but uses `handoff_link_to_shot_id` (a string shot_id ref) instead of the
 * Animator's `handoff_link_to` (a concrete IMG-anchor asset_id), because at
 * Designer-stage the anchor IMGs have not been generated yet.
 */
export type AnchorPairStartRole = 'establishing' | 'shared' | 'cut_in';
export type AnchorPairEndRole = 'shared' | 'cut_out' | 'final';

export interface ParsedAnchorSide {
  role: AnchorPairStartRole | AnchorPairEndRole;
  /** Full shot_id of the paired shot when role='shared'; null otherwise. */
  handoff_link_to_shot_id: string | null;
  prompt: string;
  rationale: string | null;
}

export interface ParsedAnchorPair {
  start: ParsedAnchorSide | null;
  end: ParsedAnchorSide | null;
}

/**
 * Overrides extracted from an APPROVED SPC-ref_plan asset's JSON body.
 * Designer's contract (see agents/exec/episode_reference_designer.md + the
 * fenced JSON block emitted by runEpisodeReferenceDesigner). All non-optional
 * fields required — the loader throws if the Plan body is missing any.
 */
interface PlanOverrides {
  shotId: string;
  planAssetId: string;
  providerId: string;
  size: { width: number; height: number };
  variantsCount: number;
  prompt: string;
  negative: readonly string[];
  /**
   * 2026-06-14: canon prop slugs the Designer declared for this shot
   * (`objects[]` in the Plan JSON). Authoritative per-shot object list; when
   * present it supersedes the storyboard's `props_in_frame`. Resolved against
   * cast-scoped `SBL-object_*` canon and attached as `kind:'object'` refs.
   */
  objects: readonly string[];
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
  /**
   * TD-49 Phase 2 P2.3 (2026-05-25): anchor pair the Designer authored for
   * this shot. Non-null when `anchor_chain_enabled=true` AND Designer emitted
   * the block. Each side independently optional — both may be present, only
   * one, or both null (in which case the field itself is null and the Artist
   * falls back to legacy single-IMG generation).
   */
  anchorPair: ParsedAnchorPair | null;
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
 * True when an EPREV critic verdict with `verdict: "PASS"` exists for the given
 * Plan in the episode. Used by the autonomous-chain self-heal: a Mode-4 Plan
 * that passed its critic but was never flipped to APPROVED is still safe to
 * generate. Best-effort — any lookup error returns false (caller then throws
 * the normal "expected APPROVED" error, preserving the strict default).
 */
async function planHasPassingCriticVerdict(
  supabase: SupabaseClient<Database>,
  episodeId: string | null,
  planAssetId: string,
): Promise<boolean> {
  if (!episodeId) return false;
  const { data } = await supabase
    .from('assets')
    .select('content')
    .eq('episode_id', episodeId)
    .like('file_type', 'REV-ref_plan%')
    .order('created_at', { ascending: false })
    .limit(20);
  for (const row of (data ?? []) as Array<{ content?: string | null }>) {
    const body = parseLastJsonBlock(row.content ?? '');
    if (
      body &&
      body.plan_asset_id === planAssetId &&
      typeof body.verdict === 'string' &&
      body.verdict.toUpperCase() === 'PASS'
    ) {
      return true;
    }
  }
  return false;
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
    .select('id,file_type,status,content,created_at,episode_id')
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
    // Autonomous-chain self-heal (2026-06-09): in Mode-4 the designer→critic
    // chain leaves the Plan DRAFT — the factory auto-approve does not stick for
    // re-authored ref_plans and there is no post-critic status flip — so a Plan
    // that genuinely PASSed its EPREV critic could never generate. The critic
    // PASS *is* the approval signal in the autonomous chain: if a PASS verdict
    // exists for this Plan, promote it to APPROVED and proceed. Director-driven
    // Modes 1-3 are unaffected (the Director's approve already set APPROVED, so
    // this branch is never entered there).
    const passed = await planHasPassingCriticVerdict(
      supabase,
      data.episode_id ?? null,
      planAssetId,
    );
    if (!passed) {
      throw new EpisodeReferencesError(
        `Plan asset ${planAssetId} status="${data.status}", expected APPROVED (no PASSing critic verdict found either)`,
      );
    }
    await supabase.from('assets').update({ status: 'APPROVED' }).eq('id', planAssetId);
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

  const objectsRaw = Array.isArray(body.objects) ? body.objects : [];
  const objects: string[] = [];
  for (const v of objectsRaw) {
    if (typeof v === 'string' && v.trim().length > 0) objects.push(v.trim());
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
  const anchorPair = parseAnchorPair(body);

  return {
    shotId,
    planAssetId,
    providerId,
    size: { width, height },
    variantsCount,
    prompt,
    negative,
    objects,
    continuityMode,
    policyNotes,
    continuityAnchors,
    anchorPair,
  };
}

/**
 * TD-49 Phase 2 P2.3 (2026-05-25): parse the Designer's `anchor_pair` block
 * out of the Plan body. Returns null when the field is absent (legacy Plan,
 * non-anchor episode, or anchor episode where Designer correctly omitted the
 * block because scene_master was missing).
 *
 * Defensive: tolerates either side being absent (e.g. only `start` authored).
 * Returns null entirely if both sides parse to null — keeps the call sites
 * branching on a clean null vs ParsedAnchorPair.
 *
 * Structural validity (role enum match, role+handoff_link_to_shot_id
 * consistency, shot_id ref format) is the Designer Critic's job (Task #4) —
 * this parser is permissive, it only filters obvious shape violations.
 *
 * Exported as a test seam.
 */
const START_ANCHOR_ROLES_ART: readonly AnchorPairStartRole[] = [
  'establishing',
  'shared',
  'cut_in',
] as const;
const END_ANCHOR_ROLES_ART: readonly AnchorPairEndRole[] = [
  'shared',
  'cut_out',
  'final',
] as const;

function parseAnchorSide<R extends string>(
  raw: unknown,
  allowedRoles: readonly R[],
): { role: R; handoff_link_to_shot_id: string | null; prompt: string; rationale: string | null } | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const role = typeof obj.role === 'string' ? obj.role : null;
  if (!role || !(allowedRoles as readonly string[]).includes(role)) return null;
  const prompt = typeof obj.prompt === 'string' && obj.prompt.trim().length > 0 ? obj.prompt : null;
  if (!prompt) return null;
  const handoffRaw = obj.handoff_link_to_shot_id;
  const handoff_link_to_shot_id =
    typeof handoffRaw === 'string' && handoffRaw.trim().length > 0
      ? handoffRaw.trim()
      : null;
  const rationaleRaw = obj.rationale;
  const rationale =
    typeof rationaleRaw === 'string' && rationaleRaw.trim().length > 0
      ? rationaleRaw.trim()
      : null;
  return {
    role: role as R,
    handoff_link_to_shot_id,
    prompt,
    rationale,
  };
}

export function parseAnchorPair(body: Record<string, unknown>): ParsedAnchorPair | null {
  const raw = body.anchor_pair;
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const start = parseAnchorSide(obj.start, START_ANCHOR_ROLES_ART);
  const end = parseAnchorSide(obj.end, END_ANCHOR_ROLES_ART);
  if (!start && !end) return null;
  return { start, end };
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

// ── TD-49 Phase 2 P2.3 — Anchor Pair Generation ──────────────────────────────
//
// When Designer's Plan has an `anchor_pair` block (anchor_chain_enabled
// episodes), the Artist generates 1-2 IMG-anchor_<shot_id_lower>_(start|end)
// assets instead of the legacy single IMG-episode_ref. Each anchor uses
// scene_master_asset bytes as a `scene_continuity` reference plus identity +
// style refs from Bible. Director directive q4a 2026-05-25: stay on
// openai-edits-multi (no new img2img/denoise provider) and rely on
// prompt-level LAYOUT LOCK + scene_master as equal-weight ref. Each generated
// anchor is REVIEW status → Director approval; P2.6 backbone fan-outs VANIM
// after 2×N approvals.
//
// This function is invoked from `runEpisodeReferences` when planOverrides
// carries a non-null `anchorPair`. It is self-contained — independent of the
// legacy per-shot loop, scene-coverage manifest, EREF check, upscale, or
// pilot/fan-out state machinery (none of which apply to anchor mode v1).

interface AnchorPairGenerationArgs {
  inputs: AgentInputs;
  supabase: SupabaseClient<Database>;
  episodeId: string;
  episodeCode: string;
  governanceMode: GovernanceModeNum;
  planOverrides: PlanOverrides;
  anchorPair: ParsedAnchorPair;
}

// TD-65a softened preamble (2026-05-26): after TD-65 ref-order revert failed
// to lock Sandy hourglass identity (v07 still rendered as a yellow cub),
// hypothesis is that the absolute layout directives («MUST appear / Do not
// move / Do not change») in the original preamble consume the provider's
// attention budget for ALL refs — not just slot 1 — leaving identity refs
// starved regardless of position. Soften to advisory phrasing, AND add an
// explicit identity-preservation counter-directive that names the failure
// mode (Sandy → animal substitution) directly.
//
// If this fixes Sandy: preamble strength was the root cause, anchor mode
// pipeline is salvageable with prompt-level fix alone. If Sandy still
// renders as an animal: provider has absolute Sandy-shape bias regardless
// of prompt instruction — escalate to TD-65b pre-composite refs.
const ANCHOR_LAYOUT_LOCK_PREAMBLE = [
  '[ANCHOR DIRECTIVE — TD-65a softened, 2026-05-26]',
  'Among the attached references, one image shows the canonical room layout (the scene continuity master). Use it as the spatial guide for furniture placement and architectural geometry. The other attached references are CHARACTER CANON — one image per recurring character or hero object. Each character MUST be rendered in the exact body shape, palette, and silhouette of its canonical reference image. Identity preservation takes precedence over layout exactness.',
  '',
  'CRITICAL — Sandy_hourglass body shape: Sandy is a transparent two-bulb hourglass character with rubber-hose dark-grey arms, oversized mitten hands, and a Sandy-Gold sand column inside the glass. Sandy is NOT an animal, NOT a bear, NOT a cub, NOT a squirrel, NOT any furry creature. If the action prose mentions Sandy in motion (lunging, running, stretching), render the hourglass body in that motion — never substitute a different creature form. The Sandy character canon reference image is authoritative.',
  '',
].join('\n');

async function runAnchorPairGeneration(
  args: AnchorPairGenerationArgs,
): Promise<EpisodeReferencesRunResult> {
  const { inputs, supabase, episodeId, episodeCode, governanceMode, planOverrides, anchorPair } = args;

  // 1. Anchor chain context — primary source of scene_master_asset.
  const anchorCtx = await loadAnchorChainContext({
    supabase,
    episodeId,
    shotId: planOverrides.shotId,
  });
  if (!anchorCtx.scene_master_asset) {
    throw new EpisodeReferencesError(
      `Anchor mode but no scene_master_asset for shot ${planOverrides.shotId}. Authoring this anchor requires either SBL-scene_master_<slug> or LOCKED SBL-location_<slug> for the shot's location.`,
    );
  }

  // 2. Load scene_master image bytes — resolve via cache/Drive (media-no-branches
  // safe), not the legacy /staging path which dies on regenerated or
  // worktree-deleted masters.
  const { data: smRow } = await supabase
    .from('assets')
    .select('id,filename,drive_file_id,staging_path')
    .eq('id', anchorCtx.scene_master_asset.asset_id)
    .maybeSingle();
  if (!smRow) {
    throw new EpisodeReferencesError(
      `Scene master asset ${anchorCtx.scene_master_asset.asset_id} not found — cannot load reference bytes`,
    );
  }
  const sceneMasterB64 = await readAssetMediaAsBase64({
    filename: smRow.filename,
    driveFileId: smRow.drive_file_id,
    stagingPath: smRow.staging_path,
  });
  if (!sceneMasterB64) {
    throw new EpisodeReferencesError(
      `Scene master bytes unreadable for ${smRow.filename ?? anchorCtx.scene_master_asset.asset_id} ` +
        `(cache miss + no Drive id + staging_path=${smRow.staging_path ?? 'null'}). Regenerate the scene master.`,
    );
  }

  // 3. Bible canon (identity refs + style ref).
  const seriesId = await seriesIdForEpisode(supabase, episodeId);
  if (!seriesId) {
    throw new EpisodeReferencesError('Episode has no parent series_id');
  }
  const castSlugs = await loadEpisodeCastSlugs(supabase, episodeId);
  const bible = await loadBibleCanon(supabase, seriesId, castSlugs);
  if (bible.styles.length === 0) {
    throw new EpisodeReferencesError(
      'Series Bible has no LOCKED style — required for anchor generation',
    );
  }
  const styleAsset = bible.styles[0]!;

  // 4. Resolve current shot from storyboard (for character list).
  const upstream = inputs.upstream_assets as readonly UpstreamAssetLike[] | undefined;
  const stbAsset = findApprovedAsset(upstream, 'STB-storyboard');
  if (!stbAsset?.content) {
    throw new EpisodeReferencesError('No APPROVED storyboard with content');
  }
  const allShots = extractScenesFromStoryboard(stbAsset.content);
  const shot = allShots.find((s) => s.shot_id === planOverrides.shotId);
  if (!shot) {
    throw new EpisodeReferencesError(
      `Shot ${planOverrides.shotId} not found in storyboard (have ${allShots.length} shots)`,
    );
  }

  // 5. Build refs: identity character(s) + style + scene_master.
  const charBySlug = new Map<string, BibleAssetLike>();
  for (const c of bible.characters) {
    const slug = nameFromBibleFilename(c);
    if (slug) charBySlug.set(slug, c);
  }
  // TD-65 empirical rollback (2026-05-26): SH09 anchor pair v02→v05 showed
  // Sandy drifting to «yellow cub/squirrel» despite his LOCKED character
  // canon being in the ref payload (verified via metadata
  // identity_character_slugs). Diagnosis: TD-53 moved scene_master to slot 1
  // to align with ANCHOR_LAYOUT_LOCK_PREAMBLE, but that preamble is so
  // strong («MUST appear / Do not move / Do not change») it consumes
  // gpt-image-2's attention budget. Identity refs at slot 2+ get attention-
  // starved. Conventional shapes (anvil, mirror_vanity) auto-anchor from
  // their canon ref even with weak attention; Sandy's transparent two-bulb
  // hourglass shape is outside trained character archetypes — without
  // strong attention the provider falls back to «nearest cartoon archetype»
  // = furry animal. The TD-53 assertion «slot 2+ locks reliably» was based
  // on buildMultiImageRefs (regular mode), which has NO LAYOUT LOCK
  // preamble and was never empirically tested against anchor mode +
  // unconventional canon shapes.
  //
  // Empirical test: revert ref order for anchor mode only (this function)
  // back to pre-TD-53 [identity..., style, scene_master]. Mirror_vanity now
  // has its own LOCKED character canon (Director added 2026-05-26) and
  // gets locked via that ref + Plan SUBJECT 3 directive. buildMultiImageRefs
  // (regular mode) is NOT touched — TD-53 fix for SH08 mirror-on-wall stays.
  //
  // If Sandy holds hourglass and mirror also stays centred → root cause
  // confirmed, no rollback to TD-53. If mirror drifts → real trade-off,
  // escalate to TD-65 pre-composite refs architecture.
  const identityRefs: MultiImageRef[] = [];
  const identityCharNames: string[] = [];
  const chars_v2 =
    shot.characters_v2 && shot.characters_v2.length > 0
      ? shot.characters_v2
      : shot.characters_present.map((s) => ({
          bible_slug: s,
          expected_emotion: '',
          expected_action: '',
          role_in_shot: 'subject',
        }));
  for (const c of chars_v2) {
    const slug = c.bible_slug.toLowerCase();
    const asset =
      charBySlug.get(slug) ??
      [...charBySlug.entries()].find(([k]) => slug.includes(k) || k.includes(slug))?.[1] ??
      null;
    if (!asset) continue;
    const b64 = await loadBibleImage(asset);
    if (b64) {
      identityRefs.push({
        kind: 'identity',
        bible_asset_id: asset.id,
        image_b64: b64,
      });
      identityCharNames.push(nameFromBibleFilename(asset) ?? slug);
    }
  }
  // TD-63 removed (2026-06-14): the blanket "ride along ALL LOCKED series
  // characters" fall-through injected every canonical actor (anvil,
  // mirror_vanity) into EVERY anchor — the root cause of the E09 elevator
  // pollution (40/40 anchors carried the anvil + vanity mirror). Episode
  // casting replaces it: identity refs come from this shot's declared
  // characters_v2 only, already scoped to the episode cast gallery via
  // loadBibleCanon(castSlugs). A hero prop that must appear in a shot is now
  // declared per-shot by the storyboarder, not force-fed series-wide.

  // Object refs (2026-06-14): attach the shot's canon props so the provider
  // composites the real button panel / indicator instead of hallucinating one
  // (the E09 "1 vs 2 buttons" defect). Source: the Designer Plan's `objects[]`
  // (authoritative) → fallback to the storyboard `props_in_frame`. Resolved
  // against cast-scoped `bible.objects`, so a prop the episode wasn't cast for
  // can't ride in. Placed after identity (which needs attention priority) and
  // before style/scene_master.
  const objBySlug = new Map<string, BibleAssetLike>();
  for (const o of bible.objects) {
    const n = nameFromBibleFilename(o);
    if (n) objBySlug.set(n, o);
  }
  const objectSlugs =
    planOverrides.objects.length > 0
      ? planOverrides.objects
      : (shot.props_in_frame ?? []);
  const objectRefs: MultiImageRef[] = [];
  const objectNames: string[] = [];
  const seenObjIds = new Set<string>();
  for (const raw of objectSlugs) {
    const slug = raw.toLowerCase();
    const asset =
      objBySlug.get(slug) ??
      [...objBySlug.entries()].find(([k]) => slug.includes(k) || k.includes(slug))?.[1] ??
      null;
    if (!asset || seenObjIds.has(asset.id)) continue;
    const b64 = await loadBibleImage(asset);
    if (!b64) continue;
    objectRefs.push({ kind: 'object', bible_asset_id: asset.id, image_b64: b64 });
    objectNames.push(nameFromBibleFilename(asset) ?? slug);
    seenObjIds.add(asset.id);
  }

  const styleB64 = await loadBibleImage(styleAsset);
  const styleRef: MultiImageRef | null = styleB64
    ? { kind: 'style', bible_asset_id: styleAsset.id, image_b64: styleB64 }
    : null;
  const baseRefs: MultiImageRef[] = [
    ...identityRefs,
    ...objectRefs,
    ...(styleRef ? [styleRef] : []),
    {
      kind: 'scene_continuity',
      bible_asset_id: anchorCtx.scene_master_asset.asset_id,
      image_b64: sceneMasterB64,
    },
  ];

  // 6. Provider — resolved from `app_config.eref_provider` like the legacy
  // path (Director directive 2026-06-11 q7: anchors follow the configured
  // provider; supersedes the q4a 2026-05-25 openai-edits-multi hardcode).
  const anchorPreferredId = await getEREFProvider(supabase);
  const anchorProviderId = resolveAvailableProviderId(anchorPreferredId);
  if (!anchorProviderId) {
    throw new EpisodeReferencesError(
      `No EREF provider has its env key set (preferred: ${anchorPreferredId})`,
    );
  }
  const provider = getImageGenMultiProvider(anchorProviderId);

  // 7. Versioning — query existing IMG-anchor_<shotIdLower>_* assets for this episode.
  const shotIdLower = planOverrides.shotId.toLowerCase().replace(/-/g, '_');
  const { data: existingRows } = await supabase
    .from('assets')
    .select('version,file_type')
    .eq('episode_id', episodeId)
    .like('file_type', `IMG-anchor_${shotIdLower}_%`);
  const versionByType = new Map<string, number>();
  for (const r of (existingRows ?? []) as Array<{ version: number | null; file_type: string }>) {
    const cur = versionByType.get(r.file_type) ?? 0;
    if ((r.version ?? 0) > cur) versionByType.set(r.file_type, r.version ?? 0);
  }

  // 8. Per-side generation loop.
  const sidesToRun: Array<{ name: 'start' | 'end'; side: ParsedAnchorSide }> = [];
  if (anchorPair.start) sidesToRun.push({ name: 'start', side: anchorPair.start });
  if (anchorPair.end) sidesToRun.push({ name: 'end', side: anchorPair.end });

  const insertedAssetIds: string[] = [];
  const perShot: EpisodeReferencesRunResult['perShot'] = [];
  let totalCost = 0;
  const nowIso = new Date().toISOString();

  for (const { name, side } of sidesToRun) {
    const fileType = `IMG-anchor_${shotIdLower}_${name}`.slice(0, 80);
    const nextV = (versionByType.get(fileType) ?? 0) + 1;
    versionByType.set(fileType, nextV);
    const versionTag = `v${String(nextV).padStart(2, '0')}`;
    const filename = `${episodeCode}-${fileType}-${versionTag}-DRAFT.png`;

    const fullPrompt = `${ANCHOR_LAYOUT_LOCK_PREAMBLE}${side.prompt}`;

    let genB64: string;
    let genCost: number;
    let genWidth: number;
    let genHeight: number;
    try {
      const result = await provider.generate({
        prompt: fullPrompt,
        references: baseRefs.slice(0, provider.capabilities.max_references),
        quality: EREF_QUALITY,
        size: '1536x1024',
        negative: planOverrides.negative,
      });
      genB64 = result.b64_data;
      genCost = result.cost_usd;
      genWidth = result.width;
      genHeight = result.height;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        `[eref-anchor] provider failed for ${planOverrides.shotId}/${name}: ${(err as Error).message}`,
      );
      continue;
    }
    totalCost += genCost;

    const persisted = await persistBinary({
      base64: genB64,
      ext: 'png',
      driveFilename: filename,
      localHint: `eref-anchor-${shotIdLower}-${name}`,
      episodeCode,
      supabase,
    });

    const description = `Anchor ${name} for ${planOverrides.shotId} · role=${side.role} · ${genWidth}×${genHeight} · cost $${genCost.toFixed(4)}`;
    const metadata = {
      provenance: {
        created_by: 'EXEC-EREF',
        created_by_kind: 'agent' as const,
        created_at: nowIso,
        source: 'plan_driven' as const,
        mode_at_time: governanceMode,
        plan_asset_id: planOverrides.planAssetId,
        plan_provider_id: planOverrides.providerId,
      },
      provider_used: provider.id,
      anchor_position: name,
      anchor_role: side.role,
      handoff_link_to_shot_id: side.handoff_link_to_shot_id,
      anchor_rationale: side.rationale,
      scene_master_asset_id: anchorCtx.scene_master_asset.asset_id,
      identity_character_slugs: identityCharNames,
      object_slugs: objectNames,
      shot_reference: {
        shot_id: planOverrides.shotId,
        shot_role: shot.shot_role ?? 'anchor',
        location_slug: shot.location_slug ?? null,
        anchor_position: name,
        anchor_role: side.role,
      },
      // Surface the EXACT prompt sent to the provider — same shape normal
      // references use (metadata.image_prompt). Without this the asset drawer
      // had no prompt to show for anchors (Director: "no prompt, no description").
      // The AssetImagePromptSection reads this directly, so anchors now match
      // the proven reference UX with no drawer-component change.
      image_prompt: {
        current_version: nextV,
        history: [
          {
            version: nextV,
            prompt: fullPrompt,
            source: 'EXEC-EREF' as const,
            at: nowIso,
            cost_usd: genCost,
            staging_path: persisted.browserUrl,
            drive_file_id: persisted.driveFileId,
          },
        ],
      },
    };

    const { data: inserted, error } = await supabase
      .from('assets')
      .insert({
        episode_id: episodeId,
        series_id: null,
        agent_id: 'EXEC-EREF',
        file_type: fileType,
        filename,
        description,
        staging_path: persisted.browserUrl,
        drive_path: persisted.browserUrl,
        drive_file_id: persisted.driveFileId,
        drive_web_view_url: persisted.driveWebViewUrl,
        status: 'REVIEW',
        version: nextV,
        content: null,
        metadata: metadata as unknown as Record<string, unknown>,
      } as never)
      .select('id')
      .single();

    if (error) {
      // eslint-disable-next-line no-console
      console.error(`[eref-anchor] insert failed for ${filename}: ${error.message}`);
      continue;
    }
    insertedAssetIds.push(inserted.id);
    perShot.push({
      shot_id: planOverrides.shotId,
      final_verdict: 'APPROVE',
      retries: 0,
      cost_usd: genCost,
      is_4k: false,
    });
  }

  if (insertedAssetIds.length === 0) {
    throw new EpisodeReferencesError(
      `Anchor mode produced no inserted assets for ${planOverrides.shotId} — all sides failed`,
    );
  }

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
    description: `Anchor pair by EXEC-EREF · ${planOverrides.shotId} · ${insertedAssetIds.length}/${sidesToRun.length} sides · cost $${totalCost.toFixed(4)} · scene_master=${anchorCtx.scene_master_asset.asset_id}`,
    contract: EREF_CONTRACT,
    bibleSnapshot: { characters: charNames, locations: locNames },
    perShot,
  };
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

  // ── TD-49 Phase 2 P2.3 anchor pair branch ─────────────────────────────────
  // When the Designer Plan carries an anchor_pair block, the Artist diverges
  // from the legacy single-IMG path entirely: runAnchorPairGeneration loads
  // scene_master, builds identity+style+scene_master refs, generates one IMG
  // per declared anchor side, and persists with the IMG-anchor_<shot>_<side>
  // file_type that the approve-route P2.6 batch flow recognises.
  //
  // Skipped: freshness guard (anchor mode uses scene_master, not TD-30/TD-33
  // continuity anchors), buildShotJobs, idempotency-by-IMG-episode_ref,
  // pilot/fan-out state, style guardian rewrites, eref-check reviewer,
  // 4K upscale. These layers all assume legacy single-IMG-per-shot semantics.
  if (planDriven && planOverrides && planOverrides.anchorPair && typeof episodeId === 'string' && episodeId) {
    return await runAnchorPairGeneration({
      inputs,
      supabase,
      episodeId,
      episodeCode: epCode,
      governanceMode,
      planOverrides,
      anchorPair: planOverrides.anchorPair,
    });
  }

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

  const castSlugs = await loadEpisodeCastSlugs(supabase, episodeId);
  const bible = await loadBibleCanon(supabase, seriesId, castSlugs);
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
          // 2026-06-14: forward the Plan's negative to the provider (was only
          // sent to the reviewer). Symmetric with the anchor path.
          negative: planOverrides?.negative,
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
          // TD-38 (2026-05-23): in plan-driven mode the reviewer must
          // score against the same Designer Plan body that drove the
          // generator. Otherwise reviewer falls back to storyboard's
          // legacy `expected_gag` → retry loop drifts away from Plan →
          // REGENERATE_EXHAUSTED with the wrong final image (SH22 puddle
          // regression, SH19 fist-bump regression).
          planIntent: planOverrides
            ? {
                prompt: planOverrides.prompt,
                negativeList: planOverrides.negative,
              }
            : undefined,
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

      // 2026-06-14 mode-aware checker fallback + statistics (Director q):
      // when the AI checker was bypassed/failed (skipped), DON'T silently
      // auto-APPROVE. Always record a stat (dashboard visibility) and route by
      // governance mode: Mode 4 keeps auto-pass (autotest resilience); Modes 1-3
      // land HUMAN_REVIEW so the Director (1/2) or EXEC-DIR-AI deputy (3) judges.
      const checkerSkipped = (reviewResult as { skipped?: boolean }).skipped === true;
      if (checkerSkipped) {
        const reason =
          (reviewResult as { skipped_reason?: string }).skipped_reason ?? 'checker bypassed';
        await logEvent(supabase, {
          event_type: 'checker_fallback',
          severity: governanceMode === 4 ? 'info' : 'warning',
          title: `EREF checker fallback (mode ${governanceMode}) — shot ${job.shot.shot_id}`,
          description: reason,
          actor: 'EXEC-EREF-CHECK',
          episode_id: episodeId,
          metadata: {
            agent: 'EXEC-EREF-CHECK',
            shot_id: job.shot.shot_id,
            mode: governanceMode,
            reason,
            path: 'regular',
            dashboard_flag: governanceMode === 3,
          },
        });
        finalVerdict = governanceMode === 4 ? 'APPROVE' : 'HUMAN_REVIEW';
        approvedAttempt = attempt;
        approvedB64 = genB64;
        break;
      }

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
    negative?: readonly string[];
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
    negative: args.negative,
  });
}
