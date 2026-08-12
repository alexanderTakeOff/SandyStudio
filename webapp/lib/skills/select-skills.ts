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
import { loadSkillFile, type LoadedSkill, type SkillManifest, type AppliesWhen } from './load-skill-file';

export interface SelectorContext {
  /**
   * Роль, от имени которой идёт выборка. СПИСОК ролей (2026-08-08) — для единого
   * ума, который собой заменяет всех маленьких агентов сразу и потому обязан
   * видеть репертуар их всех.
   *
   * Почему это понадобилось: роут ума звал селектор БЕЗ `agent`, а все ACTIVE-скиллы
   * на диске объявляют `applies_when.agent` — `fieldMatches` при заданном скоупе и
   * пустом контексте отдаёт false, поэтому ум получал РОВНО НОЛЬ скиллов и работал
   * без ремесла студии (корень D76: сториборд без контракта `storyboarder@v2`,
   * потому что `storyboarder-cosmic-horror` ему не выдали).
   *
   * Список, а не снятие скоупа: снятие пустило бы `sandy-gag-library`
   * (`genre:[comedy]`, Sandy-специфичный) в cosmic_horror. Остальные оси
   * (`genre`/`series_id`/`episode_id`) продолжают фильтровать как раньше — именно
   * они держат изоляцию каналов.
   */
  agent?: string | readonly string[];
  genre?: string;
  series_id?: string;
  episode_id?: string;
  gate?: string;
  file_type?: string;
}

const CACHE_TTL_MS = 30_000;
/**
 * Квота под МАЛЕНЬКУЮ модель старого мира. Для единого ума она снята (доктрина
 * §21: «большой ум читает сколько нужно») — он передаёт `limit: Infinity`.
 * Умолчание держит старых вызывающих без изменений до Ф6.
 */
const MAX_SKILLS_PER_CALL = 5;

/**
 * A SKILL.md file that exists on disk but could NOT be loaded (bad frontmatter,
 * invalid status like the old `STUB`, missing required field). This is the
 * dangerous case: the file is present, so the Director believes the capability
 * is live, but the runtime silently ignores it. These must be surfaced LOUDLY —
 * to the server log AND to the /api/skills list — never swallowed.
 */
export interface SkillLoadFailure {
  slug: string;
  filePath: string;
  reason: string;
}

interface CacheEntry {
  loadedAt: number;
  skills: readonly LoadedSkill[];
  failures: readonly SkillLoadFailure[];
}

let cache: CacheEntry | null = null;

// Warn-once-per-(slug,reason) so a persistent failure doesn't spam prod.log on
// every 30s cache miss, while a NEW failure is always announced. Cleared with
// the cache so a fixed-then-rebroken skill re-warns.
let warnedFailures = new Set<string>();

interface ScanResult {
  skills: readonly LoadedSkill[];
  failures: readonly SkillLoadFailure[];
}

async function scanSkillsDir(): Promise<ScanResult> {
  const roots = [
    path.resolve(process.cwd(), '..', '.claude', 'skills'),
    path.resolve(process.cwd(), '.claude', 'skills'),
  ];
  for (const root of roots) {
    try {
      const entries = await fs.readdir(root, { withFileTypes: true });
      const skills: LoadedSkill[] = [];
      const failures: SkillLoadFailure[] = [];
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
          const reason = err instanceof Error ? err.message : String(err);
          failures.push({ slug: ent.name, filePath, reason });
          // LOUD by default (was gated behind a near-never-set env flag): a file
          // that exists but won't load is exactly the "Director thinks it's live,
          // runtime ignores it" trap. One line per unique failure.
          const key = `${ent.name}::${reason}`;
          if (!warnedFailures.has(key)) {
            warnedFailures.add(key);
            // eslint-disable-next-line no-console
            console.warn(`[skills] DROPPED "${ent.name}" — file exists but did NOT load: ${reason}`);
          }
        }
      }
      return { skills, failures };
    } catch {
      // try next root
    }
  }
  return { skills: [], failures: [] };
}

