// ──────────────────────────────────────────────────────────────────────────────
// lib/concierge/doc-toc.ts
// "Полина должна знать структуру приложения" (Director, 2026-06-23): a big
// document needs a table of contents. Bible sections (esp. general_idea) run to
// tens of KB and listSeriesBibles strips their body to protect the context
// window — so Polina saw only `content_chars` and never knew the SS-S15
// general_idea hides a "§34 Реестр сюжетов (Seed Bank)" with the episode themes.
// She announced "I'll open the Bible" for half an hour without finding it.
//
// headingToc extracts the markdown heading outline so the listing can hand her a
// cheap structural map: she sees the section exists and reads straight to it.
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Extract a compact table of contents from markdown `#` headings.
 *
 * Returns one entry per heading, prefixed by its depth so nesting reads at a
 * glance (e.g. "34. Реестр сюжетов: Сезон 1 (Seed Bank)"). Cheap to ship in a
 * tool result — only the titles, never the body. Pure function.
 *
 * @param markdown source document
 * @param maxEntries safety cap so a pathological doc can't flood the context
 */
export function headingToc(
  markdown: string | null | undefined,
  maxEntries = 60,
): string[] {
  if (!markdown || typeof markdown !== 'string') return [];
  const out: string[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    const m = /^(#{1,4})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    const depth = m[1].length;
    const title = m[2].trim();
    if (!title) continue;
    out.push(`${'  '.repeat(depth - 1)}${title}`);
    if (out.length >= maxEntries) break;
  }
  return out;
}
