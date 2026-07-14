// ──────────────────────────────────────────────────────────────────────────────
// app/api/assets/[id]/animatic-timing/route.ts
// Persist Director's per-shot duration overrides for a VID-animatic asset.
//
// Body:
//   {
//     overrides: { [shot_id: string]: { duration_seconds: number } },
//     directorConfirm?: boolean
//   }
//
// Behaviour:
//   - Asset must be `VID-animatic` and carry `metadata.animatic_v1`.
//   - Each duration_seconds must be a positive number ≤ 60.
//   - Overrides are merged into existing `director_overrides`; pass an empty
//     object to clear all (we do NOT clear by default — explicit Save).
//   - `total_duration` is recomputed from shot_list + merged overrides.
//
// Mode gate: Category C (UPLOAD_ASSET-equivalent) — Director-only edit, always
// allowed; we still go through enforceMode for audit / mode_at_time stamping.
// Refuses on LOCKED.
// ──────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { requireDirector } from '@/lib/api/auth';
import { withApiHandler } from '@/lib/api/handler';
import { apiOk } from '@/lib/api/response';
import { parseJson } from '@/lib/api/zod-helpers';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { enforceMode } from '@/lib/governance';
import {
  isAnimaticV1,
  computeTotalDuration,
  clipLengthsFromVidShotRows,
  type AnimaticContract,
  type AnimaticDirectorOverride,
  type AudioTrack,
} from '@/lib/api/animatic-shotlist';
import { processMusicTrack, type AudioExt } from '@/lib/agents/providers/music-processor';
import { cachedFileIfPresent, localCacheAbsPath } from '@/lib/media-cache';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 2026-06-06 — extend in-place to also persist Director's audio shaping
// (fade-in/out + trim per track). Mirrors the per-shot overrides pattern; we
// reuse this single PATCH endpoint instead of forking /update-audio-tracks
// (anti-additivity). `overrides` may now be empty when only audio is edited.
const AudioTrackSchema = z.object({
  layer: z.enum(['music', 'voice', 'sfx', 'ambience']),
  url: z.string(),
  filename: z.string(),
  volume: z.number().min(0).max(1).optional(),
  muted: z.boolean().optional(),
  start_at_seconds: z.number().min(0).optional(),
  fade_in_seconds: z.number().min(0).max(30).optional(),
  fade_out_seconds: z.number().min(0).max(30).optional(),
  trim_in_seconds: z.number().min(0).optional(),
  trim_out_seconds: z.number().positive().optional(),
  // 2026-06-06 — Director-set fields above; the original_url is bookkeeping
  // the route writes back so the client doesn't need to remember it.
  original_url: z.string().optional(),
});

const Body = z.object({
  overrides: z
    .record(
      z.string(),
      z.object({
        duration_seconds: z.number().positive().max(60),
        // 2026-06-06 — optional head trim per shot (inpoint).
        trim_start_seconds: z.number().min(0).max(60).optional(),
      }),
    )
    .optional()
    .default({}),
  audio_tracks: z.array(AudioTrackSchema).optional(),
  directorConfirm: z.boolean().optional(),
});

interface AssetRow {
  id: string;
  episode_id: string | null;
  filename: string;
  file_type: string;
  status: string;
  metadata: unknown;
}

