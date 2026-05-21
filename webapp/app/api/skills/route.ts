// ──────────────────────────────────────────────────────────────────────────────
// app/api/skills/route.ts
// Director-Skill canon API — list + create.
// Sprint σ.3 (2026-05-15). Shares write path with the PA tools in
// lib/concierge/tools/skills.ts; single source of truth = .claude/skills/<slug>/SKILL.md.
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { logEvent } from '@/lib/api/events';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk, apiCreated } from '@/lib/api/response';
import { parseJson, parseSearchParams } from '@/lib/api/zod-helpers';
import { ConflictError, ValidationError } from '@/lib/api/errors';
import { listAllSkills } from '@/lib/skills/select-skills';
import { writeSkillFile, isValidSlug } from '@/lib/skills/write-skill-file';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { SkillFrontmatter, AppliesWhen, SkillStatus } from '@/lib/skills/load-skill-file';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── List ─────────────────────────────────────────────────────────────────────

const ListQuery = z.object({
  status: z.enum(['ACTIVE', 'DRAFT', 'DEPRECATED']).optional(),
  agent: z.string().optional(),
  genre: z.string().optional(),
});

interface SkillSummary {
  slug: string;
  frontmatter: SkillFrontmatter;
  bodyChars: number;
}

export const GET = withApiHandler(async (req) => {
  await requireDirector();
  const q = parseSearchParams(req.url, ListQuery);
  const skills = await listAllSkills();
  const summaries: SkillSummary[] = skills
    .filter((s) => !q.status || s.frontmatter.status === q.status)
    .filter((s) => !q.agent || s.frontmatter.applies_when?.agent?.includes(q.agent))
    .filter((s) => !q.genre || s.frontmatter.applies_when?.genre?.includes(q.genre))
    .map((s) => ({ slug: s.slug, frontmatter: s.frontmatter, bodyChars: s.body.length }));
  return apiOk(summaries, { total: summaries.length });
});

// ── Create ───────────────────────────────────────────────────────────────────

const AppliesWhenSchema = z
  .object({
    agent: z.array(z.string().min(1)).optional(),
    genre: z.array(z.string().min(1)).optional(),
    series_id: z.array(z.string().min(1)).optional(),
    episode_id: z.array(z.string().min(1)).optional(),
    gate: z.array(z.string().min(1)).optional(),
    file_type: z.array(z.string().min(1)).optional(),
  })
  .strict()
  .optional();

const CreateBody = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,79}[a-z0-9]$/, 'slug must be kebab-case 3-80 chars'),
  name: z.string().min(3).max(120),
  description: z.string().min(10).max(600),
  body: z.string().min(20).max(20000),
  hard: z.boolean(),
  owner: z.string().max(80).optional(),
  applies_when: AppliesWhenSchema,
  status: z.enum(['ACTIVE', 'DRAFT']).default('DRAFT'),
});

function resolveSkillFilePath(slug: string): string {
  return path.resolve(process.cwd(), '..', '.claude', 'skills', slug, 'SKILL.md');
}

export const POST = withApiHandler(async (req) => {
  const { user, supabase } = await requireDirector();
  const body = await parseJson(req, CreateBody);
  if (!isValidSlug(body.slug)) {
    throw new ValidationError('slug failed sanity check');
  }
  // Refuse to clobber existing slug.
  try {
    await fs.access(resolveSkillFilePath(body.slug));
    throw new ConflictError(`Skill "${body.slug}" already exists. Use PATCH /api/skills/${body.slug} to revise.`);
  } catch (err) {
    if (err instanceof ConflictError) throw err;
    // file does not exist — good
  }

  const frontmatter: SkillFrontmatter = {
    name: body.name,
    description: body.description,
    status: body.status as SkillStatus,
    owner: body.owner ?? 'Director',
    applies_when: body.applies_when as AppliesWhen | undefined,
    hard: body.hard,
    created: new Date().toISOString().slice(0, 10),
  };

  const written = await writeSkillFile({
    slug: body.slug,
    frontmatter,
    body: body.body,
  });

  // TD-29.5 (2026-05-21): route through logEvent so rule_approved /
  // rule_proposal can emit pa/notify-needed when actionable.
  await logEvent(supabase, {
    event_type: body.status === 'ACTIVE' ? 'rule_approved' : 'rule_proposal',
    severity: 'info',
    title: `Skill ${body.slug} created via /api/skills (${body.status})`,
    description: `Created by ${user.email ?? user.id}. Scope: ${JSON.stringify(body.applies_when ?? {})}`,
    actor: user.id,
    metadata: { slug: body.slug, hard: body.hard, scope: body.applies_when ?? {} },
  });

  return apiCreated({ slug: written.slug, frontmatter, filePath: written.filePath });
});
