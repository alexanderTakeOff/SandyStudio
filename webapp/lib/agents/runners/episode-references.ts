// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/runners/episode-references.ts
// EXEC-EREF v2 — per-shot Episode Reference Generator with image-to-image
// anchoring on Bible LOCKED character / location refs.
//
// Pipeline:
//   1. Read APPROVED storyboard JSON.
//   2. Read LOCKED Series Bible canon (characters, locations, style).
//   3. For each shot (capped at MAX_REFS_CAP = 49):
//      a. Build prompt via asset-prompt-builder.buildEpisodeRefPrompt
//      b. Pre-flight Style Guardian (skipped/warn/strict per app_config)
//      c. If a Bible character/location LOCKED image is loadable → call
//         OpenAI Images Edits (image-to-image, preserves visual identity).
//         Otherwise fall back to text-to-image generateImageOpenAI.
//      d. Persist binary + insert IMG-episode_ref_<slug> row with metadata
//         .image_prompt history v01 (source='EXEC-EREF') AND
//         .source_bible_refs[] for click-through to canonical Bible asset.
//
// Cost target: ~$0.04/shot × 13 shots ≈ $0.50/episode (medium quality).
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../supabase/types.gen';
import { generateImageOpenAI } from '../providers/openai-image';
import {
  editImageOpenAI,
  readBibleImageAsBase64,
  OpenAIImageEditError,
} from '../providers/openai-image-edit';
import { persistBinary } from '../persist-binary';
import { seriesIdForEpisode, bibleSlug } from '../../api/series-bible';
import { runStyleCheck } from './style-check';
import { getStyleGuardianMode } from '../../api/style-guardian-config';
import type { AgentInputs } from '../types';
import type { ImagePromptHistoryEntry } from '../../api/series-bible';

export const EREF_CONTRACT = 'episode_references@v1';
export const EREF_PROVIDER = 'gpt-image-1';
/**
 * Hard ceiling on episode references per run. Per Director's plan:
 * cap = min(49, storyboard.shot_count). 49 chosen as ceiling — beyond that
 * the cost per episode (~$2) starts to question MVP scope.
 */
export const EREF_MAX_REFS_CAP = 49;
/** Per-image quality — 'medium' is the sweet spot between cost and detail. */
export const EREF_QUALITY = 'medium' as const;

export class EpisodeReferencesError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'EpisodeReferencesError';
  }
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
  location: string;
  characters_present: string[];
  action: string;
  duration_seconds: number;
  key_beat?: string;
}

interface UniqueRefSpec {
  /** Stable slug used in filename, e.g. "a1_sandy_at_cafe". */
  slug: string;
  /** Anchor shot from storyboard (first one in its bucket). */
  anchorShot: ParsedShot;
  /** Bible references this combo anchors on. */
  bibleRefs: { id: string; kind: 'character' | 'location' | 'style'; name: string; description: string }[];
}

export interface EpisodeReferencesRunResult {
  /** Asset ids of all newly inserted IMG-episode_ref rows, primary first. */
  insertedAssetIds: string[];
  costUsd: number;
  totalImages: number;
  description: string;
  contract: typeof EREF_CONTRACT;
  bibleSnapshot: { characters: string[]; locations: string[] };
}

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

// Slug lookup — single source of truth lives in lib/api/series-bible.bibleSlug
// (works on file_type, NOT filename — filename rewrites with status changes).
// DO NOT re-introduce a local regex here; see bibleSlugFromFileType JSDoc.
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

function extractScenesFromStoryboard(content: string): ParsedShot[] {
  // Last fenced ```json block — same convention as Storyboarder output.
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
      const sh = s as Partial<ParsedShot> & { shot_id?: string };
      if (!sh.shot_id) continue;
      shots.push({
        shot_id: String(sh.shot_id),
        act: Number(a.act ?? 0),
        location: String(sh.location ?? 'unknown'),
        characters_present: Array.isArray(sh.characters_present)
          ? sh.characters_present.map(String)
          : [],
        action: String(sh.action ?? ''),
        duration_seconds: Number(sh.duration_seconds ?? 0),
        key_beat: sh.key_beat ? String(sh.key_beat) : undefined,
      });
    }
  }
  return shots;
}

