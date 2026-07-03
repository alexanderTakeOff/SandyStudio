// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/state-matrix.ts
//
// Фаза 1 (docs/AUTONOMY-IMPLEMENTATION-PLAN.md) — the Episode State Matrix.
//
// ONE canonical, READ-ONLY projection over `assets` that answers "where is
// everything right now" for the whole episode: per-shot × per-stage status +
// version + asset_id + freshness, plus music / final-cut / reserved gates.
//
// This is the FOUNDATION the rest of the autonomy stack reads:
//   - the code muscle (Фаза 2 reconciler) decides what to auto-advance from it;
//   - the conductor (Фаза 4) reads the same projection to pick a high-level move;
//   - the Director UI + the markdown render show the identical truth.
//
// It is a pure projection — nothing in the running pipeline depends on it, so it
// cannot break generation. It only READS.
//
// Anti-additivity: this generalizes the ad-hoc "latest APPROVED per shot" logic
// scattered across next-events / stitch-gate / freshness into a single place,
// and generalizes the anchor-specific freshness primitive
// (checkPlanAnchorFreshness) into a stage-agnostic `input_versions` comparison.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/types.gen';
import { extractShotsFromStoryboard, excludedShotIdsFromEpisodeMeta } from '../api/animatic-shotlist';
import { resolveReservedGates } from './production-plan';

/** Per-shot production stages, in dependency order (upstream → downstream). */
export const STAGE_ORDER = ['ref_plan', 'ref_image', 'shot_plan', 'video'] as const;
export type StageName = (typeof STAGE_ORDER)[number];

/** file_type prefix that materializes each stage. */
const FILE_TYPE_BY_STAGE: Record<StageName, string> = {
  ref_plan: 'SPC-ref_plan',
  ref_image: 'IMG-episode_ref',
  shot_plan: 'SPC-shot_plan',
  video: 'VID-shot',
};

/** The immediate upstream stage each stage is built from (null = root). Used by
 *  the generic freshness comparison — `fresh` means the chosen asset was built
 *  against the CURRENT upstream version. */
const UPSTREAM_OF: Record<StageName, StageName | null> = {
  ref_plan: null,
  ref_image: 'ref_plan',
  shot_plan: 'ref_image',
  video: 'shot_plan',
};

export interface StageState {
  /** DRAFT | REVIEW | APPROVED | LOCKED | REVISION | INVALIDATED | null(absent). */
  status: string | null;
  version: number | null;
  asset_id: string | null;
  /** True when built from the current upstream version (or nothing to doubt). */
  fresh: boolean;
  /** Human-readable reason this stage is blocked / stale, when applicable. */
  blocked_reason?: string;
}

export interface ShotState {
  shot_id: string;
  excluded: boolean;
  stages: Record<StageName, StageState>;
}

export interface EpisodeStateMatrix {
  episode_id: string;
  episode_code: string | null;
  governance_mode: string | null;
  shots: ShotState[];
  music: { status: string | null; asset_id: string | null };
  final_cut: { status: string | null; asset_id: string | null; version: number | null };
  gates: { reserved: readonly string[] };
}

// ── Asset row view ─────────────────────────────────────────────────────────────

interface AssetRow {
  id: string;
  file_type: string;
  status: string | null;
  version: number | null;
  metadata: unknown;
  created_at?: string | null;
}

/** Resolve a per-shot asset's shot_id, honoring both metadata conventions:
 *  IMG-episode_ref stores it under `shot_reference.shot_id`; the plans + video
 *  store it under `metadata.shot_id`. */
function shotIdOfAsset(row: AssetRow): string | null {
  const meta = (row.metadata ?? null) as
    | { shot_id?: unknown; shot_reference?: { shot_id?: unknown } }
    | null;
  if (meta && typeof meta.shot_id === 'string') return meta.shot_id;
  const sr = meta?.shot_reference;
  if (sr && typeof sr.shot_id === 'string') return sr.shot_id;
  return null;
}

/** Recorded upstream versions this asset was built from, if the generator wrote
 *  them. Shape: `{ [stage]: version }`. Absent until Фаза 1b wires the writers —
 *  absence is treated as "no basis to doubt" (fresh). */
function inputVersionsOf(row: AssetRow): Record<string, number> | null {
  const meta = (row.metadata ?? null) as { input_versions?: unknown } | null;
  const iv = meta?.input_versions;
  if (!iv || typeof iv !== 'object') return null;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(iv as Record<string, unknown>)) {
    if (typeof v === 'number') out[k] = v;
  }
  return out;
}

/** Pick the current (highest-version) row from a group; ties break on created_at. */
function pickLatest(rows: AssetRow[]): AssetRow | null {
  if (rows.length === 0) return null;
  return [...rows].sort((a, b) => {
    const dv = (b.version ?? 0) - (a.version ?? 0);
    if (dv !== 0) return dv;
    return String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''));
  })[0];
}

