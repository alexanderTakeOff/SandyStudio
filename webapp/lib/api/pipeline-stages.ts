// ──────────────────────────────────────────────────────────────────────────────
// lib/api/pipeline-stages.ts
// Episode pipeline view derivation — Topic 3 systematization (19-row model).
//
// Pre-Step-5 design grouped agents into stages (e.g. "Script" hid both EXEC-SW
// and EXEC-SREV under one row). Director's feedback (2026-05-01): show every
// agent as its own row, including background critics (`EXEC-SREV`,
// `EXEC-WCHK`, etc.), so nothing happens invisibly.
//
// Topic 3 (2026-06-02, docs/topic3-pipeline-systematization-design.md): the
// pipeline now reflects the per-artifact operating model
//   Designer (plan) → Plan-Critic (verdict) → Artist (generate, $) → Output-Critic
// 19 ordered rows, each tagged `tier`:
//   - PRIMARY = Artist/Author/Editor + hard-gate stages (the ones that produce
//     the artifact the Director acts on)
//   - MUTED   = Designer (plan) + Critic (verdict) stages — they support a
//     PRIMARY row and collapse under it in the UI.
// `latest_verdict` (PASS/REVISE/FAIL) surfaces a Critic row's most recent
// judgment, parsed from the REV / Plan asset body or description.
// `serves` ties a MUTED row to the PRIMARY it gates (UI indent / collapse).
//
// `stage` was kept as the type name for backward compat, but conceptually
// each row is now a pipeline-agent slot. Legacy ids are preserved so old test
// fixtures and cached episode pages still resolve.
// ──────────────────────────────────────────────────────────────────────────────

export type PipelineStageId =
  | 'brief'
  | 'screenwriter'
  | 'script_critic'
  | 'storyboarder'
  | 'continuity_critic'
  | 'reference_designer'
  | 'reference_critic'
  | 'episode_references'
  | 'music_generator'
  | 'animatic'
  | 'shot_designer'
  | 'shot_critic'
  | 'visual_generator'
  | 'final_cut'
  | 'copywriter'
  | 'thumbnail_designer'
  | 'thumbnail_critic'
  | 'thumbnail_creator'
  | 'publisher'
  | 'analytics_collector'
  // Legacy ids kept so old test fixtures + cached pages still compile/resolve.
  // Topic 3 renamed: script_reviewer→script_critic, continuity_check→
  // continuity_critic, shot_planning→shot_designer. Old ids alias the new ones.
  | 'script_reviewer'
  | 'continuity_check'
  | 'shot_planning'
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

/**
 * Visual tier (Topic 3 §3). PRIMARY rows render full-weight; MUTED rows
 * (Designer plan + Critic verdict) collapse to a thin sub-line indented under
 * the PRIMARY they `serves`, expanding on click.
 */
export type PipelineTier = 'primary' | 'muted';

/**
 * Role-word per Topic 3 §2 vocabulary. Drives the subtitle / icon affordance
 * but is informational — tier is what the UI keys off for muting.
 */
export type PipelineRole =
  | 'input'
  | 'author'
  | 'designer'
  | 'critic'
  | 'artist'
  | 'editor'
  | 'publisher'
  | 'analyst';

/** Critic verdict surfaced on a row (Topic 3 §4 — workstation + muted line). */
export type PipelineVerdict = 'PASS' | 'REVISE' | 'FAIL';

export interface PipelineStageSnapshot {
  id: PipelineStageId;
  /** Human label shown in the UI row. */
  label: string;
  /** Optional role-specific subtitle (e.g. "Story Editor"). */
  subtitle?: string;
  /** Agents that contribute to this row. Now usually a single id. */
  agents: string[];
  /** Visual phase grouping for the pipeline view. */
  phase: PipelinePhase;
  /** Visual tier — PRIMARY full-weight, MUTED collapses under its `serves`. */
  tier: PipelineTier;
  /** Canonical role-word (Topic 3 §2). */
  role: PipelineRole;
  /**
   * For MUTED rows: the PRIMARY stage id this row serves (Critic tucks under
   * the artifact it gates; Designer tucks under the Artist it plans for).
   */
  serves?: PipelineStageId;
  /** Optional emoji for the row icon (matches registry.ts). */
  emoji?: string;
  state: PipelineNodeState;
  latest_asset_id?: string;
  latest_asset_type?: string;
  /** Most-recent Critic verdict for this row, if any (PASS/REVISE/FAIL). */
  latest_verdict?: PipelineVerdict;
  /**
   * True when the row is an honest empty slot — a role acknowledged in the
   * model but not yet staffed by an agent (Topic 3 §3 q11a, e.g.
   * `thumbnail_critic`). Renders "not staffed" and carries no actions.
   */
  unstaffed?: boolean;
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
  /** Optional — Critic verdict is parsed from here when present. */
  description?: string | null;
  /** Optional — Plan/REV body parsed for verdict when description absent. */
  content?: string | null;
}

