// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/runner.ts
// Single dispatcher for all 11 production agents. Each Inngest function calls
// the same three helpers — loadAgentInputs / runAgent / saveAgentOutput — so
// retries, mock-vs-real switching, and asset persistence all flow through one
// place.
//
// Mock mode (Phase 4): runAgent() returns deterministic mock-provider output
// without ever calling Anthropic, fal.ai, or YouTube. Sprint 10 swaps in real
// providers behind the same API.
//
// File naming follows CLAUDE.md §3:
//   SS-{S}-{E}-{TYPE}-{description}-v{NN}-{STATUS}.{ext}
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Json } from '../supabase/types.gen';
import {
  mockAnalytics,
  mockImage,
  mockLLM,
  mockMusic,
  mockVideo,
  mockYouTubeUpload,
} from './mock-providers';
import { generateImageOpenAI } from './providers/openai-image';
import { generateVideoVeoGemini } from './providers/veo-gemini';
import { getMultiVideoProvider } from './providers/video-gen-multi';
import { persistBinary, type PersistedBinary } from './persist-binary';
import {
  buildShotPromptV2,
  makeCharacterCanonSnippets,
  effectiveDurationSeconds,
  getApprovedEREFForShot,
  getAssetImageBase64ById,
  getStoryboardShotById,
  type StoryboardShotV2,
} from '../api/vgen-shot-helpers';
import {
  getAudioTracks,
  isAnimaticV1,
  type AnimaticContract,
} from '../api/animatic-shotlist';
import { ffmpegStitchEpisode } from './providers/ffmpeg-stitch';
import type { ResolvedProvider } from './provider-resolver';
import { getAgent } from './registry';
import { runScreenwriter, ScreenwriterError } from './runners/screenwriter';
import { runScriptReviewer, ScriptReviewerError } from './runners/script-reviewer';
import { runStoryboarder, StoryboarderError } from './runners/storyboarder';
import { runContinuityCheck, ContinuityCheckError } from './runners/continuity-check';
import { runCopywriter, CopywriterError } from './runners/copywriter';
import { runEpisodeReferences, EpisodeReferencesError } from './runners/episode-references';
import {
  runEpisodeReferenceDesigner,
  EpisodeReferenceDesignerError,
} from './runners/episode-reference-designer';
import {
  runEpisodeReferenceCritic,
  EpisodeReferenceCriticError,
} from './runners/episode-reference-critic';
import { runAnimator, AnimatorError } from './runners/animator';
import { runAnimatorCritic, AnimatorCriticError } from './runners/animator-critic';
import {
  runGagAssistantDirector,
  GagAssistantDirectorError,
  type GagadPhase,
} from './runners/gag-assistant-director';
import { runAnimaticSlideshow, AnimaticSlideshowError } from './runners/animatic-slideshow';
import { loadSeriesBibleCanon } from './bible-loader';
import type { AgentId, AgentInputs, AgentResult } from './types';

// ── Inputs ────────────────────────────────────────────────────────────────────

export interface LoadInputsArgs {
  supabase: SupabaseClient<Database>;
  agentId: AgentId;
  episodeId: string;
  /**
   * Which asset statuses to load into upstream_assets. Defaults to
   * `['APPROVED']` — the historical behaviour. Reviewer agents (EXEC-SREV
   * and Sprint 10 unified reviewer) pass `['APPROVED','REVIEW','REVISION']`
   * because the reviewer IS the gate from REVIEW to APPROVED. Without this
   * override the input loader filters out the very asset under review.
   */
  allowedStatuses?: readonly string[];
}

/**
 * Loads upstream context for an agent run. Returns a loose AgentInputs object —
 * gate.ts has already verified the required assets exist, so we just collect
 * what's available for runAgent's use.
 */
export async function loadAgentInputs(args: LoadInputsArgs): Promise<AgentInputs> {
  const { supabase, agentId, episodeId, allowedStatuses } = args;
  const statuses = allowedStatuses && allowedStatuses.length > 0 ? allowedStatuses : ['APPROVED'];

  const { data: episode, error: epErr } = await supabase
    .from('episodes')
    .select('id, episode_code, governance_mode, status, title_working, series_id, budget_ceiling, budget_spent')
    .eq('id', episodeId)
    .single();
  if (epErr) {
    throw new Error(`loadAgentInputs: episode lookup failed: ${epErr.message}`);
  }

  const { data: assets, error: asErr } = await supabase
    .from('assets')
    .select(
      'id, file_type, filename, status, drive_path, staging_path, drive_web_view_url, version, content, metadata',
    )
    .eq('episode_id', episodeId)
    // Supabase typed-client narrows `status` to a literal union; widen via cast
    // at the boundary so the runtime-supplied `allowedStatuses` strings flow
    // through. Caller is responsible for using valid asset_status values.
    .in('status', statuses as never);
  if (asErr) {
    throw new Error(`loadAgentInputs: assets lookup failed: ${asErr.message}`);
  }

  // Sprint γ 2026-05-15 — approve-with-notes propagation.
  // For each upstream asset that was approved with a note, surface the
  // latest `approvals.notes` keyed by asset_id so producing agents
  // (Storyboarder, World Checker, etc.) can inject it into their prompt.
  // Non-fatal: empty record is the no-notes case and behaves identically
  // to pre-γ pipeline. Try/catch lets the mock supabase in replay-pilot
  // (which doesn't implement the approvals table) degrade gracefully.
  const upstreamApprovalNotes: Record<string, string> = {};
  const assetIds = (assets ?? []).map((a) => a.id);
  if (assetIds.length > 0) {
    try {
      const { data: approvalRows } = await supabase
        .from('approvals')
        .select('asset_id,notes,created_at,approval_type')
        .in('asset_id', assetIds)
        .eq('approval_type', 'APPROVE')
        .order('created_at', { ascending: false });
      for (const row of approvalRows ?? []) {
        if (!row.notes || typeof row.notes !== 'string') continue;
        const aid = row.asset_id;
        if (!aid) continue;
        if (upstreamApprovalNotes[aid]) continue; // keep newest only (desc order)
        upstreamApprovalNotes[aid] = row.notes;
      }
    } catch {
      // Mock supabase environments (replay-pilot) may not implement the
      // approvals table — degrade to empty notes; downstream runners
      // already treat the field as optional.
    }
  }

  // Load LOCKED Series Bible canon. Empty canon is valid (early-stage projects);
  // text-producing runners (SW, SREV, SB, COPY) gracefully degrade. Image and
  // continuity runners load the canon themselves with stricter preconditions.
  // Failure here is non-fatal: degrade to empty canon rather than blocking the
  // pipeline. Replay-pilot's mock supabase may not implement the assets/series
  // tables; without this guard the entire pipeline would fail in tests.
  let bible;
  try {
    bible = await loadSeriesBibleCanon(supabase, episodeId);
  } catch {
    bible = {
      series_id: null,
      general_idea: null,
      characters: [],
      locations: [],
      styles: [],
      total_entries: 0,
    };
  }

  // Sprint σ.1 (2026-05-15) — series.genre surfaced for the Skill selector.
  // Non-fatal: replay-pilot mock supabase doesn't implement `series`; degrade
  // to null and let the agent treat genre as unspecified (skill selector then
  // only matches skills without a `genre` constraint).
  let seriesGenre: string | null = null;
  if (episode?.series_id) {
    try {
      const { data: seriesRow } = await supabase
        .from('series')
        .select('id,genre')
        .eq('id', episode.series_id)
        .single();
      seriesGenre = (seriesRow as { genre?: string | null } | null)?.genre ?? null;
    } catch {
      // mock supabase fallthrough
    }
  }

  return {
    episode_id: episodeId,
    agent_id: agentId,
    episode,
    upstream_assets: assets,
    bible,
    upstream_approval_notes: upstreamApprovalNotes,
    series_genre: seriesGenre,
  };
}

// ── TD-49 Phase 2 P2.2 — Anchor Chain context loader ─────────────────────────
//
// The Animator's Plan body (P2.1) gains start_anchor + end_anchor fields, the
// EREF Designer's Plan body gains pair handoff authoring. Both decisions need
// shot-scoped context that loadAgentInputs (episode-scoped) doesn't expose:
//
//   - full_storyboard: all shots in narrative order (not just current shot)
//   - current_shot / adjacent_shots: prior + next storyboard entries
//   - prior_anchors: already-APPROVED IMG-anchor_* assets for earlier shots
//   - scene_master_asset: LOCKED Bible-level layout master for the location
//
// This helper is invoked by Designer (P2.3) and the approve-route batch flow
// (P2.6) when the episode is opted into anchor chain via
// `episodes.metadata.anchor_chain_enabled = true`. It is a separate function
// from loadAgentInputs because (a) it requires a shotId argument that not all
// agents use, and (b) it issues additional queries that legacy agents don't
// need.

import { listStoryboardShots, type StoryboardShotSummary } from '../api/vgen-shot-helpers';

export interface PriorAnchorRef {
  /** Asset UUID of the IMG-anchor_* asset. */
  asset_id: string;
  /** Shot id this anchor belongs to (lowercase form, e.g. ss-s15-e01-a1-sc01-sh07). */
  shotId: string;
  /** Which side of the shot this anchor represents. */
  side: 'start' | 'end';
  /** Storage filename — kept for audit / debugging. */
  filename: string;
  /** Storyboard sequence index, ascending — for narrative ordering. */
  seq: number;
}

export interface SceneMasterRef {
  /** Asset UUID of the SBL-scene_master_<slug> or SBL-location_<slug> asset. */
  asset_id: string;
  /** Concrete file_type — Designer chooses how to use it (scene_master > location). */
  file_type: string;
  filename: string;
  /** Source kind — 'scene_master' is the canonical layout lock; 'location' is the
   *  fallback when no scene_master is authored yet. */
  source: 'scene_master' | 'location';
}

export interface AnchorChainContext {
  /** Storyboard shots in narrative order, all parsed from the latest APPROVED STB. */
  full_storyboard: StoryboardShotSummary[];
  /** The specific shot the agent is currently authoring for. */
  current_shot: StoryboardShotSummary | null;
  adjacent_shots: {
    prior: StoryboardShotSummary | null;
    next: StoryboardShotSummary | null;
  };
  /** All APPROVED IMG-anchor_* assets for prior shots, in narrative order. */
  prior_anchors: PriorAnchorRef[];
  /** LOCKED scene_master for the current shot's location, or fallback location asset. */
  scene_master_asset: SceneMasterRef | null;
}

interface LoadAnchorChainContextArgs {
  supabase: SupabaseClient<Database>;
  episodeId: string;
  shotId: string;
}

const ANCHOR_FILENAME_RE = /-img-anchor_([a-z0-9_-]+?)_(start|end)-/i;

function extractAnchorRef(asset: {
  id: string;
  file_type: string | null;
  filename: string;
}): { shotIdLower: string; side: 'start' | 'end' } | null {
  // Filename format: SS-S15-E01-IMG-anchor_ss_s15_e01_a1_sc01_sh01_start-v01-APPROVED.png
  // Extract the shot id between `anchor_` and `_(start|end)`.
  const m = asset.filename.match(ANCHOR_FILENAME_RE);
  if (!m) return null;
  const shotIdLower = (m[1] ?? '').toLowerCase();
  const side = (m[2] ?? '').toLowerCase() as 'start' | 'end';
  if (!shotIdLower || (side !== 'start' && side !== 'end')) return null;
  return { shotIdLower, side };
}

function shotIdToLower(shotId: string): string {
  return shotId.toLowerCase().replace(/-/g, '_');
}

function resolveLocationSlug(shot: StoryboardShotSummary | null): string | null {
  if (!shot) return null;
  const loc = (shot as unknown as { location?: { slug?: unknown } | string }).location;
  if (!loc) return null;
  if (typeof loc === 'string') return loc.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  if (typeof loc === 'object') {
    const slug = (loc as { slug?: unknown }).slug;
    if (typeof slug === 'string' && slug.length > 0) return slug.toLowerCase();
  }
  return null;
}

/**
 * Loads shot-scoped anchor chain context for VANIM / EREF Designer authoring.
 * Returns an empty-but-structured object when the storyboard is missing or
 * shotId can't be resolved — callers fall back to the legacy single-reference
 * path. Phase 2 entry point.
 */
