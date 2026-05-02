// ──────────────────────────────────────────────────────────────────────────────
// lib/api/series-bible.ts
// Helpers for the Series Bible (specs/company/series_bible.md).
//
// A Bible asset is any `assets` row with `series_id IS NOT NULL` and
// `file_type` starting with `SBL-`. Bible assets are series-scoped, not
// episode-scoped — they form the canon that episode pipelines anchor on.
//
// EXEC-EREF gate (lib/agents/gate.ts) reads from this layer to decide
// whether the parent series has the minimum LOCKED canon to run real
// episode reference generation.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/types.gen';

export type SbSection =
  | 'general_idea'
  | 'character'
  | 'location'
  | 'object'
  | 'style'
  | 'audio';

export const BIBLE_SECTIONS: ReadonlyArray<SbSection> = [
  'general_idea',
  'character',
  'location',
  'object',
  'style',
  'audio',
];

export const BIBLE_FILE_TYPE_PREFIX = 'SBL-';

export interface BibleAsset {
  id: string;
  series_id: string | null;
  file_type: string;
  filename: string;
  description: string | null;
  content: string | null;
  status: string;
  version: number | null;
  drive_path: string | null;
  drive_file_id: string | null;
  drive_web_view_url: string | null;
  staging_path: string | null;
  created_at: string;
  updated_at: string;
  /** assets.metadata jsonb (migration 0020). */
  metadata?: AssetMetadataDoc | null;
}

export interface BibleSection {
  section: SbSection;
  /** Display label (Heroes, Locations, …). */
  label: string;
  assets: BibleAsset[];
}

const SECTION_LABELS: Record<SbSection, string> = {
  general_idea: 'General idea',
  character: 'Heroes',
  location: 'Locations',
  object: 'Objects',
  style: 'Style',
  audio: 'Audio',
};

export function sectionLabel(s: SbSection): string {
  return SECTION_LABELS[s];
}

/**
 * Map an `SBL-*` file_type to its section. Free slug after the section is
 * accepted (e.g. `SBL-character_sandy` → `character`).
 */
export function sectionFromFileType(fileType: string): SbSection | null {
  if (!fileType.startsWith(BIBLE_FILE_TYPE_PREFIX)) return null;
  const tail = fileType.slice(BIBLE_FILE_TYPE_PREFIX.length); // e.g. "character_sandy"
  for (const sec of BIBLE_SECTIONS) {
    if (tail === sec || tail.startsWith(`${sec}_`)) return sec;
  }
  return null;
}

/**
 * Canonical "what is this Bible asset's slug?" helper — single source of truth.
 *
 * file_type is the structured carrier (`SBL-{section}_{slug}`). Filename is
 * derivative — adds v01/DRAFT suffixes that get rewritten on every status
 * change — so DO NOT parse the filename for this purpose. Past bug: a greedy
 * regex over filename (`-SBL-[a-z_]+_(...)-v\d+-`) collapsed compound slugs
 * (`city_systems` → `systems`) and broke Continuity Check matching against
 * canonical character IDs. Two callers had the buggy regex, two had the
 * correct one — classic DRY violation. This helper kills all the copies.
 *
 * Every component that needs the slug MUST call this function. Inline regex
 * over filename is forbidden — eslint-no-restricted-syntax + a unit test
 * enforce it.
 */
export function bibleSlugFromFileType(fileType: string): {
  section: SbSection;
  slug: string;
} | null {
  if (!fileType.startsWith(BIBLE_FILE_TYPE_PREFIX)) return null;
  const tail = fileType.slice(BIBLE_FILE_TYPE_PREFIX.length);
  for (const sec of BIBLE_SECTIONS) {
    if (tail === sec) return { section: sec, slug: '' };
    const prefix = `${sec}_`;
    if (tail.startsWith(prefix)) {
      return { section: sec, slug: tail.slice(prefix.length).toLowerCase() };
    }
  }
  return null;
}

/** Convenience wrapper: returns just the slug, null if file_type is not SBL-*. */
export function bibleSlug(fileType: string): string | null {
  return bibleSlugFromFileType(fileType)?.slug ?? null;
}

// ── Asset metadata schema (assets.metadata jsonb, migration 0020) ─────────────
//
// We persist three structured side-documents inside the single JSONB column,
// so we don't add new columns for every editorial concern.