function fieldMatches(
  ctxValue: string | readonly string[] | undefined,
  required: readonly string[] | undefined,
): boolean {
  if (!required || required.length === 0) return true;
  if (!ctxValue) return false;
  // Список в контексте (единый ум = много ролей сразу) — совпадение по ЛЮБОЙ из
  // них: скилл подходит, если он адресован хоть одной роли, которую ум играет.
  if (Array.isArray(ctxValue)) {
    if (ctxValue.length === 0) return false;
    return ctxValue.some((v) => required.includes(v));
  }
  return required.includes(ctxValue as string);
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

async function refreshCache(now: number): Promise<CacheEntry> {
  const scan = await scanSkillsDir();
  warnedFailures = pruneWarned(warnedFailures, scan.failures);
  cache = { loadedAt: now, skills: scan.skills, failures: scan.failures };
  return cache;
}

/** Drop warn-keys for failures that no longer exist, so a re-broken skill re-warns. */
function pruneWarned(warned: Set<string>, failures: readonly SkillLoadFailure[]): Set<string> {
  const live = new Set(failures.map((f) => `${f.slug}::${f.reason}`));
  return new Set([...warned].filter((k) => live.has(k)));
}

async function getCache(): Promise<CacheEntry> {
  const now = Date.now();
  if (!cache || now - cache.loadedAt > CACHE_TTL_MS) return refreshCache(now);
  return cache;
}

async function selectSkillsRanked(
  ctx: SelectorContext,
  limit: number = MAX_SKILLS_PER_CALL,
): Promise<readonly LoadedSkill[]> {
  const entry = await getCache();

  const matches = entry.skills.filter(
    (s) => s.frontmatter.status === 'ACTIVE' && predicateMatches(s.frontmatter.applies_when, ctx),
  );

  matches.sort((a, b) => {
    if (a.frontmatter.hard !== b.frontmatter.hard) {
      return a.frontmatter.hard ? -1 : 1;
    }
    return specificityScore(b.frontmatter.applies_when) - specificityScore(a.frontmatter.applies_when);
  });

  return Number.isFinite(limit) ? matches.slice(0, limit) : matches;
}

/**
 * Eager selector — returns matched skills WITH body. Kept for legacy
 * callers (UI / probe scripts). New code should prefer `listSkillManifests`
 * (lazy manifest) + `loadSkillBodies` (on-demand body fetch) per the
 * two-step pattern described in docs/skills-as-capabilities.md.
 */
export async function selectSkills(ctx: SelectorContext): Promise<readonly LoadedSkill[]> {
  return selectSkillsRanked(ctx);
}

/**
 * Lazy manifest scanner — returns matched skills as frontmatter-only
 * metadata (no body). Used by agent runners and PA to expose the available
 * capability repertoire without burning context budget on bodies.
 */
export async function listSkillManifests(
  ctx: SelectorContext,
  opts?: { limit?: number },
): Promise<readonly SkillManifest[]> {
  const ranked = await selectSkillsRanked(ctx, opts?.limit);
  return ranked.map((s) => ({
    slug: s.slug,
    filePath: s.filePath,
    frontmatter: s.frontmatter,
    bodyChars: s.body.length,
  }));
}

/**
 * On-demand body loader. Reads cache when available (same in-process LRU
 * as the selector), falls back to disk re-read if a slug is missing.
 * Returns LoadedSkill[] in the order supplied; silently drops slugs that
 * resolve to nothing (caller decides whether to log the gap).
 */
export async function loadSkillBodies(slugs: readonly string[]): Promise<readonly LoadedSkill[]> {
  if (slugs.length === 0) return [];
  const entry = await getCache();
  const indexed = new Map(entry.skills.map((s) => [s.slug, s]));
  const out: LoadedSkill[] = [];
  for (const slug of slugs) {
    const hit = indexed.get(slug);
    if (hit) out.push(hit);
  }
  return out;
}

export function clearSkillsCache(): void {
  cache = null;
  warnedFailures = new Set();
}

/**
 * List ALL skills on disk regardless of status, PLUS the files that exist but
 * failed to load. Used by `/api/skills` list and PA `listSkills` tool. Always
 * re-scans so newly-written files are visible immediately.
 *
 * `failures` is the anti-silent-drop surface: a SKILL.md that won't parse (bad
 * frontmatter, invalid status) is present on disk — so it LOOKS handled — but
 * the runtime ignores it. Callers MUST surface failures, not swallow them.
 */
export async function listAllSkills(): Promise<{
  skills: readonly LoadedSkill[];
  failures: readonly SkillLoadFailure[];
}> {
  const scan = await scanSkillsDir();
  // Refresh cache while we're here so the next selectSkills() call sees the
  // same disk view.
  warnedFailures = pruneWarned(warnedFailures, scan.failures);
  cache = { loadedAt: Date.now(), skills: scan.skills, failures: scan.failures };
  return { skills: scan.skills, failures: scan.failures };
}
