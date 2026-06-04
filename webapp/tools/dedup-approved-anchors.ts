/**
 * dedup-approved-anchors — one-time cleanup of the single-approved invariant
 * across ALL slot families (Director rule 2026-06-04, UNIT 1).
 *
 * Background: before the generalized approve-route auto-demote, approving /
 * locking a newer asset did NOT always demote prior occupants, so multiple
 * APPROVED (or LOCKED for SBL) rows piled up per slot. This sweeps every slot
 * group with >1 occupant, keeps the NEWEST (version desc, then created_at
 * desc), and demotes the rest to INVALIDATED (+ demoted_reason
 * 'superseded_cleanup') — matching the approve-route behaviour.
 *
 * Slot families (same as resolveSlotDescriptor in the approve route):
 *   - IMG-anchor        → (episode, shot_id, anchor_position)   [APPROVED]
 *   - SPC-shot_plan / -% → (episode, shot_id)                    [APPROVED]
 *   - VID-shot          → (episode, shot_id)                    [APPROVED]
 *   - SPC-ref_plan / -% → (episode, shot_id)                    [APPROVED]
 *   - IMG-episode_ref   → (episode, shot_reference.shot_id)     [APPROVED]
 *   - SBL-*             → (series, file_type)                   [LOCKED]
 *
 * This MUST be runnable BEFORE the 0036 partial-unique-index migration — the
 * orchestrator runs the dedup first, then `supabase db push`. Existing
 * duplicate occupants would otherwise make index creation fail.
 *
 * Idempotent: a group with <=1 occupant is skipped, and every demote is
 * guarded on `.eq('status', <occupyingStatus>)` so re-runs are no-ops.
 *
 * Usage (from webapp/):
 *   npm run dedup-approved-anchors -- --dry-run [--episode <uuid>]
 *   npm run dedup-approved-anchors --            [--episode <uuid>]
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (load via --env-file=.env.local)',
  );
}
const sb = createClient(url, key);

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const epIdx = args.indexOf('--episode');
const episodeFilter = epIdx >= 0 ? (args[epIdx + 1] ?? null) : null;

type OccupyingStatus = 'APPROVED' | 'LOCKED';

interface AssetRow {
  id: string;
  episode_id: string | null;
  series_id: string | null;
  file_type: string;
  status: string;
  version: number | null;
  created_at: string | null;
  metadata: unknown;
}

/** One slot family to sweep. */
interface SlotFamily {
  readonly label: string;
  readonly occupyingStatus: OccupyingStatus;
  /** `file_type LIKE` pattern selecting candidate rows. */
  readonly fileTypeLike: string;
  /**
   * Build a stable slot key for a row, or null if the row carries no resolvable
   * slot (e.g. legacy v1 EREF without shot_id) — such rows are left untouched.
   */
  readonly slotKey: (row: AssetRow) => string | null;
}

/** Extract shot_id from metadata.shot_id (no content fallback in batch sweep). */
function metaShotId(metadata: unknown): string | null {
  const sid = (metadata as { shot_id?: unknown } | null)?.shot_id;
  return typeof sid === 'string' && sid.length > 0 ? sid : null;
}

/** Extract shot_reference.shot_id (EREF v2 / anchor shape). */
function refShotId(metadata: unknown): string | null {
  const sid = (metadata as { shot_reference?: { shot_id?: unknown } } | null)
    ?.shot_reference?.shot_id;
  return typeof sid === 'string' && sid.length > 0 ? sid : null;
}

