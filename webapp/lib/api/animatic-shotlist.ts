// ──────────────────────────────────────────────────────────────────────────────
// lib/api/animatic-shotlist.ts
// Animatic v1 contract — browser-native player.
//
// The Animatic asset is NOT a rendered video file. It is an asset row whose
// `metadata.animatic_v1` holds an ordered shot list that references already-
// approved IMG-episode_ref assets. The drawer UI (AnimaticPlayer) plays the
// list via <img> + <audio> + setTimeout, with no mp4 rendering.
//
// Per Director's directive (2026-05-05): rendering an mp4 just to preview
// pacing is wasteful. Browser plays directly. Per-shot durations are editable
// live and persisted as `director_overrides` without re-render.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';

export const ANIMATIC_CONTRACT = 'animatic@v1';
export type AnimaticContractId = typeof ANIMATIC_CONTRACT;

/** One row in the animatic timeline. */
export interface AnimaticShot {
  /** Storyboard shot id (e.g. "ss_s14_e01_a2_sc02_sh03"). */
  shot_id: string;
  /**
   * UUID of the approved IMG-episode_ref asset that supplies the image, or
   * `null` for a placeholder shot (storyboard shot with no approved ref yet —
   * the cell renders dark/empty rather than borrowing another shot's image).
   */
  asset_id: string | null;
  /** Best browser-loadable URL for the image, or `null` for a placeholder shot. */
  image_url: string | null;
  /** Initial duration from storyboard `duration_seconds`. Director can override. */
  duration_seconds: number;
  /** From storyboard, optional. e.g. "establishing", "action", "punchline". */
  shot_role?: string;
  /** Short caption derived from storyboard (action/key_beat truncated). */
  caption?: string;
}

/** Director's per-shot duration tweaks, persisted alongside the canonical list. */
export interface AnimaticDirectorOverride {
  duration_seconds: number;
  /**
   * 2026-06-06 — optional head trim. When set, EXEC-STITCH emits an `inpoint
   * <seconds>` directive on the concat demuxer so this shot starts reading
   * its mp4 from this timestamp. Pairs naturally with `outpoint` (driven by
   * `duration_seconds`) to give Director both head and tail control over
   * each shot without re-rendering. Default 0 = read from the start.
   */
  trim_start_seconds?: number;
  edited_at?: string;
}

/**
 * One audio layer in the timeline. Schema is multi-track from the start (per
 * Director's directive 2026-05-06 #4) so `EpisodeTimeline` can play music +
 * voice + sfx + ambience in parallel without re-architecting later — even
 * though MVP only ships the `music` layer.
 */
export type AudioLayer = 'music' | 'voice' | 'sfx' | 'ambience';

export interface AudioTrack {
  layer: AudioLayer;
  /** Best browser-loadable URL — drive_web_view_url, staging_path, or http(s). */
  url: string;
  filename: string;
  /** 0..1, default 1.0 for music, 0.8 for ambience, etc. */
  volume?: number;
  muted?: boolean;
  /** Optional offset in seconds — track starts at this point in the timeline. */
  start_at_seconds?: number;
  // ── Director-editable shaping (2026-06-06) ────────────────────────────────
  // Mirrors the per-shot `director_overrides` pattern: small optional fields
  // persisted in-place on the asset; EXEC-STITCH translates them into ffmpeg
  // `afade` / `atrim` filters at assembly time. Closes Director's "конец как
  // обрыв" feedback on the first E02 final cut.
  /** Seconds of audio fade-in at the start (afade=t=in:d=N). Default 0. */
  fade_in_seconds?: number;
  /** Seconds of audio fade-out at the end (afade=t=out:d=N). Default 0. */
  fade_out_seconds?: number;
  /** Seconds to skip from the start of the source (atrim=start=N). Default 0. */
  trim_in_seconds?: number;
  /** Seconds at which to stop reading the source (atrim=end=N). Default: full length. */
  trim_out_seconds?: number;
  /**
   * 2026-06-06 — preserved original (unshaped) source URL. Set on the first
   * Save that introduces fade/trim — at that point `url` may be rewritten to
   * point at a derived processed file. When Director later clears all
   * shaping controls, the route restores `url` from `original_url` and unsets
   * this field so the asset returns to its raw playback state.
   */
  original_url?: string;
}

