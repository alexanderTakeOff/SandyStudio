// ──────────────────────────────────────────────────────────────────────────────
// lib/concierge/skill-manifest.ts
// Format the capability manifest for the Prod Assistant system prompt.
// PA sees one line per available skill (slug + name + description + scope)
// and pulls the body on demand via the existing `getSkill(slug)` tool.
//
// Sprint φ.2 (2026-05-16). Replaces the σ.2 eager body-injection path that
// fed the full skill block straight into the prompt.
// ──────────────────────────────────────────────────────────────────────────────

import type { SkillManifest } from '../skills/load-skill-file';

function describeScope(m: SkillManifest): string {
  const aw = m.frontmatter.applies_when;
  if (!aw) return 'broad';
  const parts: string[] = [];
  if (aw.agent?.length) parts.push(`agent=${aw.agent.join('|')}`);
  if (aw.genre?.length) parts.push(`genre=${aw.genre.join('|')}`);
  if (aw.series_id?.length) parts.push(`series=${aw.series_id.length}`);
  if (aw.episode_id?.length) parts.push(`episode=${aw.episode_id.length}`);
  if (aw.gate?.length) parts.push(`gate=${aw.gate.join('|')}`);
  if (aw.file_type?.length) parts.push(`file_type=${aw.file_type.join('|')}`);
  return parts.length > 0 ? parts.join(' ') : 'broad';
}

/**
 * Format an agent skill manifest for the PA system prompt. Each line is a
 * bullet — slug, hard flag (if any), description, scope. Returns null when
 * the manifest is empty so the system-prompt-builder can skip the block.
 */
export function formatSkillManifestForPrompt(
  manifest: readonly SkillManifest[],
): string | null {
  if (manifest.length === 0) return null;
  const lines: string[] = [];
  for (const m of manifest) {
    const flag = m.frontmatter.hard ? ' [hard]' : '';
    lines.push(
      `- \`${m.slug}\`${flag} — ${m.frontmatter.name}: ${m.frontmatter.description}`,
    );
    lines.push(`  scope: ${describeScope(m)}`);
  }
  return lines.join('\n');
}
