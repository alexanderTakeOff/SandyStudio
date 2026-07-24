// Loader hardening (Director q6a, 2026-07-24): the skill loader must NEVER
// silently discard a SKILL.md that exists on disk — a present-but-unloadable
// file looks "handled" while the runtime (the sandystudio webapp) ignores it.
//
// NOTE: no .agents/skills mirror-parity test here. Runtime evidence — the only
// skill reader in the app is select-skills.ts, which reads ONLY .claude/skills.
// .agents/skills (Codex's auditor copy) never executes in the app, so its drift
// is not a runtime problem and is deliberately NOT guarded (Director, 2026-07-24).
import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { listAllSkills, clearSkillsCache } from '../../../lib/skills/select-skills';

const REPO_ROOT = path.resolve(process.cwd(), '..');
const CLAUDE_SKILLS = path.join(REPO_ROOT, '.claude', 'skills');

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

async function skillMap(root: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const file = path.join(root, ent.name, 'SKILL.md');
    if (await exists(file)) out.set(ent.name, await fs.readFile(file, 'utf-8'));
  }
  return out;
}

describe('skill loader — no silent drops', () => {
  beforeEach(() => clearSkillsCache());

  it('surfaces load failures instead of swallowing them', async () => {
    const { skills, failures } = await listAllSkills();
    expect(Array.isArray(skills)).toBe(true);
    expect(Array.isArray(failures)).toBe(true);
    // Every failure must name the slug + a human reason (the anti-silent-drop
    // contract) — never an anonymous drop.
    for (const f of failures) {
      expect(f.slug.length).toBeGreaterThan(0);
      expect(f.reason.length).toBeGreaterThan(0);
    }
  });

  it('every real skill on disk either loads or is reported as a failure', async () => {
    const { skills, failures } = await listAllSkills();
    const onDisk = await skillMap(CLAUDE_SKILLS);
    const accounted = new Set([...skills.map((s) => s.slug), ...failures.map((f) => f.slug)]);
    for (const slug of onDisk.keys()) {
      expect(accounted.has(slug)).toBe(true); // no skill vanishes without a trace
    }
  });

  it('no live skill carries the invalid STUB status (use DRAFT)', async () => {
    const onDisk = await skillMap(CLAUDE_SKILLS);
    for (const [slug, text] of onDisk) {
      expect(text, `${slug} frontmatter`).not.toMatch(/^status:\s*STUB\s*$/m);
    }
  });
});
