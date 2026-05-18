// ──────────────────────────────────────────────────────────────────────────────
// lib/concierge/tools/skills.ts
// PA tools for the Director-Skill canon (Sprint σ.2 2026-05-15).
//
// 5 tools:
//   - listSkills    (read)
//   - getSkill      (read)
//   - proposeSkill  (mutating — verbal approval gated)
//   - updateSkill   (mutating — verbal approval gated)
//   - approveSkill  (mutating — verbal approval gated, status flip)
//
// Files live at <repo>/.claude/skills/<slug>/SKILL.md. Selector picks them up
// on the next call (cache TTL 30s, but the writer clears the cache directly).
// ──────────────────────────────────────────────────────────────────────────────

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { loadSkillFile, type AppliesWhen, type SkillFrontmatter, type SkillStatus } from '@/lib/skills/load-skill-file';
import { selectSkills, clearSkillsCache } from '@/lib/skills/select-skills';
import { writeSkillFile, isValidSlug } from '@/lib/skills/write-skill-file';
import { checkVerbalApproval } from '../approval-check';
import { fail, ok, type Tool, type ToolContext, type ToolResult } from './types';

type AnyArgs = Record<string, unknown>;

function safeParse(raw: string): AnyArgs {
  if (!raw || raw.trim() === '') return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as AnyArgs;
    return {};
  } catch {
    return {};
  }
}

function skillsRoot(): string {
  return path.resolve(process.cwd(), '..', '.claude', 'skills');
}

function skillFilePath(slug: string): string {
  return path.join(skillsRoot(), slug, 'SKILL.md');
}

// ───────────────── ACTIVITY EVENT HELPERS ─────────────────

async function logSkillEvent(
  ctx: ToolContext,
  eventType: 'rule_proposal' | 'rule_approved' | 'rule_rejected',
  slug: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await ctx.supabase.from('activity_events').insert({
      event_type: eventType,
      severity: 'info',
      title: `Skill ${slug} ${eventType.replace('rule_', '')}`,
      description: JSON.stringify(payload).slice(0, 1200),
      actor: 'EXEC-CONC',
      episode_id: ctx.episodeId ?? null,
      metadata: { slug, ...payload },
    } as never);
  } catch {
    // Non-fatal — keep tool result clean even if activity_events insert fails.
  }
}

// ───────────────── PARSE / VALIDATE HELPERS ─────────────────

function normaliseAppliesWhen(raw: unknown): AppliesWhen | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  const allowed = ['agent', 'genre', 'series_id', 'episode_id', 'gate', 'file_type'] as const;
  const out: Record<string, readonly string[]> = {};
  for (const k of allowed) {
    const v = obj[k];
    if (Array.isArray(v) && v.length > 0) {
      const cleaned = v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
      if (cleaned.length > 0) out[k] = cleaned;
    } else if (typeof v === 'string' && v.trim().length > 0) {
      out[k] = [v.trim()];
    }
  }
  return Object.keys(out).length > 0 ? (out as AppliesWhen) : undefined;
}

function validateStatusOrThrow(value: unknown): SkillStatus {
  if (value === 'ACTIVE' || value === 'DRAFT' || value === 'DEPRECATED') return value;
  throw new Error(`status must be one of ACTIVE | DRAFT | DEPRECATED (got ${String(value)})`);
}

// ───────────────── listSkills ─────────────────

interface ListSkillsArgs {
  status?: SkillStatus;
  agent?: string;
  genre?: string;
}

