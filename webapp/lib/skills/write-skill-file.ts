// ──────────────────────────────────────────────────────────────────────────────
// lib/skills/write-skill-file.ts
// Atomic writer for .claude/skills/<slug>/SKILL.md files. Pairs with
// load-skill-file.ts — same frontmatter shape, same hand-rolled YAML, same
// 6 scoping fields. PA tools call this via the concierge tool layer.
//
// Atomicity: write to <slug>/SKILL.md.tmp, then rename. Failure leaves either
// the old file intact or no tmp visible to the selector (selector requires
// SKILL.md). Slug directories are created on demand.
//
// Sprint σ.2 (2026-05-15).
// ──────────────────────────────────────────────────────────────────────────────

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AppliesWhen, SkillFrontmatter, SkillStatus } from './load-skill-file';
import { clearSkillsCache } from './select-skills';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,79}[a-z0-9]$/;

export class SkillWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SkillWriteError';
  }
}

export interface WriteSkillArgs {
  slug: string;
  frontmatter: SkillFrontmatter;
  body: string;
}

function resolveSkillsRoot(): string {
  return path.resolve(process.cwd(), '..', '.claude', 'skills');
}

function escapeScalar(value: string): string {
  if (value.length === 0) return '""';
  // If the string contains characters that would need quoting (colon, hash,
  // leading/trailing space, leading `-`, etc.), wrap in double quotes and
  // escape embedded double quotes + backslashes.
  if (/[\n"\\]/.test(value) || /^[-?*&!|>%@`]/.test(value) || /[:#]/.test(value)) {
    const esc = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${esc}"`;
  }
  return value;
}

function serializeAppliesWhen(applies: AppliesWhen | undefined): string[] {
  if (!applies) return [];
  const lines: string[] = ['applies_when:'];
  const keys: Array<keyof AppliesWhen> = ['agent', 'genre', 'series_id', 'episode_id', 'gate', 'file_type'];
  for (const k of keys) {
    const values = applies[k];
    if (!values || values.length === 0) continue;
    const inline = `[${values.map(escapeScalar).join(', ')}]`;
    lines.push(`  ${k}: ${inline}`);
  }
  if (lines.length === 1) return []; // nothing actually populated
  return lines;
}

function serializeFrontmatter(fm: SkillFrontmatter): string {
  const lines: string[] = ['---'];
  lines.push(`name: ${escapeScalar(fm.name)}`);
  lines.push(`description: ${escapeScalar(fm.description)}`);
  lines.push(`status: ${fm.status}`);
  if (fm.owner) lines.push(`owner: ${escapeScalar(fm.owner)}`);
  lines.push(...serializeAppliesWhen(fm.applies_when));
  lines.push(`hard: ${fm.hard ? 'true' : 'false'}`);
  if (fm.created) lines.push(`created: ${escapeScalar(fm.created)}`);
  lines.push('---', '');
  return lines.join('\n');
}

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

export function validateStatus(value: string): SkillStatus {
  if (value === 'ACTIVE' || value === 'DRAFT' || value === 'DEPRECATED') return value;
  throw new SkillWriteError(`Unknown skill status: ${value}`);
}

export async function writeSkillFile(args: WriteSkillArgs): Promise<{ slug: string; filePath: string }> {
  if (!isValidSlug(args.slug)) {
    throw new SkillWriteError(
      `Invalid slug "${args.slug}". Slugs must match ${SLUG_RE.source} (lowercase, kebab-case, 3-80 chars).`,
    );
  }
  if (!args.frontmatter.name || args.frontmatter.name.length === 0) {
    throw new SkillWriteError('frontmatter.name is required');
  }
  if (!args.frontmatter.description || args.frontmatter.description.length === 0) {
    throw new SkillWriteError('frontmatter.description is required');
  }
  if (!args.body || args.body.trim().length < 20) {
    throw new SkillWriteError('body too short (min 20 chars)');
  }

  const root = resolveSkillsRoot();
  const dir = path.join(root, args.slug);
  const finalPath = path.join(dir, 'SKILL.md');
  const tmpPath = path.join(dir, 'SKILL.md.tmp');

  await fs.mkdir(dir, { recursive: true });

  const text = serializeFrontmatter(args.frontmatter) + args.body.trimEnd() + '\n';
  await fs.writeFile(tmpPath, text, { encoding: 'utf-8' });
  await fs.rename(tmpPath, finalPath);

  clearSkillsCache();

  return { slug: args.slug, filePath: finalPath };
}
