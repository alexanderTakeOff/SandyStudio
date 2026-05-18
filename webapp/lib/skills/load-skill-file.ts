// ──────────────────────────────────────────────────────────────────────────────
// lib/skills/load-skill-file.ts
// Hand-rolled SKILL.md frontmatter parser. Repo has no YAML dep — and the
// frontmatter contract we need is narrow enough (flat scalars + one nested
// `applies_when` object whose leaves are string arrays) that a small parser
// stays cheaper than a transitive gray-matter dependency.
//
// Sprint σ.1 (2026-05-15). Used by selectSkills() to scan .claude/skills.
// ──────────────────────────────────────────────────────────────────────────────

import { promises as fs } from 'node:fs';
import path from 'node:path';

export type SkillStatus = 'ACTIVE' | 'DRAFT' | 'DEPRECATED';

export interface AppliesWhen {
  agent?: readonly string[];
  genre?: readonly string[];
  series_id?: readonly string[];
  episode_id?: readonly string[];
  gate?: readonly string[];
  file_type?: readonly string[];
}

export interface SkillFrontmatter {
  name: string;
  description: string;
  status: SkillStatus;
  owner?: string;
  applies_when?: AppliesWhen;
  hard: boolean;
  created?: string;
}

export interface LoadedSkill {
  slug: string;
  filePath: string;
  frontmatter: SkillFrontmatter;
  body: string;
}

/**
 * Lightweight skill metadata — no body. Used by manifest scanning so the
 * caller can list available capabilities for an agent without loading body
 * text into context. The body is loaded on-demand via `loadSkillFile`.
 */
export interface SkillManifest {
  slug: string;
  filePath: string;
  frontmatter: SkillFrontmatter;
  bodyChars: number;
}

export class SkillParseError extends Error {
  constructor(message: string, public readonly filePath: string) {
    super(`${message} (in ${filePath})`);
    this.name = 'SkillParseError';
  }
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
const INLINE_ARRAY_RE = /^\[(.*)\]$/;
const BLOCK_LIST_ITEM_RE = /^\s*-\s+(.+)$/;

function stripQuotes(raw: string): string {
  const v = raw.trim();
  if (v.length >= 2) {
    const first = v[0];
    const last = v[v.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return v.slice(1, -1);
    }
  }
  return v;
}

function parseInlineArray(raw: string): readonly string[] {
  const inner = raw.replace(INLINE_ARRAY_RE, '$1').trim();
  if (inner.length === 0) return [];
  return inner
    .split(',')
    .map((s) => stripQuotes(s))
    .filter((s) => s.length > 0);
}

function parseScalar(raw: string): string | boolean | number {
  const v = stripQuotes(raw);
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

interface RawNode {
  scalars: Record<string, string | boolean | number>;
  nested: Record<string, Record<string, readonly string[]>>;
}

function parseYamlFrontmatter(text: string, filePath: string): RawNode {
  const out: RawNode = { scalars: {}, nested: {} };
  const lines = text.split(/\r?\n/);

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line === undefined) { i++; continue; }

    if (line.trim().length === 0 || line.trim().startsWith('#')) {
      i++;
      continue;
    }

    if (/^\S/.test(line)) {
      const colonIdx = line.indexOf(':');
      if (colonIdx <= 0) {
        throw new SkillParseError(`Malformed frontmatter line: "${line}"`, filePath);
      }
      const key = line.slice(0, colonIdx).trim();
      const rest = line.slice(colonIdx + 1).trim();

      if (rest.length === 0) {
        const child: Record<string, readonly string[]> = {};
        i++;
        while (i < lines.length) {
          const sub = lines[i];
          if (sub === undefined) break;
          if (sub.trim().length === 0) { i++; continue; }
          if (/^\S/.test(sub)) break;
          const subColon = sub.indexOf(':');
          if (subColon <= 0) {
            throw new SkillParseError(`Malformed nested line: "${sub}"`, filePath);
          }
          const subKey = sub.slice(0, subColon).trim();
          const subRest = sub.slice(subColon + 1).trim();

          if (subRest.length === 0) {
            const items: string[] = [];
            i++;
            while (i < lines.length) {
              const item = lines[i];
              if (item === undefined) break;
              if (item.trim().length === 0) { i++; continue; }
              const m = BLOCK_LIST_ITEM_RE.exec(item);
              if (!m) break;
              items.push(stripQuotes(m[1]!));
              i++;
            }
            child[subKey] = items;
            continue;
          }
          if (subRest.startsWith('[')) {
            child[subKey] = parseInlineArray(subRest);
          } else {
            child[subKey] = [stripQuotes(subRest)];
          }
          i++;
        }
        out.nested[key] = child;
        continue;
      }

      if (rest.startsWith('[')) {
        out.scalars[key] = parseInlineArray(rest).join(',');
      } else {
        out.scalars[key] = parseScalar(rest);
      }
      i++;
      continue;
    }
    i++;
  }