/**
 * Forward-compat reader: returns `audio_tracks[]` if the contract has it,
 * otherwise fabricates a single-element list from the legacy `music_url`
 * field. Always safe to call — `[]` if the asset has no audio at all.
 *
 * 2026-05-23 — the `audio_tracks` check requires a non-empty array; an
 * empty `audio_tracks: []` produced by upstream writers (e.g. EXEC-STITCH
 * fan-out before MGEN landed) used to short-circuit the fallback even
 * though `music_url` was correctly populated. SS-S15-E01 animatic
 * exhibited this — music asset existed and `music_url` was set, but
 * `audio_tracks: []` ate the fallback → no audio rendered in AnimaticPlayer.
 */
export function getAudioTracks(contract: AnimaticContract): AudioTrack[] {
  if (Array.isArray(contract.audio_tracks) && contract.audio_tracks.length > 0) {
    return contract.audio_tracks;
  }
  if (contract.music_url) {
    return [{
      layer: 'music',
      url: contract.music_url,
      filename: contract.music_filename ?? 'music',
      volume: 1.0,
      muted: false,
    }];
  }
  return [];
}

/**
 * Canonical WRITER for the music layer — the mirror of `getAudioTracks` (the
 * canonical reader). Returns a NEW contract whose music-layer track points at
 * the supplied url/filename, with non-music layers (voice/sfx/ambience)
 * preserved and the legacy `music_url`/`music_filename` kept in sync.
 *
 * Why this exists: `getAudioTracks` PREFERS a non-empty `audio_tracks[]` over
 * the legacy `music_url`. So a Replace-music flow that wrote only `music_url`
 * left a stale `audio_tracks[music]` shadowing the fresh upload — the player
 * and EXEC-STITCH both kept playing the old track (SS-S15-E03 v03 regression,
 * 2026-06-09). Writing through here keeps reader and writer in lockstep.
 *
 * Shaping (fade/trim) is intentionally NOT carried over — the new source is a
 * different file; the Director re-shapes via /animatic-timing afterward.
 */
export function replaceMusicLayer(
  contract: AnimaticContract,
  track: { url: string; filename: string },
): AnimaticContract {
  const existing = Array.isArray(contract.audio_tracks) ? contract.audio_tracks : [];
  const nonMusic = existing.filter((t) => t.layer !== 'music');
  const musicTrack: AudioTrack = {
    layer: 'music',
    url: track.url,
    filename: track.filename,
    volume: 1.0,
    muted: false,
  };
  return {
    ...contract,
    audio_tracks: [musicTrack, ...nonMusic],
    music_url: track.url,
    music_filename: track.filename,
  };
}

/** The full v1 animatic payload stored at `assets.metadata.animatic_v1`. */
export interface AnimaticContract {
  contract: AnimaticContractId;
  shot_list: AnimaticShot[];
  /**
   * Multi-track audio layers (music / voice / sfx / ambience). New writers MUST
   * populate this. Readers should prefer `getAudioTracks(contract)` which falls
   * back to the deprecated `music_url` for legacy assets.
   */
  audio_tracks?: AudioTrack[];
  /**
   * @deprecated Legacy single-music slot. Kept readable for animatic v1 assets
   * created before 2026-05-06. New code should write `audio_tracks` instead.
   * `getAudioTracks()` reads either field transparently.
   */
  music_url: string | null;
  music_filename: string | null;
  /** Sum of durations (with overrides applied). Recomputed on save-timing. */
  total_duration: number;
  /** Director's per-shot duration tweaks; keyed by shot_id. */
  director_overrides?: Record<string, AnimaticDirectorOverride>;
  /** ISO timestamp when the asset was first generated. */
  created_at: string;
}

/** Type guard. */
export function isAnimaticV1(meta: unknown): meta is { animatic_v1: AnimaticContract } {
  if (!meta || typeof meta !== 'object') return false;
  const v1 = (meta as { animatic_v1?: unknown }).animatic_v1;
  if (!v1 || typeof v1 !== 'object') return false;
  return (v1 as { contract?: unknown }).contract === ANIMATIC_CONTRACT;
}

/**
 * Effective duration for a shot, applying any Director override.
 *
 * 2026-06-06 — does NOT subtract `trim_start_seconds` here. The bare duration
 * override is Director's raw intent for tail (outpoint); the actual playable
 * length after head trim and clip-length clamp is computed by
 * `computeEffectivePlayback` which has the clipLengths context.
 */
