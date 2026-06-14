// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/bible-loader.ts
// Shared loader for the Series Bible canon, used by every text-producing
// runner (EXEC-SW, EXEC-SREV, EXEC-SB, EXEC-COPY) so they all see the same
// LOCKED canonical descriptions of characters, locations, styles, world.
//
// Why a shared loader: episode-references.ts, continuity-check.ts, and
// style-check.ts each fetched SBL-* directly. The text-producing runners
// did NOT — they looked for legacy `BIB-*` rows in upstream_assets and
// always missed Bible. Result: storyboards described characters from
// thin air, ignoring LOCKED canon.
//
// Contract:
//   - Returns whatever LOCKED Bible exists for the series. Empty arrays are
//     valid (early-stage projects without Bible — runners fall back to MVP).
//   - No truncation. Full description + content are returned as stored. The
//     Director's call: quality > token cost. Sonnet 4.6 has 200K context;
//     a full Bible (~10-15K) fits comfortably.
//   - Never throws on missing series — returns empty canon. Runners decide
//     whether to escalate.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/types.gen';
import { bibleSlug, seriesIdForEpisode } from '../api/series-bible';
import { loadEpisodeCastSlugs, scopeToCast } from './episode-cast';

export interface BibleEntry {
  /** Bible-canonical slug (e.g. "sandy_hourglass"). Empty for general_idea. */
  slug: string;
  file_type: string;
  filename: string;
  /** Long-form prose description. Primary canon for characters/locations/styles. */
  description: string;
  /** Free-text body (used by general_idea). May be empty for image-bearing entries. */
  content: string;
  drive_web_view_url: string | null;
}

export interface SeriesBibleCanon {
  series_id: string | null;
  general_idea: BibleEntry | null;
  characters: BibleEntry[];
  locations: BibleEntry[];
  styles: BibleEntry[];
  /**
   * SBL-object_* canon (props that compose ONTO clean locations — e.g. an
   * elevator button cluster on a clean cab wall). 2026-06-13: previously the
   * generation-side loader dropped objects entirely (only WCHK saw them), so
   * the Storyboarder + EREF Designer never knew interactive props existed →
   * the Director's "clean wall + object" canon-split rendered as bare walls.
   * Now surfaced to every text agent that reads the Bible. Optional so the
   * many existing empty-canon fallback literals across runners/tests stay
   * valid without churn — the loader always populates it.
   */
  objects?: BibleEntry[];
  /** Total entries — quick "is the Bible empty?" predicate for runners. */
  total_entries: number;
}

interface BibleAssetRow {
  filename: string;
  description: string | null;
  content: string | null;
  status: string;
  file_type: string;
  drive_web_view_url: string | null;
}

function toEntry(row: BibleAssetRow): BibleEntry {
  return {
    slug: bibleSlug(row.file_type) ?? '',
    file_type: row.file_type,
    filename: row.filename,
    description: row.description ?? '',
    content: row.content ?? '',
    drive_web_view_url: row.drive_web_view_url ?? null,
  };
}

/**
 * Load the LOCKED Series Bible canon for the given episode.
 *
 * Resolves series via `seriesIdForEpisode` (handles UUID, code-as-string, and
 * episode-code-prefix legacy fallbacks). Filters strictly to `status = LOCKED`
 * — DRAFT/REVIEW Bible entries are excluded by design: agents produce content
 * that will become canon, so they must consume only canon that is sealed.
 *
 * Empty canon is a valid result. Runners may either degrade to MVP "no Bible"
 * mode or escalate to gate failure based on their own preconditions.
 */
