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

  // Legacy fallback 1: series_id stores series code like "SS-S09"
  if (typeof raw === 'string' && /^SS-/.test(raw)) {
    const lookup = await supabase.from('series').select('id').eq('code', raw);
    if (!lookup.error) {
      const seriesRow = (lookup.data ?? [])[0] as { id?: string } | undefined;
      if (seriesRow?.id) return seriesRow.id;
    }
  }

  // Legacy fallback 2: derive from episode_code prefix (SS-S09-E01 → SS-S09)
  if (row.episode_code) {
    const m = row.episode_code.match(/^(SS-[A-Z0-9]+)/);
    if (m && m[1]) {
      const lookup = await supabase.from('series').select('id').eq('code', m[1]);
      if (!lookup.error) {
        const seriesRow = (lookup.data ?? [])[0] as { id?: string } | undefined;
        if (seriesRow?.id) return seriesRow.id;
      }
    }
  }

  return raw ?? null;
}
