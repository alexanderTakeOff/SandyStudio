// ──────────────────────────────────────────────────────────────────────────────
// lib/agents/runners/animatic-slideshow.ts
// EXEC-EDIT — Animatic Slideshow (Step 8-lite).
//
// Real animatic with music + SFX needs ffmpeg or a hosted compositor — out of
// scope for this slice. Step 8-lite produces a "soft animatic": a markdown
// document with the approved IMG-episode_ref images embedded in shot order,
// per-shot durations called out next to each frame. Director scrolls and
// validates the visual progression; music + actual MP4 land in Step 8.5.
//
// The asset is saved as VID-animatic with content = markdown body + a fenced
// `slideshow_v1` JSON block. AssetPreview renders the markdown as usual.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../supabase/types.gen';
import type { AgentInputs } from '../types';
import {
  buildShotListFromApprovedEREF,
  buildShotListFromAnchorChain,
  newAnimaticContract,
  type AnimaticContract,
  type AnimaticShot,
} from '../../api/animatic-shotlist';

export const ANIMATIC_CONTRACT = 'animatic_slideshow@v1';

export class AnimaticSlideshowError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'AnimaticSlideshowError';
  }
}

interface UpstreamAssetLike {
  id?: string;
  file_type?: string | null;
  status?: string | null;
  content?: string | null;
  filename?: string | null;
  staging_path?: string | null;
  drive_path?: string | null;
  drive_web_view_url?: string | null;
  version?: number | null;
}

interface StoryboardShot {
  shot_id: string;
  act: number;
  location: string;
  characters_present: string[];
  action: string;
  duration_seconds: number;
  key_beat?: string;
}

interface Frame {
  index: number;
  shot_id: string | null;
  ref_filename: string;
  ref_url: string;
  duration_seconds: number;
  caption: string;
}

export interface AnimaticSlideshowResult {
  markdown: string;
  body: Record<string, unknown>;
  costUsd: 0;
  description: string;
  contract: typeof ANIMATIC_CONTRACT;
  totalDurationS: number;
  frameCount: number;
  /**
   * The browser-native player payload (animatic@v1). When present, the
   * EpisodeAssetDrawer renders an interactive AnimaticPlayer instead of the
   * markdown body, and Director can play / pause / edit per-shot duration
   * without re-rendering. May be null on legacy episodes whose storyboard or
   * EREF assets do not carry shot_id metadata — in that case the markdown
   * body is the only viewer.
   */
  animaticV1: AnimaticContract | null;
}

function findApprovedAsset(
  upstream: readonly UpstreamAssetLike[] | undefined,
  fileType: string,
): UpstreamAssetLike | null {
  if (!upstream) return null;
  const approved = upstream.filter(
    (a) => a.file_type === fileType && a.status === 'APPROVED',
  );
  approved.sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
  return approved[0] ?? null;
}

function listApprovedRefs(
  upstream: readonly UpstreamAssetLike[] | undefined,
): UpstreamAssetLike[] {
  if (!upstream) return [];
  return upstream.filter(
    (a) =>
      typeof a.file_type === 'string' &&
      a.file_type.startsWith('IMG-episode_ref') &&
      a.status === 'APPROVED',
  );
}

function extractScenes(content: string): StoryboardShot[] {
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
  const shots: StoryboardShot[] = [];
  for (const act of acts) {
    const a = act as { act?: number; shots?: unknown[] };
    if (!Array.isArray(a.shots)) continue;
    for (const s of a.shots) {
      const sh = s as Partial<StoryboardShot> & { shot_id?: string };
      if (!sh.shot_id) continue;
      shots.push({
        shot_id: String(sh.shot_id),
        act: Number(a.act ?? 0),
        location: String(sh.location ?? 'unknown'),
        characters_present: Array.isArray(sh.characters_present)
          ? sh.characters_present.map(String)
          : [],
        action: String(sh.action ?? ''),
        duration_seconds: Number(sh.duration_seconds ?? 3),
        key_beat: sh.key_beat ? String(sh.key_beat) : undefined,
      });
    }
  }
  return shots;
}

function refUrl(asset: UpstreamAssetLike): string {
  return (
    asset.staging_path ||
    asset.drive_web_view_url ||
    asset.drive_path ||
    ''
  );
}