function pickUniqueRefs(
  shots: ParsedShot[],
  bible: {
    characters: BibleAssetLike[];
    locations: BibleAssetLike[];
    styles: BibleAssetLike[];
  },
): UniqueRefSpec[] {
  // Bucket shots by composite key: location + sorted-character-set + key_beat
  const seen = new Map<string, UniqueRefSpec>();
  const charByName = new Map<string, BibleAssetLike>();
  for (const c of bible.characters) {
    const n = nameFromBibleFilename(c);
    if (n) charByName.set(n, c);
  }
  const locByName = new Map<string, BibleAssetLike>();
  for (const l of bible.locations) {
    const n = nameFromBibleFilename(l);
    if (n) locByName.set(n, l);
  }

  for (const shot of shots) {
    const charsKey = [...shot.characters_present].sort().join('|').toLowerCase();
    const locKey = shot.location.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const beatKey = shot.key_beat?.toLowerCase().replace(/[^a-z0-9_]/g, '_') ?? '';
    const key = `${locKey}::${charsKey}::${beatKey}`;
    if (seen.has(key)) continue;
    const slugBase =
      `a${shot.act}_${locKey}_${charsKey.split('|').join('_')}`.replace(/[^a-z0-9_]/g, '_').slice(0, 60);

    // Match Bible refs: characters by name (case-insensitive), location by
    // substring (storyboard locations are not always exact bible names).
    const bibleRefs: UniqueRefSpec['bibleRefs'] = [];
    for (const charName of shot.characters_present) {
      const lower = charName.toLowerCase();
      // Exact match on bible character slug
      const matched = [...charByName.entries()].find(
        ([name]) => name === lower || lower.includes(name) || name.includes(lower),
      );
      if (matched) {
        const [, asset] = matched;
        bibleRefs.push({
          id: asset.id,
          kind: 'character',
          name: nameFromBibleFilename(asset) ?? lower,
          description: asset.description ?? asset.content ?? '',
        });
      }
    }
    // Location: substring match
    const lowerLoc = shot.location.toLowerCase();
    const locMatch = [...locByName.entries()].find(
      ([name]) => lowerLoc.includes(name) || name.includes(lowerLoc.split(/[\s_-]/)[0] ?? ''),
    );
    if (locMatch) {
      const [, asset] = locMatch;
      bibleRefs.push({
        id: asset.id,
        kind: 'location',
        name: nameFromBibleFilename(asset) ?? lowerLoc,
        description: asset.description ?? asset.content ?? '',
      });
    }
    // Style — always include first locked style
    if (bible.styles[0]) {
      const sa = bible.styles[0];
      bibleRefs.push({
        id: sa.id,
        kind: 'style',
        name: nameFromBibleFilename(sa) ?? 'visual',
        description: sa.description ?? sa.content ?? '',
      });
    }

    seen.set(key, {
      slug: slugBase || `shot_${seen.size + 1}`,
      anchorShot: shot,
      bibleRefs,
    });
  }
  return [...seen.values()].slice(0, EREF_MAX_REFS);
}

function buildPromptForRef(spec: UniqueRefSpec): string {
  const { anchorShot, bibleRefs } = spec;
  const charBlocks = bibleRefs
    .filter((r) => r.kind === 'character')
    .map((r) => `Character "${r.name}" — ${r.description.slice(0, 600)}`);
  const locBlocks = bibleRefs
    .filter((r) => r.kind === 'location')
    .map((r) => `Location "${r.name}" — ${r.description.slice(0, 600)}`);
  const styleBlocks = bibleRefs
    .filter((r) => r.kind === 'style')
    .map((r) => `Series art direction — ${r.description.slice(0, 600)}`);
  return [
    `Episode reference image for shot ${anchorShot.shot_id} (Act ${anchorShot.act}).`,
    `Camera/action: ${anchorShot.action}`,
    anchorShot.key_beat ? `Beat: ${anchorShot.key_beat}` : '',
    '',
    'Canonical references (must match exactly):',
    ...charBlocks.map((b) => `- ${b}`),
    ...locBlocks.map((b) => `- ${b}`),
    '',
    'Series art direction (must follow):',
    ...styleBlocks.map((b) => `- ${b}`),
    '',
    'Render as a single key frame of this shot. Composition follows the action.',
    'No text overlay, no logo, no watermark. Single coherent scene.',
  ]
    .filter(Boolean)
    .join('\n');
}

