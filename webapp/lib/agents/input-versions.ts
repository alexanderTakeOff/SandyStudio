// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/input-versions.ts
//
// Фаза 1b (docs/AUTONOMY-IMPLEMENTATION-PLAN.md) — the WRITE side of generic
// freshness. When a per-shot generator saves its output, it stamps the versions
// of the upstream artifacts it was built from into `metadata.input_versions`.
// The state matrix (Фаза 1 read side) then compares those recorded versions to
// the CURRENT upstream versions: a mismatch = STALE, which the reconciler refuses
// to auto-approve and the downstream cone invalidates.
//
// Covered edges (the ones where a mid-run plan regen must invalidate downstream):
//   - EXEC-VANIM (shot_plan) ← ref_image
//   - EXEC-VGEN  (video)     ← shot_plan
// The ref_image ← ref_plan edge (EXEC-EREF, skip_save inside its own runner) is a
// small follow-up; matrix stays graceful (absent → fresh) until then.
//
// READ-ONLY + guarded: any failure returns null (→ no stamp → fresh), so this can
// never block generation.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/types.gen';

interface UpstreamSpec {
  /** matrix stage key recorded in input_versions. */
  upstreamStage: string;
  /** file_type prefix of the upstream artifact. */
  upstreamFileType: string;
}

/** Which upstream a per-shot generator's output was built from. */
const UPSTREAM_BY_AGENT: Record<string, UpstreamSpec> = {
  'EXEC-VANIM': { upstreamStage: 'ref_image', upstreamFileType: 'IMG-episode_ref' },
  'EXEC-VGEN': { upstreamStage: 'shot_plan', upstreamFileType: 'SPC-shot_plan' },
};

/** Resolve a per-shot asset's shot_id across both metadata conventions. */
function shotIdOf(metadata: unknown): string | null {
  const meta = (metadata ?? null) as
    | { shot_id?: unknown; shot_reference?: { shot_id?: unknown } }
    | null;
  if (meta && typeof meta.shot_id === 'string') return meta.shot_id;
  const sr = meta?.shot_reference;
  if (sr && typeof sr.shot_id === 'string') return sr.shot_id;
  return null;
}

/**
 * Compute `input_versions` for a generator's output — the latest APPROVED
 * upstream version for this shot. Returns null when the agent has no tracked
 * upstream, no shotId is known, or nothing APPROVED exists yet (→ caller omits
 * the stamp → matrix treats the cell as fresh).
 */
export async function computeInputVersions(
  supabase: SupabaseClient<Database>,
  agentId: string,
  episodeId: string,
  shotId: string | null,
): Promise<Record<string, number> | null> {
  const spec = UPSTREAM_BY_AGENT[agentId];
  if (!spec || !shotId) return null;
  try {
    const { data } = await supabase
      .from('assets')
      .select('metadata,version,status')
      .eq('episode_id', episodeId)
      .like('file_type', `${spec.upstreamFileType}%`)
      .eq('status', 'APPROVED');
    const rows = (data ?? []) as Array<{ metadata?: unknown; version?: number | null }>;
    let best: number | null = null;
    for (const r of rows) {
      if (shotIdOf(r.metadata) !== shotId) continue;
      const v = r.version ?? 0;
      if (best === null || v > best) best = v;
    }
    if (best === null) return null;
    return { [spec.upstreamStage]: best };
  } catch {
    return null;
  }
}
