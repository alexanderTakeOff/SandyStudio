// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/upstream.ts
// findApprovedAsset — the single newest-wins resolver for picking an upstream
// asset out of `inputs.upstream_assets`.
//
// F2 consolidation (2026-06-12, E07 smoke fallout): this function existed as
// TEN per-runner copies, four of which (animator, episode-reference-designer,
// thumbnail-designer, screenwriter) were unsorted `.find()` — first row in DB
// return order wins. With two APPROVED storyboards on the board (the SREV
// double-fire), the EREF Designer read STB v1 while the Artist's sorted copy
// read v2 → the SH03 mirror deadlock. One helper, one rule:
//
//   newest APPROVED wins — version desc.
//
// (upstream_assets rows don't carry created_at; loadAgentInputs additionally
// orders the query version-desc so raw `.find()` consumers inherit the same
// rule.)
// ──────────────────────────────────────────────────────────────────────────────

/** Superset of the per-runner row shapes loadAgentInputs returns. */
export interface UpstreamAssetLike {
  id?: string;
  file_type?: string | null;
  status?: string | null;
  content?: string | null;
  filename?: string | null;
  staging_path?: string | null;
  drive_path?: string | null;
  drive_web_view_url?: string | null;
  version?: number | null;
  metadata?: unknown;
}

const APPROVED_ONLY: ReadonlySet<string> = new Set(['APPROVED']);

/**
 * Episode Start Notice — a single, general-purpose episode-scoped vessel that
 * carries any pre-authoring information from the Director/Producer (Polina) to
 * the Writer: a large gag reservoir, extra directorial notes, references,
 * constraints — anything the Writer should have in hand that does NOT belong in
 * the often-read Brief.
 *
 * Why a separate asset (2026-07-11, Director q1b): the Brief (`SPC-brief`) is
 * read in ~20 places (Writer, Story-Editor, Storyboarder, Copywriter,
 * Continuity, Thumbnail, gates, UI…). Stuffing a 100-item gag bank into it
 * drags that payload through every read. The Brief carries the MUST-hit
 * directorial SPINE; the Start Notice is the RESERVOIR the Writer draws from —
 * advisory, not a beat-contract. Rides the existing `upstream_assets` bag with
 * zero loader change; only the Writer reads this file_type.
 */
export const START_NOTICE_FILE_TYPE = 'SPC-start_notice';

/**
 * Newest matching upstream asset (version desc) in an allowed status.
 * Default statuses: APPROVED only. Reviewer agents (Story Editor) pass
 * `statuses` with REVIEW/REVISION included — the reviewer IS the gate that
 * decides whether the latest version becomes APPROVED.
 */
export function findApprovedAsset<T extends UpstreamAssetLike>(
  upstream: readonly T[] | undefined,
  fileType: string,
  statuses: ReadonlySet<string> = APPROVED_ONLY,
): T | null {
  if (!upstream) return null;
  const candidates = upstream.filter(
    (a) => a.file_type === fileType && statuses.has(a.status ?? ''),
  );
  candidates.sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
  return candidates[0] ?? null;
}
