// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/gate.ts
// Per-agent input gate validation.
//
// Implements CLAUDE.md §11 "Parameter Completeness At Gate":
//   "All parameters an execution agent needs MUST be fully defined by upstream
//    inputs before that agent is triggered. Execution agents are pure functions:
//    output = f(inputs). An execution agent encountering an undefined parameter
//    = upstream gate failure."
//
// For each AgentId, declare which assets must exist in APPROVED status before
// the agent may run. validateAgentInputs() queries Supabase and returns a
// GateResult. enforceMode() is also called inline so a single gate-check
// covers both data completeness and governance authority.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../supabase/types.gen';
import { enforceMode } from '../governance';
import { assertMediaResolves } from './media-preflight';
import type { AgentId, GateResult, GovernanceAction } from './types';

// ── Agent dependency declarations ────────────────────────────────────────────

interface AgentDependency {
  /** Dot-pattern matched against assets.file_type (e.g. "SCR", "STB", "VID"). */
  fileTypePrefix: string;
  /** How many assets in `allowedStatuses` must exist for the gate to pass. */
  minCount: number;
  /** Friendly name for the missing-input error message. */
  label: string;
  /**
   * Asset statuses that satisfy the gate. Default ['APPROVED'] — most agents
   * consume approved upstream output. Review agents (Story Editor, World
   * Checker) override with ['REVIEW', 'REVISION', 'APPROVED'] so they can
   * review pending drafts AS WELL AS approved ones (this enables the
   * internal loop: Writer produces REVIEW → Story Editor reviews → REVISE
   * → Writer regenerates REVIEW → Story Editor reviews again). 2026-05-12.
   */
  allowedStatuses?: ReadonlyArray<string>;
}

interface AgentGateSpec {
  /** Upstream APPROVED assets required before this agent may run. */
  required: AgentDependency[];
  /** Governance action this agent maps to. Default = 'AGENT_RUN' (pass-through in Phase 4). */
  governance: GovernanceAction;
}

/**
 * Per-agent gate specification. Update this single map to change pipeline order.
 *
 * In Phase 4 mock mode, the replay-pilot script pre-populates Supabase with
 * APPROVED assets so the gates pass. In Sprint 10 real mode the same gates
 * fire against real upstream output.
 */
