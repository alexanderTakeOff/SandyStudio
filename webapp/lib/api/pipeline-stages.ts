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
  | 'casting'
  | 'brief'
  | 'screenwriter'
  | 'script_critic'
  | 'storyboarder'
  | 'readability_critic'
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
  /** Count of assets in this stage awaiting a Director decision (REVIEW / REVISION / NEEDS_HUMAN_TWEAK). */
  assets_in_review?: number;
  /**
   * PER-SHOT rows only: how many shots this stage has actually closed.
   *
   * These stages do not belong to the episode — they belong to the SHOT (the
   * system's brick is the cell `shot × stage`). A single lamp over 24 cells lit
   * up on the FIRST approved asset, so "1 of 24 done" read as "done" — and the
   * code already carried a special case (`eref_pilot_state`) to patch exactly one
   * of the six rows. The counter replaces the patch: the row says what it is,
   * `done / total`, and only goes green when the last cell closes.
   */
  progress?: { done: number; total: number };
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
  /** Optional — carries `shot_id` / `shot_reference.shot_id` for per-shot rows. */
  metadata?: unknown;
}

/**
 * Rows whose real object is the SHOT, not the episode. They report `done/total`
 * instead of a single lamp. Kept as a named set so the rule is stated once and
 * every future per-shot stage joins it by adding its id here.
 */
const PER_SHOT_ROWS: ReadonlySet<PipelineStageId> = new Set<PipelineStageId>([
  'reference_designer',
  'reference_critic',
  'episode_references',
  'shot_designer',
  'shot_critic',
  'visual_generator',
]);

/**
 * Which shot an asset belongs to. Three shapes exist in the wild and all three
 * are live: video clips carry `metadata.shot_id`, reference images carry
 * `metadata.shot_reference.shot_id`, and the direct-call tools encode it in the
 * file type (`VID-shot-s15-e36-sh01`, `IMG-episode_ref_s15_e36_sh01`). Reading
 * only the first is how a whole episode's work went uncounted.
 */
function shotKeyOf(asset: AssetLike): string | null {
  const meta = asset.metadata as
    | { shot_id?: unknown; shot_reference?: { shot_id?: unknown } | null }
    | null
    | undefined;
  if (typeof meta?.shot_id === 'string' && meta.shot_id) return meta.shot_id.toUpperCase();
  const ref = meta?.shot_reference?.shot_id;
  if (typeof ref === 'string' && ref) return ref.toUpperCase();
  const fromType = /(?:^|[_-])(sh\d{1,3})(?:[_-]|$)/i.exec(asset.file_type);
  return fromType ? fromType[1].toUpperCase() : null;
}

interface JobLike {
  id: string;
  agent_id: string;
  status: string;
}