const FAMILIES: ReadonlyArray<SlotFamily> = [
  {
    label: 'IMG-anchor',
    occupyingStatus: 'APPROVED',
    fileTypeLike: 'IMG-anchor%',
    slotKey: (r) => {
      const sid = refShotId(r.metadata);
      const pos = (r.metadata as { anchor_position?: unknown } | null)?.anchor_position;
      if (!sid || (pos !== 'start' && pos !== 'end')) return null;
      return `${r.episode_id}|${sid}|${pos}`;
    },
  },
  {
    label: 'IMG-episode_ref',
    occupyingStatus: 'APPROVED',
    fileTypeLike: 'IMG-episode_ref%',
    slotKey: (r) => {
      const sid = refShotId(r.metadata);
      return sid ? `${r.episode_id}|${sid}` : null;
    },
  },
  {
    label: 'SPC-shot_plan',
    occupyingStatus: 'APPROVED',
    fileTypeLike: 'SPC-shot_plan%',
    slotKey: (r) => {
      const sid = metaShotId(r.metadata);
      return sid ? `${r.episode_id}|${sid}` : null;
    },
  },
  {
    label: 'VID-shot',
    occupyingStatus: 'APPROVED',
    fileTypeLike: 'VID-shot%',
    slotKey: (r) => {
      const sid = metaShotId(r.metadata);
      return sid ? `${r.episode_id}|${sid}` : null;
    },
  },
  {
    label: 'SPC-ref_plan',
    occupyingStatus: 'APPROVED',
    fileTypeLike: 'SPC-ref_plan%',
    slotKey: (r) => {
      const sid = metaShotId(r.metadata);
      return sid ? `${r.episode_id}|${sid}` : null;
    },
  },
  {
    label: 'SBL',
    occupyingStatus: 'LOCKED',
    fileTypeLike: 'SBL%',
    // SBL is series-scoped; slot = (series_id, exact file_type).
    slotKey: (r) => (r.series_id ? `${r.series_id}|${r.file_type}` : null),
  },
];

function sortNewestFirst(a: AssetRow, b: AssetRow): number {
  const vd = (b.version ?? 0) - (a.version ?? 0);
  if (vd !== 0) return vd;
  return (b.created_at ?? '').localeCompare(a.created_at ?? '');
}

async function sweepFamily(family: SlotFamily): Promise<{ groups: number; demoted: number }> {
  let q = sb
    .from('assets')
    .select('id,episode_id,series_id,file_type,status,version,created_at,metadata')
    .eq('status', family.occupyingStatus)
    .like('file_type', family.fileTypeLike);
  // Episode filter only applies to episode-scoped families; SBL is series-scoped
  // so it is skipped entirely when --episode is set (no episode_id to match).
  if (episodeFilter) {
    if (family.occupyingStatus === 'LOCKED') {
      return { groups: 0, demoted: 0 };
    }
    q = q.eq('episode_id', episodeFilter);
  }
  const { data, error } = await q;
  if (error) throw new Error(`[${family.label}] fetch failed: ${error.message}`);
  const rows = (data ?? []) as AssetRow[];

  const groups = new Map<string, AssetRow[]>();
  for (const r of rows) {
    const k = family.slotKey(r);
    if (!k) continue;
    const arr = groups.get(k) ?? [];
    arr.push(r);
    groups.set(k, arr);
  }

  let demoted = 0;
  let groupsWithDupes = 0;
  for (const [k, arr] of groups) {
    if (arr.length <= 1) continue;
    groupsWithDupes++;
    arr.sort(sortNewestFirst);
    const keep = arr[0]!;
    const losers = arr.slice(1);
    console.log(
      `  [${family.label}] ${k}  keep=${keep.id} (v${keep.version}) demote=${losers.length}`,
    );
    for (const l of losers) {
      if (dryRun) {
        demoted++;
        continue;
      }
      const newMeta = {
        ...((l.metadata as Record<string, unknown> | null) ?? {}),
        demoted_reason: 'superseded_cleanup',
      };
      const { error: dErr } = await sb
        .from('assets')
        .update({
          status: 'INVALIDATED',
          metadata: newMeta as unknown as Record<string, unknown>,
        } as never)
        .eq('id', l.id)
        // Idempotency guard: only demote if still occupying the slot.
        .eq('status', family.occupyingStatus);
      if (dErr) {
        console.log(`    ! failed ${l.id}: ${dErr.message}`);
        continue;
      }
      demoted++;
    }
  }
  return { groups: groupsWithDupes, demoted };
}

async function main(): Promise<void> {
  console.log(
    `\n  DEDUP SINGLE-APPROVED  ${dryRun ? '(DRY-RUN)' : 'APPLYING'}` +
      `${episodeFilter ? ` ep=${episodeFilter}` : ' ALL EPISODES + SERIES'}`,
  );
  console.log('  ' + '-'.repeat(64));

  let totalGroups = 0;
  let totalDemoted = 0;
  for (const family of FAMILIES) {
    const { groups, demoted } = await sweepFamily(family);
    totalGroups += groups;
    totalDemoted += demoted;
  }

  console.log('  ' + '-'.repeat(64));
  console.log(
    `  slot groups with duplicates: ${totalGroups}   ` +
      `siblings ${dryRun ? 'WOULD demote' : 'demoted'}: ${totalDemoted}`,
  );
  if (dryRun) console.log('\n  Dry-run only. Re-run without --dry-run to apply.\n');
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
