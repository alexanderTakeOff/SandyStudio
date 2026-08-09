// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/episode-cast.ts
// The Episode Cast Gallery — the process artifact that answers "who/what is in
// THIS episode?". An episode-scoped `SPC-episode_cast` asset selects a subset of
// the series library (characters / objects / locations by Bible slug) that may
// appear in the episode. Every reference-side loader scopes the series canon to
// this cast, so an actor the episode was NOT cast for (e.g. the anvil, the
// vanity mirror) can never bleed into its frames.
//
// SSOT: the locked cast gallery IS the authority. `metadata.appears_in` on each
// canon asset is a *projection* of it for cross-checking — never hand-edited,
// never read here.
//
// Non-breaking by design: an episode with no APPROVED/LOCKED cast gallery
// returns `null` → loaders fall back to all-series-canon (the pre-2026-06-14
// behaviour). The gallery is opt-in per episode.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/types.gen';
import { bibleSlug, seriesIdForEpisode } from '../api/series-bible';

/** file_type of the episode cast gallery artifact. */
export const EPISODE_CAST_FILE_TYPE = 'SPC-episode_cast';

/**
 * Parse the selected canon slugs from a cast gallery asset.
 *
 * Accepts, in priority order:
 *   1. `metadata.cast` — an array of slug strings, or of `{ slug }` objects.
 *   2. A fenced ```json block in `content` shaped `{ "cast": [ ... ] }`
 *      (same string-or-object element shape).
 *
 * Returns lowercased, de-duplicated, non-empty slugs. Empty array means "no
 * parseable cast" — callers treat that as unscoped (null), not "empty cast".
 */
export function parseCastSlugs(
  content: string | null | undefined,
  metadata: unknown,
): string[] {
  const fromArray = (arr: unknown): string[] => {
    if (!Array.isArray(arr)) return [];
    const out: string[] = [];
    for (const el of arr) {
      if (typeof el === 'string') {
        out.push(el);
      } else if (el && typeof el === 'object' && typeof (el as { slug?: unknown }).slug === 'string') {
        out.push((el as { slug: string }).slug);
      }
    }
    return out;
  };

  // 1. metadata.cast
  const metaCast =
    metadata && typeof metadata === 'object'
      ? (metadata as { cast?: unknown }).cast
      : undefined;
  let slugs = fromArray(metaCast);

  // 2. fenced JSON in content
  if (slugs.length === 0 && content) {
    const matches = [...content.matchAll(/```json\s*([\s\S]+?)```/g)];
    for (let i = matches.length - 1; i >= 0 && slugs.length === 0; i--) {
      const block = matches[i]?.[1];
      if (!block) continue;
      try {
        const parsed = JSON.parse(block.trim()) as { cast?: unknown };
        slugs = fromArray(parsed.cast);
      } catch {
        // ignore malformed block, try the next one
      }
    }
  }

  const seen = new Set<string>();
  const result: string[] = [];
  for (const s of slugs) {
    const norm = s.trim().toLowerCase();
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      result.push(norm);
    }
  }
  return result;
}

/**
 * Гейт перехода `SPC-episode_cast` → REVIEW/APPROVED/LOCKED (2026-08-09).
 *
 * `parseCastSlugs` выше — ЕДИНСТВЕННЫЙ читатель каста: по нему `loadEpisodeCast`
 * решает, чем скоупить эпизод. Не распознал ничего — эпизод молча идёт на ВСЁМ
 * каноне серии (`loadEpisodeCast` вернёт null, и загрузчики честно откатятся к
 * старому поведению). Молча — вот в чём беда: каст лежит, выглядит проведённым,
 * а работает так, будто его нет.
 *
 * Живой случай SS-S20-E04: ум написал каст красивой markdown-таблицей с настоящим
 * рассуждением (какой канон цеплять до кадра-поворота, какой после), но ни
 * `metadata.cast`, ни fenced json там не было — у неё отняли `castEpisode`, а
 * `write-asset` принимает любой текст и о форме не знает. Отказ на границе — то же
 * лекарство, что D76/D84 для раскадровки: студия сама не пускает изделие, которое
 * не сможет прочитать, и называет, чего не хватает.
 *
 * DRAFT не гейтится: черновик волен быть прозой, пока его пишут.
 */
export function assertCastApprovable(
  fileType: string,
  status: string | null | undefined,
  content: string | null | undefined,
  metadata: unknown,
): void {
  if (fileType !== EPISODE_CAST_FILE_TYPE) return;
  if (status !== 'REVIEW' && status !== 'APPROVED' && status !== 'LOCKED') return;
  if (parseCastSlugs(content, metadata).length > 0) return;
  throw new Error(
    `${fileType}: нельзя перевести в ${status} без машиночитаемого списка канона. ` +
      'Скоуп эпизода читается ТОЛЬКО из `metadata.cast` или fenced ```json блока ' +
      '{"cast":["character_bathyscaphe_turnaround","style_s20_style_canon_v1"]} — ' +
      'таблица в тексте машине не видна, и эпизод молча пойдёт на ВСЁМ каноне серии. ' +
      'Штатный путь — инструмент castEpisode: он ставит форму и проверяет, что канон существует.',
  );
}

