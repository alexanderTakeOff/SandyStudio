// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/load-skills.ts
// Production-agent wrapper around lib/skills/select-skills. Returns a
// pre-formatted markdown block ready to append to the user message in any
// agent runner. Single source of formatting so every agent renders the same
// `## ACTIVE SKILLS` shape.
//
// Sprint σ.1 (2026-05-15).
// ──────────────────────────────────────────────────────────────────────────────

import { selectSkills, type SelectorContext } from '../skills/select-skills';

const TOTAL_BODY_BUDGET = 8_000;

export interface LoadAgentSkillsArgs {
  agentId: string;
  genre?: string;
  series_id?: string;
  episode_id?: string;
  gate?: string;
  file_type?: string;
}

export interface LoadedAgentSkills {
  block: string;
  count: number;
  truncatedCount: number;
}

function truncateBody(body: string, max: number): string {
  if (body.length <= max) return body;
  return body.slice(0, max - 64) + '\n\n[…skill body truncated for context budget…]';
}

export async function loadAgentSkills(args: LoadAgentSkillsArgs): Promise<LoadedAgentSkills> {
  const ctx: SelectorContext = {
    agent: args.agentId,
    genre: args.genre,
    series_id: args.series_id,
    episode_id: args.episode_id,
    gate: args.gate,
    file_type: args.file_type,
  };

  const skills = await selectSkills(ctx);
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
    const body = truncateBody(s.body.trim(), budget);
    budget -= body.length;
    const tag = s.frontmatter.hard ? 'HARD' : 'SOFT';
    sections.push(
      [
        `### ${s.frontmatter.name} (${tag})`,
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
    '## ACTIVE SKILLS (Director canon, MANDATORY)',
    '',
    'The following skills are the Director\'s standing rules that apply to this',
    'task. Treat each HARD skill as an acceptance criterion: your output must',
    'visibly satisfy every rule. SOFT skills are guidance — apply when relevant.',
    '',
    ...sections,
    truncatedNote,
    '',
  ]
    .join('\n')
    .trimEnd();

  return { block, count: included, truncatedCount: truncated };
}
