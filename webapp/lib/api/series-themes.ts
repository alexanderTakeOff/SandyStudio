// ──────────────────────────────────────────────────────────────────────────────
// lib/api/series-themes.ts
// Helpers for the Episode-Themes surface (q9a, 2026-06-30).
//
// A theme is a reusable visual gag engine for an episode. Each theme is its OWN
// series-scoped asset — `file_type = 'SPC-theme_{slug}'`, `series_id` set,
// `episode_id = null` — so the surface is a LIGHT index (one-liner per theme)
// with per-theme detail on demand, instead of one monstrous bank file that
// chokes the model's output.
//
// Why per-theme assets (not git files, not one monolith):
//   - `FILMS/` is git-ignored and the studio git (Tier-1) holds NO film content
//     (CLAUDE.md §2) — so per-theme git files are incompatible. DB assets give
//     the same "one file per theme" UX inside the right tier.
//   - `SPC-theme_*` reuses an allowed `file_type` prefix (CHECK constraint,
//     migration 0017) so NO schema migration is needed, and it is NOT `SBL-%`
//     so themes stay invisible to the EREF canon-gate and every pipeline filter.
//
// Storage model:
//   - `description` column  = the one-liner (index text).
//   - `content` column      = full theme markdown (detail card).
//   - `metadata.theme_status` = 'approved' | 'draft' | 'used' | 'invalidated' —
//     the CURATION status, free any→any via a metadata PATCH. This is
//     deliberately NOT the asset `status` enum (DRAFT→LOCKED), which embeds
//     status in the filename → a rename per flip. `asset.status` stays a stable
//     'DRAFT' storage marker; the canon status machine is irrelevant here
//     (themes sit outside every SBL-/pipeline gate).
//   - `metadata.used_in_episodes` = [{ id, code }] — which episodes consumed
//     this theme (2026-07-29). Lives in metadata for the same reason: the
//     `assets_series_or_episode_check` constraint forbids a row from carrying
//     BOTH series_id and episode_id, so the link cannot go in the column. The
//     episode UUID is stored alongside the code so the stamp stays
//     machine-readable once the brief remembers which theme it came from.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/types.gen';
import type { AssetMetadataDoc } from './series-bible';

export type ThemeStatus = 'approved' | 'draft' | 'used' | 'invalidated';

export const THEME_STATUSES: ReadonlyArray<ThemeStatus> = [
  'approved',
  'draft',
  'used',
  'invalidated',
];

/** An episode that consumed a theme. Both halves stored: uuid = link, code = label. */
export interface ThemeEpisodeRef {
  id: string;
  code: string;
}

/** All per-theme assets carry this prefix; `{slug}` follows. */
export const THEME_FILE_TYPE_PREFIX = 'SPC-theme_';

/** The deprecated single-bank monolith (PR #30). Excluded from the per-theme list. */
export const LEGACY_THEME_BANK_FILE_TYPE = 'SPC-theme_bank';

const THEME_STATUS_LABELS: Record<ThemeStatus, string> = {
  approved: 'Approved',
  draft: 'Draft',
  used: 'In use',
  invalidated: 'Invalidated',
};

export function themeStatusLabel(s: ThemeStatus): string {
  return THEME_STATUS_LABELS[s];
}

/**
 * Semantic colour token per status (specs/system/uiux.md — never a literal hex).
 * `used` borrows `--status-locked` because `--status-completed` is the SAME green
 * as `--status-approved` and the two would be indistinguishable at a glance.
 */
export const THEME_STATUS_TOKEN: Record<ThemeStatus, string> = {
  approved: '--status-approved',
  draft: '--accent-warning',
  used: '--status-locked',
  invalidated: '--status-muted',
};

export interface SeriesTheme {
  id: string;
  series_id: string | null;
  slug: string;
  file_type: string;
  filename: string;
  /** One-liner shown in the index. */
  description: string | null;
  /** Full theme markdown shown in the detail card. */
  content: string | null;
  /** Curation status (metadata.theme_status), default 'draft'. */
  theme_status: ThemeStatus;
  /** Episodes that consumed this theme (metadata.used_in_episodes). */
  used_in_episodes: ThemeEpisodeRef[];
  /** Stable asset status enum — themes keep it 'DRAFT'. */
  status: string;
  version: number | null;
  metadata: AssetMetadataDoc | null;
  created_at: string;
  updated_at: string;
}

/**
 * Extract the theme slug from a `SPC-theme_{slug}` file_type. Returns null for
 * the legacy `SPC-theme_bank` monolith and for any non-theme file_type.
 */