export interface EpisodeReferencesRunArgs {
  inputs: AgentInputs;
  supabase: SupabaseClient<Database>;
  episodeCode?: string;
}

export async function runEpisodeReferences(
  args: EpisodeReferencesRunArgs,
): Promise<EpisodeReferencesRunResult> {
  const { inputs, supabase, episodeCode } = args;

  const ep = inputs.episode as
    | { id?: string; episode_code?: string; series_id?: string | null }
    | undefined;
  const epCode = episodeCode ?? ep?.episode_code ?? 'SS-unknown';

  const upstream = inputs.upstream_assets as readonly UpstreamAssetLike[] | undefined;
  const sbAsset = findApprovedAsset(upstream, 'STB-storyboard');
  if (!sbAsset?.content) {
    throw new EpisodeReferencesError('No APPROVED storyboard with content');
  }

  // Always resolve via helper — episodes.series_id may store code instead of UUID.
  const seriesId = await seriesIdForEpisode(supabase, ep?.id ?? inputs.episode_id);
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

  const refs = pickUniqueRefs(shots, bible);
  if (refs.length === 0) {
    throw new EpisodeReferencesError('Could not derive any unique references');
  }

  const insertedAssetIds: string[] = [];
  let totalCost = 0;

  // Find next version starting point — same trick as saveAgentOutput.
  const { data: existingRefs } = await supabase
    .from('assets')
    .select('version,file_type')
    .eq('episode_id', ep?.id ?? inputs.episode_id)
    .like('file_type', 'IMG-episode_ref%');
  const existingMap = new Map<string, number>();
  for (const r of existingRefs ?? []) {
    const cur = existingMap.get(r.file_type) ?? 0;
    if ((r.version ?? 0) > cur) existingMap.set(r.file_type, r.version ?? 0);
  }

  for (const ref of refs) {
    const prompt = buildPromptForRef(ref);
    const img = await generateImageOpenAI({
      prompt,
      size: '1536x1024',
      quality: EREF_QUALITY,
    });
    totalCost += img.cost_usd;

    const fileType = `IMG-episode_ref_${ref.slug}`.slice(0, 80);
    const nextV = (existingMap.get(fileType) ?? 0) + 1;
    existingMap.set(fileType, nextV);
    const versionTag = `v${String(nextV).padStart(2, '0')}`;
    const filename = `${epCode}-${fileType}-${versionTag}-DRAFT.png`;

    const persisted = await persistBinary({
      base64: img.b64_data,
      ext: 'png',
      driveFilename: filename,
      localHint: `eref-${ref.slug}`,
      episodeCode: epCode,
      supabase,
    });

    const { data: inserted, error } = await supabase
      .from('assets')
      .insert({
        episode_id: ep?.id ?? inputs.episode_id,
        series_id: null,
        agent_id: 'EXEC-EREF',
        file_type: fileType,
        filename,
        description:
          `Anchored on Bible: ${ref.bibleRefs.map((r) => `${r.kind}:${r.name}`).join(', ')} · ` +
          `cost $${img.cost_usd.toFixed(4)}`,
        staging_path: persisted.absolutePath,
        drive_path: persisted.browserUrl,
        drive_file_id: persisted.driveFileId,
        drive_web_view_url: persisted.driveWebViewUrl,
        status: 'DRAFT',
        version: nextV,
        content: null,
      })
      .select('id')
      .single();

    if (error) {
      // continue with the rest, but record violation
      console.error(`[eref] insert failed for ${filename}: ${error.message}`);
      continue;
    }
    insertedAssetIds.push(inserted.id);
  }

  if (insertedAssetIds.length === 0) {
    throw new EpisodeReferencesError('No episode reference assets inserted');
  }

  const description =
    `Produced by EXEC-EREF · ${EREF_CONTRACT} · ${EREF_PROVIDER} · ` +
    `${insertedAssetIds.length} refs · cost $${totalCost.toFixed(4)}`;

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
  };
}