const AGENT_GATES: Readonly<Record<AgentId, AgentGateSpec>> = {
  'EXEC-SW': {
    required: [{ fileTypePrefix: 'SPC-brief', minCount: 1, label: 'Brief' }],
    governance: 'AGENT_RUN',
  },
  'EXEC-SREV': {
    // Story Editor reviews scripts in REVIEW (pending Director approval).
    // Loop pattern: Writer produces v0X REVIEW → Story Editor reviews →
    // verdict REVISE → Writer regenerates v0X+1 REVIEW → Story Editor reviews.
    // Pre-fix the gate required APPROVED — but Story Editor IS the gate
    // FROM REVIEW to APPROVED, so requiring APPROVED upstream was a chicken-
    // and-egg deadlock (Director directive 2026-05-12 — close internal loop).
    required: [{
      fileTypePrefix: 'SCR',
      minCount: 1,
      label: 'Script (REVIEW or APPROVED)',
      allowedStatuses: ['REVIEW', 'REVISION', 'APPROVED'],
    }],
    governance: 'AGENT_RUN',
  },
  'EXEC-SB': {
    required: [{ fileTypePrefix: 'SCR', minCount: 1, label: 'Approved Script' }],
    governance: 'AGENT_RUN',
  },
  'EXEC-WCHK': {
    // Real EXEC-SB now produces ONE storyboard asset with 3 acts inline,
    // not 3 separate STB rows. Threshold lowered to 1.
    //
    // 2026-06-02: allow REVIEW status — parity with EXEC-SREV. The Continuity
    // Critic auto-reads the Storyboarder's DRAFT (REVIEW) board the moment it
    // is produced (isCriticChain in factory.ts), so the Director sees board +
    // continuity verdict together. Requiring APPROVED here was the same
    // chicken-and-egg the Script Critic gate had: the Critic IS what informs
    // the Director's approval, so it cannot wait for that approval to run.
    // Executors downstream (EREF / EREF-DESIGNER / VGEN) keep requiring
    // APPROVED — they spend money and must wait for the Director's gate.
    required: [
      {
        fileTypePrefix: 'STB',
        minCount: 1,
        label: 'Storyboard (REVIEW or APPROVED)',
        allowedStatuses: ['REVIEW', 'REVISION', 'APPROVED'],
      },
    ],
    governance: 'AGENT_RUN',
  },
  'EXEC-EREF': {
    // Backbone v2: between Storyboard and Animatic. Reads APPROVED storyboard
    // and generates per-episode reference images for each unique
    // location/character pose. Step 5 implements real gpt-image-1 fan-out.
    required: [
      { fileTypePrefix: 'STB', minCount: 1, label: 'Approved storyboard' },
    ],
    governance: 'AGENT_RUN',
  },
  'EXEC-EREF-DESIGNER': {
    // Sprint «Дизайнер и Аниматор» 2026-05-18. Designer Plan author — needs
    // only the same APPROVED storyboard the executor needs. Bible canon and
    // delivery_targets are loaded by the runner from the episode/series rows,
    // not via upstream_assets, so the gate stays minimal.
    required: [
      { fileTypePrefix: 'STB', minCount: 1, label: 'Approved storyboard' },
    ],
    governance: 'AGENT_RUN',
  },
  'EXEC-EPREV': {
    // Sprint «Дизайнер и Аниматор» Day 4 2026-05-19. Critic reads the Plan
    // asset directly via planAssetId (event payload), not via upstream_assets.
    // The storyboard is the upstream context — same minCount=1 as Designer.
    required: [
      { fileTypePrefix: 'STB', minCount: 1, label: 'Approved storyboard' },
    ],
    governance: 'AGENT_RUN',
  },
  'EXEC-VANIM': {
    // Sprint «Дизайнер и Аниматор» Day 6-7 2026-05-19. Animator needs the
    // same APPROVED storyboard the Designer / VGEN executor needs. Bible
    // canon + EREF anchors are loaded by runner from inputs.
    required: [
      { fileTypePrefix: 'STB', minCount: 1, label: 'Approved storyboard' },
    ],
    governance: 'AGENT_RUN',
  },
  'EXEC-VPREV': {
    // Sprint «Дизайнер и Аниматор» Day 8 2026-05-19. Animator's Critic —
    // reads Plan asset via planAssetId from event payload, sanity-checks
    // against the storyboard shot.
    required: [
      { fileTypePrefix: 'STB', minCount: 1, label: 'Approved storyboard' },
    ],
    governance: 'AGENT_RUN',
  },
  'EXEC-GAGAD': {
    // Sprint «Дизайнер и Аниматор» Day 11+ 2026-05-19. Gag Assistant Director.
    // Cross-layer gag continuity supervisor. All 3 phases (plan/eref_review/
    // vanim_review) require the storyboard + script as canonical inputs;
    // phase-specific assets (SPC-gag_plan, SPC-ref_plan, SPC-shot_plan) are
    // resolved from the event payload, not gated here.
    required: [
      { fileTypePrefix: 'STB', minCount: 1, label: 'Approved storyboard' },
      { fileTypePrefix: 'SCR', minCount: 1, label: 'Approved script' },
    ],
    governance: 'AGENT_RUN',
  },
  'EXEC-EDIT': {
    // Animatic now consumes APPROVED Episode references (not raw storyboard).
    required: [
      { fileTypePrefix: 'IMG-episode_ref', minCount: 1, label: 'Approved episode references' },
    ],
    governance: 'AGENT_RUN',
  },
  'EXEC-VGEN': {
    required: [
      { fileTypePrefix: 'VID-animatic', minCount: 1, label: 'Approved animatic' },
    ],
    governance: 'AGENT_RUN',
  },
  'EXEC-MGEN': {
    // Phase A.2 LT-04 audio reorg (Director directive 2026-05-08 q3b):
    // Composer fires AFTER REV-world_check approval and BEFORE animatic, so
    // the animatic player can preview pacing WITH music. The earlier gate
    // requiring an APPROVED animatic was a leftover from the pre-reorg DAG
    // and stalls the pipeline on every real episode (E20 surfaced this
    // 2026-05-12). Upstream is now: approved storyboard + approved world_check.
    required: [
      { fileTypePrefix: 'STB', minCount: 1, label: 'Approved storyboard' },
      { fileTypePrefix: 'REV-world_check', minCount: 1, label: 'Approved world_check' },
    ],
    governance: 'AGENT_RUN',
  },
  'EXEC-STITCH': {
    // Phase A.2 PR β — assemble approved per-shot mp4s + music into final cut.
    // Gate requires animatic (for shot order + audio_tracks) and at least one
    // VID-shot — the actual "all 13 approved" check happens in the runner
    // and in approve/route.ts where the event fires.
    required: [
      { fileTypePrefix: 'VID-animatic', minCount: 1, label: 'Approved animatic' },
      { fileTypePrefix: 'VID-shot', minCount: 1, label: 'Approved shots' },
    ],
    governance: 'AGENT_RUN',
  },
  'EXEC-COPY': {
    required: [{ fileTypePrefix: 'SCR', minCount: 1, label: 'Approved Script' }],
    governance: 'AGENT_RUN',
  },
  'EXEC-THUMB-DESIGNER': {
    required: [
      { fileTypePrefix: 'SCR', minCount: 1, label: 'Approved Script' },
      { fileTypePrefix: 'SPC-metadata', minCount: 1, label: 'Approved Metadata' },
    ],
    governance: 'AGENT_RUN',
  },
  'EXEC-THUMB': {
    required: [
      { fileTypePrefix: 'SPC-thumb_plan', minCount: 1, label: 'Approved Thumbnail Plan' },
    ],
    governance: 'AGENT_RUN',
  },
  'EXEC-PUB': {
    required: [
      // 2026-06-01: gate on the real stitched final cut, not the rough
      // animatic — publishing the animatic was a latent bug (Director-confirmed).
      { fileTypePrefix: 'VID-final_cut', minCount: 1, label: 'Final cut' },
      { fileTypePrefix: 'SPC-metadata', minCount: 1, label: 'Metadata' },
      { fileTypePrefix: 'IMG-thumbnail', minCount: 1, label: 'Thumbnail' },
    ],
    governance: 'PUBLISH', // hard limit
  },
  'EXEC-ANAL': {
    required: [{ fileTypePrefix: 'REV-publish_log', minCount: 1, label: 'Publish log' }],
    governance: 'AGENT_RUN',
  },
  // Agents below have no Inngest function — gate is informational only.
  'EXEC-STY': { required: [], governance: 'AGENT_RUN' },
  'EXEC-BIBLE-AUTHOR': { required: [], governance: 'AGENT_RUN' },
  'EXEC-STYLE-CHECK': { required: [], governance: 'AGENT_RUN' },
  'EXEC-EREF-CHECK': { required: [], governance: 'AGENT_RUN' },
  'EXEC-ARCH': { required: [], governance: 'AGENT_RUN' },
  'EXEC-ORCH': { required: [], governance: 'AGENT_RUN' },
  'EXEC-CONC': { required: [], governance: 'AGENT_RUN' },
};