export const listSkills: Tool<ListSkillsArgs> = {
  name: 'listSkills',
  description:
    "List Director-canon skills installed at .claude/skills/. Optional filters: status (ACTIVE | DRAFT | DEPRECATED), agent (EXEC-SB, EXEC-SW, …), genre (comedy, …). Use this BEFORE proposing a new skill — Director may have already canonized the rule, or there may be a DRAFT awaiting his approval. Returns slug + frontmatter (no body) per skill.",
  mutating: false,
  schema: {
    type: 'function',
    function: {
      name: 'listSkills',
      description: 'List installed skills with optional filters.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['ACTIVE', 'DRAFT', 'DEPRECATED'] },
          agent: { type: 'string', description: 'Filter to skills whose applies_when.agent includes this agent id.' },
          genre: { type: 'string', description: 'Filter to skills whose applies_when.genre includes this genre.' },
        },
        additionalProperties: false,
      },
    },
  },
  parse(raw) {
    const obj = safeParse(raw);
    const status =
      obj.status === 'ACTIVE' || obj.status === 'DRAFT' || obj.status === 'DEPRECATED'
        ? obj.status
        : undefined;
    return {
      status,
      agent: typeof obj.agent === 'string' ? obj.agent : undefined,
      genre: typeof obj.genre === 'string' ? obj.genre : undefined,
    };
  },
  async execute(args): Promise<ToolResult> {
    // Force a full disk scan (selector filters to ACTIVE; we want all statuses).
    clearSkillsCache();
    const root = skillsRoot();
    let entries: { name: string; isDirectory(): boolean }[] = [];
    try {
      entries = await fs.readdir(root, { withFileTypes: true });
    } catch {
      return ok({ skills: [] }, 'No .claude/skills/ directory found.');
    }
    const items: Array<{ slug: string; frontmatter: SkillFrontmatter; bodyChars: number }> = [];
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const filePath = path.join(root, ent.name, 'SKILL.md');
      try {
        const s = await loadSkillFile(filePath);
        items.push({ slug: s.slug, frontmatter: s.frontmatter, bodyChars: s.body.length });
      } catch {
        // skip un-parseable directories silently
      }
    }
    const filtered = items.filter((s) => {
      if (args.status && s.frontmatter.status !== args.status) return false;
      if (args.agent) {
        const list = s.frontmatter.applies_when?.agent;
        if (!list || !list.includes(args.agent)) return false;
      }
      if (args.genre) {
        const list = s.frontmatter.applies_when?.genre;
        if (!list || !list.includes(args.genre)) return false;
      }
      return true;
    });
    return ok(
      { skills: filtered },
      `${filtered.length} skill${filtered.length === 1 ? '' : 's'} found${args.status ? ` (status=${args.status})` : ''}.`,
    );
  },
};

// ───────────────── getSkill ─────────────────

interface GetSkillArgs {
  slug: string;
}

export const getSkill: Tool<GetSkillArgs> = {
  name: 'getSkill',
  description:
    "Read the full SKILL.md (frontmatter + body) for one slug. Use before proposing an updateSkill — you must know the current body to write a diff-aware revision. Slugs match the directory name under .claude/skills/.",
  mutating: false,
  schema: {
    type: 'function',
    function: {
      name: 'getSkill',
      description: 'Read full content of one skill.',
      parameters: {
        type: 'object',
        properties: {
          slug: { type: 'string', description: 'Skill directory slug (kebab-case).', pattern: '^[a-z0-9][a-z0-9-]{1,79}[a-z0-9]$' },
        },
        required: ['slug'],
        additionalProperties: false,
      },
    },
  },
  parse(raw) {
    const obj = safeParse(raw);
    if (typeof obj.slug !== 'string' || !obj.slug) throw new Error('slug is required');
    return { slug: obj.slug };
  },
  async execute(args): Promise<ToolResult> {
    try {
      const s = await loadSkillFile(skillFilePath(args.slug));
      return ok(
        { slug: s.slug, frontmatter: s.frontmatter, body: s.body, filePath: s.filePath },
        `Loaded skill ${s.slug} (${s.frontmatter.status}, ${s.body.length} chars).`,
      );
    } catch (err) {
      return fail(`getSkill failed: ${err instanceof Error ? err.message : 'unknown error'}`, 'not_found');
    }
  },
};

// ───────────────── proposeSkill ─────────────────

interface ProposeSkillArgs {
  slug: string;
  name: string;
  description: string;
  body: string;
  hard: boolean;
  applies_when?: AppliesWhen;
  owner?: string;
}