interface JobLike {
  id: string;
  agent_id: string;
  status: string;
}

interface RowDef {
  id: PipelineStageId;
  label: string;
  subtitle?: string;
  agents: string[];
  phase: PipelinePhase;
  tier: PipelineTier;
  role: PipelineRole;
  serves?: PipelineStageId;
  emoji: string;
  /** Honest empty slot — no agent yet (Topic 3 q11a). */
  unstaffed?: boolean;
}

// Topic 3 (2026-06-02) — 19 ordered rows reflecting the per-artifact loop
// Designer → Plan-Critic → Artist → Output-Critic. Tier rule (systematic):
//   Artist/Author/Editor + hard-gate = PRIMARY; Designer(plan) + Critic(verdict) = MUTED.
//
// Labels are short English industry-standard role names per
// `lib/api/agent-names.ts`. Subtitles keep the friendly descriptor. Mirror any
// change in agent-names.ts + registry.ts display labels.
//
// Music sits in production phase BEFORE Animatic (audio reorg LT-04): EDIT
// gates on BOTH MGEN + EREF approved so the animatic preview plays with music.
const ROW_DEFINITIONS: ReadonlyArray<RowDef> = [
  { id: 'brief',               label: 'Brief',             agents: ['Director'],            phase: 'pre-production', tier: 'primary', role: 'input',     emoji: '🎬' },
  { id: 'screenwriter',        label: 'Writer',            agents: ['EXEC-SW'],             phase: 'pre-production', tier: 'primary', role: 'author',    emoji: '✍️' },
  { id: 'script_critic',       label: 'Script Critic',     subtitle: 'Story Editor',        agents: ['EXEC-SREV'],   phase: 'pre-production', tier: 'muted',   role: 'critic',  serves: 'screenwriter', emoji: '🔍' },
  { id: 'storyboarder',        label: 'Storyboard Artist', agents: ['EXEC-SB'],             phase: 'production',     tier: 'primary', role: 'author',    emoji: '🎬' },
  { id: 'continuity_critic',   label: 'Continuity Critic', subtitle: 'Script Supervisor',   agents: ['EXEC-CONT'],   phase: 'production',     tier: 'muted',   role: 'critic',  serves: 'storyboarder', emoji: '🌍' },
  { id: 'reference_designer',  label: 'Reference Designer', agents: ['EXEC-EREF-DESIGNER'], phase: 'production',     tier: 'muted',   role: 'designer', serves: 'episode_references', emoji: '🧠' },
  { id: 'reference_critic',    label: 'Reference Critic',  agents: ['EXEC-EPREV'],          phase: 'production',     tier: 'muted',   role: 'critic',  serves: 'episode_references', emoji: '🧐' },
  { id: 'episode_references',  label: 'Reference Artist',  agents: ['EXEC-EREF'],           phase: 'production',     tier: 'primary', role: 'artist',   emoji: '🖼️' },
  { id: 'music_generator',     label: 'Composer',          agents: ['EXEC-MGEN'],           phase: 'production',     tier: 'primary', role: 'artist',   emoji: '🎵' },
  { id: 'animatic',            label: 'Editor',            agents: ['EXEC-EDIT'],           phase: 'production',     tier: 'primary', role: 'editor',   emoji: '🎞️' },
  { id: 'shot_designer',       label: 'Video Designer',    agents: ['EXEC-VANIM'],          phase: 'generation',     tier: 'muted',   role: 'designer', serves: 'visual_generator', emoji: '📝' },
  { id: 'shot_critic',         label: 'Video Critic',      agents: ['EXEC-VPREV'],          phase: 'generation',     tier: 'muted',   role: 'critic',  serves: 'visual_generator', emoji: '🧐' },
  { id: 'visual_generator',    label: 'Video Artist',      agents: ['EXEC-VGEN'],           phase: 'generation',     tier: 'primary', role: 'artist',   emoji: '🎥' },
  { id: 'final_cut',           label: 'Online Editor',     agents: ['EXEC-STITCH'],         phase: 'generation',     tier: 'primary', role: 'editor',   emoji: '🎬' },
  { id: 'copywriter',          label: 'Publicist',         agents: ['EXEC-COPY'],           phase: 'distribution',   tier: 'primary', role: 'author',    emoji: '📝' },
  { id: 'thumbnail_designer',  label: 'Key Art Designer',  agents: ['EXEC-THUMB-DESIGNER'], phase: 'distribution',   tier: 'muted',   role: 'designer', serves: 'thumbnail_creator', emoji: '🎨' },
  { id: 'thumbnail_critic',    label: 'Key Art Critic',    subtitle: 'not staffed',         agents: [],              phase: 'distribution',   tier: 'muted',   role: 'critic',  serves: 'thumbnail_creator', emoji: '🧐', unstaffed: true },
  { id: 'thumbnail_creator',   label: 'Key Art Artist',    agents: ['EXEC-THUMB'],          phase: 'distribution',   tier: 'primary', role: 'artist',   emoji: '🖼️' },
  { id: 'publisher',           label: 'Distribution',      agents: ['EXEC-PUB'],            phase: 'distribution',   tier: 'primary', role: 'publisher', emoji: '🚀' },
  { id: 'analytics_collector', label: 'Audience Analyst',  agents: ['EXEC-ANAL'],           phase: 'analytics',      tier: 'primary', role: 'analyst',  emoji: '📊' },
];