// ── Media-reachability preflight (I3) ─────────────────────────────────────────
// The asset-completeness loop above proves rows EXIST. It does NOT prove the
// referenced media actually RESOLVES (bytes openable). A row can point at a
// drive_file_id / staging_path that 404s, was garbage-collected, or never
// finished uploading — and the paid executor then dies mid-run on a dead ref.
// For MEDIA-DEPENDENT agents we resolve the obvious referenced media ids and
// verify they open BEFORE the executor spends money, so the job fails at the
// gate with a readable Activity Feed reason instead of a paid mid-run crash.
//
// The check is best-effort and FAILS OPEN on its own internal errors: a
// preflight bug must never falsely block a healthy job. The executor-side loud
// loaders (Unit 2 media-preflight loaders) are the hard backstop.

/** Agents whose run consumes upstream media bytes (not just text assets). */
const MEDIA_DEPENDENT_AGENTS: ReadonlySet<AgentId> = new Set<AgentId>([
  'EXEC-EREF',
  'EXEC-VGEN',
  'EXEC-EDIT',
  'EXEC-VANIM',
]);

/** Minimal asset shape the media-preflight loader needs. */
interface ReferencedMediaAsset {
  id: string;
  filename?: string;
  driveFileId?: string;
  stagingPath?: string;
}