// Statuses where an asset awaits a Director decision, not just the agent-
// produced REVIEW state. A Director can hand-edit an asset via the kebab
// "Edit" action while it sits in REVISION (after Reject + revise) or
// NEEDS_HUMAN_TWEAK (critic HALT) and then directly APPROVE the edited
// version — /api/assets/[id]/approve's `humanDirectApprove` path already
// allows this transition for the human principal. Both StageKebabMenu and
// StageWorkspacePanel key their Approve action off `assets_in_review`, so
// this is the one place that keeps both surfaces in sync.
export const AWAITING_DIRECTOR_STATUSES: ReadonlySet<string> = new Set([
  'REVIEW',
  'REVISION',
  'NEEDS_HUMAN_TWEAK',
]);

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
  // Brief → Casting → Writer (2026-06-23, Director q22a/q30a): Casting comes
  // AFTER the brief — once the brief is set it's clear which characters/objects
  // the episode needs. (Was casting-before-brief.)
  { id: 'brief',               label: 'Brief',             agents: ['Director'],            phase: 'pre-production', tier: 'primary', role: 'input',     emoji: '🎬' },
  { id: 'casting',             label: 'Casting',           subtitle: 'Production Designer',  agents: ['ART-AD'],     phase: 'pre-production', tier: 'primary', role: 'designer', emoji: '🎭' },
  { id: 'screenwriter',        label: 'Writer',            agents: ['EXEC-SW'],             phase: 'pre-production', tier: 'primary', role: 'author',    emoji: '✍️' },
  { id: 'script_critic',       label: 'Script Critic',     subtitle: 'Story Editor',        agents: ['EXEC-SREV'],   phase: 'pre-production', tier: 'muted',   role: 'critic',  serves: 'screenwriter', emoji: '🔍' },
  { id: 'storyboarder',        label: 'Storyboard Artist', agents: ['EXEC-SB'],             phase: 'production',     tier: 'primary', role: 'author',    emoji: '🎬' },
  // CREAD runs BEFORE continuity (registry.ts: EXEC-CREAD.next_agent=EXEC-WCHK).
  // Was invisible in the pipeline view — REV-readability had no row/asset mapping,
  // so a REVISE verdict silently gated the Reference Artist (Director 2026-07-04).
  { id: 'readability_critic',  label: 'Readability Critic', subtitle: 'Comedy Editor',       agents: ['EXEC-CREAD'],  phase: 'production',     tier: 'muted',   role: 'critic',  serves: 'storyboarder', emoji: '📖' },
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
  if (ft.startsWith('SPC-episode_cast')) return 'casting';
  if (ft.startsWith('SPC-brief')) return 'brief';
  if (ft.startsWith('SCR'))       return 'screenwriter';
  if (ft === 'REV-script_qa')     return 'script_critic';
  if (ft.startsWith('STB'))       return 'storyboarder';
  if (ft === 'REV-readability' || ft.startsWith('REV-readability')) return 'readability_critic';
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
  'ART-AD':     'casting',
  'Director':   'brief',
  'EXEC-SW':    'screenwriter',
  'EXEC-SREV':  'script_critic',
  'EXEC-SB':    'storyboarder',
  'EXEC-CREAD': 'readability_critic',
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
  'readability_critic',
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
  /**
   * How many shots the episode has, from the storyboard / animatic shot list.
   * Optional: callers that do not know it get today's behaviour unchanged.
   * When known, per-shot rows report `done/total` and stay short of green until
   * the last shot closes.
   */
  shotCount?: number,
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
    const hasReviewAsset = stageAssets.some((a) => AWAITING_DIRECTOR_STATUSES.has(a.status));
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
    // PER-SHOT rows count cells, not lamps. `done` is how many distinct shots
    // have a closed asset here; green waits for the last one. Without a known
    // shot count we cannot say `n/N`, so behaviour falls back to the old rule.
    const isPerShot = PER_SHOT_ROWS.has(def.id);
    let progress: { done: number; total: number } | undefined;
    if (isPerShot && typeof shotCount === 'number' && shotCount > 0) {
      const closed = new Set<string>();
      for (const a of stageAssets) {
        if (a.status !== 'APPROVED' && a.status !== 'LOCKED') continue;
        const key = shotKeyOf(a);
        if (key) closed.add(key);
      }
      progress = { done: closed.size, total: shotCount };
    }

    if (progress) {
      // A stage that has closed every shot is done; anything less is work in
      // progress, however many assets it has produced.
      if (progress.done >= progress.total) state = 'approved';
      else if (hasReviewAsset) state = 'blocked';
      else if (hasRunningJob || progress.done > 0) state = 'running';
      else if (hasFailedJob) state = 'failed';
    } else if (hasApprovedAsset) {
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
    //
    // 2026-08-06 — this is the patch the counter replaces. It was written for
    // ONE of the six per-shot rows because that one hurt first; the counter
    // covers all six by construction. Kept only for callers that cannot supply
    // a shot count — when `progress` exists it already says the truth.
    if (def.id === 'episode_references' && !progress) {
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
      ...(progress ? { progress } : {}),
      assets_in_review: stageAssets.filter((a) => AWAITING_DIRECTOR_STATUSES.has(a.status)).length,
      job_count: {
        total: stageJobs.length,
        done: stageJobs.filter((j) => j.status === 'COMPLETED').length,
        running: stageJobs.filter((j) => j.status === 'RUNNING' || j.status === 'QUEUED').length,
        failed: stageJobs.filter((j) => j.status === 'FAILED').length,
      },
    };
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Per-shot LIVE work phase (EpisodeTimeline q4a — 2026-06-22).
//
// The timeline strip colours each shot cell by the work happening on THAT shot
// right now: a RUNNING/QUEUED job whose `input_snapshot.shotId` matches the cell.
// We reuse STAGE_FROM_AGENT (the single source of truth for agent→stage) and
// fold its stages into two visible groups the Director cares about:
//   - 'design'  — the reference is being produced (Reference Designer/Critic/Artist)
//   - 'animate' — the video is being produced (Video Designer/Critic/Artist)
// Colour + pulse live entirely in the UI; this module only classifies.
// ──────────────────────────────────────────────────────────────────────────────

/** Visible per-shot work group for the live timeline overlay. */
export type WorkPhase = 'design' | 'animate';

/** Stages that mean "the reference is being made" → blue. */
const DESIGN_STAGE_IDS: ReadonlySet<PipelineStageId> = new Set<PipelineStageId>([
  'reference_designer', // EXEC-EREF-DESIGNER
  'reference_critic',   // EXEC-EPREV
  'episode_references', // EXEC-EREF
]);

/** Stages that mean "the video is being made" → violet. */
const ANIMATE_STAGE_IDS: ReadonlySet<PipelineStageId> = new Set<PipelineStageId>([
  'shot_designer',    // EXEC-VANIM
  'shot_critic',      // EXEC-VPREV
  'visual_generator', // EXEC-VGEN
]);

/**
 * Map an agent id to its live work phase for the timeline overlay, or null if
 * the agent is not part of either per-shot group. Derived from STAGE_FROM_AGENT
 * so the agent→group mapping has exactly one source of truth.
 */
export function workPhaseForAgent(agentId: string): WorkPhase | null {
  const stage = STAGE_FROM_AGENT[agentId];
  if (!stage) return null;
  if (ANIMATE_STAGE_IDS.has(stage)) return 'animate';
  if (DESIGN_STAGE_IDS.has(stage)) return 'design';
  return null;
}

/** Minimal job shape needed to attribute live work to a shot. */
export interface JobForShotPhase {
  agent_id: string;
  status: string;
  input_snapshot: unknown;
}

/** Read the canonical shot_id the factory stamps into every per-shot job. */
function snapshotShotId(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const sid = (snapshot as { shotId?: unknown }).shotId;
  return typeof sid === 'string' && sid.length > 0 ? sid : null;
}

/**
 * Pure: build `shot_id → active WorkPhase` from the episode's jobs. Only
 * RUNNING/QUEUED jobs count (work happening right now). When both a design and
 * an animate job are live for the same shot, 'animate' wins — Director priority
 * q4a (video-artist over designer). The returned shot_id values are the
 * canonical form matching `AnimaticContract.shot_list[].shot_id`.
 */
export function activeWorkPhaseByShot(
  jobs: ReadonlyArray<JobForShotPhase>,
): Map<string, WorkPhase> {
  const map = new Map<string, WorkPhase>();
  for (const j of jobs) {
    if (j.status !== 'RUNNING' && j.status !== 'QUEUED') continue;
    const phase = workPhaseForAgent(j.agent_id);
    if (!phase) continue;
    const shotId = snapshotShotId(j.input_snapshot);
    if (!shotId) continue;
    // 'animate' is dominant — never let a 'design' job downgrade it.
    if (map.get(shotId) === 'animate') continue;
    map.set(shotId, phase);
  }
  return map;
}

// ──────────────────────────────────────────────────────────────────────────────
// Unified work-state language (2026-07-02) — one visual vocabulary shared by the
// References and Video pipelines (they are the SAME shape: Designer → Critic →
// Artist). The three questions a glance must answer:
//   1. WHICH object?  → References vs Video (answered by POSITION: the object's
//      button / the cell's R·V indicator — NOT by colour).
//   2. WHICH stage / WHO is working?  → answered by COLOUR (role), below.
//   3. Is it working?  → answered by the PULSE (running) vs solid (settled).
// Colour = role (designer / critic / both / artist-generating); position = object.
// ──────────────────────────────────────────────────────────────────────────────

/** Who is working on a shot right now — finer than WorkPhase (which is object). */
export type WorkRole = 'designer' | 'critic' | 'artist';

/** Stage → role, for the two per-shot pipelines (references + video). */
const ROLE_OF_STAGE: Partial<Record<PipelineStageId, WorkRole>> = {
  reference_designer: 'designer',
  reference_critic: 'critic',
  episode_references: 'artist',
  shot_designer: 'designer',
  shot_critic: 'critic',
  visual_generator: 'artist',
};

/** Map an agent id to its work ROLE (designer/critic/artist), or null. */
export function workRoleForAgent(agentId: string): WorkRole | null {
  const stage = STAGE_FROM_AGENT[agentId];
  if (!stage) return null;
  return ROLE_OF_STAGE[stage] ?? null;
}

/** Live work on one shot: which object + which roles are running right now. */
export interface ShotWork {
  object: WorkPhase;
  roles: WorkRole[];
}

/**
 * Pure: build `shot_id → { object, roles }` from the episode's jobs. Only
 * RUNNING/QUEUED jobs count. Extends `activeWorkPhaseByShot` with role detail so
 * the timeline can answer "who's working" (designer / critic / both / artist),
 * not just "which object". 'animate' remains the dominant object (q4a priority).
 */
export function activeWorkByShot(
  jobs: ReadonlyArray<JobForShotPhase>,
): Map<string, ShotWork> {
  const acc = new Map<string, { object: WorkPhase; roles: Set<WorkRole> }>();
  for (const j of jobs) {
    if (j.status !== 'RUNNING' && j.status !== 'QUEUED') continue;
    const object = workPhaseForAgent(j.agent_id);
    const role = workRoleForAgent(j.agent_id);
    if (!object || !role) continue;
    const shotId = snapshotShotId(j.input_snapshot);
    if (!shotId) continue;
    const cur = acc.get(shotId);
    if (cur) {
      if (object === 'animate') cur.object = 'animate'; // animate dominant
      cur.roles.add(role);
    } else {
      acc.set(shotId, { object, roles: new Set([role]) });
    }
  }
  const out = new Map<string, ShotWork>();
  for (const [k, v] of acc) out.set(k, { object: v.object, roles: [...v.roles] });
  return out;
}

/**
 * Pure: build `shot_id → { object, roles }` for shots whose designer / critic /
 * artist job has COMPLETED and which have NO active (RUNNING/QUEUED) job right
 * now. Powers the D7 "persistent trail" — a settled, non-pulsing glow that keeps
 * a finished shot visibly marked instead of snapping back to neutral the instant
 * its job leaves the RUNNING set (Director: «glow гаснет мгновенно, хочу след»).
 * Live work always wins (checked first at the call-site), and a shot claimed by
 * `activeWorkByShot` is excluded here so the two maps never both own one shot.
 */
export function completedWorkByShot(
  jobs: ReadonlyArray<JobForShotPhase>,
): Map<string, ShotWork> {
  // Shots with any live job belong to activeWorkByShot — exclude them so the
  // completed trail never fights the live pulse.
  const liveShots = new Set<string>();
  for (const j of jobs) {
    if (j.status !== 'RUNNING' && j.status !== 'QUEUED') continue;
    if (!workRoleForAgent(j.agent_id)) continue;
    const shotId = snapshotShotId(j.input_snapshot);
    if (shotId) liveShots.add(shotId);
  }
  const acc = new Map<string, { object: WorkPhase; roles: Set<WorkRole> }>();
  for (const j of jobs) {
    if (j.status !== 'COMPLETED') continue;
    const object = workPhaseForAgent(j.agent_id);
    const role = workRoleForAgent(j.agent_id);
    if (!object || !role) continue;
    const shotId = snapshotShotId(j.input_snapshot);
    if (!shotId || liveShots.has(shotId)) continue;
    const cur = acc.get(shotId);
    if (cur) {
      if (object === 'animate') cur.object = 'animate'; // animate dominant
      cur.roles.add(role);
    } else {
      acc.set(shotId, { object, roles: new Set([role]) });
    }
  }
  const out = new Map<string, ShotWork>();
  for (const [k, v] of acc) out.set(k, { object: v.object, roles: [...v.roles] });
  return out;
}

/**
 * Role detection for a set of live roles → a stable `token` + human `label`.
 * The COLOUR is no longer emitted here — under the kebab colour grammar
 * (2026-07-25) hue = family × role (see `stageRamp`/`rampStop` below), composed
 * at the call-site from this token. Node-safe (unit-testable).
 */
export function workRolePalette(
  roles: readonly WorkRole[],
): { label: string; token: 'designer' | 'critic' | 'both' | 'artist' } {
  const hasDesigner = roles.includes('designer');
  const hasCritic = roles.includes('critic');
  if (hasDesigner && hasCritic) return { token: 'both', label: 'Designer + Critic' };
  if (hasCritic) return { token: 'critic', label: 'Critic' };
  if (hasDesigner) return { token: 'designer', label: 'Designer' };
  return { token: 'artist', label: 'Generating' };
}

// ── Kebab colour grammar (2026-07-25) — hue = family(temperature) × role, STABLE
// per sub-step; status never writes hue. ❄️ Reference = cold ramp, 🔥 Video = warm.
// Node-safe + pure so both the animatic kebab and the episode stage-rail compose
// identically and it is unit-testable without importing a client component.
export type StageFamily = 'ref' | 'vid';
export type StageRole = 'plan' | 'critic' | 'artist';

/** Family × role → the stable stage-identity ramp token. Never depends on status. */
export function stageRamp(family: StageFamily, role: StageRole): string {
  return `var(--stage-${family}-${role})`;
}

/** WorkRole token (designer/critic/both/artist) → ramp stop. `both` rides critic. */
export function rampStop(token: 'designer' | 'critic' | 'both' | 'artist'): StageRole {
  return token === 'designer' ? 'plan' : token === 'artist' ? 'artist' : 'critic';
}

/**
 * Map a cell `kind` (image / video-canonical / video-review) OR an enriched
 * popover `paletteKind` (ref-/vid-plan|critic|artist) to its stable stage
 * identity (family × role). Returns null for placeholders / unknown → "not started".
 */
export function stageIdentity(
  kind: string | undefined,
): { family: StageFamily; role: StageRole } | null {
  switch (kind) {
    case 'ref-plan':
      return { family: 'ref', role: 'plan' };
    case 'ref-critic':
      return { family: 'ref', role: 'critic' };
    case 'ref-artist':
    case 'image':
      return { family: 'ref', role: 'artist' };
    case 'vid-plan':
      return { family: 'vid', role: 'plan' };
    case 'vid-critic':
      return { family: 'vid', role: 'critic' };
    case 'vid-artist':
    case 'video-review':
    case 'video-canonical':
      return { family: 'vid', role: 'artist' };
    default:
      return null;
  }
}
