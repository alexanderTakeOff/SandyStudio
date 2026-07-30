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
import type { ReferenceUsed } from './shot-reference';

export type SbSection =
  | 'general_idea'
  | 'character'
  | 'location'
  | 'object'
  | 'style'
  | 'audio'
  | 'video';

export const BIBLE_SECTIONS: ReadonlyArray<SbSection> = [
  'general_idea',
  'character',
  'location',
  'object',
  'style',
  'audio',
  'video',
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
  video: 'Brand video',
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

// ── The render brief: what the IMAGE MODEL reads, split from what HUMANS read ─
//
// A Bible entry has two readers and until 2026-07-30 they shared one field. The
// image prompt was built as `content.slice(0, 2400)`, so canon ids, version
// numbers, role labels and production reasoning were all handed to gpt-image-2
// as things to render. The Director's example: «a panel parked in a corner
// vanishes in the vertical crop» — to a renderer that is neither a subject nor
// a constraint, yet the model must do something with it. What it did, twice in
// one hour, was render a generic portrait of the subject instead of the frame
// the canon called for.
//
// Two rules, both his: no surplus information, and what must NOT appear is not
// described in prose — it goes to the dedicated negative channel, which already
// exists (`MultiImageGenInput.negative`, folded by openai-edits-multi into one
// closing clause because hard negatives up front starve the positive prompt).
//
// Back-compatible by construction: an entry with no `## RENDER` section yields
// null and every caller falls back to today's behaviour byte for byte. The ~50
// LOCKED entries of SS-S15 are neither migrated nor at risk.

/** Model-facing half of a Bible entry. */
export interface RenderBrief {
  /** Drawable description — positive only, no rationale. */
  render: string;
  /** Terms that must not appear; fed to the provider's `negative` channel. */
  negative: string[];
  /**
   * Canon slugs this entry must agree with, declared by its author on a
   * `Refs:` line. Empty means "style anchor only" — see loadSeriesCanonRefs.
   */
  refSlugs: string[];
}

/** ASCII-only headings, mandated by the author's system prompt so parsing stays exact. */
const RENDER_HEADING_RE = /^#{1,6}[ \t]*RENDER[ \t]*$/m;
const NEGATIVE_HEADING_RE = /^#{1,6}[ \t]*NEGATIVE[ \t]*$/m;
const NEXT_HEADING_RE = /^#{1,6}[ \t]+\S/m;
/**
 * `Refs: slug_a, slug_b` — one line inside the RENDER block.
 *
 * Tolerant of the markdown the author actually produces: the line may be
 * wrapped in backticks, bolded, or bulleted. The first entry to declare a
 * reference wrote `` `Refs: bathyscaphe_turnaround` `` and a strict
 * start-of-line match silently found nothing — so the hero was never attached
 * and the frame drew blind. Parse what authors write, not what they should.
 */
const REFS_LINE_RE = /^[ \t>*\-`_]*\**\s*Refs:\s*([^\n`]+)/im;

/** Body between a heading and the next heading (or end of document). */
function sectionBody(content: string, headingRe: RegExp): string | null {
  const m = headingRe.exec(content);
  if (!m || m.index === undefined) return null;
  const after = content.slice(m.index + m[0].length);
  const next = NEXT_HEADING_RE.exec(after);
  const body = (next && next.index !== undefined ? after.slice(0, next.index) : after).trim();
  return body.length > 0 ? body : null;
}