type AssetRefRow = Pick<
  Database['public']['Tables']['assets']['Row'],
  'id' | 'filename' | 'drive_file_id' | 'staging_path'
>;

function toReferencedMediaAsset(row: AssetRefRow): ReferencedMediaAsset {
  return {
    id: row.id,
    filename: row.filename ?? undefined,
    driveFileId: row.drive_file_id ?? undefined,
    stagingPath: row.staging_path ?? undefined,
  };
}

/**
 * Resolve the OBVIOUS referenced media rows for a media-dependent agent, by the
 * same file_type families the executor consumes. Pragmatic by design — we do
 * not parse the Plan body here (the gate has no plan handle); we preflight the
 * upstream media families the agent is contractually wired to read:
 *
 *   - EXEC-EREF  : LOCKED Series Bible canon (`SBL-%`) it anchors episode refs on.
 *   - EXEC-EDIT  : APPROVED episode references (`IMG-episode_ref%`) the animatic uses.
 *   - EXEC-VGEN  : APPROVED animatic (`VID-animatic%`) + APPROVED episode refs
 *                  (`IMG-episode_ref%`) used as plan end_image / anchors.
 *   - EXEC-VANIM : APPROVED episode refs (`IMG-episode_ref%`) + per-shot anchors
 *                  (`IMG-anchor_%`) used as start/end anchors and end_image.
 *
 * Returns [] when nothing obvious is referenced — the asset-completeness loop
 * already guards row existence, so an empty set here means "nothing to open".
 */
async function gatherReferencedMediaAssets(
  supabase: SupabaseClient<Database>,
  agentId: AgentId,
  episodeId: string,
): Promise<ReferencedMediaAsset[]> {
  if (agentId === 'EXEC-EREF') {
    // Bible canon is series-scoped + LOCKED, not episode-scoped.
    const { seriesIdForEpisode } = await import('../api/series-bible');
    const seriesId = await seriesIdForEpisode(supabase, episodeId);
    if (!seriesId) return [];
    const { data, error } = await supabase
      .from('assets')
      .select('id,filename,drive_file_id,staging_path')
      .eq('series_id', seriesId)
      .eq('status', 'LOCKED')
      .like('file_type', 'SBL-%');
    if (error) throw new Error(`SBL canon ref lookup: ${error.message}`);
    return (data ?? []).map(toReferencedMediaAsset);
  }

  // Episode-scoped, APPROVED media families per agent.
  const families: ReadonlyArray<string> =
    agentId === 'EXEC-EDIT'
      ? ['IMG-episode_ref%']
      : agentId === 'EXEC-VGEN'
        ? ['VID-animatic%', 'IMG-episode_ref%']
        : agentId === 'EXEC-VANIM'
          ? ['IMG-episode_ref%', 'IMG-anchor_%']
          : [];

  if (families.length === 0) return [];

  const byId = new Map<string, ReferencedMediaAsset>();
  for (const family of families) {
    const { data, error } = await supabase
      .from('assets')
      .select('id,filename,drive_file_id,staging_path')
      .eq('episode_id', episodeId)
      .eq('status', 'APPROVED')
      .like('file_type', family);
    if (error) throw new Error(`media ref lookup (${family}): ${error.message}`);
    for (const row of data ?? []) {
      // De-dupe across families (a row can match only one, but stay safe).
      if (!byId.has(row.id)) byId.set(row.id, toReferencedMediaAsset(row));
    }
  }
  return [...byId.values()];
}

