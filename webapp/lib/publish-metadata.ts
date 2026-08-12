// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/publish-metadata.ts
// Parse EXEC-COPY's SPC-metadata markdown into clean YouTube fields.
//
// EXEC-COPY output is NOT uniform across episodes: headers vary ("## Title",
// "## Title (Primary)", "## Title (3 variants — director selects)") and bodies
// list labelled options ("**Option 1 (Primary):** …", "**Variant A (…):**\n<title>").
// A naive exact-header + first-line parser produced empty or markdown-polluted
// titles (E12/E13 empty → YouTube 400; E14 → "**Option 1:** …"). This robust
// parser is the ONE shared implementation used by both the EXEC-PUB runner and
// the distribution polish script.
// ──────────────────────────────────────────────────────────────────────────────

export interface PublishMetadata {
  title: string;
  description: string;
  tags: string[];
}

/** Body of the first `## <name>…` section — header PREFIX match so
 *  "## Title (Primary)" / "## Title (3 variants…)" all resolve — up to next `##`. */
function sectionBody(md: string, name: string): string {
  const out: string[] = [];
  let capturing = false;
  for (const line of md.split(/\r?\n/)) {
    const h = line.match(/^##\s*(.+?)\s*$/);
    if (h) {
      if (capturing) break; // next header ends the section
      if (h[1].toLowerCase().startsWith(name.toLowerCase())) capturing = true;
      continue;
    }
    if (capturing) out.push(line);
  }
  return out.join('\n').trim();
}

/** Strip markdown emphasis + a leading "Option N (…):" / "Variant X (…):" /
 *  "Primary:" label from a candidate title line. */
function cleanTitleLine(raw: string): string {
  let s = raw.replace(/[*_`]/g, '').trim();
  s = s.replace(/^[-•]\s*/, '');
  s = s.replace(/^(option\s*\d+|variant\s*(?:\d+|[a-z])|primary|short|casual|main)\b[^:]*:\s*/i, '').trim();
  s = s.replace(/\s*\([^)]*(?:chars|≤|<=)[^)]*\)\s*$/i, '').trim(); // drop "(≤70: 68 chars)" author annotation
  s = s.replace(/^["“”']+\s*/, '').replace(/\s*["“”']+$/, '').trim(); // drop surrounding quotes
  return s;
}

/** First usable title from a Title section that may list several labelled
 *  options/variants. Returns '' if none found. */
function extractTitle(md: string): string {
  const body = sectionBody(md, 'title');
  for (const line of body.split(/\r?\n/)) {
    const s = cleanTitleLine(line);
    if (s.length > 3) return s.slice(0, 100);
  }
  return '';
}

/** Description section minus a leading bold label line, bold markers stripped. */
function cleanDescription(md: string): string {
  const body = sectionBody(md, 'description');
  return body
    .split(/\r?\n/)
    .filter((l, i) => !(i === 0 && /^\s*\*\*[^*]+\*\*\s*$/.test(l)))
    .join('\n')
    .replace(/\*\*/g, '')
    .trim();
}

export function parseVideoMetadata(md: string, fallbackTitle?: string): PublishMetadata {
  const title = (extractTitle(md) || fallbackTitle || '').slice(0, 100);
  const description = cleanDescription(md);
  const tagsRaw = sectionBody(md, 'tags');
  const tags = tagsRaw
    ? tagsRaw.split(/[,\n]/).map((t) => t.replace(/^[-*•#\s]+/, '').trim()).filter(Boolean).slice(0, 30)
    : [];
  return { title, description, tags };
}