export function effectiveDurationSeconds(
  shot: AnimaticShot,
  overrides: Record<string, AnimaticDirectorOverride> | undefined,
): number {
  const override = overrides?.[shot.shot_id]?.duration_seconds;
  if (typeof override === 'number' && override > 0) return override;
  return shot.duration_seconds;
}

/**
 * Threshold (seconds) at/below which a shot is treated as DELETED by the
 * Director — the "collapse duration to ≤0.5s = remove this shot" gesture. Single
 * source for the magic 0.5 that EXEC-STITCH, the completeness gate, and the
 * timeline-total all key off.
 */
export const DELETED_SHOT_MAX_SECONDS = 0.5;

/**
 * 2026-06-22 — a shot the Director soft-deleted by collapsing its effective
 * duration to ≤0.5s. Such a shot is excluded EVERYWHERE: it must not be rendered,
 * must not block EXEC-STITCH for missing media, and must not count toward the
 * "all shots approved → auto-start final cut" gate. Root cause: the deleted shot
 * sat in `shot_list` (so the completeness denominator counted it) but could never
 * be APPROVED → the gate never fired and a manual STITCH threw on missing media.
 * Override-based, so it's decidable without clip lengths (the completeness gate
 * has no media context). Pairs with computeEffectivePlayback's ≤0.5 clamp, which
 * additionally catches trim-collapsed shots that DO have media.
 *
 * 2026-07-03 — exclusion is now an EXPLICIT per-shot flag too. `excludedShotIds`
 * is the episode's `metadata.excluded_shot_ids` set — a shot in it is excluded
 * regardless of duration. The legacy ≤0.5s duration collapse still counts (zero
 * migration), so both the old gesture and the new kebab toggle work. This is the
 * one seam every reader (stitch gate, stitch runner, timeline, Polina's list)
 * funnels through, so teaching them exclusion = passing this set here.
 */
export function isDeletedShot(
  shot: AnimaticShot,
  overrides: Record<string, AnimaticDirectorOverride> | undefined,
  excludedShotIds?: ReadonlySet<string>,
): boolean {
  if (excludedShotIds?.has(shot.shot_id)) return true;
  return effectiveDurationSeconds(shot, overrides) <= DELETED_SHOT_MAX_SECONDS;
}

/**
 * Extract the episode's explicit excluded-shot set from its metadata
 * (`episodes.metadata.excluded_shot_ids: string[]`) — the stage-independent SSOT
 * for the "excluded (button)" flag, reachable at any stage (no animatic asset
 * required). Safe on absent/garbage metadata. Pass the result to `isDeletedShot`
 * and the per-shot generation guards.
 */
export function excludedShotIdsFromEpisodeMeta(metadata: unknown): Set<string> {
  const raw =
    metadata && typeof metadata === 'object'
      ? (metadata as { excluded_shot_ids?: unknown }).excluded_shot_ids
      : null;
  const set = new Set<string>();
  if (Array.isArray(raw)) {
    for (const v of raw) {
      if (typeof v === 'string' && v.length > 0) set.add(v);
    }
  }
  return set;
}

/**
 * 2026-06-06 — single source of truth for "how many seconds of THIS shot
 * actually play in the final cut". Combines:
 *   - Director duration override (or storyboard duration as fallback)
 *   - Head trim (trim_start_seconds) — eats from the available clip window
 *   - Real clip length (clipLengths Map) — ffmpeg can't read beyond EOF
 *
 * The math:
 *   playable = min(durationDeclared, clipLength - trimStart)
 *   if playable <= 0 → 0 (shot fully excluded)
 *
 * Why: when Director sets trim_start=2s on a 4s clip with duration=3s,
 * ffmpeg reads [2, 5) but the clip ends at 4 → only 2s play. The preview
 * timeline must reflect this, otherwise the total counter and the playback
 * engine drift from what the final cut emits.
 */