/**
 * Run the media-reachability preflight for media-dependent agents.
 * Returns a failing GateResult when referenced media is unreachable, or `null`
 * when the gate should proceed (agent not media-dependent, nothing referenced,
 * all media resolves, or the check itself errored → fail-open).
 */
async function preflightReferencedMedia(
  supabase: SupabaseClient<Database>,
  agentId: AgentId,
  episodeId: string,
): Promise<GateResult | null> {
  if (!MEDIA_DEPENDENT_AGENTS.has(agentId)) return null;
  // Mock/replay mode (no OPENAI_API_KEY) stubs all generation — assets are
  // fabricated rows with no real Drive/staging bytes, so a byte-reachability
  // check would false-block. Production always has the key. Same mock signal
  // the runner uses (hasOpenAI / isRealVideo). Skip the reachability check.
  if (!process.env.OPENAI_API_KEY?.trim()) return null;
  try {
    const assets = await gatherReferencedMediaAssets(supabase, agentId, episodeId);
    if (assets.length === 0) return null;
    const result = await assertMediaResolves(supabase, assets);
    if (result.ok) return null;
    const deadIds = result.dead.map((d) => d.assetId).join(', ');
    const missing = result.dead.map((d) => `${d.assetId}: ${d.reason}`);
    return {
      passed: false,
      missing,
      reason: `Media unreachable for ${agentId}: ${deadIds}`,
    };
  } catch (err: unknown) {
    // Fail OPEN for the check itself — a preflight bug must never block a
    // healthy job. Executor-side loud loaders remain the hard backstop.
    const message = err instanceof Error ? err.message : 'unknown error';
    console.warn(
      `[gate] media-reachability preflight skipped for ${agentId}/${episodeId} (fail-open): ${message}`,
    );
    return null;
  }
}

// ── Validation entry point ────────────────────────────────────────────────────

export interface ValidateInputsArgs {
  supabase: SupabaseClient<Database>;
  agentId: AgentId;
  episodeId: string;
  /** Event payload context for governance decisions (directorConfirm, etc.). */
  eventContext?: {
    directorConfirm?: boolean;
    confirmedBy?: string;
  };
}

/**
 * Validate that all upstream APPROVED assets exist for `agentId` in `episodeId`,
 * AND that governance allows the action in the episode's current mode.
 *
 * Two-phase check:
 *   1. Asset completeness — query assets table for each declared dependency
 *   2. Governance authority — call enforceMode() with the agent's mapped action
 *
 * If either fails → `passed: false` with details. The Inngest function
 * converts this into a NonRetriableError so the job ends in FAILED state.
 */