// Map a file_type → row id. Each agent's primary asset goes to its own row.
const STAGE_FROM_ASSET = (asset: AssetLike): PipelineStageId | null => {
  const ft = asset.file_type;
  if (ft.startsWith('SPC-brief')) return 'brief';
  if (ft.startsWith('SCR'))       return 'screenwriter';
  if (ft === 'REV-script_qa')     return 'script_critic';
  if (ft.startsWith('STB'))       return 'storyboarder';
  if (ft === 'REV-world_check' || ft === 'REV-continuity') return 'continuity_critic';
  if (ft.startsWith('SPC-ref_plan'))   return 'reference_designer';
  if (ft === 'REV-ref_plan' || ft.startsWith('REV-ref_plan')) return 'reference_critic';
  if (ft.startsWith('IMG-episode_ref')) return 'episode_references';
  if (ft.startsWith('VID-animatic'))   return 'animatic';
  if (ft.startsWith('SPC-shot_plan'))  return 'shot_designer';
  if (ft === 'REV-shot_plan' || ft.startsWith('REV-shot_plan')) return 'shot_critic';
  if (ft.startsWith('VID-shot'))       return 'visual_generator';
  if (ft.startsWith('VID-final_cut'))  return 'final_cut';
  if (ft.startsWith('AUD-music'))      return 'music_generator';
  if (ft.startsWith('SPC-metadata') || ft.startsWith('SPC-copy')) return 'copywriter';
  if (ft.startsWith('SPC-thumb_plan')) return 'thumbnail_designer';
  if (ft.startsWith('IMG-thumbnail')) return 'thumbnail_creator';
  if (ft.startsWith('REV-publish'))   return 'publisher';
  if (ft.startsWith('REV-analytics')) return 'analytics_collector';
  return null;
};

const STAGE_FROM_AGENT: Record<string, PipelineStageId> = {
  'Director':   'brief',
  'EXEC-SW':    'screenwriter',
  'EXEC-SREV':  'script_critic',
  'EXEC-SB':    'storyboarder',
  'EXEC-CONT':  'continuity_critic',
  'EXEC-WCHK':  'continuity_critic', // legacy WCHK feeds the Continuity row when CONT is not yet shipped
  'EXEC-EREF-DESIGNER': 'reference_designer',
  'EXEC-EPREV': 'reference_critic',
  'EXEC-EREF':  'episode_references',
  'EXEC-EDIT':  'animatic',
  'EXEC-VANIM': 'shot_designer',
  'EXEC-VPREV': 'shot_critic',
  'EXEC-VGEN':   'visual_generator',
  'EXEC-STITCH': 'final_cut',
  'EXEC-MGEN':   'music_generator',
  'EXEC-COPY':  'copywriter',
  'EXEC-THUMB-DESIGNER': 'thumbnail_designer',
  'EXEC-THUMB': 'thumbnail_creator',
  'EXEC-PUB':   'publisher',
  'EXEC-ANAL':  'analytics_collector',
};

/**
 * Parse a Critic verdict (PASS / REVISE / FAIL) out of a REV / Plan asset.
 * Critics persist their verdict two ways:
 *   - in `description`: "… · verdict PASS · cost …" (script/animator critics)
 *   - in the trailing JSON body: `"verdict": "REVISE"`
 * We check description first (cheap, always present on critic outputs), then
 * fall back to a JSON-body scan. Unknown / absent → undefined.
 */
