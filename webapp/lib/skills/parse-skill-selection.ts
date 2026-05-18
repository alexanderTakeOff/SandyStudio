// ──────────────────────────────────────────────────────────────────────────────
// lib/skills/parse-skill-selection.ts
// Tolerant parser for the Step 1 LLM reply during two-step agent runs.
//
// We instruct the model to reply with `{"activated_skills":[...]}` and no
// prose, but real LLM completions wrap JSON in markdown fences, add
// commentary, or split objects across keys. This parser:
//
//   1. Strips ``` fences if present.
//   2. Locates the first balanced `{...}` object in the text.
//   3. Attempts JSON.parse — falls back to a regex extractor on the
//      `activated_skills` array if JSON.parse fails (handles trailing
//      commas, comments, unquoted keys).
//   4. Filters returned strings to slug-shaped values only.
//
// Returns `{ slugs, source, error? }`. Caller logs `source` for telemetry
// (json | regex | empty) and `error` when the model produced something
// unrecoverable.
// ──────────────────────────────────────────────────────────────────────────────

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,79}[a-z0-9]$/;
const ACTIVATED_KEY_RE = /["']?activated_skills["']?\s*:\s*\[([\s\S]*?)\]/;
const QUOTED_STRING_RE = /["']([^"']+)["']/g;

export type SkillSelectionSource = 'json' | 'regex' | 'empty';

export interface SkillSelectionResult {
  slugs: string[];
  source: SkillSelectionSource;
  error?: string;
}

function stripFences(raw: string): string {
  return raw
    .replace(/^```(?:json|JSON)?\s*\n?/gm, '')
    .replace(/\n?```\s*$/gm, '')
    .trim();
}

function extractFirstObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function filterSlugs(values: unknown[]): string[] {
  const out: string[] = [];
  for (const v of values) {
    if (typeof v !== 'string') continue;
    const trimmed = v.trim();
    if (SLUG_RE.test(trimmed)) out.push(trimmed);
  }
  return out;
}

function tryJsonParse(text: string): string[] | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const activated = (parsed as Record<string, unknown>)['activated_skills'];
    if (!Array.isArray(activated)) return null;
    return filterSlugs(activated);
  } catch {
    return null;
  }
}

function tryRegex(text: string): string[] | null {
  const match = ACTIVATED_KEY_RE.exec(text);
  if (!match) return null;
  const arrayBody = match[1] ?? '';
  const slugs: string[] = [];
  let m: RegExpExecArray | null;
  QUOTED_STRING_RE.lastIndex = 0;
  while ((m = QUOTED_STRING_RE.exec(arrayBody)) !== null) {
    const slug = (m[1] ?? '').trim();
    if (SLUG_RE.test(slug)) slugs.push(slug);
  }
  return slugs;
}

/**
 * Parse an LLM's Step-1 skill-selection reply. Always returns a result
 * object — never throws. Empty `slugs` is a valid outcome (the agent
 * decided no skills apply).
 */
export function parseSkillSelection(raw: string): SkillSelectionResult {
  if (!raw || raw.trim().length === 0) {
    return { slugs: [], source: 'empty' };
  }

  const fenceless = stripFences(raw);
  const objectText = extractFirstObject(fenceless) ?? fenceless;

  const fromJson = tryJsonParse(objectText);
  if (fromJson) {
    return { slugs: dedupe(fromJson), source: 'json' };
  }

  const fromRegex = tryRegex(fenceless);
  if (fromRegex) {
    return {
      slugs: dedupe(fromRegex),
      source: 'regex',
      error: 'JSON.parse failed; recovered via regex extractor',
    };
  }

  return {
    slugs: [],
    source: 'empty',
    error: 'No activated_skills array found in LLM reply',
  };
}

function dedupe(arr: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of arr) {
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}
