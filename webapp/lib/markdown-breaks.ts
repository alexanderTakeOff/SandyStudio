// ──────────────────────────────────────────────────────────────────────────────
// lib/markdown-breaks.ts
//
// CommonMark spec collapses single newlines inside a paragraph into a space,
// which makes voice-dictated / human-edited content read as one wall of text.
// Adding `  ` (two trailing spaces) before each `\n` turns it into a hard
// line break in the same paragraph — what most users expect.
//
// Used in:
//   - ConciergePanel.tsx (Prod Assistant replies)
//   - EpisodeAssetDrawer.tsx (asset content preview)
//   - AssetPreview.tsx (Inbox preview)
//
// Avoids the need to install `remark-breaks` and keeps the markdown
// transformation purely client-side.
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Insert two-space hard breaks before each newline so single `\n` renders
 * as a `<br>` in CommonMark-compliant markdown. Leaves existing double
 * newlines (paragraph separators) alone, and preserves fenced code blocks
 * verbatim so indented / multi-line code doesn't break.
 */
export function withHardBreaks(input: string | null | undefined): string {
  if (!input) return '';
  // Split on fenced code blocks so we don't touch their content.
  const parts = input.split(/(```[\s\S]*?```)/g);
  return parts
    .map((part) => {
      if (part.startsWith('```')) return part;
      // Don't add breaks before a newline that's already followed by
      // another newline (paragraph break) — only "lonely" line breaks.
      return part.replace(/([^\n])\n(?!\n)/g, '$1  \n');
    })
    .join('');
}