export async function validateAgentInputs(
  args: ValidateInputsArgs
): Promise<GateResult> {
  const { supabase, agentId, episodeId, eventContext = {} } = args;
  const spec = AGENT_GATES[agentId];

  // ── Step 0: anchor-chain gate override ─────────────────────────────────────
  // EXEC-EDIT (animatic) normally requires APPROVED IMG-episode_ref. In
  // anchor-chain mode the episode has NO episode_refs — the animatic is built
  // from APPROVED IMG-anchor START frames (TD-49 Phase 2). Swap the upstream
  // requirement so the pacing gate doesn't block on refs that don't exist in
  // this mode. Non-anchor episodes are unaffected (metadata flag absent/false).
  let effectiveRequired: readonly AgentDependency[] = spec.required;
  if (agentId === 'EXEC-EDIT') {
    let anchorMode = false;
    try {
      const { data: epRow } = await supabase
        .from('episodes')
        .select('metadata')
        .eq('id', episodeId)
        .maybeSingle();
      anchorMode = Boolean(
        (epRow as { metadata?: { anchor_chain_enabled?: unknown } | null } | null)
          ?.metadata?.anchor_chain_enabled,
      );
    } catch {
      // Fail-safe: if the metadata read fails, fall back to the static
      // (episode_ref) requirement rather than crashing the gate.
      anchorMode = false;
    }
    if (anchorMode) {
      effectiveRequired = [
        { fileTypePrefix: 'IMG-anchor', minCount: 1, label: 'Approved anchor frames' },
      ];
    }
  }

  // ── Step 1: asset completeness ─────────────────────────────────────────────
  const missing: string[] = [];
  for (const dep of effectiveRequired) {
    const allowedStatuses = dep.allowedStatuses ?? ['APPROVED'];
    // Use .eq() for single-status (default) so existing mock-supabase tests
    // keep working — .in() requires multi-status mock support which the test
    // harness doesn't provide.
    const baseQuery = supabase
      .from('assets')
      .select('*', { count: 'exact', head: true })
      .eq('episode_id', episodeId)
      .like('file_type', `${dep.fileTypePrefix}%`);
    const query = allowedStatuses.length === 1
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? baseQuery.eq('status', allowedStatuses[0] as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      : baseQuery.in('status', allowedStatuses as any);
    const { count, error } = await query;
    if (error) {
      return {
        passed: false,
        missing: [],
        reason: `Gate query failed for ${agentId}/${dep.fileTypePrefix}: ${error.message}`,
      };
    }
    const found = count ?? 0;
    if (found < dep.minCount) {
      missing.push(`${dep.label} (need ${dep.minCount}, found ${found} in [${allowedStatuses.join('|')}])`);
    }
  }

  if (missing.length > 0) {
    return {
      passed: false,
      missing,
      reason: `Upstream gate failed for ${agentId}: ${missing.join('; ')}`,
    };
  }

  // ── Step 1.5: EXEC-EREF Series Bible canon precondition ──────────────────
  // Backbone v2 / Step 4 of contract pipeline rollout: Episode references
  // can only be generated when the parent series has at least 1 LOCKED
  // canonical character ref AND 1 LOCKED style guide. Without canon there is
  // nothing to anchor episode visuals on — see specs/company/series_bible.md.
  if (agentId === 'EXEC-EREF') {
    const { seriesIdForEpisode, countLockedBibleSections } = await import(
      '../api/series-bible'
    );
    const seriesId = await seriesIdForEpisode(supabase, episodeId);
    if (!seriesId) {
      return {
        passed: false,
        missing: ['parent series'],
        reason:
          'EXEC-EREF requires a parent series to look up Series Bible canon, but the episode is not linked to a series.',
      };
    }
    const counts = await countLockedBibleSections(supabase, seriesId);
    const bibleMissing: string[] = [];
    if (counts.character < 1)
      bibleMissing.push('≥1 LOCKED Series Bible character (Heroes section)');
    if (counts.style < 1)
      bibleMissing.push('≥1 LOCKED Series Bible style guide (Style section)');
    if (bibleMissing.length > 0) {
      return {
        passed: false,
        missing: bibleMissing,
        reason: `Series Bible canon not provisioned: ${bibleMissing.join(' AND ')}. Open the series Bible UI and LOCK the missing entries before re-triggering EXEC-EREF.`,
      };
    }
  }

  // ── Step 2: governance authority ───────────────────────────────────────────
  // Read episode's current governance_mode for the enforceMode call.
  const { data: episode, error: epErr } = await supabase
    .from('episodes')
    .select('id, governance_mode')
    .eq('id', episodeId)
    .single();
  if (epErr) {
    return {
      passed: false,
      missing: [],
      reason: `Gate episode lookup failed for ${agentId}: ${epErr.message}`,
    };
  }
  const decision = enforceMode(spec.governance, episode, eventContext);
  if (!decision.passed) {
    return {
      passed: false,
      missing: [],
      reason: decision.reason ?? 'Governance blocked',
    };
  }

  // ── Step 3: media-reachability preflight (I3) ─────────────────────────────
  // For media-dependent agents, prove referenced media actually opens BEFORE
  // the paid executor runs. Fails the job AT THE GATE with a readable reason;
  // fails OPEN on its own internal error (executor loaders are the backstop).
  const mediaResult = await preflightReferencedMedia(supabase, agentId, episodeId);
  if (mediaResult) return mediaResult;

  return {
    passed: true,
    missing: [],
  };
}