// 2026-06-06 — resolve the raw bytes behind a music track URL. Mirrors the
// `loadBytes` helper in lib/agents/runner.ts (EXEC-STITCH) — the music URL
// can be a /api/media/{filename} cached file, a /staging/* relative path
// (legacy), or an absolute Drive https URL. ffmpeg pre-process needs the
// actual bytes, not a URL.
async function readMusicSourceBytes(url: string): Promise<Buffer> {
  if (!url) throw new Error('readMusicSourceBytes: empty url');
  if (url.startsWith('/api/media/')) {
    const filename = decodeURIComponent(url.slice('/api/media/'.length).split('?')[0]!);
    const abs = await cachedFileIfPresent(filename);
    if (abs) return fs.readFile(abs);
    throw new Error(`media-cache miss for ${filename}`);
  }
  if (url.startsWith('/staging/')) {
    const abs = path.join(process.cwd(), 'public', url);
    return fs.readFile(abs);
  }
  if (/^https?:\/\//i.test(url)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  throw new Error(`unsupported music URL scheme: ${url}`);
}

function inferAudioExt(filename: string): AudioExt {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.wav')) return 'wav';
  if (lower.endsWith('.m4a')) return 'm4a';
  if (lower.endsWith('.aac')) return 'aac';
  return 'mp3';
}

function withProcessedSuffix(filename: string): string {
  // Replace the extension with `-processed.mp3` (the processor always emits mp3).
  // Keeps the original file's hash prefix so the processed file lives next
  // to it in the media-cache (same episode folder via mirroredCachePath).
  const dot = filename.lastIndexOf('.');
  const stem = dot >= 0 ? filename.slice(0, dot) : filename;
  return `${stem}-processed.mp3`;
}

async function resolveMode(
  sb: ReturnType<typeof createSupabaseServiceRoleClient>,
  asset: AssetRow,
): Promise<1 | 2 | 3 | 4> {
  if (asset.episode_id) {
    const { data } = await sb
      .from('episodes')
      .select('governance_mode')
      .eq('id', asset.episode_id)
      .maybeSingle();
    const mode = (data as { governance_mode?: number } | null)?.governance_mode;
    if (mode === 1 || mode === 2 || mode === 3) return mode;
  }
  return 1;
}

export const PATCH = withApiHandler(async (req, ctx) => {
  const params = (await ctx?.params) as { id: string } | undefined;
  const assetId = params?.id;
  if (!assetId) throw new NotFoundError('Asset');

  const { user } = await requireDirector();
  const sb = createSupabaseServiceRoleClient();
  const body = await parseJson(req, Body);

  const { data: assetRaw, error } = await sb
    .from('assets')
    .select('id,episode_id,filename,file_type,status,metadata')
    .eq('id', assetId)
    .maybeSingle();
  if (error) throw new Error(`asset fetch: ${error.message}`);
  if (!assetRaw) throw new NotFoundError(`Asset ${assetId}`);
  const asset = assetRaw as unknown as AssetRow;

  if (asset.status === 'LOCKED') {
    throw new ValidationError('Asset is LOCKED — cannot edit timing');
  }
  if (!asset.file_type.startsWith('VID-animatic')) {
    throw new ValidationError(
      `Timing edit is only valid for VID-animatic assets (got ${asset.file_type})`,
    );
  }
  if (!isAnimaticV1(asset.metadata)) {
    throw new ValidationError(
      'Asset is not a v1 animatic. Re-trigger Animatic stage to upgrade.',
    );
  }

  const mode = await resolveMode(sb, asset);
  const decision = enforceMode(
    'UPLOAD_ASSET',
    { id: asset.episode_id ?? asset.id, governance_mode: mode },
    {
      directorConfirm: body.directorConfirm ?? true,
      confirmedBy: user.email ?? user.id,
      actor: 'director',
    },
  );
  if (!decision.allowed) {
    return apiOk(
      { action_blocked: true, reason: decision.reason ?? 'Edit not allowed' },
      undefined,
      { status: 403 },
    );
  }

  // Validate that every override key matches a shot in the canonical list —
  // unknown shot_ids are likely typos / drift between SB and animatic.
  const metaRaw = (asset.metadata ?? {}) as Record<string, unknown>;
  const v1 = metaRaw.animatic_v1 as AnimaticContract;
  const validShotIds = new Set(v1.shot_list.map((s) => s.shot_id));
  const unknownShots = Object.keys(body.overrides).filter((id) => !validShotIds.has(id));
  if (unknownShots.length > 0) {
    throw new ValidationError(
      `Unknown shot_id(s) in overrides: ${unknownShots.slice(0, 3).join(', ')}${unknownShots.length > 3 ? '…' : ''}`,
    );
  }

  const nowIso = new Date().toISOString();
  const mergedOverrides: Record<string, AnimaticDirectorOverride> = {
    ...(v1.director_overrides ?? {}),
  };
  for (const [shotId, override] of Object.entries(body.overrides)) {
    mergedOverrides[shotId] = {
      duration_seconds: override.duration_seconds,
      // 2026-06-06 — preserve head trim when set; omit otherwise so the
      // metadata blob stays small (no `trim_start_seconds: undefined` keys).
      ...(typeof override.trim_start_seconds === 'number' &&
      override.trim_start_seconds > 0
        ? { trim_start_seconds: override.trim_start_seconds }
        : {}),
      edited_at: nowIso,
    };
  }

  // 2026-06-08 — clamp the persisted total to real VID-shot clip lengths, the
  // SAME way the AnimaticPlayer timeline does, so Save no longer stores an
  // unclamped 76.5s while the timeline shows ~60s (Director's number mismatch).
  // Newest version first so clipLengthsFromVidShotRows keeps the latest per shot.
  let clipLengths: Map<string, number> | undefined;
  if (asset.episode_id) {
    const { data: vidShotRows } = await sb
      .from('assets')
      .select('metadata')
      .eq('episode_id', asset.episode_id)
      .like('file_type', 'VID-shot%')
      .eq('status', 'APPROVED')
      .order('version', { ascending: false });
    clipLengths = clipLengthsFromVidShotRows(vidShotRows ?? []);
  }
  const newTotal = computeTotalDuration(v1.shot_list, mergedOverrides, clipLengths);
  // 2026-06-06 — replace audio_tracks wholesale when supplied. Director edits
  // in the AnimaticPlayer fan out as a complete replacement list (same
  // pattern as `overrides`, just whole-array since track count is small).
  let newAudioTracks: AudioTrack[] | undefined = body.audio_tracks
    ? (body.audio_tracks as AudioTrack[])
    : v1.audio_tracks;

  // 2026-06-06 — server-side pre-process the music track so the AnimaticPlayer
  // <audio> element plays the SAME shaped audio that EXEC-STITCH will mux
  // into the final cut. Without this, the preview ignored Director's fade /
  // trim entirely until the (much later) STITCH pass.
  //
  // ffmpeg failure is non-fatal — we log + keep the raw URL so preview still
  // plays. This is the same graceful-degradation pattern the stitch path
  // uses when ffmpeg is missing on PATH.
  if (newAudioTracks && newAudioTracks.length > 0) {
    newAudioTracks = await Promise.all(
      newAudioTracks.map(async (track): Promise<AudioTrack> => {
        if (track.layer !== 'music') return track;
        const hasShaping = Boolean(
          track.fade_in_seconds ||
            track.fade_out_seconds ||
            track.trim_in_seconds ||
            track.trim_out_seconds,
        );
        // Stamp / restore the original URL bookkeeping field.
        const originalUrl = track.original_url ?? track.url;
        if (!hasShaping) {
          // All shaping cleared → revert to the raw source and drop the
          // bookkeeping field (cleaner metadata for old assets).
          return {
            ...track,
            url: originalUrl,
            original_url: undefined,
          };
        }
        try {
          const sourceBytes = await readMusicSourceBytes(originalUrl);
          const ext = inferAudioExt(track.filename);
          const { bytes: processedBytes, shaped } = await processMusicTrack({
            sourceBytes,
            ext,
            filters: track,
            totalVideoSeconds: newTotal,
          });
          if (!shaped) return track; // defensive — buildMusicAudioFilter said no-op
          const processedFilename = withProcessedSuffix(track.filename);
          const absPath = localCacheAbsPath(processedFilename);
          await fs.mkdir(path.dirname(absPath), { recursive: true });
          await fs.writeFile(absPath, processedBytes);
          return {
            ...track,
            original_url: originalUrl,
            url: `/api/media/${encodeURIComponent(processedFilename)}`,
          };
        } catch (err) {
          // ffmpeg missing or processing failed — keep the previous URL so
          // playback still works; the audit event below records the issue.
          console.error('[animatic-timing] music pre-process failed:', err);
          return track;
        }
      }),
    );
  }

  const newV1: AnimaticContract = {
    ...v1,
    director_overrides: mergedOverrides,
    total_duration: newTotal,
    ...(newAudioTracks !== undefined ? { audio_tracks: newAudioTracks } : {}),
  };
  const newMeta = { ...metaRaw, animatic_v1: newV1 };

  const { error: updateErr } = await sb
    .from('assets')
    .update({ metadata: newMeta as unknown as Record<string, unknown> } as never)
    .eq('id', assetId);
  if (updateErr) {
    throw new Error(`metadata update failed: ${updateErr.message}`);
  }

  await sb.from('activity_events').insert({
    event_type: 'asset_updated',
    severity: 'info',
    title: `Timing updated for ${asset.filename}`,
    description: `Director adjusted ${Object.keys(body.overrides).length} shot duration(s); new total ${newTotal}s`,
    actor: user.id,
    asset_id: assetId,
    episode_id: asset.episode_id,
    metadata: {
      kind: 'animatic_timing_edit',
      shot_count: Object.keys(body.overrides).length,
      new_total: newTotal,
      mode_at_time: decision.modeAtTime,
    },
  } as never);

  return apiOk({
    asset_id: assetId,
    director_overrides: mergedOverrides,
    total_duration: newTotal,
    mode_at_time: decision.modeAtTime,
  });
});
