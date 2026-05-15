// ──────────────────────────────────────────────────────────────────────────────
// lib/skills/select-skills.ts
// Scans .claude/skills/<slug>/SKILL.md, parses frontmatter, filters by
// applies_when predicate, returns ACTIVE matches sorted by specificity.
//
// In-process cache with 30s TTL so multi-agent runs don't re-scan the disk.
// Falls back to empty array if .claude/skills/ doesn't exist (replay-pilot,
// CI, fresh checkouts) — selector must never throw on missing dir.
// ──────────────────────────────────────────────────────────────────────────────

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { loadSkillFile, type LoadedSkill, type AppliesWhen } from './load-skill-file';

export interface SelectorContext {
  agent?: string;
  genre?: string;
  series_id?: string;
  episode_id?: string;
  gate?: string;
  file_type?: string;
}

const CACHE_TTL_MS = 30_000;
const MAX_SKILLS_PER_CALL = 5;

interface CacheEntry {
  loadedAt: number;
  skills: readonly LoadedSkill[];
}

let cache: CacheEntry | null = null;

function skillsRoot(): string {
  // webapp lives at <repo>/webapp; .claude/skills at <repo>/.claude/skills.
  // process.cwd() in Next dev/prod is webapp/. In replay-pilot it's the repo root.
  // Probe both.
  const fromWebapp = path.resolve(process.cwd(), '..', '.claude', 'skills');
  return fromWebapp;
}

async function scanSkillsDir(): Promise<readonly LoadedSkill[]> {
  const roots = [
    path.resolve(process.cwd(), '..', '.claude', 'skills'),
    path.resolve(process.cwd(), '.claude', 'skills'),
  ];
  for (const root of roots) {
    try {
      const entries = await fs.readdir(root, { withFileTypes: true });
      const skills: LoadedSkill[] = [];
      for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        const filePath = path.join(root, ent.name, 'SKILL.md');
        try {
          await fs.access(filePath);
        } catch {
          continue;
        }
        try {
          skills.push(await loadSkillFile(filePath));
        } catch (err) {
          if (process.env.SKILLS_LOG_PARSE_ERRORS === '1') {
            // eslint-disable-next-line no-console
            console.warn('[skills] parse error', err);
          }
        }
      }
      return skills;
    } catch {
      // try next root
    }
  }
  return [];
}

function fieldMatches(
  ctxValue: string | undefined,
  required: readonly string[] | undefined,
): boolean {
  if (!required || required.length === 0) return true;
  if (!ctxValue) return false;
  return required.includes(ctxValue);
}

function predicateMatches(applies: AppliesWhen | undefined, ctx: SelectorContext): boolean {
  if (!applies) return true;
  return (
    fieldMatches(ctx.agent, applies.agent) &&
    fieldMatches(ctx.genre, applies.genre) &&
    fieldMatches(ctx.series_id, applies.series_id) &&
    fieldMatches(ctx.episode_id, applies.episode_id) &&
    fieldMatches(ctx.gate, applies.gate) &&
    fieldMatches(ctx.file_type, applies.file_type)
  );
}

function specificityScore(applies: AppliesWhen | undefined): number {
  if (!applies) return 0;
  let score = 0;
  if (applies.episode_id?.length) score += 32;
  if (applies.series_id?.length) score += 16;
  if (applies.gate?.length) score += 8;
  if (applies.file_type?.length) score += 4;
  if (applies.agent?.length) score += 2;
  if (applies.genre?.length) score += 1;
  return score;
}

export async function selectSkills(ctx: SelectorContext): Promise<readonly LoadedSkill[]> {
  const now = Date.now();
  if (!cache || now - cache.loadedAt > CACHE_TTL_MS) {
    cache = { loadedAt: now, skills: await scanSkillsDir() };
  }

  const matches = cache.skills.filter(
    (s) => s.frontmatter.status === 'ACTIVE' && predicateMatches(s.frontmatter.applies_when, ctx),
  );

  matches.sort((a, b) => {
    if (a.frontmatter.hard !== b.frontmatter.hard) {
      return a.frontmatter.hard ? -1 : 1;
    }
    return specificityScore(b.frontmatter.applies_when) - specificityScore(a.frontmatter.applies_when);
  });

  return matches.slice(0, MAX_SKILLS_PER_CALL);
}

export function clearSkillsCache(): void {
  cache = null;
}
