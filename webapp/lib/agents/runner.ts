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
import { parseShotPlanContract } from '../api/shot-plan-contract';
import { assertBudgetAvailable, releaseBudgetReservation, BudgetExceededError } from '../budget';
import { applyCriticVerdict, type CriticVerdict } from './critic-loop';
import {
  SEEDANCE_COST_USD_PER_SECOND,
  SEEDANCE_RESOLUTION_COST_MULT,
} from './providers/fal-seedance';
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
  computeEffectivePlayback,
  clipLengthsFromVidShotRows,
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
import { runThumbnailDesigner, ThumbnailDesignerError } from './runners/thumbnail-designer';
import { runThumbnailRenderer, ThumbnailRendererError } from './runners/thumbnail-renderer';
import { runEpisodeReferences, EpisodeReferencesError } from './runners/episode-references';
import {
  runEpisodeReferenceDesigner,
  EpisodeReferenceDesignerError,
} from './runners/episode-reference-designer';
import {
  runEpisodeReferenceCritic,
  EpisodeReferenceCriticError,
} from './runners/episode-reference-critic';
import {
  runCreativeReadabilityCritic,
  CreativeReadabilityCriticError,
  CREAD_CONTRACT,
} from './runners/creative-readability-critic';
import { runAnimator, AnimatorError } from './runners/animator';
import { runAnimatorCritic, AnimatorCriticError } from './runners/animator-critic';
import {
  runAnimaticSlideshow,
  runAnchorAnimaticSlideshow,
  AnimaticSlideshowError,
} from './runners/animatic-slideshow';
import { loadSeriesBibleCanon } from './bible-loader';
import {
  deliveryAspectFor,
  clampRenderDuration,
  VIDEO_PROVIDER_CAPS,
  type VideoAspectRatio,
  type VideoProviderId,
} from '../api/provider-capabilities';
import { getVgenDefaults } from '../api/vgen-defaults';
import {
  resolveVideoParams,
  type EpisodeVideoConfig,
} from '../api/resolve-generation-params';
import type { AgentId, AgentInputs, AgentResult } from './types';

// ── Episode-authoritative generation config (2026-06-09) ───────────────────────
// Read the FORMAT config the resolver consumes from `episodes.metadata.
// generation_config.video` + the delivery_targets[] used for the delivery-
// derived aspect fallback. Both tolerate any metadata shape (returns
// null/empty) so an un-configured episode resolves to legacy behaviour.
function readEpisodeVideoConfig(episode: unknown): EpisodeVideoConfig | null {
  if (!episode || typeof episode !== 'object') return null;
  const meta = (episode as { metadata?: unknown }).metadata;
  if (!meta || typeof meta !== 'object') return null;
  const gen = (meta as { generation_config?: unknown }).generation_config;
  if (!gen || typeof gen !== 'object') return null;
  const video = (gen as { video?: unknown }).video;
  if (!video || typeof video !== 'object') return null;
  return video as EpisodeVideoConfig;
}

function readEpisodeDeliveryTargets(episode: unknown): string[] {
  if (!episode || typeof episode !== 'object') return [];
  const meta = (episode as { metadata?: unknown }).metadata;
  if (!meta || typeof meta !== 'object') return [];
  const raw = (meta as { delivery_targets?: unknown }).delivery_targets;
  if (!Array.isArray(raw)) return [];
  return raw.filter((t): t is string => typeof t === 'string' && t.length > 0);
}

/** Coerce a raw resolved-provider id (which may be a legacy alias like
 *  `veo-3` / `seedance-fal`, or `mock`) into a canonical VideoProviderId for
 *  the resolver's `assignmentProviderId` layer. Returns null for unknown / mock
 *  so the resolver falls through to series/fallback. */