const EMPTY_STAGE: StageState = { status: null, version: null, asset_id: null, fresh: true };

// ── Shot spine ──────────────────────────────────────────────────────────────

/** The ordered shot_id spine for the episode. Prefer the APPROVED/LOCKED
 *  storyboard (the authored order); fall back to the distinct shot_ids seen
 *  across per-shot assets (so an in-flight episode without an approved board
 *  still projects). */
async function resolveShotSpine(
  supabase: SupabaseClient<Database>,
  episodeId: string,
  perShotRows: AssetRow[],
): Promise<string[]> {
  const { data: stbRow } = await supabase
    .from('assets')
    .select('content')
    .eq('episode_id', episodeId)
    .like('file_type', 'STB%')
    .in('status', ['APPROVED', 'LOCKED'])
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  const content = (stbRow as { content?: string | null } | null)?.content ?? null;
  if (content) {
    const shots = extractShotsFromStoryboard(content).map((s) => s.shot_id);
    if (shots.length > 0) return dedupePreserveOrder(shots);
  }
  // Fallback: distinct shot_ids across per-shot assets, sorted for stability.
  const seen = new Set<string>();
  for (const r of perShotRows) {
    const sid = shotIdOfAsset(r);
    if (sid) seen.add(sid);
  }
  return [...seen].sort();
}

