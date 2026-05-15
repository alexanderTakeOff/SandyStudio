// ──────────────────────────────────────────────────────────────────────────────
// app/api/skills/[slug]/route.ts
// Director-Skill canon API — read / patch / delete for one skill.
// Sprint σ.3 (2026-05-15). Same write path as PA tools — single source of
// truth = .claude/skills/<slug>/SKILL.md.
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import path from 'node:path';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import { NotFoundError } from '@/lib/api/errors';
import { loadSkillFile } from '@/lib/skills/load-skill-file';
import { writeSkillFile, deleteSkillFile, isValidSlug } from '@/lib/skills/write-skill-file';
import type { SkillFrontmatter, AppliesWhen, SkillStatus } from '@/lib/skills/load-skill-file';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SkillEventType = 'rule_proposal' | 'rule_approved' | 'rule_rejected';

function resolveSkillFilePath(slug: string): string {
  return path.resolve(process.cwd(), '..', '.claude', 'skills', slug, 'SKILL.md');
}

async function resolveSlugOr404(ctx: { params: Promise<Record<string, string | string[]>> } | undefined): Promise<string> {
  const params = (await ctx?.params) as { slug?: string } | undefined;
  const slug = params?.slug;
  if (!slug || typeof slug !== 'string') throw new NotFoundError('Skill');
  if (!isValidSlug(slug)) throw new NotFoundError(`Skill slug "${slug}" is malformed`);
  return slug;
}

async function loadOr404(slug: string) {
  try {
    return await loadSkillFile(resolveSkillFilePath(slug));
  } catch (err) {
    throw new NotFoundError(
      `Skill "${slug}" not found (${err instanceof Error ? err.message : 'load failed'})`,
    );
  }
}

// ── GET ─────────────────────────────────────────────────────────────────────

export const GET = withApiHandler(async (_req, ctx) => {
  await requireDirector();
  const slug = await resolveSlugOr404(ctx);
  const s = await loadOr404(slug);
  return apiOk({ slug: s.slug, frontmatter: s.frontmatter, body: s.body, filePath: s.filePath });
});

// ── PATCH ───────────────────────────────────────────────────────────────────

const AppliesWhenSchema = z
  .object({
    agent: z.array(z.string().min(1)).optional(),
    genre: z.array(z.string().min(1)).optional(),
    series_id: z.array(z.string().min(1)).optional(),
    episode_id: z.array(z.string().min(1)).optional(),
    gate: z.array(z.string().min(1)).optional(),
    file_type: z.array(z.string().min(1)).optional(),
  })
  .strict();

const PatchBody = z.object({
  description: z.string().min(10).max(600).optional(),
  body: z.string().min(20).max(20000).optional(),
  hard: z.boolean().optional(),
  owner: z.string().max(80).optional(),
  status: z.enum(['ACTIVE', 'DRAFT', 'DEPRECATED']).optional(),
  applies_when: AppliesWhenSchema.optional(),
});

export const PATCH = withApiHandler(async (req, ctx) => {
  const { user, supabase } = await requireDirector();
  const slug = await resolveSlugOr404(ctx);
  const existing = await loadOr404(slug);
  const patch = await parseJson(req, PatchBody);

  const nextFrontmatter: SkillFrontmatter = {
    ...existing.frontmatter,
    description: patch.description ?? existing.frontmatter.description,
    hard: patch.hard !== undefined ? patch.hard : existing.frontmatter.hard,
    owner: patch.owner ?? existing.frontmatter.owner,
    status: (patch.status as SkillStatus | undefined) ?? existing.frontmatter.status,
    applies_when:
      patch.applies_when !== undefined
        ? (patch.applies_when as AppliesWhen)
        : existing.frontmatter.applies_when,
  };
  const nextBody = patch.body !== undefined ? patch.body : existing.body;

  const written = await writeSkillFile({ slug, frontmatter: nextFrontmatter, body: nextBody });

  let eventType: SkillEventType = 'rule_proposal';
  if (nextFrontmatter.status === 'ACTIVE' && existing.frontmatter.status !== 'ACTIVE') {
    eventType = 'rule_approved';
  } else if (nextFrontmatter.status === 'DEPRECATED') {
    eventType = 'rule_rejected';
  }

  await supabase.from('activity_events').insert({
    event_type: eventType,
    severity: 'info',
    title: `Skill ${slug} updated via /api/skills (status=${nextFrontmatter.status})`,
    description: `Updated by ${user.email ?? user.id}`,
    actor: user.id,
    metadata: {
      slug,
      prior_status: existing.frontmatter.status,
      next_status: nextFrontmatter.status,
      body_changed: patch.body !== undefined,
      scope_changed: patch.applies_when !== undefined,
    },
  } as never);

  return apiOk({ slug: written.slug, frontmatter: nextFrontmatter, filePath: written.filePath });
});

// ── DELETE ──────────────────────────────────────────────────────────────────
//
// Hard-delete is destructive but recoverable from git for committed skills.
// For uncommitted DRAFT scratch entries the Director may want to throw them
// away cleanly. We still log an activity event.

export const DELETE = withApiHandler(async (_req, ctx) => {
  const { user, supabase } = await requireDirector();
  const slug = await resolveSlugOr404(ctx);
  const existing = await loadOr404(slug);
  const result = await deleteSkillFile(slug);

  await supabase.from('activity_events').insert({
    event_type: 'rule_rejected' satisfies SkillEventType,
    severity: 'warning',
    title: `Skill ${slug} deleted via /api/skills`,
    description: `Deleted by ${user.email ?? user.id}. Prior status=${existing.frontmatter.status}.`,
    actor: user.id,
    metadata: { slug, prior_status: existing.frontmatter.status, removed: result.removed },
  } as never);

  return apiOk({ slug, removed: result.removed });
});
