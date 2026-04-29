// ──────────────────────────────────────────────────────────────────────────────
// lib/api/pipeline-stages.ts
// Episode pipeline stage derivation per pipeline_view.md §3.1 + §11.
// Maps episode + assets + jobs into a 10-stage DAG state snapshot.
// ──────────────────────────────────────────────────────────────────────────────

export type PipelineStageId =
  | 'brief'
  | 'story'
  | 'script'
  | 'storyboard'
  | 'world_check'
  | 'animatic'
  | 'generation'
  | 'distribution'
  | 'publish'
  | 'analytics';

export type PipelineNodeState =
  | 'idle'
  | 'running'
  | 'approved'
  | 'blocked'
  | 'failed';

export interface PipelineStageSnapshot {
  id: PipelineStageId;
  label: string;
  state: PipelineNodeState;
  agents: string[];
  latest_asset_id?: string;
  job_count?: { total: number; done: number; running: number; failed: number };
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

// Story stage is omitted: no current agent produces a story_brief asset.
// The chain goes Brief → EXEC-SW (Script) directly. ART-HW is a Level-2
// management agent (no Inngest function) and may emit story specs in
// future phases — when it does, add { id: 'story', ... } back here.
const STAGE_DEFINITIONS: Array<{ id: PipelineStageId; label: string; agents: string[] }> = [
  { id: 'brief',        label: 'Brief',        agents: ['Director'] },
  { id: 'script',       label: 'Script',       agents: ['EXEC-SW', 'EXEC-SREV'] },
  { id: 'storyboard',   label: 'Storyboard',   agents: ['EXEC-SB'] },
  { id: 'world_check',  label: 'World Check',  agents: ['EXEC-WCHK'] },
  { id: 'animatic',     label: 'Animatic',     agents: ['EXEC-EDIT'] },
  { id: 'generation',   label: 'Generation',   agents: ['EXEC-VGEN', 'EXEC-MGEN'] },
  { id: 'distribution', label: 'Distribution', agents: ['EXEC-COPY', 'EXEC-THUMB'] },
  { id: 'publish',      label: 'Publish',      agents: ['EXEC-PUB'] },
  { id: 'analytics',    label: 'Analytics',    agents: ['EXEC-ANAL'] },
];

// Heuristics for stage attribution from file_type prefix.
//
// runner.ts writes file_type values like:
//   - SPC-brief, SPC-metadata
//   - SCR-script
//   - REV-script_qa, REV-world_check, REV-publish_log, REV-analytics
//   - STB-storyboard, STB-act2, STB-act3
//   - VID-animatic, VID-shot-shotN
//   - IMG-thumbnail
//   - AUD-music-main
//
// Pre-Phase-5c heuristic compared `file_type === 'STB'` (bare code) which
// never matched the long form — DAG showed all stages idle.
const STAGE_FROM_ASSET = (asset: AssetLike): PipelineStageId | null => {
  const ft = asset.file_type;
  if (ft.startsWith('SPC-brief')) return 'brief';
  if (ft.startsWith('SPC-story')) return 'story';
  if (ft.startsWith('SCR'))       return 'script';
  if (ft.startsWith('STB'))       return 'storyboard';
  if (ft === 'REV-world_check')   return 'world_check';
  if (ft === 'REV-script_qa')     return 'script';
  if (ft.startsWith('VID-animatic')) return 'animatic';
  if (ft.startsWith('VID-shot') || ft.startsWith('AUD-music')) return 'generation';
  if (ft.startsWith('SPC-metadata') || ft.startsWith('IMG-thumbnail') || ft.startsWith('SPC-copy')) {
    return 'distribution';
  }
  if (ft.startsWith('REV-publish'))  return 'publish';
  if (ft.startsWith('REV-analytics')) return 'analytics';
  return null;
};

const STAGE_FROM_AGENT: Record<string, PipelineStageId> = {
  'Director':   'brief',
  'ART-HW':     'story',
  'EXEC-SW':    'script',
  'EXEC-SREV':  'script',
  'EXEC-SB':    'storyboard',
  'EXEC-WCHK':  'world_check',
  'EXEC-EDIT':  'animatic',
  'EXEC-VGEN':  'generation',
  'EXEC-MGEN':  'generation',
  'EXEC-COPY':  'distribution',
  'EXEC-THUMB': 'distribution',
  'EXEC-PUB':   'publish',
  'EXEC-ANAL':  'analytics',
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

  return STAGE_DEFINITIONS.map<PipelineStageSnapshot>((def) => {
    const stageAssets = assetsByStage.get(def.id) ?? [];
    const stageJobs = jobsByStage.get(def.id) ?? [];

    let state: PipelineNodeState = 'idle';

    // Approved if any APPROVED / LOCKED asset present in this stage
    if (stageAssets.some((a) => a.status === 'APPROVED' || a.status === 'LOCKED')) {
      state = 'approved';
    }

    // Running if any RUNNING / QUEUED jobs OR REVIEW asset (waiting Director)
    if (stageJobs.some((j) => j.status === 'RUNNING' || j.status === 'QUEUED')) {
      state = 'running';
    }
    if (state === 'idle' && stageAssets.some((a) => a.status === 'REVIEW')) {
      state = 'blocked';   // awaiting Director
    }

    // Failed if any FAILED job
    if (stageJobs.some((j) => j.status === 'FAILED')) {
      state = 'failed';
    }

    // Episode-status overrides
    if (def.id === 'brief' && status === 'BRIEF_APPROVED') state = 'approved';
    if (def.id === 'publish' && status === 'PUBLISHED') state = 'approved';
    if (def.id === 'analytics' && status === 'COMPLETE') state = 'approved';

    const latest = [...stageAssets].sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    )[0];

    return {
      id: def.id,
      label: def.label,
      state,
      agents: def.agents,
      latest_asset_id: latest?.id,
      job_count: {
        total: stageJobs.length,
        done: stageJobs.filter((j) => j.status === 'COMPLETED').length,
        running: stageJobs.filter((j) => j.status === 'RUNNING' || j.status === 'QUEUED').length,
        failed: stageJobs.filter((j) => j.status === 'FAILED').length,
      },
    };
  });
}