export function themeSlugFromFileType(fileType: string): string | null {
  if (fileType === LEGACY_THEME_BANK_FILE_TYPE) return null;
  if (!fileType.startsWith(THEME_FILE_TYPE_PREFIX)) return null;
  const slug = fileType.slice(THEME_FILE_TYPE_PREFIX.length).toLowerCase();
  return slug.length > 0 ? slug : null;
}

/** Read `metadata.theme_status`, defaulting to 'draft' for any missing/invalid value. */
export function themeStatusFromMetadata(metadata: AssetMetadataDoc | null | undefined): ThemeStatus {
  const raw = (metadata as Record<string, unknown> | null | undefined)?.theme_status;
  return raw === 'approved' || raw === 'invalidated' || raw === 'used' ? raw : 'draft';
}

/** Read `metadata.used_in_episodes`, dropping any malformed entry. */
export function usedEpisodesFromMetadata(
  metadata: AssetMetadataDoc | null | undefined,
): ThemeEpisodeRef[] {
  const raw = (metadata as Record<string, unknown> | null | undefined)?.used_in_episodes;
  if (!Array.isArray(raw)) return [];
  const refs: ThemeEpisodeRef[] = [];
  for (const entry of raw) {
    const e = entry as Partial<ThemeEpisodeRef> | null;
    if (e && typeof e.id === 'string' && typeof e.code === 'string' && e.code) {
      refs.push({ id: e.id, code: e.code });
    }
  }
  return refs;
}

/**
 * The usage stamp shown on a theme card: `IN E16`, or `IN E16 +2` when the
 * theme was consumed by more than one episode. Null when never used.
 */
export function themeUsageLabel(refs: ReadonlyArray<ThemeEpisodeRef>): string | null {
  if (refs.length === 0) return null;
  const rest = refs.length - 1;
  return rest > 0 ? `IN ${refs[0].code} +${rest}` : `IN ${refs[0].code}`;
}

/** Normalise free text into a safe theme slug (snake_case, a-z0-9_). */
export function themeSlugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60);
}

/** Build the canonical filename for a theme asset (asset status stays DRAFT). */
export function themeFilename(seriesCode: string, slug: string, version = 1): string {
  const slugSafe = themeSlugify(slug);
  const v = `v${String(version).padStart(2, '0')}`;
  return `${seriesCode}-SPC-theme_${slugSafe}-${v}-DRAFT.md`;
}

interface ThemeAssetRow {
  id: string;
  series_id: string | null;
  file_type: string;
  filename: string;
  description: string | null;
  content: string | null;
  status: string;
  version: number | null;
  metadata: AssetMetadataDoc | null;
  created_at: string;
  updated_at: string;
}

function toSeriesTheme(row: ThemeAssetRow, slug: string): SeriesTheme {
  return {
    id: row.id,
    series_id: row.series_id,
    slug,
    file_type: row.file_type,
    filename: row.filename,
    description: row.description,
    content: row.content,
    theme_status: themeStatusFromMetadata(row.metadata),
    used_in_episodes: usedEpisodesFromMetadata(row.metadata),
    status: row.status,
    version: row.version,
    metadata: row.metadata,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * List per-theme assets for a series, latest version per slug. Excludes the
 * deprecated `SPC-theme_bank` monolith. Sorted by created_at descending so the
 * newest themes lead each status group in the UI.
 */
export async function listSeriesThemes(
  supabase: SupabaseClient<Database>,
  seriesId: string,
): Promise<SeriesTheme[]> {
  // Query the broad `SPC-theme%` family then filter precisely in code:
  // Postgres LIKE treats `_` as a wildcard, so `SPC-theme_%` would also match
  // unrelated `SPC-themeX…`; the code filter (themeSlugFromFileType) is exact.
  const { data, error } = await supabase
    .from('assets')
    .select('*')
    .eq('series_id', seriesId)
    .like('file_type', 'SPC-theme%')
    .order('version', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) {
    throw new Error(`listSeriesThemes: ${error.message}`);
  }

  // One theme per slug: rows are version-desc, so the first row seen wins.
  const bySlug = new Map<string, SeriesTheme>();
  for (const raw of (data ?? []) as ThemeAssetRow[]) {
    const slug = themeSlugFromFileType(raw.file_type);
    if (!slug) continue; // skips the legacy bank + any non-theme
    if (!bySlug.has(slug)) bySlug.set(slug, toSeriesTheme(raw, slug));
  }
  return [...bySlug.values()].sort(
    (a, b) => (b.created_at > a.created_at ? 1 : b.created_at < a.created_at ? -1 : 0),
  );
}