function buildFrames(
  shots: StoryboardShot[],
  refs: UpstreamAssetLike[],
): Frame[] {
  // For each shot, pick the best matching ref by:
  //  1. ref filename containing the shot's act/location/character keywords
  //  2. fallback to round-robin order
  const frames: Frame[] = [];

  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i]!;
    const locKey = shot.location.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const charKeys = shot.characters_present.map((c) =>
      c.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
    );

    let chosen: UpstreamAssetLike | undefined = refs.find((r) => {
      const fn = (r.filename ?? '').toLowerCase();
      return fn.includes(`a${shot.act}`) && (fn.includes(locKey) || charKeys.some((c) => fn.includes(c)));
    });
    if (!chosen) {
      // Fallback: pick by act match
      chosen = refs.find((r) => (r.filename ?? '').toLowerCase().includes(`a${shot.act}`));
    }
    if (!chosen) {
      // Fallback: round-robin
      chosen = refs[i % refs.length];
    }
    if (!chosen) continue;

    frames.push({
      index: i,
      shot_id: shot.shot_id,
      ref_filename: chosen.filename ?? 'unknown',
      ref_url: refUrl(chosen),
      duration_seconds: shot.duration_seconds || 3,
      caption: shot.action.slice(0, 200),
    });
  }
  return frames;
}

function buildMarkdown(args: {
  episodeCode: string;
  episodeTitle: string;
  frames: Frame[];
  totalDurationS: number;
}): string {
  const { episodeCode, episodeTitle, frames, totalDurationS } = args;
  const lines: string[] = [];
  lines.push(`# Animatic — ${episodeCode} "${episodeTitle}"`);
  lines.push('');
  lines.push(
    `Slideshow assembly of ${frames.length} approved Episode references in shot order. ` +
    `Total runtime: ${totalDurationS}s. Music + SFX land in Step 8.5; this view validates ` +
    `visual pacing and Bible canon adherence.`,
  );
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const f of frames) {
    lines.push(`## Frame ${f.index + 1} — ${f.shot_id ?? '?'} · ${f.duration_seconds}s`);
    lines.push('');
    lines.push(`![${f.shot_id ?? 'frame'}](${f.ref_url})`);
    lines.push('');
    lines.push(`> ${f.caption}`);
    lines.push('');
    lines.push(`_ref: \`${f.ref_filename}\`_`);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  lines.push('## Spec');
  lines.push('');
  lines.push('```json');
  lines.push(
    JSON.stringify(
      {
        kind: 'slideshow_v1',
        episode_id: episodeCode,
        total_duration_s: totalDurationS,
        frame_count: frames.length,
        audio: null, // populated in Step 8.5
        frames: frames.map((f) => ({
          shot_id: f.shot_id,
          ref_url: f.ref_url,
          ref_filename: f.ref_filename,
          duration_seconds: f.duration_seconds,
          caption: f.caption,
        })),
      },
      null,
      2,
    ),
  );
  lines.push('```');

  return lines.join('\n');
}

/**
 * Bake an APPROVED AUD-music URL into an animatic@v1 contract when one exists.
 * Shared by the EREF and anchor-chain runners. Graceful: on any failure the
 * original contract is returned unchanged (animatic still works silently).
 */
async function bakeApprovedMusic(
  supabase: SupabaseClient<Database>,
  episodeId: string,
  contract: AnimaticContract,
): Promise<AnimaticContract> {
  try {
    const { data: musicRow } = await supabase
      .from('assets')
      .select('drive_path,staging_path,filename')
      .eq('episode_id', episodeId)
      .eq('file_type', 'AUD-music')
      .eq('status', 'APPROVED')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const m = musicRow as
      | { drive_path?: string | null; staging_path?: string | null; filename?: string }
      | null;
    const musicUrl = m?.drive_path ?? m?.staging_path ?? null;
    if (!musicUrl) return contract;
    return {
      ...contract,
      music_url: musicUrl,
      music_filename: m?.filename ?? null,
      audio_tracks: [
        {
          layer: 'music',
          url: musicUrl,
          filename: m?.filename ?? 'music.mp3',
          volume: 1.0,
          muted: false,
        },
      ],
    };
  } catch {
    return contract;
  }
}

/**
 * Assemble the full AnimaticSlideshowResult from a resolved shot list. The
 * markdown body + frame[] view derive from the v1 shot_list so both the
 * EREF and anchor-chain runners produce a structurally identical asset.
 */