export function computeEffectivePlayback(
  shot: AnimaticShot,
  overrides: Record<string, AnimaticDirectorOverride> | undefined,
  clipLengths?: ReadonlyMap<string, number>,
): number {
  const durationDeclared = effectiveDurationSeconds(shot, overrides);
  const trimStart = overrides?.[shot.shot_id]?.trim_start_seconds;
  const head = typeof trimStart === 'number' && trimStart > 0 ? trimStart : 0;
  const clip = clipLengths?.get(shot.shot_id);
  const available = typeof clip === 'number' && clip > 0 ? clip - head : Infinity;
  const playable = Math.min(durationDeclared, available);
  return playable > 0 ? playable : 0;
}

/**
 * Recompute the total runtime by summing per-shot durations (with overrides).
 *
 * 2026-06-06 — accepts an optional `clipLengths` map (shot_id → real VID-shot
 * duration). When passed, each effective per-shot duration is clamped to
 * `min(override, clipLength)` — ffmpeg's `outpoint` directive in EXEC-STITCH
 * does the same clamp by definition, so the AnimaticPlayer total now reports
 * the honest final-cut length instead of an unreachable animatic-declared
 * length (Director's "1:40 vs 1:12" confusion).
 *
 * Without `clipLengths` the function behaves exactly as before
 * (backward-compat for any caller that doesn't have VID asset metadata).
 *
 * Shots whose effective duration is ≤ 0.5s are SKIPPED — the same threshold
 * EXEC-STITCH uses to exclude shots from the final cut, so the timeline
 * total matches what ffmpeg will actually emit.
 */
export function computeTotalDuration(
  shotList: AnimaticShot[],
  overrides: Record<string, AnimaticDirectorOverride> | undefined,
  clipLengths?: ReadonlyMap<string, number>,
): number {
  let total = 0;
  for (const s of shotList) {
    const playable = computeEffectivePlayback(s, overrides, clipLengths);
    if (playable <= 0.5) continue; // skipped — see EXEC-STITCH exclusion
    total += playable;
  }
  return Math.round(total * 100) / 100;
}

/**
 * 2026-06-08 — single source of truth for the `shot_id → real clip duration`
 * map used to clamp per-shot playback to actual VID-shot lengths. Previously
 * built ad-hoc in three places (AnimaticPlayer, /animatic-timing route,
 * EXEC-STITCH) which let the UI clamp (≈60s) while Save persisted the unclamped
 * total (76.5s) and stitch did a third thing — the same number disagreeing
 * across layers. Reads `metadata.shot_id` + `metadata.duration_seconds` from
 * APPROVED VID-shot rows. Keeps the FIRST positive duration seen per shot_id,
 * so callers should pass rows newest-version-first (or one row per shot).
 */
export function clipLengthsFromVidShotRows(
  rows: ReadonlyArray<{ metadata?: unknown }>,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const meta = (row?.metadata ?? {}) as { shot_id?: unknown; duration_seconds?: unknown };
    const sid = meta.shot_id;
    const dur = meta.duration_seconds;
    if (typeof sid === 'string' && typeof dur === 'number' && dur > 0 && !map.has(sid)) {
      map.set(sid, dur);
    }
  }
  return map;
}

// ── Storyboard v2 parsing ──────────────────────────────────────────────────────

interface StoryboardShotV2 {
  shot_id: string;
  shot_role?: string;
  duration_seconds?: number;
  action?: string;
  key_beat?: string;
}

/**
 * Extract shots from an approved storyboard asset's content. Supports both
 * storyboarder@v2 (preferred) and the legacy v1 shape — v2 uses `shot_role`
 * and `characters[]` with `bible_slug`; v1 uses `characters_present[]` and
 * lacks `shot_role`. We only need shot_id + duration + caption-source here.
 */
export function extractShotsFromStoryboard(content: string): StoryboardShotV2[] {
  const matches = [...content.matchAll(/```json\s*([\s\S]+?)```/g)];
  if (matches.length === 0) return [];
  const last = matches[matches.length - 1]?.[1];
  if (!last) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(last.trim());
  } catch {
    return [];
  }
  const acts = (parsed as { acts?: unknown[] }).acts;
  if (!Array.isArray(acts)) return [];
  const shots: StoryboardShotV2[] = [];
  for (const act of acts) {
    const a = act as { shots?: unknown[] };
    if (!Array.isArray(a.shots)) continue;
    for (const s of a.shots) {
      const sh = s as Partial<StoryboardShotV2> & { shot_id?: unknown };
      if (typeof sh.shot_id !== 'string') continue;
      shots.push({
        shot_id: sh.shot_id,
        shot_role: typeof sh.shot_role === 'string' ? sh.shot_role : undefined,
        duration_seconds:
          typeof sh.duration_seconds === 'number' && sh.duration_seconds > 0
            ? sh.duration_seconds
            : undefined,
        action: typeof sh.action === 'string' ? sh.action : undefined,
        key_beat: typeof sh.key_beat === 'string' ? sh.key_beat : undefined,
      });
    }
  }
  return shots;
}