export async function loadAnchorChainContext(
  args: LoadAnchorChainContextArgs,
): Promise<AnchorChainContext> {
  const { supabase, episodeId, shotId } = args;

  const empty: AnchorChainContext = {
    full_storyboard: [],
    current_shot: null,
    adjacent_shots: { prior: null, next: null },
    prior_anchors: [],
    scene_master_asset: null,
  };

  // 1. Latest APPROVED STB-storyboard for this episode.
  const { data: stbRows } = await supabase
    .from('assets')
    .select('id,file_type,status,content,version,created_at')
    .eq('episode_id', episodeId)
    .eq('file_type', 'STB-storyboard')
    .eq('status', 'APPROVED')
    .order('version', { ascending: false })
    .limit(1);
  const stb = stbRows?.[0];
  if (!stb || typeof stb.content !== 'string') return empty;

  let shots: StoryboardShotSummary[] = [];
  try {
    shots = listStoryboardShots(stb.content);
  } catch {
    return empty;
  }
  if (shots.length === 0) return empty;

  const currentIdx = shots.findIndex((s) => s.shotId === shotId);
  const current_shot = currentIdx >= 0 ? shots[currentIdx]! : null;
  const adjacent_shots = {
    prior: currentIdx > 0 ? shots[currentIdx - 1]! : null,
    next: currentIdx >= 0 && currentIdx + 1 < shots.length ? shots[currentIdx + 1]! : null,
  };

  // 2. APPROVED IMG-anchor_* assets for prior shots in narrative order.
  const shotIdLowerToSeq = new Map<string, number>();
  shots.forEach((s, i) => shotIdLowerToSeq.set(shotIdToLower(s.shotId), i));

  const prior_anchors: PriorAnchorRef[] = [];
  const { data: anchorRows } = await supabase
    .from('assets')
    .select('id,file_type,filename,status,created_at')
    .eq('episode_id', episodeId)
    .like('file_type', 'IMG-anchor_%')
    .in('status', ['APPROVED', 'LOCKED'] as never)
    .order('created_at', { ascending: true })
    .limit(200);
  for (const row of anchorRows ?? []) {
    const ref = extractAnchorRef({
      id: String(row.id),
      file_type: row.file_type ?? null,
      filename: String(row.filename ?? ''),
    });
    if (!ref) continue;
    const seq = shotIdLowerToSeq.get(ref.shotIdLower);
    if (seq === undefined) continue;
    // Only include anchors whose shot is BEFORE the current shot in narrative
    // order — these are the "prior" cascade. The current shot's own anchors
    // are NOT included here (Designer/Animator authors them).
    if (currentIdx >= 0 && seq >= currentIdx) continue;
    prior_anchors.push({
      asset_id: String(row.id),
      shotId: ref.shotIdLower,
      side: ref.side,
      filename: String(row.filename ?? ''),
      seq,
    });
  }
  prior_anchors.sort((a, b) => a.seq - b.seq);

  // 3. scene_master_asset: series-level LOCKED Bible image for the location.
  //    Preference: SBL-scene_master_<slug> (TD-49 canonical layout master)
  //                → SBL-location_<slug>     (existing Bible location image)
  //    Both are series-scoped (`series_id IS NOT NULL`, `episode_id IS NULL`).
  let scene_master_asset: SceneMasterRef | null = null;
  const locationSlug = resolveLocationSlug(current_shot);
  if (locationSlug) {
    const { data: episode } = await supabase
      .from('episodes')
      .select('series_id')
      .eq('id', episodeId)
      .single();
    const seriesId = (episode as { series_id?: string | null } | null)?.series_id ?? null;
    if (seriesId) {
      const tryFetch = async (
        fileType: string,
        source: SceneMasterRef['source'],
      ): Promise<SceneMasterRef | null> => {
        const { data: rows } = await supabase
          .from('assets')
          .select('id,file_type,filename,status')
          .eq('series_id', seriesId)
          .eq('file_type', fileType)
          .in('status', ['APPROVED', 'LOCKED'] as never)
          .order('version', { ascending: false })
          .limit(1);
        const row = rows?.[0];
        if (!row) return null;
        return {
          asset_id: String(row.id),
          file_type: String(row.file_type),
          filename: String(row.filename ?? ''),
          source,
        };
      };
      scene_master_asset =
        (await tryFetch(`SBL-scene_master_${locationSlug}`, 'scene_master')) ??
        (await tryFetch(`SBL-location_${locationSlug}`, 'location')) ??
        null;
    }
  }

  return {
    full_storyboard: shots,
    current_shot,
    adjacent_shots,
    prior_anchors,
    scene_master_asset,
  };
}

// ── Agent execution (mock-only in Phase 4) ────────────────────────────────────

export interface RunAgentArgs {
  agentId: AgentId;
  inputs: AgentInputs;
  /** Optional shot id for EXEC-VGEN per-shot fan-out. */
  shotId?: string;
  /** Optional music section for EXEC-MGEN. */
  section?: string;
  /** Optional collection point for EXEC-ANAL. */
  collectionPoint?: 'T+1h' | 'T+24h' | 'T+7d' | 'T+30d';
  /** Optional youtube video id (passed by EXEC-PUB to EXEC-ANAL through events). */
  youtubeVideoId?: string;
  /** Resolved provider for the contract this agent fulfils. Undefined ⇒ mock everywhere (replay-pilot, tests). */
  provider?: ResolvedProvider;
  /** Supabase client (service role). Required for binary-producing agents that go to real providers — used by persistBinary to resolve the storage contract. */
  supabase?: SupabaseClient<Database>;
  /** Episode code (e.g. SS-S01-E02) — fed into Drive folder layout. */
  episodeCode?: string;
  /** EXEC-VGEN Universal Core: aspect ratio override (Pilot/Fan-out/Per-shot). */
  aspectRatio?: '16:9' | '9:16' | '1:1';
  /** EXEC-VGEN Universal Core: quality tier override. */
  qualityTier?: 'fast' | 'standard';
  /** EXEC-VGEN Universal Core: duration seconds override (animatic timing). */
  durationSeconds?: number;
  /** EXEC-VGEN: pilot pass marker for activity feed / metadata. */
  vgenPilot?: boolean;
  /**
   * Director's revision note when this agent run is a re-fire after
   * REQUEST_REVISION. Forwarded to writer-class agents so they treat the
   * note as hard acceptance criteria, not a polish hint. 2026-05-12 Mode 3
   * readiness drill — without this, requestRevision auto-chain delivers a
   * cosmetic revision instead of an actual fix.
   */
  revisionNote?: string;
  /**
   * Sprint «Дизайнер и Аниматор» Day 3.2 (2026-05-18) — APPROVED SPC-ref_plan
   * asset id. When set, EXEC-EREF runner switches into Plan-driven branch:
   * reads the Plan's JSON body for provider/size/variants/prompt/negative
   * and generates exactly one IMG-episode_ref for the planned shot. When
   * unset, runner falls back to the legacy multi-shot fan-out path.
   */
  planAssetId?: string;
  /**
   * Sprint «Дизайнер и Аниматор» Day 11+ (2026-05-19) — EXEC-GAGAD phase
   * selector. plan = write SPC-gag_plan; eref_review/vanim_review = critic.
   */
  gagPhase?: 'plan' | 'eref_review' | 'vanim_review';
  /** EXEC-GAGAD Phase plan — APPROVED SCR-script asset id (optional —
   *  runner can resolve via upstream_assets too). */
  scriptAssetId?: string;
}

// Helper: assemble metadata payload for binary outputs, encapsulating the
// difference between local-only and Drive-backed persistence.
function metadataFromPersisted(
  persisted: PersistedBinary,
  extra: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...extra,
    staging_path: persisted.absolutePath,
    drive_file_id: persisted.driveFileId,
    drive_web_view_url: persisted.driveWebViewUrl,
    storage_provider: persisted.storageProviderId,
    drive_upload_failed: persisted.driveUploadFailed,
  };
}

function buildAnimaticPrompt(inputs: AgentInputs): string {
  const ep = inputs.episode as { episode_code?: string; title_working?: string | null };
  const title = ep.title_working ?? 'Untitled comedy short';
  return [
    `Animatic preview for an animated comedy short titled "${title}".`,
    'Stylised 2D animation, muted palette, cinematic 16:9 framing.',
    'Smooth camera, simple silhouette compositions, no on-screen text.',
  ].join(' ');
}

function buildShotPrompt(inputs: AgentInputs, shotId?: string): string {
  const ep = inputs.episode as { episode_code?: string; title_working?: string | null };
  const title = ep.title_working ?? 'Untitled comedy short';
  return [
    `Single shot from animated comedy "${title}" (shot ${shotId ?? '?'}).`,
    'Vibrant 2D animation, dynamic action, comedic timing, 16:9 framing, no text.',
  ].join(' ');
}

function buildThumbnailPrompt(inputs: AgentInputs): string {
  const ep = inputs.episode as { episode_code?: string; title_working?: string | null };
  const code = ep.episode_code ?? 'episode';
  const title = ep.title_working ?? 'Untitled comedy short';
  return [
    `YouTube thumbnail for an animated comedy short titled "${title}" (${code}).`,
    'Style: stylised 2D-ish animation aesthetic, vibrant colours, dynamic composition,',
    'a clear focal subject readable at 320×180, comedy/sketch art direction.',
    'No text, no watermark, 16:9 framing, high contrast.',
  ].join(' ');
}

interface RunResult {
  result: AgentResult;
  /** What kind of asset to write — drives saveAgentOutput shape. */
  outputKind:
    | 'text-md'
    | 'image-png'
    | 'video-mp4'
    | 'audio-wav'
    | 'analytics-json'
    | 'publish-log';
}

/**
 * Dispatch by agentId. Each branch returns deterministic mock output that
 * matches the schema each agent is contracted to produce.
 *
 * In Sprint 10 the same switch routes to real provider calls; the API surface
 * does not change.
 */