/** Governance mode at the moment of action. Future EXEC-ORCH reads this for audit. */
export type GovernanceModeNum = 1 | 2 | 3 | 4;

/** Who/when an asset was created or last touched. Surfaced in AssetDetailDrawer. */
export interface AssetProvenance {
  created_by: string;
  created_by_kind: 'agent' | 'director' | 'system';
  created_at: string;
  source: 'canon_extension_approval' | 'manual_add' | 'seed_script' | 'pipeline' | 'unknown';
  /** Governance mode at the moment of creation (1=MANUAL, 4=AUTOTEST). */
  mode_at_time?: GovernanceModeNum;
  last_modified_by?: string;
  last_modified_by_kind?: 'agent' | 'director' | 'system';
  last_modified_at?: string;
  /** Mode at the moment of last edit. */
  last_modified_mode?: GovernanceModeNum;
}

/** One entry in image_prompt.history. Each Director reroll, agent enrich, or upload appends here. */
export interface ImagePromptHistoryEntry {
  version: number;
  prompt: string;
  source:
    | 'EXEC-BIBLE-AUTHOR'
    | 'EXEC-EREF'
    | 'EXEC-THUMB'
    | 'director_edit'
    | 'director_upload'
    | 'manual_generate'
    | 'restore';
  at: string;
  cost_usd: number;
  staging_path: string | null;
  drive_file_id: string | null;
  drive_web_view_url: string | null;
  width: number | null;
  height: number | null;
  quality: 'low' | 'medium' | 'high' | null;
  /** Optional: when source='restore', which previous version was duplicated forward. */
  restored_from_version?: number;
  /** Governance mode at the moment of this entry. */
  mode_at_time?: GovernanceModeNum;
  /** Original filename when source='director_upload'. */
  upload_original_filename?: string;
  /** Style Guardian verdict at the moment of generation, if pre-flight ran. */
  style_check_verdict?: 'PASS' | 'WARN' | 'FAIL' | null;
  /** True if Auto-Rewrite Style Guardian rewrote the prompt before generation. */
  style_check_rewritten?: boolean;
}

/** image_prompt sub-doc — current pointer + ordered history. */
export interface ImagePromptDoc {
  current_version: number;
  style_anchor_asset_id: string | null;
  history: ImagePromptHistoryEntry[];
}

/** description_history sub-doc — versioned description text. */
export interface DescriptionHistoryEntry {
  version: number;
  content: string;
  source: 'EXEC-BIBLE-AUTHOR' | 'director_edit';
  at: string;
}

export interface DescriptionHistoryDoc {
  current_version: number;
  history: DescriptionHistoryEntry[];
}

/** Full shape of assets.metadata. All sub-docs optional — pre-existing rows have none. */
export interface AssetMetadataDoc {
  provenance?: AssetProvenance;
  image_prompt?: ImagePromptDoc;
  description_history?: DescriptionHistoryDoc;
  // Non-Bible assets carry other keys (proposal_count, severity, etc.) — preserved
  // by always merging via spread when updating.
  [key: string]: unknown;
}

/** Build a fresh provenance record for a new asset. */
export function buildProvenance(args: {
  by: string;
  byKind: 'agent' | 'director' | 'system';
  source: AssetProvenance['source'];
  at?: string;
}): AssetProvenance {
  return {
    created_by: args.by,
    created_by_kind: args.byKind,
    created_at: args.at ?? new Date().toISOString(),
    source: args.source,
  };
}

/** Stamp a last-modified marker onto an existing provenance (immutable copy). */
export function stampLastModified(
  prov: AssetProvenance,
  by: string,
  byKind: 'agent' | 'director' | 'system',
  at?: string,
): AssetProvenance {
  return {
    ...prov,
    last_modified_by: by,
    last_modified_by_kind: byKind,
    last_modified_at: at ?? new Date().toISOString(),
  };
}

/** Build the canonical filename for a new Bible asset. */
export function bibleFilename(args: {
  seriesCode: string;          // e.g. "SS-S03"
  section: SbSection;
  slug: string;                // e.g. "sandy" → SBL-character_sandy
  version: number;
  ext: 'md' | 'png' | 'mp3' | 'wav';
  status: 'DRAFT' | 'REVIEW' | 'APPROVED' | 'LOCKED' | 'REVISION';
}): string {
  const { seriesCode, section, slug, version, ext, status } = args;
  const slugSafe = slug.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_');
  const v = `v${String(version).padStart(2, '0')}`;
  return `${seriesCode}-SBL-${section}_${slugSafe}-${v}-${status}.${ext}`;
}