/** Strip list bullets and blank entries from a markdown list body. */
function bulletList(body: string): string[] {
  const lines = body
    .split('\n')
    .map((l) => l.replace(/^[ \t]*[-*•][ \t]*/, '').trim())
    .filter((l) => l.length > 0 && !/^#{1,6}[ \t]/.test(l));
  if (lines.length > 1) return lines;
  // Single line — the author may have used separators instead of bullets.
  return (lines[0] ?? body)
    .split(/[;·,]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Extract the model-facing brief from a Bible entry's markdown body.
 *
 * Returns null when the entry has no `## RENDER` section — callers MUST then
 * fall back to their previous behaviour rather than sending an empty prompt.
 */
export function parseRenderBrief(content: string | null | undefined): RenderBrief | null {
  const text = (content ?? '').trim();
  if (!text) return null;

  const renderBody = sectionBody(text, RENDER_HEADING_RE);
  if (!renderBody) return null;

  const refsMatch = REFS_LINE_RE.exec(renderBody);
  const refSlugs = refsMatch
    ? refsMatch[1]
        .split(/[,;]/)
        // Strip whatever markdown clung to the token — `**Refs:** hero` leaves
        // the asterisks glued to the first slug otherwise.
        .map((s) => s.trim().toLowerCase().replace(/^[^a-z0-9_]+|[^a-z0-9_]+$/g, ''))
        .filter(Boolean)
    : [];

  // The Refs line is metadata, not something to draw — keep it out of the prompt.
  const render = renderBody.replace(REFS_LINE_RE, '').trim();
  if (!render) return null;

  const negativeBody = sectionBody(text, NEGATIVE_HEADING_RE);
  return { render, negative: negativeBody ? bulletList(negativeBody) : [], refSlugs };
}

// ── Asset metadata schema (assets.metadata jsonb, migration 0020) ─────────────
//
// We persist three structured side-documents inside the single JSONB column,
// so we don't add new columns for every editorial concern.

/** Governance mode at the moment of action. Future EXEC-ORCH reads this for audit. */
export type GovernanceModeNum = 1 | 2 | 3;

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

  // ── Audit of the generation itself (2026-07-30) ────────────────────────────
  // Until now a Bible history row recorded the prompt and the cost and nothing
  // about the mechanism, so the question «did the model actually see the hero
  // reference?» could not be answered after the fact — it had to be re-derived
  // by calling the loader by hand. Both write sites already computed these
  // values and threw them away; the v2 shot path has carried them for months
  // (GenerationAttempt in lib/api/shot-reference.ts). All optional: existing
  // rows stay valid, no migration.

  /** Which provider actually ran — multi-reference branch or plain text-to-image. */
  provider_id?: string;
  /** Model id reported by that provider. */
  model?: string;
  /** Canon images actually attached. Same shape as the shot path — no second form. */
  references_used?: ReferenceUsed[];
  /**
   * Canon images that were meant to ride along and did not. The load-bearing
   * one: a reference whose bytes fail to load is skipped silently, which makes
   * «there was no hero reference» indistinguishable from «there was one and it
   * was unreachable» — precisely the question this audit exists to answer.
   */
  references_dropped?: Array<{ bible_asset_id: string; kind: string; reason: string }>;
  /** Negative terms actually folded in, so a later reader can tell a prohibition was in force. */
  negative?: string[];
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
  modeAtTime?: GovernanceModeNum;
  at?: string;
}): AssetProvenance {
  return {
    created_by: args.by,
    created_by_kind: args.byKind,
    created_at: args.at ?? new Date().toISOString(),
    source: args.source,
    ...(args.modeAtTime !== undefined ? { mode_at_time: args.modeAtTime } : {}),
  };
}

/** Stamp a last-modified marker onto an existing provenance (immutable copy). */
export function stampLastModified(
  prov: AssetProvenance,
  by: string,
  byKind: 'agent' | 'director' | 'system',
  at?: string,
  modeAtTime?: GovernanceModeNum,
): AssetProvenance {
  return {
    ...prov,
    last_modified_by: by,
    last_modified_by_kind: byKind,
    last_modified_at: at ?? new Date().toISOString(),
    ...(modeAtTime !== undefined ? { last_modified_mode: modeAtTime } : {}),
  };
}

/** Build the canonical filename for a new Bible asset. */
export function bibleFilename(args: {
  seriesCode: string;          // e.g. "SS-S03"
  section: SbSection;
  slug: string;                // e.g. "sandy" → SBL-character_sandy
  version: number;
  ext: 'md' | 'png' | 'mp3' | 'wav' | 'mp4';
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
    general_idea: 0, character: 0, location: 0, object: 0, style: 0, audio: 0, video: 0,
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
 * Since migration 0038 `episodes.series_id` is a uuid FK — the historical
 * code-string fallback ("SS-S09" stored instead of the UUID) is gone.
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
    .select('series_id')
    .eq('id', episodeId);
  if (error) {
    throw new Error(`seriesIdForEpisode: ${error.message}`);
  }
  const row = (data ?? [])[0] as { series_id?: string | null } | undefined;
  const raw = row?.series_id;
  return typeof raw === 'string' && UUID_RE.test(raw) ? raw : null;
}

/**
 * Look up the parent series genre for an episode.
 * Reuses seriesIdForEpisode() for the code→UUID resolution so the
 * code-vs-UUID bug (episodes.series_id stores CODE "SS-S15" not UUID)
 * that caused GAGAD to never fire is fixed at one source.
 * Returns null if the series is not found or on any error (mock-safe).
 */
export async function genreForEpisode(
  supabase: SupabaseClient<Database>,
  episodeId: string,
): Promise<string | null> {
  try {
    const seriesUuid = await seriesIdForEpisode(supabase, episodeId);
    if (!seriesUuid) return null;
    const result = await supabase
      .from('series')
      .select('genre')
      .eq('id', seriesUuid)
      .maybeSingle();
    return (result.data as { genre?: string | null } | null)?.genre ?? null;
  } catch {
    return null;
  }
}

/**
 * Canon-existence preflight (ART-AD stage C0 — 2026-06-14).
 *
 * Given a list of required canon slugs (characters / locations / objects the
 * episode wants to use), verify each has a LOCKED `SBL-*` asset in the series.
 * Returns the missing slugs so the caller can HALT and either create the canon
 * (loop into the Library stage) or have the Director rule the element out.
 *
 * Root fix for the E09 phantom-location class: the pipeline used to proceed on a
 * script/storyboard slug with no canon, producing references the artist invented.
 * `missing` is lowercased-deduped; comparison is case-insensitive.
 *
 * `seriesId` must be the series UUID (resolve via seriesIdForEpisode first).
 */
export async function validateCanonExists(
  supabase: SupabaseClient<Database>,
  seriesId: string,
  requiredSlugs: readonly string[],
): Promise<{ ok: boolean; missing: string[] }> {
  const want = [...new Set(requiredSlugs.map((s) => s.trim().toLowerCase()).filter(Boolean))];
  if (want.length === 0) return { ok: true, missing: [] };

  const { data, error } = await supabase
    .from('assets')
    .select('file_type')
    .eq('series_id', seriesId)
    .eq('status', 'LOCKED')
    .like('file_type', 'SBL-%');
  if (error) throw new Error(`validateCanonExists: ${error.message}`);

  const have = new Set<string>();
  for (const row of (data ?? []) as Array<{ file_type: string }>) {
    const slug = bibleSlug(row.file_type);
    if (slug) have.add(slug.toLowerCase());
  }

  const missing = want.filter((s) => !have.has(s));
  return { ok: missing.length === 0, missing };
}