export async function runAgent(args: RunAgentArgs): Promise<RunResult> {
  const {
    agentId,
    inputs,
    shotId,
    section,
    collectionPoint,
    youtubeVideoId,
    provider,
    supabase,
    episodeCode,
    aspectRatio,
    qualityTier,
    durationSeconds,
    vgenPilot,
    planAssetId,
    gagPhase,
    scriptAssetId,
  } = args;
  void provider; // referenced inside individual cases
  const episodeId = inputs.episode_id;
  const agentMeta = getAgent(agentId);

  switch (agentId) {
    case 'EXEC-SW': {
      // Real screenwriter — Anthropic Sonnet, reads APPROVED brief from
      // upstream_assets, returns markdown + scenes_v1 JSON. Contract:
      // specs/contracts/screenwriter@v1.yaml.
      //
      // Auto-mock fallback (mirrors provider-resolver.ts pattern): when
      // ANTHROPIC_API_KEY is not set we keep the mock path so replay-pilot
      // and unit tests run without secrets. In webapp dev/prod the key is
      // always present and the real path runs.
      const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
      if (hasAnthropicKey) {
        try {
          const sw = await runScreenwriter({ inputs, revisionNote: args.revisionNote });
          return {
            outputKind: 'text-md',
            result: {
              asset_paths: [],
              cost_usd: sw.costUsd,
              metadata: {
                agent_id: agentId,
                model: sw.model,
                contract: sw.contract,
                markdown: sw.markdown,
                body: sw.body,
                description: sw.description,
                brief_asset_id: sw.briefAssetId,
                mvp_missing_inputs: sw.notes,
                provider_id: sw.model,
                provider_used: 'anthropic',
              },
            },
          };
        } catch (err: unknown) {
          if (err instanceof ScreenwriterError) {
            throw new Error(`EXEC-SW: ${err.message}`);
          }
          throw err;
        }
      }
      // Fallback: mockLLM path (replay-pilot, unit tests, environments without key)
      const llm = await mockLLM({ agentId, episodeId });
      return {
        outputKind: 'text-md',
        result: {
          asset_paths: [],
          cost_usd: llm.cost_usd,
          metadata: {
            agent_id: agentId,
            model: agentMeta.model,
            markdown: llm.markdown,
            body: llm.body as Record<string, unknown>,
            provider_id: 'mock',
            provider_used: 'mock',
          },
        },
      };
    }

    case 'EXEC-SREV': {
      // Real script reviewer — Anthropic Sonnet, reads APPROVED brief +
      // script, returns markdown + verdict JSON. Contract:
      // specs/contracts/script_reviewer@v1.yaml.
      const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
      if (hasAnthropicKey) {
        try {
          const r = await runScriptReviewer({ inputs });
          return {
            outputKind: 'text-md',
            result: {
              asset_paths: [],
              cost_usd: r.costUsd,
              metadata: {
                agent_id: agentId,
                model: r.model,
                contract: r.contract,
                markdown: r.markdown,
                body: r.body,
                description: r.description,
                verdict: r.verdict,
                brief_asset_id: r.briefAssetId,
                script_asset_id: r.scriptAssetId,
                mvp_missing_inputs: r.notes,
                provider_id: r.model,
                provider_used: 'anthropic',
              },
            },
          };
        } catch (err: unknown) {
          if (err instanceof ScriptReviewerError) {
            throw new Error(`EXEC-SREV: ${err.message}`);
          }
          throw err;
        }
      }
      // Fallback: mockLLM (replay-pilot, tests, no key)
      const llm = await mockLLM({ agentId, episodeId });
      return {
        outputKind: 'text-md',
        result: {
          asset_paths: [],
          cost_usd: llm.cost_usd,
          metadata: {
            agent_id: agentId,
            model: agentMeta.model,
            markdown: llm.markdown,
            body: llm.body as Record<string, unknown>,
            provider_id: 'mock',
            provider_used: 'mock',
          },
        },
      };
    }

    case 'EXEC-SB': {
      // Real storyboarder — Anthropic Sonnet, breaks APPROVED script into
      // 3 acts × shots. Contract: specs/contracts/storyboarder@v1.yaml.
      const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
      if (hasAnthropicKey) {
        try {
          const r = await runStoryboarder({ inputs, revisionNote: args.revisionNote });
          return {
            outputKind: 'text-md',
            result: {
              asset_paths: [],
              cost_usd: r.costUsd,
              metadata: {
                agent_id: agentId,
                model: r.model,
                contract: r.contract,
                markdown: r.markdown,
                body: r.body,
                description: r.description,
                total_shots: r.totalShots,
                total_duration_s: r.totalDurationS,
                brief_asset_id: r.briefAssetId,
                script_asset_id: r.scriptAssetId,
                mvp_missing_inputs: r.notes,
                provider_id: r.model,
                provider_used: 'anthropic',
              },
            },
          };
        } catch (err: unknown) {
          if (err instanceof StoryboarderError) {
            throw new Error(`EXEC-SB: ${err.message}`);
          }
          throw err;
        }
      }
      // Fallback: mockLLM
      const llm = await mockLLM({ agentId, episodeId });
      return {
        outputKind: 'text-md',
        result: {
          asset_paths: [],
          cost_usd: llm.cost_usd,
          metadata: {
            agent_id: agentId,
            model: agentMeta.model,
            markdown: llm.markdown,
            body: llm.body as Record<string, unknown>,
            provider_id: 'mock',
            provider_used: 'mock',
          },
        },
      };
    }

    case 'EXEC-WCHK': {
      // Pivoted: was "World Checker", now Continuity Supervisor — validates
      // storyboard against LOCKED Series Bible canon. Contract:
      // specs/contracts/continuity_check@v1.yaml.
      const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
      if (hasAnthropicKey && supabase) {
        try {
          const r = await runContinuityCheck({ inputs, supabase });
          return {
            outputKind: 'text-md',
            result: {
              asset_paths: [],
              cost_usd: r.costUsd,
              metadata: {
                agent_id: agentId,
                model: r.model,
                contract: r.contract,
                markdown: r.markdown,
                body: r.body,
                description: r.description,
                verdict: r.verdict,
                storyboard_asset_id: r.storyboardAssetId,
                bible_snapshot: r.bibleSnapshot,
                provider_id: r.model,
                provider_used: 'anthropic',
              },
            },
          };
        } catch (err: unknown) {
          if (err instanceof ContinuityCheckError) {
            throw new Error(`EXEC-WCHK: ${err.message}`);
          }
          throw err;
        }
      }
      // Fallback: mockLLM
      const llm = await mockLLM({ agentId, episodeId });
      return {
        outputKind: 'text-md',
        result: {
          asset_paths: [],
          cost_usd: llm.cost_usd,
          metadata: {
            agent_id: agentId,
            model: agentMeta.model,
            markdown: llm.markdown,
            body: llm.body as Record<string, unknown>,
            provider_id: 'mock',
            provider_used: 'mock',
          },
        },
      };
    }

    case 'EXEC-COPY': {
      // Real copywriter — Haiku 4.5 (cheap + fast). Contract:
      // specs/contracts/copywriter@v1.yaml.
      const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
      if (hasAnthropicKey) {
        try {
          const r = await runCopywriter({ inputs });
          return {
            outputKind: 'text-md',
            result: {
              asset_paths: [],
              cost_usd: r.costUsd,
              metadata: {
                agent_id: agentId,
                model: r.model,
                contract: r.contract,
                markdown: r.markdown,
                body: r.body,
                description: r.description,
                provider_id: r.model,
                provider_used: 'anthropic',
              },
            },
          };
        } catch (err: unknown) {
          if (err instanceof CopywriterError) throw new Error(`EXEC-COPY: ${err.message}`);
          throw err;
        }
      }
      const llm = await mockLLM({ agentId, episodeId });
      return {
        outputKind: 'text-md',
        result: {
          asset_paths: [],
          cost_usd: llm.cost_usd,
          metadata: {
            agent_id: agentId,
            model: agentMeta.model,
            markdown: llm.markdown,
            body: llm.body as Record<string, unknown>,
            provider_id: 'mock',
            provider_used: 'mock',
          },
        },
      };
    }

    case 'EXEC-EREF-DESIGNER': {
      // Sprint «Дизайнер и Аниматор» 2026-05-18 — LLM Plan author for EREF.
      // Pure-cost Sonnet 4.6 call per shot; does NOT call any image provider.
      // Writes a SPC-ref_plan asset that the Critic validates and the
      // Director approves; only then does EXEC-EREF executor consume it.
      if (!shotId) {
        throw new Error(`EXEC-EREF-DESIGNER requires shotId in event payload`);
      }
      const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
      if (hasAnthropicKey) {
        try {
          const r = await runEpisodeReferenceDesigner({
            inputs,
            shotId,
            revisionNote: args.revisionNote,
            // TD-30 (2026-05-21): pass supabase so Designer can query prior
            // APPROVED IMG-episode_ref in the same location and embed it as
            // a scene_continuity anchor. Falls back to null gracefully when
            // supabase is undefined (e.g. replay-pilot mock harness).
            supabase,
          });
          return {
            outputKind: 'text-md',
            result: {
              asset_paths: [],
              cost_usd: r.costUsd,
              metadata: {
                agent_id: agentId,
                model: r.model,
                contract: r.contract,
                markdown: r.markdown,
                body: r.body,
                description: r.description,
                shot_id: r.shotId,
                storyboard_asset_id: r.storyboardAssetId,
                delivery_targets: r.deliveryTargets,
                designer_notes: r.notes,
                provider_id: r.model,
                provider_used: 'anthropic',
                plan_kind: 'ref_plan',
              },
            },
          };
        } catch (err: unknown) {
          if (err instanceof EpisodeReferenceDesignerError) {
            throw new Error(`EXEC-EREF-DESIGNER: ${err.message}`);
          }
          throw err;
        }
      }
      // Fallback: mockLLM so replay-pilot + tests without an API key keep
      // running. Mock body shape doesn't match a real Plan, but downstream
      // is gated by Director approval — no provider call ever fires from
      // a mock Plan.
      const llm = await mockLLM({ agentId, episodeId });
      return {
        outputKind: 'text-md',
        result: {
          asset_paths: [],
          cost_usd: llm.cost_usd,
          metadata: {
            agent_id: agentId,
            model: agentMeta.model,
            markdown: llm.markdown,
            body: llm.body as Record<string, unknown>,
            description: 'Stub EXEC-EREF-DESIGNER mock — set ANTHROPIC_API_KEY for real path',
            shot_id: shotId,
            plan_kind: 'ref_plan',
            provider_id: 'mock',
            provider_used: 'mock',
          },
        },
      };
    }

    case 'EXEC-VANIM': {
      // Sprint «Дизайнер и Аниматор» Day 6-7 2026-05-19 — Animator. Pure-cost
      // Sonnet 4.6 Plan author for one shot. Does NOT call any video provider.
      // Output: SPC-shot_plan-<shot_id> asset consumed by EXEC-VGEN executor
      // after Director approves the Plan.
      if (!shotId) {
        throw new Error(`EXEC-VANIM requires shotId in event payload`);
      }
      const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
      if (hasAnthropicKey) {
        try {
          const r = await runAnimator({
            inputs,
            shotId,
            revisionNote: args.revisionNote,
            // TD-52 (2026-05-25): pass supabase so the Animator can load
            // anchor chain context + DB-resolve IMG-anchor asset_ids when
            // episode opts into TD-49 Phase 2 anchor pipeline.
            supabase: args.supabase,
          });
          return {
            outputKind: 'text-md',
            result: {
              asset_paths: [],
              cost_usd: r.costUsd,
              metadata: {
                agent_id: agentId,
                model: r.model,
                contract: r.contract,
                markdown: r.markdown,
                body: r.body,
                description: r.description,
                shot_id: r.shotId,
                storyboard_asset_id: r.storyboardAssetId,
                delivery_targets: r.deliveryTargets,
                animator_notes: r.notes,
                provider_id: r.model,
                provider_used: 'anthropic',
                plan_kind: 'shot_plan',
              },
            },
          };
        } catch (err: unknown) {
          if (err instanceof AnimatorError) {
            throw new Error(`EXEC-VANIM: ${err.message}`);
          }
          throw err;
        }
      }
      const llm = await mockLLM({ agentId, episodeId });
      return {
        outputKind: 'text-md',
        result: {
          asset_paths: [],
          cost_usd: llm.cost_usd,
          metadata: {
            agent_id: agentId,
            model: agentMeta.model,
            markdown: llm.markdown,
            body: llm.body as Record<string, unknown>,
            description: 'Stub EXEC-VANIM mock — set ANTHROPIC_API_KEY for real path',
            shot_id: shotId,
            plan_kind: 'shot_plan',
            provider_id: 'mock',
            provider_used: 'mock',
          },
        },
      };
    }

    case 'EXEC-GAGAD': {
      // Sprint «Дизайнер и Аниматор» Day 11+ 2026-05-19 — Gag Assistant Director.
      // Three phases dispatched on `gagPhase`:
      //   - plan: write SPC-gag_plan asset (factory's saveAgentOutput handles)
      //   - eref_review: validate SPC-ref_plan vs gag_plan; skip_save + manual
      //     REV-gag_check_ref insert + revision counter side-effect
      //   - vanim_review: same for SPC-shot_plan; REV-gag_check_shot insert
      if (!gagPhase) {
        throw new Error(`EXEC-GAGAD requires gagPhase in event payload`);
      }
      if (!supabase) {
        throw new Error(`EXEC-GAGAD requires supabase client`);
      }
      const hasAnthropicKeyG = Boolean(process.env.ANTHROPIC_API_KEY?.trim());

      // ── Phase=plan: factory's saveAgentOutput handles SPC-gag_plan asset.
      if (gagPhase === 'plan') {
        if (hasAnthropicKeyG) {
          try {
            const r = await runGagAssistantDirector({
              phase: 'plan',
              inputs,
              supabase,
              scriptAssetId,
              revisionNote: args.revisionNote,
            });
            return {
              outputKind: 'text-md',
              result: {
                asset_paths: [],
                cost_usd: r.costUsd,
                metadata: {
                  agent_id: agentId,
                  model: r.model,
                  contract: r.contract,
                  markdown: r.markdown,
                  body: r.body,
                  description: r.description,
                  gag_phase: 'plan' as const,
                  script_asset_id: r.scriptAssetId ?? null,
                  gagad_notes: r.notes,
                  provider_id: r.model,
                  provider_used: 'anthropic',
                  plan_kind: 'gag_plan',
                },
              },
            };
          } catch (err: unknown) {
            if (err instanceof GagAssistantDirectorError) {
              throw new Error(`EXEC-GAGAD plan: ${err.message}`);
            }
            throw err;
          }
        }
        // Mock fallback for replay-pilot / no API key.
        const llmG = await mockLLM({ agentId, episodeId });
        return {
          outputKind: 'text-md',
          result: {
            asset_paths: [],
            cost_usd: llmG.cost_usd,
            metadata: {
              agent_id: agentId,
              model: agentMeta.model,
              markdown: llmG.markdown,
              body: llmG.body as Record<string, unknown>,
              description: 'Stub EXEC-GAGAD plan mock — set ANTHROPIC_API_KEY for real path',
              gag_phase: 'plan' as const,
              plan_kind: 'gag_plan',
              provider_id: 'mock',
              provider_used: 'mock',
            },
          },
        };
      }

      // ── Review phases: eref_review / vanim_review
      const reviewPhase: GagadPhase = gagPhase;
      if (!planAssetId) {
        throw new Error(`EXEC-GAGAD ${reviewPhase} requires planAssetId`);
      }
      if (!shotId) {
        throw new Error(`EXEC-GAGAD ${reviewPhase} requires shotId`);
      }

      let reviewResult: Awaited<ReturnType<typeof runGagAssistantDirector>>;
      if (hasAnthropicKeyG) {
        try {
          reviewResult = await runGagAssistantDirector({
            phase: reviewPhase,
            inputs,
            supabase,
            planAssetId,
            shotId,
          });
        } catch (err: unknown) {
          if (err instanceof GagAssistantDirectorError) {
            throw new Error(`EXEC-GAGAD ${reviewPhase}: ${err.message}`);
          }
          throw err;
        }
      } else {
        // Mock fallback: PASS verdict so chain progresses in replay-pilot.
        reviewResult = {
          phase: reviewPhase,
          markdown: `Mock GAGAD ${reviewPhase} — PASS`,
          body: { verdict: 'PASS' },
          costUsd: 0,
          model: 'mock',
          contract: 'gag_assistant_director@v1' as const,
          description: `Stub EXEC-GAGAD ${reviewPhase} mock`,
          notes: [],
          verdict: 'PASS' as const,
          planAssetId,
          shotId,
          gagPlanAssetId: null,
          revisionCountBefore: 0,
          acceptanceCriteria: [],
          failedChecks: [],
          passedChecks: [],
        };
      }

      // ── Side-effects: revision counter + status flip + halt-escalation event
      const verdict = reviewResult.verdict ?? 'UNKNOWN';
      const beforeCount = reviewResult.revisionCountBefore ?? 0;
      const upstreamStatusAfter =
        verdict === 'PASS'
          ? null
          : verdict === 'HALT'
            ? null // do NOT flip on HALT — Plan stays REVIEW for Director attention
            : verdict === 'REVISE'
              ? 'REVISION'
              : null;
      let afterCount = beforeCount;
      if (verdict === 'REVISE') {
        afterCount = beforeCount + 1;
      }

      // Update upstream Plan: counter + status (only for REVISE)
      if (verdict === 'REVISE' || verdict === 'HALT') {
        try {
          const { data: upstream } = await supabase
            .from('assets')
            .select('metadata,status')
            .eq('id', planAssetId)
            .maybeSingle();
          const upMeta = (upstream?.metadata as Record<string, unknown> | null) ?? {};
          const newMeta = {
            ...upMeta,
            gagad_revision_count: afterCount,
            gagad_last_verdict: verdict,
            gagad_last_verdict_at: new Date().toISOString(),
          };
          const patch: Record<string, unknown> = { metadata: newMeta as unknown };
          if (upstreamStatusAfter) patch.status = upstreamStatusAfter;
          await supabase
            .from('assets')
            .update(patch as never)
            .eq('id', planAssetId);
        } catch {
          // Non-fatal: counter persistence best-effort. Worst case next review
          // sees stale counter — still bounded by Director intervention.
        }
      }

      // Halt escalation: emit activity event so Director Inbox surfaces it
      if (verdict === 'HALT') {
        try {
          await supabase
            .from('activity_events')
            .insert({
              event_type: 'revision_requested',
              severity: 'warning',
              title: `GAGAD HALT — manual review needed (${reviewPhase})`,
              description: `GAGAD reached revision cap (count=${beforeCount}) on shot ${shotId}. Director attention required.`,
              actor: 'EXEC-GAGAD',
              episode_id: episodeId,
              asset_id: planAssetId,
              metadata: {
                gagad_escalation: true,
                reason: 'cap_reached_2',
                phase: reviewPhase,
                target_asset_id: planAssetId,
                shot_id: shotId,
                revision_count: beforeCount,
              },
            } as never);
        } catch {
          // Non-fatal: log only.
        }
      }

      // ── Save the REV verdict asset directly (skip_save bypass)
      // Compose REV-gag_check_ref / _shot filename + insert
      const targetFileType =
        reviewPhase === 'eref_review' ? 'REV-gag_check_ref' : 'REV-gag_check_shot';
      const epRow = inputs.episode as { episode_code?: string } | undefined;
      const epCode = epRow?.episode_code ?? 'SS-UNKNOWN';
      const safeShot = shotId.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();

      // Find next version for this combination
      const { data: existingRev } = await supabase
        .from('assets')
        .select('version')
        .eq('episode_id', episodeId)
        .eq('file_type', targetFileType)
        .like('filename', `%${safeShot}%`);
      const maxV = (existingRev ?? []).reduce(
        (m, r) => Math.max(m, r.version ?? 0),
        0,
      );
      const nextV = maxV + 1;
      const vStr = `v${String(nextV).padStart(2, '0')}`;
      const filename = `${epCode}-REV-gag_check_${reviewPhase === 'eref_review' ? 'ref' : 'shot'}-${safeShot}-${vStr}-DRAFT.md`;

      const { data: inserted, error: insErr } = await supabase
        .from('assets')
        .insert({
          episode_id: episodeId,
          series_id: null,
          agent_id: 'EXEC-GAGAD',
          file_type: targetFileType,
          filename,
          description: reviewResult.description,
          status: 'REVIEW',
          version: nextV,
          content: reviewResult.markdown,
          metadata: {
            ...(reviewResult.body as Record<string, unknown>),
            phase: reviewPhase,
            plan_asset_id: planAssetId,
            shot_id: shotId,
            gag_plan_asset_id: reviewResult.gagPlanAssetId,
            verdict,
            acceptance_criteria: reviewResult.acceptanceCriteria,
            failed_checks: reviewResult.failedChecks,
            passed_checks: reviewResult.passedChecks,
            revision_count_before: beforeCount,
            revision_count_after: afterCount,
            upstream_status_after: upstreamStatusAfter,
            agent_id: 'EXEC-GAGAD',
            model: reviewResult.model,
            contract: reviewResult.contract,
            provider_id: reviewResult.model,
            provider_used: hasAnthropicKeyG ? 'anthropic' : 'mock',
          } as unknown as Record<string, unknown>,
        } as never)
        .select('id')
        .single();

      if (insErr) {
        throw new Error(`EXEC-GAGAD ${reviewPhase} insert failed: ${insErr.message}`);
      }

      return {
        outputKind: 'text-md',
        result: {
          asset_paths: [],
          cost_usd: reviewResult.costUsd,
          metadata: {
            agent_id: agentId,
            model: reviewResult.model,
            contract: reviewResult.contract,
            markdown: reviewResult.markdown,
            body: reviewResult.body,
            description: reviewResult.description,
            gag_phase: reviewPhase,
            plan_asset_id: planAssetId,
            shot_id: shotId,
            gag_plan_asset_id: reviewResult.gagPlanAssetId,
            verdict,
            acceptance_criteria: reviewResult.acceptanceCriteria,
            failed_checks: reviewResult.failedChecks,
            passed_checks: reviewResult.passedChecks,
            revision_count_before: beforeCount,
            revision_count_after: afterCount,
            upstream_status_after: upstreamStatusAfter,
            // Tell factory.ts to skip its own save — we already inserted above.
            skip_save: true,
            inserted_asset_ids: [inserted.id],
            provider_id: reviewResult.model,
            provider_used: hasAnthropicKeyG ? 'anthropic' : 'mock',
          },
        },
      };
    }

    case 'EXEC-VPREV': {
      // Sprint «Дизайнер и Аниматор» Day 8 2026-05-19 — Animator's Critic.
      // Validates SPC-shot_plan against V01-V09. Side-effects Plan asset
      // status flip per verdict.
      if (!planAssetId) {
        throw new Error(`EXEC-VPREV requires planAssetId in event payload`);
      }
      if (!shotId) {
        throw new Error(`EXEC-VPREV requires shotId in event payload`);
      }
      if (!supabase) {
        throw new Error(`EXEC-VPREV requires supabase client`);
      }
      const hasAnthropicKeyV = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
      if (hasAnthropicKeyV) {
        try {
          const r = await runAnimatorCritic({
            inputs,
            supabase,
            planAssetId,
            shotId,
          });
          const targetPlanStatus =
            r.verdict === 'PASS'
              ? null
              : r.verdict === 'FAIL'
              ? 'REJECTED'
              : 'REVISION';
          if (targetPlanStatus) {
            await supabase
              .from('assets')
              .update({ status: targetPlanStatus } as never)
              .eq('id', planAssetId);
          }
          return {
            outputKind: 'text-md',
            result: {
              asset_paths: [],
              cost_usd: r.costUsd,
              metadata: {
                agent_id: agentId,
                model: r.model,
                contract: r.contract,
                markdown: r.markdown,
                body: r.body,
                description: r.description,
                shot_id: r.shotId,
                plan_asset_id: r.planAssetId,
                verdict: r.verdict,
                acceptance_criteria: r.acceptanceCriteria,
                failed_checks: r.failedChecks,
                passed_checks: r.passedChecks,
                critic_notes: r.notes,
                plan_status_after_critic: targetPlanStatus ?? 'REVIEW',
                provider_id: r.model,
                provider_used: 'anthropic',
                review_kind: 'shot_plan_critic',
                // Day 11+ — surface series_genre so VPREV.nextEvent can decide
                // whether to chain to GAGAD vanim_review.
                series_genre: (inputs.series_genre as string | null | undefined) ?? null,
              },
            },
          };
        } catch (err: unknown) {
          if (err instanceof AnimatorCriticError) {
            throw new Error(`EXEC-VPREV: ${err.message}`);
          }
          throw err;
        }
      }
      const llmV = await mockLLM({ agentId, episodeId });
      return {
        outputKind: 'text-md',
        result: {
          asset_paths: [],
          cost_usd: llmV.cost_usd,
          metadata: {
            agent_id: agentId,
            model: agentMeta.model,
            markdown: llmV.markdown,
            body: { verdict: 'PASS' } as Record<string, unknown>,
            description: 'Stub EXEC-VPREV mock — set ANTHROPIC_API_KEY for real path',
            shot_id: shotId,
            plan_asset_id: planAssetId,
            verdict: 'PASS' as const,
            review_kind: 'shot_plan_critic',
            provider_id: 'mock',
            provider_used: 'mock',
          },
        },
      };
    }

    case 'EXEC-EPREV': {
      // Sprint «Дизайнер и Аниматор» Day 4 2026-05-19 — Designer's Critic.
      // Validates SPC-ref_plan asset against V01-V09 hard checks. Pure
      // Sonnet 4.6 call; cheap (~$0.01-0.03). No image generation.
      if (!planAssetId) {
        throw new Error(`EXEC-EPREV requires planAssetId in event payload`);
      }
      if (!shotId) {
        throw new Error(`EXEC-EPREV requires shotId in event payload`);
      }
      if (!supabase) {
        throw new Error(`EXEC-EPREV requires supabase client`);
      }
      const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
      if (hasAnthropicKey) {
        try {
          const r = await runEpisodeReferenceCritic({
            inputs,
            supabase,
            planAssetId,
            shotId,
          });
          // Side-effect: flip the Plan asset's status based on the Critic's
          // verdict. PASS leaves the Plan in REVIEW for Director; REVISE
          // flips to REVISION (Designer re-runs via Critic's nextEvent);
          // FAIL flips to REJECTED for Director escalation. UNKNOWN (no
          // parseable JSON) is treated as REVISE — Designer must redo it.
          const targetPlanStatus =
            r.verdict === 'PASS'
              ? null
              : r.verdict === 'FAIL'
              ? 'REJECTED'
              : 'REVISION';
          if (targetPlanStatus) {
            await supabase
              .from('assets')
              .update({ status: targetPlanStatus } as never)
              .eq('id', planAssetId);
          }
          return {
            outputKind: 'text-md',
            result: {
              asset_paths: [],
              cost_usd: r.costUsd,
              metadata: {
                agent_id: agentId,
                model: r.model,
                contract: r.contract,
                markdown: r.markdown,
                body: r.body,
                description: r.description,
                shot_id: r.shotId,
                plan_asset_id: r.planAssetId,
                verdict: r.verdict,
                acceptance_criteria: r.acceptanceCriteria,
                failed_checks: r.failedChecks,
                passed_checks: r.passedChecks,
                critic_notes: r.notes,
                plan_status_after_critic: targetPlanStatus ?? 'REVIEW',
                provider_id: r.model,
                provider_used: 'anthropic',
                review_kind: 'ref_plan_critic',
                // Day 11+ — surface series_genre so EPREV.nextEvent can decide
                // whether to chain to GAGAD review (only fires for comedy-like).
                series_genre: (inputs.series_genre as string | null | undefined) ?? null,
              },
            },
          };
        } catch (err: unknown) {
          if (err instanceof EpisodeReferenceCriticError) {
            throw new Error(`EXEC-EPREV: ${err.message}`);
          }
          throw err;
        }
      }
      // Mock fallback — replay-pilot / no API key. Default to PASS so the
      // chain progresses for self-tests. Auto-chain in factory.nextEvent
      // honours this verdict and flips the Plan to REVIEW.
      const llm = await mockLLM({ agentId, episodeId });
      return {
        outputKind: 'text-md',
        result: {
          asset_paths: [],
          cost_usd: llm.cost_usd,
          metadata: {
            agent_id: agentId,
            model: agentMeta.model,
            markdown: llm.markdown,
            body: { verdict: 'PASS' } as Record<string, unknown>,
            description: 'Stub EXEC-EPREV mock — set ANTHROPIC_API_KEY for real path',
            shot_id: shotId,
            plan_asset_id: planAssetId,
            verdict: 'PASS' as const,
            review_kind: 'ref_plan_critic',
            provider_id: 'mock',
            provider_used: 'mock',
          },
        },
      };
    }

    case 'EXEC-EREF': {
      // Real Episode Reference Generator. Bible-anchored gpt-image-2 fan-out
      // — produces N IMG-episode_ref_<slug> assets directly. Contract:
      // specs/contracts/episode_references@v1.yaml.
      //
      // Sprint «Дизайнер и Аниматор» Day 3.2 (2026-05-18): when planAssetId
      // + shotId are set (Plan-driven branch, q1a additive), runner generates
      // exactly one IMG-episode_ref for the planned shot using the Plan's
      // provider/size/variants/prompt/negative decisions. When unset, legacy
      // multi-shot fan-out path runs.
      const hasOpenAI = Boolean(process.env.OPENAI_API_KEY?.trim());
      if (hasOpenAI && supabase) {
        try {
          const r = await runEpisodeReferences({
            inputs,
            supabase,
            episodeCode,
            planAssetId,
            shotId,
          });
          return {
            outputKind: 'image-png',
            result: {
              // Empty asset_paths because the runner already inserted N rows
              // directly. saveAgentOutput sees skip_save and doesn't create
              // an extra placeholder row.
              asset_paths: [],
              cost_usd: r.costUsd,
              metadata: {
                agent_id: agentId,
                contract: r.contract,
                provider_id: 'gpt-image-1',
                provider_used: 'gpt-image-1',
                description: r.description,
                skip_save: true,
                inserted_asset_ids: r.insertedAssetIds,
                total_images: r.totalImages,
                bible_snapshot: r.bibleSnapshot,
              },
            },
          };
        } catch (err: unknown) {
          if (err instanceof EpisodeReferencesError) {
            throw new Error(`EXEC-EREF: ${err.message}`);
          }
          throw err;
        }
      }
      // Fallback: mock placeholder so replay-pilot keeps working.
      const image = await mockImage({
        episodeId,
        assetId: `episode_ref-${episodeId.slice(-8)}`,
      });
      return {
        outputKind: 'image-png',
        result: {
          asset_paths: [image.drive_path],
          cost_usd: image.cost_usd,
          metadata: {
            ...image,
            agent_id: agentId,
            provider_id: 'mock',
            provider_used: 'mock',
            description: 'Stub EXEC-EREF mock — set OPENAI_API_KEY for real path',
          },
        },
      };
    }

    case 'EXEC-EDIT': {
      // EXEC-EDIT priority: Step 8-lite slideshow assembly when ≥1 APPROVED
      // IMG-episode_ref exists in upstream. This is our Bible-anchored animatic
      // gate per Director's critique #4 — Director validates pacing on a
      // browser-rendered sequence of approved refs. Music + real MP4 land in
      // Step 8.5 / 8 full.
      const upstream = inputs.upstream_assets as
        | ReadonlyArray<{ file_type?: string | null; status?: string | null }>
        | undefined;
      const hasApprovedRefs = (upstream ?? []).some(
        (a) =>
          typeof a.file_type === 'string' &&
          a.file_type.startsWith('IMG-episode_ref') &&
          a.status === 'APPROVED',
      );
      if (hasApprovedRefs && supabase) {
        try {
          const slide = await runAnimaticSlideshow({ inputs, supabase, episodeCode });
          return {
            outputKind: 'text-md',
            result: {
              asset_paths: [],
              cost_usd: slide.costUsd,
              metadata: {
                agent_id: agentId,
                contract: slide.contract,
                provider_id: 'slideshow',
                provider_used: 'slideshow',
                markdown: slide.markdown,
                body: slide.body,
                description: slide.description,
                animatic_kind: 'slideshow_v1',
                total_duration_s: slide.totalDurationS,
                frame_count: slide.frameCount,
                // animatic@v1 — interactive browser-native player payload.
                // Drawer renders <AnimaticPlayer /> when present.
                ...(slide.animaticV1 ? { animatic_v1: slide.animaticV1 } : {}),
              },
            },
          };
        } catch (err: unknown) {
          if (err instanceof AnimaticSlideshowError) {
            throw new Error(`EXEC-EDIT (slideshow): ${err.message}`);
          }
          throw err;
        }
      }

      // Legacy real Veo path + mock path (kept for replay-pilot and Step 9).
      const llm = await mockLLM({ agentId, episodeId });
      const shotIds = [1, 2, 3].map((act) => `${episodeId}-A${act}-SC01-SH01`);

      if (provider?.providerId === 'veo-3' || provider?.providerId === 'veo-3-img2vid') {
        if (!supabase) throw new Error('EXEC-EDIT real path requires supabase in runArgs');
        const real = await generateVideoVeoGemini({
          prompt: buildAnimaticPrompt(inputs),
          durationSeconds: 8,
          aspectRatio: '16:9',
          quality: 'fast',
        });
        const persisted = await persistBinary({
          base64: real.mp4_b64,
          ext: 'mp4',
          driveFilename: `${episodeCode ?? 'SS-unknown'}-VID-animatic-v01-DRAFT.mp4`,
          localHint: `animatic-${episodeId.slice(-8)}`,
          episodeCode,
          supabase,
        });
        return {
          outputKind: 'video-mp4',
          result: {
            asset_paths: [persisted.browserUrl],
            cost_usd: llm.cost_usd + real.cost_usd,
            metadata: metadataFromPersisted(persisted, {
              agent_id: agentId,
              provider_id: real.provider,
              provider_used: real.provider,
              format: real.format,
              width: real.width,
              height: real.height,
              duration_seconds: real.duration_seconds,
              size_bytes: real.size_bytes,
              markdown: llm.markdown,
              body: llm.body as Record<string, unknown>,
              shot_ids: shotIds,
            }),
          },
        };
      }

      const video = await mockVideo({ episodeId, shotId: 'animatic', durationSeconds: 60 });
      return {
        outputKind: 'video-mp4',
        result: {
          asset_paths: [video.drive_path],
          cost_usd: llm.cost_usd + video.cost_usd,
          metadata: {
            ...video,
            agent_id: agentId,
            provider_id: 'mock',
            provider_used: 'mock',
            markdown: llm.markdown,
            body: llm.body as Record<string, unknown>,
            shot_ids: shotIds,
          },
        },
      };
    }

    case 'EXEC-VGEN': {
      if (!shotId) {
        throw new Error(`EXEC-VGEN requires shotId in event payload`);
      }

      // Phase 2 (2026-05-13): widened from veo-only to any registered multi-
      // provider id. Seedance 2.0 via fal.ai is the new default; Veo 3.1 stays
      // available via UI dropdown / regenerate-video override.
      const KNOWN_REAL_VIDEO_PROVIDERS = new Set([
        'veo-3',
        'veo-3-img2vid',
        'seedance-fal',
        'seedance-fal-img2vid',
      ]);
      const isRealVideo = provider?.providerId
        ? KNOWN_REAL_VIDEO_PROVIDERS.has(provider.providerId)
        : false;
      const isVeoProvider =
        provider?.providerId === 'veo-3-img2vid' || provider?.providerId === 'veo-3';

      // ── Universal Core defaults ───────────────────────────────────────────
      // Per-event override → series defaults → hardcoded fallback. Series
      // defaults plumbing happens at the call site (Inngest function reads
      // app_config); the runner just trusts what's in the event payload.
      const effectiveAspect: '16:9' | '9:16' | '1:1' = aspectRatio ?? '16:9';
      // TD-33 (q7a Step 6): mutated post-plan-load when an Animator Plan
      // specifies `quality_tier`. Plan beats event arg (Animator's decision
      // of record). Falls back to event arg → 'fast'.
      let effectiveQuality: 'fast' | 'standard' = qualityTier ?? 'fast';

      // ── Resolve approved EREF reference image (img2vid) ───────────────────
      // Skipped when supabase is unavailable (replay-pilot mock harness) or
      // when the agent input list lacks any EREF — the runner falls through
      // to the legacy text-to-video path and the mock-mode behaviour stays
      // intact for back-compat (29/29 replay-pilot expects the old shape).
      let referenceImageBase64: string | null = null;
      let referenceErefAssetId: string | null = null;
      let storyboardShot: StoryboardShotV2 | null = null;
      let storyboardAssetId: string | null = null;
      let resolvedDurationSeconds: number | null = null;

      const upstream = (inputs.upstream_assets ?? []) as Array<{
        id: string;
        file_type: string;
        content?: string | null;
        metadata?: unknown;
      }>;

      // Resolve storyboard shot for prompt + duration
      const stb = upstream.find((a) => a.file_type === 'STB-storyboard' && a.content);
      if (stb && stb.content) {
        storyboardAssetId = stb.id;
        storyboardShot = getStoryboardShotById(stb.content, shotId);
      }

      // Resolve approved EREF for img2vid + apply Director's animatic overrides.
      if (supabase && isRealVideo) {
        const ref = await getApprovedEREFForShot(supabase, episodeId, shotId);
        if (ref) {
          referenceErefAssetId = ref.asset.id;
          referenceImageBase64 = ref.image_b64;
        }

        // Apply animatic director-overrides for duration when present.
        const animatic = upstream.find(
          (a) => a.file_type === 'VID-animatic' && isAnimaticV1(a.metadata),
        );
        if (animatic && isAnimaticV1(animatic.metadata)) {
          const animaticDoc = (animatic.metadata as { animatic_v1: { shot_list: Array<{ shot_id: string; duration_seconds: number }>; director_overrides?: Record<string, { duration_seconds: number }> } }).animatic_v1;
          const animShot = animaticDoc.shot_list.find((s) => s.shot_id === shotId);
          if (animShot) {
            resolvedDurationSeconds = effectiveDurationSeconds(
              {
                shot_id: animShot.shot_id,
                asset_id: '',
                image_url: '',
                duration_seconds: animShot.duration_seconds,
              },
              animaticDoc.director_overrides,
            );
          }
        }
      }

      const finalDuration = (() => {
        // Veo rejects fractional or out-of-range durations with HTTP 400
        // ("between 4 and 8, inclusive"). Always round AND clamp on every
        // branch — earlier the explicit-arg branch skipped Math.round,
        // letting a 3.x or 5.5 leak through and crash the call.
        // Surfaced 2026-05-13 evening on E20 single-shot regen.
        if (typeof durationSeconds === 'number' && durationSeconds > 0) {
          return Math.min(8, Math.max(4, Math.round(durationSeconds)));
        }
        if (resolvedDurationSeconds !== null) {
          return Math.min(8, Math.max(4, Math.round(resolvedDurationSeconds)));
        }
        if (storyboardShot?.duration_seconds && storyboardShot.duration_seconds > 0) {
          return Math.min(8, Math.max(4, Math.round(storyboardShot.duration_seconds)));
        }
        return 5;
      })();

      const episodeMeta = inputs.episode as { title_working?: string | null };
      const episodeTitle = episodeMeta?.title_working ?? '';

      // Phase A.1 (2026-05-07) — inject Bible character visual canon into the
      // prompt as TEXT anchors, alongside the EREF image. Helps Veo 3.1 keep
      // character look consistent when image-to-video drifts mid-clip.
      const bibleSnippet = inputs.bible as
        | { characters?: ReadonlyArray<{ slug: string; description: string }> }
        | undefined;
      const characterCanon = makeCharacterCanonSnippets(
        (bibleSnippet?.characters ?? []).map((c) => ({
          slug: c.slug,
          description: c.description,
        })),
      );

      // ── Plan-driven branch (Day 6-7 q1a additive) ────────────────────────
      // When planAssetId is set on EXEC-VGEN, load the APPROVED SPC-shot_plan
      // and use its prompt verbatim (Animator's decision-of-record). Otherwise
      // fall back to buildShotPromptV2 template (legacy path, replay-pilot).
      //
      // TD-33 (2026-05-22, q7a sprint Step 6): also extract end_image,
      // seed_strategy, and quality_tier from the Plan body. Previously the
      // Animator wrote these fields (agents/exec/animator.md lines 101-109)
      // but the runner silently stripped everything except `prompt`,
      // starving Seedance's existing end-frame img2vid support.
      let planPrompt: string | null = null;
      let planEndImageAssetId: string | null = null;
      let planSeed: number | null = null;
      let planQualityOverride: 'fast' | 'standard' | null = null;
      // TD-49 Phase 2 P2.4 (2026-05-25): Anchor chain pair — Animator's Plan
      // may specify start_anchor + end_anchor (each its own asset_id) that
      // override the legacy reference resolution. When the Animator writes
      // start_anchor, that asset overrides the EREF lookup as `image_url`
      // for Seedance. When end_anchor is set, it takes priority over the
      // legacy `end_image.eref_asset_id` field for the `end_image_url`.
      // Both fall back to legacy when null (back-compat preserved).
      let planStartAnchorAssetId: string | null = null;
      let planEndAnchorAssetId: string | null = null;
      // TD-44 (2026-05-24): Animator's provider.id is the single source of
      // truth for both provider AND quality tier in plan-driven mode.
      // resolveVanimProviderId() maps the Animator vocab («seedance-standard»)
      // to concretes {providerImpl, qualityTier}. Closes the silent drift
      // where Plan v03 declared «seedance-standard» but runtime fell back
      // to `provider_assignments.character_video` default.
      let planProviderImplOverride:
        | 'seedance-fal-img2vid'
        | 'veo-3-img2vid'
        | null = null;
      if (planAssetId && supabase) {
        try {
          const { data: planRow } = await supabase
            .from('assets')
            .select('content,status,file_type')
            .eq('id', planAssetId)
            .maybeSingle();
          if (
            planRow &&
            (planRow as { file_type?: string }).file_type === 'SPC-shot_plan' &&
            (planRow as { status?: string }).status === 'APPROVED'
          ) {
            const content = (planRow as { content?: string | null }).content ?? '';
            const matches = [...content.matchAll(/```json\s*([\s\S]+?)```/g)];
            const last = matches[matches.length - 1]?.[1];
            if (last) {
              try {
                const body = JSON.parse(last.trim()) as {
                  prompt?: unknown;
                  end_image?: unknown;
                  seed_strategy?: unknown;
                  quality_tier?: unknown;
                  provider?: unknown;
                };
                if (typeof body.prompt === 'string' && body.prompt.length > 0) {
                  planPrompt = body.prompt;
                }
                // TD-44 (2026-05-24): provider.id is the single source of
                // truth — derive both provider impl AND quality tier from it.
                // Falls back to body.quality_tier when provider absent.
                if (body.provider && typeof body.provider === 'object') {
                  const pid = (body.provider as { id?: unknown }).id;
                  if (typeof pid === 'string') {
                    try {
                      const { resolveVanimProviderId } = await import(
                        './runners/animator'
                      );
                      const resolved = resolveVanimProviderId(pid);
                      planProviderImplOverride = resolved.providerImpl;
                      planQualityOverride = resolved.qualityTier;
                    } catch {
                      // Unknown provider.id — leave overrides null; runner
                      // falls back to event-arg/DB-config + body.quality_tier.
                    }
                  }
                }
                // end_image: { asset_id: "<uuid>" } — null/missing = no end frame.
                if (body.end_image && typeof body.end_image === 'object') {
                  const ei = body.end_image as { asset_id?: unknown };
                  if (typeof ei.asset_id === 'string' && ei.asset_id.length > 0) {
                    planEndImageAssetId = ei.asset_id;
                  }
                }
                // TD-49 Phase 2 P2.4 (2026-05-25): anchor pair extraction.
                // Schema enforcement (role + reciprocal handoff_link_to) is
                // done by extractAnchorChain which throws AnimatorError on
                // structural violations. Caught by the outer try/catch so
                // an invalid Plan falls back to legacy single-reference path
                // rather than crashing the agent run.
                try {
                  const { extractAnchorChain } = await import(
                    './runners/animator'
                  );
                  const chain = extractAnchorChain(body);
                  if (chain.start_anchor) {
                    planStartAnchorAssetId = chain.start_anchor.asset_id;
                  }
                  if (chain.end_anchor) {
                    planEndAnchorAssetId = chain.end_anchor.asset_id;
                  }
                } catch {
                  // Plan declared anchor fields with bad shape — leave both
                  // null; legacy end_image / EREF lookup drives the call.
                }
                // seed_strategy: { seed: <int> } — Seedance reproducibility hook.
                if (
                  body.seed_strategy &&
                  typeof body.seed_strategy === 'object'
                ) {
                  const ss = body.seed_strategy as { seed?: unknown };
                  if (typeof ss.seed === 'number' && Number.isFinite(ss.seed)) {
                    planSeed = Math.floor(ss.seed);
                  }
                }
                // quality_tier: 'fast' | 'standard' — Plan beats event arg.
                if (
                  body.quality_tier === 'fast' ||
                  body.quality_tier === 'standard'
                ) {
                  planQualityOverride = body.quality_tier;
                }
              } catch {
                /* leave plan fields null */
              }
            }
          }
        } catch {
          /* leave planPrompt null — fall back to legacy template */
        }
      }
      const prompt =
        planPrompt ??
        (storyboardShot
          ? buildShotPromptV2(storyboardShot, episodeTitle, characterCanon)
          : buildShotPrompt(inputs, shotId));

      // TD-33 (q7a Step 6): apply Plan quality_tier override (Plan beats event).
      if (planQualityOverride) {
        effectiveQuality = planQualityOverride;
      }

      // TD-49 Phase 2 P2.4 (2026-05-25): override `referenceImageBase64`
      // (start frame for img2vid providers) with the start_anchor asset
      // when Animator specified one. Falls through to the EREF-resolved
      // value otherwise. Non-fatal on load failure — provider degrades
      // to whatever was resolved before.
      if (planStartAnchorAssetId && supabase && isRealVideo) {
        const loaded = await getAssetImageBase64ById(
          supabase,
          planStartAnchorAssetId,
        );
        if (loaded) {
          referenceImageBase64 = loaded.base64;
          referenceErefAssetId = planStartAnchorAssetId;
        }
      }

      // TD-33 (q7a Step 6) + TD-49 Phase 2 P2.4: load end-frame bytes for
      // Seedance `end_image_url`. Preference order:
      //   1. planEndAnchorAssetId (TD-49 anchor pair end side)
      //   2. planEndImageAssetId (legacy q7a end_image.eref_asset_id)
      // Failure to load is non-fatal — provider falls back to start-frame-
      // only img2vid.
      let endImageBase64: string | null = null;
      let endImageMime: 'image/png' | 'image/jpeg' = 'image/png';
      const endImageAssetIdToLoad =
        planEndAnchorAssetId ?? planEndImageAssetId;
      if (endImageAssetIdToLoad && supabase && isRealVideo) {
        const loaded = await getAssetImageBase64ById(
          supabase,
          endImageAssetIdToLoad,
        );
        if (loaded) {
          endImageBase64 = loaded.base64;
          endImageMime = loaded.mime;
        }
      }

      if (isRealVideo) {
        if (!supabase) throw new Error('EXEC-VGEN real path requires supabase in runArgs');

        // Veo 3.1 image-to-video constraint (Google docs, confirmed 2026-05-13):
        //   `veo-3.1-generate-preview` (Standard) with a reference/subject
        //   image returns ONLY 8-second clips. Sending 4/5/6 yields HTTP 400
        //   "durationSeconds out of bound" — Google's error message claims
        //   [4, 8] but for img2vid Standard the real allowed set is {8}.
        //   Fast (`veo-3.1-fast-generate-preview`) appears to accept 4-6-8;
        //   keep the storyboard value for Fast and force 8 for Standard
        //   when a reference image is attached.
        // This is a Veo-only quirk; Seedance 2.0 accepts any 4-15s on either
        // tier so we leave its duration untouched.
        // TD-44 (2026-05-24): plan-driven provider override. When Animator
        // wrote provider.id in Plan body, that wins over event-arg /
        // DB-config defaults. Both providerImpl and qualityTier already
        // resolved together via resolveVanimProviderId() above.
        const effectiveProviderId =
          planProviderImplOverride ?? provider!.providerId;
        const effectiveIsVeoProvider =
          effectiveProviderId === 'veo-3-img2vid' ||
          effectiveProviderId.startsWith('veo-');

        const hasReferenceImage = Boolean(referenceImageBase64);
        const generationDuration =
          effectiveIsVeoProvider && hasReferenceImage && effectiveQuality === 'standard'
            ? 8
            : finalDuration;
        // eslint-disable-next-line no-console
        console.info(
          `[exec-vgen] shot=${shotId} → provider=${effectiveProviderId} (planOverride=${planProviderImplOverride ?? 'none'}) durationSeconds=${generationDuration} (raw=${durationSeconds}, resolved=${resolvedDurationSeconds}, stb=${storyboardShot?.duration_seconds}, hasRef=${hasReferenceImage}, clamped=${generationDuration !== finalDuration}), aspect=${effectiveAspect}, quality=${effectiveQuality}`,
        );

        const videoProvider = getMultiVideoProvider(effectiveProviderId);
        const real = await videoProvider.generate({
          prompt,
          durationSeconds: generationDuration,
          aspectRatio: effectiveAspect,
          quality: effectiveQuality,
          ...(referenceImageBase64
            ? { referenceImageBase64, referenceImageMime: 'image/png' as const }
            : {}),
          // TD-33 (q7a Step 6): wire Animator Plan's end_image + seed.
          // Seedance honours both; Veo ignores end_image (capability flag).
          ...(endImageBase64 ? { endImageBase64, endImageMime } : {}),
          ...(planSeed !== null ? { seed: planSeed } : {}),
        });
        const safeShotId = shotId.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
        const persisted = await persistBinary({
          base64: real.mp4_b64,
          ext: 'mp4',
          driveFilename: `${episodeCode ?? 'SS-unknown'}-VID-shot_${safeShotId}-v01-DRAFT.mp4`,
          localHint: `shot-${safeShotId}`,
          episodeCode,
          supabase,
        });
        return {
          outputKind: 'video-mp4',
          result: {
            asset_paths: [persisted.browserUrl],
            cost_usd: real.cost_usd,
            metadata: metadataFromPersisted(persisted, {
              agent_id: agentId,
              shot_id: shotId,
              provider_id: real.provider,
              provider_used: real.provider,
              // Provider verification stamp (Phase A.1 directive 2026-05-07).
              // `model_id` is the actual upstream model that produced this mp4
              // (e.g. `veo-3.1-fast-generate-preview` or
              // `bytedance/seedance-2.0/fast/image-to-video`), surfaced in the
              // asset description so Director sees it without scanning logs.
              // `operation_name` is the provider-side job/operation id for
              // vendor cross-reference.
              model_id: real.operation_name ? real.model_id : undefined,
              operation_name: real.operation_name,
              format: real.format,
              width: real.width,
              height: real.height,
              duration_seconds: real.duration_seconds,
              size_bytes: real.size_bytes,
              aspect_ratio: effectiveAspect,
              quality_tier: effectiveQuality,
              prompt,
              reference_eref_asset_id: referenceErefAssetId,
              storyboard_asset_id: storyboardAssetId,
              vgen_pilot: vgenPilot === true,
              // TD-33 (q7a Step 6): audit which Plan fields actually reached
              // the provider. Helps Director debug "why does the clip still
              // not bridge to the next shot?" by checking whether end_image
              // bytes loaded successfully or the asset_id silently degraded.
              end_image_asset_id: planEndImageAssetId,
              end_image_bytes_loaded: Boolean(endImageBase64),
              seed: planSeed,
            }),
          },
        };
      }

      const video = await mockVideo({ episodeId, shotId, durationSeconds: finalDuration });
      return {
        outputKind: 'video-mp4',
        result: {
          asset_paths: [video.drive_path],
          cost_usd: video.cost_usd,
          metadata: {
            ...video,
            agent_id: agentId,
            shot_id: shotId,
            provider_id: 'mock',
            provider_used: 'mock',
            aspect_ratio: effectiveAspect,
            quality_tier: effectiveQuality,
            duration_seconds: finalDuration,
            prompt,
            reference_eref_asset_id: referenceErefAssetId,
            storyboard_asset_id: storyboardAssetId,
            vgen_pilot: vgenPilot === true,
          },
        },
      };
    }

    case 'EXEC-MGEN': {
      const trackId = section ?? 'main';
      const music = await mockMusic({ episodeId, trackId, durationSeconds: 30 });
      return {
        outputKind: 'audio-wav',
        result: {
          asset_paths: [music.drive_path],
          cost_usd: music.cost_usd,
          metadata: {
            ...music,
            agent_id: agentId,
            section: trackId,
          },
        },
      };
    }

    case 'EXEC-STITCH': {
      // Phase A.2 PR β (2026-05-08) — assemble per-shot APPROVED VID-shot
      // mp4s + APPROVED music into one final-cut mp4 via local ffmpeg.
      //
      // Requirements:
      //   - APPROVED VID-animatic with v1 contract (defines shot order +
      //     duration_seconds + audio_tracks).
      //   - At least one APPROVED VID-shot per shot_id (auto-COMPLETE branch
      //     in approve/route.ts ensures this is the case before firing the
      //     event).
      //   - System ffmpeg on PATH. Without it, runner returns a clean error
      //     (FfmpegStitchError kind=ffmpeg_not_installed).
      //
      // Output asset:
      //   file_type='VID-final_cut'
      //   metadata.shot_ids[] in storyboard order
      //   metadata.music_asset_id (when present)
      //   metadata.ffmpeg_command (audit trail)
      if (!supabase) throw new Error('EXEC-STITCH requires supabase in runArgs');

      // 1. Resolve animatic v1 contract.
      const upstream = (inputs.upstream_assets ?? []) as Array<{
        id: string;
        file_type: string;
        status?: string;
        metadata?: unknown;
        drive_path?: string | null;
        staging_path?: string | null;
        drive_web_view_url?: string | null;
      }>;
      const animaticAsset = upstream.find(
        (a) =>
          a.file_type === 'VID-animatic' &&
          a.status === 'APPROVED' &&
          isAnimaticV1(a.metadata),
      );
      if (!animaticAsset) {
        throw new Error('EXEC-STITCH: no APPROVED VID-animatic with animatic@v1 found in upstream');
      }
      const v1 = (animaticAsset.metadata as { animatic_v1: AnimaticContract }).animatic_v1;
      const shotList = v1.shot_list ?? [];
      if (shotList.length === 0) {
        throw new Error('EXEC-STITCH: animatic shot_list is empty');
      }

      // 2. Per shot_id, fetch the latest APPROVED VID-shot row from DB.
      const { data: vidShotRows, error: rowsErr } = await supabase
        .from('assets')
        .select('id,file_type,status,version,created_at,drive_path,staging_path,drive_web_view_url,metadata')
        .eq('episode_id', episodeId)
        .like('file_type', 'VID-shot%')
        .eq('status', 'APPROVED');
      if (rowsErr) throw new Error(`EXEC-STITCH: fetch VID-shot rows failed: ${rowsErr.message}`);

      // Group by shot_id, pick latest by version → created_at.
      // Track BOTH stagingPath (FS absolute, for direct read) and url
      // (browserUrl / Drive https) so the loader can pick the cheapest path.
      // Phase A.2 PR β fix 2026-05-08: routing through HTTP /staging/ gets
      // 307-redirected to /login by middleware, so we MUST prefer the FS
      // path when present. Reading from disk also avoids HTTP overhead.
      const byShotId = new Map<
        string,
        { id: string; version: number; created_at: string; stagingPath: string | null; url: string | null }
      >();
      for (const row of (vidShotRows ?? []) as Array<{ id: string; version?: number | null; created_at: string; drive_path: string | null; staging_path: string | null; drive_web_view_url: string | null; metadata?: unknown }>) {
        const meta = (row.metadata as { shot_id?: unknown; staging_path?: unknown } | null) ?? {};
        const sid = typeof meta.shot_id === 'string' ? meta.shot_id : null;
        if (!sid) continue;
        // staging_path may live on the column OR inside metadata (regenerate-
        // video writes both, factory only writes metadata).
        const stagingPath =
          row.staging_path ??
          (typeof meta.staging_path === 'string' ? meta.staging_path : null);
        const url = row.drive_path ?? row.drive_web_view_url ?? null;
        const candidate = {
          id: row.id,
          version: row.version ?? 0,
          created_at: row.created_at,
          stagingPath,
          url,
        };
        const existing = byShotId.get(sid);
        if (!existing) {
          byShotId.set(sid, candidate);
        } else if (
          candidate.version > existing.version ||
          (candidate.version === existing.version && candidate.created_at > existing.created_at)
        ) {
          byShotId.set(sid, candidate);
        }
      }

      // Walk shot_list in order → assemble inputs.
      // Per-shot duration follows the canonical timeline-cell-resolver rule:
      // director_overrides[shot_id].duration_seconds wins, fallback to
      // shot.duration_seconds from the animatic shot_list. The duration is
      // passed to ffmpeg-stitch which emits an `outpoint` directive so each
      // Veo clip is trimmed to the animatic-intended length (Veo Fast=4s /
      // Standard=8s vs. storyboard 2-5s caused E20 final-cut to play at 96s
      // instead of 54s before this patch — 2026-05-13).
      const overrides = v1.director_overrides ?? {};
      const orderedShots: Array<{
        shotId: string;
        assetId: string;
        stagingPath: string | null;
        url: string | null;
        durationSeconds: number;
      }> = [];
      const missing: string[] = [];
      for (const shot of shotList) {
        const found = byShotId.get(shot.shot_id);
        if (!found || (!found.stagingPath && !found.url)) {
          missing.push(shot.shot_id);
          continue;
        }
        const ov = overrides[shot.shot_id]?.duration_seconds;
        const effectiveDuration =
          typeof ov === 'number' && ov > 0 ? ov : shot.duration_seconds;
        orderedShots.push({
          shotId: shot.shot_id,
          assetId: found.id,
          stagingPath: found.stagingPath,
          url: found.url,
          durationSeconds: effectiveDuration,
        });
      }
      if (missing.length > 0) {
        throw new Error(`EXEC-STITCH: missing APPROVED VID-shot for shot_ids: ${missing.join(', ')}`);
      }

      // 3. Resolve music URL via getAudioTracks (handles legacy music_url too).
      const audioTracks = getAudioTracks(v1);
      const musicTrack = audioTracks.find((t) => t.layer === 'music') ?? null;

      // 4. Load all inputs into memory.
      // Prefer staging_path (direct FS read) over drive_path (HTTP fetch) —
      // the staging URL is /staging/<file>.mp4 served by Next.js but the
      // middleware auth-blocks it for non-Director sessions. Inngest worker
      // has no Director session, so HTTP would 307→/login. Reading from FS
      // bypasses middleware entirely.
      const fsPromises = await import('node:fs/promises');
      const pathMod = await import('node:path');
      async function loadBytes(stagingPath: string | null, url: string | null): Promise<Buffer> {
        if (stagingPath) {
          // eslint-disable-next-line no-console
          console.log('[stitch] reading FS:', stagingPath);
          return await fsPromises.readFile(stagingPath);
        }
        if (!url) throw new Error('loadBytes: neither stagingPath nor url provided');
        // Relative /staging/* URL → resolve to absolute path under
        // webapp/public/ and read directly. Avoids the middleware auth
        // redirect AND Node's "Failed to parse URL" for relative paths.
        if (url.startsWith('/staging/')) {
          const absPath = pathMod.join(process.cwd(), 'public', url);
          // eslint-disable-next-line no-console
          console.log('[stitch] reading FS (resolved from URL):', absPath);
          return await fsPromises.readFile(absPath);
        }
        // Fallback for Drive https URLs (drive_native storage).
        const res = await fetch(url);
        if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`);
        const ab = await res.arrayBuffer();
        return Buffer.from(ab);
      }

      const shotMp4Bytes: Array<{
        shotId: string;
        bytes: Buffer;
        durationSeconds: number;
      }> = [];
      for (const s of orderedShots) {
        const bytes = await loadBytes(s.stagingPath, s.url);
        shotMp4Bytes.push({
          shotId: s.shotId,
          bytes,
          durationSeconds: s.durationSeconds,
        });
      }

      let musicInput: { bytes: Buffer; ext: 'mp3' | 'wav' | 'm4a' | 'aac' } | undefined;
      let musicAssetId: string | null = null;
      if (musicTrack?.url) {
        // Locate the AUD-music asset row to get its staging_path for direct
        // FS read (same middleware-bypass rationale as the shot loader).
        const audMusic = upstream.find(
          (a) =>
            a.file_type === 'AUD-music' &&
            (a.drive_path === musicTrack.url || a.staging_path === musicTrack.url),
        ) as { id?: string; staging_path?: string | null } | undefined;
        const audMeta = (
          (audMusic as unknown as { metadata?: { staging_path?: unknown } } | undefined)
            ?.metadata ?? {}
        ) as { staging_path?: unknown };
        const audStagingPath =
          audMusic?.staging_path ??
          (typeof audMeta.staging_path === 'string' ? audMeta.staging_path : null);
        const bytes = await loadBytes(audStagingPath, musicTrack.url);
        const fname = musicTrack.filename ?? musicTrack.url;
        const lower = fname.toLowerCase();
        const ext: 'mp3' | 'wav' | 'm4a' | 'aac' =
          lower.endsWith('.wav')
            ? 'wav'
            : lower.endsWith('.m4a')
              ? 'm4a'
              : lower.endsWith('.aac')
                ? 'aac'
                : 'mp3';
        musicInput = { bytes, ext };
        if (audMusic?.id) musicAssetId = audMusic.id;
      }

      // 5. Run ffmpeg.
      const stitched = await ffmpegStitchEpisode({
        shotMp4Bytes,
        ...(musicInput ? { music: musicInput } : {}),
      });

      // 6. Persist.
      const persisted = await persistBinary({
        base64: stitched.mp4Base64,
        ext: 'mp4',
        driveFilename: `${episodeCode ?? 'SS-unknown'}-VID-final_cut-v01-DRAFT.mp4`,
        localHint: `final-cut-${episodeId}`,
        episodeCode,
        supabase,
      });

      // Cost stays $0 (local ffmpeg, no API call). Time-on-CPU is the cost
      // signal; we record it in metadata for future telemetry.
      return {
        outputKind: 'video-mp4',
        result: {
          asset_paths: [persisted.browserUrl],
          cost_usd: 0,
          metadata: metadataFromPersisted(persisted, {
            agent_id: agentId,
            shot_ids: orderedShots.map((s) => s.shotId),
            music_asset_id: musicAssetId,
            ffmpeg_command: stitched.ffmpegCommand,
            size_bytes: stitched.sizeBytes,
            assembled_at: new Date().toISOString(),
          }),
        },
      };
    }

    case 'EXEC-THUMB': {
      if (provider?.providerId === 'gpt-image-1') {
        if (!supabase) throw new Error('EXEC-THUMB real path requires supabase in runArgs');
        const real = await generateImageOpenAI({
          prompt: buildThumbnailPrompt(inputs),
          size: '1536x1024',
          quality: 'medium',
        });
        const persisted = await persistBinary({
          base64: real.b64_data,
          ext: 'png',
          driveFilename: `${episodeCode ?? 'SS-unknown'}-IMG-thumbnail-v01-DRAFT.png`,
          localHint: `thumb-${episodeId.slice(-8)}`,
          episodeCode,
          supabase,
        });
        return {
          outputKind: 'image-png',
          result: {
            asset_paths: [persisted.browserUrl],
            cost_usd: real.cost_usd,
            metadata: metadataFromPersisted(persisted, {
              agent_id: agentId,
              provider_id: 'gpt-image-1',
              provider_used: 'gpt-image-1',
              format: real.format,
              width: real.width,
              height: real.height,
              size_bytes: real.size_bytes,
              revised_prompt: real.revised_prompt ?? null,
            }),
          },
        };
      }
      const image = await mockImage({
        episodeId,
        assetId: `thumbnail-${episodeId.slice(-8)}`,
      });
      return {
        outputKind: 'image-png',
        result: {
          asset_paths: [image.drive_path],
          cost_usd: image.cost_usd,
          metadata: {
            ...image,
            agent_id: agentId,
            provider_id: 'mock',
            provider_used: 'mock',
          },
        },
      };
    }

    case 'EXEC-PUB': {
      const upload = await mockYouTubeUpload({
        episodeId,
        title: 'Mock Episode',
        description: 'Phase 4 mock publish.',
        tags: ['sandystudio', 'mock'],
        thumbnailDrivePath: '<mock-thumb>',
        videoDrivePath: '<mock-video>',
      });
      return {
        outputKind: 'publish-log',
        result: {
          asset_paths: [],
          cost_usd: upload.cost_usd,
          metadata: {
            ...upload,
            agent_id: agentId,
            youtube_video_id: upload.youtube_video_id,
            publish_timestamp: Date.now(),
          },
          next_event: {
            name: 'sandystudio/exec-pub/published',
            data: {
              episodeId,
              youtubeVideoId: upload.youtube_video_id,
              publishTimestamp: Date.now(),
            },
          },
        },
      };
    }

    case 'EXEC-ANAL': {
      if (!collectionPoint || !youtubeVideoId) {
        throw new Error(
          `EXEC-ANAL requires collectionPoint and youtubeVideoId in event payload`
        );
      }
      const analytics = await mockAnalytics({
        episodeId,
        youtubeVideoId,
        collectionPoint,
      });
      return {
        outputKind: 'analytics-json',
        result: {
          asset_paths: [],
          cost_usd: analytics.cost_usd,
          metadata: {
            ...analytics,
            agent_id: agentId,
          },
        },
      };
    }

    default:
      throw new Error(`runAgent: agent ${agentId} not supported in Phase 4`);
  }
}

// ── Output persistence ────────────────────────────────────────────────────────

const FILE_TYPE_BY_AGENT: Record<AgentId, string> = {
  'EXEC-SW': 'SCR-script',
  'EXEC-SREV': 'REV-script_qa',
  'EXEC-SB': 'STB-storyboard',
  'EXEC-WCHK': 'REV-world_check',
  'EXEC-EREF': 'IMG-episode_ref', // backbone v2: between Storyboard and Animatic
  'EXEC-EREF-DESIGNER': 'SPC-ref_plan', // Sprint «Дизайнер и Аниматор» — Plan asset feeds EXEC-EREF executor
  'EXEC-EPREV': 'REV-ref_plan', // Day 4 — Designer's Critic verdict (one REV row per Plan)
  'EXEC-VANIM': 'SPC-shot_plan', // Day 6-7 — Animator video Plan per shot
  'EXEC-VPREV': 'REV-shot_plan', // Day 8 — Animator's Critic verdict
  'EXEC-GAGAD': 'SPC-gag_plan', // Day 11+ — default for Phase plan; review phases use skip_save + manual insert
  'EXEC-EDIT': 'VID-animatic', // animatic produces a video asset; spec is metadata
  'EXEC-VGEN': 'VID-shot',
  'EXEC-MGEN': 'AUD-music',
  'EXEC-STITCH': 'VID-final_cut',
  'EXEC-COPY': 'SPC-metadata',
  'EXEC-THUMB': 'IMG-thumbnail',
  'EXEC-PUB': 'REV-publish_log',
  'EXEC-ANAL': 'REV-analytics',
  'EXEC-STY': 'BIB-style',
  'EXEC-BIBLE-AUTHOR': '', // updates existing SBL-* row inline; never creates a new one through saveAgentOutput
  'EXEC-STYLE-CHECK': '', // pre-flight check; never creates an asset
  'EXEC-EREF-CHECK': '', // post-generation review; called inline from EREF runner, never creates an asset
  'EXEC-ARCH': '',
  'EXEC-ORCH': '',
  'EXEC-CONC': '',
};

export interface SaveOutputArgs {
  supabase: SupabaseClient<Database>;
  agentId: AgentId;
  episodeId: string;
  episodeCode: string; // SS-S01-E01
  result: AgentResult;
  outputKind: RunResult['outputKind'];
  /** Optional discriminator for assets that come in multiple per agent (shots, music sections). */
  variant?: string;
}

/**
 * Persist agent output as one or more asset rows.
 *
 * For text-md outputs, we DON'T write the file to disk in Phase 4 — the
 * markdown lives in the asset row's description (or in a future blob column).
 * Drive paths point to the would-be filesystem location for Sprint 10 reuse.
 */
export async function saveAgentOutput(args: SaveOutputArgs): Promise<{ assetId: string }> {
  const { supabase, agentId, episodeId, episodeCode, result, outputKind, variant } = args;

  // Some agents (e.g. EXEC-EREF) insert N assets directly inside their runner
  // and ask saveAgentOutput to step aside. They pass `skip_save: true` and
  // `inserted_asset_ids: [...]` in metadata; we return the first one as the
  // primary asset id so the rest of the factory chain keeps working.
  if (result.metadata.skip_save === true) {
    const ids = result.metadata.inserted_asset_ids;
    if (Array.isArray(ids) && typeof ids[0] === 'string') {
      return { assetId: ids[0] };
    }
    throw new Error(
      'saveAgentOutput: skip_save was set but inserted_asset_ids missing or empty',
    );
  }

  const fileTypeBase = FILE_TYPE_BY_AGENT[agentId];
  if (!fileTypeBase) {
    throw new Error(`saveAgentOutput: agent ${agentId} has no file_type mapping`);
  }
  const fileType = variant ? `${fileTypeBase}-${variant}` : fileTypeBase;

  const ext =
    outputKind === 'image-png'
      ? 'png'
      : outputKind === 'video-mp4'
        ? 'mp4'
        : outputKind === 'audio-wav'
          ? 'wav'
          : 'md';

  // Auto-increment version: each agent re-run produces a new asset row, so
  // re-trigger / revision cycles never collide on the unique filename
  // constraint. Versioning policy per glossary §9: each pipeline pass is its
  // own version; old version stays in REVISION/REJECTED for the audit trail.
  const { data: existingRows } = await supabase
    .from('assets')
    .select('version, filename')
    .eq('episode_id', episodeId)
    .eq('file_type', fileType);
  const maxExistingVersion = (existingRows ?? []).reduce(
    (max, row) => Math.max(max, row.version ?? 0),
    0,
  );
  const nextVersion = maxExistingVersion + 1;
  const versionTag = `v${String(nextVersion).padStart(2, '0')}`;
  const filename = `${episodeCode}-${fileType}-${versionTag}-DRAFT.${ext}`;
  const drivePath = result.asset_paths[0] ?? null;

  // Markdown body lives in the dedicated `content` column (migration 0013).
  // `description` keeps its original role: a short summary line — currently
  // null for mock outputs since the providers don't emit a separate summary.
  // Phase 5d step 2 editor reads/writes via /api/assets/[id]/content → DB.
  const content =
    typeof result.metadata.markdown === 'string'
      ? (result.metadata.markdown as string)
      : null;

  // Real provider adapters that produce binaries (e.g. gpt-image-1) write the
  // file under webapp/public/staging/ and pass the absolute path through
  // metadata.staging_path. Mock outputs never set this — staging_path stays null.
  const stagingPath =
    typeof result.metadata.staging_path === 'string'
      ? (result.metadata.staging_path as string)
      : null;

  // Drive identity (when storage provider = drive_native and upload succeeded)
  // — read by AssetPreview as a fallback when local cache misses, by future
  // Drive-native operations (download, share, delete) as the canonical handle.
  const driveFileId =
    typeof result.metadata.drive_file_id === 'string'
      ? (result.metadata.drive_file_id as string)
      : null;
  const driveWebViewUrl =
    typeof result.metadata.drive_web_view_url === 'string'
      ? (result.metadata.drive_web_view_url as string)
      : null;

  // Real text agents (Step 1+) emit a one-line description through metadata
  // ("produced by EXEC-SW · screenwriter@v1 · sonnet · cost $X · N tokens").
  // Mock agents leave this null. Surfaced verbatim in AssetPreview header.
  const description =
    typeof result.metadata.description === 'string'
      ? (result.metadata.description as string)
      : null;

  // Persist agent-specific structured payloads to the JSONB `metadata` column
  // so downstream UI / runners can read them. We pick only opted-in keys:
  // `animatic_v1` is the only one for now, but this list is expected to grow
  // as new contracts (animatic_v2, vgen_shot_v1, etc.) emerge. Keys like
  // `markdown`, `staging_path`, `description` are already promoted to columns
  // and would just bloat metadata, so they are NOT included here.
  const PERSIST_METADATA_KEYS = ['animatic_v1'] as const;
  let metadataPayload: Record<string, unknown> | null = null;
  for (const key of PERSIST_METADATA_KEYS) {
    const v = result.metadata[key];
    if (v !== undefined && v !== null) {
      if (metadataPayload === null) metadataPayload = {};
      metadataPayload[key] = v;
    }
  }

  const { data, error } = await supabase
    .from('assets')
    .insert({
      episode_id: episodeId,
      agent_id: agentId,
      file_type: fileType,
      filename,
      drive_path: drivePath,
      staging_path: stagingPath,
      drive_file_id: driveFileId,
      drive_web_view_url: driveWebViewUrl,
      status: 'DRAFT',
      version: nextVersion,
      content,
      description,
      ...(metadataPayload ? { metadata: metadataPayload as unknown as Json } : {}),
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`saveAgentOutput: assets insert failed: ${error.message}`);
  }
  return { assetId: data.id };
}

// ── Job-row helpers (used by every Inngest function) ──────────────────────────

export interface InsertJobRowArgs {
  supabase: SupabaseClient<Database>;
  agentId: AgentId;
  episodeId: string | null;
  inngestEvent: string;
  inngestRunId: string;
  inputSnapshot: Record<string, unknown>;
}

export async function insertJobRow(args: InsertJobRowArgs): Promise<{ id: string }> {
  const { data, error } = await args.supabase
    .from('jobs')
    .insert({
      agent_id: args.agentId,
      episode_id: args.episodeId,
      inngest_event: args.inngestEvent,
      inngest_run_id: args.inngestRunId,
      status: 'RUNNING',
      input_snapshot: args.inputSnapshot as Json,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error) {
    throw new Error(`insertJobRow: ${error.message}`);
  }
  return { id: data.id };
}

export async function markJobCompleted(
  supabase: SupabaseClient<Database>,
  jobId: string,
  outputRef: string | null
): Promise<void> {
  const { error } = await supabase
    .from('jobs')
    .update({
      status: 'COMPLETED',
      completed_at: new Date().toISOString(),
      output_ref: outputRef,
    })
    .eq('id', jobId);
  if (error) {
    throw new Error(`markJobCompleted: ${error.message}`);
  }
}

export async function markJobFailed(
  supabase: SupabaseClient<Database>,
  jobId: string,
  errorMessage: string
): Promise<void> {
  const { error } = await supabase
    .from('jobs')
    .update({
      status: 'FAILED',
      completed_at: new Date().toISOString(),
      error_message: errorMessage,
    })
    .eq('id', jobId);
  if (error) {
    throw new Error(`markJobFailed: ${error.message}`);
  }
}