export const proposeSkill: Tool<ProposeSkillArgs> = {
  name: 'proposeSkill',
  description:
    "Persist a NEW skill at .claude/skills/<slug>/SKILL.md with status=DRAFT. Verbal approval required (Director must say 'да' / 'одобряю' / similar in the active thread before this call). Use when Director articulates a forever-rule you want to canonize. Slug MUST be kebab-case (e.g. 'no-water-bottle-cliche'). The body should explain WHEN the rule applies and give 1-2 worked examples. applies_when scopes the skill: omit a field to apply broadly, supply array of strings to constrain (e.g. agent=[EXEC-SB], genre=[comedy]). hard=true makes the skill a HARD acceptance criterion in agent prompts; hard=false makes it guidance only. Refuses to overwrite an existing slug — use updateSkill for revisions.",
  mutating: true,
  schema: {
    type: 'function',
    function: {
      name: 'proposeSkill',
      description: 'Create a new DRAFT skill file. Verbal approval required.',
      parameters: {
        type: 'object',
        properties: {
          slug: { type: 'string', description: 'Directory slug, kebab-case.', pattern: '^[a-z0-9][a-z0-9-]{1,79}[a-z0-9]$' },
          name: { type: 'string', minLength: 3, maxLength: 120 },
          description: { type: 'string', minLength: 10, maxLength: 600 },
          body: { type: 'string', minLength: 20, maxLength: 20000 },
          hard: { type: 'boolean' },
          owner: { type: 'string', maxLength: 80 },
          applies_when: {
            type: 'object',
            description: "Scope. Omit a field to apply broadly. Each value is an array of strings (or a single string).",
            properties: {
              agent: { type: 'array', items: { type: 'string' } },
              genre: { type: 'array', items: { type: 'string' } },
              series_id: { type: 'array', items: { type: 'string' } },
              episode_id: { type: 'array', items: { type: 'string' } },
              gate: { type: 'array', items: { type: 'string' } },
              file_type: { type: 'array', items: { type: 'string' } },
            },
            additionalProperties: false,
          },
        },
        required: ['slug', 'name', 'description', 'body', 'hard'],
        additionalProperties: false,
      },
    },
  },
  parse(raw) {
    const obj = safeParse(raw);
    const slug = typeof obj.slug === 'string' ? obj.slug.trim() : '';
    if (!isValidSlug(slug)) throw new Error('slug must be kebab-case 3-80 chars (^[a-z0-9][a-z0-9-]{1,79}[a-z0-9]$)');
    const name = typeof obj.name === 'string' ? obj.name.trim() : '';
    if (name.length < 3) throw new Error('name is required (min 3 chars)');
    const description = typeof obj.description === 'string' ? obj.description.trim() : '';
    if (description.length < 10) throw new Error('description is required (min 10 chars)');
    const body = typeof obj.body === 'string' ? obj.body : '';
    if (body.trim().length < 20) throw new Error('body is required (min 20 chars)');
    const hard = obj.hard === true;
    const owner = typeof obj.owner === 'string' ? obj.owner.trim() : undefined;
    const applies_when = normaliseAppliesWhen(obj.applies_when);
    return { slug, name, description, body, hard, owner, applies_when };
  },
  async execute(args, ctx): Promise<ToolResult> {
    const approval = checkVerbalApproval(ctx.recentTurns ?? []);
    if (!approval.approved) {
      return fail(approval.reason, 'verbal_approval_required');
    }
    // Refuse to clobber existing slug.
    try {
      await fs.access(skillFilePath(args.slug));
      return fail(
        `Skill "${args.slug}" already exists. Use updateSkill to revise it, or pick a different slug.`,
        'already_exists',
      );
    } catch {
      // file does not exist — good
    }

    const frontmatter: SkillFrontmatter = {
      name: args.name,
      description: args.description,
      status: 'DRAFT',
      owner: args.owner ?? 'Director',
      applies_when: args.applies_when,
      hard: args.hard,
      created: new Date().toISOString().slice(0, 10),
    };
    try {
      const written = await writeSkillFile({ slug: args.slug, frontmatter, body: args.body });
      await logSkillEvent(ctx, 'rule_proposal', args.slug, {
        scope: args.applies_when ?? {},
        hard: args.hard,
        proposed_by: 'EXEC-CONC',
        verbal_approval_excerpt: approval.reason,
      });
      return ok(
        { slug: written.slug, filePath: written.filePath, status: 'DRAFT' },
        `Proposed new skill "${args.slug}" as DRAFT. Tell Director: review the body, then "одобряю ${args.slug}" to activate.`,
      );
    } catch (err) {
      return fail(`proposeSkill write failed: ${err instanceof Error ? err.message : 'unknown'}`, 'write_failed');
    }
  },
};