export async function loadSeriesBibleCanon(
  supabase: SupabaseClient<Database>,
  episodeId: string,
): Promise<SeriesBibleCanon> {
  const seriesId = await seriesIdForEpisode(supabase, episodeId);
  if (!seriesId) {
    return {
      series_id: null,
      general_idea: null,
      characters: [],
      locations: [],
      styles: [],
      objects: [],
      total_entries: 0,
    };
  }

  const { data, error } = await supabase
    .from('assets')
    .select('filename,description,content,status,file_type,drive_web_view_url')
    .eq('series_id', seriesId)
    .eq('status', 'LOCKED')
    .like('file_type', 'SBL-%');
  if (error) {
    throw new Error(`loadSeriesBibleCanon: ${error.message}`);
  }

  const rows = (data ?? []) as BibleAssetRow[];
  const generalIdeaRow = rows.find((r) => r.file_type === 'SBL-general_idea');

  // Episode casting (2026-06-14): scope the *actors* (characters / objects /
  // locations) to the episode's cast gallery so canon the episode was not cast
  // for never bleeds into its prompts. Styles + general_idea are series-wide and
  // stay unscoped. `cast === null` → no gallery → all-series canon (unchanged).
  const cast = await loadEpisodeCastSlugs(supabase, episodeId);
  const slugOfEntry = (e: BibleEntry) => e.slug;

  const characters = scopeToCast(
    rows.filter((r) => r.file_type.startsWith('SBL-character_')).map(toEntry),
    cast,
    slugOfEntry,
  );
  const locations = scopeToCast(
    rows.filter((r) => r.file_type.startsWith('SBL-location_')).map(toEntry),
    cast,
    slugOfEntry,
  );
  const styles = rows
    .filter((r) => r.file_type.startsWith('SBL-style_'))
    .map(toEntry);
  const objects = scopeToCast(
    rows.filter((r) => r.file_type.startsWith('SBL-object_')).map(toEntry),
    cast,
    slugOfEntry,
  );

  return {
    series_id: seriesId,
    general_idea: generalIdeaRow ? toEntry(generalIdeaRow) : null,
    characters,
    locations,
    styles,
    objects,
    total_entries:
      (generalIdeaRow ? 1 : 0) +
      characters.length +
      locations.length +
      styles.length +
      objects.length,
  };
}

/**
 * Format the canon as a markdown block for inclusion in a runner's user
 * message. Returns empty string if Bible is empty — caller decides what to do.
 *
 * No truncation: full descriptions and content are emitted as stored. The
 * Director's directive: at this stage, quality > token cost.
 */
export function formatBibleForPrompt(canon: SeriesBibleCanon): string {
  if (canon.total_entries === 0 && !canon.general_idea) return '';

  const lines: string[] = [];
  lines.push('## Series Bible canon (LOCKED — must follow exactly)');
  lines.push('');
  lines.push(
    'These descriptions are the single source of truth for the series. ' +
      'Use the **slug names** below verbatim when referencing characters, ' +
      'locations, or objects in your output. Do not invent new characters, ' +
      'locations, or objects. Do not contradict the visual / behavioural specs below. ' +
      'OBJECTS are interactive props that COMPOSE onto a location (e.g. a button ' +
      'cluster placed on a clean cab wall) — when a shot uses an object, name its ' +
      'slug so the reference stage composites the canon prop, not an invented one.',
  );
  lines.push('');

  if (canon.general_idea) {
    lines.push('### General idea');
    lines.push('');
    lines.push(canon.general_idea.content || canon.general_idea.description);
    lines.push('');
  }

  if (canon.characters.length > 0) {
    lines.push('### Characters');
    lines.push('');
    for (const c of canon.characters) {
      lines.push(`#### ${c.slug}`);
      lines.push('');
      if (c.description) {
        lines.push(c.description);
        lines.push('');
      }
      if (c.content && c.content !== c.description) {
        lines.push(c.content);
        lines.push('');
      }
    }
  }

  if (canon.locations.length > 0) {
    lines.push('### Locations');
    lines.push('');
    for (const l of canon.locations) {
      lines.push(`#### ${l.slug}`);
      lines.push('');
      if (l.description) {
        lines.push(l.description);
        lines.push('');
      }
      if (l.content && l.content !== l.description) {
        lines.push(l.content);
        lines.push('');
      }
    }
  }

  const objects = canon.objects ?? [];
  if (objects.length > 0) {
    lines.push('### Objects / Props (compose onto locations — reference by slug)');
    lines.push('');
    for (const o of objects) {
      lines.push(`#### ${o.slug}`);
      lines.push('');
      if (o.description) {
        lines.push(o.description);
        lines.push('');
      }
      if (o.content && o.content !== o.description) {
        lines.push(o.content);
        lines.push('');
      }
    }
  }

  if (canon.styles.length > 0) {
    lines.push('### Style direction');
    lines.push('');
    for (const s of canon.styles) {
      lines.push(`#### ${s.slug}`);
      lines.push('');
      if (s.description) {
        lines.push(s.description);
        lines.push('');
      }
      if (s.content && s.content !== s.description) {
        lines.push(s.content);
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}