function buildResultFromShotList(args: {
  episodeCode: string;
  episodeTitle: string;
  shotList: AnimaticShot[];
  animaticV1: AnimaticContract;
}): AnimaticSlideshowResult {
  const { episodeCode, episodeTitle, shotList, animaticV1 } = args;
  const frames: Frame[] = shotList.map((s, i) => ({
    index: i,
    shot_id: s.shot_id,
    ref_filename: s.asset_id,
    ref_url: s.image_url,
    duration_seconds: s.duration_seconds,
    caption: s.caption ?? '',
  }));
  const totalDurationS = frames.reduce((sum, f) => sum + f.duration_seconds, 0);

  const markdown = buildMarkdown({
    episodeCode,
    episodeTitle,
    frames,
    totalDurationS,
  });

  const body = {
    kind: 'slideshow_v1' as const,
    episode_id: episodeCode,
    total_duration_s: totalDurationS,
    frame_count: frames.length,
    frames: frames.map((f) => ({
      shot_id: f.shot_id,
      ref_url: f.ref_url,
      ref_filename: f.ref_filename,
      duration_seconds: f.duration_seconds,
      caption: f.caption,
    })),
  };

  const description =
    `Produced by EXEC-EDIT · ${ANIMATIC_CONTRACT} · slideshow · ` +
    `${frames.length} frames / ${totalDurationS}s · cost $0 (no music yet)`;

  return {
    markdown,
    body,
    costUsd: 0,
    description,
    contract: ANIMATIC_CONTRACT,
    totalDurationS,
    frameCount: frames.length,
    animaticV1,
  };
}

export interface AnimaticSlideshowRunArgs {
  inputs: AgentInputs;
  supabase: SupabaseClient<Database>;
  episodeCode?: string;
}