// ───────────────── updateSkill ─────────────────

interface UpdateSkillArgs {
  slug: string;
  body?: string;
  description?: string;
  hard?: boolean;
  applies_when?: AppliesWhen;
  status?: SkillStatus;
}

export const updateSkill: Tool<UpdateSkillArgs> = {
  name: 'updateSkill',
  description:
    "Revise an existing skill in place. Any subset of fields can be supplied: body, description, hard, applies_when, status. Frontmatter `name` and `created` are immutable; use proposeSkill for renames. Verbal approval required. Use this when Director refines wording, broadens / narrows scope, or flips an ACTIVE rule to DEPRECATED. The selector cache is cleared so the next agent run picks up the new content immediately.",
  mutating: true,
  schema: {
    type: 'function',
    function: {
      name: 'updateSkill',
      description: 'Revise an existing skill file. Verbal approval required.',
      parameters: {
        type: 'object',
        properties: {
          slug: { type: 'string', description: 'Existing skill slug.', pattern: '^[a-z0-9][a-z0-9-]{1,79}[a-z0-9]$' },
          body: { type: 'string', minLength: 20, maxLength: 20000 },
          description: { type: 'string', minLength: 10, maxLength: 600 },
          hard: { type: 'boolean' },
          status: { type: 'string', enum: ['ACTIVE', 'DRAFT', 'DEPRECATED'] },
          applies_when: {
            type: 'object',
            properties: {
              agent: { type: 'array', items: { type: 'string' } },
              genre: { type: 'array', items: { type: 'string' } },
              series_id: { type: 'array', items: { type: 'string' } },
              episode_id: { type: 'array', items: { type: 'string' } },
              gate: { type: 'array', items: { type: 'string' } },
              file_type: { type: 'array', items: { type: 'string' } },
            },
            additionalProperties: false,
          },
        },
        required: ['slug'],
        additionalProperties: false,
      },
    },
  },
  parse(raw) {
    const obj = safeParse(raw);
    const slug = typeof obj.slug === 'string' ? obj.slug.trim() : '';
    if (!isValidSlug(slug)) throw new Error('slug must be kebab-case 3-80 chars');
    const out: UpdateSkillArgs = { slug };
    if (typeof obj.body === 'string') out.body = obj.body;
    if (typeof obj.description === 'string') out.description = obj.description.trim();
    if (typeof obj.hard === 'boolean') out.hard = obj.hard;
    if (typeof obj.status === 'string') out.status = validateStatusOrThrow(obj.status);
    const applies = normaliseAppliesWhen(obj.applies_when);
    if (applies) out.applies_when = applies;
    return out;
  },
  async execute(args, ctx): Promise<ToolResult> {
    const approval = checkVerbalApproval(ctx.recentTurns ?? []);
    if (!approval.approved) {
      return fail(approval.reason, 'verbal_approval_required');
    }
    let existing;
    try {
      existing = await loadSkillFile(skillFilePath(args.slug));
    } catch (err) {
      return fail(`updateSkill: skill "${args.slug}" not found (${err instanceof Error ? err.message : 'load failed'}).`, 'not_found');
    }
    const nextFrontmatter: SkillFrontmatter = {
      ...existing.frontmatter,
      description: args.description ?? existing.frontmatter.description,
      hard: args.hard !== undefined ? args.hard : existing.frontmatter.hard,
      status: args.status ?? existing.frontmatter.status,
      applies_when: args.applies_when !== undefined ? args.applies_when : existing.frontmatter.applies_when,
    };
    const nextBody = args.body !== undefined ? args.body : existing.body;
    try {
      const written = await writeSkillFile({ slug: args.slug, frontmatter: nextFrontmatter, body: nextBody });
      const eventType: 'rule_approved' | 'rule_proposal' =
        nextFrontmatter.status === 'ACTIVE' && existing.frontmatter.status !== 'ACTIVE'
          ? 'rule_approved'
          : 'rule_proposal';
      await logSkillEvent(ctx, eventType, args.slug, {
        change_summary: {
          body_changed: args.body !== undefined,
          description_changed: args.description !== undefined,
          hard_changed: args.hard !== undefined,
          status_change:
            args.status && args.status !== existing.frontmatter.status
              ? `${existing.frontmatter.status}→${args.status}`
              : null,
          scope_changed: args.applies_when !== undefined,
        },
        verbal_approval_excerpt: approval.reason,
      });
      return ok(
        { slug: written.slug, status: nextFrontmatter.status, filePath: written.filePath },
        `Skill "${args.slug}" updated (status=${nextFrontmatter.status}).`,
      );
    } catch (err) {
      return fail(`updateSkill write failed: ${err instanceof Error ? err.message : 'unknown'}`, 'write_failed');
    }
  },
};