// ── ShotList builder ──────────────────────────────────────────────────────────

interface ApprovedEREFAssetRow {
  id: string;
  file_type: string;
  status: string;
  staging_path: string | null;
  drive_path: string | null;
  drive_web_view_url: string | null;
  filename: string;
  metadata: unknown;
}

const FALLBACK_DURATION_S = 2.5;

function bestImageUrl(asset: ApprovedEREFAssetRow): string {
  // Drive-backed media is served via the stable /api/media/<id> cache route
  // (post-2026-06-01 migration); /staging is dead and drive_web_view_url is a
  // viewer page, not an image. drive_web_view_url presence ⇒ Drive-backed.
  if (asset.id && asset.drive_web_view_url) return `/api/media/${asset.id}`;
  return (
    asset.staging_path ||
    asset.drive_web_view_url ||
    asset.drive_path ||
    ''
  );
}

function shotIdFromMetadata(meta: unknown): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const sr = (meta as { shot_reference?: { shot_id?: unknown } }).shot_reference;
  if (!sr || typeof sr !== 'object') return null;
  const id = sr.shot_id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

/**
 * Build the animatic shot_list from APPROVED IMG-episode_ref assets in a way
 * that aligns with the storyboard. Order follows storyboard `shots[]`. Each
 * storyboard shot is matched to the approved asset whose
 * `metadata.shot_reference.shot_id` equals the storyboard shot_id (v2). When
 * storyboard or assets are v1 (no shot_id metadata), falls back to round-robin
 * ordering by storyboard index.
 *
 * Throws if no shots in storyboard or no approved EREF assets.
 */
export async function buildShotListFromApprovedEREF(
  supabase: SupabaseClient,
  episodeId: string,
  approvedStoryboardContent: string,
): Promise<AnimaticShot[]> {
  const shots = extractShotsFromStoryboard(approvedStoryboardContent);
  if (shots.length === 0) {
    throw new Error('Storyboard has no parseable shots[]');
  }

  const { data: assets, error } = await supabase
    .from('assets')
    .select('id,file_type,status,staging_path,drive_path,drive_web_view_url,filename,metadata')
    .eq('episode_id', episodeId)
    .eq('status', 'APPROVED')
    .like('file_type', 'IMG-episode_ref%');
  if (error) throw new Error(`approved EREF fetch: ${error.message}`);
  const refs = (assets ?? []) as ApprovedEREFAssetRow[];
  if (refs.length === 0) {
    throw new Error('No APPROVED IMG-episode_ref assets — approve refs in EREF stage first');
  }

  // Build a shot_id → asset map for v2 deterministic matching.
  const byShotId = new Map<string, ApprovedEREFAssetRow>();
  for (const a of refs) {
    const id = shotIdFromMetadata(a.metadata);
    if (id) byShotId.set(id, a);
  }

  // v2 = at least one approved ref carries shot_id metadata → we can match each
  // storyboard shot to ITS ref deterministically. v1 (legacy, no shot_id on any
  // ref) has no key to match on, so it round-robins by index as a best effort.
  // CRITICAL (2026-06-23): in v2 a shot with NO approved ref must get a
  // PLACEHOLDER (null image), never a round-robined borrow of another shot's
  // image. The old unconditional `refs[i % refs.length]` fallback meant that
  // with only SH01/SH02 approved, every other shot displayed SH01/SH02's image.
  const isV1 = byShotId.size === 0;

  const shotList: AnimaticShot[] = [];
  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i]!;
    const chosen: ApprovedEREFAssetRow | undefined =
      byShotId.get(shot.shot_id) ?? (isV1 ? refs[i % refs.length] : undefined);
    const captionSource = shot.key_beat ?? shot.action ?? '';
    shotList.push({
      shot_id: shot.shot_id,
      asset_id: chosen?.id ?? null,
      image_url: chosen ? bestImageUrl(chosen) : null,
      duration_seconds: shot.duration_seconds ?? FALLBACK_DURATION_S,
      shot_role: shot.shot_role,
      caption: captionSource ? captionSource.slice(0, 200) : undefined,
    });
  }
  assertCompleteShotList(shotList, shots, 'buildShotListFromApprovedEREF');
  return shotList;
}

