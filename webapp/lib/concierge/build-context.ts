// ──────────────────────────────────────────────────────────────────────────────
// lib/concierge/build-context.ts
// Shared helper for the Prod Assistant routes: resolves series_id + genre
// from an episodeId and returns a capability manifest formatted for the
// system prompt (Sprint φ.2 2026-05-16, lazy-load path).
//
// PA receives only manifest metadata (slug + name + description + scope)
// in her system prompt. Bodies load on demand via the `getSkill` tool.
// See docs/skills-as-capabilities.md.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types.gen';
import { getAgentSkillManifest } from '@/lib/agents/load-skills';
import { formatSkillManifestForPrompt } from '@/lib/concierge/skill-manifest';

export interface ResolvedSkillsContext {
  availablePlaybooks: string | null;
  seriesId: string | null;
  genre: string | null;
}

export async function resolveSkillsContext(
  supabase: SupabaseClient<Database>,
  episodeId: string | null,
): Promise<ResolvedSkillsContext> {
  let seriesId: string | null = null;
  let genre: string | null = null;
  try {
    if (episodeId) {
      const { data: ep } = await supabase
        .from('episodes')
        .select('series_id')
        .eq('id', episodeId)
        .maybeSingle();
      if (ep?.series_id) {
        seriesId = ep.series_id;
        const { data: sr } = await supabase
          .from('series')
          .select('genre')
          .eq('id', ep.series_id)
          .maybeSingle();
        const g = (sr as { genre?: string | null } | null)?.genre ?? null;
        if (g) genre = g;
      }
    }
    const manifestResult = await getAgentSkillManifest({
      agentId: 'EXEC-CONC',
      episode_id: episodeId ?? undefined,
      series_id: seriesId ?? undefined,
      genre: genre ?? undefined,
    });
    const availablePlaybooks =
      manifestResult.count > 0
        ? formatSkillManifestForPrompt(manifestResult.available)
        : null;
    return { availablePlaybooks, seriesId, genre };
  } catch {
    return { availablePlaybooks: null, seriesId, genre };
  }
}
