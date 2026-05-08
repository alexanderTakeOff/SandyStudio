// ──────────────────────────────────────────────────────────────────────────────
// lib/api/pipeline-stages.ts
// Episode pipeline view derivation — backbone v2.5 (Step 5).
//
// Pre-Step-5 design grouped agents into stages (e.g. "Script" hid both EXEC-SW
// and EXEC-SREV under one row). Director's feedback (2026-05-01): show every
// agent as its own row, including background validators (`EXEC-SREV`,
// `EXEC-CONT` once it lands), so nothing happens invisibly.
//
// Pipeline rows now correspond 1-to-1 with agents, grouped visually by phase.
// `stage` was kept as the type name for backward compat, but conceptually
// each row is now a pipeline-agent slot.
// ──────────────────────────────────────────────────────────────────────────────

export type PipelineStageId =
  | 'brief'
  | 'screenwriter'
  | 'script_reviewer'
  | 'storyboarder'
  | 'continuity_check'
  | 'episode_references'
  | 'music_generator'
  | 'animatic'
  | 'visual_generator'
  | 'final_cut'
  | 'copywriter'
  | 'thumbnail_creator'
  | 'publisher'
  | 'analytics_collector'
  // Legacy ids kept so old test fixtures still compile during transition.
  | 'script'
  | 'storyboard'
  | 'episode_reference'
  | 'world_check'
  | 'generation'
  | 'distribution'
  | 'publish'
  | 'analytics'
  | 'story';

export type PipelineNodeState =
  | 'idle'
  | 'running'
  | 'approved'
  | 'blocked'
  | 'failed';

export type PipelinePhase =
  | 'pre-production'
  | 'production'
  | 'generation'
  | 'distribution'
  | 'analytics';

export interface PipelineStageSnapshot {
  id: PipelineStageId;
  /** Human label shown in the UI row. */
  label: string;
  /** Agents that contribute to this row. Now usually a single id. */
  agents: string[];
  /** Visual phase grouping for the pipeline view. */
  phase: PipelinePhase;
  /** Optional emoji for the row icon (matches registry.ts). */
  emoji?: string;
  state: PipelineNodeState;
  latest_asset_id?: string;
  latest_asset_type?: string;
  job_count?: { total: number; done: number; running: number; failed: number };
  /** Count of assets in this stage with status REVIEW. */
  assets_in_review?: number;
}

interface AssetLike {
  id: string;
  filename: string;
  file_type: string;
  status: string;
  agent_id: string | null;
  created_at: string;
}

interface JobLike {
  id: string;
  agent_id: string;
  status: string;
}

interface RowDef {
  id: PipelineStageId;
  label: string;
  agents: string[];
  phase: PipelinePhase;
  emoji: string;
}

// Per-agent rows. `world_check` (EXEC-WCHK) stays out of MVP pipeline view
// until Series Bible exists (Step 7+) — gate.ts and registry.ts still know
// about it for legacy compatibility.
//
// Phase A.2 (2026-05-08, Director directive q3b / LT-04): Music moved BEFORE
// Animatic. The audio reorg fires MGEN in parallel with EREF after world_check
// approves; EDIT (animatic) gates on BOTH being approved so the animatic
// preview already plays with music for pacing review. Director observed the
// pipeline view was still showing Music after Visual Generator — that was a
// stale visualisation; the actual event chain in approve/route.ts §189–258
// runs Music early. This row order now matches the event chain.
//
// Phase A.2 also added EXEC-STITCH (final cut) after VGEN — added here as
// `final_cut` so the DAG reflects the assembly stage Director can see.
const ROW_DEFINITIONS: ReadonlyArray<RowDef> = [
  { id: 'brief',               label: 'Brief',              agents: ['Director'],     phase: 'pre-production', emoji: '🎬' },
  { id: 'screenwriter',        label: 'Screenwriter',       agents: ['EXEC-SW'],      phase: 'pre-production', emoji: '✍️' },
  { id: 'script_reviewer',     label: 'Script Reviewer',    agents: ['EXEC-SREV'],    phase: 'pre-production', emoji: '🔍' },
  { id: 'storyboarder',        label: 'Storyboarder',       agents: ['EXEC-SB'],      phase: 'production',     emoji: '🎬' },
  { id: 'continuity_check',    label: 'Continuity Check',   agents: ['EXEC-CONT'],    phase: 'production',     emoji: '🌍' },
  { id: 'episode_references',  label: 'Episode references', agents: ['EXEC-EREF'],    phase: 'production',     emoji: '🖼️' },
  { id: 'music_generator',     label: 'Music',              agents: ['EXEC-MGEN'],    phase: 'production',     emoji: '🎵' },
  { id: 'animatic',            label: 'Animatic',           agents: ['EXEC-EDIT'],    phase: 'production',     emoji: '🎞️' },
  { id: 'visual_generator',    label: 'Visual Generator',   agents: ['EXEC-VGEN'],    phase: 'generation',     emoji: '🎥' },
  { id: 'final_cut',           label: 'Final Cut',          agents: ['EXEC-STITCH'],  phase: 'generation',     emoji: '🎬' },
  { id: 'copywriter',          label: 'Copywriter',         agents: ['EXEC-COPY'],    phase: 'distribution',   emoji: '📝' },
  { id: 'thumbnail_creator',   label: 'Thumbnail',          agents: ['EXEC-THUMB'],   phase: 'distribution',   emoji: '🖼️' },
  { id: 'publisher',           label: 'Publish',            agents: ['EXEC-PUB'],     phase: 'distribution',   emoji: '🚀' },
  { id: 'analytics_collector', label: 'Analytics',          agents: ['EXEC-ANAL'],    phase: 'analytics',      emoji: '📊' },
];

