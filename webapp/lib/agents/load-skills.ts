// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/load-skills.ts
// Production-agent wrapper around lib/skills/select-skills. Two-step API
// per docs/skills-as-capabilities.md:
//
//   Step 1 — getAgentSkillManifest({...}) → list of available capabilities
//            (frontmatter only, no body). Agent reasoning picks the subset.
//   Step 2 — loadAgentSkillBodies(slugs)  → bodies for activated slugs,
//            ready to inject as the "Active Playbooks" block in the second
//            LLM call.
//
// Also exposes two prompt composers:
//   composeSkillSelectionPrompt(manifest, taskHint) — Step 1 instruction.
//   composeActivePlaybooksBlock(bodies)             — Step 2 prompt block,
//                                                     craft-tone header.
//
// Legacy `loadAgentSkills` (eager single-step) is retained for callers
// that have not yet migrated; marked @deprecated.
//
// Sprint φ.1 (2026-05-16). Replaces σ.1 single-step version.
// ──────────────────────────────────────────────────────────────────────────────

import {
  listSkillManifests,
  loadSkillBodies,
  selectSkills,
  type SelectorContext,
} from '../skills/select-skills';
import type { LoadedSkill, SkillManifest } from '../skills/load-skill-file';

// Per-call total body budget. Broad capability skills routinely run
// 8-12 KB; we keep the upper headroom generous so a normal Storyboarder
// run lands all activated playbooks. Truncation kicks in only when the
// agent activates many skills at once.
const TOTAL_BODY_BUDGET = 24_000;

export interface LoadAgentSkillsArgs {
  agentId: string;
  genre?: string;
  series_id?: string;
  episode_id?: string;
  gate?: string;
  file_type?: string;
}

function ctxFromArgs(args: LoadAgentSkillsArgs): SelectorContext {
  return {
    agent: args.agentId,
    genre: args.genre,
    series_id: args.series_id,
    episode_id: args.episode_id,
    gate: args.gate,
    file_type: args.file_type,
  };
}

// ───────────────── STEP 1 — manifest ─────────────────

export interface AgentSkillManifestResult {
  available: readonly SkillManifest[];
  count: number;
  totalBodyChars: number;
}

/**
 * Step 1 of the two-step pattern. Returns the agent's available capability
 * repertoire as frontmatter-only metadata. The agent's first LLM call
 * reasons over this list and selects activated slugs.
 */
export async function getAgentSkillManifest(
  args: LoadAgentSkillsArgs,
): Promise<AgentSkillManifestResult> {
  const manifests = await listSkillManifests(ctxFromArgs(args));
  return {
    available: manifests,
    count: manifests.length,
    totalBodyChars: manifests.reduce((acc, m) => acc + m.bodyChars, 0),
  };
}

// ───────────────── STEP 2 — bodies ─────────────────

export interface AgentSkillBodiesResult {
  loaded: readonly LoadedSkill[];
  totalChars: number;
  truncatedCount: number;
}

/**
 * Step 2 of the two-step pattern. Given the slugs the agent activated,
 * loads the bodies and applies the 8K total-budget cap (rarely hit since
 * the agent itself filters to relevant subset, but kept as a safety belt).
 */
export async function loadAgentSkillBodies(
  slugs: readonly string[],
): Promise<AgentSkillBodiesResult> {
  if (slugs.length === 0) {
    return { loaded: [], totalChars: 0, truncatedCount: 0 };
  }
  const bodies = await loadSkillBodies(slugs);
  const out: LoadedSkill[] = [];
  let total = 0;
  let truncated = 0;
  for (const skill of bodies) {
    const remaining = TOTAL_BODY_BUDGET - total;
    if (remaining <= 0) {
      truncated += 1;
      continue;
    }
    const body = skill.body;
    if (body.length <= remaining) {
      total += body.length;
      out.push(skill);
      continue;
    }
    // Body exceeds remaining budget — slice with a clear truncation marker
    // so the consumer can tell the body was clamped, but the skill is still
    // included rather than dropped. Single oversized skills must not vanish.
    const sliced = body.slice(0, remaining - 64).trimEnd() + '\n\n[…skill body truncated for context budget…]';
    total += sliced.length;
    out.push({ ...skill, body: sliced });
    truncated += 1;
  }
  return { loaded: out, totalChars: total, truncatedCount: truncated };
}

// ───────────────── prompt composers ─────────────────

function describeApplicability(m: SkillManifest): string {
  const aw = m.frontmatter.applies_when;
  if (!aw) return 'broad';
  const parts: string[] = [];
  if (aw.agent?.length) parts.push(`agent: ${aw.agent.join('|')}`);
  if (aw.genre?.length) parts.push(`genre: ${aw.genre.join('|')}`);
  if (aw.series_id?.length) parts.push(`series: ${aw.series_id.length} ids`);
  if (aw.episode_id?.length) parts.push(`episode: ${aw.episode_id.length} ids`);
  if (aw.gate?.length) parts.push(`gate: ${aw.gate.join('|')}`);
  if (aw.file_type?.length) parts.push(`file_type: ${aw.file_type.join('|')}`);
  return parts.length > 0 ? parts.join(' · ') : 'broad';
}