function parseVerdict(asset: AssetLike): PipelineVerdict | undefined {
  const norm = (v: string): PipelineVerdict | undefined => {
    const u = v.toUpperCase();
    if (u === 'PASS' || u === 'PASS_WITH_UNCERTAINTY') return 'PASS';
    if (u === 'REVISE') return 'REVISE';
    if (u === 'FAIL') return 'FAIL';
    return undefined;
  };
  const desc = asset.description ?? '';
  const descMatch = /verdict\s+(PASS_WITH_UNCERTAINTY|PASS|REVISE|FAIL)/i.exec(desc);
  if (descMatch?.[1]) return norm(descMatch[1]);
  const body = asset.content ?? '';
  const bodyMatch = /"verdict"\s*:\s*"(PASS_WITH_UNCERTAINTY|PASS|REVISE|FAIL)"/i.exec(body);
  if (bodyMatch?.[1]) return norm(bodyMatch[1]);
  return undefined;
}

/** Critic row ids whose `latest_verdict` is meaningful. */
const CRITIC_ROW_IDS: ReadonlySet<PipelineStageId> = new Set<PipelineStageId>([
  'script_critic',
  'continuity_critic',
  'reference_critic',
  'shot_critic',
]);

/**
 * Minimal shape of `episodes.metadata` the snapshot builder cares about.
 * Sprint τ (2026-05-15) — `eref_pilot_state` from this mirror lets the
 * `episode_references` stage report `running` while pilots-in-REVIEW
 * would otherwise force `blocked`. Other stages ignore this field.
 */
export interface EpisodeMetadataForPipeline {
  eref_pilot_state?: 'NONE' | 'PENDING_REVIEW' | 'FANOUT_RUNNING' | 'FANOUT_COMPLETE';
}

export function buildPipelineSnapshot(
  episodeStatus: string,
  assets: AssetLike[],
  jobs: JobLike[],
  episodeMetadata?: EpisodeMetadataForPipeline | null,
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

    // Priority order (Director directive 2026-05-10): `approved` wins over
    // `running` when both exist. Rationale: if at least one APPROVED asset
    // exists for this stage, the Director already has a usable artifact —
    // an active job is an *improvement* attempt, not a blocker. Showing
    // orange "running" over green "approved" was misleading (Director saw
    // 3 approved Final Cuts but row stayed orange because of a stale or
    // in-flight STITCH job). A blocked/review state still beats running.
    if (hasApprovedAsset) {
      state = 'approved';
    } else if (hasReviewAsset) {
      state = 'blocked';
    } else if (hasRunningJob) {
      state = 'running';
    } else if (hasFailedJob) {
      state = 'failed';
    }

    // Sprint τ (2026-05-15) — EREF semantic state overrides.
    //
    // EREF is unique: the stage covers per-shot reference images for an
    // entire episode (~20-25 shots). The default `hasApprovedAsset` rule
    // misclassifies "pilot pair APPROVED, 22 remaining shots not even
    // generated" as `approved` — Director then sees a green checkmark
    // on a stage that has produced only 2/24 references. Same trap from
    // the opposite direction: "pilots in REVIEW + fan-out running" is
    // PRODUCTIVE work, not `blocked`.
    if (def.id === 'episode_references') {
      const pilotState = episodeMetadata?.eref_pilot_state;
      if (pilotState === 'PENDING_REVIEW') {
        state = 'blocked';
      } else if (pilotState === 'FANOUT_RUNNING' && hasRunningJob) {
        state = 'running';
      }
      // FANOUT_COMPLETE / NONE: fall through to default rule above.
    }

    if (def.id === 'brief' && status === 'BRIEF_APPROVED') state = 'approved';
    if (def.id === 'publisher' && status === 'PUBLISHED') state = 'approved';
    if (def.id === 'analytics_collector' && status === 'COMPLETE') state = 'approved';

    const latest = [...stageAssets].sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    )[0];

    // Topic 3 — surface the most recent Critic verdict on Critic rows.
    const latest_verdict = CRITIC_ROW_IDS.has(def.id) && latest
      ? parseVerdict(latest)
      : undefined;

    return {
      id: def.id,
      label: def.label,
      subtitle: def.subtitle,
      agents: def.agents,
      phase: def.phase,
      tier: def.tier,
      role: def.role,
      serves: def.serves,
      emoji: def.emoji,
      unstaffed: def.unstaffed,
      state,
      latest_asset_id: latest?.id,
      latest_asset_type: latest?.file_type,
      latest_verdict,
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