/**
 * Anchor-chain shot_list builder (TD-49 Phase 2 — anchor_chain_enabled).
 *
 * Symmetric to `buildShotListFromApprovedEREF` but sources its frame images
 * from APPROVED `IMG-anchor_*` assets instead of `IMG-episode_ref` assets.
 * The anchor chain produces a START + END anchor per shot; for the animatic
 * pacing preview we use the START anchor of each shot (the frame the shot
 * opens on). Per-shot duration is resolved from the shot's APPROVED
 * SPC-shot_plan when one exists (its `duration_seconds`), falling back to the
 * storyboard `duration_seconds`, then to `FALLBACK_DURATION_S`.
 *
 * Returns the SAME `AnimaticShot` contract as the EREF builder so all
 * downstream consumers (newAnimaticContract, /animatic-timing PATCH,
 * AnimaticPlayer) are unchanged.
 *
 * Throws if the storyboard has no shots or zero shots resolve to an anchor.
 */
export async function buildShotListFromAnchorChain(
  supabase: SupabaseClient,
  episodeId: string,
  approvedStoryboardContent: string,
): Promise<AnimaticShot[]> {
  const shots = extractShotsFromStoryboard(approvedStoryboardContent);
  if (shots.length === 0) {
    throw new Error('Storyboard has no parseable shots[]');
  }

  // 1. APPROVED IMG-anchor_* assets → keep only the START anchor per shot.
  const { data: anchorAssets, error: anchorErr } = await supabase
    .from('assets')
    .select('id,file_type,status,staging_path,drive_path,drive_web_view_url,filename,metadata')
    .eq('episode_id', episodeId)
    .eq('status', 'APPROVED')
    .like('file_type', 'IMG-anchor_%')
    // Newest version FIRST so the first match per shot (kept below) is the
    // LATEST approved anchor. Without this the query is unordered and an older
    // version (e.g. the original yellow-Sandy drift frame) can win over a
    // freshly regenerated + approved one — which is exactly what happened.
    .order('version', { ascending: false })
    .order('created_at', { ascending: false });
  if (anchorErr) throw new Error(`approved IMG-anchor fetch: ${anchorErr.message}`);
  // anchors MAY be empty if every shot uses an episode_ref fallback instead
  // (Director rule: for the animatic a ref ≡ an anchor). The final
  // empty-shotList check below is the real guard, not this fetch.
  const anchors = (anchorAssets ?? []) as ApprovedEREFAssetRow[];

  // Map shot_id → START anchor, keyed on metadata.shot_reference.shot_id
  // (e.g. "SS-S15-E02-A2-SC11-SH11") — the SAME format as the storyboard
  // shot_id. The anchor FILENAME embeds a different form (lowercase-underscored
  // "ss_s15_e02_a2_sc11_sh11") that never matches the storyboard id, which is
  // why filename-based matching silently dropped every anchor. This mirrors the
  // metadata-based matching the episode_ref fallback uses below.
  const anchorByShotId = new Map<string, ApprovedEREFAssetRow>();
  for (const a of anchors) {
    const meta = a.metadata as
      | { shot_reference?: { shot_id?: unknown }; anchor_position?: unknown }
      | null;
    if (meta?.anchor_position !== 'start') continue;
    const sid = meta?.shot_reference?.shot_id;
    if (typeof sid !== 'string') continue;
    if (!anchorByShotId.has(sid)) anchorByShotId.set(sid, a);
  }

  // 1b. Per-shot episode_ref fallback (Director: ref ≡ anchor for the animatic).
  // Shots whose START anchor is missing (e.g. SH01/SH02 whose anchors failed in
  // the Reference Artist stage) but that DO have an APPROVED IMG-episode_ref use
  // that ref as the frame. Same shot_id matching as buildShotListFromApprovedEREF.
  const { data: refAssets, error: refErr } = await supabase
    .from('assets')
    .select('*')
    .eq('episode_id', episodeId)
    .eq('status', 'APPROVED')
    .like('file_type', 'IMG-episode_ref%')
    // Newest version first → keep the latest approved ref per shot (below).
    .order('version', { ascending: false })
    .order('created_at', { ascending: false });
  if (refErr) throw new Error(`approved IMG-episode_ref fetch: ${refErr.message}`);
  const refByShotId = new Map<string, ApprovedEREFAssetRow>();
  for (const a of (refAssets ?? []) as ApprovedEREFAssetRow[]) {
    const id = shotIdFromMetadata(a.metadata);
    if (id && !refByShotId.has(id)) refByShotId.set(id, a);
  }

  // 2. APPROVED SPC-shot_plan assets → shot_id → duration_seconds.
  const { data: planAssets, error: planErr } = await supabase
    .from('assets')
    .select('content')
    .eq('episode_id', episodeId)
    .eq('status', 'APPROVED')
    .like('file_type', 'SPC-shot_plan%');
  if (planErr) throw new Error(`approved SPC-shot_plan fetch: ${planErr.message}`);
  const planDurationByShotId = new Map<string, number>();
  for (const row of (planAssets ?? []) as Array<{ content: string | null }>) {
    if (!row.content) continue;
    const matches = [...row.content.matchAll(/```json\s*([\s\S]+?)```/g)];
    const last = matches[matches.length - 1]?.[1];
    if (!last) continue;
    let body: unknown;
    try {
      body = JSON.parse(last.trim());
    } catch {
      continue;
    }
    const b = body as { shot_id?: unknown; duration_seconds?: unknown };
    if (
      typeof b.shot_id === 'string' &&
      typeof b.duration_seconds === 'number' &&
      b.duration_seconds > 0
    ) {
      planDurationByShotId.set(b.shot_id, b.duration_seconds);
    }
  }

  // 3. Walk storyboard order, resolve start anchor + duration per shot.
  const shotList: AnimaticShot[] = [];
  for (const shot of shots) {
    // anchor START preferred; fall back to an APPROVED episode_ref for the shot
    // (Director: ref ≡ anchor for the animatic — take the start frame).
    const chosen =
      anchorByShotId.get(shot.shot_id) ??
      refByShotId.get(shot.shot_id);
    if (!chosen) continue;
    const duration =
      planDurationByShotId.get(shot.shot_id) ??
      shot.duration_seconds ??
      FALLBACK_DURATION_S;
    const captionSource = shot.key_beat ?? shot.action ?? '';
    shotList.push({
      shot_id: shot.shot_id,
      asset_id: chosen.id,
      image_url: bestImageUrl(chosen),
      duration_seconds: duration,
      shot_role: shot.shot_role,
      caption: captionSource ? captionSource.slice(0, 200) : undefined,
    });
  }
  assertCompleteShotList(shotList, shots, 'buildShotListFromAnchorChain');
  return shotList;
}