/**
 * Step 1 prompt fragment. Append to the agent's system or user message for
 * the selection LLM call. The agent must reply with strict JSON shape
 * `{"activated_skills":[<slug>,...]}` — `parse-skill-selection.ts` tolerates
 * fenced code and prose around the JSON object.
 */
export function composeSkillSelectionPrompt(
  manifest: readonly SkillManifest[],
  taskHint: string,
): string {
  if (manifest.length === 0) return '';
  const lines: string[] = [
    '## Your Capability Repertoire',
    '',
    `You have ${manifest.length} skill${manifest.length === 1 ? '' : 's'} available. Each is a craft playbook you can activate when relevant. Choose ONLY the ones you will actually apply to this task — do not activate a skill just because its scope matches.`,
    '',
    `**Task hint:** ${taskHint}`,
    '',
    '### Available skills',
    '',
  ];
  for (const m of manifest) {
    const flag = m.frontmatter.hard ? ' [HARD]' : '';
    lines.push(`- \`${m.slug}\`${flag} — ${m.frontmatter.description}`);
    lines.push(`  scope: ${describeApplicability(m)}`);
  }
  lines.push('');
  lines.push('### Your reply');
  lines.push('');
  lines.push('Reply with ONLY a JSON object of this exact shape (no prose, no markdown fences):');
  lines.push('');
  lines.push('```json');
  lines.push('{"activated_skills": ["<slug>", "..."]}');
  lines.push('```');
  lines.push('');
  lines.push('An empty array is valid if no skills are relevant to this task. Do not invent slugs — use only the slugs listed above.');
  return lines.join('\n');
}

/**
 * Step 2 prompt fragment. Append to the agent's user message right before
 * the task-specific instructions. The header is craft-tone — these are
 * playbooks the agent draws on, not external rules imposed on it.
 */
export function composeActivePlaybooksBlock(bodies: readonly LoadedSkill[]): string {
  if (bodies.length === 0) return '';
  const sections: string[] = [];
  for (const s of bodies) {
    sections.push(
      [
        `### ${s.frontmatter.name}`,
        '',
        `_${s.frontmatter.description}_`,
        '',
        s.body.trim(),
      ].join('\n'),
    );
  }
  return [
    '## Active Playbooks for This Task',
    '',
    'The following are your craft playbooks for the current work. Treat each as a working reference — apply techniques where they fit, ignore sections that do not apply to this specific task.',
    '',
    ...sections,
    '',
  ]
    .join('\n')
    .trimEnd();
}

// ───────────────── LEGACY — single-step eager (deprecated) ─────────────────

/**
 * @deprecated Use the two-step pattern: `getAgentSkillManifest` →
 *   `loadAgentSkillBodies` → `composeActivePlaybooksBlock`. This single-step
 *   helper is retained only for callers not yet migrated and will be
 *   removed once all production agents are on the lazy-load path.
 */
export interface LoadedAgentSkills {
  block: string;
  count: number;
  truncatedCount: number;
}

/**
 * @deprecated See above.
 */
export async function loadAgentSkills(args: LoadAgentSkillsArgs): Promise<LoadedAgentSkills> {
  const skills = await selectSkills(ctxFromArgs(args));
  if (skills.length === 0) {
    return { block: '', count: 0, truncatedCount: 0 };
  }

  const sections: string[] = [];
  let budget = TOTAL_BODY_BUDGET;
  let included = 0;
  let truncated = 0;
  for (const s of skills) {
    if (budget <= 0) {
      truncated += 1;
      continue;
    }
    const body = s.body.length <= budget ? s.body.trim() : s.body.slice(0, budget - 64).trim() + '\n\n[…skill body truncated for context budget…]';
    budget -= body.length;
    sections.push(
      [
        `### ${s.frontmatter.name}`,
        '',
        `_${s.frontmatter.description}_`,
        '',
        body,
      ].join('\n'),
    );
    included += 1;
  }

  const truncatedNote =
    truncated > 0
      ? `\n\n[${truncated} more matching skills omitted for context budget]`
      : '';

  const block = [
    '## Active Playbooks for This Task',
    '',
    'The following are your craft playbooks for the current work. Treat each as a working reference — apply techniques where they fit, ignore sections that do not apply to this specific task.',
    '',
    ...sections,
    truncatedNote,
    '',
  ]
    .join('\n')
    .trimEnd();

  return { block, count: included, truncatedCount: truncated };
}