function dedupePreserveOrder(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

// ── The projection ─────────────────────────────────────────────────────────────

/**
 * Build the canonical state matrix for an episode. READ-ONLY: performs only
 * SELECTs; never writes. Safe to call on any event.
 */
export async function getEpisodeStateMatrix(
  supabase: SupabaseClient<Database>,
  episodeId: string,
): Promise<EpisodeStateMatrix> {
  // Episode header + governance + production plan / excluded set.
  const { data: epRow } = await supabase
    .from('episodes')
    .select('episode_code,governance_mode,metadata')
    .eq('id', episodeId)
    .maybeSingle();
  const ep = epRow as
    | { episode_code?: string | null; governance_mode?: string | null; metadata?: unknown }
    | null;
  const excluded = excludedShotIdsFromEpisodeMeta(ep?.metadata);
  const reserved = resolveReservedGates(ep?.metadata);

  // One read of every asset for the episode. Bounded (~hundreds); project in JS.
  const { data: assetsData } = await supabase
    .from('assets')
    .select('id,file_type,status,version,metadata,created_at')
    .eq('episode_id', episodeId);
  const allRows = (assetsData ?? []) as AssetRow[];

  const perShotStageFileTypes = new Set(Object.values(FILE_TYPE_BY_STAGE));
  const perShotRows = allRows.filter((r) =>
    [...perShotStageFileTypes].some((ft) => (r.file_type ?? '').startsWith(ft)),
  );

  const spine = await resolveShotSpine(supabase, episodeId, perShotRows);

  // Index: stage → shot_id → rows.
  const byStageShot: Record<StageName, Map<string, AssetRow[]>> = {
    ref_plan: new Map(),
    ref_image: new Map(),
    shot_plan: new Map(),
    video: new Map(),
  };
  for (const row of perShotRows) {
    const stage = stageOfFileType(row.file_type);
    if (!stage) continue;
    const sid = shotIdOfAsset(row);
    if (!sid) continue;
    const map = byStageShot[stage];
    (map.get(sid) ?? map.set(sid, []).get(sid)!).push(row);
  }

  // First pass: chosen row per (shot, stage) → StageState without freshness.
  const chosen: Record<StageName, Map<string, AssetRow>> = {
    ref_plan: new Map(),
    ref_image: new Map(),
    shot_plan: new Map(),
    video: new Map(),
  };
  for (const stage of STAGE_ORDER) {
    for (const [sid, rows] of byStageShot[stage]) {
      const latest = pickLatest(rows);
      if (latest) chosen[stage].set(sid, latest);
    }
  }

  const shots: ShotState[] = spine.map((shotId) => {
    const stages = {} as Record<StageName, StageState>;
    for (const stage of STAGE_ORDER) {
      const row = chosen[stage].get(shotId);
      if (!row) {
        stages[stage] = { ...EMPTY_STAGE };
        continue;
      }
      const { fresh, reason } = computeFreshness(stage, shotId, row, chosen);
      stages[stage] = {
        status: row.status ?? null,
        version: row.version ?? null,
        asset_id: row.id,
        fresh,
        ...(reason ? { blocked_reason: reason } : {}),
      };
    }
    return { shot_id: shotId, excluded: excluded.has(shotId), stages };
  });

  // Episode-level projections.
  const musicRow = pickLatest(
    allRows.filter((r) => r.file_type === 'AUD-music' && r.status === 'APPROVED'),
  );
  const finalCutRow = pickLatest(allRows.filter((r) => r.file_type === 'VID-final_cut'));

  return {
    episode_id: episodeId,
    episode_code: ep?.episode_code ?? null,
    governance_mode: ep?.governance_mode ?? null,
    shots,
    music: {
      status: musicRow?.status ?? null,
      asset_id: musicRow?.id ?? null,
    },
    final_cut: {
      status: finalCutRow?.status ?? null,
      asset_id: finalCutRow?.id ?? null,
      version: finalCutRow?.version ?? null,
    },
    gates: { reserved },
  };
}

function stageOfFileType(fileType: string | null): StageName | null {
  if (!fileType) return null;
  for (const stage of STAGE_ORDER) {
    if (fileType.startsWith(FILE_TYPE_BY_STAGE[stage])) return stage;
  }
  return null;
}

/**
 * Generic freshness: an asset is fresh unless it recorded (in
 * `metadata.input_versions`) a specific upstream version that no longer matches
 * the CURRENT upstream version in the matrix. Absent `input_versions` → fresh
 * (no basis to doubt — the anchor-specific check still guards ref images at the
 * executor). This is the stage-agnostic generalization of the anchor-freshness
 * primitive, and the invalidation basis for `downstreamCone`.
 */
function computeFreshness(
  stage: StageName,
  shotId: string,
  row: AssetRow,
  chosen: Record<StageName, Map<string, AssetRow>>,
): { fresh: boolean; reason?: string } {
  // INVALIDATED status is stale by definition.
  if ((row.status ?? '') === 'INVALIDATED') {
    return { fresh: false, reason: 'asset marked INVALIDATED' };
  }
  const upstream = UPSTREAM_OF[stage];
  if (!upstream) return { fresh: true };
  const recorded = inputVersionsOf(row);
  if (!recorded || typeof recorded[upstream] !== 'number') return { fresh: true };
  const currentUpstream = chosen[upstream].get(shotId);
  const currentVersion = currentUpstream?.version ?? null;
  if (currentVersion !== null && currentVersion !== recorded[upstream]) {
    return {
      fresh: false,
      reason: `stale: built from ${upstream} v${recorded[upstream]}, current is v${currentVersion}`,
    };
  }
  return { fresh: true };
}

// ── Downstream cone ─────────────────────────────────────────────────────────────

/**
 * The set of nodes that must be invalidated when (shotId, stage) changes: every
 * DOWNSTREAM stage of the same shot, plus the episode-level final cut (always
 * downstream of any shot's video). Pure — the reconciler uses this to invalidate
 * only the affected cone, never the whole episode.
 */
export function downstreamCone(
  shotId: string,
  stage: StageName,
): { shotId: string; stage: StageName }[] & { includesFinalCut?: boolean } {
  const idx = STAGE_ORDER.indexOf(stage);
  const nodes = STAGE_ORDER.slice(idx + 1).map((s) => ({ shotId, stage: s }));
  const result = nodes as { shotId: string; stage: StageName }[] & { includesFinalCut?: boolean };
  // Any per-shot change ultimately invalidates the assembled final cut.
  result.includesFinalCut = true;
  return result;
}

// ── Human-readable render (same truth the conductor + Director UI see) ──────────

export function renderStateMatrixMarkdown(m: EpisodeStateMatrix): string {
  const lines: string[] = [];
  lines.push(`# State Matrix — ${m.episode_code ?? m.episode_id}`);
  lines.push('');
  lines.push(`- governance: \`${m.governance_mode ?? '—'}\``);
  lines.push(`- music: **${m.music.status ?? 'none'}**`);
  lines.push(`- final cut: **${m.final_cut.status ?? 'none'}**${m.final_cut.version ? ` (v${m.final_cut.version})` : ''}`);
  lines.push(`- reserved gates: ${m.gates.reserved.map((g) => `\`${g}\``).join(' · ')}`);
  lines.push('');
  lines.push('| shot | ref_plan | ref_image | shot_plan | video |');
  lines.push('|---|---|---|---|---|');
  for (const s of m.shots) {
    const cells = STAGE_ORDER.map((stage) => renderCell(s.stages[stage]));
    const shotLabel = s.excluded ? `~~${s.shot_id}~~` : s.shot_id;
    lines.push(`| ${shotLabel} | ${cells.join(' | ')} |`);
  }
  lines.push('');
  // Surface any blocked/stale cells explicitly beneath the table.
  const blocked: string[] = [];
  for (const s of m.shots) {
    for (const stage of STAGE_ORDER) {
      const cell = s.stages[stage];
      if (cell.blocked_reason) blocked.push(`- ${s.shot_id} · ${stage}: ${cell.blocked_reason}`);
    }
  }
  if (blocked.length > 0) {
    lines.push('## Blocked / stale');
    lines.push(...blocked);
  }
  return lines.join('\n');
}

function renderCell(cell: StageState): string {
  if (!cell.status) return '·';
  const v = cell.version ? ` v${cell.version}` : '';
  const staleMark = cell.fresh ? '' : ' ⚠️';
  return `${cell.status}${v}${staleMark}`;
}