/**
 * Fail-loud guard for animatic shot_list builders. Replaces the older
 * `shotList.length === 0` checks: a builder that silently drops even ONE shot
 * (e.g. its START anchor stuck in REVIEW) corrupts the visual layout of the
 * entire animatic — UI positions thereafter all shift by one and Director
 * sees the wrong shot under each timeline button. 2026-06-05 incident: E02
 * v06 lost SH12 (anchor REVIEW), button 12 then showed SH13 etc.
 */
export function assertCompleteShotList(
  shotList: AnimaticShot[],
  shots: ReadonlyArray<{ shot_id: string }>,
  builderName: string,
): void {
  if (shotList.length === shots.length) return;
  const got = new Set(shotList.map((s) => s.shot_id));
  const missing = shots.filter((s) => !got.has(s.shot_id)).map((s) => s.shot_id);
  throw new Error(
    `${builderName} dropped ${missing.length}/${shots.length} shot(s) silently: ` +
      `${missing.join(', ')} — check APPROVED status of their anchor START / episode_ref.`,
  );
}

/**
 * Build a fresh `AnimaticContract` payload (no overrides yet, no music yet).
 */
export function newAnimaticContract(shotList: AnimaticShot[]): AnimaticContract {
  return {
    contract: ANIMATIC_CONTRACT,
    shot_list: shotList,
    audio_tracks: [],
    music_url: null,
    music_filename: null,
    total_duration: computeTotalDuration(shotList, undefined),
    created_at: new Date().toISOString(),
  };
}
