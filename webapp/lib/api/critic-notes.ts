// ──────────────────────────────────────────────────────────────────────────────
// lib/api/critic-notes.ts
// Collect a shot's persisted critic remarks (EPREV ref-plan critic + CREAD
// readability, eref phase) into revisionNote bullets, so a Director REVISION
// click re-authors the Designer Plan WITH the critics' hard acceptance criteria
// — not just the Director's terse note. Closes the gap the E13 run surfaced:
// "замечания критиков прямиком не попадают в план перегенерации".
//
// Reuses the acceptance_criteria / failed_checks shape both critics already emit
// (episode-reference-critic.ts / creative-readability-critic.ts). Kept
// dependency-light (a local JSON-block parser, mirroring the copies already in
// next-events.ts / episode-references.ts) so the approve route doesn't drag the
// heavy runner modules into its import graph.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types.gen';

/** Last fenced ```json block of an asset's markdown content (dependency-light copy). */
function parseLastJsonBlock(content: string | null | undefined): Record<string, unknown> | null {
  if (typeof content !== 'string') return null;
  const matches = [...content.matchAll(/```json\s*([\s\S]+?)```/g)];
  const last = matches[matches.length - 1]?.[1];
  if (!last) return null;
  try {
    const parsed = JSON.parse(last.trim());
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Pull acceptance_criteria + failed_checks bullets from a verdict source
 * (either the REV asset's metadata or its parsed content body). `failed_checks`
 * entries are strings (V01-V09 codes) OR `{ check, diagnosis }` objects
 * (CREAD haltNoPlaybook shape) — both are flattened to a bullet.
 */
function extractBullets(source: Record<string, unknown> | null | undefined): string[] {
  if (!source) return [];
  const out: string[] = [];
  const ac = source.acceptance_criteria;
  if (Array.isArray(ac)) {
    for (const v of ac) if (typeof v === 'string' && v.trim()) out.push(v.trim());
  }
  const fc = source.failed_checks;
  if (Array.isArray(fc)) {
    for (const v of fc) {
      if (typeof v === 'string' && v.trim()) {
        out.push(v.trim());
      } else if (v && typeof v === 'object') {
        const o = v as { check?: unknown; diagnosis?: unknown };
        const parts = [o.check, o.diagnosis].filter(
          (x): x is string => typeof x === 'string' && x.trim().length > 0,
        );
        if (parts.length) out.push(parts.join(': '));
      }
    }
  }
  return out;
}

type RevRow = {
  file_type: string;
  content: string | null;
  metadata: unknown;
  created_at: string | null;
};

/**
 * Collect the newest EPREV (`REV-ref_plan*`) + CREAD-eref (`REV-readability`,
 * `phase='eref'`) remarks for `shotId` in the episode, as revisionNote bullets.
 * One entry per critic family (newest wins — rows are read created_at DESC).
 * Empty array when no critic has spoken (best-effort; never throws).
 */
export async function collectRefCriticNotes(
  supabase: SupabaseClient<Database>,
  episodeId: string,
  shotId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from('assets')
    .select('file_type,content,metadata,created_at')
    .eq('episode_id', episodeId)
    .or('file_type.like.REV-ref_plan%,file_type.eq.REV-readability')
    .order('created_at', { ascending: false });

  const rows = (data ?? []) as RevRow[];
  const bullets: string[] = [];
  const seenFamily = new Set<string>();

  for (const r of rows) {
    const meta = (r.metadata ?? null) as Record<string, unknown> | null;
    // CREAD covers eref + vanim phases — only eref-phase readability belongs to
    // a reference revision.
    if (r.file_type === 'REV-readability' && meta?.phase !== 'eref') continue;

    const body = parseLastJsonBlock(r.content);
    const shotMatches =
      (typeof meta?.shot_id === 'string' && meta.shot_id === shotId) ||
      r.file_type === `REV-ref_plan-${shotId}` ||
      (body != null && typeof body.shot_id === 'string' && body.shot_id === shotId);
    if (!shotMatches) continue;

    const family = r.file_type.startsWith('REV-ref_plan') ? 'eprev' : 'cread';
    if (seenFamily.has(family)) continue; // newest-wins
    seenFamily.add(family);

    const fromMeta = extractBullets(meta);
    bullets.push(...(fromMeta.length > 0 ? fromMeta : extractBullets(body)));
  }
  return bullets;
}

/**
 * Merge the Director's terse revision note with the critics' acceptance-criteria
 * bullets into ONE revisionNote the Designer treats as hard contract. Returns
 * null when there is nothing to say.
 */
export function mergeRevisionNote(
  directorNote: string | null | undefined,
  criticBullets: string[],
): string | null {
  const parts: string[] = [];
  const note = typeof directorNote === 'string' ? directorNote.trim() : '';
  if (note) parts.push(note);
  if (criticBullets.length > 0) {
    parts.push('Critic acceptance criteria (hard contract — satisfy each):');
    for (const b of criticBullets) parts.push(`- ${b}`);
  }
  return parts.length > 0 ? parts.join('\n') : null;
}