  return out;
}

function validateAppliesWhen(raw: Record<string, readonly string[]> | undefined): AppliesWhen | undefined {
  if (!raw) return undefined;
  const allowed = new Set(['agent', 'genre', 'series_id', 'episode_id', 'gate', 'file_type']);
  const result: AppliesWhen = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!allowed.has(k)) continue;
    (result as Record<string, readonly string[]>)[k] = v;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function validateStatus(raw: unknown): SkillStatus {
  if (raw === 'ACTIVE' || raw === 'DRAFT' || raw === 'DEPRECATED') return raw;
  throw new Error(`Unknown skill status: ${String(raw)}`);
}

export async function loadSkillFile(filePath: string): Promise<LoadedSkill> {
  const text = await fs.readFile(filePath, 'utf-8');
  const m = FRONTMATTER_RE.exec(text);
  if (!m) {
    throw new SkillParseError('Missing or malformed --- frontmatter ---', filePath);
  }
  const frontmatterText = m[1] ?? '';
  const body = (m[2] ?? '').trimStart();

  const raw = parseYamlFrontmatter(frontmatterText, filePath);

  const name = raw.scalars['name'];
  const description = raw.scalars['description'];
  if (typeof name !== 'string' || name.length === 0) {
    throw new SkillParseError('Skill frontmatter missing required `name` field', filePath);
  }
  if (typeof description !== 'string' || description.length === 0) {
    throw new SkillParseError('Skill frontmatter missing required `description` field', filePath);
  }

  let status: SkillStatus;
  try {
    status = validateStatus(raw.scalars['status']);
  } catch (err) {
    throw new SkillParseError(
      err instanceof Error ? err.message : 'Invalid status',
      filePath,
    );
  }

  const owner = raw.scalars['owner'];
  const hardRaw = raw.scalars['hard'];
  const hard = hardRaw === true;
  const created = raw.scalars['created'];

  const frontmatter: SkillFrontmatter = {
    name,
    description,
    status,
    owner: typeof owner === 'string' ? owner : undefined,
    applies_when: validateAppliesWhen(raw.nested['applies_when']),
    hard,
    created: typeof created === 'string' ? created : undefined,
  };

  const slug = path.basename(path.dirname(filePath));

  return { slug, filePath, frontmatter, body };
}

/**
 * Parse SKILL.md frontmatter and return manifest metadata only (no body).
 * Used for two-step lazy loading: first scan picks capability candidates,
 * then `loadSkillFile` reads the body of activated capabilities.
 *
 * For ~6 skill files at current scale, reading the full file and dropping
 * the body is cheap. If file count grows past ~50 we can switch to a
 * head-only read.
 */
export async function parseSkillHeader(filePath: string): Promise<SkillManifest> {
  const loaded = await loadSkillFile(filePath);
  return {
    slug: loaded.slug,
    filePath: loaded.filePath,
    frontmatter: loaded.frontmatter,
    bodyChars: loaded.body.length,
  };
}