// Map a file_type → row id. Each agent's primary asset goes to its own row.
const STAGE_FROM_ASSET = (asset: AssetLike): PipelineStageId | null => {
  const ft = asset.file_type;
  if (ft.startsWith('SPC-brief')) return 'brief';
  if (ft.startsWith('SCR'))       return 'screenwriter';
  if (ft === 'REV-script_qa')     return 'script_reviewer';
  if (ft.startsWith('STB'))       return 'storyboarder';
  if (ft === 'REV-world_check')   return 'continuity_check';
  if (ft.startsWith('IMG-episode_ref')) return 'episode_references';
  if (ft.startsWith('VID-animatic'))   return 'animatic';
  if (ft.startsWith('VID-shot'))       return 'visual_generator';
  if (ft.startsWith('VID-final_cut'))  return 'final_cut';
  if (ft.startsWith('AUD-music'))      return 'music_generator';
  if (ft.startsWith('SPC-metadata') || ft.startsWith('SPC-copy')) return 'copywriter';
  if (ft.startsWith('IMG-thumbnail')) return 'thumbnail_creator';
  if (ft.startsWith('REV-publish'))   return 'publisher';
  if (ft.startsWith('REV-analytics')) return 'analytics_collector';
  return null;
};

const STAGE_FROM_AGENT: Record<string, PipelineStageId> = {
  'Director':   'brief',
  'EXEC-SW':    'screenwriter',
  'EXEC-SREV':  'script_reviewer',
  'EXEC-SB':    'storyboarder',
  'EXEC-CONT':  'continuity_check',
  'EXEC-WCHK':  'continuity_check', // legacy WCHK feeds the Continuity row when CONT is not yet shipped
  'EXEC-EREF':  'episode_references',
  'EXEC-EDIT':  'animatic',
  'EXEC-VGEN':   'visual_generator',
  'EXEC-STITCH': 'final_cut',
  'EXEC-MGEN':   'music_generator',
  'EXEC-COPY':  'copywriter',
  'EXEC-THUMB': 'thumbnail_creator',
  'EXEC-PUB':   'publisher',
  'EXEC-ANAL':  'analytics_collector',
};

export function buildPipelineSnapshot(
  episodeStatus: string,
  assets: AssetLike[],
  jobs: JobLike[],
): PipelineStageSnapshot[] {
  const assetsByStage = new Map<PipelineStageId, AssetLike[]>();
  for (const a of assets) {
    const sid = STAGE_FROM_ASSET(a);
    if (!sid) continue;
    if (!assetsByStage.has(sid)) assetsByStage.set(sid, []);
    assetsByStage.get(sid)!.push(a);
  }

  const jobsByStage = new Map<PipelineStageId, JobLike[]>();
  for (const j of jobs) {
    const sid = STAGE_FROM_AGENT[j.agent_id];
    if (!sid) continue;
    if (!jobsByStage.has(sid)) jobsByStage.set(sid, []);
    jobsByStage.get(sid)!.push(j);
  }

  const status = episodeStatus.toUpperCase();

  return ROW_DEFINITIONS.map<PipelineStageSnapshot>((def) => {
    const stageAssets = assetsByStage.get(def.id) ?? [];
    const stageJobs = jobsByStage.get(def.id) ?? [];

    let state: PipelineNodeState = 'idle';

    const hasApprovedAsset = stageAssets.some(
      (a) => a.status === 'APPROVED' || a.status === 'LOCKED',
    );
    const hasReviewAsset = stageAssets.some((a) => a.status === 'REVIEW');
    const hasRunningJob = stageJobs.some(
      (j) => j.status === 'RUNNING' || j.status === 'QUEUED',
    );
    const hasFailedJob = stageJobs.some((j) => j.status === 'FAILED');

    if (hasRunningJob) {
      state = 'running';
    } else if (hasApprovedAsset) {
      state = 'approved';
    } else if (hasReviewAsset) {
      state = 'blocked';
    } else if (hasFailedJob) {
      state = 'failed';
    }

    if (def.id === 'brief' && status === 'BRIEF_APPROVED') state = 'approved';
    if (def.id === 'publisher' && status === 'PUBLISHED') state = 'approved';
    if (def.id === 'analytics_collector' && status === 'COMPLETE') state = 'approved';

    const latest = [...stageAssets].sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    )[0];

    return {
      id: def.id,
      label: def.label,
      agents: def.agents,
      phase: def.phase,
      emoji: def.emoji,
      state,
      latest_asset_id: latest?.id,
      latest_asset_type: latest?.file_type,
      assets_in_review: stageAssets.filter((a) => a.status === 'REVIEW').length,
      job_count: {
        total: stageJobs.length,
        done: stageJobs.filter((j) => j.status === 'COMPLETED').length,
        running: stageJobs.filter((j) => j.status === 'RUNNING' || j.status === 'QUEUED').length,
        failed: stageJobs.filter((j) => j.status === 'FAILED').length,
      },
    };
  });
}