function coerceVideoProviderId(raw: string | null | undefined): VideoProviderId | null {
  if (raw === 'veo-3' || raw === 'veo-3-img2vid') return 'veo-3-img2vid';
  if (raw === 'seedance-fal' || raw === 'seedance-fal-img2vid') return 'seedance-fal-img2vid';
  return null;
}

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
    // TD-55 (2026-05-26): metadata included so downstream runners can read
    // per-episode flags. Specifically `anchor_chain_enabled` (TD-49 P2.3) —
    // without metadata in this SELECT, Designer + Animator never see the
    // flag and silently fall back to legacy single-IMG path even when
    // Director toggled it on via the new Episode Settings card.
    .select('id, episode_code, governance_mode, status, title_working, series_id, budget_ceiling, budget_spent, metadata')
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
    .in('status', statuses as never)
    // F2 (2026-06-12): newest-wins for raw `.find()` consumers too. Without
    // an ORDER BY the rows arrive in heap order, so any consumer that takes
    // the first match of a file_type silently binds to an arbitrary version
    // when two APPROVED rows coexist (E07: Designer on STB v1, Artist on v2).
    // findApprovedAsset (lib/agents/upstream.ts) re-sorts defensively; this
    // makes the unsorted `.find()` sites inherit the same rule.
    .order('version', { ascending: false })
    .order('created_at', { ascending: false });
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

  // Sprint C1-Gate (2026-06-10): replaced direct .eq('id', episode.series_id)
  // lookup (which silently returned null when series_id stores a CODE like
  // "SS-S15" not UUID) with genreForEpisode which reuses the
  // seriesIdForEpisode code→UUID resolver. Non-fatal: degrades to null on any
  // error (mock supabase, missing table).
  let seriesGenre: string | null = null;
  try {
    seriesGenre = await genreForEpisode(supabase, episodeId);
  } catch {
    // mock supabase / transient error — degrade to null
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
import { seriesIdForEpisode, genreForEpisode } from '../api/series-bible';

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
    // TD-59 (2026-05-26): episodes.series_id stores series CODE ("SS-S15") while
    // assets.series_id stores UUID — they cannot be compared directly. Live
    // failure 2026-05-26 SH09 EREF: this function returned scene_master_asset=null
    // even though SBL-location_sandy_bedroom_continuity LOCKED existed. The
    // existing seriesIdForEpisode helper handles both legacy code and UUID
    // formats — use it instead of a naïve read.
    const seriesId = await seriesIdForEpisode(supabase, episodeId);
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
   * TD-74 (2026-05-27) — Director-authorized check waivers from upstream
   * event payload. Animator's Critic treats matching checks as
   * PASS_WITH_UNCERTAINTY instead of REVISE. Animator writes traceability
   * to Plan policy_notes. Only PA tools / Director-trigger routes mutate;
   * Animator's self-asserted policy_notes claims are NOT authoritative.
   */
  directorOverrides?: ReadonlyArray<{ check: string; rationale: string }>;
  /**
   * Sprint «Дизайнер и Аниматор» Day 3.2 (2026-05-18) — APPROVED SPC-ref_plan
   * asset id. When set, EXEC-EREF runner switches into Plan-driven branch:
   * reads the Plan's JSON body for provider/size/variants/prompt/negative
   * and generates exactly one IMG-episode_ref for the planned shot. When
   * unset, runner falls back to the legacy multi-shot fan-out path.
   */
  planAssetId?: string;
  /**
   * C1-Gate sprint 2026-06-10 — STB-storyboard asset id under readability
   * review. When set, EXEC-CREAD loads exactly that storyboard; when unset it
   * falls back to the newest APPROVED STB in upstream_assets. Resolver in
   * inngest/functions/exec-cread.ts forwards it from the event payload.
   */
  storyboardAssetId?: string;
  /**
   * T1 consolidation 2026-06-10 — EXEC-CREAD per-shot phase selector. When
   * 'eref'/'vanim', the critic reviews the per-shot plan referenced by
   * planAssetId+shotId instead of the storyboard (absorbed the retired
   * EXEC-GAGAD eref_review/vanim_review). Unset = storyboard readability.
   */
  creadPhase?: 'eref' | 'vanim';
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
    storyboardAssetId,
    creadPhase,
    directorOverrides,
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

    case 'EXEC-CREAD': {
      // C1-Gate sprint 2026-06-10 — Creative Readability Critic (universal,
      // process-invariant). Reads the APPROVED/REVIEW storyboard, loads the
      // genre playbook from the skill shelf, runs the R01-R06 readability
      // checks. Pure Sonnet call; cheap (~$0.01-0.03). No image generation.
      //
      // HALT-without-paid-call rule lives INSIDE the runner: if zero genre
      // playbooks match (including genre=null), it returns verdict HALT before
      // any Anthropic call. The case below treats that like any other verdict.
      if (!supabase) {
        throw new Error(`EXEC-CREAD requires supabase client`);
      }
      const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY?.trim());

      // ── Per-shot phases (eref/vanim) — absorbed from the retired EXEC-GAGAD
      //    cross-layer reviews (T1, 2026-06-10). Judge whether a Designer
      //    SPC-ref_plan / Animator SPC-shot_plan still delivers the readable
      //    intent the storyboard promised, against the genre playbook. REVISE
      //    bounces the producer; cap→HALT via the shared applyCriticVerdict.
      if (creadPhase === 'eref' || creadPhase === 'vanim') {
        if (!planAssetId) {
          throw new Error(`EXEC-CREAD ${creadPhase} requires planAssetId`);
        }
        if (!shotId) {
          throw new Error(`EXEC-CREAD ${creadPhase} requires shotId`);
        }
        let r: Awaited<ReturnType<typeof runCreativeReadabilityCritic>>;
        if (hasAnthropicKey) {
          try {
            r = await runCreativeReadabilityCritic({
              inputs,
              supabase,
              phase: creadPhase,
              planAssetId,
              shotId,
            });
          } catch (err: unknown) {
            if (err instanceof CreativeReadabilityCriticError) {
              throw new Error(`EXEC-CREAD ${creadPhase}: ${err.message}`);
            }
            throw err;
          }
        } else {
          // Mock fallback: PASS verdict so the chain progresses in replay-pilot.
          r = {
            phase: creadPhase,
            markdown: `Mock CREAD ${creadPhase} — PASS`,
            body: { verdict: 'PASS' },
            costUsd: 0,
            model: 'mock',
            contract: CREAD_CONTRACT,
            verdict: 'PASS',
            reviewedAssetId: planAssetId,
            shotId,
            acceptanceCriteria: [],
            failedChecks: [],
            passedChecks: [],
            activePlaybooks: [],
            description: `Stub EXEC-CREAD ${creadPhase} mock`,
            notes: [],
          };
        }

        // Cap-aware verdict application — shared with the plan critics. Flips
        // the PLAN status (REVISE → REVISION re-fires the producer; PASS/HALT
        // leave it in REVIEW), enforces the cap, escalates on HALT. version is
        // the counter — each REVISE re-authors a new plan version. (No bespoke
        // counter — that retired with GAGAD.)
        const cv = await applyCriticVerdict({
          supabase,
          rawVerdict: r.verdict as CriticVerdict,
          planAssetId,
          episodeId,
          shotId,
          actor: 'EXEC-CREAD',
          reviewKind:
            creadPhase === 'eref' ? 'ref_plan_readability' : 'shot_plan_readability',
        });

        // Save the REV-readability verdict row directly (skip_save bypass) —
        // per-shot versioning keyed on the shot label, mirroring the EREF/VPREV
        // verdict-row pattern.
        const epRowC = inputs.episode as { episode_code?: string } | undefined;
        const epCodeC = epRowC?.episode_code ?? 'SS-UNKNOWN';
        const safeShotC = shotId.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
        const { data: existingRevC } = await supabase
          .from('assets')
          .select('version')
          .eq('episode_id', episodeId)
          .eq('file_type', 'REV-readability')
          .like('filename', `%${safeShotC}%`);
        const maxVC = (existingRevC ?? []).reduce(
          (m, x) => Math.max(m, x.version ?? 0),
          0,
        );
        const nextVC = maxVC + 1;
        const vStrC = `v${String(nextVC).padStart(2, '0')}`;
        const filenameC = `${epCodeC}-REV-readability-${creadPhase}-${safeShotC}-${vStrC}-DRAFT.md`;

        const { data: insertedC, error: insErrC } = await supabase
          .from('assets')
          .insert({
            episode_id: episodeId,
            series_id: null,
            agent_id: 'EXEC-CREAD',
            file_type: 'REV-readability',
            filename: filenameC,
            description: r.description,
            status: 'REVIEW',
            version: nextVC,
            content: r.markdown,
            metadata: {
              ...(r.body as Record<string, unknown>),
              phase: creadPhase,
              plan_asset_id: planAssetId,
              shot_id: shotId,
              verdict: cv.effectiveVerdict,
              acceptance_criteria: r.acceptanceCriteria,
              failed_checks: r.failedChecks,
              passed_checks: r.passedChecks,
              plan_status_after_critic: cv.planStatusAfter ?? 'REVIEW',
              active_playbooks: r.activePlaybooks,
              agent_id: 'EXEC-CREAD',
              model: r.model,
              contract: r.contract,
              provider_id: r.model,
              provider_used: hasAnthropicKey ? 'anthropic' : 'mock',
            } as unknown as Record<string, unknown>,
          } as never)
          .select('id')
          .single();
        if (insErrC) {
          throw new Error(`EXEC-CREAD ${creadPhase} insert failed: ${insErrC.message}`);
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
              cread_phase: creadPhase,
              plan_asset_id: planAssetId,
              shot_id: shotId,
              verdict: cv.effectiveVerdict,
              acceptance_criteria: r.acceptanceCriteria,
              failed_checks: r.failedChecks,
              passed_checks: r.passedChecks,
              plan_status_after_critic: cv.planStatusAfter ?? 'REVIEW',
              active_playbooks: r.activePlaybooks,
              critic_notes: r.notes,
              skip_save: true,
              inserted_asset_ids: [insertedC.id],
              provider_id: r.model,
              provider_used: hasAnthropicKey ? 'anthropic' : 'mock',
              review_kind:
                creadPhase === 'eref'
                  ? 'ref_plan_readability_critic'
                  : 'shot_plan_readability_critic',
            },
          },
        };
      }

      // ── Storyboard phase (existing behaviour).
      if (hasAnthropicKey) {
        try {
          const r = await runCreativeReadabilityCritic({
            inputs,
            supabase,
            storyboardAssetId,
          });
          // Cap-aware verdict application — shared with the plan critics.
          // Flips the storyboard's status (REVISE → REVISION re-fires the
          // Storyboarder; PASS/HALT leave it in REVIEW for the Director), and
          // escalates to the Director Inbox on HALT. A HALT verdict produced
          // by the no-playbook rule is NOT counted as a revision (the runner
          // emits HALT directly, applyCriticVerdict leaves it as HALT).
          const cv = await applyCriticVerdict({
            supabase,
            rawVerdict: r.verdict as CriticVerdict,
            planAssetId: r.reviewedAssetId,
            episodeId,
            shotId: r.reviewedAssetId, // storyboard-level: shot label = asset id
            actor: 'EXEC-CREAD',
            reviewKind: 'storyboard_readability',
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
                verdict: cv.effectiveVerdict,
                acceptance_criteria: r.acceptanceCriteria,
                failed_checks: r.failedChecks,
                passed_checks: r.passedChecks,
                critic_notes: r.notes,
                storyboard_asset_id: r.reviewedAssetId,
                plan_status_after_critic: cv.planStatusAfter ?? 'REVIEW',
                active_playbooks: r.activePlaybooks,
                provider_id: r.model,
                provider_used: 'anthropic',
                review_kind: 'storyboard_readability_critic',
              },
            },
          };
        } catch (err: unknown) {
          if (err instanceof CreativeReadabilityCriticError) {
            throw new Error(`EXEC-CREAD: ${err.message}`);
          }
          throw err;
        }
      }
      // Mock fallback — replay-pilot / no API key. Default to PASS so the
      // chain progresses for self-tests (READABILITY_GATE_ENABLED is unset in
      // replay-pilot, so this case is not even reached there; the fallback
      // exists purely so a key-less unit/integration run never crashes).
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
            description: 'Stub EXEC-CREAD mock — set ANTHROPIC_API_KEY for real path',
            verdict: 'PASS' as const,
            review_kind: 'storyboard_readability_critic',
            provider_id: 'mock',
            provider_used: 'mock',
          },
        },
      };
    }

    case 'EXEC-WCHK': {
      // Pivoted: was "World Checker", now Continuity Supervisor — validates
      // storyboard against LOCKED Series Bible canon; with
      // CONTINUITY_LEDGER_ENABLED also runs the deterministic state ledger
      // (CHK-W05/W08 + W02/W07 advisory). Contract:
      // specs/contracts/continuity_check@v2.yaml.
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
            // TD-74 (2026-05-27): Director-authorized check waivers from
            // event payload. Animator surfaces traceability in policy_notes;
            // the same value is propagated by Animator's nextEvent to VPREV.
            directorOverrides,
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
            // TD-74 (2026-05-27): Director-authorized check waivers from
            // event payload. Critic demotes matching REVISE to
            // PASS_WITH_UNCERTAINTY with diagnosis preserved in warnings[].
            directorOverrides,
          });
          // TD-75 (2026-05-27): explicit verdict → status mapping. The prior
          // PASS-or-else-REVISE tertiary swept PASS_WITH_UNCERTAINTY (the
          // TD-74 / TD-49 P2.5 verdict) into REVISION, which blocked Director
          // from approving a Plan the Critic explicitly let through under
          // a Director waiver. Director-authorised PASS_WITH_UNCERTAINTY
          // must surface in approvals like a regular PASS.
          // I9 (2026-06-04): cap-aware verdict application. Flips the Plan
          // status, enforces the revision cap (a REVISE past the cap becomes
          // HALT), and escalates to the Director on HALT. effectiveVerdict (not
          // raw r.verdict) drives metadata.verdict so the critic's nextEvent
          // stops re-firing the Animator once the cap is reached. Replaces the
          // bespoke uncapped flip — VPREV/EPREV now share one mechanic.
          const cv = await applyCriticVerdict({
            supabase,
            rawVerdict: r.verdict as CriticVerdict,
            planAssetId,
            episodeId,
            shotId,
            actor: 'EXEC-VPREV',
            reviewKind: 'shot_plan',
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
                plan_asset_id: r.planAssetId,
                verdict: cv.effectiveVerdict,
                acceptance_criteria: r.acceptanceCriteria,
                failed_checks: r.failedChecks,
                passed_checks: r.passedChecks,
                critic_notes: r.notes,
                plan_status_after_critic: cv.planStatusAfter ?? 'REVIEW',
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
          // TD-75 (2026-05-27): explicit verdict → status mapping. The prior
          // PASS-or-else-REVISE tertiary swept PASS_WITH_UNCERTAINTY (the
          // TD-74 / TD-49 P2.5 verdict) into REVISION, which blocked Director
          // from approving a Plan the Critic explicitly let through under
          // a Director waiver. Director-authorised PASS_WITH_UNCERTAINTY
          // must surface in approvals like a regular PASS.
          // I9 (2026-06-04): cap-aware verdict application — shared with VPREV.
          // Flips the Plan status, enforces the revision cap (REVISE past the cap
          // → HALT), and escalates to the Director on HALT. effectiveVerdict
          // drives metadata.verdict so the critic's nextEvent stops re-firing the
          // Designer once the cap is reached.
          const cv = await applyCriticVerdict({
            supabase,
            rawVerdict: r.verdict as CriticVerdict,
            planAssetId,
            episodeId,
            shotId,
            actor: 'EXEC-EPREV',
            reviewKind: 'ref_plan',
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
                plan_asset_id: r.planAssetId,
                verdict: cv.effectiveVerdict,
                acceptance_criteria: r.acceptanceCriteria,
                failed_checks: r.failedChecks,
                passed_checks: r.passedChecks,
                critic_notes: r.notes,
                plan_status_after_critic: cv.planStatusAfter ?? 'REVIEW',
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

      // TD-49 Phase 2 (anchor_chain_enabled): when this episode opted into the
      // anchor chain, the animatic frames come from APPROVED IMG-anchor_*
      // START frames, NOT IMG-episode_ref. Detect via the episode metadata
      // already loaded by loadAgentInputs. When on + supabase present, route
      // to the anchor runner; otherwise the legacy EREF branch below is
      // unchanged.
      const episodeMetadata = (inputs.episode as { metadata?: unknown } | undefined)
        ?.metadata;
      const anchorMode =
        Boolean(
          episodeMetadata &&
            typeof episodeMetadata === 'object' &&
            (episodeMetadata as { anchor_chain_enabled?: unknown })
              .anchor_chain_enabled === true,
        );
      if (anchorMode && supabase) {
        try {
          const slide = await runAnchorAnimaticSlideshow({ inputs, supabase, episodeCode });
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
                ...(slide.animaticV1 ? { animatic_v1: slide.animaticV1 } : {}),
              },
            },
          };
        } catch (err: unknown) {
          if (err instanceof AnimaticSlideshowError) {
            throw new Error(`EXEC-EDIT (anchor slideshow): ${err.message}`);
          }
          throw err;
        }
      }

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

      // ── Format params (2026-06-09: episode-authoritative resolver) ────────
      // Initial fallbacks; OVERWRITTEN below by resolveVideoParams once the
      // Animator Plan has been loaded (its provider/quality/resolution are the
      // per-shot override channel). The resolver gives episode config authority
      // over these for declared fields; an un-configured episode reproduces the
      // legacy event-arg → fallback chain so nothing regresses.
      let effectiveAspect: VideoAspectRatio = aspectRatio ?? '16:9';
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

      // Raw candidate RENDER duration, rounded (Veo rejects fractional durations
      // with HTTP 400). The provider-derived floor/ceiling is applied LATER, once
      // the resolved provider is known, via clampRenderDuration → `renderDuration`.
      // The old hardcoded [4,8] here assumed Veo's range for EVERY provider and
      // silently capped Seedance (real max 15) at 8 (Director directive 2026-06-16:
      // never hardcode duration — derive from the provider contract).
      const finalDuration = (() => {
        if (typeof durationSeconds === 'number' && durationSeconds > 0) {
          return Math.round(durationSeconds);
        }
        if (resolvedDurationSeconds !== null) {
          return Math.round(resolvedDurationSeconds);
        }
        if (storyboardShot?.duration_seconds && storyboardShot.duration_seconds > 0) {
          return Math.round(storyboardShot.duration_seconds);
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
      // TD-85 (2026-06-01): resolution declared in the Plan body. Extracted
      // leniently below (raw value only); the authoritative validation
      // against the resolved provider's contract runs at the generate() site
      // (outside this Plan-load block) so an unsupported declared value fails
      // fast instead of silently degrading to the provider's 720p default.
      // Null = not declared → back-compat: provider applies its own default;
      // the Critic V13 gate requires presence at authoring time so new plans
      // always declare.
      let planResolution: '480p' | '720p' | '1080p' | null = null;
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
      // resolveVanimProviderId() maps the Animator vocab («seedance-with-end-image»)
      // to concretes {providerImpl, qualityTier}. Closes the silent drift
      // where Plan v03 declared a specific provider but runtime fell back
      // to `provider_assignments.character_video` default.
      // TD-67 (2026-05-27): legacy alias `seedance-standard` retired —
      // see VANIM_PROVIDER_ALLOWLIST comment in animator.ts.
      let planProviderImplOverride:
        | 'seedance-fal-img2vid'
        | 'veo-3-img2vid'
        | null = null;
      if (planAssetId && supabase) {
        // TD-78 (2026-05-27): hard-fail semantics + file_type widening.
        //
        // The previous shape silently fell through to legacy storyboard
        // prompt whenever the Plan couldn't be loaded — strict file_type
        // equality, status mismatch, parse failure, missing prompt, all
        // hit the same `catch { /* leave planPrompt null */ }`. Result for
        // SH19 v02: caller passed Plan v08 explicitly, runner silently
        // produced a 4-second «aligns perfectly» fast-tier video from the
        // ancient storyboard, ~$0.50 burnt + Director confused.
        //
        // New contract: if `planAssetId` is in the event payload, runner
        // either loads the Plan cleanly or throws. No silent storyboard
        // fallback. Each failure mode reports a distinct reason so PA /
        // Director knows whether to fix the Plan, re-approve it, or pass
        // a different planAssetId.
        //
        // file_type widening: Animator writes `SPC-shot_plan-<shot_id>`
        // (TD-66 widening). Accept both bare and suffixed forms here, same
        // pattern as TD-75 fix for PA tools.

        const { data: planRow, error: loadErr } = await supabase
          .from('assets')
          .select('content,status,file_type')
          .eq('id', planAssetId)
          .maybeSingle();

        if (loadErr) {
          throw new Error(
            `EXEC-VGEN: planAssetId=${planAssetId} fetch failed (${loadErr.message}). Refusing silent storyboard fallback.`,
          );
        }
        if (!planRow) {
          throw new Error(
            `EXEC-VGEN: planAssetId=${planAssetId} not found. Refusing silent storyboard fallback.`,
          );
        }
        const planFileType = (planRow as { file_type?: string }).file_type ?? '';
        const planStatus = (planRow as { status?: string }).status ?? '';
        const isShotPlanType =
          planFileType === 'SPC-shot_plan' || planFileType.startsWith('SPC-shot_plan-');
        if (!isShotPlanType) {
          throw new Error(
            `EXEC-VGEN: planAssetId=${planAssetId} has file_type="${planFileType}", expected SPC-shot_plan / SPC-shot_plan-*. Refusing silent storyboard fallback.`,
          );
        }
        if (planStatus !== 'APPROVED') {
          throw new Error(
            `EXEC-VGEN: planAssetId=${planAssetId} has status=${planStatus}, expected APPROVED. Refusing silent storyboard fallback.`,
          );
        }

        const content = (planRow as { content?: string | null }).content ?? '';
        // TD-84 (2026-06-16): parse via the shared shot-plan-contract module so
        // the runner and the Director's contract page (ShotPlanContract.tsx)
        // read the json block the SAME way — no drift. Hard-fail semantics
        // (TD-78) preserved: a missing/unparseable block or empty prompt throws
        // rather than silently falling back to the storyboard prompt.
        const parsedPlan = parseShotPlanContract(content);
        if (parsedPlan.error || !parsedPlan.raw) {
          throw new Error(
            `EXEC-VGEN: planAssetId=${planAssetId} ${parsedPlan.error ?? 'plan parse failed'} Refusing silent storyboard fallback.`,
          );
        }
        if (!parsedPlan.prompt) {
          throw new Error(
            `EXEC-VGEN: planAssetId=${planAssetId} JSON has no non-empty \`prompt\` field. Refusing silent storyboard fallback.`,
          );
        }
        const body = parsedPlan.raw as {
          prompt?: unknown;
          end_image?: unknown;
          seed_strategy?: unknown;
          quality_tier?: unknown;
          provider?: unknown;
          resolution?: unknown;
        };
        planPrompt = parsedPlan.prompt;

        // TD-44 (2026-05-24): provider.id drives provider impl + quality tier.
        if (body.provider && typeof body.provider === 'object') {
          const pid = (body.provider as { id?: unknown }).id;
          if (typeof pid === 'string') {
            try {
              const { resolveVanimProviderId } = await import('./runners/animator');
              const resolved = resolveVanimProviderId(pid);
              planProviderImplOverride = resolved.providerImpl;
              planQualityOverride = resolved.qualityTier;
            } catch {
              // Unknown provider.id is a soft fail — leave overrides null
              // so runner falls back to event-arg/DB-config + body.quality_tier.
              // (Throwing would be too strict — Animator allowlist may grow
              // and the runner shouldn't break on a new entry.)
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
        try {
          const { extractAnchorChain } = await import('./runners/animator');
          const chain = extractAnchorChain(body);
          if (chain.start_anchor) {
            planStartAnchorAssetId = chain.start_anchor.asset_id;
          }
          if (chain.end_anchor) {
            planEndAnchorAssetId = chain.end_anchor.asset_id;
          }
        } catch {
          // Plan declared anchor fields with bad shape — leave both null,
          // legacy end_image / EREF lookup drives the call. Anchor mode
          // is opt-in, malformed anchors should not block the Plan-driven
          // path entirely.
        }
        // seed_strategy: { seed: <int> } — Seedance reproducibility hook.
        if (body.seed_strategy && typeof body.seed_strategy === 'object') {
          const ss = body.seed_strategy as { seed?: unknown };
          if (typeof ss.seed === 'number' && Number.isFinite(ss.seed)) {
            planSeed = Math.floor(ss.seed);
          }
        }
        // quality_tier: 'fast' | 'standard' — Plan beats event arg.
        if (body.quality_tier === 'fast' || body.quality_tier === 'standard') {
          planQualityOverride = body.quality_tier;
        }
        // TD-85 (2026-06-01): resolution — lenient raw extraction only.
        // Accept only the known contract values; anything else stays null.
        // The authoritative member-of-supported-set validation runs at the
        // generate() site so a bad value fails the run loudly rather than
        // silently degrading to the provider's 720p default.
        if (
          body.resolution === '480p' ||
          body.resolution === '720p' ||
          body.resolution === '1080p'
        ) {
          planResolution = body.resolution;
        }
      }
      const prompt =
        planPrompt ??
        (storyboardShot
          ? buildShotPromptV2(storyboardShot, episodeTitle, characterCanon)
          : buildShotPrompt(inputs, shotId));

      // ── Episode-authoritative format resolution (2026-06-09) ─────────────
      // Single precedence authority (resolve-generation-params.ts). The
      // Animator Plan's provider/quality/resolution + the event aspect arg
      // form the per-shot override channel; episode config wins for declared
      // fields unless allow_shot_overrides. This replaces the old scattered
      // `?? '16:9'/'fast'` hardcodes, the provider_assignments-as-primary, and
      // the per-field plan overrides — so a Director directive on the episode
      // can no longer be silently dropped on the fan-out path.
      const assignmentProviderId = coerceVideoProviderId(provider?.providerId);
      const seriesDefaultsForResolve =
        supabase && (inputs.episode as { series_id?: string | null })?.series_id
          ? await getVgenDefaults(
              supabase,
              (inputs.episode as { series_id?: string | null }).series_id,
            )
          : null;
      const resolvedFormat = resolveVideoParams({
        episodeConfig: readEpisodeVideoConfig(inputs.episode),
        shotOverride: {
          provider_id: planProviderImplOverride,
          aspect_ratio: aspectRatio ?? null,
          // Plan beats event arg (Animator's decision of record), preserving
          // the prior TD-33 precedence within the shot-override channel.
          quality_tier: planQualityOverride ?? qualityTier ?? null,
          resolution: planResolution,
        },
        assignmentProviderId,
        seriesDefaults: seriesDefaultsForResolve,
        deliveryAspect: deliveryAspectFor(readEpisodeDeliveryTargets(inputs.episode)),
      });
      effectiveAspect = resolvedFormat.aspectRatio;
      effectiveQuality = resolvedFormat.qualityTier;

      // Provider-derived RENDER-duration clamp (Director directive 2026-06-16):
      // bound the raw candidate to the RESOLVED provider's [min,max] from the
      // manifest — Seedance 4-15, Veo 4-8 — never a hardcoded range. The shot's
      // creative CUT length (which may be below the floor) lives in the animatic
      // and is applied downstream at stitch via computeEffectivePlayback. Covers
      // both the real-generation and mock paths (resolvedFormat is in scope here).
      const renderDuration = clampRenderDuration(
        VIDEO_PROVIDER_CAPS[resolvedFormat.providerId],
        finalDuration,
      );

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
        // 2026-06-09: provider now comes from the episode-authoritative
        // resolver (episode config → plan override → assignment → series →
        // fallback), not the raw planOverride ?? assignment pair.
        const effectiveProviderId = resolvedFormat.providerId;
        const effectiveIsVeoProvider =
          effectiveProviderId === 'veo-3-img2vid' ||
          effectiveProviderId.startsWith('veo-');

        const hasReferenceImage = Boolean(referenceImageBase64);
        const generationDuration =
          effectiveIsVeoProvider && hasReferenceImage && effectiveQuality === 'standard'
            ? 8
            : renderDuration;
        // eslint-disable-next-line no-console
        console.info(
          `[exec-vgen] shot=${shotId} → provider=${effectiveProviderId} (planOverride=${planProviderImplOverride ?? 'none'}) durationSeconds=${generationDuration} (candidate=${finalDuration}, render=${renderDuration}, raw=${durationSeconds}, resolved=${resolvedDurationSeconds}, stb=${storyboardShot?.duration_seconds}, hasRef=${hasReferenceImage}, providerClamped=${renderDuration !== finalDuration}, veoForced=${generationDuration !== renderDuration}), aspect=${effectiveAspect}, quality=${effectiveQuality}, resolution=${planResolution ?? 'provider-default'}`,
        );

        const videoProvider = getMultiVideoProvider(effectiveProviderId);

        // I5 (gate-hardening 2026-06-04): img2vid providers CANNOT run imageless.
        // Enforced at the single provider call-site from the provider's own
        // capability contract — no per-provider duplication. A missing frame here
        // means an upstream gate let an unanchored shot through; fail loud BEFORE
        // reserving budget or calling the paid API (was: silent t2v drift / 422).
        if (videoProvider.capabilities.requires_reference_image && !referenceImageBase64) {
          throw new Error(
            `[exec-vgen] provider="${effectiveProviderId}" is img2vid and requires a reference image, but none resolved for shot=${shotId} (planStartAnchor=${planStartAnchorAssetId ?? 'none'}, eref=${referenceErefAssetId ?? 'none'}). Approve a start anchor / EREF for this shot before generating.`,
          );
        }

        // TD-85 (2026-06-01): hard-gate the Plan-declared resolution against
        // the resolved provider's contract. A Plan that declares a resolution
        // its provider does not support must fail the run loudly, not silently
        // degrade to the 720p default (the exact bug TD-85 fixes). When the
        // provider is fixed-resolution (empty supported set, e.g. Veo) the
        // declared value is ignored, not passed downstream. A null
        // planResolution (legacy / not-declared plan) skips the gate entirely
        // → provider default applies (back-compat preserved).
        const supportedResolutions =
          videoProvider.capabilities.supports_resolutions;
        if (
          planAssetId &&
          planResolution &&
          supportedResolutions.length > 0 &&
          !supportedResolutions.includes(planResolution)
        ) {
          throw new Error(
            `[exec-vgen] Plan declares resolution="${planResolution}" unsupported by provider="${effectiveProviderId}" (supported: ${supportedResolutions.join(', ')}). Fix the Plan's resolution field to a contract value.`,
          );
        }
        // 2026-06-09: effective resolution comes from the resolver (episode
        // config authority, plan resolution as shot override, clamped to the
        // provider contract). The TD-85 throw above still guards an explicitly
        // unsupported PLAN-declared resolution against the effective provider.
        const effectiveResolution = resolvedFormat.resolution;

        // ── UNIT 3 / I7: pre-spend ceiling gate ────────────────────────────
        // The episode budget ceiling MUST be checked BEFORE the paid provider
        // call, not after (recordCost runs post-generation in the Inngest
        // function). Compute a conservative cost estimate and atomically
        // reserve it against the ceiling; if the reservation is rejected, throw
        // BEFORE spending. The reservation is the actual spend reservation — the
        // post-generation recordCost MUST pass reservedUsd (this estimate) so
        // the ceiling is reconciled by the (actual − reserved) delta and never
        // double-counted.
        //
        // Estimate model: worst-case per-second Seedance rate (the priciest
        // video provider) × duration × resolution multiplier. Over-estimating
        // is the safe direction for a pre-spend reservation — a real cost lower
        // than the estimate simply leaves a little headroom that the
        // authoritative recordCost reconciles.
        let budgetReservedUsd = 0;
        if (episodeId && supabase) {
          const perSecond = Math.max(
            SEEDANCE_COST_USD_PER_SECOND.standard,
            SEEDANCE_COST_USD_PER_SECOND.fast,
          );
          const resolutionMult = effectiveResolution
            ? SEEDANCE_RESOLUTION_COST_MULT[effectiveResolution]
            : SEEDANCE_RESOLUTION_COST_MULT['1080p'];
          const estCostUsd = generationDuration * perSecond * resolutionMult;
          const avail = await assertBudgetAvailable(
            supabase,
            episodeId,
            estCostUsd,
          );
          if (!avail.allowed) {
            throw new BudgetExceededError({
              episodeId,
              currentSpent: avail.spent,
              attemptedCost: estCostUsd,
              ceiling: avail.ceiling ?? Number.POSITIVE_INFINITY,
            });
          }
          budgetReservedUsd = estCostUsd;
        }

        let real: Awaited<ReturnType<typeof videoProvider.generate>>;
        try {
          real = await videoProvider.generate({
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
            // TD-85: wire the Plan's contract-validated resolution. Omitted for
            // fixed-resolution providers (effectiveResolution null).
            ...(effectiveResolution ? { resolution: effectiveResolution } : {}),
          });
        } catch (genErr) {
          // q12 (2026-06-05): the paid call failed BEFORE producing output (e.g.
          // fal balance-lock 403). Release the pre-spend reservation so a failed/
          // retried generation doesn't leak budget into the ceiling. Only the
          // generate() call is guarded — a later persist failure means the money
          // was already spent, so it must NOT refund.
          if (budgetReservedUsd > 0 && episodeId && supabase) {
            await releaseBudgetReservation(supabase, episodeId, budgetReservedUsd);
          }
          throw genErr;
        }
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
              // TD-85 (2026-06-01): persist the resolution that actually drove
              // generation so the VID-shot asset records 720p vs 1080p and the
              // UI / reruns inherit it. null when the provider is
              // fixed-resolution or the Plan did not declare one.
              ...(effectiveResolution ? { resolution: effectiveResolution } : {}),
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
              // UNIT 3 / I7: the estimated cost reserved against the ceiling
              // BEFORE this paid call. The post-generation record-cost step
              // reconciles the authoritative actual cost against this reservation
              // (recordCost reservedUsd) so the ceiling is never double-charged.
              budget_reserved_usd: budgetReservedUsd,
            }),
          },
        };
      }

      const video = await mockVideo({ episodeId, shotId, durationSeconds: renderDuration });
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
            duration_seconds: renderDuration,
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
        version?: number | null;
        metadata?: unknown;
        drive_path?: string | null;
        staging_path?: string | null;
        drive_web_view_url?: string | null;
      }>;
      // 2026-06-08 — pick the NEWEST approved animatic, not the first match.
      // loadAgentInputs loads ALL APPROVED assets unordered; when two animatics
      // are APPROVED at once (e.g. v06 stayed APPROVED after v07 was approved),
      // `.find()` non-deterministically grabbed the STALE one — so Director's
      // timeline edits (which land in the newest animatic) never reached the
      // final cut and every re-stitch produced a byte-identical render. Sort by
      // version desc (then keep insertion order as tiebreak) and take the top.
      const animaticAsset = upstream
        .filter(
          (a) =>
            a.file_type === 'VID-animatic' &&
            a.status === 'APPROVED' &&
            isAnimaticV1(a.metadata),
        )
        .sort((a, b) => (b.version ?? 0) - (a.version ?? 0))[0];
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
        .eq('status', 'APPROVED')
        // 2026-06-08 — newest version first so clipLengthsFromVidShotRows keeps
        // the latest clip duration per shot (same source the UI timeline uses).
        .order('version', { ascending: false });
      if (rowsErr) throw new Error(`EXEC-STITCH: fetch VID-shot rows failed: ${rowsErr.message}`);

      // 2026-06-08 — real clip lengths so per-shot duration is clamped EXACTLY
      // like the AnimaticPlayer timeline (computeEffectivePlayback below). Stops
      // the third divergent duration math: UI clamped (~60s) vs stitch's old
      // unclamped declared sum (~76.5s intended) → final cut now matches what
      // Director sees on the timeline.
      const clipLengths = clipLengthsFromVidShotRows(vidShotRows ?? []);

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
        inpointSeconds: number;
      }> = [];
      const missing: string[] = [];
      // 2026-06-06 — track which shots Director excluded via the ≤0.5s
      // duration threshold (Path A from the plan). Reported in metadata so
      // it's auditable; absence from `orderedShots` is what actually skips
      // the ffmpeg concat.
      const excludedShots: string[] = [];
      for (const shot of shotList) {
        const found = byShotId.get(shot.shot_id);
        if (!found || (!found.stagingPath && !found.url)) {
          missing.push(shot.shot_id);
          continue;
        }
        // 2026-06-08 — single source of truth for per-shot playback length:
        // computeEffectivePlayback applies the duration override, head trim AND
        // real clip-length clamp EXACTLY like the AnimaticPlayer timeline, so
        // the final cut equals what Director sees (no more UI-60s vs stitch-76s
        // divergence). ≤0.5s → excluded (same threshold the timeline dims at).
        const playable = computeEffectivePlayback(shot, overrides, clipLengths);
        if (playable <= 0.5) {
          excludedShots.push(shot.shot_id);
          continue;
        }
        // Head trim → concat demuxer `inpoint`; `durationSeconds` (= playable)
        // is the post-trim span, so buildConcatList emits outpoint = inpoint +
        // playable. computeEffectivePlayback already subtracted the head, so we
        // pass the span (not the raw declared duration) here.
        const trimStart = overrides[shot.shot_id]?.trim_start_seconds;
        const inpointSeconds =
          typeof trimStart === 'number' && trimStart > 0 ? trimStart : 0;
        orderedShots.push({
          shotId: shot.shot_id,
          assetId: found.id,
          stagingPath: found.stagingPath,
          url: found.url,
          durationSeconds: playable,
          inpointSeconds,
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
        // 2026-06-06 — relative /api/media/{filename} URLs come from the
        // worktree-independent media cache (f44381f). Same middleware-bypass
        // rationale as /staging/ — resolve to the cache file directly. Without
        // this branch fetch() received a relative URL and Node 18+ threw
        // "Failed to parse URL from /api/media/..." (the Online Editor
        // failure Director hit on the SH12 fix follow-up stitch).
        if (url.startsWith('/api/media/')) {
          // 2026-06-08 — decodeURIComponent: the persisted URL is
          // `/api/media/${encodeURIComponent(filename)}`, so a music track like
          // "Twang Relay-processed.mp3" arrives as "Twang%20Relay-processed.mp3".
          // The cache file on disk has the real space, so without decoding the
          // lookup missed → "media-cache miss for …%20…" (final cut failed on a
          // file the browser plays fine, since /api/media GET already decodes).
          const filename = decodeURIComponent(url.slice('/api/media/'.length).split('?')[0]!);
          const { cachedFileIfPresent } = await import('@/lib/media-cache');
          const absPath = await cachedFileIfPresent(filename);
          if (absPath) {
            // eslint-disable-next-line no-console
            console.log('[stitch] reading media-cache:', absPath);
            return await fsPromises.readFile(absPath);
          }
          throw new Error(
            `[stitch] media-cache miss for ${filename} — Drive sync has not populated the local cache yet; retry after the asset is mirrored or replace the music track`,
          );
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
        inpointSeconds?: number;
      }> = [];
      for (const s of orderedShots) {
        const bytes = await loadBytes(s.stagingPath, s.url);
        shotMp4Bytes.push({
          shotId: s.shotId,
          bytes,
          durationSeconds: s.durationSeconds,
          // 2026-06-06 — forward head trim (inpoint) when Director set a
          // trim_start_seconds override on this shot.
          ...(s.inpointSeconds > 0 ? { inpointSeconds: s.inpointSeconds } : {}),
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

      // 2026-06-06 — forward Director audio shaping (fade-in/out + trim)
      // from the animatic music track to ffmpeg's filter graph. Optional
      // fields, no transform applied when absent.
      const musicWithShaping = musicInput
        ? {
            ...musicInput,
            ...(typeof musicTrack?.fade_in_seconds === 'number'
              ? { fade_in_seconds: musicTrack.fade_in_seconds }
              : {}),
            ...(typeof musicTrack?.fade_out_seconds === 'number'
              ? { fade_out_seconds: musicTrack.fade_out_seconds }
              : {}),
            ...(typeof musicTrack?.trim_in_seconds === 'number'
              ? { trim_in_seconds: musicTrack.trim_in_seconds }
              : {}),
            ...(typeof musicTrack?.trim_out_seconds === 'number'
              ? { trim_out_seconds: musicTrack.trim_out_seconds }
              : {}),
          }
        : undefined;

      // 5. Run ffmpeg.
      const stitched = await ffmpegStitchEpisode({
        shotMp4Bytes,
        ...(musicWithShaping ? { music: musicWithShaping } : {}),
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
            // 2026-06-06 — surface excluded shots in metadata so audit can
            // tell why the final cut length differs from the shot_list
            // length without digging into individual director_overrides.
            excluded_shot_ids: excludedShots,
            music_asset_id: musicAssetId,
            ffmpeg_command: stitched.ffmpegCommand,
            size_bytes: stitched.sizeBytes,
            // 2026-06-06 — probed output duration so VID-final_cut row no
            // longer ships with metadata.duration_seconds = undefined.
            // 2026-06-08 — fall back to the summed playback length when ffprobe
            // is unavailable, so the field is NEVER null (it was null on every
            // E02 render because ffprobe couldn't be resolved).
            duration_seconds:
              stitched.durationSeconds ??
              Math.round(orderedShots.reduce((a, s) => a + s.durationSeconds, 0) * 100) / 100,
            assembled_at: new Date().toISOString(),
          }),
        },
      };
    }

    case 'EXEC-THUMB-DESIGNER': {
      // LLM viral-thumbnail Plan author — pure Anthropic cost, no image gen.
      // Reads the viral-thumbnail-design skill + Bible canon and writes one
      // SPC-thumb_plan asset with N distinct high-CTR concepts. Director
      // approves; the EXEC-THUMB executor then renders the variants.
      const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
      if (hasAnthropicKey) {
        try {
          const r = await runThumbnailDesigner({ inputs, revisionNote: args.revisionNote });
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
                script_asset_id: r.scriptAssetId,
                designer_notes: r.notes,
                provider_id: r.model,
                provider_used: 'anthropic',
                plan_kind: 'thumb_plan',
              },
            },
          };
        } catch (err: unknown) {
          if (err instanceof ThumbnailDesignerError) {
            throw new Error(`EXEC-THUMB-DESIGNER: ${err.message}`);
          }
          throw err;
        }
      }
      // Fallback: mockLLM so replay-pilot + tests without a key keep running.
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
            description: 'Stub EXEC-THUMB-DESIGNER mock — set ANTHROPIC_API_KEY for real path',
            plan_kind: 'thumb_plan',
            provider_id: 'mock',
            provider_used: 'mock',
          },
        },
      };
    }

    case 'EXEC-THUMB': {
      // Plan-driven executor: render the APPROVED SPC-thumb_plan's N variants
      // via multi-canon gpt-image-2 edits (openai-edits-multi — ALL LOCKED Bible
      // character canon + style fed together so Sandy + Anvil + … stay on-model),
      // then a punchy sharp text overlay → N sibling IMG-thumbnail rows. Inserts
      // directly (skip_save).
      const hasOpenAI = Boolean(process.env.OPENAI_API_KEY?.trim());
      // Resolve the plan: prefer the explicit planAssetId from the event; else
      // fall back to the latest APPROVED SPC-thumb_plan for the episode. Without
      // this, a manual EXEC-THUMB trigger (no planAssetId) silently mocked even
      // though an approved plan existed — the v06-mock bug Director hit.
      let effectivePlanId = planAssetId;
      if (!effectivePlanId && supabase) {
        const { data: planRows } = await supabase
          .from('assets')
          .select('id')
          .eq('episode_id', episodeId)
          .eq('file_type', 'SPC-thumb_plan')
          .eq('status', 'APPROVED')
          .order('version', { ascending: false })
          .limit(1);
        effectivePlanId = (planRows?.[0] as { id?: string } | undefined)?.id ?? undefined;
      }
      if (hasOpenAI && supabase && effectivePlanId) {
        try {
          const r = await runThumbnailRenderer({ inputs, supabase, episodeCode, planAssetId: effectivePlanId });
          return {
            outputKind: 'image-png',
            result: {
              asset_paths: [],
              cost_usd: r.costUsd,
              metadata: {
                agent_id: agentId,
                provider_id: 'openai-edits-multi',
                provider_used: 'gpt-image-2',
                description: r.description,
                skip_save: true,
                inserted_asset_ids: r.insertedAssetIds,
                total_images: r.totalImages,
              },
            },
          };
        } catch (err: unknown) {
          if (err instanceof ThumbnailRendererError) {
            throw new Error(`EXEC-THUMB: ${err.message}`);
          }
          throw err;
        }
      }
      // Fallback: mock placeholder (replay-pilot, no key, or no plan yet).
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
  'EXEC-CREAD': 'REV-readability', // C1-Gate — Creative Readability Critic verdict (one REV row per storyboard)
  'EXEC-WCHK': 'REV-world_check',
  'EXEC-EREF': 'IMG-episode_ref', // backbone v2: between Storyboard and Animatic
  'EXEC-EREF-DESIGNER': 'SPC-ref_plan', // Sprint «Дизайнер и Аниматор» — Plan asset feeds EXEC-EREF executor
  'EXEC-THUMB-DESIGNER': 'SPC-thumb_plan', // distribution tail — viral thumbnail Plan feeds EXEC-THUMB executor
  'EXEC-EPREV': 'REV-ref_plan', // Day 4 — Designer's Critic verdict (one REV row per Plan)
  'EXEC-VANIM': 'SPC-shot_plan', // Day 6-7 — Animator video Plan per shot
  'EXEC-VPREV': 'REV-shot_plan', // Day 8 — Animator's Critic verdict
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
  /**
   * Initial asset status for the insert (default 'DRAFT'). F3 / TD-76:
   * the factory passes its mode-derived target (REVIEW / APPROVED) so the
   * status lands atomically with the row — no separate flip to fail silently.
   */
  initialStatus?: 'DRAFT' | 'REVIEW' | 'APPROVED';
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
  let drivePath = result.asset_paths[0] ?? null;

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
  let stagingPath =
    typeof result.metadata.staging_path === 'string'
      ? (result.metadata.staging_path as string)
      : null;

  // 2026-06-08 — enforce media filename == row filename for video renders.
  // Runners persist the binary under a placeholder name (they can't know the
  // version yet), so every re-render's drive_path/staging_path pointed at the
  // FIRST render's file (the hardcoded `…-v01-DRAFT.mp4`). Combined with
  // /api/media's year-long immutable cache, Director saw a stale cut no matter
  // how many times he re-stitched. We own the canonical vNN name here, so move
  // the cache file to match and repoint both columns → each version is its own
  // file. Video-only to keep blast radius tight; EREF (skip_save, returns
  // early above) and image assets are untouched.
  if (ext === 'mp4' && stagingPath) {
    const nodePath = await import('node:path');
    if (nodePath.basename(stagingPath) !== filename) {
      try {
        const { localCacheAbsPath } = await import('../media-cache');
        const fsp = await import('node:fs/promises');
        const canonicalAbs = localCacheAbsPath(filename);
        await fsp.mkdir(nodePath.dirname(canonicalAbs), { recursive: true });
        await fsp.rename(stagingPath, canonicalAbs);
        stagingPath = canonicalAbs;
        drivePath = `/api/media/${encodeURIComponent(filename)}`;
      } catch (e) {
        // rename failed (already moved / cross-device) — keep runner paths; the
        // DRAFT-revalidate cache fix still prevents a stale immutable copy.
        // eslint-disable-next-line no-console
        console.warn(
          `[saveAgentOutput] cache rename → ${filename} failed: ${(e as Error).message}`,
        );
      }
    }
  }

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
  // Keys like `markdown`, `staging_path`, `description` are already promoted
  // to columns and would just bloat metadata, so they are NOT included here.
  //
  // TD-77 (2026-05-27): added critic-verdict keys so PA tools
  // (`getAnimatorCriticVerdict`, `unstickPlanForApproval`) can read the
  // structured verdict directly from `assets.metadata` instead of re-parsing
  // the REV markdown body each time. Auto-chain (factory.ts nextEvent) was
  // already reading verdict from the in-memory `result.metadata` before
  // save dropped it; this fix closes the read-after-save gap.
  const PERSIST_METADATA_KEYS = [
    'animatic_v1',
    // Critic verdict fields (TD-77) — EXEC-EPREV / EXEC-VPREV / EXEC-CREAD outputs
    'verdict',
    'failed_checks',
    'passed_checks',
    'acceptance_criteria',
    'warnings',
    'plan_asset_id',
    'shot_id',
    'review_kind',
    'plan_status_after_critic',
    'cread_phase', // EXEC-CREAD per-shot readability phase (eref/vanim)
    // 2026-06-08 — EXEC-STITCH final-cut audit. Without these the VID-final_cut
    // row landed with shot_ids=[] / duration_seconds=undefined (the runner set
    // them but saveAgentOutput dropped every non-allowlisted key), so there was
    // no audit trail of cut length, excluded shots, or the ffmpeg command.
    'shot_ids',
    'excluded_shot_ids',
    'music_asset_id',
    'duration_seconds',
    'ffmpeg_command',
    'size_bytes',
    'assembled_at',
  ] as const;
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
      // F3 / TD-76 root (2026-06-12): the caller's target status lands IN the
      // insert. Previously the factory inserted DRAFT here and flipped to
      // REVIEW/APPROVED with a SEPARATE unchecked update — when that update
      // failed silently (supabase returns {error}, never throws) the job
      // still completed and the plan sat DRAFT forever (E07: SH01 v04,
      // SH02 v04/v05 — updated_at === created_at to the microsecond, while
      // Полина needed unstickPlanForApproval + manual approves). One insert,
      // zero flip window. Filename keeps the -DRAFT suffix (cosmetic; the
      // old flip never renamed either).
      status: args.initialStatus ?? 'DRAFT',
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