export async function runAnimaticSlideshow(
  args: AnimaticSlideshowRunArgs,
): Promise<AnimaticSlideshowResult> {
  const { inputs, supabase: _supabase, episodeCode } = args;

  const ep = inputs.episode as
    | { episode_code?: string; title_working?: string | null }
    | undefined;
  const epCode = episodeCode ?? ep?.episode_code ?? 'SS-unknown';
  const epTitle = ep?.title_working ?? 'Untitled';

  const upstream = inputs.upstream_assets as readonly UpstreamAssetLike[] | undefined;

  const sbAsset = findApprovedAsset(upstream, 'STB-storyboard');
  if (!sbAsset?.content) {
    throw new AnimaticSlideshowError('No APPROVED storyboard with content');
  }

  const refs = listApprovedRefs(upstream);
  if (refs.length === 0) {
    throw new AnimaticSlideshowError(
      'No APPROVED IMG-episode_ref assets — approve refs in the Episode references stage first',
    );
  }

  const shots = extractScenes(sbAsset.content);
  if (shots.length === 0) {
    throw new AnimaticSlideshowError('Storyboard has no parseable shots[]');
  }

  const frames = buildFrames(shots, refs);
  if (frames.length === 0) {
    throw new AnimaticSlideshowError('Could not align shots to references');
  }

  const totalDurationS = frames.reduce((sum, f) => sum + f.duration_seconds, 0);

  const markdown = buildMarkdown({
    episodeCode: epCode,
    episodeTitle: epTitle,
    frames,
    totalDurationS,
  });

  const body = {
    kind: 'slideshow_v1' as const,
    episode_id: epCode,
    total_duration_s: totalDurationS,
    frame_count: frames.length,
    frames: frames.map((f) => ({
      shot_id: f.shot_id,
      ref_url: f.ref_url,
      ref_filename: f.ref_filename,
      duration_seconds: f.duration_seconds,
      caption: f.caption,
    })),
  };

  const description =
    `Produced by EXEC-EDIT · ${ANIMATIC_CONTRACT} · slideshow · ` +
    `${frames.length} frames / ${totalDurationS}s · cost $0 (no music yet)`;

  // ── animatic@v1 payload — for browser-native AnimaticPlayer in drawer.
  // Built via the canonical helper so v2 EREF shot_id matching is used and
  // the result is structurally identical to what /upload-music and the
  // /animatic-timing PATCH expect later. Falls back to null if anything
  // about the episode's assets cannot be resolved deterministically — the
  // legacy markdown view is still produced and shown.
  let animaticV1: AnimaticContract | null = null;
  const episodeId =
    (inputs.episode as { id?: string } | undefined)?.id ??
    (inputs as { episode_id?: string }).episode_id;
  // eslint-disable-next-line no-console
  console.log('[animatic] v1 build attempt — episodeId:', episodeId, 'frames:', frames.length);
  if (episodeId) {
    try {
      const shotList = await buildShotListFromApprovedEREF(
        _supabase,
        episodeId,
        sbAsset.content,
      );
      animaticV1 = newAnimaticContract(shotList);

      // Phase A.2 PR γ (LT-04, 2026-05-08): if an APPROVED AUD-music asset
      // exists at this point (Music block now generates BEFORE Animatic),
      // bake the URL into the animatic v1 contract so the player has music
      // for pacing review without a manual /upload-music round trip.
      try {
        const { data: musicRow } = await _supabase
          .from('assets')
          .select('drive_path,staging_path,filename')
          .eq('episode_id', episodeId)
          .eq('file_type', 'AUD-music')
          .eq('status', 'APPROVED')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const m = musicRow as
          | { drive_path?: string | null; staging_path?: string | null; filename?: string }
          | null;
        const musicUrl = m?.drive_path ?? m?.staging_path ?? null;
        if (musicUrl) {
          animaticV1 = {
            ...animaticV1,
            music_url: musicUrl,
            music_filename: m?.filename ?? null,
            audio_tracks: [
              {
                layer: 'music',
                url: musicUrl,
                filename: m?.filename ?? 'music.mp3',
                volume: 1.0,
                muted: false,
              },
            ],
          };
          // eslint-disable-next-line no-console
          console.log('[animatic] v1 baked APPROVED music URL:', musicUrl);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[animatic] music-bake step failed (animatic still works):', err);
      }

      // eslint-disable-next-line no-console
      console.log('[animatic] v1 BUILT OK — shot_list length:', shotList.length, 'total:', animaticV1.total_duration);
    } catch (err) {
      // Logged but non-fatal: legacy markdown view continues to work.
      // eslint-disable-next-line no-console
      console.error('[animatic] v1 builder failed (legacy view will show):', err);
    }
  } else {
    // eslint-disable-next-line no-console
    console.error('[animatic] v1 builder SKIPPED — no episodeId in inputs.episode.id or inputs.episode_id');
  }

  return {
    markdown,
    body,
    costUsd: 0,
    description,
    contract: ANIMATIC_CONTRACT,
    totalDurationS,
    frameCount: frames.length,
    animaticV1,
  };
}

/**
 * Anchor-chain animatic (TD-49 Phase 2 — anchor_chain_enabled).
 *
 * Restores the pacing gate the anchor chain currently skips: after all
 * IMG-anchor_* pairs are approved, this produces the SAME animatic@v1 asset
 * as `runAnimaticSlideshow`, but the frame images come from the per-shot
 * START anchors (via `buildShotListFromAnchorChain`) instead of EREF refs.
 *
 * Mirrors `runAnimaticSlideshow`'s input resolution (APPROVED STB-storyboard
 * from upstream), result shape, and optional/graceful music bake. The v1
 * shot_list IS the source of truth — the markdown body is derived from it so
 * the asset is structurally identical to the EREF animatic.
 */
export async function runAnchorAnimaticSlideshow(
  args: AnimaticSlideshowRunArgs,
): Promise<AnimaticSlideshowResult> {
  const { inputs, supabase, episodeCode } = args;

  const ep = inputs.episode as
    | { episode_code?: string; title_working?: string | null }
    | undefined;
  const epCode = episodeCode ?? ep?.episode_code ?? 'SS-unknown';
  const epTitle = ep?.title_working ?? 'Untitled';

  const upstream = inputs.upstream_assets as readonly UpstreamAssetLike[] | undefined;

  const sbAsset = findApprovedAsset(upstream, 'STB-storyboard');
  if (!sbAsset?.content) {
    throw new AnimaticSlideshowError('No APPROVED storyboard with content');
  }

  const episodeId =
    (inputs.episode as { id?: string } | undefined)?.id ??
    (inputs as { episode_id?: string }).episode_id;
  if (!episodeId) {
    throw new AnimaticSlideshowError(
      'No episodeId in inputs.episode.id or inputs.episode_id',
    );
  }

  let shotList: AnimaticShot[];
  try {
    shotList = await buildShotListFromAnchorChain(supabase, episodeId, sbAsset.content);
  } catch (err) {
    throw new AnimaticSlideshowError(
      `anchor-chain shot list build failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
      err,
    );
  }

  let animaticV1 = newAnimaticContract(shotList);
  animaticV1 = await bakeApprovedMusic(supabase, episodeId, animaticV1);

  return buildResultFromShotList({
    episodeCode: epCode,
    episodeTitle: epTitle,
    shotList,
    animaticV1,
  });
}