export async function listBibleSections(
  supabase: SupabaseClient<Database>,
  seriesId: string,
): Promise<BibleSection[]> {
  const { data, error } = await supabase
    .from('assets')
    .select('*')
    .eq('series_id', seriesId)
    .like('file_type', `${BIBLE_FILE_TYPE_PREFIX}%`)
    .order('file_type', { ascending: true })
    .order('version', { ascending: false });
  if (error) {
    throw new Error(`listBibleSections: ${error.message}`);
  }

  const grouped = new Map<SbSection, BibleAsset[]>();
  for (const sec of BIBLE_SECTIONS) grouped.set(sec, []);
  for (const row of data ?? []) {
    const sec = sectionFromFileType(row.file_type);
    if (!sec) continue;
    grouped.get(sec)!.push(row as BibleAsset);
  }
  return BIBLE_SECTIONS.map((s) => ({
    section: s,
    label: SECTION_LABELS[s],
    assets: grouped.get(s) ?? [],
  }));
}

/**
 * Count LOCKED Bible assets for a series, broken down by section. Used by
 * gate.ts to decide whether EXEC-EREF can run.
 */
export async function countLockedBibleSections(
  supabase: SupabaseClient<Database>,
  seriesId: string,
): Promise<Record<SbSection, number>> {
  const { data, error } = await supabase
    .from('assets')
    .select('file_type')
    .eq('series_id', seriesId)
    .eq('status', 'LOCKED')
    .like('file_type', `${BIBLE_FILE_TYPE_PREFIX}%`);
  if (error) {
    throw new Error(`countLockedBibleSections: ${error.message}`);
  }
  const counts: Record<SbSection, number> = {
    general_idea: 0, character: 0, location: 0, object: 0, style: 0, audio: 0,
  };
  for (const row of data ?? []) {
    const sec = sectionFromFileType(row.file_type);
    if (sec) counts[sec] += 1;
  }
  return counts;
}

/**
 * Look up the parent series_id (UUID) for an episode. Used by gate.ts to bridge
 * episode-scoped runs to series-scoped Bible canon.
 *
 * NewEpisodeModal historical bug: some episode rows have `series_id` populated
 * with the series CODE (e.g. "SS-S09") instead of the UUID. We tolerate that
 * here by detecting non-UUID values and resolving via the series.code lookup.
 *
 * Avoids `.maybeSingle()` to stay compatible with the in-memory test
 * supabase mock used by replay-pilot.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function seriesIdForEpisode(
  supabase: SupabaseClient<Database>,
  episodeId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('episodes')
    .select('series_id, episode_code')
    .eq('id', episodeId);
  if (error) {
    throw new Error(`seriesIdForEpisode: ${error.message}`);
  }
  const row = (data ?? [])[0] as
    | { series_id?: string | null; episode_code?: string | null }
    | undefined;
  if (!row) return null;

  const raw = row.series_id;

  // Happy path: real UUID FK
  if (typeof raw === 'string' && UUID_RE.test(raw)) return raw;

  // Legacy fallback 1: series_id stores series code like "SS-S09".
  // 2: derive from episode_code prefix (SS-S09-E01 → SS-S09).
  // Both wrapped: replay-pilot's mock supabase has no `series` table and
  // would throw on .from('series'); we keep happy-path running.
  const candidates: string[] = [];
  if (typeof raw === 'string' && /^SS-/.test(raw)) candidates.push(raw);
  if (row.episode_code) {
    const m = row.episode_code.match(/^(SS-[A-Z0-9]+)/);
    if (m && m[1] && !candidates.includes(m[1])) candidates.push(m[1]);
  }
  for (const code of candidates) {
    try {
      const lookup = await supabase.from('series').select('id').eq('code', code);
      if (!lookup.error) {
        const seriesRow = (lookup.data ?? [])[0] as { id?: string } | undefined;
        if (seriesRow?.id) return seriesRow.id;
      }
    } catch {
      // mock supabase or transient error — try next
    }
  }

  return raw ?? null;
}