// ───────────────── approveSkill ─────────────────

interface ApproveSkillArgs {
  slug: string;
}

export const approveSkill: Tool<ApproveSkillArgs> = {
  name: 'approveSkill',
  description:
    "Flip a DRAFT skill to ACTIVE so agent runs start injecting it. Verbal approval required. Use after Director explicitly approves a DRAFT (e.g. 'одобряю <slug>', 'go skill X'). Errors if the skill is already ACTIVE, DEPRECATED, or missing.",
  mutating: true,
  schema: {
    type: 'function',
    function: {
      name: 'approveSkill',
      description: 'Flip a DRAFT skill to ACTIVE. Verbal approval required.',
      parameters: {
        type: 'object',
        properties: {
          slug: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{1,79}[a-z0-9]$' },
        },
        required: ['slug'],
        additionalProperties: false,
      },
    },
  },
  parse(raw) {
    const obj = safeParse(raw);
    const slug = typeof obj.slug === 'string' ? obj.slug.trim() : '';
    if (!isValidSlug(slug)) throw new Error('slug must be kebab-case');
    return { slug };
  },
  async execute(args, ctx): Promise<ToolResult> {
    const approval = checkVerbalApproval(ctx.recentTurns ?? []);
    if (!approval.approved) {
      return fail(approval.reason, 'verbal_approval_required');
    }
    let existing;
    try {
      existing = await loadSkillFile(skillFilePath(args.slug));
    } catch (err) {
      return fail(`approveSkill: skill "${args.slug}" not found (${err instanceof Error ? err.message : 'load failed'}).`, 'not_found');
    }
    if (existing.frontmatter.status === 'ACTIVE') {
      return fail(`Skill "${args.slug}" is already ACTIVE — no change needed.`, 'noop');
    }
    const nextFrontmatter: SkillFrontmatter = { ...existing.frontmatter, status: 'ACTIVE' };
    try {
      await writeSkillFile({ slug: args.slug, frontmatter: nextFrontmatter, body: existing.body });
      await logSkillEvent(ctx, 'rule_approved', args.slug, {
        prior_status: existing.frontmatter.status,
        verbal_approval_excerpt: approval.reason,
      });
      // Probe selector to confirm visibility.
      const matches = await selectSkills({
        agent: existing.frontmatter.applies_when?.agent?.[0],
        genre: existing.frontmatter.applies_when?.genre?.[0],
      });
      const visible = matches.some((m) => m.slug === args.slug);
      return ok(
        { slug: args.slug, status: 'ACTIVE', visible_to_selector: visible },
        `Skill "${args.slug}" → ACTIVE. ${visible ? 'Selector confirms visibility.' : 'Selector did not match — check applies_when scope.'}`,
      );
    } catch (err) {
      return fail(`approveSkill write failed: ${err instanceof Error ? err.message : 'unknown'}`, 'write_failed');
    }
  },
};
