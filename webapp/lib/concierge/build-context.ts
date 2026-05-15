// ──────────────────────────────────────────────────────────────────────────────
// lib/concierge/build-context.ts
// Shared helper to resolve series_id + genre from an episodeId and produce the
// ACTIVE_RULES block from the skill selector. Used by both the streaming chat
// route and the non-streaming /api/concierge/auto-react endpoint so PA sees
// the same Director canon either way.
//
// Sprint q1 (2026-05-15) — auto-react path.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types.gen';
import { loadAgentSkills } from '@/lib/agents/load-skills';

export interface ResolvedSkillsContext {
  activeRules: string | null;
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
    const bundle = await loadAgentSkills({
      agentId: 'EXEC-CONC',
      episode_id: episodeId ?? undefined,
      series_id: seriesId ?? undefined,
      genre: genre ?? undefined,
    });
    return { activeRules: bundle.count > 0 ? bundle.block : null, seriesId, genre };
  } catch {
    return { activeRules: null, seriesId, genre };
  }
}
