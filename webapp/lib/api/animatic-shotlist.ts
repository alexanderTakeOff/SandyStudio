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
  /** UUID of the approved IMG-episode_ref asset that supplies the image. */
  asset_id: string;
  /** Best browser-loadable URL for the image (drive_web_view_url or staging). */
  image_url: string;
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
}

/**
 * Forward-compat reader: returns `audio_tracks[]` if the contract has it,
 * otherwise fabricates a single-element list from the legacy `music_url`
 * field. Always safe to call — `[]` if the asset has no audio at all.
 */
export function getAudioTracks(contract: AnimaticContract): AudioTrack[] {
  if (Array.isArray(contract.audio_tracks)) {
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
 * Recompute the total runtime by summing per-shot durations (with overrides).
 */
export function computeTotalDuration(
  shotList: AnimaticShot[],
  overrides: Record<string, AnimaticDirectorOverride> | undefined,
): number {
  let total = 0;
  for (const s of shotList) total += effectiveDurationSeconds(s, overrides);
  return Math.round(total * 100) / 100;
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

  const shotList: AnimaticShot[] = [];
  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i]!;
    let chosen: ApprovedEREFAssetRow | undefined = byShotId.get(shot.shot_id);
    if (!chosen) {
      // v1 fallback: round-robin by index.
      chosen = refs[i % refs.length];
    }
    if (!chosen) continue;
    const captionSource = shot.key_beat ?? shot.action ?? '';
    shotList.push({
      shot_id: shot.shot_id,
      asset_id: chosen.id,
      image_url: bestImageUrl(chosen),
      duration_seconds: shot.duration_seconds ?? FALLBACK_DURATION_S,
      shot_role: shot.shot_role,
      caption: captionSource ? captionSource.slice(0, 200) : undefined,
    });
  }
  if (shotList.length === 0) {
    throw new Error('Could not align any storyboard shots to approved references');
  }
  return shotList;
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