/**
 * Load the locked-or-approved cast slug set for an episode.
 *
 * Returns a lowercase `Set` of Bible slugs, or `null` when the episode has no
 * usable cast gallery (no asset, or one that parses to zero slugs). `null` is
 * the explicit "do not scope — fall back to all series canon" signal so the
 * feature is non-breaking for episodes predating the gallery.
 */
export async function loadEpisodeCastSlugs(
  supabase: SupabaseClient<Database>,
  episodeId: string,
): Promise<Set<string> | null> {
  const { data, error } = await supabase
    .from('assets')
    .select('content,metadata,status,created_at')
    .eq('episode_id', episodeId)
    .eq('file_type', EPISODE_CAST_FILE_TYPE)
    .in('status', ['APPROVED', 'LOCKED'])
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) {
    throw new Error(`loadEpisodeCastSlugs: ${error.message}`);
  }
  const row = (data ?? [])[0] as
    | { content: string | null; metadata: unknown }
    | undefined;
  if (!row) return null;

  const slugs = parseCastSlugs(row.content, row.metadata);
  return slugs.length > 0 ? new Set(slugs) : null;
}

/**
 * Filter a list of canon entries to the episode cast.
 *
 * `slugOf` extracts the Bible slug from each entry (e.g. `bibleSlug(file_type)`).
 * When `cast` is `null` the list is returned unchanged (unscoped fallback).
 */
export function scopeToCast<T>(
  entries: readonly T[],
  cast: Set<string> | null,
  slugOf: (entry: T) => string | null | undefined,
): T[] {
  if (!cast) return [...entries];
  return entries.filter((e) => {
    const slug = slugOf(e);
    return slug != null && cast.has(slug.toLowerCase());
  });
}

/**
 * Project the cast gallery onto `metadata.appears_in` of the series' SBL canon.
 *
 * The locked gallery is the authority; `appears_in` is a denormalized
 * cross-check ("which episodes is this asset cast into?") for Director review and
 * future query. Idempotent: recomputed from the gallery on every approve/lock —
 * adds `episodeCode` to assets now in the cast, removes it from assets dropped
 * from the cast. Only rows whose `appears_in` actually changes are written.
 *
 * Fails soft per row is NOT desired here — any write error throws so the caller
 * surfaces the projection drift rather than silently leaving it stale.
 */
export async function syncAppearsIn(
  supabase: SupabaseClient<Database>,
  episodeId: string,
  episodeCode: string,
): Promise<{ added: number; removed: number }> {
  const seriesId = await seriesIdForEpisode(supabase, episodeId);
  if (!seriesId) return { added: 0, removed: 0 };

  const cast = await loadEpisodeCastSlugs(supabase, episodeId);

  const { data, error } = await supabase
    .from('assets')
    .select('id,file_type,metadata')
    .eq('series_id', seriesId)
    .like('file_type', 'SBL-%');
  if (error) throw new Error(`syncAppearsIn fetch: ${error.message}`);

  let added = 0;
  let removed = 0;
  for (const row of (data ?? []) as Array<{
    id: string;
    file_type: string;
    metadata: unknown;
  }>) {
    const slug = bibleSlug(row.file_type);
    const inCast = slug != null && cast != null && cast.has(slug.toLowerCase());

    const meta = (row.metadata as Record<string, unknown> | null) ?? {};
    const prior = Array.isArray((meta as { appears_in?: unknown }).appears_in)
      ? ((meta as { appears_in: unknown[] }).appears_in.filter(
          (x): x is string => typeof x === 'string',
        ) as string[])
      : [];
    const priorSet = new Set(prior);
    const hadIt = priorSet.has(episodeCode);

    if (inCast && !hadIt) {
      priorSet.add(episodeCode);
      added++;
    } else if (!inCast && hadIt) {
      priorSet.delete(episodeCode);
      removed++;
    } else {
      continue; // no change for this row
    }

    const nextAppearsIn = [...priorSet].sort();
    const nextMeta = { ...meta, appears_in: nextAppearsIn };
    const { error: upErr } = await supabase
      .from('assets')
      .update({ metadata: nextMeta as unknown as Record<string, unknown> } as never)
      .eq('id', row.id);
    if (upErr) throw new Error(`syncAppearsIn update ${row.id}: ${upErr.message}`);
  }

  return { added, removed };
}
